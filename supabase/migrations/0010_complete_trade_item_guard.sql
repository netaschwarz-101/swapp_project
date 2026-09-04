-- Closes a real gap in complete_trade() (0005_trades.sql): it never
-- re-checked that its own items were still 'available' before marking
-- them 'traded'. Under ordinary sequential use this never mattered —
-- accept_trade()'s conflict resolution (0008) plus this function's own
-- cross-cancellation step keep at most one live accepted_by_responder
-- trade per item. The gap only shows up under genuine concurrency:
--
-- Two initiators confirming completion on two different trades that
-- both reference the same item, at the same instant, can deadlock in
-- Postgres — both transactions lock their own trade row up front (no
-- conflict there), but each also needs to touch the *other* trade's row
-- during its own cross-cancellation step, while also racing to write the
-- shared item row. That's a lock cycle, and Postgres's deadlock detector
-- correctly aborts one side — that part is the database doing exactly
-- what it should, not a bug. The bug is what happens next: the aborted
-- transaction rolls back cleanly, leaving that trade still
-- accepted_by_responder, so if that user reacts to "Couldn't complete
-- the trade." by simply trying again — a completely reasonable thing to
-- do — every existing guard clause still passes (their trade really is
-- accepted_by_responder), and the retry silently marks a *second* trade
-- completed over an item the first completion already traded.
--
-- Fix: lock the item rows too (not just the trade row) before checking
-- them, and refuse if any of them is no longer 'available'. Locking them
-- first means a concurrent complete_trade() call over an overlapping
-- item set serializes here instead of both racing past the check; a
-- stale retry after the item's already been traded now fails loudly
-- with a clear error instead of silently completing a second time.
create or replace function public.complete_trade(p_trade_id uuid)
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

  -- Lock every item in this trade before checking any of them, so a
  -- concurrent complete_trade() call sharing one of these items blocks
  -- here until this transaction finishes, instead of both transactions
  -- reading "available" at the same time and both proceeding.
  perform 1 from public.items where id = any(v_item_ids) for update;

  if exists (
    select 1 from public.items
    where id = any(v_item_ids)
      and status <> 'available'
  ) then
    raise exception
      'One or more items in this trade are no longer available — another trade over the same item(s) was already completed.';
  end if;

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
