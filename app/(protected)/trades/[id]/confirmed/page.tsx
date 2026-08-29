import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/constants";
import type { TradeStatus } from "@/lib/constants";
import { roleOf } from "@/lib/trade-machine";

// Landing page right after createTrade() (actions/trades.ts) redirects here.
// Deliberately mirrors the visual layout of the "Propose a trade" page
// (components/offer-builder.tsx) — same max-width container, same
// item-row treatment — so the flow reads as one continuous screen, offer
// -> confirmation, rather than a jump to an unrelated design.

type OfferItem = {
  id: string;
  title: string;
  category: string;
  condition: string;
  image_urls: string[];
};

type TradeItemRow = {
  side: "offered" | "requested";
  item: OfferItem;
};

export default async function TradeConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy.ts already redirects unauthenticated users here

  const { data: tradeData } = await supabase
    .from("trades")
    .select(
      "id, status, initiator_id, responder_id, " +
        "responder:profiles!trades_responder_id_fkey(username)",
    )
    .eq("id", id)
    .single();

  if (!tradeData) notFound();

  const trade = tradeData as unknown as {
    id: string;
    status: TradeStatus;
    initiator_id: string;
    responder_id: string;
    responder: { username: string } | null;
  };

  // Same participant guard as the trade detail page (roleOf() -> notFound())
  // — this shows the same underlying trade data, so a non-participant
  // shouldn't be able to see it here either, just because they guessed or
  // were handed the URL.
  const role = roleOf(user.id, trade);
  if (!role) notFound();

  const { data: tradeItemsData } = await supabase
    .from("trade_items")
    .select("side, item:items(id, title, category, condition, image_urls)")
    .eq("trade_id", id);

  const tradeItems = (tradeItemsData ?? []) as unknown as TradeItemRow[];
  const offered = tradeItems.filter((ti) => ti.side === "offered");
  const requested = tradeItems.filter((ti) => ti.side === "requested");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trade offer sent!</h1>
          <p className="text-muted-foreground text-sm">
            {trade.responder?.username ?? "They"} will be notified and can
            accept or decline.
          </p>
        </div>
        <Button asChild>
          <Link href="/">Back to homepage</Link>
        </Button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">You offered</h2>
        <div className="flex flex-col gap-2">
          {offered.map((ti) => (
            <ItemRow key={ti.item.id} item={ti.item} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">You requested</h2>
        <div className="flex flex-col gap-2">
          {requested.map((ti) => (
            <ItemRow key={ti.item.id} item={ti.item} />
          ))}
        </div>
      </div>

      <Link
        href={`/trades/${trade.id}`}
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        View trade details
      </Link>
    </div>
  );
}

// Same rendering as the (non-compact) ItemRow in components/offer-builder.tsx
// — kept as a local copy rather than importing from that "use client"
// module, since this page has no need for a client boundary here.
function ItemRow({ item }: { item: OfferItem }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md">
        {item.image_urls[0] ? (
          <Image
            src={item.image_urls[0]}
            alt={item.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-muted-foreground text-xs">
          {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ??
            item.category}{" "}
          ·{" "}
          {CONDITION_LABELS[
            item.condition as keyof typeof CONDITION_LABELS
          ] ?? item.condition}
        </p>
      </div>
    </div>
  );
}
