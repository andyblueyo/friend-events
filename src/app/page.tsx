import { SiteHeader } from "@/components/site-header";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FeedEventRow } from "@/lib/database.types";
import { FeedClient } from "./feed-client";

export default async function FeedPage() {
  const profile = await requireProfile();

  const supabase = await createClient();
  // Visibility (own posts + accepted friends' posts) is enforced by the RLS
  // policy on events, not by anything in this file.
  const { data, error } = await supabase.rpc("list_feed_events");

  if (error) {
    throw new Error(`Could not load the feed: ${error.message}`);
  }

  const events: FeedEventRow[] = data ?? [];

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <FeedClient events={events} />
      </main>
    </>
  );
}
