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
│   └── trade-chat.tsx
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

- **`lib/supabase/server.ts`** — a Supabase client bound to the request's cookies, used by every Server Component and Server Action so RLS sees the real requesting user.
- **`lib/trade-machine.ts`** — pure functions (`canAccept`, `canConfirmComplete`, etc.) with no I/O, so the trade state machine can be unit-tested without a database. The DB and the Server Actions both follow the same rules this module encodes.
- **`components/image-uploader.tsx`** — picks up to 4 images, validates type/size client-side, uploads directly to Supabase Storage, then passes the resulting URLs to the form. The server re-validates before saving — the client is never trusted alone.
- **`components/trade-chat.tsx`** — shows the trade's messages, polls every ~5s while the trade is live, and disables the input once the trade reaches a terminal state.
- **`components/offer-builder.tsx`** — multi-select of the current user's available items to offer in a new trade.

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

**`items.city` is denormalized** — copied from the owner's profile at creation time so the feed query never has to join `profiles`. If a user changes their city later, existing listings keep the old one until re-edited (see `docs/scale.md`).

### 3.1 Trade State Machine

```
pending ──responder declines──────────────→ declined                (terminal)
pending ──initiator cancels───────────────→ cancelled               (terminal)
pending ──responder accepts───────────────→ accepted_by_responder
accepted_by_responder ──initiator confirms→ completed               (terminal)
accepted_by_responder ──either withdraws──→ cancelled               (terminal)
```

Guards (enforced in `lib/trade-machine.ts`, in each Server Action, and atomically in the database):

- Only the **responder** may accept or decline a `pending` trade.
- Only the **initiator** may cancel a `pending` trade, or confirm completion of an `accepted_by_responder` one.
- Either participant may withdraw (cancel) an `accepted_by_responder` trade.
- No transition is legal from a terminal state (`completed`, `declined`, `cancelled`).

**`accept_trade(trade_id)`** (`SECURITY DEFINER`, one transaction):
1. Verify the trade is `pending` and the caller is its responder.
2. Refuse if any item in this trade already belongs to a different, already-`accepted_by_responder` trade.
3. Set this trade to `accepted_by_responder`.
4. Cancel every other still-`pending` trade referencing the same items.

**`complete_trade(trade_id)`** (`SECURITY DEFINER`, one transaction):
1. Verify the trade is `accepted_by_responder` and the caller is its initiator.
2. Lock every item in this trade and refuse if any is no longer `available` (see below).
3. Mark those items `traded` and this trade `completed`.
4. Cancel every other still-open trade referencing the same items.

Doing each of these as a single database transaction is what keeps them safe — if the app crashed mid-way, nothing would be left half-updated (e.g. items traded but the trade not marked complete).

**Concurrent completion (migration `0010`).** Two people confirming completion on two different trades that share an item, at the exact same instant, could previously both succeed: `accept_trade`'s conflict check only locks the trade being accepted, not the item, so both trades could reach `accepted_by_responder` on the same item under real concurrency. Normally this self-heals once either trade completes (step 4 above cancels the other) — except `complete_trade` never re-checked its own items were still available first. A deadlock between two simultaneous completions could abort one side, and a simple retry after that error would then pass every guard and mark a second trade complete over an already-traded item. The fix: lock the items before checking them, so a concurrent completion over the same item blocks instead of racing, and a stale retry fails with a clear error instead of corrupting data.

### 3.2 Indexes

- `items (city, status, created_at desc)` — feed and search.
- `items (owner_id)` — my-items page.
- `trade_items (trade_id)`, `trade_items (item_id)` — join lookups both directions.
- `trades (initiator_id)`, `trades (responder_id)` — trades inbox.
- `messages (trade_id, created_at)` — thread fetch, chronological.

## 4. Routes / CRUD Summary

| Route | Reads | Writes (via Server Actions) |
| --- | --- | --- |
| `/` | available items in user's city (or newest across cities, logged out) | — |
| `/search` | items filtered by title, category, condition, city; paginated | — |
| `/items/[id]` | one item + owner info | — |
| `/items/new` | — | `createItem` |
| `/items/[id]/edit` | one item (own only) | `updateItem` |
| `/my-items` | own items, all statuses | `deleteItem` (soft if ever traded, else hard) |
| `/trades` | own trades (incoming + outgoing) | — |
| `/trades/[id]` | one trade + items + messages | `acceptTrade`, `declineTrade`, `cancelTrade`, `confirmCompleteTrade`, `sendMessage` |
| `/trades/new?item=[id]` | requested item + own available items | `createTrade` |
| `/profile` | own profile (read-only view) | — |
| `/profile/edit` | own profile | `updateProfile` |
| `/login`, `/signup` | — | `login`, `signup`, `logout` |

## 5. Server Action Catalog

Every Server Action follows the same sequence: **auth check → zod parse → authorization/state check → mutation → `revalidatePath`**.

| Action | Auth check | Validates | Authorization/state check | Mutation |
| --- | --- | --- | --- | --- |
| `signup` | — | email, password, username, city | username uniqueness | `auth.signUp`; `profiles` row via DB trigger |
| `login` / `logout` | — / session exists | credentials | — | `auth.signInWithPassword` / `signOut` |
| `createItem` | required | title/description/category/condition/images | — | insert `items` |
| `updateItem` | required | same as create | `owner_id = auth.uid()` | update `items` |
| `deleteItem` | required | — | `owner_id = auth.uid()`; soft vs hard by trade history | update or delete `items` |
| `createTrade` | required | 1..N offered + requested item ids | items owned/available as required | insert `trades` + `trade_items` |
| `acceptTrade` / `declineTrade` | required | — | caller is responder; trade is `pending` | update `trades.status` |
| `cancelTrade` | required | — | caller is initiator; trade `pending`/`accepted_by_responder` | update `trades.status` |
| `confirmCompleteTrade` | required | — | caller is initiator; trade `accepted_by_responder` | RPC `complete_trade` |
| `sendMessage` | required | body ≤1000 chars | caller is a participant; trade not terminal | insert `messages` |
| `updateProfile` | required | username/city/avatar_url | `id = auth.uid()` | update `profiles` |

**`updateProfile`** follows the same sequence as every other action, then redirects to `/profile` on success (same pattern as `createItem`/`updateItem`). A duplicate username is caught and shown as "That username is already taken." Avatars reuse the existing `item-images` Storage bucket — its policy only checks the uploader's folder, so no new bucket was needed.

**`/profile` vs `/profile/edit`** — `/profile` is a read-only view with an "Edit profile" button, matching the `/items/[id]` vs `/items/[id]/edit` pattern already used for items.

## 6. State Management

- **Server state** (items, trades, messages, profile) is never duplicated into client state — Server Components fetch it fresh, and mutations call `revalidatePath` on every affected route.
- **Client state** is small and local: form fields, the image uploader's selection, the chat's polling state. None of it needs to be shared, so no store is used.

## 7. Error Handling Strategy

- **Form-bound actions** (`signup`, `login`, `createItem`, `updateItem`, `createTrade`) use `useActionState` and return `{ error }`, rendered inline near the form.
- **Direct-call actions** (`acceptTrade`, `declineTrade`, `cancelTrade`, `confirmCompleteTrade`, `sendMessage`) throw on failure; the calling component catches it and shows the message inline — this avoids sending an expected rejection (like "item already committed elsewhere") to a generic crash screen.
- **Genuinely unexpected errors** (DB unreachable, an unforeseen bug) fall through to route-level `error.tsx` — a generic "something went wrong" screen with retry.
- **`loading.tsx`** is provided per route with real data fetching, so navigation always shows a skeleton instead of a blank screen.

## 8. Validation Strategy

- **zod schemas** in `lib/validation/` are the only validation actually trusted — used for both client-side pre-validation and server-side enforcement.
- **Database CHECK constraints** repeat the key invariants (lengths, enums, statuses) as a backstop against any application-level bug.
- **Images** are checked for type and size on both the client (fast feedback) and server (the real check).

## 9. UX Plan

- **Empty states** everywhere a list can legitimately be empty, each with a short explanation and a relevant call to action.
- **Status is always visible** — item and trade status badges, consistent across list and detail views.
- **Contextual actions** — the trade page only shows buttons legal for the current user's role and the trade's status.
- **Mobile-first responsive layout** via Tailwind — no separate mobile app.
- **Loading and error states** (§7) on every route.
