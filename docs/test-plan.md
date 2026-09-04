# Test Plan — Swapp

Per assignment §6: for each core feature, the happy path, invalid inputs, permission checks, state-machine violations (where applicable), edge cases, DB integrity, and basic UI checks. This plan is what `tests/unit/` (Vitest) and `tests/e2e/` (Playwright) implement, plus `docs/manual-tests.md` for what doesn't automate well.

`/profile` (read-only) / `/profile/edit` and `updateProfile` (built in Phase 8, after being flagged here as a gap) are covered by `tests/e2e/profile.spec.ts`: happy path (open `/profile`, follow "Edit profile" to `/profile/edit`, change the username, get redirected back to `/profile`, and see the new value reflected there and in the nav bar — the nav bar's live update, without a full page navigation, comes from the Server Action's automatic route refresh) and permission checks (covered by the `/profile` redirect case below, same as every other protected route — `/profile/edit` shares the same `/profile` prefix in `proxy.ts`'s protected-routes list). Invalid-input and username-uniqueness cases aren't separately automated — `profileUpdateSchema` reuses `signupSchema`'s username rules, already covered by the authentication section below, and the unique-username constraint is exercised manually per `docs/manual-tests.md`.

## 1. Authentication (signup / login / logout / email confirmation)

- **Happy path:** sign up with a valid email/password/username/city → confirmation email sent → click link → session established → redirected. Log in with correct credentials. Log out clears the session.
- **Invalid inputs:** malformed email, password under 8 characters, username under 3 or over 24 characters, username with disallowed characters (spaces, symbols), city not in the fixed list. Each should be rejected by `signupSchema` before ever reaching Supabase.
- **Permission checks:** an unauthenticated request to a protected route (`/items/new`, `/my-items`, `/trades`, `/profile`) redirects to `/login?next=<path>` (enforced in `proxy.ts`, backed by RLS on every table regardless).
- **Edge cases:** signing up with an email that already has a pending (unconfirmed) account — Supabase's anti-enumeration behavior means no new confirmation email is guaranteed; `resendConfirmation` exists specifically for this. Logging in before confirming email returns `email_not_confirmed` and surfaces the resend flow.
- **DB integrity:** `handle_new_user()` trigger always creates exactly one `profiles` row per `auth.users` row, with `username`/`city` pulled from signup metadata — never a user with no profile.

## 2. Items (create / edit / delete)

- **Happy path:** create an item with 1–4 valid images, all required fields; it appears on `/my-items` and (once available) in feed/search. Edit updates the row. Delete removes it (or soft-deletes — see below).
- **Invalid inputs:** title empty or over 80 chars, description over 1000 chars, category/condition/city outside the fixed enums, 0 images, more than 4 images — all rejected by `itemSchema`. Also re-validated by DB `CHECK` constraints as a last line of defense (per `docs/technical-design.md` §8) — a test should confirm a direct insert bypassing the app still fails the DB constraint.
- **Permission checks:** user B cannot `updateItem` or `deleteItem` on user A's item — rejected both by the Server Action's explicit ownership check and independently by RLS (`owner_id = auth.uid()`). Test the RLS layer directly (a raw Supabase client call with B's JWT attempting to update A's row), not just "the Edit button isn't shown."
- **Edge cases:** deleting an item that has never been part of any trade → hard delete. Deleting an item that has appeared in any `trade_items` row (even a long-cancelled trade) → soft delete (`status='deleted'`) instead, so trade history never points at a vanished row (`actions/items.ts`, `deleteItem`).
- **DB integrity:** `trade_items.item_id` has no `ON DELETE CASCADE` back to `items` — confirm a hard delete attempt on a trade-referenced item fails on the foreign key if the soft-delete branch were ever bypassed.

## 3. Feed & Search

- **Happy path:** `/` shows available items in the viewer's own city (logged in) or newest-across-cities (logged out); `/search` filters by title (`ilike`), category, condition, city, with pagination.
- **Invalid inputs:** search params outside the fixed enums are sanitized/ignored (`pickOption<T>()` in `app/search/page.tsx`) rather than erroring.
- **Permission checks:** neither `feed_items()`/`newest_items()` nor `/search` are `SECURITY DEFINER` — both run under the caller's own RLS, so a logged-out visitor never sees a non-`available` item, and a logged-in user never sees another user's `deleted` item.
- **Edge cases:** a city with zero available items renders the empty state, not an error. `/search` excludes the viewer's own items (explicit product decision — see `docs/decisions.md`, "search excludes own items").
- **DB integrity:** the `items (city, status, created_at desc)` index is what makes both queries a straightforward index scan — not directly testable by app-level tests, but worth a manual `EXPLAIN` check (see `docs/scale.md`, Phase 7).

## 4. Trades — the core state machine

- **Happy path — full cycle:** initiator offers item(s) for a responder's item → responder accepts → initiator confirms complete → both items marked `traded`, trade marked `completed`.
- **Invalid inputs:** `createTradeSchema` rejects zero offered items, zero requested items, or a `responder_id` equal to the caller's own id ("can't trade with yourself" — checked in the Server Action, not zod, since it needs the authenticated user's id).
- **Permission checks:**
  - User A cannot read or act on a trade they're not a participant in — test directly via RLS (A's JWT, `select`/`update`/`delete` against a trade between B and C) as well as the page-level `roleOf()` → `notFound()` check.
  - Only the responder can accept/decline a `pending` trade; only the initiator can cancel a `pending` one; either participant can withdraw an `accepted_by_responder` one; only the initiator can confirm completion. All four enforced in `lib/trade-machine.ts`'s guards, the Server Actions, and a second time by the `validate_trade_transition()` DB trigger.
- **State-machine violations:** accepting an already-`declined` or already-`cancelled` trade; declining an already-`accepted_by_responder` trade; confirming completion of a still-`pending` trade; any direct client attempt to set `status='completed'` (the trigger only allows that transition via `complete_trade()`'s `system_transition` flag — a raw client update to `'completed'` must be rejected).
- **Edge cases (the ones actually found live, during Phase 4):**
  - Offering on an item that's already part of someone else's `accepted_by_responder` trade — `accept_trade()` must refuse a *second* acceptance for the same item, not silently override the first.
  - Two competing `pending` offers for the same item: accepting one must auto-cancel the other immediately (not just at completion) — `accept_trade()`'s conflict-resolution step.
  - A duplicate open offer (same initiator, same requested item, already `pending`/`accepted_by_responder`) — `createTrade` must reject it before insert.
  - A failed `trade_items` insert after the `trades` row was created must not leave an orphan — `createTrade`'s compensating delete, and the DELETE policy that makes it actually work (`0006_trades_delete_policy.sql`).
- **DB integrity:** `complete_trade()` is one transaction — items-traded, trade-completed, and conflicting-trades-cancelled either all happen or none do. Not independently testable without forcing a mid-transaction crash, but the single-function design is what makes this true by construction; call out for the presentation rather than test directly.

## 5. Messages

- **Happy path:** either participant posts a message ≤1000 chars; it appears for both (poll picks it up within ~5s for the other side).
- **Invalid inputs:** empty (whitespace-only) body, body over 1000 chars — rejected by `messageSchema`.
- **Permission checks:** a non-participant cannot read or post to a trade's thread — RLS `select`/`insert` policies (`0009_messages.sql`), tested directly with a third user's JWT.
- **State-machine interaction:** posting to a `completed`/`declined`/`cancelled` trade is rejected — enforced in the messages `insert` RLS policy (`t.status not in (...)`), not just the UI hiding the input.
- **Edge cases:** messages are immutable — no update/delete policy exists at all, so any attempted edit/delete request must be rejected outright by RLS (there's no code path that even tries, but RLS is the real guarantee).

## 6. Cross-cutting

- **Basic UI checks:** every list page (feed, search, my-items, trades) has a distinct, relevant empty state; every action button only renders when `lib/trade-machine.ts`'s guards say it's legal for the current role/status (§9 of the design doc); trade action failures (accept/decline/cancel/complete/send message) render inline instead of crashing to the generic error boundary (`docs/decisions.md`, "trade action errors shown inline").
- **Session isolation:** confirmed manually already (see `docs/decisions.md`) that browser session cookies are shared per-tab-set, not per-tab — worth one explicit note in `docs/security.md` (Phase 7) rather than a test, since it's a browser property, not an app bug.

## Implementation

- **Vitest** (`tests/unit/`) — pure logic only, no network: `lib/trade-machine.ts`'s guards (every legal and illegal transition in the state diagram above) and every zod schema in `lib/validation/` (valid input passes, each invalid-input case above is individually asserted).
- **Playwright** (`tests/e2e/`) — against a real Supabase project (this project's `.env.local`, run locally — this sandbox has no network path to `supabase.co`, same constraint as the seed script):
  1. `signup-and-post-item.spec.ts` — sign up, post an item, see it on `/my-items`.
  2. `search.spec.ts` — search filters return expected results; a filter with no matches shows the empty state.
  3. `full-trade-flow.spec.ts` — two browser contexts (two logged-in users), full offer → accept → complete cycle, asserting item status changes and the losing competing offer auto-cancels.
  4. `unauthorized-access.spec.ts` — a logged-out user is redirected off a protected route; a logged-in user is blocked (404, not a leaked row) from a trade they're not part of.
- **`docs/manual-tests.md`** — image upload (real file picker interaction, Storage policy in practice) and visual/responsive checks that aren't worth automating for a project this size.
