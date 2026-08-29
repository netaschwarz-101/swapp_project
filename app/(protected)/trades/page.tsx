import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TradeStatusBadge } from "@/components/trade-status-badge";
import { InkBlock } from "@/components/ink-block";
import { canAccept, canConfirmComplete, roleOf } from "@/lib/trade-machine";
import type { TradeStatus } from "@/lib/constants";

type TradeRow = {
  id: string;
  status: TradeStatus;
  updated_at: string;
  initiator_id: string;
  responder_id: string;
  initiator: { username: string } | null;
  responder: { username: string } | null;
};

export default async function TradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // proxy.ts already redirects unauthenticated users here

  // Two FKs from trades to profiles (initiator_id, responder_id) need
  // disambiguating in the embed — PostgREST can't infer which one you
  // mean otherwise.
  const { data } = await supabase
    .from("trades")
    .select(
      "id, status, updated_at, initiator_id, responder_id, " +
        "initiator:profiles!trades_initiator_id_fkey(username), " +
        "responder:profiles!trades_responder_id_fkey(username)",
    )
    .or(`initiator_id.eq.${user.id},responder_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  const trades = (data ?? []) as unknown as TradeRow[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Trades</h1>

      {trades.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          No trades yet.{" "}
          <Link href="/search" className="underline underline-offset-4">
            Browse items
          </Link>{" "}
          to make your first offer.
        </div>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {trades.map((trade) => {
            const role = roleOf(user.id, trade);
            const counterpart =
              role === "initiator" ? trade.responder : trade.initiator;
            const needsAction =
              role !== null &&
              (canAccept(trade.status, role) ||
                canConfirmComplete(trade.status, role));

            const row = (
              <Link
                href={`/trades/${trade.id}`}
                className="hover:bg-accent flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {role === "initiator" ? "You offered " : "Offer from "}
                    {counterpart?.username ?? "a Swapp user"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Updated {new Date(trade.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <TradeStatusBadge status={trade.status} />
              </Link>
            );

            return needsAction ? (
              <InkBlock key={trade.id} tone="success">
                {row}
              </InkBlock>
            ) : (
              <div key={trade.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
