import { defineConfig, devices } from "@playwright/test";

// E2E tests need a real Supabase project — this sandbox has no network
// path to supabase.co (same constraint documented for scripts/seed.ts),
// so these are written and typechecked here but have to be *run* against
// your own project locally, exactly like the seed script. See
// docs/test-plan.md for what each spec covers and README.md for how to
// run them.
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
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
