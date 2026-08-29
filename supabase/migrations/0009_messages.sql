-- Phase 5: messaging. Lets the two people in a trade coordinate the
-- actual handoff (where/when to meet, how to ship, etc.) — deliberately
-- scoped to inside a trade, not a general inbox, per
-- docs/technical-design.md's schema (§3) and work plan Phase 5.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now(),
  constraint message_body_length check (char_length(body) <= 1000)
);

-- Thread fetch is always "every message for this trade, chronological" —
-- see docs/technical-design.md §3.2.
create index messages_trade_created_idx
  on public.messages (trade_id, created_at);

alter table public.messages enable row level security;

-- Readable by either participant of the parent trade — same shape as
-- trade_items' read policy (0005_trades.sql). Querying `trades` here does
-- not create the kind of RLS cycle 0007 had to fix: trades' own policies
-- never query messages back, so there's no mutual reference.
create policy "trade participants can read messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.trades t
      where t.id = messages.trade_id
        and (t.initiator_id = auth.uid() or t.responder_id = auth.uid())
    )
  );

-- Only a participant may post, only as themselves, and only while the
-- trade is still live — matches the work plan's "disable input on
-- terminal trades," enforced here too (not just in the UI) so a stale
-- page can't post into a trade that's already completed/declined/
-- cancelled.
create policy "trade participants can send messages on live trades"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.trades t
      where t.id = messages.trade_id
        and (t.initiator_id = auth.uid() or t.responder_id = auth.uid())
        and t.status not in ('completed', 'declined', 'cancelled')
    )
  );

-- No update/delete policies: messages are immutable once sent — no edit
-- or delete feature planned, which keeps a trade's negotiation history
-- honest (each side can trust the other can't quietly rewrite what was
-- said).
