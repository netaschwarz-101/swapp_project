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
