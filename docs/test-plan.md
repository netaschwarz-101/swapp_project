# Test Plan — Swapp

Per assignment §6: for each core feature, the happy path, invalid inputs, permission checks, state-machine violations (where applicable), edge cases, DB integrity, and basic UI checks. This plan is what `tests/unit/` (Vitest) and `tests/e2e/` (Playwright) implement, plus `docs/manual-tests.md` for what doesn't automate well.

`/profile` / `/profile/edit` and `updateProfile` are covered by `tests/e2e/profile.spec.ts`: the happy path (open `/profile`, follow "Edit profile," change the username, get redirected back, see the new value reflected on the page and in the nav bar) and permission checks (the same `/profile` redirect case as every other protected route). Invalid-input and username-uniqueness cases aren't separately automated — `profileUpdateSchema` reuses the signup username rules already covered below, and uniqueness is checked manually per `docs/manual-tests.md`.

## 1. Authentication (signup / login / logout / email confirmation)

- **Happy path:** sign up with valid email/password/username/city → confirm email → session established. Log in with correct credentials. Log out clears the session.
- **Invalid inputs:** malformed email, short password, username too short/long or with disallowed characters, city not in the fixed list — all rejected before reaching Supabase.
- **Permission checks:** an unauthenticated request to a protected route (`/items/new`, `/my-items`, `/trades`, `/profile`) redirects to `/login?next=<path>`.
- **Edge cases:** signing up again with an already-pending email; logging in before confirming shows the resend-confirmation option.
- **DB integrity:** a `profiles` row is always created exactly once per signup — never a user with no profile.

## 2. Items (create / edit / delete)

- **Happy path:** create an item with 1–4 images and all required fields; it appears on `/my-items` and in the feed/search. Edit updates it. Delete removes or soft-deletes it (see below).
- **Invalid inputs:** empty/too-long title, too-long description, category/condition/city outside the fixed list, 0 or more than 4 images — all rejected by validation, and again by DB constraints if bypassed.
- **Permission checks:** one user cannot edit or delete another's item — rejected both by the Server Action and independently by Row Level Security.
- **Edge cases:** deleting an item never involved in a trade hard-deletes it; deleting one that was ever part of any trade soft-deletes it instead, so trade history stays intact.
- **DB integrity:** a hard-delete attempt on a trade-referenced item fails on the foreign key if the soft-delete branch were ever bypassed.

## 3. Feed & Search

- **Happy path:** `/` shows available items in the viewer's city (or newest across cities, logged out); `/search` filters by title, category, condition, city, with pagination.
- **Invalid inputs:** search params outside the fixed lists are ignored rather than causing an error.
- **Permission checks:** a logged-out visitor never sees a non-available item; a logged-in user never sees another user's deleted item.
- **Edge cases:** a city with zero items shows the empty state, not an error. Search excludes the viewer's own items (a deliberate product decision).
- **DB integrity:** the feed/search index should make both queries a simple index scan — worth a manual check once there's real data volume.

## 4. Trades — the core state machine

- **Happy path:** initiator offers item(s) → responder accepts → initiator confirms complete → items marked traded, trade marked completed.
- **Invalid inputs:** zero offered or requested items, or offering to yourself, are all rejected.
- **Permission checks:** a non-participant can't read or act on a trade. Only the responder can accept/decline a pending trade; only the initiator can cancel a pending one or confirm completion; either participant can withdraw an accepted one — enforced in the guard logic, the Server Actions, and again by a database trigger.
- **State-machine violations:** acting on an already-terminal trade, or declining/completing from the wrong state, is rejected; only `complete_trade()` itself can mark a trade completed — a raw client update can't.
- **Edge cases:** a second acceptance on an already-committed item is refused; accepting one of two competing offers auto-cancels the other immediately; a duplicate open offer is rejected before insert; a failed trade creation doesn't leave an orphaned trade behind.
- **DB integrity:** completion (items traded, trade completed, conflicting trades cancelled) happens as one all-or-nothing transaction.

## 5. Messages

- **Happy path:** either participant posts a message (≤1000 chars); it appears for both within ~5s.
- **Invalid inputs:** empty or over-length messages are rejected.
- **Permission checks:** a non-participant can't read or post to a trade's thread.
- **State-machine interaction:** posting to a completed/declined/cancelled trade is rejected at the database level, not just hidden in the UI.
- **Edge cases:** messages are immutable — there's no edit/delete policy at all.

## 6. Cross-cutting

- **Basic UI checks:** every list page has a relevant empty state; action buttons only render when legal for the current role/status; trade action failures render inline instead of crashing.
- **Session isolation:** browser cookies are shared per browser window, not per tab (see `docs/security.md`) — a browser property, not something to test in code.

## Implementation

- **Vitest** (`tests/unit/`) — pure logic, no network: the state-machine guards (every legal and illegal transition) and every zod schema (valid input passes, each invalid case above is asserted).
- **Playwright** (`tests/e2e/`), run against a real Supabase project:
  1. `signup-and-post-item.spec.ts` — sign up, post an item, see it on `/my-items`.
  2. `search.spec.ts` — filters return expected results; no matches shows the empty state.
  3. `full-trade-flow.spec.ts` — two logged-in users, full offer → accept → complete cycle, including the losing competing offer auto-cancelling.
  4. `unauthorized-access.spec.ts` — a logged-out user is redirected; a logged-in user is blocked from a trade they're not part of.
  5. `profile.spec.ts` — view/edit `/profile`, username change reflected everywhere.
- **`docs/manual-tests.md`** — image upload and visual/responsive checks not worth automating for a project this size.
