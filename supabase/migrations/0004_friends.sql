-- Query helpers for the friends page.
--
-- Both are SECURITY INVOKER (the default) on purpose: RLS then applies as the
-- caller, so friendships rows stay scoped to the person asking and we don't
-- have to re-implement the policy in SQL.

-- ---------------------------------------------------------------------------
-- search_people
--
-- Matches display_name as a substring or handle as a prefix, and returns the
-- relationship state alongside each hit so the UI doesn't need an N+1 lookup
-- per result.
-- ---------------------------------------------------------------------------
create or replace function public.search_people(q text)
returns table (
  id           uuid,
  display_name text,
  handle       text,
  avatar_url   text,
  friendship_id uuid,
  state        text
)
language sql
stable
set search_path = public
as $$
  with needle as (
    -- '_' is legal in handles, and '%'/'_' are LIKE wildcards, so escape them
    -- before interpolating or a search for "a_b" quietly matches "axb".
    select replace(replace(replace(trim(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') as pattern,
           trim(coalesce(q, '')) as raw
  )
  select
    u.id,
    u.display_name,
    u.handle,
    u.avatar_url,
    f.id,
    case
      when f.id is null                          then 'none'
      when f.status = 'accepted'                 then 'friends'
      when f.requested_by = (select auth.uid())  then 'pending_sent'
      else                                            'pending_received'
    end
  from public.users u
  cross join needle n
  left join public.friendships f
    on f.user_a = least(u.id, (select auth.uid()))
   and f.user_b = greatest(u.id, (select auth.uid()))
  where u.id <> (select auth.uid())
    -- Two characters minimum: a single letter would effectively list the whole
    -- user table, which is the "no public discovery" line in SPEC.md.
    and length(n.raw) >= 2
    and (
      u.display_name ilike '%' || n.pattern || '%' escape '\'
      or u.handle ilike n.pattern || '%' escape '\'
    )
  order by
    -- Exact handle match first, then handle prefixes, then name matches.
    (u.handle = n.raw) desc,
    (u.handle ilike n.pattern || '%' escape '\') desc,
    u.display_name
  limit 20;
$$;

grant execute on function public.search_people(text) to authenticated;

-- ---------------------------------------------------------------------------
-- list_friendships
--
-- Every friendship the caller is part of, with the *other* person's profile
-- already joined. The page splits these into received / sent / accepted.
-- ---------------------------------------------------------------------------
create or replace function public.list_friendships()
returns table (
  friendship_id      uuid,
  status             public.friendship_status,
  requested_by       uuid,
  created_at         timestamptz,
  other_id           uuid,
  other_display_name text,
  other_handle       text,
  other_avatar_url   text
)
language sql
stable
set search_path = public
as $$
  select
    f.id,
    f.status,
    f.requested_by,
    f.created_at,
    u.id,
    u.display_name,
    u.handle,
    u.avatar_url
  from public.friendships f
  join public.users u
    on u.id = case
                when f.user_a = (select auth.uid()) then f.user_b
                else f.user_a
              end
  where (select auth.uid()) in (f.user_a, f.user_b)
  order by f.created_at desc;
$$;

grant execute on function public.list_friendships() to authenticated;
