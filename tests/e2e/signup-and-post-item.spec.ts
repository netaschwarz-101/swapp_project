import { test, expect } from "@playwright/test";
import { DEMO_EMAIL_A, DEMO_PASSWORD, loginAs, postItem } from "./helpers";

test.describe("signup", () => {
  test("submitting the signup form creates the account and asks for email confirmation", async ({
    page,
  }) => {
    // A fresh signUp() can't be carried further in an automated test —
    // Supabase requires clicking a real confirmation link before a
    // session exists, and this suite has no mailbox to read (see
    // helpers.ts). This test covers everything that *is* verifiable:
    // valid input is accepted and the expected next-step message shows.
    const unique = Date.now();
    await page.goto("/signup");
    await page.getByLabel("Username").fill(`e2e_test_${unique}`);
    await page.getByLabel("City").click();
    await page.getByRole("option", { name: "Haifa" }).click();
    await page.getByLabel("Email").fill(`e2e_test_${unique}@example.com`);
    await page.getByLabel("Password").fill("TestPassword123!");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(
      page.getByText(
        "Account created — check your email to confirm it, then log in.",
      ),
    ).toBeVisible();
  });

  test("rejects a password under 8 characters before submitting to Supabase", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.getByLabel("Username").fill("e2e_short_pw");
    await page.getByLabel("City").click();
    await page.getByRole("option", { name: "Haifa" }).click();
    await page.getByLabel("Email").fill("e2e_short_pw@example.com");
    const passwordInput = page.getByLabel("Password");
    await passwordInput.fill("short1");
    // The Input has minLength={8} + required — the browser's native
    // validation blocks submission client-side, before the Server
    // Action (and zod's own min(8) check) is ever reached.
    await expect(passwordInput).toHaveJSProperty("validity.tooShort", true);
  });
});

test.describe("post an item", () => {
  test("a logged-in user can post an item and see it on My Items", async ({
    page,
  }) => {
    await loginAs(page, DEMO_EMAIL_A, DEMO_PASSWORD);

    const title = `E2E test item ${Date.now()}`;
    await postItem(page, title);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.goto("/my-items");
    await expect(page.getByText(title)).toBeVisible();
  });
});
