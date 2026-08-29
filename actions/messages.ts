"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validation/message";

// Plain throwing action, called directly from a client component (not a
// <form action>) — same pattern trade-actions.tsx moved to (see
// docs/decisions.md, "trade action errors shown inline"), so the chat UI
// can catch failures and show them inline instead of crashing the page.
export async function sendMessage(tradeId: string, body: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const parsed = messageSchema.safeParse({ trade_id: tradeId, body });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid message");
  }

  // No separate authorization/state pre-check here (unlike trades.ts) —
  // "is this user a participant, and is the trade still live" is exactly
  // what messages' RLS insert policy already enforces
  // (0009_messages.sql), so a stale/tampered request gets a clear DB
  // error instead of duplicating the same check twice for a single,
  // simple insert.
  const { error } = await supabase.from("messages").insert({
    trade_id: parsed.data.trade_id,
    sender_id: user.id,
    body: parsed.data.body,
  });

  if (error) {
    throw new Error(error.message || "Couldn't send the message.");
  }

  revalidatePath(`/trades/${tradeId}`);
}
