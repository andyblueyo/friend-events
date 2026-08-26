-- Forking: reshare a friend's event to your own friends as your own post,
-- with no reference back to who you got it from. Content (title, date,
-- location, image, price/rsvp) stays live-linked to the original for as
-- long as the original exists; source_url is copied at fork time so the
-- real link survives even if the original poster deletes their post.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists forked_from_event_id uuid references public.events (id),
  add column if not exists root_event_id        uuid references public.events (id),
  add column if not exists deleted_at            timestamptz;

-- Backfill: every row that predates this migration is its own root.
update public.events set root_event_id = id where root_event_id is null;

alter table public.events alter column root_event_id set not null;

-- A fork carries no title of its own — it resolves through root_event_id at
-- read time — so title can no longer be unconditionally required.
alter table public.events alter column title drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_fork_or_titled'
  ) then
    alter table public.events
      add constraint events_fork_or_titled
      check (forked_from_event_id is not null or title is not null);
  end if;
end $$;

-- Sets root_event_id automatically: a plain post points at itself, a fork
-- points at whatever its immediate parent's root already is (so chains of
-- any depth resolve in one join, never a recursive walk).
create or replace function public.set_root_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.forked_from_event_id is null then
    new.root_event_id := new.id;
  else
    select root_event_id into new.root_event_id
    from public.events
    where id = new.forked_from_event_id;

    if new.root_event_id is null then
      raise exception 'cannot fork: parent event not found';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_set_root on public.events;
create trigger events_set_root
  before insert on public.events
  for each row execute function public.set_root_event_id();

-- ---------------------------------------------------------------------------
-- RLS: hide a soft-deleted root from feeds. Forks are separate rows with
-- their own posted_by, so they were never gated by this policy to begin
-- with — deleting a root has no effect on them.
-- ---------------------------------------------------------------------------
alter policy "friends can read events"
  on public.events
  using (
    deleted_at is null
    and (
      posted_by = (select auth.uid())
      or public.are_friends((select auth.uid()), posted_by)
    )
  );

-- ---------------------------------------------------------------------------
-- fork_event(): create a fork of an event the caller can already see.
-- SECURITY INVOKER — the source-row read and the new-row insert are both
-- covered by existing RLS, so no privilege escalation is needed here.
-- ---------------------------------------------------------------------------
create or replace function public.fork_event(p_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_url text;
  v_new_id     uuid;
begin
  select source_url into v_source_url
  from public.events
  where id = p_event_id;

  if v_source_url is null then
    raise exception 'event not found';
  end if;

  insert into public.events (posted_by, forked_from_event_id, source_url)
  values ((select auth.uid()), p_event_id, v_source_url)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.fork_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_event(): a fork always hard-deletes. A root with no forks hard-
-- deletes. A root with forks soft-deletes so the forks are unaffected.
-- SECURITY DEFINER since the has-forks check needs to see fork rows the
-- deleter may not otherwise have SELECT access to (their forker might not
-- be the deleter's friend).
-- ---------------------------------------------------------------------------
create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_forked_from uuid;
  v_has_forks   boolean;
begin
  select forked_from_event_id into v_forked_from
  from public.events
  where id = p_event_id and posted_by = (select auth.uid());

  if not found then
    raise exception 'event not found';
  end if;

  if v_forked_from is not null then
    delete from public.events where id = p_event_id;
    return;
  end if;

  select exists (
    select 1 from public.events where root_event_id = p_event_id and id <> p_event_id
  ) into v_has_forks;

  if v_has_forks then
    update public.events set deleted_at = now() where id = p_event_id;
  else
    delete from public.events where id = p_event_id;
  end if;
end;
$$;

grant execute on function public.delete_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_feed_events(): SECURITY DEFINER so a fork's content can be read
-- through root_event_id even when the caller isn't friends with the root's
-- poster. The visibility rule from the RLS policy is re-asserted explicitly
-- in the WHERE clause below — required precisely because SECURITY DEFINER
-- bypasses RLS, and this is the one place that bypass has to be manual and
-- exact instead of inherited.
-- ---------------------------------------------------------------------------
drop function if exists public.list_feed_events();

create function public.list_feed_events()
returns table (
  id                  uuid,
  title               text,
  event_datetime      timestamptz,
  end_datetime        timestamptz,
  location            text,
  notes               text,
  price_type          text,
  rsvp_type           text,
  image_url           text,
  source_url          text,
  created_at          timestamptz,
  posted_by           uuid,
  poster_display_name text,
  poster_handle       text,
  poster_avatar_url   text,
  is_mine             boolean,
  is_interested       boolean,
  interest_count      bigint,
  is_fork             boolean
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
    e.forked_from_event_id is not null
  from public.events e
  join public.users u on u.id = e.posted_by
  left join public.events r on r.id = e.root_event_id and r.id <> e.id
  where
    e.deleted_at is null
    and (
      e.posted_by = (select auth.uid())
      or public.are_friends((select auth.uid()), e.posted_by)
    )
  order by e.created_at desc
  limit 500;
$$;

grant execute on function public.list_feed_events() to authenticated;
