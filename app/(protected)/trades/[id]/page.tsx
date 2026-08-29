import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InkBlock } from "@/components/ink-block";
import { TradeSteps } from "@/components/trade-steps";
import { TradeActions } from "@/components/trade-actions";
import { TradeChat, type ChatMessage } from "@/components/trade-chat";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/constants";
import { canSendMessage, roleOf } from "@/lib/trade-machine";
import type { TradeStatus } from "@/lib/constants";

type TradeItem = {
  id: string;
  title: string;
  category: string;
  condition: string;
  image_urls: string[];
};

type TradeItemRow = {
  side: "offered" | "requested";
  item: TradeItem;
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
      "id, status, created_at, updated_at, initiator_id, responder_id, " +
        "initiator:profiles!trades_initiator_id_fkey(username), " +
        "responder:profiles!trades_responder_id_fkey(username)",
    )
    .eq("id", id)
    .single();

  if (!tradeData) notFound();

  const trade = tradeData as unknown as {
    id: string;
    status: TradeStatus;
    created_at: string;
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
      "side, item:items(id, title, category, condition, image_urls)",
    )
    .eq("trade_id", id);

  const tradeItems = (tradeItemsData ?? []) as unknown as TradeItemRow[];
  const offered = tradeItems.filter((ti) => ti.side === "offered");
  const requested = tradeItems.filter((ti) => ti.side === "requested");

  const { data: messagesData } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("trade_id", id)
    .order("created_at", { ascending: true });

  const messages = (messagesData ?? []) as ChatMessage[];

  const isInitiator = role === "initiator";
  const otherName =
    (isInitiator ? trade.responder?.username : trade.initiator?.username) ??
    "them";

  // Title and the give/get panels below are both framed relative to the
  // viewer, not to fixed "initiator"/"responder" roles — "your offer to
  // X" reads as your own trade, where "initiator ↔ responder" reads as
  // two strangers' transaction you happen to be looking at.
  const title = isInitiator
    ? `Your offer to ${otherName}`
    : `${otherName}'s offer to you`;

  const itemWord = (n: number) => (n === 1 ? "item" : "items");
  const subtext = `Sent ${formatSentAt(trade.created_at)} · ${offered.length} ${itemWord(offered.length)} for ${requested.length}`;

  const giveItems = isInitiator ? offered : requested;
  const getItems = isInitiator ? requested : offered;

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href="/">
          <ArrowLeft className="size-4" />
          Home
        </Link>
      </Button>

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{subtext}</p>
        </div>
        <TradeActions tradeId={trade.id} status={trade.status} role={role} />
      </div>

      <TradeSteps
        status={trade.status}
        isInitiator={isInitiator}
        otherName={otherName}
        sentAt={trade.created_at}
      />

      <div className="grid gap-3.5 md:grid-cols-2">
        <InkBlock tone="warm">
          <TradeItemPanel label="You give" items={giveItems} />
        </InkBlock>
        <InkBlock tone="cool">
          <TradeItemPanel label="You get" items={getItems} />
        </InkBlock>
      </div>

      <TradeChat
        tradeId={trade.id}
        currentUserId={user.id}
        initiatorId={trade.initiator_id}
        responderId={trade.responder_id}
        initiatorUsername={trade.initiator?.username ?? "initiator"}
        responderUsername={trade.responder?.username ?? "responder"}
        initialMessages={messages}
        disabled={!canSendMessage(trade.status)}
      />
    </div>
  );
}

function formatSentAt(iso: string) {
  const sent = new Date(iso);
  const now = new Date();
  const time = sent.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return sent.toDateString() === now.toDateString()
    ? `today at ${time}`
    : `${sent.toLocaleDateString()} at ${time}`;
}

function TradeItemPanel({
  label,
  items,
}: {
  label: string;
  items: TradeItemRow[];
}) {
  return (
    <Card className="gap-3 p-4">
      <p className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {items.map((ti) => (
          <TradeItemThumb key={ti.item.id} item={ti.item} />
        ))}
      </div>
    </Card>
  );
}

function TradeItemThumb({ item }: { item: TradeItem }) {
  return (
    <Link
      href={`/items/${item.id}`}
      className="bg-card hover:bg-accent flex items-center gap-2 rounded-lg border p-2"
    >
      <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-md">
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
    </Link>
  );
}
