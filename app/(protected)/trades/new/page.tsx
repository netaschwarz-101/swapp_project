import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { OfferBuilder } from "@/components/offer-builder";

export default async function NewTradePage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item: itemId } = await searchParams;
  if (!itemId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/trades/new?item=${itemId}`);

  const { data: requestedItem } = await supabase
    .from("items")
    .select(
      "id, title, category, condition, city, image_urls, owner_id, status, owner:profiles(username)",
    )
    .eq("id", itemId)
    .single();

  if (!requestedItem || requestedItem.status !== "available") {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
        This item is no longer available to trade for.{" "}
        <Link href="/search" className="underline underline-offset-4">
          Browse other items
        </Link>
        .
      </div>
    );
  }

  if (requestedItem.owner_id === user.id) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
        You can&rsquo;t trade for your own item.
      </div>
    );
  }

  const { data: ownItemsRaw } = await supabase
    .from("items")
    .select("id, title, category, condition, image_urls")
    .eq("owner_id", user.id)
    .eq("status", "available")
    .order("created_at", { ascending: false });

  // Exclude items already committed to a trade the responder has accepted
  // (accept_trade()'s conflict resolution, 0008_trade_accept_conflict_
  // resolution.sql, only cancels *competing* pending offers for the same
  // item — it doesn't stop the item's owner from being offered here as if
  // it were still free). Same join shape as the "duplicate open offer"
  // check in createTrade (actions/trades.ts), just for offered_item_ids
  // instead of requested_item_ids.
  let ownItems = ownItemsRaw ?? [];
  let hasHiddenCommittedItems = false;

  if (ownItems.length > 0) {
    const { data: committedRows } = await supabase
      .from("trade_items")
      .select("item_id, trades!inner(status)")
      .eq("side", "offered")
      .in(
        "item_id",
        ownItems.map((i) => i.id),
      )
      .eq("trades.status", "accepted_by_responder");

    const committedIds = new Set((committedRows ?? []).map((r) => r.item_id));
    if (committedIds.size > 0) {
      hasHiddenCommittedItems = true;
      ownItems = ownItems.filter((i) => !committedIds.has(i.id));
    }
  }

  const owner = requestedItem.owner as unknown as { username: string } | null;
  const responderUsername = owner?.username ?? "They";

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href={`/items/${requestedItem.id}`}>
          <ArrowLeft className="size-4" />
          Back to item
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">Build your offer</h1>
        <p className="text-muted-foreground text-sm">
          Pick the items you&rsquo;re willing to give for{" "}
          {responderUsername}&rsquo;s {requestedItem.title}. Nothing is sent
          until you submit.
        </p>
      </div>

      <OfferBuilder
        requestedItem={{
          id: requestedItem.id,
          title: requestedItem.title,
          category: requestedItem.category,
          condition: requestedItem.condition,
          image_urls: requestedItem.image_urls,
          city: requestedItem.city,
        }}
        responderId={requestedItem.owner_id}
        responderUsername={responderUsername}
        ownItems={ownItems}
        hasHiddenCommittedItems={hasHiddenCommittedItems}
      />
    </div>
  );
}
