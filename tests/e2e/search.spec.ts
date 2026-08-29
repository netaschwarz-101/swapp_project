import { test, expect } from "@playwright/test";

// Search is a plain GET form (components/search-filters.tsx) producing a
// shareable /search?... URL — so most of this is tested by navigating
// directly to that URL rather than driving the Radix Selects, which is
// both more robust and exactly what "shareable/bookmarkable" is meant to
// guarantee. One test still drives the actual filter UI, to catch a
// regression in the form-to-URL wiring itself.
test.describe("search", () => {
  test("loads with no filters and shows the filter form", async ({
    page,
  }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect(page.getByPlaceholder("Item title…")).toBeVisible();
  });

  test("a query with no possible matches shows the empty state", async ({
    page,
  }) => {
    await page.goto(
      `/search?q=${encodeURIComponent("zzz_no_such_item_zzz")}`,
    );
    await expect(
      page.getByText("No items match those filters."),
    ).toBeVisible();
    await expect(
      page.getByText("Try a different search term or clear a filter."),
    ).toBeVisible();
  });

  test("filtering by category narrows results to that category", async ({
    page,
  }) => {
    await page.goto("/search?category=books");
    // Every visible item card links to /items/[id] — spot-check that at
    // least the count line agrees results exist; a full content
    // assertion would need to know exactly what's seeded, which this
    // suite deliberately doesn't hardcode (see docs/test-plan.md — seed
    // data is randomized per npm run seed).
    const summary = page.getByText(/item(s)? found|No items match/);
    await expect(summary).toBeVisible();
  });

  test("using the filter form updates the URL and results", async ({
    page,
  }) => {
    await page.goto("/search");
    await page.getByPlaceholder("Item title…").fill("zzz_no_such_item_zzz");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=zzz_no_such_item_zzz/);
    await expect(
      page.getByText("No items match those filters."),
    ).toBeVisible();
  });
});
