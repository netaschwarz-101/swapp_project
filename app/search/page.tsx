import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ItemCard } from "@/components/item-card";
import { SearchFilters } from "@/components/search-filters";
import { CATEGORIES, CITIES, CONDITIONS } from "@/lib/constants";

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  category?: string;
  condition?: string;
  city?: string;
  page?: string;
};

// Narrows an arbitrary query-string value down to one of the known
// options (or "all"), so a garbage/stale ?category= in the URL can't
// silently produce a nonsense filter or desync the Select's selected
// option from what's actually being queried.
function pickOption<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
): T | "all" {
  return allowed.includes(value as T) ? (value as T) : "all";
}

// Offset pagination (range/count) is fine at this project's scale — the
// scale doc calls out cursor pagination as the production-scale
// alternative and why (offset pagination re-scans skipped rows, which
// only matters once a table is large).
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = pickOption(CATEGORIES, sp.category);
  const condition = pickOption(CONDITIONS, sp.condition);
  const city = pickOption(CITIES, sp.city);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select("id, title, category, condition, city, status, image_urls", {
      count: "exact",
    })
    .eq("status", "available");

  if (q) query = query.ilike("title", `%${q}%`);
  if (category !== "all") query = query.eq("category", category);
  if (condition !== "all") query = query.eq("condition", condition);
  if (city !== "all") query = query.eq("city", city);

  const { data: items, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Carries the current filters forward onto a different page number —
  // used by the Prev/Next links below.
  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category !== "all") params.set("category", category);
    if (condition !== "all") params.set("condition", condition);
    if (city !== "all") params.set("city", city);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Search</h1>

      <SearchFilters defaultValues={{ q, category, condition, city }} />

      <div className="text-muted-foreground text-sm">
        {total === 0
          ? "No items match those filters."
          : `${total} item${total === 1 ? "" : "s"} found`}
      </div>

      {!items || items.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          Try a different search term or clear a filter.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 text-sm">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className="underline underline-offset-4"
                >
                  Previous
                </Link>
              ) : (
                <span className="text-muted-foreground">Previous</span>
              )}
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={pageHref(page + 1)}
                  className="underline underline-offset-4"
                >
                  Next
                </Link>
              ) : (
                <span className="text-muted-foreground">Next</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
