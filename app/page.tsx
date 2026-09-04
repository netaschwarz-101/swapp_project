import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ItemCard, type ItemCardData } from "@/components/item-card";

const FEED_LIMIT = 24;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let city: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("city")
      .eq("id", user.id)
      .single();
    city = profile?.city ?? null;
  }

  // Logged-in with a known city: a random sample of available items in
  // that city, excluding the viewer's own listings — the "For You" feed.
  // Logged-out (or a logged-in user whose profile city lookup somehow
  // came back empty): newest available items across every city, so the
  // page is never blank. Both are Postgres functions (see
  // supabase/migrations/0004_feed_rpc.sql) rather than app-side
  // filtering/shuffling, so RLS still applies to the underlying query
  // and "random" is decided by the database, not fetched-then-shuffled
  // client data.
  // Cast: no generated Supabase types yet (see docs/decisions.md, Phase
  // 2), so `.rpc()` doesn't know the shape of a `setof items` row on its
  // own — the actual rows do have every ItemCardData field (they're
  // full `items` rows), this just tells TS what we already know.
  const { data: items } = (
    user && city
      ? await supabase.rpc("feed_items", {
          p_city: city,
          p_exclude_owner: user.id,
          p_limit: FEED_LIMIT,
        })
      : await supabase.rpc("newest_items", { p_limit: FEED_LIMIT })
  ) as { data: ItemCardData[] | null };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Trade what you have for what you want.
        </h1>
        <p className="text-muted-foreground max-w-lg">
          Swapp is a cash-free marketplace. List what you don&rsquo;t need,
          find what you do, and trade locally with zero payments.
        </p>
        {!user && (
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {user && city ? `For you in ${city}` : "Newest items"}
          </h2>
          <Link
            href="/search"
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
          >
            Search all items
          </Link>
        </div>

        {!items || items.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
            {user && city ? (
              <>
                No available items in {city} right now.{" "}
                <Link href="/search" className="underline underline-offset-4">
                  Browse other cities
                </Link>{" "}
                or{" "}
                <Link
                  href="/items/new"
                  className="underline underline-offset-4"
                >
                  post the first one
                </Link>
                .
              </>
            ) : (
              <>
                Nothing posted yet.{" "}
                <Link href="/signup" className="underline underline-offset-4">
                  Sign up
                </Link>{" "}
                and be the first.
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item, index) => (
              <ItemCard key={item.id} item={item} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
