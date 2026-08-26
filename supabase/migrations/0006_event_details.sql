-- Extra optional details on a posted event: an end time, a short freeform
-- note, and two either/or facts about the event itself. All four are
-- nullable — nothing here is required to post, matching the rest of the
-- form (only title and source_url are required).

alter table public.events
  add column if not exists end_datetime timestamptz,
  add column if not exists notes        text,
  add column if not exists price_type   text,
  add column if not exists rsvp_type    text;

-- Freeform but bounded — this is a short caption, not a description field.
-- A null note (not written) is fine; an empty-string note is not, so the UI
-- doesn't have to special-case "" vs null.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_notes_length'
  ) then
    alter table public.events
      add constraint events_notes_length check (
        notes is null or char_length(notes) between 1 and 150
      );
  end if;
end $$;

-- Either/or, but genuinely optional — no default. A toggle with no
-- selection stores null, not a guessed value.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_price_type_check'
  ) then
    alter table public.events
      add constraint events_price_type_check check (price_type in ('free', 'paid'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'events_rsvp_type_check'
  ) then
    alter table public.events
      add constraint events_rsvp_type_check check (rsvp_type in ('registration', 'drop_in'));
  end if;
end $$;

-- list_feed_events() (0005) needs to hand these through to the feed, same
-- pattern as every other event column. Postgres won't let create-or-replace
-- change a table function's return columns, so the old signature has to go
-- first.
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
  interest_count      bigint
)
language sql
stable
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.event_datetime,
    e.end_datetime,
    e.location,
    e.notes,
    e.price_type,
    e.rsvp_type,
    e.image_url,
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
    (select count(*) from public.event_interest i2 where i2.event_id = e.id)
  from public.events e
  join public.users u on u.id = e.posted_by
  order by e.created_at desc
  limit 500;
$$;

grant execute on function public.list_feed_events() to authenticated;