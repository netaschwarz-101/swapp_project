import { expect, type Page } from "@playwright/test";
import path from "node:path";

// These E2E specs run against a real Supabase project (see
// playwright.config.ts and README.md) — they use the seeded demo
// accounts from scripts/seed.ts by default (`npm run seed` must have
// been run first) rather than signing up fresh users, because a fresh
// signUp() requires clicking a real confirmation email link, which an
// automated test has no way to do without a mailbox-reading service.
// Override with env vars to point at different accounts if needed.
export const DEMO_PASSWORD = process.env.SWAPP_TEST_PASSWORD ?? "SwappDemo123!";
export const DEMO_EMAIL_A = process.env.SWAPP_TEST_EMAIL_A ?? "maya@swapp.test";
export const DEMO_EMAIL_B = process.env.SWAPP_TEST_EMAIL_B ?? "danny@swapp.test";
export const DEMO_EMAIL_C = process.env.SWAPP_TEST_EMAIL_C ?? "noa@swapp.test";

export const TEST_IMAGE = path.join(__dirname, "fixtures", "test-photo.png");

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  // login() redirects to "/" (or ?next=) on success — waiting for the
  // nav bar's "Log out" button is a reliable "session established" signal
  // regardless of which page we land on.
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

/** Fills the Post Item form's Radix Selects + text fields and uploads
 * the shared 1x1 test fixture image, but does not submit — callers
 * submit and assert their own expected outcome. */
export async function fillItemForm(
  page: Page,
  overrides: { title: string; city?: string },
) {
  await page.getByLabel("Title").fill(overrides.title);
  await page.getByLabel("Description").fill("Posted by an automated test.");

  await page.getByLabel("Category").click();
  await page.getByRole("option", { name: "Electronics" }).click();

  await page.getByLabel("Condition").click();
  await page.getByRole("option", { name: "Used" }).click();

  await page.getByLabel("City").click();
  await page
    .getByRole("option", { name: overrides.city ?? "Tel Aviv" })
    .click();

  await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE);
  // Upload happens client-side against Supabase Storage before the
  // hidden image_urls input is populated — wait for the thumbnail
  // (an <img> inside the uploader's preview tile) rather than a fixed
  // timeout.
  await expect(page.locator('img[alt=""]').first()).toBeVisible();
}

/** Posts a fresh item via the UI and returns its id, parsed from the
 * post-create redirect URL (/items/[id]). Used to give trade-flow tests
 * their own deterministic items instead of depending on exactly what
 * `npm run seed` happened to generate this run. */
export async function postItem(
  page: Page,
  title: string,
  city?: string,
): Promise<string> {
  await page.goto("/items/new");
  await fillItemForm(page, { title, city });
  await page.getByRole("button", { name: "Post item" }).click();
  await expect(page).toHaveURL(/\/items\/([0-9a-f-]+)$/);
  const match = page.url().match(/\/items\/([0-9a-f-]+)$/);
  if (!match) throw new Error("Expected redirect to /items/[id]");
  return match[1];
}
