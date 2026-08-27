# Work Plan: "Swapp" — Peer-to-Peer Item Trading App

**Course:** Internet Technologies, RUNI CS 2026 — Final Project
**Deadline:** September 6, 2026 (hard)
**Developer:** Solo. Knows React; new to Next.js, TypeScript, Supabase.
**Availability:** Employed Sun–Wed 9:00–18:00 → work evenings Sun–Wed + full days Thu/Fri/Sat.
**Stack (mandated by course):** Next.js (App Router) + TypeScript + Supabase (DB, Auth, Storage) + Vercel.

> This document is written to be handed to a coding agent (Claude Code). Agent: follow the phases in order. At the end of every phase, produce the listed deliverable, commit with a descriptive message, and write a short plain-language explanation of what was built and why, appended to `docs/decisions.md`. The developer must be able to defend every choice in a 10–15 minute oral presentation.

---

## 1. Product Summary (locked scope — do not expand)

Swapp is a barter marketplace: users post items they no longer want (clothes, gadgets, books, anything), browse items posted by others in their city, and propose trades. A trade offer can contain **multiple items from each side**. An offer opens a message thread; when both sides accept, the trade is marked complete in-app and the users arrange the physical exchange themselves (like Facebook Marketplace — the app never handles payment or shipping).

**Business value (for the product spec doc):** reduces waste, unlocks value in unused belongings without money changing hands, and gives users a low-friction alternative to selling. Customer = the platform operator (future monetization: promoted listings, verified users); users = individuals with stuff to trade.

### Locked product decisions
| Decision | Choice | Rationale (defend in presentation) |
|---|---|---|
| Location | User selects a **city from a fixed list** at signup (editable in profile). Feed filters by city. | GPS + radius requires geospatial queries (PostGIS), permissions UX, and privacy handling — poor cost/benefit for v1. |
| Chat | **Refresh-based message thread** (refetch on open + poll every ~5s while thread is open). | Trades unfold over hours/days; realtime adds subscription lifecycle complexity that's hard to debug and explain. **Stretch goal only:** upgrade to Supabase Realtime in Phase 8 if ahead of schedule. |
| Offer contents | **Multiple items per side** (1..N offered ↔ 1..N requested). | Modeled with a join table; barely harder than 1:1 and much more realistic. |
| Money | None. No prices, no payments. Barter only. | Keeps scope, legal, and security surface small. |
| Moderation / reporting | Out of scope. Mention as "future work" in docs. | |
| Mobile app | No. Responsive web only. | |

---

## 2. Architecture Overview

- **Next.js App Router**, TypeScript strict mode.
- **Server Components** for data reads (feed, item pages, trade lists). **Server Actions** for all mutations (create item, make offer, send message, accept/decline). No custom Express server. Use API route handlers only if a server action is awkward (e.g., image upload signing).
- **Supabase**: Postgres + Auth (email/password; magic link optional) + Storage (item photos, public-read bucket).
- **Auth model:** Supabase Auth with `@supabase/ssr` cookie-based sessions. Middleware protects all routes except `/`, `/login`, `/signup`, and public item browsing (decide: browsing public, actions require login — recommended, better demo).
- **Authorization:** **Row Level Security (RLS) on every table** — this is the centerpiece of the security doc. Server-side checks are a second layer, not the only layer.
- **Validation:** `zod` schemas shared between client forms and server actions.
- **UI:** Tailwind CSS + shadcn/ui components. Keep it clean, don't gold-plate.
- **State:** Server state via Server Components + revalidation (`revalidatePath`). Minimal client state (form inputs, chat polling) via React hooks. No Redux/Zustand — say why in docs: server-centric data flow makes global client state unnecessary.

### Data flow (for the architecture doc)
Browser → Server Component (reads via Supabase server client, RLS enforced) → render. Mutations: form → Server Action → zod validation → auth check → Supabase write (RLS enforced) → `revalidatePath` → fresh UI.

---

## 3. Database Schema

All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`.

```
profiles
  id uuid PK (= auth.users.id, FK)
  username text unique not null
  city text not null            -- from fixed list, validated in app + CHECK constraint
  avatar_url text null

items
  id, owner_id uuid FK->profiles not null
  title text not null (<=80 chars)
  description text (<=1000)
  category text not null        -- enum-like: clothing, electronics, books, home, sports, other
  condition text not null       -- new, like_new, used, worn
  city text not null            -- denormalized from owner's profile at creation (defend: feed queries filter by items.city directly, no join)
  status text not null default 'available'  -- available | in_trade_locked? NO — keep: available | traded | deleted
  image_urls text[] not null    -- 1..4 images, Supabase Storage public URLs

trades
  id
  initiator_id uuid FK->profiles     -- who sent the offer
  responder_id uuid FK->profiles     -- owner of the requested item(s)
  status text not null default 'pending'
      -- pending | accepted_by_responder | completed | declined | cancelled
  updated_at timestamptz

trade_items                      -- join table: which items are in the trade, on which side
  id
  trade_id uuid FK->trades
  item_id uuid FK->items
  side text not null             -- 'offered' (initiator's items) | 'requested' (responder's items)

messages
  id
  trade_id uuid FK->trades
  sender_id uuid FK->profiles
  body text not null (<=1000)
```

### Trade state machine (critical — implement exactly, test exactly)
```
pending ──responder declines──────────────→ declined   (terminal)
pending ──initiator cancels───────────────→ cancelled  (terminal)
pending ──responder accepts───────────────→ accepted_by_responder
accepted_by_responder ──initiator confirms→ completed  (terminal)
accepted_by_responder ──either withdraws──→ cancelled  (terminal)
```
**On `completed`:** in one transaction (Postgres function `complete_trade(trade_id)` called via RPC):
1. Set all items in the trade to `status='traded'`.
2. Auto-cancel every other `pending`/`accepted_by_responder` trade that references any of those items, so nobody negotiates over gone items.
This transaction is a highlight for the presentation ("why a DB function? atomicity").

### Indexes (feeds the scale doc)
- `items (city, status, created_at desc)` — the feed query.
- `items (owner_id)`, `trade_items (trade_id)`, `trade_items (item_id)`, `trades (initiator_id)`, `trades (responder_id)`, `messages (trade_id, created_at)`.
- Search: `items.title` with `ilike '%q%'` is fine at course scale; note in scale doc that production would use Postgres full-text search (`tsvector`) — optionally actually implement FTS if time allows, it's ~1 hour and impressive.

### RLS policy sketch (write these carefully; they ARE the security doc)
- `profiles`: anyone authenticated can read; user can update only own row.
- `items`: read where `status='available'` OR `owner_id=auth.uid()` OR item belongs to a trade the user participates in; insert/update/delete only own.
- `trades`: read/update only if `auth.uid() IN (initiator_id, responder_id)`; status transitions enforced in server actions + DB function.
- `trade_items`: readable via parent trade participation; insert only by trade initiator at creation, with a check that `offered` items belong to initiator and `requested` items belong to responder and all are `available`.
- `messages`: read/insert only by trade participants; insert blocked when trade is terminal.

---

## 4. Pages & Routes

| Route | Purpose | Access |
|---|---|---|
| `/` | Landing + "For You" feed: random available items in the user's city (`order by random()` is OK at this scale — note the scale-doc caveat and the seeded-pagination alternative), excluding own items. Logged-out visitors see newest items across all cities + CTA to sign up. | Public |
| `/search` | Search bar (title `ilike`) + filters: category, condition, city. Paginated (20/page, offset pagination — fine here; mention cursor pagination in scale doc). | Public |
| `/items/[id]` | Item detail, photo gallery, owner card, "Offer a trade" button. | Public read, action requires login |
| `/items/new`, `/items/[id]/edit` | Create/edit item, image upload (client → Supabase Storage, max 4 images, ≤5MB each, jpeg/png/webp only — validate type + size client AND server side). | Auth |
| `/my-items` | User's items, statuses, edit/delete. Delete = soft delete (`status='deleted'`) if the item ever appeared in a trade, else hard delete. | Auth |
| `/trades` | Inbox: incoming and outgoing trades with status badges. | Auth |
| `/trades/[id]` | Trade detail: both item sets, state-machine action buttons (contextual to role + status), message thread with polling + optimistic append. | Auth (participants only) |
| `/trades/new?item=[id]` | Offer builder: shows the requested item(s), lets user pick 1..N of their own `available` items to offer. | Auth |
| `/profile` | Edit username, city, avatar. | Auth |
| `/login`, `/signup` | Supabase auth. Signup collects username + city. | Public |

---

## 5. Phase Plan & Calendar

Estimates assume Claude Code does the heavy lifting; the developer's job each phase is to **review, run, break, and understand** the code. Never start a new phase with the previous one unreviewed.

### Phase 0 — Docs first (Sat Aug 15 – Sun Aug 16, ~4h)
The course grades documents heavily. Write them BEFORE coding (agent drafts, developer edits):
- `docs/product-spec.md` — problem, users, customer, business goals, capabilities, core user flows (assignment §2).
- `docs/architecture.md` — components, DB entities, pages, server actions, data flow, roles/permissions, external libraries + why (assignment §3).
- `docs/technical-design.md` — folder structure, key components, full DB schema from §3 above, CRUD list, API/server-action catalog, business logic (trade state machine!), state management, error handling strategy, validation strategy, UX plan (assignment §4).
**Deliverable:** 3 docs committed. These evolve; keep them true as code changes.

### Phase 1 — Project skeleton + Auth (Mon Aug 17 – Tue Aug 18 evenings)
- `create-next-app` (TS, Tailwind, App Router), shadcn/ui, ESLint/Prettier, GitHub repo, deploy "hello world" to Vercel **on day one** (deployment problems must surface early, not on Sep 5).
- Supabase project; env vars local + Vercel; `.env.example` + README run instructions (assignment §10).
- Auth: signup (with username + city), login, logout, middleware, `profiles` row created via DB trigger on auth signup.
**Deliverable:** deployed app where you can sign up and log in.

### Phase 2 — Items CRUD + images (Wed Aug 19 evening + Thu Aug 20)
- Migrations for `items`, Storage bucket + policies, RLS.
- Create/edit/delete item with zod validation and image upload.
- `/my-items`, `/items/[id]`.
**Deliverable:** full item lifecycle works in production.

### Phase 3 — Feed + Search (Fri Aug 21 – Sat Aug 22)
- "For You" city feed, search page with filters + pagination, empty states.
- Seed script (`scripts/seed.ts`) creating ~5 fake users and ~40 items across cities — essential for demo and testing.
**Deliverable:** browsable marketplace with realistic data.

### Phase 4 — Trades core (Sun Aug 23 – Wed Aug 26 evenings)
The heart of the project. Do not rush review here.
- Migrations: `trades`, `trade_items`, RLS.
- Offer builder page; server actions for each state transition with strict guards (only responder can accept, only initiator can confirm completion, etc.).
- `complete_trade` Postgres function (atomic completion + auto-cancel of conflicting trades).
- Trades inbox + trade detail with contextual buttons.
**Deliverable:** two seeded users can complete a full trade end-to-end; conflicting offers auto-cancel.

### Phase 5 — Messaging (Thu Aug 27)
- `messages` table + RLS; thread UI in trade page; send via server action; poll every 5s while open; disable input on terminal trades.
**Deliverable:** two users can negotiate inside a trade.

### Phase 6 — Test spec + tests (Fri Aug 28 – Sat Aug 29)
- `docs/test-plan.md` (assignment §6): per core feature — happy path, invalid inputs, permission checks (user A cannot read/modify user B's trades — test via direct Supabase client with A's JWT), state-machine violations (accept a declined trade), edge cases (offer containing an already-traded item, empty offer, 0 images), DB integrity (completion transaction), basic UI checks.
- Implement (assignment §7):
  - **Vitest**: unit tests for zod schemas + state-transition guard functions (pure logic extracted into `lib/trade-machine.ts` precisely so it's unit-testable — mention this design choice).
  - **Playwright**: 3–5 E2E flows against a local/staging Supabase: signup→post item; search; full trade flow with two browser contexts; unauthorized access attempt.
  - `docs/manual-tests.md` for image upload and visual checks.
**Deliverable:** green test suite + test docs.

### Phase 7 — Security & Scale docs + hardening (Sun Aug 30 – Tue Sep 1 evenings)
- `docs/security.md` (assignment §9): Auth mechanism, RLS-based authorization with actual policy snippets, per-action login requirements, input validation (zod + DB constraints), server-action protection (auth check first line of every action), secrets handling (env vars, `service_role` key never in client, anon key is public by design — explain why that's safe *because of RLS*), remaining risks (no rate limiting, no email verification enforcement, no CSRF concerns thanks to server actions' built-in protections — verify and cite, no image content scanning).
- `docs/scale.md` (assignment §8): behavior at hundreds of users, heavy queries (feed, search, `order by random()`), the indexes and why, pagination, avoiding overfetch (select only needed columns), client/server separation, current limits, future work (FTS, cursor pagination, CDN for images — Supabase Storage already provides one, Realtime chat, read replicas).
- Hardening pass: run through the test plan's permission cases manually in prod.
**Deliverable:** both docs + fixes.

### Phase 8 — Buffer, polish, stretch (Wed Sep 2 – Thu Sep 3)
- Bug fixes, responsive/UI polish, loading and error states everywhere (`error.tsx`, `loading.tsx`).
- Stretch goals **only if everything above is done**: Supabase Realtime chat upgrade; full-text search; item "favorites".

### Phase 9 — Presentation + deep review (Fri Sep 4 – Sat Sep 5)
- Agent generates `docs/system-internals.md`: full technical walkthrough — architecture, key files, code behind each flow, DB, tests, every decision + rationale (the assignment explicitly recommends this).
- Developer does a **question-drill session**: have the agent quiz you interview-style ("why server actions over API routes?", "what stops user A reading user B's messages?", "walk me through trade completion"). Do this until answers are fluent.
- Build 10–15 min slide deck covering the assignment's §12 list exactly. Live demo of a full trade + one security demonstration (logged-out user blocked from an action).
- Final submission checklist (below).

**Submit Sep 6.**

---

## 6. Submission Checklist (assignment "מה צריך להגיש")
- [ ] Vercel URL (live, seeded with demo data)
- [ ] GitHub repo link (clean history, README)
- [ ] `docs/product-spec.md`
- [ ] `docs/technical-design.md` (+ `docs/architecture.md`)
- [ ] `docs/test-plan.md` (+ `docs/manual-tests.md`)
- [ ] Test code (Vitest + Playwright) in repo, instructions to run
- [ ] `docs/scale.md`
- [ ] `docs/security.md`
- [ ] README: local run instructions + env vars explanation (`.env.example`)
- [ ] Slide deck (10–15 min)

---

## 7. Working Agreement with the Coding Agent
1. One phase at a time; small commits; conventional commit messages.
2. After each feature: update the relevant doc + append to `docs/decisions.md` (decision, alternatives considered, why).
3. Every server action: auth check → zod parse → authorization/state check → mutation → revalidate. No exceptions.
4. Never put `SUPABASE_SERVICE_ROLE_KEY` in client code. All secrets via env vars.
5. All DB changes via SQL migration files in `supabase/migrations/` (reproducibility for the grader).
6. Prefer boring, explainable solutions over clever ones. The developer must defend every line in an interview-style presentation.
