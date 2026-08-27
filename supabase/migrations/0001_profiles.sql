-- Phase 1: profiles table, auto-provisioning trigger, and RLS.
-- profiles.id mirrors auth.users.id 1:1 — this table only holds the
-- app-specific fields Supabase Auth doesn't store (username, city, avatar).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  city text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint username_length check (char_length(username) between 3 and 24),
  constraint city_allowed check (
    city in (
      'Tel Aviv', 'Jerusalem', 'Haifa', 'Beer Sheva', 'Rishon LeZion',
      'Petah Tikva', 'Netanya', 'Ashdod', 'Herzliya', 'Ramat Gan'
    )
  )
);

alter table public.profiles enable row level security;

-- Any authenticated user can read any profile (needed to show item owner
-- info, trade counterpart info, etc.) — profiles have no private fields.
create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may only ever modify their own profile row.
create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No direct insert/delete policy: rows are created only by the trigger
-- below (as the table owner, bypassing RLS) and are never deleted directly
-- (cascades from auth.users deletion instead).

-- Auto-create a profiles row whenever a new auth.users row appears, reading
-- username/city out of the signup call's user_metadata (see actions/auth.ts
-- -> supabase.auth.signUp({ options: { data: { username, city } } })).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, city)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'city'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
