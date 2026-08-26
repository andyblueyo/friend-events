import { notFound, redirect } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { AvatarChip } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { RelationshipState, SearchPersonRow } from "@/lib/database.types";

const STATE_LABEL: Record<RelationshipState, string> = {
  none: "not friends yet",
  pending_sent: "request sent",
  pending_received: "wants to be friends",
  friends: "friends",
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const handle = rawHandle.trim().toLowerCase();

  const profile = await requireProfile();
  if (handle === profile.handle) redirect("/profile");

  const supabase = await createClient();

  // search_people() already scopes to signed-in users and excludes the
  // caller, matching the "no public discovery" rule in SPEC.md — reused here
  // instead of a new lookup RPC. Prefix-matches, so we still need the exact
  // check below.
  const { data, error } = await supabase.rpc("search_people", { q: handle });

  if (error) {
    throw new Error(`Could not load that profile: ${error.message}`);
  }

  const results: SearchPersonRow[] = data ?? [];
  const person = results.find((row) => row.handle === handle);

  if (!person) notFound();

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title={`@${person.handle}`}>
          <div className="flex items-center gap-4">
            <AvatarChip
              name={person.display_name}
              src={person.avatar_url}
              size={56}
            />
            <div className="min-w-0">
              <p className="truncate font-display text-lg text-ink">
                {person.display_name}
              </p>
              <p className="truncate font-mono text-xs text-ink/60">
                @{person.handle}
              </p>
              <p className="mt-1 font-mono text-xs text-ink/60">
                {STATE_LABEL[person.state]}
              </p>
            </div>
          </div>
        </Window>
      </main>
    </>
  );
}
