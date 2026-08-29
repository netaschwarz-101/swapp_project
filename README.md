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

## Deployment

Deployed on Vercel, connected to this repo's `main` branch. The same three environment variables from step 3 above must be set in the Vercel project's Settings → Environment Variables.

## Testing

See `docs/test-plan.md` (added in Phase 6) for the test strategy, and run `npm test` (Vitest) / `npx playwright test` (E2E) once those are in place.
