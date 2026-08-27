-- fork_event() gains an audience_mode param so a reshare can be scoped to
-- tags too, same as a plain post. Signature changes (new param), so drop
-- before create — a bare "or replace" would leave the old 1-arg overload
-- alongside the new one instead of replacing it, and PostgREST would then
-- have two candidates to choose between for the same call.
drop function if exists public.fork_event(uuid);

create function public.fork_event(p_event_id uuid, p_audience_mode text default 'all')
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_url text;
  v_new_id     uuid;
begin
  if p_audience_mode not in ('all', 'tags') then
    raise exception 'invalid audience mode';
  end if;

  select source_url into v_source_url
  from public.events
  where id = p_event_id;

  if v_source_url is null then
    raise exception 'event not found';
  end if;

  insert into public.events (posted_by, forked_from_event_id, source_url, audience_mode)
  values ((select auth.uid()), p_event_id, v_source_url, p_audience_mode)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.fork_event(uuid, text) to authenticated;
