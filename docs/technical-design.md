# Technical Design — Swapp

## 1. Folder Structure

```
swapp/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                  # "/" — feed
│   │   ├── search/page.tsx           # "/search"
│   │   └── items/[id]/page.tsx       # "/items/[id]"
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (protected)/
│   │   ├── items/new/page.tsx
│   │   ├── items/[id]/edit/page.tsx
│   │   ├── my-items/page.tsx
│   │   ├── trades/page.tsx
│   │   ├── trades/[id]/page.tsx
│   │   ├── trades/new/page.tsx       # ?item=[id]
│   │   └── profile/page.tsx
│   ├── layout.tsx
│   ├── error.tsx
│   └── loading.tsx
├── actions/                          # Server Actions, grouped by entity
│   ├── auth.ts                       # signup, login, logout
│   ├── items.ts                      # createItem, updateItem, deleteItem
│   ├── trades.ts                     # createTrade, accept, decline, cancel, confirmComplete
│   └── messages.ts                   # sendMessage
├── lib/
│   ├── supabase/
│   │   ├── server.ts                 # server client (cookies)
│   │   ├── client.ts                 # browser client
│   │   └── proxy.ts                  # session refresh helper (used by root proxy.ts)
│   ├── validation/                   # zod schemas (item, trade, message, profile)
│   ├── trade-machine.ts              # pure state-transition guard functions (unit-tested)
│   └── constants.ts                  # CITIES, CATEGORIES, CONDITIONS
├── components/
│   ├── ui/                           # shadcn/ui primitives
│   ├── item-card.tsx, item-form.tsx, image-uploader.tsx
│   ├── trade-status-badge.tsx, offer-builder.tsx
│   └── message-thread.tsx
├── supabase/
│   └── migrations/                   # numbered SQL migration files
├── scripts/
│   └── seed.ts
├── tests/
│   ├── unit/                         # Vitest
│   └── e2e/                          # Playwright
├── proxy.ts                          # route protection (renamed from middleware.ts in Next.js 16)
├── docs/
└── .env.example
```

## 2. Key Components

- **`lib/supabase/server.ts`** — creates a Supabase client bound to the incoming request's cookies (via `@supabase/ssr`); used by every Server Component and Server Action so RLS sees the real requesting user.
- **`lib/trade-machine.ts`** — pure functions (`canAccept(status, role)`, `canConfirmComplete(status, role)`, etc.) with no I/O, extracted specifically so the trade state machine can be unit-tested without a database. The DB function `complete_trade` and the Server Actions both defer to the same rules this module encodes conceptually, so there is one place to reason about legal transitions.
- **`components/image-uploader.tsx`** — client component: picks up to 4 images, validates type/size in the browser (fast feedback), uploads directly to Supabase Storage from the client using a scoped policy, then passes the resulting public URLs to the form's Server Action. Server-side validation still re-checks type/size before the row is written (never trust the client).
- **`components/message-thread.tsx`** — client component: fetches messages on mount, polls every ~5s while the trade page is open (cleared on unmount), optimistically appends a sent message, and disables the input when the trade is in a terminal state.
- **`components/offer-builder.tsx`** — client component: multi-select of the current user's `available` items to attach as the "offered" side of a new trade.

## 3. Full Database Schema

All tables: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`.

```sql
profiles
  id          uuid PK REFERENCES auth.users(id)
  username    text unique not null
  city        text not null              -- CHECK city = ANY(fixed list)
  avatar_url  text

items
  id            uuid PK
  owner_id      uuid not null REFERENCES profiles(id)
  title         text not null CHECK (char_length(title) <= 80)
  description   text CHECK (char_length(description) <= 1000)
  category      text not null CHECK (category IN ('clothing','electronics','books','home','sports','other'))
  condition     text not null CHECK (condition IN ('new','like_new','used','worn'))
  city          text not null            -- denormalized from owner's profile at creation time
  status        text not null default 'available' CHECK (status IN ('available','traded','deleted'))
  image_urls    text[] not null default '{}'   -- 1..4 Supabase Storage public URLs

trades
  id            uuid PK
  initiator_id  uuid not null REFERENCES profiles(id)
  responder_id  uuid not null REFERENCES profiles(id)
  status        text not null default 'pending'
                CHECK (status IN ('pending','accepted_by_responder','completed','declined','cancelled'))
  updated_at    timestamptz not null default now()

trade_items
  id        uuid PK
  trade_id  uuid not null REFERENCES trades(id) ON DELETE CASCADE
  item_id   uuid not null REFERENCES items(id)
  side      text not null CHECK (side IN ('offered','requested'))

messages
  id        uuid PK
  trade_id  uuid not null REFERENCES trades(id) ON DELETE CASCADE
  sender_id uuid not null REFERENCES profiles(id)
  body      text not null CHECK (char_length(body) <= 1000)
```

**Denormalization note (`items.city`):** copied from the owner's profile city at creation instead of joined at query time, specifically so the feed query (`items WHERE city = $1 AND status = 'available' ORDER BY created_at DESC`) never has to join `profiles`. Trade-off: if a user changes their profile city, their existing listings keep the old city until re-edited — acceptable for a v1 where city changes are rare, and noted in `docs/scale.md`.

### 3.1 Trade State Machine

```
pending ──responder declines──────────────→ declined                (terminal)
pending ──initiator cancels───────────────→ cancelled               (terminal)
pending ──responder accepts───────────────→ accepted_by_responder
accepted_by_responder ──initiator confirms→ completed               (terminal)
accepted_by_responder ──either withdraws──→ cancelled               (terminal)
```

Guards (enforced in `lib/trade-machine.ts`, in each Server Action, and — for completion — atomically in the database):

- Only the **responder** may accept or decline a `pending` trade.
- Only the **initiator** may cancel a `pending` trade.
- Only the **initiator** may confirm completion of an `accepted_by_responder` trade.
- Either participant may withdraw (cancel) an `accepted_by_responder` trade.
- No transition is legal from any terminal state (`completed`, `declined`, `cancelled`).

**`accept_trade(trade_id uuid)`** — a `SECURITY DEFINER` Postgres function, called via RPC from the "accept" Server Action, wrapping in one transaction (added after Phase 4 shipped — see `docs/decisions.md`, "trade accept conflict resolution"; originally conflict resolution was deferred entirely to `complete_trade`, below, which left a live gap between one offer being accepted and it being completed where a competing offer for the same item still looked fully alive):

1. Verify the trade is `pending` and the caller is its responder.
2. Refuse (raise, no changes made) if any item in this trade already belongs to a *different* trade that's already `accepted_by_responder` — that trade's initiator has a real commitment; this accept can't silently override it.
3. Set this trade's `status='accepted_by_responder'`.
4. Find every _other_ trade still `pending` that references any of the same items (via `trade_items`), and set those to `cancelled` — the responder just chose this trade over them, so they're moot immediately, not just once this trade is later completed.

**`complete_trade(trade_id uuid)`** — a `SECURITY DEFINER` Postgres function, called via RPC from the "confirm complete" Server Action, wrapping in one transaction:

1. Verify the trade is `accepted_by_responder` and the caller is its initiator (defense in depth — the Server Action already checked this).
2. Set `status='traded'` on every item referenced by this trade's `trade_items`.
3. Set this trade's `status='completed'`.
4. Find every _other_ trade still in `pending` or `accepted_by_responder` that references any of those same items (via `trade_items`), and set those to `cancelled` — they're negotiating over items that no longer exist to trade. In practice, `accept_trade`'s own conflict resolution (above) means there's rarely anything left here by the time a trade completes; this step stays as the final backstop for any leftover pending trades on items involved in the accepted trade in ways `accept_trade` didn't already resolve (e.g. an item offered, not requested, in another pending trade).

Doing each of these as one DB function/transaction, rather than several separate Server Action calls, is what makes their respective last steps safe: if the app crashed partway through, the database would be left in an inconsistent state (an accepted trade with a still-live competing offer; traded items still visibly up for offer). A single transaction makes that impossible.

### 3.2 Indexes

- `items (city, status, created_at desc)` — feed and search's primary access path.
- `items (owner_id)` — my-items page.
- `trade_items (trade_id)`, `trade_items (item_id)` — join lookups both directions (trade → its items, item → trades referencing it, needed by `complete_trade`'s conflict search).
- `trades (initiator_id)`, `trades (responder_id)` — trades inbox.
- `messages (trade_id, created_at)` — thread fetch, chronological.

## 4. Routes / CRUD Summary

| Route                   | Reads                                                                             | Writes (via Server Actions)                                                         |
| ----------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/`                     | available items in user's city (public feed for logged-out: newest across cities) | —                                                                                   |
| `/search`               | items filtered by title `ilike`, category, condition, city; paginated             | —                                                                                   |
| `/items/[id]`           | one item + owner info                                                             | —                                                                                   |
| `/items/new`            | —                                                                                 | `createItem`                                                                        |
| `/items/[id]/edit`      | one item (own only)                                                               | `updateItem`                                                                        |
| `/my-items`             | own items, all statuses                                                           | `deleteItem` (soft if ever traded, else hard)                                       |
| `/trades`               | own trades (incoming + outgoing)                                                  | —                                                                                   |
| `/trades/[id]`          | one trade + items + messages                                                      | `acceptTrade`, `declineTrade`, `cancelTrade`, `confirmCompleteTrade`, `sendMessage` |
| `/trades/new?item=[id]` | requested item + own available items                                              | `createTrade`                                                                       |
| `/profile`              | own profile                                                                       | `updateProfile`                                                                     |
| `/login`, `/signup`     | —                                                                                 | `login`, `signup`, `logout`                                                         |

## 5. Server Action Catalog

Every Server Action follows the same fixed sequence — **auth check → zod parse → authorization/state check → mutation → `revalidatePath`** — no exceptions (this is also stated as a project-wide rule in the work plan, §7.3):

| Action                         | Auth check         | Validates                                         | Authorization/state check                                                  | Mutation                                            |
| ------------------------------ | ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| `signup`                       | —                  | email, password, username, city (zod)             | username uniqueness (DB constraint)                                        | `auth.signUp`; `profiles` row created by DB trigger |
| `login` / `logout`             | — / session exists | credentials                                       | —                                                                          | `auth.signInWithPassword` / `auth.signOut`          |
| `createItem`                   | session required   | title/description/category/condition/images (zod) | —                                                                          | insert `items`, RLS: `owner_id = auth.uid()`        |
| `updateItem`                   | session required   | same as create                                    | `owner_id = auth.uid()` (RLS + explicit check)                             | update `items`                                      |
| `deleteItem`                   | session required   | —                                                 | `owner_id = auth.uid()`; check trade history to decide soft vs hard delete | update or delete `items`                            |
| `createTrade`                  | session required   | 1..N offered + 1..N requested item ids (zod)      | offered items owned by caller & `available`; requested items `available`   | insert `trades` + `trade_items`                     |
| `acceptTrade` / `declineTrade` | session required   | —                                                 | caller is `responder_id`; trade is `pending` (trade-machine guard)         | update `trades.status`                              |
| `cancelTrade`                  | session required   | —                                                 | caller is `initiator_id`; trade in `pending`/`accepted_by_responder`       | update `trades.status`                              |
| `confirmCompleteTrade`         | session required   | —                                                 | caller is `initiator_id`; trade is `accepted_by_responder`                 | RPC `complete_trade`                                |
| `sendMessage`                  | session required   | body ≤1000 chars (zod)                            | caller is a trade participant; trade not terminal                          | insert `messages`                                   |
| `updateProfile`                | session required   | username/city (zod)                               | `id = auth.uid()`                                                          | update `profiles`                                   |

## 6. State Management

- **Server state** (items, trades, messages, profile) is never duplicated into client state. Server Components fetch it fresh on each navigation/request; after any mutation, the owning Server Action calls `revalidatePath` on every route that could show stale data (e.g. `acceptTrade` revalidates both `/trades` and `/trades/[id]`).
- **Client state** is local and small: form field values (uncontrolled where possible, `useState` where not), the image uploader's in-progress selection, and the message thread's polling interval/optimistic-append buffer. None of it needs to be shared across components, so no store is introduced.

## 7. Error Handling Strategy

- **Expected errors** (validation failure, "item no longer available," "not your trade") are returned from Server Actions as a typed `{ error: string }` result and rendered inline near the relevant form/button — not thrown as exceptions, so they don't trigger Next's error boundary for normal user mistakes.
- **Unexpected errors** (DB unreachable, RLS-denied request the UI shouldn't have allowed, etc.) are thrown, caught by route-level `error.tsx` boundaries, and shown as a generic "something went wrong, try again" screen with a retry action — never a raw stack trace to the user.
- **`loading.tsx`** is provided per route segment that does non-trivial data fetching, so navigation always shows a skeleton/spinner instead of a blank screen.
- Every Server Action's DB call is wrapped so a Postgres error (including an RLS denial) is caught and turned into a safe generic message rather than leaking schema details.

## 8. Validation Strategy

- **zod schemas** in `lib/validation/` are the single source of truth for shape (e.g. `itemSchema`, `tradeCreateSchema`, `messageSchema`, `profileSchema`). The same schema is used for optional client-side pre-validation (fast feedback in the form) and mandatory server-side validation inside the Server Action (the only check that's actually trusted).
- **Database CHECK constraints** duplicate the most important invariants (string length caps, enum-like values, status enums) as a last line of defense, so even a bug in application-level validation can't produce invalid rows.
- **Image validation:** client checks file type (jpeg/png/webp) and size (≤5MB) before upload for fast UX; the upload path (Storage policy + a server-side check before the item row references the URL) re-validates, since client-side checks are trivially bypassable.

## 9. UX Plan

- **Empty states** everywhere a list can legitimately be empty: no items in your city yet, no search results, no items posted yet, no trades yet — each with a short explanation and a relevant call to action (e.g. "Post your first item").
- **Status is always visible:** item cards show a status badge when not available; trades show a colored status badge (`trade-status-badge.tsx`) consistent across the inbox and detail views.
- **Contextual actions:** the trade detail page shows only the buttons legal for the current user's role and the trade's current status (e.g. the responder sees Accept/Decline only while `pending`; the initiator sees Confirm Complete only while `accepted_by_responder`) — the UI never offers an action the backend would reject, though the backend rejects it too if somehow invoked.
- **Mobile-first responsive layout** via Tailwind's breakpoints — no separate mobile app, per the locked product decisions.
- **Loading and error states** (see §7) on every route so the app never shows a blank screen during normal use.
