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

## Phase 4 follow-up #3 — trade detail page: clearer offered/requested layout (2026-08-29)

**Problem, reported after a live end-to-end trade test finally succeeded:** the offered and requested item cards sat in a plain 2-column grid with small, same-weight headers, so the two sides were hard to tell apart at a glance.

**Fix, `app/(protected)/trades/[id]/page.tsx` only** (no data/query/type changes): each side is now a bordered panel (`rounded-xl border p-4`), with the "Offered" panel additionally getting a `bg-muted/40` fill so the two read as visually distinct cards rather than one continuous grid — kept within the project's existing neutral/grayscale theme tokens (`border`, `bg-muted`, `text-muted-foreground`) instead of introducing new colors, to stay consistent with the rest of the app. Headers changed from a single `text-sm font-medium` line to a two-line header: a small uppercase label ("Offered"/"Requested") plus a bold `text-lg` line naming the counterpart. A centered arrow badge sits between the two panels — `ArrowDown` on mobile (stacked layout), `ArrowRight` at `sm:` and up (side-by-side) — as an explicit "this flows into that" visual cue. Grid layout moved from `sm:grid-cols-2` to `sm:grid-cols-[1fr_auto_1fr]` to make room for the arrow column, with spacing increased (`gap-4`/`sm:gap-8` vs the previous flat `gap-6`). `ItemCard` itself was left untouched; only the layout around it changed.

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 13 routes, including `/trades/[id]`.

---

## Phase 4 follow-up #4 — trade accept conflict resolution (2026-08-29)

**Design gap, found via a real 3-account test:** two different users (`neta`, `noa_haifa`) each had a `pending` trade requesting the same item from the same responder (`danny_jlm`). Danny accepted `noa_haifa`'s offer. `technical-design.md` §3.1, as originally written, only ever auto-cancels conflicting trades inside `complete_trade()` — i.e. once the *accepted* trade is fully completed. Between "accepted" and "completed," nothing touched the competing trade at all: it stayed `pending`, with a live Cancel button, looking exactly as if nothing had happened — even though the item was, in practice, already promised to someone else. This was a real gap in the original design, not an implementation slip — the doc's own reasoning for deferring conflict resolution to completion only ever considered crash-safety of that one step, not the window before it.

**Fix:** `0008_trade_accept_conflict_resolution.sql` adds `accept_trade()`, a `SECURITY DEFINER` function (same pattern as `complete_trade()`), called from `acceptTrade` in `actions/trades.ts` instead of a plain `.update()`. On accept, it now: (1) refuses outright if any item in this trade is already locked into a *different* `accepted_by_responder` trade, so a second accept can never silently steal an already-committed item; (2) on success, cancels every other still-`pending` trade referencing any of the same items, immediately — not deferred to completion. `technical-design.md` §3.1 updated to document `accept_trade()` alongside `complete_trade()`, and to note that `complete_trade()`'s own conflict-cancel step (still kept, unchanged) is now mostly a backstop for edge cases `accept_trade` doesn't cover (e.g. an item offered — not requested — in another still-pending trade).

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 13 routes. Not yet re-tested against the live database with this specific 3-account scenario — that's the next thing to verify once this migration is applied.

**Needs manual cleanup once:** the live database currently has `neta`'s trade sitting `pending` against an item already committed via `noa_haifa`'s accepted trade — a state this fix prevents going forward but doesn't retroactively repair. See the message alongside this commit for one-off cleanup SQL.

---

## Phase 4 follow-up #5 — trade action errors shown inline, not as a crash page (2026-08-29)

**Found immediately after #4 shipped, via a real test:** with two users' items already committed to an accepted trade, a third trade was created re-offering the same items (reversed roles) and then accepted — which `accept_trade()` correctly rejects (`0008`'s "already committed to another accepted trade" check working exactly as designed). But the rejection surfaced to the user as a generic "Something went wrong!" page, not a clear message.

**Root cause:** `components/trade-actions.tsx`'s Accept/Decline/Cancel/Confirm-complete buttons were plain `<form action={() => acceptTrade(tradeId)}>` submissions. `actions/trades.ts` reports failure for all four by throwing an `Error` (not returning a `{ error }` state like `createTrade` does) — and a thrown error from a plain form action has nowhere to go but React's nearest error boundary, which is the generic crash screen. The rejection itself was correct; only its presentation was broken.

**Fix:** `trade-actions.tsx` now calls each Server Action directly from a `useTransition`-wrapped `onClick` handler instead of a form submission, with a `try/catch` that stores any thrown message in local state and renders it inline (`text-destructive`, same pattern `createTrade`'s form already uses) above the buttons. `useFormStatus`/`SubmitButton` (which requires a real `<form>`) no longer applies here, so pending state is tracked via `useTransition`'s own `isPending` instead — buttons disable and show "Accepting…"/"Completing…" the same as before.

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 13 routes.

---

## Phase 5 — Messaging (2026-08-29)

**Decision:** a `messages` table + RLS, a chat thread embedded directly in the trade detail page (not a separate route or a general inbox), sent via a Server Action, refreshed by polling every 5 seconds while the trade's still live — exactly the shape called for in the work plan and already sketched in `docs/technical-design.md`'s schema section.

**Polling, not Realtime, on purpose.** `components/trade-chat.tsx` refetches messages every 5s with a plain `setInterval` using the browser Supabase client (`lib/supabase/client.ts`), rather than a Supabase Realtime subscription. A course-scale trade thread between two people doesn't need sub-second delivery, and polling keeps the app on one request/response model throughout instead of introducing a second connection type (websockets) just for this feature. `docs/scale.md` (Phase 7) will note Realtime as the documented upgrade path if this ever needed to feel instant. Polling only runs while the trade is still live (`disabled` prop) — a terminal trade's history can't change, so there's nothing to refresh.

**Enforced in both the DB and the UI that a terminal trade can't be messaged**, same double-layer pattern as everywhere else in this app: `0009_messages.sql`'s insert policy requires `t.status not in ('completed', 'declined', 'cancelled')` in addition to participant + `sender_id = auth.uid()` checks, and `trade-chat.tsx` also hides the input and shows "This trade is no longer active" when `!canSendMessage(status)` (`lib/trade-machine.ts`, already existed from Phase 4's state machine — nothing new needed there). Even if the UI check were ever wrong, the RLS policy is the real backstop.

**No separate authorization/state pre-check in `sendMessage`, unlike `createTrade`/`acceptTrade`.** Sending a message is a single insert with exactly one rule ("participant, live trade, posting as yourself") — that's precisely what the RLS insert policy already expresses in one place, so duplicating it as a second application-level check would just be the same logic twice for no extra safety, unlike the trade actions where the pre-check gives a specific, friendlier error before ever reaching the DB.

**Messages are immutable — no edit or delete.** Not in the work plan's scope, and deliberately so: letting either side quietly rewrite what they said would undermine the one thing a negotiation thread is for — an honest record both people can trust.

**Errors shown inline**, following the pattern just established for trade actions (`components/trade-actions.tsx`): `sendMessage` throws, `trade-chat.tsx` catches it in a `useTransition`-wrapped handler and renders the message inline rather than crashing to Next's default error boundary.

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 13 routes (messaging lives inside the existing `/trades/[id]` page — no new route).

**Not yet exercised against a live database** — needs a real two-account test (send from both sides, confirm polling picks up the other person's message within 5s, confirm input disables once a trade reaches a terminal state) once this migration is applied.

---

## Phase 6 — Test plan + tests (2026-08-29)

**Decision:** `docs/test-plan.md` (per assignment §6, per-feature: happy path, invalid inputs, permission checks, state-machine violations, edge cases, DB integrity, basic UI checks), Vitest unit tests for all pure logic, Playwright E2E specs for the real flows, and `docs/manual-tests.md` for what's left over — matching the work plan's Phase 6 shape exactly.

**Found and documented a real gap while writing the test plan, not new scope from this phase:** `/profile` and `updateProfile` are described in `docs/technical-design.md` as already built, but neither exists — the route folder is empty, there's no Server Action, and the nav bar links to a dead route. `lib/validation/profile.ts`'s `profileUpdateSchema` and the RLS policy that would back it (`0001_profiles.sql`) were both already in place, unused. Excluded from this test plan and flagged directly in `technical-design.md` §4/§5 rather than quietly built now — see the earlier discussion in this session: with 8 days to the deadline and Phases 6/7 (this phase, and security/scale docs) being graded assignment requirements, expanding scope to build a missing feature mid-test-writing was deliberately deferred rather than done reflexively.

**Vitest covers pure logic only — no database, no network.** `tests/unit/trade-machine.test.ts` exhaustively covers every `(status, role)` combination each guard in `lib/trade-machine.ts` can be asked about (not just the happy path — every non-pending status is asserted `false` for `canAccept`, etc.), plus `roleOf()`'s non-participant case. `tests/unit/validation.test.ts` covers every zod schema in `lib/validation/`, valid input and every invalid-input case called out in the test plan, including boundary cases (exactly 1000 characters accepted, 1001 rejected) and one deliberately-documented gap (`createTradeSchema` can't check "not trading with yourself" — that needs the authenticated caller's id, which the schema doesn't have; the Server Action checks it instead). 49 tests, all green — `npm test`.

**Playwright specs are written and syntax-verified here (`npx playwright test --list` enumerates all 13 without error), but can't actually run in this sandbox** — same constraint as `scripts/seed.ts`: no network path to `supabase.co`. Run them yourself with `npm run test:e2e` once `npm run dev` and a seeded database are both available locally. They log in as the seeded demo accounts (`scripts/seed.ts`) rather than signing up fresh, because a fresh `signUp()` requires clicking a real confirmation email link that an automated test has no way to click without a mailbox-reading service — the signup spec instead verifies everything that *is* checkable: valid input is accepted and the right "check your email" message shows.

**`playwright.config.ts` deliberately has no `webServer` block, found via a real run.** The first version auto-started `next dev` if nothing was listening on port 3000, `reuseExistingServer: true` to reuse it otherwise. In practice, with a `next dev` already running in another terminal (the normal way to work on this project), Playwright's reuse check didn't reliably short-circuit before it tried to spawn a second `next dev` — which Next 16 refuses to do for the same project directory (its own single-instance lock), producing "Another next dev server is already running" and failing the whole run. Removed the auto-start entirely rather than fight Playwright/Next's interaction here: `npm run dev` must already be running in its own terminal before `npm run test:e2e` (documented in `README.md`) — simpler and more predictable than relying on detection that didn't hold up.

**The trade-flow specs create their own fresh items at run time instead of depending on exactly what `npm run seed` generated.** Seed data is randomized per run (`scripts/seed.ts`'s templates), so hardcoding an expected item title would make the tests fragile to reseeding; posting a uniquely-titled item via the UI at the start of each spec keeps them self-contained and deterministic regardless of what's already in the database.

**`full-trade-flow.spec.ts`'s second test reproduces the exact conflict-resolution bug found live** (`docs/decisions.md`, "trade accept conflict resolution"): two users each offer on the same item, the responder accepts one, and the test asserts the other flips to Cancelled immediately — the real scenario that was manually debugged earlier in this project, now pinned down as a regression test.

**`unauthorized-access.spec.ts` tests RLS through the app, not around it** — a third participant is denied with an actual HTTP 404 on `/trades/[id]` and `/items/[id]/edit`, checked via the navigation response's status code rather than just "the button isn't visible," which is closer to what the assignment's permission-check requirement (§6: "test via direct Supabase client with A's JWT") is actually getting at, applied through the real UI instead of a raw Supabase client call.

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 13 routes (no new routes — tests aren't part of the app bundle); `npm test` (Vitest) — 49/49 passing; `npx playwright test --list` — all 13 E2E tests parse and enumerate correctly.

**Not yet run:** the Playwright suite itself, which needs to be executed locally against a real Supabase project and a running dev server — see `README.md` for the exact commands.

---

## Phase 6 follow-up — Playwright/Supabase local-run debugging, and adopting a locally-authored visual pass (2026-08-29)

**Debugging the E2E run.** Once the dev-server-conflict and missing-browser-binary issues (previous entry) were fixed, 11 of the 13 E2E tests still failed — both authenticated pages (`/login`) and a fully public page (`/search`) failed identically, which pointed at something shared by every route rather than a bug in any one feature. `playwright.config.ts`'s `use` block was updated to capture a screenshot and a trace on every failure regardless of retry count (it was set to `trace: "on-first-retry"` with `retries: 0`, so nothing was ever actually captured) — a durable improvement to the test setup independent of this specific bug, since "what did the browser actually see" beats guessing from a timeout message.

**Root cause: a `next build` failure, not a test or environment bug.** The dev server run against wasn't serving the app at all — every route was failing to compile with `Module not found: Can't resolve 'next-themes'`. `app/layout.tsx` on the local machine referenced a `ThemeProvider` from `components/theme-provider.tsx`, which imports `next-themes`, a package never added to `package.json`. Since `proxy.ts` (Next 16's renamed `middleware.ts`) runs on every non-static request, and the build itself was broken, *every* page — public or protected — failed the same way, which is exactly the symmetric failure pattern that gave this away once screenshots were available to look at.

**Where this came from: a visual design pass done outside this project's normal workflow.** Comparing the local project against what's tracked here turned up three new files (`components/theme-provider.tsx`, `components/theme-toggle.tsx`, `components/ink-block.tsx` — a dark-mode toggle plus a decorative colored-accent wrapper used behind item cards and trades needing action) and edits to `nav-bar.tsx`, `item-card.tsx`, `image-uploader.tsx`, `ui/badge.tsx`, `ui/button.tsx`, `ui/card.tsx`, `globals.css`, `layout.tsx`, `page.tsx`, `search/page.tsx`, and `trades/page.tsx` (pill-shaped buttons/badges, larger card radius, new `--ink-warm/cool/olive/success` theme tokens, alternating accent tones on the feed grid, a "needs your action" accent on the trades list) — none of which had been built in this project's own sessions. Asked directly whether to keep or revert it: kept, since it's a real, coherent piece of work and the only thing actually broken was the missing dependency.

**What was verified before adopting it:** the design follows the codebase's existing conventions correctly — Tailwind v4 theme tokens added the same way the rest of `globals.css` already does it (light + dark values, registered in `@theme inline`), the dark-mode toggle uses the standard `next-themes` hydration-mismatch guard (`mounted` state gate, `suppressHydrationWarning` on `<html>`), and none of it touches data, auth, or trade logic — purely presentational. `next-themes@^0.4.6` added to `package.json`. Confirmed the new `ThemeToggle` button (`aria-label="Toggle theme"`) doesn't collide with any existing Playwright `getByRole("button", { name: ... })` query — all of those match on specific button text, none on "Toggle theme".

**Verification:** `eslint` clean; `tsc --noEmit` clean; full `next build` compiles all 13 routes; `npm test` (Vitest) — 49/49 passing.

**Not yet confirmed:** that this was in fact the only cause of the 11 E2E failures — next step is rerunning `npm run test:e2e` locally now that `npm install` will pull in `next-themes` and the build succeeds.

---

## Phase 6 follow-up #2 — the remaining 5 E2E failures, diagnosed one by one (2026-08-29)

With the build fixed, 8/13 passed on the next run. The remaining 5 were three unrelated causes, found by actually looking at what each test saw rather than guessing from the error message alone — a screenshot and a Playwright trace are captured on every failure now (previous entry), which is what made this possible without re-running anything blind.

**Cause 1 — `workers: 1` needed to be added to `playwright.config.ts`.** Every spec logs in as one of three fixed demo accounts (`DEMO_EMAIL_A/B/C`, `tests/e2e/helpers.ts`) rather than a fresh account per test. `fullyParallel: false` (already set) only stops tests *within one spec file* from overlapping — Playwright still runs different spec files in parallel workers by default (the actual run used 4). `full-trade-flow.spec.ts` and `unauthorized-access.spec.ts` both use the same accounts and were very likely racing each other, most plausibly explaining the two `full-trade-flow.spec.ts` failures (a stalled "Confirm trade complete" and an offer that never navigated). `workers: 1` forces the whole suite to run one test at a time — the right tradeoff at 13 tests, where correctness matters far more than a few extra seconds of runtime.

**Cause 2 — the two `unauthorized-access.spec.ts` failures (expected HTTP 404, got 200) were confirmed to be a `next dev` reporting quirk, not a real permission bug.** Rather than assume either way, the actual screenshots Playwright saved for each of the three browser contexts in the "not a trade participant" test were pulled from the user's machine and inspected directly: the participant's own tab correctly showed the real trade (expected), and the non-participant's tab (`noa_haifa`, logged in, no relation to the trade) showed a genuine "404 — This page could not be found" page. The application-level check (`roleOf()` → `notFound()` in `trades/[id]/page.tsx`, and the owner check in `items/[id]/edit/page.tsx`) is working correctly — Next 16's Turbopack dev server is just returning the wrong HTTP status code alongside the right rendered content. Confirmed as a dev-only artifact rather than "fixed", since there was nothing wrong in the app to fix; flagged for the user to double check once against a `next build && next start` production run before the deadline, since that's what Vercel actually serves.

**Cause 3 — the signup test's placeholder email domain, `@example.com`, is rejected outright by Supabase's `signUp()`** ("Email address ... is invalid"), before the account is even created — unrelated to the "Confirm email" project setting, which was already correctly enabled. Confirmed by checking `lib/validation/profile.ts`: the app's own zod schema error is "Enter a valid email address", a different message than what appeared on screen, so the rejection was coming from Supabase's API itself, not our validation. Fixed by switching the test to `@swapp.test` — the same placeholder domain the seeded demo accounts already use successfully (`scripts/seed.ts`), so it's known to clear whatever check Supabase applies (most likely a small denylist of well-known placeholder domains like `example.com`/`example.org`, rather than a general reserved-TLD block, since `.test` is also RFC 2606-reserved and yet the demo accounts work fine).

**A real, separate bug surfaced along the way, unrelated to any test:** signup confirmation emails were landing users on the bare site homepage instead of actually confirming their account. Root cause is a well-known Supabase pitfall — `emailRedirectTo` (set in `actions/auth.ts` to `${origin}/auth/confirm`) is silently ignored and Supabase falls back to the project's Site URL if the target URL isn't on the **Redirect URLs** allowlist in Supabase's dashboard (Authentication → URL Configuration) — separate from the Site URL field itself. This isn't something code can fix; it needs `http://localhost:3000/auth/confirm` (and, once deployed, `https://<vercel-domain>/auth/confirm`) added to that allowlist. `app/auth/confirm/route.ts` itself was re-read and is correct as written.

**Verification:** `eslint` clean; `tsc --noEmit` clean; `npx playwright test --list` — all 13 tests still enumerate correctly after the domain fix.

**Not yet re-run:** the full suite, with `workers: 1` and the `@swapp.test` fix both in place — expected to bring it to close to 13/13, modulo confirming the Redirect URLs fix and re-checking the two dev-mode-flagged tests against a production build.

---

## Phase 6 follow-up #3 — re-run with workers:1 still showed 5 failures; each one individually confirmed, not guessed (2026-08-29)

Re-running with `workers: 1` still produced the same 5 failures — proof the earlier "worker race" theory was wrong for at least the two `full-trade-flow.spec.ts` tests. Rather than keep guessing, the actual screenshots and accessibility-tree snapshots (`error-context.md`) Playwright saved were pulled and inspected directly for every failure, one at a time.

**The two `unauthorized-access.spec.ts` failures**: re-confirmed as the dev-mode status-code artifact from the previous entry — `noa_haifa`'s screenshot again shows a genuine "404 — This page could not be found" page, not the trade's real content. No change needed.

**The two `full-trade-flow.spec.ts` failures are dev-server compile latency, not an app bug.** The "confirm trade complete" test's accessibility snapshot at the moment of timeout shows the "Confirm trade complete" button stuck reading "Completing…" (disabled — a legitimate pending `useTransition`) *and*, in the same snapshot, Next's own dev-tools indicator reading "Rendering …" — Turbopack was still mid-compile when the test gave up waiting. `confirmCompleteTrade` (`actions/trades.ts`) does three `revalidatePath` calls plus one RPC; in `next dev`, each of those can trigger an on-demand recompile, and with two browser tabs open polling `TradeChat` every 5s in the background for the whole test, the dev server has more concurrent load than a single interactive session would. Rather than debug Turbopack's dev-mode scheduling, `playwright.config.ts` now sets `timeout: 60_000` (the effective default is 30s) — first because this kind of latency is specific to `next dev` and doesn't reflect what users experience on `next build && next start`/Vercel, and second because a fixed 60s ceiling still catches a genuinely broken action, it just stops treating "dev server is momentarily busy" as a hard failure.

**The signup test failure changed shape entirely** — this run's actual error was "email rate limit exceeded," not the domain-validation error from before. Confirms the `@swapp.test` domain fix from the previous entry was correct; the new failure is Supabase's own default mailer quota being used up by the several real signups this test has now triggered in one session (its default SMTP allows only a handful of sends per hour — a known Supabase limitation, not a bug here). Not something to "fix" in code; resolves on its own once the hour-window resets, or once/if the project moves to custom SMTP (out of scope pre-deadline).

**Verification:** `eslint` clean; `tsc --noEmit` clean.

**Recommended before the deadline, not yet done:** one clean run of the full suite against a production build (`npm run build && npm run start`, not `npm run dev`) once the Supabase email rate limit has had time to reset — production mode removes Turbopack recompilation entirely, which should settle both the two dev-mode-only failure classes (404 status code, compile-latency timeouts) at once, leaving only genuine app bugs (if any) visible.

---

## Phase 6 follow-up #4 — the 60s timeout fix worked; one last real bug found, in a test's own assertion (2026-08-29)

Next run (still against `next dev`, not yet a production build): the `timeout: 60_000` fix from the previous entry worked — "accepting one offer auto-cancels…" now passes cleanly (41.1s, well inside the new budget), and "full trade cycle" got all the way past "Confirm trade complete" this time (no longer stuck on "Rendering…"), landing on a *new*, different failure. The two `unauthorized-access.spec.ts` tests were re-checked with fresh screenshots from this exact run — `danny_jlm`'s and `noa_haifa`'s tabs both still show a genuine 404 page — reconfirming that pair as the dev-mode status-code quirk, not a bug, for the third time running.

**The new failure was a real bug — in the test, not the app.** `full-trade-flow.spec.ts` asserted `getByText("Traded", { exact: true })` after completing a trade, and it failed even though the screenshot at that exact moment clearly shows the item correctly marked traded. Root cause: `items/[id]/page.tsx` renders the status badge as `<Badge className="capitalize">{item.status}</Badge>` — `item.status` is the raw lowercase enum value (`ITEM_STATUSES` in `lib/constants.ts`: `"available" | "traded" | "deleted"`), and Tailwind's `capitalize` class only changes how the browser *paints* the text (CSS `text-transform`), not the actual text node in the DOM. Playwright's `getByText` matches real DOM text, so it was looking for a literal "Traded" that never existed — the app was working correctly the entire time. Fixed by matching the real lowercase value, `getByText("traded", { exact: true })`, in both places this spec checks it.

**Verification:** `eslint` clean; `tsc --noEmit` clean; `npx playwright test --list` — all 13 tests still enumerate correctly.

---

## Phase 6 follow-up #5 — bigger trade status badge, and a dedicated "offer confirmed" page (2026-08-29)

Two UX fixes requested directly, independent of the E2E work above (done in the meantime, while the Supabase email rate limit from the previous entries clears): the trade status indicator was too small/easy to miss, and finishing "Send trade offer" dropped the sender straight onto the trade detail page — a busy screen with chat, action buttons, and both parties' items — with no explicit "this worked" moment.

**Bigger, bolder `TradeStatusBadge` (`components/trade-status-badge.tsx`).** Added `className="px-3 py-1 text-sm font-semibold tracking-wide"` on top of the existing `variant` prop, rather than changing the base `Badge` component (`components/ui/badge.tsx`) itself. `Badge` is also used for the item-availability tag on item cards and item detail pages (`className="capitalize"`, small and inline by design there) — enlarging it globally would have made those tags oversized too, for a case that didn't ask for it. `cn()` (`lib/utils.ts`) uses `tailwind-merge`, so the passed-in `text-sm`/`px-3 py-1` correctly override the base variant's `text-xs`/`px-2 py-0.5` rather than conflicting with them. This automatically covers both places `TradeStatusBadge` is used — the trades list and the trade detail page header — with one change.

**New route: `app/(protected)/trades/[id]/confirmed/page.tsx`.** `createTrade` (`actions/trades.ts`) now redirects here instead of straight to `/trades/${trade.id}` after a successful offer. Asked the user directly what "redirect to home page" should actually mean (a literal `/` redirect loses useful context right when someone most wants confirmation that the offer actually sent); their answer was more specific than either option offered — a dedicated confirmation screen, visually matching the "Propose a trade" page, with a "Back to homepage" button positioned where the status badge would otherwise sit. Built to match: same `mx-auto max-w-xl` container and section headings as `components/offer-builder.tsx`, and the same item-row treatment (thumbnail + title + category/condition line) copied in as a local `ItemRow` rather than imported — `offer-builder.tsx` is a `"use client"` module, and importing from it would have pulled an unnecessary client boundary into this otherwise fully server-rendered page. The "Back to homepage" button sits top-right in the header row, the exact position `TradeStatusBadge` occupies on the trade detail page. A secondary "View trade details" link is included underneath so the confirmation isn't a dead end if the sender wants to check on it later. The page re-applies the same participant guard as the trade detail page (`roleOf()` → `notFound()`) rather than trusting that only the trade's own creator will ever land here — someone could still reach the URL directly.

**Test updates required as a direct consequence.** Both `tests/e2e/full-trade-flow.spec.ts` (the "full trade cycle" test and the `offerOn` helper used by the "competing offer" test) and `tests/e2e/unauthorized-access.spec.ts` (the "not a trade participant" test) captured the newly-created trade's id by matching the post-redirect URL with `/\/trades\/([0-9a-f-]+)$/` — that pattern no longer matches now that the URL ends in `/confirmed`. Updated all three to `/\/trades\/([0-9a-f-]+)\/confirmed$/`. The "full trade cycle" test's `await expect(pageA.getByText("Pending")).toBeVisible()` right after offer creation also had to move — the sender is on the confirmation page at that point, not the trade detail page, so it doesn't show a status badge at all. Replaced with an assertion on the confirmation page's own heading ("Trade offer sent!"), and re-added the "Pending" check immediately after `pageB.goto(`/trades/${tradeId}`)`, so the pending-state coverage isn't lost, just moved to where that state is actually visible.

**Verification:** `eslint` clean on all changed/new files; `tsc --noEmit -p tsconfig.json` clean; full `next build` (with the usual temporary font-stub of `app/layout.tsx`, restored immediately after) compiles all 14 routes, including the new `/trades/[id]/confirmed`; `npm test` (Vitest) — 49/49 passing. E2E execution itself still needs a real Supabase project and can't run from this sandbox — left for the user's next local run, alongside the still-pending full-suite confirmation from the earlier entries.

**Where things stand:** of the original 5 failures from follow-up #3, one is fixed for real (the "Traded" casing bug above), one resolved itself once `workers:1` + the longer timeout were in place (the competing-offer test), two are confirmed non-issues specific to `next dev` (the unauthorized-access status codes — the "Confirm trade complete" timeout from follow-up #3 may well have been the same class of issue, since this run got past it cleanly with more time budgeted), and one (signup) is purely waiting on Supabase's hourly email quota to reset. No further code changes are expected to be needed — next step is simply one more full run once the email quota clears, ideally against `npm run build && npm run start` to settle the two dev-mode-flagged tests definitively rather than by inference.
