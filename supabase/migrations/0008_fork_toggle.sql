-- One fork per (event, forker). A partial unique index rather than a plain
-- one: forked_from_event_id is null for every root post, and a plain unique
-- constraint would already treat those nulls as distinct from each other —
-- the "where" clause is here for clarity, not because it changes behavior.
create unique index if not exists events_one_fork_per_user
  on public.events (posted_by, forked_from_event_id)
  where forked_from_event_id is not null;

-- list_feed_events(): add already_forked_by_me so the "share to my friends"
-- button can render as already-toggled, same shape as is_interested.
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
  already_forked_by_me boolean
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
    )
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
