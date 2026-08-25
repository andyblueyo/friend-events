-- eventswithfriends — initial schema
-- users, friendships, events, event_interest + row level security.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- users
-- Mirrors auth.users. A row is created automatically by the handle_new_user
-- trigger at the bottom of this file, so the app never inserts here directly.
-- ---------------------------------------------------------------------------
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create index users_display_name_idx on public.users (lower(display_name));

-- ---------------------------------------------------------------------------
-- friendships
-- Mutual only: one row per pair, stored with user_a < user_b so the pair is
-- canonical and the unique constraint can't be dodged by swapping columns.
-- Use public.friendship_pair() to build the ordered tuple from the app.
-- ---------------------------------------------------------------------------
create type public.friendship_status as enum ('pending', 'accepted');

create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  user_a       uuid not null references public.users (id) on delete cascade,
  user_b       uuid not null references public.users (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  requested_by uuid not null references public.users (id) on delete cascade,
  created_at   timestamptz not null default now(),

  constraint friendships_canonical_order check (user_a < user_b),
  constraint friendships_requester_is_member check (requested_by in (user_a, user_b)),
  constraint friendships_unique_pair unique (user_a, user_b)
);

create index friendships_user_a_idx on public.friendships (user_a);
create index friendships_user_b_idx on public.friendships (user_b);

-- ---------------------------------------------------------------------------
-- events
-- event_datetime and location are nullable: scraping often misses them and the
-- confirm screen lets the poster leave them blank.
-- ---------------------------------------------------------------------------
create table public.events (
  id             uuid primary key default gen_random_uuid(),
  posted_by      uuid not null references public.users (id) on delete cascade,
  title          text not null,
  event_datetime timestamptz,
  location       text,
  image_url      text,
  source_url     text not null,
  created_at     timestamptz not null default now()
);

-- The feed is reverse-chronological by post time, scoped to friends.
create index events_posted_by_created_at_idx on public.events (posted_by, created_at desc);

-- ---------------------------------------------------------------------------
-- event_interest
-- A soft signal, not an RSVP. One per (event, user).
-- ---------------------------------------------------------------------------
create table public.event_interest (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint event_interest_unique unique (event_id, user_id)
);

create index event_interest_event_id_idx on public.event_interest (event_id);
create index event_interest_user_id_idx on public.event_interest (user_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Ordered (user_a, user_b) tuple for a pair, so callers don't have to sort.
create or replace function public.friendship_pair(one uuid, two uuid)
returns table (user_a uuid, user_b uuid)
language sql
immutable
as $$
  select least(one, two), greatest(one, two);
$$;

-- security definer so the policies below can read friendships without
-- recursing back through friendships' own RLS.
create or replace function public.are_friends(one uuid, two uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and f.user_a = least(one, two)
      and f.user_b = greatest(one, two)
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.users          enable row level security;
alter table public.friendships    enable row level security;
alter table public.events         enable row level security;
alter table public.event_interest enable row level security;

-- users -------------------------------------------------------------------
-- Any signed-in user can read profiles: the Friends page searches by name, so
-- you have to be able to find someone before you can request them. Profiles
-- hold only display name and avatar; nothing else is exposed by this table.
create policy "users are readable by signed-in users"
  on public.users for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.users for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- friendships ---------------------------------------------------------------
create policy "members can read their friendships"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "users can request friendships they are part of"
  on public.friendships for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and (select auth.uid()) in (user_a, user_b)
    and status = 'pending'
  );

-- Only the recipient can accept. The requester can't self-accept because
-- requested_by is excluded here.
create policy "recipients can accept a pending request"
  on public.friendships for update
  to authenticated
  using (
    status = 'pending'
    and (select auth.uid()) in (user_a, user_b)
    and requested_by <> (select auth.uid())
  )
  with check (status = 'accepted');

-- Covers decline, cancel a sent request, and unfriend.
create policy "members can remove a friendship"
  on public.friendships for delete
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- events --------------------------------------------------------------------
create policy "friends can read events"
  on public.events for select
  to authenticated
  using (
    posted_by = (select auth.uid())
    or public.are_friends((select auth.uid()), posted_by)
  );

create policy "users can post their own events"
  on public.events for insert
  to authenticated
  with check (posted_by = (select auth.uid()));

create policy "users can edit their own events"
  on public.events for update
  to authenticated
  using (posted_by = (select auth.uid()))
  with check (posted_by = (select auth.uid()));

create policy "users can delete their own events"
  on public.events for delete
  to authenticated
  using (posted_by = (select auth.uid()));

-- event_interest ------------------------------------------------------------
-- Interest is visible to anyone who can see the event, so the card can show
-- the avatar stack.
create policy "interest is readable with the event"
  on public.event_interest for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (
          e.posted_by = (select auth.uid())
          or public.are_friends((select auth.uid()), e.posted_by)
        )
    )
  );

create policy "users can mark themselves interested"
  on public.event_interest for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and public.are_friends((select auth.uid()), e.posted_by)
    )
  );

create policy "users can withdraw their own interest"
  on public.event_interest for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Provision a public.users row on signup.
-- display_name comes from the magic-link signInWithOtp `data` payload; falls
-- back to the local part of the email.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
