# eventswithfriends

A lightweight signal layer for events: post something you're going to, and it
shows up in your friends' feeds framed as "I'm going — come if you want."
No ticketing, no RSVPs, no algorithmic feed. See [SPEC.md](./SPEC.md).

Next.js (App Router, TypeScript) · Supabase (Postgres + auth) · Tailwind v4 · Vercel

## Setup

1. Install deps:

   ```bash
   npm install
   ```

2. Create a Supabase project, then copy the env template and fill it in:

   ```bash
   cp .env.example .env.local
   ```

3. Apply the schema. Either paste the files in `supabase/migrations/` into the
   Supabase SQL editor in order, or with the CLI:

   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```

4. Auth is email + password. If you leave **Confirm email** on
   (**Authentication → Sign In / Providers → Email**), point the confirmation
   email at the server-side route: in **Authentication → Email Templates →
   Confirm signup**, replace the body link with

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
   ```

   The default template returns tokens in a URL fragment, which the server
   can't read. Also add `http://localhost:3000/**` to
   **Authentication → URL Configuration → Redirect URLs**.

   Turning **Confirm email** off skips all of that — signup returns a session
   immediately and the app signs you straight in. Fine for local development.

5. Run it:

   ```bash
   npm run dev
   ```

## Layout

```
src/
  app/
    login/          email + password sign-in / sign-up (page, form, actions)
    auth/confirm/   emailed-link landing — verifies token_hash
    auth/callback/  PKCE code exchange
    page.tsx        feed (stub)
    friends/        friend requests (stub)
    post/           paste-a-link event posting (stub)
  components/       Window chrome, buttons, avatar chips
  lib/
    supabase/       browser / server / proxy clients
    auth.ts         getCurrentProfile, requireProfile
    database.types.ts
  proxy.ts          session refresh + route gating (Next 16 middleware)
supabase/migrations/
  0001_init.sql     tables, indexes, RLS policies, signup trigger
  0002_grants.sql   table privileges for the `authenticated` role
```

## Data model notes

- `public.users` mirrors `auth.users`; rows are created by the
  `on_auth_user_created` trigger, never by the app.
- `friendships` stores one row per pair with `user_a < user_b` enforced by a
  check constraint, so a duplicate can't be created by swapping the columns.
  Use the `friendship_pair(one, two)` SQL helper to build the ordered tuple.
- Privileges are granted explicitly in `0002_grants.sql` rather than relying on
  Supabase's default privileges. RLS filters rows, but Postgres checks the
  table-level GRANT first — without it every query fails with `42501`.
- RLS: events are readable by the poster and accepted friends only
  (`are_friends()`); only the *recipient* of a request can flip it to
  `accepted`. Profiles are readable by any signed-in user so the Friends page
  can search by name.

## Build status

- [x] 1 — Auth + `users` table + login (email + password, not the magic link
      in SPEC.md — changed deliberately)
- [ ] 2 — Friend request flow (tables and policies exist; UI pending)
- [ ] 3 — Link scraping (JSON-LD → Open Graph) + confirm screen
- [ ] 4 — Feed + "I'm interested" toggle
- [ ] 5 — Visual polish pass across all screens
