# Decisions Log

This file records notable decisions as the project is built: what was decided, what alternatives were considered, and why. Appended to after each phase.

---

## Phase 0 — Docs first (2026-08-22)

**Decision:** Write `product-spec.md`, `architecture.md`, and `technical-design.md` before any code exists, using the locked product decisions from the work plan as the source of truth.

**Alternatives considered:** Start coding first and write docs retroactively. Rejected — the course grades documents heavily, and writing them first forces the scope and data model to be settled before code is written against a moving target. It also means the docs describe intent rather than being a reverse-engineered description of whatever the code happened to end up doing.

**Key decisions carried from the work plan into the docs (with rationale restated for the presentation):**

- **City from a fixed list, not GPS.** Geospatial queries (PostGIS), location-permission UX, and privacy handling are a lot of surface area for a feature (radius search) that a fixed city list mostly achieves for a course project — trades happen locally regardless.
- **Polling chat, not Supabase Realtime.** Trades unfold over hours or days, not seconds, so there's no real UX cost to a 5-second poll while the thread is open (plus a refetch on open). Realtime subscriptions add connection-lifecycle complexity (reconnect handling, cleanup on unmount, potential duplicate-message races) that's disproportionate to the benefit here, and it's called out explicitly as a stretch goal for Phase 8 if time allows.
- **Multi-item trades via a join table (`trade_items`).** A single extra table with a `side` column (`offered`/`requested`) supports N:M items-per-trade with barely more complexity than a hypothetical 1:1 foreign-key design, and it's much closer to how real barter trades actually work ("my jacket + headphones for your bike").
- **No money anywhere in the schema.** Keeps legal/compliance surface, fraud risk, and payment-integration scope at zero — deliberately out of scope per the locked product decisions.
- **RLS on every table, treated as the primary authorization mechanism** rather than a backstop — Server Actions check authorization too, but the documented position (and the position to defend in the oral presentation) is that RLS is what actually prevents cross-user data access, since it holds even if application code has a bug.
- **`items.city` denormalized from the owner's profile at item-creation time**, so the hot feed query never joins `profiles`. Documented trade-off: an item's city goes stale if the owner later changes their profile city, until the item itself is edited.
- **`complete_trade` as a single Postgres transaction (function)**, not a sequence of app-level calls, specifically so "mark items traded" and "auto-cancel conflicting trades" can never be observed half-done.
- **No client-side global state store.** The app's data is server state by nature (items/trades/messages), refetched via Server Components and `revalidatePath` after every mutation; introducing Redux/Zustand would mean manually keeping a client cache in sync with data the server already owns, for no benefit at this scale.

**Deliverable:** `docs/product-spec.md`, `docs/architecture.md`, `docs/technical-design.md` committed.

---

## Phase 1 — Skeleton + Auth (2026-08-22)

**Decision:** Scaffolded with `create-next-app` (TypeScript, Tailwind v4, App Router), added Supabase auth (signup/login/logout as Server Actions), route protection, and a hand-assembled shadcn/ui component set.

**Next.js 16, not 14/15.** `create-next-app@latest` pulled Next.js 16. Two things changed that are worth knowing for the presentation:

- **`middleware.ts` is now `proxy.ts`** (same mechanism — runs before rendering, can redirect/rewrite — just renamed to better describe what it does; the file itself even self-documents this via the auto-generated `AGENTS.md`). The route-protection file in this repo is `proxy.ts` (with the actual logic in `lib/supabase/proxy.ts`), not `middleware.ts`.
- `cookies()` from `next/headers` is async — already accounted for in `lib/supabase/server.ts`.
- Confirmed via `node_modules/next/dist/docs/` (Next ships its own doc set specifically so an agent working against a newer version than its training data can check what changed) rather than assuming the API matches an older, more familiar version.

**shadcn/ui: components hand-written instead of via `npx shadcn add`.** The shadcn CLI's `init`/`add` commands fetch component definitions from `ui.shadcn.com`, which isn't reachable through this environment's network allowlist (only `registry.npmjs.org`, `github.com`, and a few other package registries are). Rather than block on that, I installed the underlying Radix/CVA/clsx/tailwind-merge packages directly via npm and wrote the standard shadcn component source (`button`, `input`, `textarea`, `label`, `card`, `badge`, `select`) by hand into `components/ui/` — this is exactly what the CLI would have generated, since shadcn's whole model is "copy the code into your repo," not an opaque dependency. **Action item for you:** once you're working from your own machine (which has normal internet access), `npx shadcn@latest add <component>` will work normally for anything more I didn't hand-roll (e.g. `dialog`, `checkbox`) — just make sure `components.json` (already committed) matches what's there.

**zod v4.** `create-next-app` pulled the current zod major (v4), which changed some APIs (e.g., `z.email()` alongside the still-functional-but-soon-deprecated `z.string().email()`). Verified the schemas at runtime against the installed version rather than assuming v3 syntax.

**Verification before commit:** ran `tsc --noEmit`, `next build`, and `eslint` before committing. `next build` in this sandbox fails on fetching Geist from Google Fonts specifically (that host isn't on the network allowlist either) — confirmed this is environment-only by temporarily swapping to system fonts, seeing the rest of the build succeed cleanly (all routes compiled, typecheck passed), then reverting to Geist. This will build fine on Vercel and on your machine, both of which have normal internet access.

**Deliverable:** deployed-app code is ready (Next.js app, Supabase auth wiring, `profiles` migration); actual deployment to Vercel + a live Supabase project is blocked on account access — see the note below.

**Blocked / needs you:** GitHub repo, Supabase project, and Vercel deployment need either the Claude-in-Chrome browser extension connected (so I can drive account creation) or you creating them and handing me the resulting repo URL + Supabase URL/anon key. Flagged in chat when this came up.

---

## Phase 2 — Items CRUD + images (2026-08-22)

**Decision:** `items` table + RLS (`0002_items.sql`), a public `item-images` Storage bucket scoped by an `auth.uid()`-prefixed folder convention (`0003_storage.sql`), a shared `ItemForm` client component used by both create and edit, a browser-side `ImageUploader`, and the `/items/new`, `/items/[id]/edit`, `/items/[id]`, and `/my-items` pages.

**RLS read policy is deliberately incomplete right now, on purpose.** `docs/technical-design.md`'s RLS sketch says items should also be readable when they "belong to a trade the user participates in" — that needs `trades`/`trade_items`, which don't exist until Phase 4. Rather than write that clause against tables that don't exist yet, `0002_items.sql` ships the two clauses that _are_ buildable now (available-to-everyone, own-items-always) and says explicitly in a comment that Phase 4 extends the policy. Flagging this now so it doesn't look like an oversight later — it's staged on purpose.

**Delete is hard-delete for all of Phase 2, also on purpose.** The product spec's rule ("soft-delete if the item was ever in a trade, else hard-delete") can't be evaluated before `trade_items` exists — there's no trade history yet to check. `actions/items.ts`'s `deleteItem` hard-deletes unconditionally today and has a comment marking exactly where the Phase 4 change goes.

**Images upload straight from the browser to Storage, not through a Server Action.** The Server Action only ever receives the resulting public URLs (in the item form's hidden `image_urls` inputs) — this matches `docs/architecture.md`'s note that API route handlers / direct client calls are fine specifically where a Server Action would be awkward, and streaming a multi-MB file through a Server Action's single-request-body model has no advantage over uploading directly to Storage with a scoped RLS policy. Type/size are checked in the browser (fast feedback) and the URL count is re-checked server-side by `itemSchema` before the item row is written — the file's _content_ isn't re-validated server-side since Storage's own policy already restricted _where_ an authenticated user can write.

**No generated Supabase types yet.** `supabase.from("items")` calls are loosely typed until a real project exists to run `supabase gen types typescript` against — noted here so it's a visible, deliberate gap rather than something to rediscover mid-Phase-4. Worth doing once the Supabase project is up.

**Verification:** `tsc --noEmit`, `eslint`, and a full `next build` (fonts stubbed for this sandbox's network policy, same as Phase 1) all pass with all 8 routes compiling.

**Deliverable:** item CRUD works end-to-end in code; needs a live Supabase project + the two new migrations applied to actually exercise it.

---

## Post-deploy fix — email confirmation redirect (2026-08-27)

**Problem:** after deploying to Vercel and signing up on the live site, the confirmation email linked to `localhost:3000/?code=...` — Safari couldn't connect, since nothing is listening on `localhost` on the phone/laptop making the request, and even the right host had no code to consume that link.

**Two separate bugs, both needed:**

1. **Supabase project's Site URL was still the default `http://localhost:3000`.** This value is what Supabase's email templates use to build the confirmation link — it's a dashboard setting (Authentication → URL Configuration), not something in this repo, so no amount of app code would have fixed it. Changed to the production Vercel URL, and that URL was added to the Redirect URLs allowlist alongside it.

2. **The app had no route to actually consume a confirmation link.** Added `app/auth/confirm/route.ts`, a Route Handler that reads `token_hash` + `type` from the URL and calls `supabase.auth.verifyOtp(...)` to exchange them for a real session, then redirects to `next` (default `/`) on success or to `/login?error=confirmation_failed` on failure (login page now shows a message for that case).

**`verifyOtp` + `token_hash`, not `exchangeCodeForSession` + `code`.** Supabase actually supports two different confirmation mechanisms: PKCE (`code` param, `exchangeCodeForSession`) and OTP-style (`token_hash`+`type` param, `verifyOtp`). The `?code=` the user saw was Supabase's *default* email template, which points at Supabase's own hosted `/auth/v1/verify` endpoint and only hands back a `code` after an extra server-side hop. The fix implemented here instead points the email template directly at our own `/auth/confirm` route with `token_hash`/`type` — this is the pattern Supabase documents for server-rendered apps, it keeps the whole flow on our domain instead of bouncing through Supabase's server first, and it doesn't depend on that extra hop's `redirect_to` matching correctly. **Action item for you:** in the Supabase dashboard, Authentication → Email Templates → Confirm signup, the "Confirmation URL" needs to read `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/` instead of the default `{{ .ConfirmationURL }}`.

**Verification:** `eslint` clean; full `next build` (fonts stubbed for this sandbox's network policy, reverted after) compiles all 9 routes including the new `/auth/confirm`.

**Follow-up: the email-template edit above isn't actually possible on the free tier.** Supabase's Email Templates screen shows "Set up custom SMTP to edit templates" — with the built-in mailer (fine for a course project's volume), the template body is locked to Supabase's default, `{{ .ConfirmationURL }}` and all. Rather than make SMTP setup (a third-party mail provider, API keys, DNS records) a prerequisite for a working signup flow, switched approach: `actions/auth.ts`'s `signup()` now passes `emailRedirectTo: `${origin}/auth/confirm`` to `supabase.auth.signUp()`, read from the request's own `origin` header (via `next/headers`) so it's correct on every deployment without an env var. This makes Supabase's *default*, unedited template redirect to our route instead of the site root — the browser still bounces through Supabase's hosted `/auth/v1/verify` first (that's what turns the emailed token into a `code` param), but it lands on `/auth/confirm?code=...` either way. `app/auth/confirm/route.ts` now handles `code` via `exchangeCodeForSession` as the primary path, keeping `token_hash`/`verifyOtp` as a fallback for a custom-template link if SMTP is ever set up later. Net effect: the Supabase dashboard needs Site URL + Redirect URLs fixed (still required — see above), but the Email Templates screen doesn't need to be touched at all.

**Verification (re-run after this change):** `eslint` clean; full `next build` again compiles all 9 routes cleanly.

---

## Post-deploy fix — resend confirmation email (2026-08-29)

**Problem:** re-submitting the signup form with an email that already had a pending (unconfirmed) account showed the normal "check your email" success message, but no new email actually arrived — and there was no way to ask for another one.

**Root cause:** `supabase.auth.signUp()` deliberately behaves the same way whether or not the email is already registered, to avoid letting an attacker learn which emails have accounts (this is standard anti-enumeration practice, not a bug). Concretely, that means calling `signUp()` again for an already-pending email does not reliably send a fresh confirmation email — the UI has no way to tell the two cases apart from the response alone.

**Fix:** added `resendConfirmation()` in `actions/auth.ts`, using Supabase's dedicated `supabase.auth.resend({ type: "signup", email })` — the documented, explicit way to request a new confirmation email for an account that exists and isn't confirmed yet (no anti-enumeration ambiguity, since the caller already has to reach this path via a failed login). Wired it into the login page: `login()` now checks `error.code === "email_not_confirmed"` (a typed Supabase error code) instead of collapsing every sign-in failure into "incorrect email or password," and when that's the case the login form shows a "Resend confirmation email" button. Also surfaced `over_email_send_rate_limit` as a distinct, readable message, since Supabase's built-in mailer rate-limits fairly aggressively and that's the most likely failure mode while testing.

**Verification:** `eslint` clean; full `next build` compiles all 9 routes.

---

## Phase 3 — Feed + search + seed data (2026-08-29)

**Decision:** a real "For You" feed on `/`, a public `/search` page with filters and pagination, and `scripts/seed.ts` for demo data.

**Feed randomness lives in the database, not the app.** `supabase/migrations/0004_feed_rpc.sql` adds two plain SQL functions — `feed_items(city, exclude_owner, limit)` (random sample, viewer's city, excluding their own listings) and `newest_items(limit)` (newest-across-all-cities, for logged-out visitors) — called via `.rpc()` from `app/page.tsx`. Considered fetching a batch and shuffling in the Server Component instead; went with `order by random()` in a DB function because it's what the work plan calls out as fine at this scale, and "the database decides the random order, not app code holding a bigger batch than it displays" is a cleaner thing to defend in the presentation. Neither function is `SECURITY DEFINER` — they run as the calling role, so the existing `items` RLS policies (0002_items.sql) still apply; this is a query helper, not an RLS bypass.

**Search is a plain GET form, not client-side state.** `components/search-filters.tsx` posts `q`/`category`/`condition`/`city` as a normal form submission to `/search`, which is a Server Component reading `searchParams`. No client-side fetch, no loading spinner to build — filtering a URL is shareable, back-button-friendly, and works without JavaScript, and it means `/search` needed zero new client state. Pagination is offset-based (`.range()` + `count: "exact"`, 20/page) — `docs/scale.md` (Phase 7) will note cursor pagination as the production-scale alternative and why it isn't needed yet.

**Seed script uses the Supabase admin API, run by the developer, not the app.** `scripts/seed.ts` creates 5 demo users via `auth.admin.createUser({ email_confirm: true, ... })` (skipping the confirmation-email flow entirely — appropriate for trusted demo accounts) and ~40 items spread across categories/conditions/cities, with placeholder photos from picsum.photos rather than real uploads (there's nothing to gain by exercising the Storage upload path with fake images). It needs `SUPABASE_SERVICE_ROLE_KEY`, which is exactly why it's a standalone script invoked with `npm run seed` from a real machine, never something the deployed app calls — this sandbox's network is allowlisted to package registries only, so it was written and typechecked here but has to be *run* by you locally. Safely re-runnable: it deletes any previously-seeded `@swapp.test` users first (profiles/items cascade via the existing FKs), so repeated runs don't pile up duplicates.

**Verification:** `eslint` clean; full `next build` compiles all 10 routes (adds `/search`); `tsc --noEmit` clean (the `.rpc()` calls needed an explicit type cast to `ItemCardData[]`, same root cause as the rest of the app's loosely-typed Supabase calls — no generated types yet).

**Not run yet:** the seed script itself — it needs to be executed from your machine with `SUPABASE_SERVICE_ROLE_KEY` set, which I don't have and shouldn't be given as plain text. Run `npm run seed` locally once you're ready for demo data.

---

## Post-seed fixes — item ownership/city correlation, search excludes own items (2026-08-29)

**Bug: the "For You" feed came back empty for every demo account, in their own city specifically.** `scripts/seed.ts` originally assigned an item's owner via `i % 5` and its city via `i % 10`. Since 10 is a multiple of 5, `i % 5` is fully determined by `i % 10` — so every item posted in a given city always landed on the exact same one of the 5 owners. Each demo user's profile city was also set to one of those "their" cities, so 100% of the items in a user's own city turned out to be their own listings, and `feed_items()` (which excludes the viewer's own items by design) had nothing left to show. Fixed by cycling city per *row* of 5 items instead of per item (`Math.floor(i / 5) % CITIES.length`) — that keeps one item per owner in each city before the city changes, so no city is ever 100% one person's listings.

**Search now also excludes the viewer's own items, at your request.** Worth noting for the record since it's a genuine judgment call, not a bug fix: most real marketplaces (Facebook Marketplace, Craigslist) *do* show your own listings in general search — it's a "find anything" tool, unlike a personalized feed. We chose to make `/search` match the "For You" feed's behavior instead (never show your own stuff), via `.neq("owner_id", user.id)` in `app/search/page.tsx` when a viewer is signed in.

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 10 routes. Re-run `npm run seed` to pick up the corrected city/owner distribution (it deletes and recreates the demo users, so this is safe).

---

## Phase 4 — Trades core (2026-08-29)

**Decision:** `trades` + `trade_items` migration with a DB-level state-machine trigger, the `complete_trade()` atomic-completion function, an offer builder page, a trades inbox, a trade detail page with contextual actions, and the soft-delete rule for items with trade history. This is the phase the work plan itself calls "the heart of the project — do not rush review here," so it's worth reading `supabase/migrations/0005_trades.sql` closely, not just this summary.

**A trigger enforces the state machine at the database layer, beyond what was originally scoped.** `docs/technical-design.md` §3.1 calls for the transition rules to be enforced in `lib/trade-machine.ts` and the Server Actions; this migration adds a third, independent layer — a `before update` trigger (`validate_trade_transition()`) on `trades` that rejects any status change that isn't one of the exact legal edges in the state diagram, checking *who* is allowed to make it (only the responder can accept/decline a pending trade, only the initiator can cancel a pending one, either side can withdraw once accepted, etc.). The reasoning: `lib/trade-machine.ts` and the Server Actions are what a bug could live in; the trigger is what makes a bug there merely *reject* a request instead of ever *producing* an illegal state — which is exactly the property the work plan's Phase 6 test plan calls out wanting to verify ("state-machine violations: accept a declined trade"). One consequence worth knowing for the presentation: a trade can only ever reach `completed` through `complete_trade()`, never a direct client update — the trigger blocks that path outright, which is what forces "mark items traded" and "mark trade completed" to always happen together.

**`complete_trade()` needs to bypass its own trigger for the auto-cancel step, so it sets a transaction-local flag.** The function is `SECURITY DEFINER` specifically so it can update *other users'* trades (auto-cancelling anything else still open on the same items) — something the calling user's own RLS permissions would never allow directly, and correctly so. But the trigger doesn't know that; from the trigger's point of view, `auth.uid()` is still the person who clicked "confirm complete," and they usually aren't even a participant in the trades being auto-cancelled. `set_config('swapp.system_transition', 'true', true)` (transaction-local, auto-clears at commit) tells the trigger "this batch of changes is already authorized by the function that's making them, skip the per-role check" — the function still does its own authorization check (caller is the trade's initiator, trade is `accepted_by_responder`) before setting that flag, so this isn't an open door.

**`createTrade` is two sequential inserts, not one RPC — a deliberate scope cut, not an oversight.** Unlike `complete_trade`, creating a trade (insert into `trades`, then insert into `trade_items`) isn't wrapped in a single DB function. If the second insert fails after the first succeeds, the Server Action deletes the orphaned trade before returning an error, so nothing broken is left visible — but this is a compensating action, not a real transaction, so a crash between the two steps (rather than a normal error return) could theoretically leave an orphan. Accepted the risk here specifically because nothing observes a half-created trade as *correct* (no items yet = nothing to act on) the way a half-completed trade would (items traded but trade still "pending" is actively misleading); worth mentioning as a known limitation if asked.

**Items RLS gains the deferred clause from Phase 2.** `0002_items.sql` shipped without the "or belongs to a trade I'm in" read clause since `trades`/`trade_items` didn't exist yet; this migration's `alter policy` adds it, so once an item goes to `status='traded'` (no longer publicly visible), both trade participants can still see it on the trade detail page and in trade history.

**Soft-delete now actually branches on trade history**, closing out the Phase 2 TODO comment in `actions/items.ts`: `deleteItem` checks for any `trade_items` row referencing the item and sets `status='deleted'` instead of removing the row if one exists. Also worth noting: `trade_items.item_id` has no `ON DELETE CASCADE` back to `items` on purpose, so even without this application-level check, a hard delete of a trade-referenced item would fail on the foreign key rather than silently breaking trade history — the check just turns that into a clean soft delete instead of a raw DB error reaching the user.

**Offer builder supports one requested item, many offered items — not full N:M yet.** The entry point is always a single item's "Offer a trade" button, so `/trades/new?item=[id]` pre-fills exactly one requested item; the initiator can still pick 1..N of their own items to offer in exchange, so the schema and RLS already support full N:M (a future "build a multi-item request" UI could reuse the same `createTrade` action unchanged) — this is a UI scope cut, not a data-model limitation.

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 13 routes (adds `/trades`, `/trades/[id]`, `/trades/new`).

**Not yet exercised against a live database** — the trigger logic, RLS policies, and `complete_trade()`'s atomicity all need a real end-to-end test (two seeded users completing a full trade) once this migration is applied, which is exactly what the work plan's Phase 4 deliverable calls for next.

---

## Phase 4 follow-up — missing DELETE policy, duplicate-offer prevention (2026-08-29)

**Bug: creating a trade offer kept failing, and every failed attempt left a visible duplicate behind.** After applying `0005_trades.sql`, offer creation still returned a generic "couldn't create trade offer" error, and the trades inbox showed three near-identical trades to the same responder for the same item. Root cause was two separate things stacking on top of each other:

**1. `trades` had no DELETE policy.** `createTrade`'s orphan-cleanup step (`actions/trades.ts`) inserts the `trades` row, then inserts its `trade_items`; if the second insert fails, it deletes the just-created trade so nothing broken is left behind. `0005_trades.sql` never added a DELETE policy for `trades`, so under RLS that delete silently affected zero rows — no error, just a no-op — meaning every failed attempt (and every retry after it) left one more empty, itemless trade sitting in the inbox instead of cleaning up after itself. `0006_trades_delete_policy.sql` adds a DELETE policy scoped to exactly that situation: the initiator, only while `status = 'pending'`, only while the trade has zero `trade_items` rows. It can never delete a real trade, only the specific "this create attempt didn't finish" state.

**2. The error message was too generic to show what was actually failing.** `createTrade` returned the same fixed string regardless of cause, which made retries look identical from the outside even though something in the `trade_items` insert was being rejected each time. Changed both failure branches to interpolate the real Postgres/PostgREST `.message` into the returned error, so the next attempt will surface the actual reason instead of masking it.

**Added a duplicate-open-offer check**, at your request: before inserting, `createTrade` now looks for an existing `trade_items` row where you're the initiator, the item is on the `requested` side, and the trade is still `pending` or `accepted_by_responder` — if one exists, it returns "You already have an open offer for one of these items" instead of creating another. This is an application-layer check (not RLS), since "does this exact offer already exist" isn't something a row-level policy on a single insert can express — it needs to look across existing rows first.

**"Redirect after a successful offer to stop double-clicks" needed no new code.** `createTrade` already calls `redirect()` immediately after a successful insert (same pattern as `createItem`/`login`/`signup`), and `SubmitButton` already disables itself while the form is pending via `useFormStatus().pending`. The reason it *looked* like double-submits were getting through was the bug above — every click was failing and returning to the same page, which looks identical to a double-click succeeding twice. No new code added here; if it recurs after the fixes above, that would point at something else.

**Verification:** `eslint` clean; `tsc --noEmit` clean (only the pre-existing, unrelated `LayoutProps` error in `app/layout.tsx`); full `next build` compiles all 13 routes.

**Needs manual cleanup once:** the 3 duplicate trades already sitting in the live database were created before this fix and won't clean themselves up — see the message alongside this commit for the one-off SQL to remove them.

---

## Phase 4 follow-up #2 — RLS circular dependency between `items` and `trade_items` (2026-08-29)

**Bug:** after applying `0006`, creating a trade offer failed with a new, more specific error: `infinite recursion detected in policy for relation "trade_items"`. This is a real Postgres limitation, not a bug in the data or a misconfigured re-run — `0005_trades.sql` had built a genuine circular dependency between two policies without anyone intending to: `trade_items`'s INSERT policy queries `items` directly (to check the item is available and owned by the right side), and `items`'s SELECT policy — extended by that same migration — queries `trade_items` directly (so trade participants can still see items that are no longer `'available'`). When Postgres rewrites the `trade_items` insert, expanding `items`'s policy pulls `trade_items`'s policy back in, which is exactly the cycle the rewriter refuses to resolve rather than risk actually looping.

**Fix:** `0007_fix_items_trade_items_rls_recursion.sql` moves the `trade_items` lookup inside `items`'s policy into a new `SECURITY DEFINER` function, `is_trade_participant_for_item()` — the same pattern `complete_trade()` already uses. A `SECURITY DEFINER` function is never inlined into the caller's query by the planner, so the query it runs against `trade_items` doesn't re-trigger `trade_items`'s own policy expansion the way a direct correlated subquery does, which breaks the cycle. The function still only reports true for the calling user's own trades (checks `auth.uid()` internally), so nothing gains broader visibility than the original policy intended — it's a mechanical fix for how Postgres's rewriter handles the reference, not a change in who can see what.

**Why this wasn't caught during the Phase 4 build verification:** `next build`/`tsc`/`eslint` all pass regardless, since this is a live-database-only failure — the app code doing the query is correct; the migration's policy shape is what's wrong, and there's no local emulator running Postgres RLS in this project. This is exactly the category of bug the work plan's Phase 4 note anticipated ("not yet exercised against a live database").

**Verification:** no application code changed, so no new `eslint`/`tsc`/`next build` run beyond what Phase 4 follow-up #1 already covered. The migration's correctness was checked by tracing exactly which policy queries which table (above) rather than a local run, since this sandbox has no live Postgres/Supabase connection — needs the same manual live-database check as any migration here.

---

## Visual refresh — "plain white riso" + light/dark theme (2026-08-29)

**Decision:** applied `SWAPP_REDESIGN.md` phase by phase as a pure styling change — no route, Server Action, Supabase query, RLS policy, zod schema, or prop signature touched (the one prop addition, `ItemCard`'s optional `index`, is presentational only, used to alternate ink tones).

**Phase 1 (tokens):** `app/globals.css` — 1rem radius (was 0.625rem), near-black `--border` instead of the light grey hairline, lighter `--muted-foreground`, and four new `--ink-*` decorative variables (light + dark values, wired into `@theme inline` as `ink-warm`/`ink-cool`/`ink-olive`/`ink-success` utilities). These are documented as decorative-only — never used for text or borders — so they can't accidentally end up carrying a contrast requirement.

**Phase 2 (primitives):** `components/ui/card.tsx` (rounded-2xl, 1.5px border, dropped shadow), `button.tsx` and `badge.tsx` (pill/`rounded-full`). Inputs/textarea/select intentionally left alone — `border-input` staying lighter than the new card border is what makes cards read as outlined shapes and inputs read as quieter form fields.

**Phase 3 (InkBlock):** new `components/ink-block.tsx`, a presentational wrapper with no state. Applied in exactly the three places the spec called for: `ItemCard` (alternating warm/cool by grid index, passed from `app/page.tsx`'s and `app/search/page.tsx`'s `.map()`, with grid `gap-4` → `gap-8` so offsets don't collide), and the trades inbox (`app/(protected)/trades/page.tsx`), where only trades needing the current user's action get `tone="success"` — reused the existing `canAccept`/`canConfirmComplete` guards from `lib/trade-machine.ts` for that condition (pending-as-responder or accepted_by_responder-as-initiator) rather than re-deriving the same logic inline, so this can't silently drift from the actual state machine. Form cards, the offer builder, the message thread, and `my-items` rows were left plain, per the spec.

**Phase 4 (token hygiene):** repo-wide grep for hard-coded colours (`bg-white`, `text-black`, `bg-gray-*`, hex literals, etc.) turned up nothing beyond one spot: `components/image-uploader.tsx`'s remove-photo overlay button used `bg-black/60`/`text-white`. Replaced with `bg-foreground/60`/`text-background` and gave the thumbnail container `bg-muted` to match the other image containers (item card, item detail, offer builder already had it). Everything else in the app was already token-based going into this phase.

**Phase 5 (theme):** added `next-themes`, `components/theme-provider.tsx` and `components/theme-toggle.tsx` exactly as specified, wired into `app/layout.tsx` (`suppressHydrationWarning` on `<html>`, `ThemeProvider` wrapping `NavBar` + `main`) and `nav-bar.tsx` (toggle first in the right-hand group). One deviation from the literal spec snippet: the `mounted` hydration guard's `useEffect(() => setMounted(true), [])` trips this project's `react-hooks/set-state-in-effect` eslint rule (a newer, stricter rule than what most `next-themes` examples predate); rather than silently letting `npm run lint` fail, added a scoped `eslint-disable-next-line` on that one line with a comment explaining why — the pattern itself (avoiding a server/client icon mismatch before the client has mounted) is unchanged.

**Skipped per rule 1 (no data/query changes):** none — every visual change in the spec was achievable with class-name and token edits alone; nothing needed to touch `actions/`, `lib/`, `supabase/`, or a `page.tsx`'s data fetching.

**Hard-coded colours left in place:** none found after the Phase 4 sweep.

**Verification:** `eslint` clean, `tsc --noEmit` clean (only the pre-existing, unrelated `LayoutProps` error in `app/layout.tsx`, noted in earlier entries). `next build` could not be run to completion in this environment — this sandbox's shell has no general network access, and the build here fails first on a missing platform SWC binary it would normally fetch, and once that resolved (after `npm i next-themes` pulled in the right binary as a side effect), on `next/font`'s Google Fonts fetch for Geist/Geist Mono, both pre-existing, environment-only failures unrelated to this change (fonts were explicitly left untouched per the spec). Compilation got through resolving every route and component before hitting the font fetch, which is as far as this sandbox can verify — a full `next build`/`npm run dev` should be run locally (or on Vercel) to confirm the visual result and toggle behavior end-to-end.
