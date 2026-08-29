"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { sendMessage } from "@/actions/messages";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Poll interval for new messages while a trade's chat is open — see
// docs/technical-design.md / work plan Phase 5 ("poll every 5s while
// open"). Plain polling instead of Supabase Realtime: simpler to reason
// about and defend for a course-scale app, and avoids a second connection
// type (websocket) alongside the request/response model the rest of the
// app already uses. docs/scale.md notes Realtime as a documented future
// upgrade if this ever needed to feel more instant.
const POLL_INTERVAL_MS = 5000;

export type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type Props = {
  tradeId: string;
  currentUserId: string;
  initiatorId: string;
  responderId: string;
  initiatorUsername: string;
  responderUsername: string;
  initialMessages: ChatMessage[];
  disabled: boolean;
};

export function TradeChat({
  tradeId,
  currentUserId,
  initiatorId,
  responderId,
  initiatorUsername,
  responderUsername,
  initialMessages,
  disabled,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("trade_id", tradeId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as ChatMessage[]);
  }, [tradeId]);

  useEffect(() => {
    // Only poll while the trade is still live — a terminal trade's
    // history never changes, so there's nothing to refresh.
    if (disabled) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, disabled]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      try {
        await sendMessage(tradeId, body);
        setDraft("");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send that.");
      }
    });
  }

  function nameFor(senderId: string) {
    if (senderId === initiatorId) return initiatorUsername;
    if (senderId === responderId) return responderUsername;
    return "Swapp user";
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Messages</h2>

      <div
        ref={listRef}
        className="flex max-h-80 min-h-24 flex-col gap-2 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No messages yet. Say hello and work out how you&rsquo;ll swap
            these items.
          </p>
        ) : (
          messages.map((m) => {
            const isOwn = m.sender_id === currentUserId;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    isOwn
                      ? "bg-foreground text-background"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.body}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {isOwn ? "You" : nameFor(m.sender_id)} ·{" "}
                  {new Date(m.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {disabled ? (
        <p className="text-muted-foreground text-sm">
          This trade is no longer active, so messaging is closed.
        </p>
      ) : (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Write a message…"
            maxLength={1000}
            disabled={isPending}
          />
          <Button
            onClick={handleSend}
            disabled={isPending || draft.trim().length === 0}
          >
            Send
          </Button>
        </div>
      )}
    </section>
  );
}
