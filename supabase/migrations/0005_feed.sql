-- Feed query.
--
-- SECURITY INVOKER (the default) so the existing "friends can read events"
-- policy on public.events does the visibility filtering: the caller sees their
-- own posts plus accepted friends' posts, and nothing else. No new RLS policy
-- is needed for this feature — 0001 already encodes exactly that rule.
--
-- Follows the list_friendships()/search_people() convention from 0004: one
-- function returning the joined, computed shape the page needs, instead of
-- client-side joins or an N+1 per card.

create or replace function public.list_feed_events()
returns table (
  id                  uuid,
  title               text,
  event_datetime      timestamptz,
  location            text,
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
    e.location,
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
  -- Default ordering; the page re-sorts client-side for its toggle. Bounded so
  -- a busy account can't pull an unbounded result set into memory.
  order by e.created_at desc
  limit 500;
$$;

grant execute on function public.list_feed_events() to authenticated;
