-- Private friend tags + per-event audience scoping.
--
-- tags/tag_members are owner-only by RLS with no exceptions — that's what
-- actually makes tagging private. There is no policy anywhere that lets a
-- tagged friend read their own tag_members row, so there's no query path to
-- discover it, even indirectly.
--
-- Stale tag_members after an unfriend are left as-is on purpose: every
-- consumer of can_view_event_audience() only reaches it after an
-- are_friends() check already passed (see the events policy and
-- list_feed_events() below), so a stale row on an ex-friend never gets a
-- chance to matter.

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),

  constraint tags_name_length check (char_length(name) between 1 and 30)
);

create unique index tags_owner_lower_name_idx on public.tags (owner_id, lower(name));
create index tags_owner_id_idx on public.tags (owner_id);

-- ---------------------------------------------------------------------------
-- tag_members
-- ---------------------------------------------------------------------------
create table public.tag_members (
  id         uuid primary key default gen_random_uuid(),
  tag_id     uuid not null references public.tags (id) on delete cascade,
  friend_id  uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint tag_members_unique unique (tag_id, friend_id)
);

create index tag_members_tag_id_idx on public.tag_members (tag_id);
create index tag_members_friend_id_idx on public.tag_members (friend_id);

-- ---------------------------------------------------------------------------
-- events.audience_mode + event_tags
-- ---------------------------------------------------------------------------
alter table public.events
  add column audience_mode text not null default 'all'
  check (audience_mode in ('all', 'tags'));

create table public.event_tags (
  id       uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,

  constraint event_tags_unique unique (event_id, tag_id)
);

create index event_tags_event_id_idx on public.event_tags (event_id);
create index event_tags_tag_id_idx on public.event_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Row level security — tags/tag_members
-- ---------------------------------------------------------------------------
alter table public.tags enable row level security;
alter table public.tag_members enable row level security;
alter table public.event_tags enable row level security;

-- RLS decides which rows a request can touch, but Postgres checks
-- table-level GRANTs first — same lesson as 0002_grants.sql. This project
-- doesn't inherit default privileges, so every new table needs this
-- explicitly or the app role hits "42501 permission denied" before any
-- policy even runs. anon gets nothing, same as everywhere else in the app.
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, delete on public.tag_members to authenticated;
grant select, insert, delete on public.event_tags to authenticated;

create policy "owner reads own tags"
  on public.tags for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "owner creates own tags"
  on public.tags for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "owner renames own tags"
  on public.tags for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner deletes own tags"
  on public.tags for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "owner reads own tag members"
  on public.tag_members for select
  to authenticated
  using (
    exists (
      select 1 from public.tags t
      where t.id = tag_id and t.owner_id = (select auth.uid())
    )
  );

create policy "owner adds tag members"
  on public.tag_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tags t
      where t.id = tag_id and t.owner_id = (select auth.uid())
    )
    and public.are_friends((select auth.uid()), friend_id)
  );

create policy "owner removes tag members"
  on public.tag_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.tags t
      where t.id = tag_id and t.owner_id = (select auth.uid())
    )
  );

-- event_tags: only the event's own poster, scoped to their own tags.
create policy "poster reads own event tags"
  on public.event_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.posted_by = (select auth.uid())
    )
  );

create policy "poster sets own event tags"
  on public.event_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.posted_by = (select auth.uid())
    )
    and exists (
      select 1 from public.tags t
      where t.id = tag_id and t.owner_id = (select auth.uid())
    )
  );

create policy "poster clears own event tags"
  on public.event_tags for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.posted_by = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- can_view_event_audience
--
-- security definer: a viewer isn't allowed to read the poster's tag_members
-- directly (RLS above is owner-only), so this needs to bypass that and hand
-- back a plain yes/no instead.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_event_audience(viewer uuid, target_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.audience_mode = 'all' then true
    else exists (
      select 1
      from public.event_tags et
      join public.tag_members tm on tm.tag_id = et.tag_id
      where et.event_id = e.id
        and tm.friend_id = viewer
    )
  end
  from public.events e
  where e.id = target_event;
$$;

grant execute on function public.can_view_event_audience(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- events SELECT policy — fold in the audience check. Poster still always
-- sees their own events regardless of audience_mode.
-- ---------------------------------------------------------------------------
drop policy "friends can read events" on public.events;

create policy "friends can read events"
  on public.events for select
  to authenticated
  using (
    posted_by = (select auth.uid())
    or (
      public.are_friends((select auth.uid()), posted_by)
      and public.can_view_event_audience((select auth.uid()), id)
    )
  );

-- ---------------------------------------------------------------------------
-- event_interest insert policy — same audience check, so someone outside the
-- audience can't mark interest via a direct RPC call even if they somehow
-- had the event id.
-- ---------------------------------------------------------------------------
drop policy "users can mark themselves interested" on public.event_interest;

create policy "users can mark themselves interested"
  on public.event_interest for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and public.are_friends((select auth.uid()), e.posted_by)
        and public.can_view_event_audience((select auth.uid()), e.id)
    )
  );

-- ---------------------------------------------------------------------------
-- list_feed_events() — security definer, so it bypasses table RLS and has to
-- re-assert the same audience rule by hand, same as the existing
-- friend-visibility check. Return shape changes here (audience_mode +
-- audience_tags added at the end), so drop before create — same as 0007/
-- 0008/0009. create or replace alone fails with 42P13 for a return-column
-- change.
--
-- audience_tags is only ever populated when the row is is_mine — it names
-- the poster's own private tags, so it must never be computed for anyone
-- else's event even though this function is security definer and could
-- technically read across owners.
-- ---------------------------------------------------------------------------
drop function if exists public.list_feed_events();

create function public.list_feed_events()
returns table (
  id                   uuid,
  title                text,
  event_datetime       timestamptz,
  end_datetime         timestamptz,
  location             text,
  notes                text,
  price_type           text,
  rsvp_type            text,
  image_url            text,
  source_url           text,
  created_at           timestamptz,
  posted_by            uuid,
  poster_display_name  text,
  poster_handle        text,
  poster_avatar_url    text,
  is_mine              boolean,
  is_interested        boolean,
  interest_count       bigint,
  is_fork              boolean,
  already_forked_by_me boolean,
  interested_friends   jsonb,
  audience_mode        text,
  audience_tags        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    coalesce(r.title, e.title),
    coalesce(r.event_datetime, e.event_datetime),
    coalesce(r.end_datetime, e.end_datetime),
    coalesce(r.location, e.location),
    e.notes,
    coalesce(r.price_type, e.price_type),
    coalesce(r.rsvp_type, e.rsvp_type),
    coalesce(r.image_url, e.image_url),
    e.source_url,
    e.created_at,
    e.posted_by,
    u.display_name,
    u.handle,
    u.avatar_url,
    e.posted_by = (select auth.uid()),
    exists (
      select 1 from public.event_interest i
      where i.event_id = e.id
        and i.user_id = (select auth.uid())
    ),
    (select count(*) from public.event_interest i2 where i2.event_id = e.id),
    e.forked_from_event_id is not null,
    exists (
      select 1 from public.events f
      where f.forked_from_event_id = e.id
        and f.posted_by = (select auth.uid())
    ),
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', iu.id,
          'display_name', iu.display_name,
          'handle', iu.handle,
          'avatar_url', iu.avatar_url
        ) order by ei.created_at
      )
      from public.event_interest ei
      join public.users iu on iu.id = ei.user_id
      where ei.event_id = e.id
        and (
          iu.id = (select auth.uid())
          or public.are_friends((select auth.uid()), iu.id)
        )
    ),
    e.audience_mode,
    case
      when e.posted_by = (select auth.uid()) and e.audience_mode = 'tags' then (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'member_count', (
              select count(*) from public.tag_members tm where tm.tag_id = t.id
            )
          ) order by t.name
        )
        from public.event_tags et
        join public.tags t on t.id = et.tag_id
        where et.event_id = e.id
      )
      else null
    end
  from public.events e
  join public.users u on u.id = e.posted_by
  left join public.events r on r.id = e.root_event_id and r.id <> e.id
  where
    e.deleted_at is null
    and (
      e.posted_by = (select auth.uid())
      or (
        public.are_friends((select auth.uid()), e.posted_by)
        and public.can_view_event_audience((select auth.uid()), e.id)
      )
    )
  order by e.created_at desc
  limit 500;
$$;

grant execute on function public.list_feed_events() to authenticated;

-- ---------------------------------------------------------------------------
-- list_tags()
--
-- security invoker is enough here (unlike list_feed_events) because RLS on
-- tags/tag_members already scopes correctly for a direct owner query — same
-- pattern as list_friendships().
-- ---------------------------------------------------------------------------
create or replace function public.list_tags()
returns table (
  tag_id     uuid,
  name       text,
  created_at timestamptz,
  members    jsonb
)
language sql
stable
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.created_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'display_name', u.display_name,
          'handle', u.handle,
          'avatar_url', u.avatar_url
        ) order by u.display_name
      )
      from public.tag_members tm
      join public.users u on u.id = tm.friend_id
      where tm.tag_id = t.id
    ), '[]'::jsonb)
  from public.tags t
  where t.owner_id = (select auth.uid())
  order by t.name;
$$;

grant execute on function public.list_tags() to authenticated;

-- ---------------------------------------------------------------------------
-- set_friend_tags(friend_id, tag_ids)
--
-- Syncs one friend's tag membership to exactly the given set in one round
-- trip, rather than one insert/delete per checkbox toggle. security invoker:
-- RLS on tag_members already enforces "only my own tags, only actual
-- friends", so no bypass is needed or wanted here.
-- ---------------------------------------------------------------------------
create or replace function public.set_friend_tags(p_friend_id uuid, p_tag_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.tag_members
  where friend_id = p_friend_id
    and tag_id in (
      select t.id from public.tags t where t.owner_id = (select auth.uid())
    )
    and tag_id <> all (p_tag_ids);

  insert into public.tag_members (tag_id, friend_id)
  select tid, p_friend_id
  from unnest(p_tag_ids) as tid
  on conflict (tag_id, friend_id) do nothing;
end;
$$;

grant execute on function public.set_friend_tags(uuid, uuid[]) to authenticated;