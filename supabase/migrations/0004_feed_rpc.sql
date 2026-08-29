-- Phase 3: feed functions.
--
-- Two small Postgres functions instead of building "random order" or
-- "newest across cities" in application code: `feed_items` powers the
-- logged-in "For You" feed (a random sample of available items in the
-- viewer's city, excluding their own listings), `newest_items` powers
-- the logged-out landing feed (newest available items across all
-- cities). Both are plain SQL functions (not SECURITY DEFINER), so they
-- run as whichever role called them and the existing items RLS policies
-- (0002_items.sql) still apply — this is a query helper, not an RLS
-- bypass. `order by random()` is fine at this project's scale (see
-- docs/scale.md); a production version would swap it for TABLESAMPLE or
-- a pre-computed feed table.

create function public.feed_items(
  p_city text,
  p_exclude_owner uuid default null,
  p_limit int default 24
)
returns setof public.items
language sql
stable
as $$
  select *
  from public.items
  where status = 'available'
    and city = p_city
    and (p_exclude_owner is null or owner_id <> p_exclude_owner)
  order by random()
  limit p_limit;
$$;

create function public.newest_items(p_limit int default 24)
returns setof public.items
language sql
stable
as $$
  select *
  from public.items
  where status = 'available'
  order by created_at desc
  limit p_limit;
$$;

grant execute on function public.feed_items(text, uuid, int) to anon, authenticated;
grant execute on function public.newest_items(int) to anon, authenticated;
