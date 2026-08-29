import { test, expect, type Browser } from "@playwright/test";
import {
  DEMO_EMAIL_A,
  DEMO_EMAIL_B,
  DEMO_EMAIL_C,
  DEMO_PASSWORD,
  loginAs,
  postItem,
} from "./helpers";

// Two logged-in browser contexts standing in for two real users, per
// docs/test-plan.md §4. Both users post a fresh item so this test never
// depends on exactly what npm run seed happened to generate.
async function loggedInPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, DEMO_PASSWORD);
  return { context, page };
}

test("full trade cycle: offer → accept → confirm complete", async ({
  browser,
}) => {
  const { context: ctxA, page: pageA } = await loggedInPage(
    browser,
    DEMO_EMAIL_A,
  );
  const { context: ctxB, page: pageB } = await loggedInPage(
    browser,
    DEMO_EMAIL_B,
  );

  const ts = Date.now();
  const titleA = `E2E offered item ${ts}`;
  const titleB = `E2E requested item ${ts}`;

  const itemAId = await postItem(pageA, titleA);
  const itemBId = await postItem(pageB, titleB);

  // A visits B's item and proposes a trade, offering their own fresh item.
  await pageA.goto(`/items/${itemBId}`);
  await pageA.getByRole("link", { name: "Offer a trade" }).click();
  await expect(pageA).toHaveURL(new RegExp(`/trades/new\\?item=${itemBId}`));

  // The "own items" checklist can include other seeded items for this
  // account too — scope to the <label> that wraps this specific item's
  // checkbox + title (components/offer-builder.tsx) rather than assuming
  // there's only one checkbox on the page.
  await pageA
    .locator("label")
    .filter({ hasText: titleA })
    .getByRole("checkbox")
    .check();
  await pageA.getByRole("button", { name: "Send trade offer" }).click();

  // createTrade redirects to /trades/[id]/confirmed on success.
  await expect(pageA).toHaveURL(/\/trades\/([0-9a-f-]+)\/confirmed$/);
  const tradeId = pageA
    .url()
    .match(/\/trades\/([0-9a-f-]+)\/confirmed$/)?.[1];
  if (!tradeId) throw new Error("Expected redirect to /trades/[id]/confirmed");

  await expect(
    pageA.getByRole("heading", { name: "Trade offer sent!" }),
  ).toBeVisible();

  // B accepts.
  await pageB.goto(`/trades/${tradeId}`);
  await expect(pageB.getByText("Pending")).toBeVisible();
  await pageB.getByRole("button", { name: "Accept" }).click();
  await expect(pageB.getByText("Accepted")).toBeVisible();

  // A confirms completion.
  await pageA.goto(`/trades/${tradeId}`);
  await pageA.getByRole("button", { name: "Confirm trade complete" }).click();
  await expect(pageA.getByText("Completed")).toBeVisible();

  // Both items are now marked traded and no longer offerable — see
  // complete_trade() in supabase/migrations/0005_trades.sql.
  await pageA.goto(`/items/${itemAId}`);
  // The badge's raw text is the lowercase status value ("traded") — the
  // capital "T" seen on screen is CSS text-transform: capitalize
  // (components/ui/badge usage in items/[id]/page.tsx), which changes how
  // the browser paints the text, not the actual DOM text node Playwright
  // matches against. Found by actually running this: the app was working
  // correctly the whole time, only this assertion's casing was wrong.
  await expect(pageA.getByText("traded", { exact: true })).toBeVisible();
  await expect(
    pageA.getByRole("link", { name: "Offer a trade" }),
  ).toHaveCount(0);

  await pageA.goto(`/items/${itemBId}`);
  await expect(pageA.getByText("traded", { exact: true })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

test("accepting one offer auto-cancels a competing pending offer for the same item", async ({
  browser,
}) => {
  // Reproduces the exact bug found in production (docs/decisions.md,
  // "trade accept conflict resolution"): two different users each offer
  // on the same item; the responder accepts one; the other must flip to
  // Cancelled immediately, not just once the accepted trade completes.
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
  const itemBId = await postItem(pageB, `E2E contested item ${ts}`);
  // A's and C's own item ids aren't referenced again — only their titles
  // are needed, to pick out the right checkbox in offerOn() below.
  await postItem(pageA, `E2E A's offered item ${ts}`);
  await postItem(pageC, `E2E C's offered item ${ts}`);

  async function offerOn(
    page: typeof pageA,
    responderItemId: string,
    ownItemTitle: string,
  ) {
    await page.goto(`/items/${responderItemId}`);
    await page.getByRole("link", { name: "Offer a trade" }).click();
    // Scope to the specific item's row, same reasoning as the first
    // test — the account may have other available items too.
    await page
      .locator("label")
      .filter({ hasText: ownItemTitle })
      .getByRole("checkbox")
      .check();
    await page.getByRole("button", { name: "Send trade offer" }).click();
    await expect(page).toHaveURL(/\/trades\/([0-9a-f-]+)\/confirmed$/);
    return page.url().match(/\/trades\/([0-9a-f-]+)\/confirmed$/)?.[1];
  }

  const tradeAId = await offerOn(pageA, itemBId, `E2E A's offered item ${ts}`);
  const tradeCId = await offerOn(pageC, itemBId, `E2E C's offered item ${ts}`);
  if (!tradeAId || !tradeCId) throw new Error("Expected two trade ids");

  // B accepts A's offer.
  await pageB.goto(`/trades/${tradeAId}`);
  await pageB.getByRole("button", { name: "Accept" }).click();
  await expect(pageB.getByText("Accepted")).toBeVisible();

  // C's competing offer must now show Cancelled, without C doing anything.
  await pageC.goto(`/trades/${tradeCId}`);
  await expect(pageC.getByText("Cancelled")).toBeVisible();

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});
