import { test, expect, type Browser } from "@playwright/test";
import {
  DEMO_EMAIL_A,
  DEMO_EMAIL_B,
  DEMO_EMAIL_C,
  DEMO_PASSWORD,
  loginAs,
  postItem,
} from "./helpers";

async function loggedInPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, DEMO_PASSWORD);
  return { context, page };
}

test("a logged-out user is redirected off a protected route", async ({
  page,
}) => {
  await page.goto("/trades");
  await expect(page).toHaveURL(/\/login\?next=%2Ftrades/);
});

test("a logged-out user is redirected off /my-items and /items/new too", async ({
  page,
}) => {
  await page.goto("/my-items");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/items/new");
  await expect(page).toHaveURL(/\/login/);
});

test("a user cannot edit another user's item", async ({ browser }) => {
  const { context: ctxA, page: pageA } = await loggedInPage(
    browser,
    DEMO_EMAIL_A,
  );
  const { context: ctxB, page: pageB } = await loggedInPage(
    browser,
    DEMO_EMAIL_B,
  );

  const itemId = await postItem(pageA, `E2E not-your-item ${Date.now()}`);

  const response = await pageB.goto(`/items/${itemId}/edit`);
  expect(response?.status()).toBe(404);

  await ctxA.close();
  await ctxB.close();
});

test("a user who isn't a trade participant gets a clean 404, not a leaked row", async ({
  browser,
}) => {
  // Docs/decisions.md: RLS on `trades` restricts reads to
  // initiator_id/responder_id, and the page layers roleOf() -> notFound()
  // on top of that — this asserts both layers actually hold for a real
  // third party, not just "the button isn't shown."
  const { context: ctxA, page: pageA } = await loggedInPage(
    browser,
    DEMO_EMAIL_A,
  );
  const { context: ctxB, page: pageB } = await loggedInPage(
    browser,
    DEMO_EMAIL_B,
  );
  const { context: ctxC, page: pageC } = await loggedInPage(
    browser,
    DEMO_EMAIL_C,
  );

  const ts = Date.now();
  const itemBId = await postItem(pageB, `E2E third-party item ${ts}`);
  const ownItemTitle = `E2E third-party offer ${ts}`;
  await postItem(pageA, ownItemTitle);

  await pageA.goto(`/items/${itemBId}`);
  await pageA.getByRole("link", { name: "Offer a trade" }).click();
  await pageA
    .locator("label")
    .filter({ hasText: ownItemTitle })
    .getByRole("checkbox")
    .check();
  await pageA.getByRole("button", { name: "Send trade offer" }).click();
  // createTrade redirects to /trades/[id]/confirmed on success.
  await expect(pageA).toHaveURL(/\/trades\/([0-9a-f-]+)\/confirmed$/);
  const tradeId = pageA
    .url()
    .match(/\/trades\/([0-9a-f-]+)\/confirmed$/)?.[1];
  if (!tradeId) throw new Error("Expected redirect to /trades/[id]/confirmed");

  // C is logged in, but isn't A or B — visiting the trade directly must
  // 404, exactly like a logged-out or unrelated user would see.
  const response = await pageC.goto(`/trades/${tradeId}`);
  expect(response?.status()).toBe(404);

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});
