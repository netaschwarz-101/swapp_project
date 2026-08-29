-- Bug: "infinite recursion detected in policy for relation trade_items"
-- when creating a trade offer.
--
-- 0005_trades.sql created a real circular dependency between two RLS
-- policies, not just something that merely looks recursive:
--   - trade_items' INSERT policy ("initiator can insert trade_items for
--     their own trade") queries items directly, to check the item is
--     available and owned by the right side.
--   - items' SELECT policy ("items are readable when available or own",
--     extended by 0005) queries trade_items directly, to let trade
--     participants see items that are no longer 'available'.
-- When Postgres rewrites the trade_items INSERT, it has to expand items'
-- policy (to check the joined items rows), which in turn has to expand
-- trade_items' policy again (to evaluate its own subquery) — a genuine
-- table-A-queries-B / table-B-queries-A cycle. Postgres's rewriter
-- doesn't try to resolve this at all; it just refuses with "infinite
-- recursion detected in policy for relation ...".
--
-- Fix: move the trade_items lookup inside items' policy into a
-- SECURITY DEFINER function, same pattern already used for
-- complete_trade() in 0005_trades.sql. A SECURITY DEFINER function is
-- never inlined into the caller's query by the planner, so referencing
-- trade_items from inside it does not re-trigger trade_items' own RLS
-- expansion the way a direct correlated subquery does — which is what
-- breaks the cycle. The function still only ever reports "yes" for the
-- calling user's own trades (auth.uid() check inside it), so this isn't
-- an RLS bypass for anyone but the caller checking their own
-- participation.
create function public.is_trade_participant_for_item(p_item_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.trade_items ti
    join public.trades t on t.id = ti.trade_id
    where ti.item_id = p_item_id
      and (t.initiator_id = auth.uid() or t.responder_id = auth.uid())
  );
$$;

grant execute on function public.is_trade_participant_for_item(uuid) to authenticated;

alter policy "items are readable when available or own"
  on public.items
  to authenticated
  using (
    status = 'available'
    or owner_id = auth.uid()
    or public.is_trade_participant_for_item(items.id)
  );
