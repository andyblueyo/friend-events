import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { requireProfile } from "@/lib/auth";
import type { EventRow } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { EditFlow } from "./edit-flow";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load that event: ${error.message}`);
  }

  const event: EventRow | null = data;

  // Covers both "no such event" and "not yours" with the same not-found page
  // — RLS already hides other people's events entirely, but the posted_by
  // check is what actually rules out editing a friend's event you can see.
  if (!event || event.posted_by !== profile.id) {
    notFound();
  }

  const { data: eventTags, error: eventTagsError } = await supabase
    .from("event_tags")
    .select("tag_id")
    .eq("event_id", event.id);

  if (eventTagsError) {
    throw new Error(`Could not load that event's audience: ${eventTagsError.message}`);
  }

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title="edit your event">
          <EditFlow
            event={event}
            initialTagIds={(eventTags ?? []).map((row) => row.tag_id)}
          />
        </Window>
      </main>
    </>
  );
}
