import { test, expect } from "@playwright/test";
import { DEMO_EMAIL_A, DEMO_PASSWORD, loginAs } from "./helpers";

test("a user can view their profile, edit their username, and see it reflected everywhere, then revert it", async ({
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

  // The page's own username text (the view page's <p>) needs to be
  // scoped to <main> — the nav bar (in the root layout, outside <main>)
  // shows the same username as a link at the same time, so an unscoped
  // getByText(username) matches both and Playwright's strict mode
  // rejects the ambiguity.
  const mainContent = page.getByRole("main");

  // /profile is a read-only view by default — editing lives behind an
  // explicit "Edit profile" button, not on the page you land on.
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Profile" }),
  ).toBeVisible();
  await expect(mainContent.getByText(originalUsername)).toBeVisible();
  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page).toHaveURL(/\/profile\/edit$/);

  const usernameInput = page.getByLabel("Username");
  await usernameInput.fill(tempUsername);
  await page.getByRole("button", { name: "Save changes" }).click();

  // updateProfile redirects back to /profile on success (same pattern as
  // createItem/updateItem), rather than showing an inline message.
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByRole("heading", { name: "Profile" }),
  ).toBeVisible();
  await expect(mainContent.getByText(tempUsername)).toBeVisible();
  // Server Actions trigger a refresh of the current route's Server
  // Components (the nav bar lives in the root layout) — no extra
  // navigation needed to see it pick up the new value.
  await expect(navProfileLink).toHaveText(tempUsername);

  // Revert.
  await page.getByRole("link", { name: "Edit profile" }).click();
  await usernameInput.fill(originalUsername);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(mainContent.getByText(originalUsername)).toBeVisible();
  await expect(navProfileLink).toHaveText(originalUsername);
});
