-- Bug (reported against the live deployment): two different users can each
-- have a pending trade requesting the same item from the same responder.
-- The responder accepts one of them — but nothing about *accepting* a
-- trade currently touches the other trade at all. It sits there fully
-- "pending", with a working Cancel button, as if nothing happened, right
-- up until the accepted trade is fully completed (complete_trade(), which
-- is the only place conflicting trades were ever auto-cancelled — see
-- docs/technical-design.md §3.1 before this migration). That's a real
-- design gap, not just a rough edge: an item can end up promised to two
-- people at once for as long as the accepted trade sits un-completed, and
-- the loser has no idea their offer is already moot.
--
-- Fix: resolve conflicts at ACCEPT time, not just completion time.
-- accept_trade() is a SECURITY DEFINER function (same pattern as
-- complete_trade()) — needed because it has to touch *other users'*
-- trade rows (the ones being auto-cancelled), which the responder's own
-- RLS permissions would never allow directly.
create function public.accept_trade(p_trade_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_trade public.trades;
  v_item_ids uuid[];
  v_conflict boolean;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;

  if not found then
    raise exception 'Trade not found';
  end if;

  if auth.uid() <> v_trade.responder_id then
    raise exception 'Only the responder can accept this trade';
  end if;

  if v_trade.status <> 'pending' then
    raise exception 'This trade can no longer be accepted';
  end if;

  select coalesce(array_agg(item_id), '{}') into v_item_ids
  from public.trade_items
  where trade_id = p_trade_id;

  -- Refuse outright if any of these items is already promised in a
  -- *different* trade that's already been accepted — that trade's
  -- initiator is waiting on a real commitment; this one shouldn't be
  -- allowed to silently steal it.
  select exists (
    select 1
    from public.trade_items ti
    join public.trades t on t.id = ti.trade_id
    where t.id <> p_trade_id
      and t.status = 'accepted_by_responder'
      and ti.item_id = any(v_item_ids)
  ) into v_conflict;

  if v_conflict then
    raise exception
      'One of these items is already committed to another accepted trade';
  end if;

  perform set_config('swapp.system_transition', 'true', true);

  update public.trades
  set status = 'accepted_by_responder'
  where id = p_trade_id;

  -- Every other still-pending trade offering or requesting any of the
  -- same items is now moot — the responder just chose this trade over
  -- them. Cancel them so the other side sees the real state immediately,
  -- instead of a live-looking offer that's already lost.
  update public.trades t
  set status = 'cancelled'
  where t.id <> p_trade_id
    and t.status = 'pending'
    and exists (
      select 1 from public.trade_items ti
      where ti.trade_id = t.id
        and ti.item_id = any(v_item_ids)
    );
end;
$$;

grant execute on function public.accept_trade(uuid) to authenticated;
