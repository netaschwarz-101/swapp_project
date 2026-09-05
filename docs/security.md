# Security — Swapp

There's no money in Swapp, so the risk isn't payment fraud — it's users reaching data or actions they shouldn't: another user's items, trades, or messages, or an unauthenticated visitor performing a mutation. This doc summarizes how that's prevented.

## Authentication

Supabase Auth (email/password) issues a session stored in cookies via `@supabase/ssr`, so both Server Components and Server Actions can read the current user without any client-side token handling.

## Two layers of authorization

Every Server Action follows the same sequence: **auth check → validate input → check permissions/state → mutate → revalidate**. That permissions check is enforced twice — once in the Server Action, and again by Postgres Row Level Security (RLS) on the actual write. Two reasons both layers exist:

- A bug in a Server Action's own check doesn't become a data breach — Postgres still refuses the write.
- Nothing bypasses the database. Every code path (Server Components, Server Actions, a direct API call) goes through the same RLS policies.

`proxy.ts` also redirects logged-out users away from protected pages (`/items/new`, `/my-items`, `/trades`, `/profile`) before they render — this is a UX nicety, not the real boundary; RLS is.

## Row Level Security, by table

RLS is enabled on every table. Full policy SQL lives in `supabase/migrations/`.

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | any signed-in user | only your own row |
| `items` | available items to anyone; your own items always; a traded/deleted item stays visible to its trade counterpart | only your own |
| `trades` | only if you're a participant | create as initiator only; update only as a participant, and only through a legal state transition (see below) |
| `trade_items` | only if you're a participant of the trade | insert-only, by the trade's initiator, matching item ownership and availability |
| `messages` | only if you're a participant of the trade | insert-only, as yourself, only on a still-open trade — no edit or delete |
| Storage (`item-images`) | public | upload/delete only inside your own `<user id>/...` folder |

Two notes worth keeping in mind: logged-out visitors get their own, narrower `items` policy (available items only), which is what makes the public landing feed safe. And profile avatars reuse the same `item-images` bucket and policy as item photos — no separate bucket needed, since the policy only checks the folder prefix, not what the file is for.

## Functions that bypass RLS on purpose

A few Postgres functions run with elevated privileges because they need to touch rows the calling user's own RLS wouldn't allow — each re-checks permissions itself as its first step, so "elevated" never means "unchecked":

- **`handle_new_user`** — creates a `profiles` row on signup.
- **`is_trade_participant_for_item`** — lets a trade counterpart see an item that's no longer available, without creating a circular RLS dependency between `items` and `trade_items`.
- **`accept_trade`** — accepting an offer also cancels competing offers on the same item, which touches other users' trades.
- **`complete_trade`** — completing a trade marks items traded and cancels other pending trades on them, in one transaction.

## The trade state machine is enforced in the database too

A trigger (`validate_trade_transition`) checks every trade status change against the fixed set of legal transitions (who can accept, decline, cancel, or complete, and from which state) — a third check beyond the UI and the Server Action, so no client can force an illegal state directly. Only `complete_trade()` itself can move a trade to `completed`.

As of migration `0010`, `complete_trade()` also locks and re-checks that its items are still available before completing — closing a rare race where two simultaneous completions on overlapping items could otherwise both succeed.

## Input validation

zod schemas are the only validation actually trusted (client-side checks are for fast feedback, never trusted). Database `CHECK` constraints repeat the important limits — string lengths, allowed categories/conditions/cities, status values — as a backstop. Image uploads are checked for type and size on both the client and the server.

## Other notes

- **Session isolation:** browser cookies are shared per browser window/profile, not per tab — two tabs in the same normal browser window are the same login, not two separate ones. A second real session needs a different browser, profile, or an incognito window.
- **Secrets:** the Supabase service role key (used only by `scripts/seed.ts`) is never exposed to the browser and lives in `.env.local`, which is gitignored. The public anon key is safe to expose — it identifies the project, not a privilege level; every real permission check happens per-request via RLS.
- **Out of scope for v1:** no admin/moderator role, no custom rate limiting beyond Supabase Auth's own, no hand-rolled CSRF protection (Next.js Server Actions include origin checking), no HTML sanitization needed (React escapes all rendered content by default).
