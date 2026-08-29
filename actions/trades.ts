"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createTradeSchema } from "@/lib/validation/trade";
import {
  canAccept,
  canCancel,
  canConfirmComplete,
  canDecline,
  roleOf,
} from "@/lib/trade-machine";

export type TradeActionState = {
  error?: string;
};

function getAll(formData: FormData, key: string) {
  return formData.getAll(key).map(String);
}

export async function createTrade(
  _prevState: TradeActionState,
  formData: FormData,
): Promise<TradeActionState> {
  // 1. auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  // 2. zod parse
  const parsed = createTradeSchema.safeParse({
    responder_id: formData.get("responder_id"),
    offered_item_ids: getAll(formData, "offered_item_ids"),
    requested_item_ids: getAll(formData, "requested_item_ids"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { responder_id, offered_item_ids, requested_item_ids } = parsed.data;

  if (responder_id === user.id) {
    return { error: "You can't trade with yourself." };
  }

  // 3. authorization/state check — verify every item is what the
  // request claims it is, so a stale page or a tampered request gets a
  // clear error instead of hitting the RLS-denied insert below. RLS
  // policy on trade_items (0005_trades.sql) enforces the same rules
  // again at the database layer regardless of this check.
  const allItemIds = [...offered_item_ids, ...requested_item_ids];
  const { data: items } = await supabase
    .from("items")
    .select("id, owner_id, status")
    .in("id", allItemIds);

  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  for (const id of offered_item_ids) {
    const item = byId.get(id);
    if (!item || item.owner_id !== user.id || item.status !== "available") {
      return { error: "One of your offered items is no longer available." };
    }
  }
  for (const id of requested_item_ids) {
    const item = byId.get(id);
    if (
      !item ||
      item.owner_id !== responder_id ||
      item.status !== "available"
    ) {
      return { error: "One of the requested items is no longer available." };
    }
  }

  // 3b. reject a duplicate open offer — same initiator, same requested
  // item, already pending or accepted. Without this, retrying after an
  // error (or an impatient double-click) creates a pile of identical
  // offers instead of one.
  const { data: existingOffers } = await supabase
    .from("trade_items")
    .select("trade_id, trades!inner(status, initiator_id)")
    .in("item_id", requested_item_ids)
    .eq("side", "requested")
    .eq("trades.initiator_id", user.id)
    .in("trades.status", ["pending", "accepted_by_responder"]);

  if (existingOffers && existingOffers.length > 0) {
    return {
      error: "You already have an open offer for one of these items.",
    };
  }

  // 4. mutation — two inserts, not one transaction (see docs/decisions.md,
  // Phase 4): create the trade, then attach its items. If the second
  // insert fails partway, clean up the orphaned trade rather than leave
  // a broken trade with no items sitting in someone's inbox.
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .insert({ initiator_id: user.id, responder_id })
    .select("id")
    .single();

  if (tradeError || !trade) {
    return {
      error: `Couldn't create the trade offer: ${tradeError?.message ?? "unknown error"}`,
    };
  }

  const tradeItemRows = [
    ...offered_item_ids.map((item_id) => ({
      trade_id: trade.id,
      item_id,
      side: "offered" as const,
    })),
    ...requested_item_ids.map((item_id) => ({
      trade_id: trade.id,
      item_id,
      side: "requested" as const,
    })),
  ];

  const { error: itemsError } = await supabase
    .from("trade_items")
    .insert(tradeItemRows);

  if (itemsError) {
    await supabase.from("trades").delete().eq("id", trade.id);
    return {
      error: `Couldn't create the trade offer: ${itemsError.message}`,
    };
  }

  // 5. revalidate
  revalidatePath("/trades");
  redirect(`/trades/${trade.id}`);
}

async function loadTradeForTransition(tradeId: string, userId: string) {
  const supabase = await createClient();
  const { data: trade } = await supabase
    .from("trades")
    .select("id, initiator_id, responder_id, status")
    .eq("id", tradeId)
    .single();

  if (!trade) throw new Error("Trade not found.");

  const role = roleOf(userId, trade);
  if (!role) throw new Error("You're not a participant in this trade.");

  return { supabase, trade, role };
}

export async function acceptTrade(tradeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { trade, role } = await loadTradeForTransition(tradeId, user.id);
  if (!canAccept(trade.status, role)) {
    throw new Error("This trade can no longer be accepted.");
  }

  // Atomic: marks this trade accepted, cancels every other still-pending
  // trade competing for the same item(s), and refuses outright if one of
  // those items is already committed to a different accepted trade — see
  // accept_trade() in
  // supabase/migrations/0008_trade_accept_conflict_resolution.sql.
  const { error } = await supabase.rpc("accept_trade", {
    p_trade_id: tradeId,
  });
  if (error) throw new Error(error.message || "Couldn't accept the trade.");

  revalidatePath("/trades");
  revalidatePath(`/trades/${tradeId}`);
}

export async function declineTrade(tradeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { trade, role } = await loadTradeForTransition(tradeId, user.id);
  if (!canDecline(trade.status, role)) {
    throw new Error("This trade can no longer be declined.");
  }

  const { error } = await supabase
    .from("trades")
    .update({ status: "declined" })
    .eq("id", tradeId);
  if (error) throw new Error("Couldn't decline the trade.");

  revalidatePath("/trades");
  revalidatePath(`/trades/${tradeId}`);
}

export async function cancelTrade(tradeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { trade, role } = await loadTradeForTransition(tradeId, user.id);
  if (!canCancel(trade.status, role)) {
    throw new Error("This trade can no longer be cancelled.");
  }

  const { error } = await supabase
    .from("trades")
    .update({ status: "cancelled" })
    .eq("id", tradeId);
  if (error) throw new Error("Couldn't cancel the trade.");

  revalidatePath("/trades");
  revalidatePath(`/trades/${tradeId}`);
}

export async function confirmCompleteTrade(tradeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { trade, role } = await loadTradeForTransition(tradeId, user.id);
  if (!canConfirmComplete(trade.status, role)) {
    throw new Error("This trade can't be completed yet.");
  }

  // Atomic: marks the trade completed, marks every item in it traded,
  // and auto-cancels any other trade left negotiating over those items
  // — see complete_trade() in supabase/migrations/0005_trades.sql.
  const { error } = await supabase.rpc("complete_trade", {
    p_trade_id: tradeId,
  });
  if (error) throw new Error("Couldn't complete the trade.");

  revalidatePath("/trades");
  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/my-items");
}
