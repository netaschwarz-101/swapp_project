import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ItemCard, type ItemCardData } from "@/components/item-card";
import { TradeStatusBadge } from "@/components/trade-status-badge";
import { TradeActions } from "@/components/trade-actions";
import { roleOf } from "@/lib/trade-machine";
import type { TradeStatus } from "@/lib/constants";

type TradeItemRow = {
  side: "offered" | "requested";
  item: ItemCardData;
};

export default async function TradeDetailPage({
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
      "id, status, updated_at, initiator_id, responder_id, " +
        "initiator:profiles!trades_initiator_id_fkey(username), " +
        "responder:profiles!trades_responder_id_fkey(username)",
    )
    .eq("id", id)
    .single();

  if (!tradeData) notFound();

  const trade = tradeData as unknown as {
    id: string;
    status: TradeStatus;
    updated_at: string;
    initiator_id: string;
    responder_id: string;
    initiator: { username: string } | null;
    responder: { username: string } | null;
  };

  const role = roleOf(user.id, trade);
  if (!role) notFound(); // not a participant — RLS would already hide this row anyway

  const { data: tradeItemsData } = await supabase
    .from("trade_items")
    .select(
      "side, item:items(id, title, category, condition, city, status, image_urls)",
    )
    .eq("trade_id", id);

  const tradeItems = (tradeItemsData ?? []) as unknown as TradeItemRow[];
  const offered = tradeItems.filter((ti) => ti.side === "offered");
  const requested = tradeItems.filter((ti) => ti.side === "requested");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {trade.initiator?.username ?? "A user"} ↔{" "}
            {trade.responder?.username ?? "a user"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Last updated {new Date(trade.updated_at).toLocaleString()}
          </p>
        </div>
        <TradeStatusBadge status={trade.status} />
      </div>

      <TradeActions tradeId={trade.id} status={trade.status} role={role} />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            Offered (by {trade.initiator?.username ?? "initiator"})
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {offered.map((ti) => (
              <ItemCard key={ti.item.id} item={ti.item} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            Requested (from {trade.responder?.username ?? "responder"})
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {requested.map((ti) => (
              <ItemCard key={ti.item.id} item={ti.item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
