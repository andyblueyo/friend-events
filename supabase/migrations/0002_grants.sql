-- Explicit table privileges, plus a self-heal insert policy for profiles.
--
-- RLS decides which *rows* a request can touch, but Postgres still checks
-- table-level GRANTs first. Supabase projects normally hand these out via
-- default privileges; this project didn't get them, so the app role would hit
-- "42501 permission denied" before any policy ran. Granting explicitly also
-- makes the schema self-contained instead of depending on project defaults.
--
-- `anon` deliberately gets nothing: every screen in the app requires sign-in.
-- Safe to re-run.

grant usage on schema public to authenticated;

grant select, insert, update on public.users to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, delete on public.event_interest to authenticated;

grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.friendship_pair(uuid, uuid) to authenticated;

-- Lets a signed-in user create their *own* profile row if the
-- handle_new_user trigger didn't produce one. Without this, an account with a
-- session but no profile has no way forward. Restricted to auth.uid(), so
-- nobody can manufacture a row for someone else.
drop policy if exists "users can create their own profile" on public.users;
create policy "users can create their own profile"
  on public.users for insert
  to authenticated
  with check (id = (select auth.uid()));

-- Report what the app role ended up with.
select
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in ('users', 'friendships', 'events', 'event_interest')
group by table_name
order by table_name;
