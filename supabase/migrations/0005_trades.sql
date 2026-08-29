-- Phase 4: trades, trade_items, and the complete_trade() transaction.
-- See docs/technical-design.md §3/§3.1 for the full state machine and
-- rationale this migration implements.

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references public.profiles (id) on delete cascade,
  responder_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_status_allowed check (
    status in ('pending', 'accepted_by_responder', 'completed', 'declined', 'cancelled')
  ),
  constraint trade_participants_distinct check (initiator_id <> responder_id)
);

create index trades_initiator_idx on public.trades (initiator_id);
create index trades_responder_idx on public.trades (responder_id);

create table public.trade_items (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  item_id uuid not null references public.items (id),
  side text not null,
  created_at timestamptz not null default now(),
  constraint trade_item_side_allowed check (side in ('offered', 'requested')),
  -- an item can only appear once per side of a given trade
  constraint trade_item_unique unique (trade_id, item_id, side)
);

create index trade_items_trade_idx on public.trade_items (trade_id);
create index trade_items_item_idx on public.trade_items (item_id);

alter table public.trades enable row level security;
alter table public.trade_items enable row level security;

-- trades: participants only, for both reading and writing.
create policy "trade participants can read their trades"
  on public.trades for select
  to authenticated
  using (auth.uid() = initiator_id or auth.uid() = responder_id);

create policy "trade participants can update their trades"
  on public.trades for update
  to authenticated
  using (auth.uid() = initiator_id or auth.uid() = responder_id)
  with check (auth.uid() = initiator_id or auth.uid() = responder_id);

-- Only ever created by the initiator, naming themselves as initiator.
create policy "users can create trades they initiate"
  on public.trades for insert
  to authenticated
  with check (auth.uid() = initiator_id);

-- trade_items: readable by either participant of the parent trade.
create policy "trade participants can read trade_items"
  on public.trade_items for select
  to authenticated
  using (
    exists (
      select 1 from public.trades t
      where t.id = trade_items.trade_id
        and (t.initiator_id = auth.uid() or t.responder_id = auth.uid())
    )
  );

-- Only the trade's initiator can attach items, only to a trade they
-- created, only while every item involved is actually available, and
-- only on the side that matches who owns it — offered items must be
-- the initiator's own, requested items must belong to the responder.
-- This is the DB-level backstop for exactly what createTrade's zod
-- schema + Server Action logic already check.
create policy "initiator can insert trade_items for their own trade"
  on public.trade_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trades t
      join public.items i on i.id = trade_items.item_id
      where t.id = trade_items.trade_id
        and t.initiator_id = auth.uid()
        and i.status = 'available'
        and (
          (trade_items.side = 'offered' and i.owner_id = t.initiator_id)
          or (trade_items.side = 'requested' and i.owner_id = t.responder_id)
        )
    )
  );

-- Enforces the state machine from docs/technical-design.md §3.1 at the
-- database layer — a second, independent check beyond lib/trade-machine.ts
-- and the Server Actions, so a bug in application code can reject a
-- request but can never produce an illegal state. Runs before the RLS
-- update policy's own USING/CHECK, so it applies to any update that gets
-- that far, including ones issued by complete_trade() below.
create function public.validate_trade_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- complete_trade() sets this flag (transaction-local) before making
  -- changes on the caller's behalf: completing the primary trade (already
  -- authorized by complete_trade's own checks) and auto-cancelling other
  -- trades that just lost their items to the completed one — trades the
  -- *calling* user usually isn't even a participant in, so the per-role
  -- checks below don't apply to them.
  if coalesce(current_setting('swapp.system_transition', true), '') = 'true' then
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'pending' and new.status = 'declined' then
    if auth.uid() <> old.responder_id then
      raise exception 'Only the responder can decline a pending trade';
    end if;
  elsif old.status = 'pending' and new.status = 'cancelled' then
    if auth.uid() <> old.initiator_id then
      raise exception 'Only the initiator can cancel a pending trade';
    end if;
  elsif old.status = 'pending' and new.status = 'accepted_by_responder' then
    if auth.uid() <> old.responder_id then
      raise exception 'Only the responder can accept a pending trade';
    end if;
  elsif old.status = 'accepted_by_responder' and new.status = 'cancelled' then
    if auth.uid() <> old.initiator_id and auth.uid() <> old.responder_id then
      raise exception 'Only a trade participant can cancel';
    end if;
  else
    -- Includes accepted_by_responder -> completed: that transition is
    -- only ever legal via complete_trade() (the system_transition path
    -- above), never as a direct client update — which is exactly what
    -- forces "mark items traded" and "mark trade completed" to happen
    -- together, atomically, instead of a client being able to do one
    -- without the other.
    raise exception 'Illegal trade status transition: % -> %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trades_validate_transition
  before update on public.trades
  for each row execute function public.validate_trade_transition();

-- Atomic completion: mark this trade completed, mark every item in it
-- traded, and auto-cancel every other still-open trade that references
-- any of those items — all as one transaction, so nothing can observe a
-- half-finished state (items traded but the trade not marked complete,
-- or vice versa; a conflicting trade left open over an item that's
-- already gone). SECURITY DEFINER because the auto-cancel step has to
-- update other users' trades, which the calling user's own RLS
-- permissions would never allow directly — the function re-checks
-- authorization itself before doing anything (see below), so this isn't
-- an open bypass.
create function public.complete_trade(p_trade_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_trade public.trades;
  v_item_ids uuid[];
begin
  select * into v_trade from public.trades where id = p_trade_id for update;

  if not found then
    raise exception 'Trade not found';
  end if;

  if auth.uid() <> v_trade.initiator_id then
    raise exception 'Only the initiator can confirm completion';
  end if;

  if v_trade.status <> 'accepted_by_responder' then
    raise exception 'Trade must be accepted before it can be completed';
  end if;

  select coalesce(array_agg(item_id), '{}') into v_item_ids
  from public.trade_items
  where trade_id = p_trade_id;

  perform set_config('swapp.system_transition', 'true', true);

  update public.trades
  set status = 'completed'
  where id = p_trade_id;

  update public.items
  set status = 'traded'
  where id = any(v_item_ids);

  update public.trades t
  set status = 'cancelled'
  where t.id <> p_trade_id
    and t.status in ('pending', 'accepted_by_responder')
    and exists (
      select 1 from public.trade_items ti
      where ti.trade_id = t.id
        and ti.item_id = any(v_item_ids)
    );
end;
$$;

grant execute on function public.complete_trade(uuid) to authenticated;

-- Extends 0002_items.sql's read policy with the clause it deferred:
-- once an item is no longer 'available' (traded, or soft-deleted), the
-- other party to a trade it was part of still needs to be able to see
-- it (trade history, the trade detail page) even though they don't own
-- it and it's no longer publicly listed.
alter policy "items are readable when available or own"
  on public.items
  to authenticated
  using (
    status = 'available'
    or owner_id = auth.uid()
    or exists (
      select 1
      from public.trade_items ti
      join public.trades t on t.id = ti.trade_id
      where ti.item_id = items.id
        and (t.initiator_id = auth.uid() or t.responder_id = auth.uid())
    )
  );
