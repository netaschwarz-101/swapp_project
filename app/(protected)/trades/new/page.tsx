import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, title, category, condition, image_urls, owner_id, status")
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

  const { data: ownItems } = await supabase
    .from("items")
    .select("id, title, category, condition, image_urls")
    .eq("owner_id", user.id)
    .eq("status", "available")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Propose a trade</h1>
      <OfferBuilder
        requestedItem={requestedItem}
        responderId={requestedItem.owner_id}
        ownItems={ownItems ?? []}
      />
    </div>
  );
}
