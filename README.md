# Swapp

A peer-to-peer barter marketplace, built with Next.js (App Router), TypeScript, and Supabase. See `docs/product-spec.md`, `docs/architecture.md`, and `docs/technical-design.md` for the full write-up of what this is and why it's built this way.

## Stack

Next.js 16 (App Router, Server Components + Server Actions) · TypeScript (strict) · Supabase (Postgres + Auth + Storage, Row Level Security on every table) · Tailwind CSS + shadcn/ui (Radix primitives) · zod validation · deployed on Vercel.

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then open **Project Settings → API** and copy the Project URL and anon (public) key.

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from step 2. `SUPABASE_SERVICE_ROLE_KEY` is only needed later for the seed script — find it on the same API settings page, under a "reveal" toggle since it bypasses Row Level Security. **Never commit `.env.local` or put the service role key in any client-side code.**

4. **Run the database migrations** — in the Supabase dashboard's SQL Editor, run each file in `supabase/migrations/` in order (`0001_...`, `0002_...`, …), or use the Supabase CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

5. **(Optional) Seed demo data**

   ```bash
   npm run seed
   ```

   Creates 5 demo users and ~40 items across cities/categories, so the feed and search have something real to show. Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (see step 3). Must be run from a machine with normal internet access, not this repo's sandboxed dev container if you're using one — the script talks directly to your Supabase project over the network. Safe to re-run; it cleans up the demo users it created last time first. Demo login: any of the printed `@swapp.test` emails, password `SwappDemo123!`.

6. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project structure

See `docs/technical-design.md §1` for the full folder layout and the rationale behind it.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run format` — Prettier (writes)
- `npm run format:check` — Prettier (check only, used in CI)
- `npm run seed` — populate demo users + items (see step 5 above)
- `npm test` — Vitest unit tests (pure logic, no network — runs anywhere)
- `npm run test:watch` — Vitest in watch mode
- `npm run test:e2e` — Playwright E2E tests (needs a running app + real Supabase project, see Testing below)

## Deployment

Deployed on Vercel, connected to this repo's `main` branch. The same three environment variables from step 3 above must be set in the Vercel project's Settings → Environment Variables.

## Testing

See `docs/test-plan.md` for the full strategy (per-feature happy path / invalid inputs / permission checks / state-machine violations / edge cases) and `docs/manual-tests.md` for what isn't automated.

**Unit tests** (`tests/unit/`, Vitest) — pure logic only, no network, run anywhere:

```bash
npm test
```

**End-to-end tests** (`tests/e2e/`, Playwright) — need a real Supabase project with the migrations applied and demo data seeded (steps 2–5 above), since this exercises real RLS policies and Server Actions, not mocks. Playwright does **not** start the dev server itself (Next won't run two `next dev` instances for the same project, which fights with Playwright's own auto-start logic) — start it yourself first, in a separate terminal:

```bash
npm run seed        # if you haven't already — the specs log in as these demo accounts
npm run dev          # in one terminal, leave it running
npm run test:e2e     # in another terminal
```

By default the specs use the seeded `maya@swapp.test` / `danny@swapp.test` / `noa@swapp.test` accounts (password `SwappDemo123!`). Override with `SWAPP_TEST_EMAIL_A` / `_B` / `_C` and `SWAPP_TEST_PASSWORD` env vars if you're pointing at different accounts. Each spec creates its own uniquely-titled items at run time, so it's safe to run repeatedly without cleaning up between runs.
