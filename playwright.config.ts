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
  fullyParallel: false, // the trade-flow spec uses two contexts against
  // shared demo data — parallel runs would race each other.
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
