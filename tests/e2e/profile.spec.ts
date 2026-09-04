import { test, expect } from "@playwright/test";
import { DEMO_EMAIL_A, DEMO_PASSWORD, loginAs } from "./helpers";

test("a user can update their username and see it reflected in the nav bar, then revert it", async ({
  page,
}) => {
  await loginAs(page, DEMO_EMAIL_A, DEMO_PASSWORD);

  // The nav bar's link to /profile is the username itself
  // (components/nav-bar.tsx). Read the current one so this test can put
  // it back afterward — DEMO_EMAIL_A's account is reused by every other
  // E2E spec and by the user's own oral-defense screen-share, so this
  // shouldn't leave it renamed the way the old "E2E ..." test items were
  // left behind (docs/decisions.md, Phase 7 follow-up #3).
  const navProfileLink = page.locator('nav a[href="/profile"]');
  const originalUsername = (await navProfileLink.textContent())?.trim();
  if (!originalUsername) {
    throw new Error("Expected the nav bar to show a username");
  }

  const tempUsername = `e2e_pf_${Date.now().toString(36)}`;

  await page.goto("/profile");
  const usernameInput = page.getByLabel("Username");
  await usernameInput.fill(tempUsername);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Profile updated.")).toBeVisible();
  // Server Actions trigger a refresh of the current route's Server
  // Components (the nav bar lives in the root layout) — no navigation
  // needed to see it pick up the new value.
  await expect(navProfileLink).toHaveText(tempUsername);

  // Revert.
  await usernameInput.fill(originalUsername);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
  await expect(navProfileLink).toHaveText(originalUsername);
});
