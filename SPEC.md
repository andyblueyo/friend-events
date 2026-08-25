# eventswithfriends — build spec

## What this is
A web app where friends post events they're going to and are open to having friends tag along. It's not a calendar and not a ticketing platform — it's a lightweight signal layer. When you post an event, it means "I'm going, come if you want." Friends can mark themselves interested (a soft signal, not an RSVP), then click through to the original event page (Partiful, Luma, Eventbrite, whatever) to actually register or buy a ticket themselves.

Repo: https://github.com/andyblueyo/friend-events

## Core principles
- **Not a listing board.** Every post is framed as an invite from a specific person, not a neutral event entry.
- **No ranking or algorithmic feed.** Reverse-chronological only.
- **No ticketing or registration in-app.** "Interested" is just awareness. The original link is always front and center.
- **Mutual friending only**, like Facebook — both people accept. No public discovery, no groups, no contact import for v1.

## Tech stack
- Next.js (TypeScript, App Router)
- Supabase (Postgres + auth + storage)
- Cheerio for server-side link scraping (Open Graph tags + schema.org/Event JSON-LD)
- Deploy target: Vercel

## Data model
```
users
  id (uuid, pk)
  email
  display_name
  avatar_url (nullable)
  created_at

friendships
  id (uuid, pk)
  user_a (uuid, fk -> users.id)
  user_b (uuid, fk -> users.id)
  status (enum: pending, accepted)
  requested_by (uuid, fk -> users.id)
  created_at

events
  id (uuid, pk)
  posted_by (uuid, fk -> users.id)
  title
  event_datetime (timestamptz, nullable — scrape may fail to find it)
  location (text, nullable)
  image_url (nullable)
  source_url (text, required — the original event link)
  created_at

event_interest
  id (uuid, pk)
  event_id (uuid, fk -> events.id)
  user_id (uuid, fk -> users.id)
  created_at
  -- unique constraint on (event_id, user_id)
```

## Link scraping logic
When a user pastes a URL:
1. Fetch the page server-side.
2. Try `schema.org/Event` JSON-LD first (most reliable — Luma and Eventbrite usually have it). Pull `name`, `startDate`, `location.name` or `location.address`.
3. Fall back to Open Graph tags (`og:title`, `og:image`, `og:description`) if no structured data.
4. Always preserve the original URL as `source_url`, regardless of what else was found.
5. Show a confirm/edit screen with whatever was found pre-filled — date and location fields are editable text, not auto-locked, since scraping won't always get it right.

## Pages
1. **Login** — Supabase auth, email magic link.
2. **Feed** (`/`) — reverse-chronological list of events posted by accepted friends. Each card: poster's name + avatar, "is going", event title, date/time, location, interested-friends avatar stack (if any), "I'm interested" button, "open link" to source_url.
3. **Post event** (`/post`) — paste-a-link input → scrape → confirm/edit screen (title, date, location, image, source_url editable) → "post to your feed" button.
4. **Friends** (`/friends`) — search by name to send a request, pending requests section (accept/decline), accepted friends list.

## Core user flow
1. User signs up, logs in.
2. User sends a friend request; the other person accepts (mutual, both ways).
3. User pastes an event link they're going to and are open to company for.
4. App scrapes title/date/location, user confirms or edits, posts it.
5. It appears in accepted friends' feeds, framed as "[name] is going — [event title]".
6. A friend taps "I'm interested" — this is visible to the poster and other friends, but doesn't do anything transactional.
7. The friend clicks "open link" to go register or buy a ticket on the actual event page.

## Explicitly out of scope for v1
- Comments or threads on events
- Push notifications or reminders
- Multiple friend groups per user
- Calendar sync / add-to-calendar
- Any recommendation or ranking logic in the feed
- In-app ticketing or payments

## Visual design system
**Palette** (primary colors, tuned):
- Cobalt blue `#2F5FFF` — primary actions, title bar chrome
- Sunflower yellow `#FFC839` — the "open to company" stamp badge only (keep this rare so it pops)
- Poppy red `#FF4B3E` — small accents: avatar chips, the "open link" text
- Warm paper `#FDFBF6` — background
- Ink navy `#14213D` — text and borders

**Typography**:
- Pixelify Sans (Google Fonts) — headers, title bar labels, buttons. Bold/blocky, used with restraint.
- Work Sans — body copy, general UI text.
- Space Mono — dates, times, locations (gives it a ticket-stub feel).

**Chrome / signature style** — blend of playful primary colors with retro Windows-95-style pixel UI, referencing a found asset pack (pixel icons, title-bar windows with `_ □ x`, dithered progress bars, chunky sliders):
- Event cards are styled like little OS windows: a colored title bar (cobalt blue, white Pixelify Sans text) with `_ □ x` glyphs top-right, sharp 2.5px ink-navy borders, no border-radius (or minimal — this is a deliberately blocky, un-rounded aesthetic).
- Each card has a tilted (~-5deg) yellow "open to company" stamp badge overlapping the top edge — this is the one signature element that should appear on every event card.
- Avatars are square chips with a thick border, not circles, to match the blocky style.
- Buttons: solid cobalt blue fill, white text, thick ink-navy border, sharp corners.
- Background: warm paper white with a faint grid pattern (thin cool-gray lines, 16px grid) echoing the reference asset sheet.

## Build order (suggested)
1. Auth + `users` table + login/signup pages
2. `friendships` table + friend request flow (send, accept/decline, list)
3. Link scraping endpoint (JSON-LD → OG fallback) + post-event confirm screen
4. `events` + `event_interest` tables + feed page + "I'm interested" toggle
5. Visual polish pass: apply the pixel/window chrome design system across all screens