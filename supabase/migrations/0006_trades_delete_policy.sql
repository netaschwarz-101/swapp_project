-- Phase 4 follow-up: 0005_trades.sql shipped without a DELETE policy on
-- `trades`. createTrade's orphan-cleanup step (actions/trades.ts) tries to
-- delete the just-created trade row if the follow-up trade_items insert
-- fails, so that a failed offer never leaves a broken, itemless trade
-- sitting in someone's inbox. Without this policy, RLS silently blocks
-- that delete (no error — it just deletes zero rows), so every failed
-- attempt left an orphan behind instead of cleaning up after itself.
--
-- Scoped as narrowly as the actual use case: only the initiator, only
-- while the trade is still 'pending' (never accepted/declined/etc.), and
-- only while it has zero trade_items rows — i.e. exactly the "this
-- create attempt didn't finish" state, never a real trade with content.
create policy "initiator can delete an empty pending trade they created"
  on public.trades for delete
  to authenticated
  using (
    auth.uid() = initiator_id
    and status = 'pending'
    and not exists (
      select 1 from public.trade_items ti where ti.trade_id = trades.id
    )
  );
