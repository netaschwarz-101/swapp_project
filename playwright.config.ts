import { defineConfig, devices } from "@playwright/test";

// E2E tests need a real Supabase project — this sandbox has no network
// path to supabase.co (same constraint documented for scripts/seed.ts),
// so these are written and typechecked here but have to be *run* against
// your own project locally, exactly like the seed script. See
// docs/test-plan.md for what each spec covers and README.md for how to
// run them.
//
// No `webServer` block here on purpose: Next 16's dev server refuses to
// start a second instance for the same project directory (its own
// single-instance lock), which fights with Playwright's own "start it if
// nothing's listening yet" logic when a `next dev` is already running in
// another terminal — exactly the normal way to work on this project.
// Simpler and more predictable to just require `npm run dev` to already
// be running before `npm run test:e2e` (see README.md), rather than have
// Playwright try to manage it.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // no test within a single file runs concurrently
  // with another test in that same file.
  // `workers: 1` (below) is what actually matters here, though:
  // `fullyParallel: false` alone only serializes tests *within* one spec
  // file — Playwright still runs different spec files in parallel workers
  // by default. Every spec logs in as one of three fixed demo accounts
  // (DEMO_EMAIL_A/B/C, tests/e2e/helpers.ts) rather than a fresh account
  // per test, so two spec files racing on the same account (e.g.
  // full-trade-flow.spec.ts and unauthorized-access.spec.ts both using A)
  // is a real source of flaky failures, found by actually running this
  // with the default worker count. One worker trades speed for a run
  // that can't self-interfere — fine at this suite's size (13 tests).
  workers: 1,
  retries: 0,
  reporter: "list",
  // Default per-test timeout is 30s. Bumped here because of something
  // found by actually running this suite against `next dev`: a trade
  // action (e.g. confirmCompleteTrade's revalidatePath calls) can leave
  // the UI showing a legitimately-pending button while Next's own dev
  // tools indicator still reads "Rendering ..." — Turbopack recompiling
  // on demand, not the app hanging. Production (`next build && next
  // start`) doesn't pay this cost, but the suite should also tolerate a
  // slow dev-mode run rather than fail on compile latency.
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    // "on-first-retry" needs retries > 0 to ever fire, and retries is 0
    // above, so nothing was being captured on failure. Capture regardless
    // of retries — a screenshot of what actually rendered is the fastest
    // way to tell "wrong port / nothing there" apart from "page loaded but
    // the app showed something unexpected".
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
