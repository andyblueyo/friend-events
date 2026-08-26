-- Unique @handle on public.users.
--
-- Handles are lowercase [a-z0-9_], 3-20 chars, enforced by CHECK so bad data
-- can't arrive from outside the app. Because the character set forbids
-- uppercase, a plain UNIQUE is enough — no citext needed.

alter table public.users add column if not exists handle text;

-- ---------------------------------------------------------------------------
-- Handle generation, used by the backfill below and by the signup trigger when
-- someone is created without one (e.g. straight from the Supabase dashboard).
-- ---------------------------------------------------------------------------

-- Strips a seed down to the legal character set and leaves room for a suffix.
create or replace function public.slugify_handle(seed text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      substring(regexp_replace(lower(coalesce(seed, '')), '[^a-z0-9_]', '', 'g') from 1 for 15),
      ''
    ),
    'friend'
  );
$$;

create or replace function public.generate_unique_handle(seed text)
returns text
language plpgsql
set search_path = public
as $$
declare
  base      text := public.slugify_handle(seed);
  candidate text;
  attempts  int := 0;
begin
  -- The CHECK needs at least 3 characters; short seeds get padded.
  while length(base) < 3 loop
    base := base || '0';
  end loop;

  candidate := base;

  -- base is at most 15 chars, so base + '_' + 4 hex stays inside the 20 cap.
  while exists (select 1 from public.users where handle = candidate) loop
    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'could not generate a unique handle from seed %', seed;
    end if;
    candidate := base || '_' ||
      substring(md5(random()::text || clock_timestamp()::text) from 1 for 4);
  end loop;

  return candidate;
end;
$$;

-- Internal helpers: the trigger runs them as owner, nobody else needs them.
-- Postgres grants EXECUTE to PUBLIC by default, so revoke explicitly.
revoke execute on function public.slugify_handle(text) from public;
revoke execute on function public.generate_unique_handle(text) from public;

-- ---------------------------------------------------------------------------
-- Backfill. Row at a time so each generated handle is visible to the
-- uniqueness check for the next one — a set-based UPDATE wouldn't see its own
-- in-flight rows and could emit duplicates.
-- ---------------------------------------------------------------------------
do $$
declare
  row_to_fill record;
begin
  for row_to_fill in
    select id, display_name, email from public.users where handle is null
  loop
    update public.users
       set handle = public.generate_unique_handle(
         coalesce(nullif(trim(row_to_fill.display_name), ''),
                  split_part(row_to_fill.email, '@', 1))
       )
     where id = row_to_fill.id;
  end loop;
end;
$$;

-- Verify before tightening: NOT NULL below is only safe if the backfill really
-- covered every row.
do $$
begin
  if exists (select 1 from public.users where handle is null) then
    raise exception 'backfill left null handles — not adding NOT NULL';
  end if;
  if exists (select 1 from public.users where handle !~ '^[a-z0-9_]{3,20}$') then
    raise exception 'backfill produced handles that fail the format check';
  end if;
end;
$$;

alter table public.users
  add constraint users_handle_format check (handle ~ '^[a-z0-9_]{3,20}$');

alter table public.users
  add constraint users_handle_unique unique (handle);

alter table public.users
  alter column handle set not null;

-- ---------------------------------------------------------------------------
-- Availability check for the signup form.
--
-- security definer + granted to anon because the person signing up has no
-- session yet, so RLS would hide public.users from them entirely. It only
-- answers yes/no for one candidate at a time.
-- ---------------------------------------------------------------------------
create or replace function public.handle_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select candidate ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.users u where u.handle = candidate);
$$;

grant execute on function public.handle_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signup trigger now carries the handle through from auth metadata.
-- Extending the existing trigger rather than doing a follow-up UPDATE keeps
-- profile creation atomic with the auth row — a duplicate handle rolls the
-- whole signup back instead of leaving an account with no handle.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_handle       text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  v_handle := nullif(trim(lower(new.raw_user_meta_data ->> 'handle')), '');
  if v_handle is null or v_handle !~ '^[a-z0-9_]{3,20}$' then
    v_handle := public.generate_unique_handle(v_display_name);
  end if;

  insert into public.users (id, email, display_name, handle, avatar_url)
  values (
    new.id,
    new.email,
    v_display_name,
    v_handle,
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

select handle, display_name, email from public.users order by created_at;
