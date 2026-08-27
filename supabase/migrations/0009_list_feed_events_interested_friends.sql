-- list_feed_events(): add interested_friends so a card can name *who* marked
-- interest instead of only showing a bare count.
--
-- interest_count stays as-is — it's the true total across everyone, including
-- users the viewer can't see. interested_friends is the viewer-scoped subset,
-- so the two disagree by design: a card can legitimately read
-- interest_count = 1 with interested_friends = null when the one interested
-- person is a stranger to the viewer. The UI falls back to the count there.
--
-- Pre-filtered server-side rather than shipping every interested user and
-- filtering in the client: the client has no friend graph to filter against,
-- and doing it per card would be an N+1.
--
-- Scoped to e.id, matching interest_count. Forks are separate event rows and
-- event_interest is keyed by event_id, so interest never leaks between an
-- original and its forks — that falls out of the schema, no extra logic.
--
-- Return-shape change, so drop before create (same as 0007/0008).
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
  interested_friends   jsonb
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
    -- Viewer-centric visibility: a name appears if *the viewer* is friends
    -- with that interested person, regardless of that person's relationship
    -- to the event's poster. Because this function is SECURITY DEFINER the
    -- self-or-friends test below is a manual re-assertion of the same rule
    -- RLS would otherwise apply — it is load-bearing, not decorative.
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
