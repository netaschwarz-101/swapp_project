-- Phase 2: items table + RLS.
--
-- Note on the "belongs to a trade the user participates in" read clause from
-- docs/technical-design.md's RLS sketch: trades/trade_items don't exist yet
-- (Phase 4), so that clause is added to this policy in the Phase 4 migration
-- via `alter policy`. For now, read access is available-to-everyone-signed-in
-- plus owner-can-always-see-own (including their own traded/deleted items).

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null,
  condition text not null,
  city text not null,
  status text not null default 'available',
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint title_length check (char_length(title) between 1 and 80),
  constraint description_length check (char_length(description) <= 1000),
  constraint category_allowed check (
    category in ('clothing', 'electronics', 'books', 'home', 'sports', 'other')
  ),
  constraint condition_allowed check (
    condition in ('new', 'like_new', 'used', 'worn')
  ),
  constraint status_allowed check (status in ('available', 'traded', 'deleted')),
  constraint image_count check (array_length(image_urls, 1) between 1 and 4)
);

create index items_feed_idx on public.items (city, status, created_at desc);
create index items_owner_idx on public.items (owner_id);

alter table public.items enable row level security;

-- Any authenticated user can see available items (the feed/search) or their
-- own items regardless of status (so "my-items" shows traded/deleted too).
create policy "items are readable when available or own"
  on public.items for select
  to authenticated
  using (status = 'available' or owner_id = auth.uid());

-- Logged-out visitors still see the public "newest across all cities" feed
-- (per docs/product-spec.md §6) — available items only, never someone's
-- traded/deleted listings.
create policy "available items are readable by anyone"
  on public.items for select
  to anon
  using (status = 'available');

create policy "users can insert their own items"
  on public.items for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "users can update their own items"
  on public.items for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "users can delete their own items"
  on public.items for delete
  to authenticated
  using (owner_id = auth.uid());
