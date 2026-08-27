import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { AvatarChip } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FriendshipListRow, TagListRow } from "@/lib/database.types";
import { FriendsSearch } from "./friends-search";
import { IncomingActions, OutgoingActions } from "./request-actions";
import { FriendsWithTags, TagsManager } from "./tags-panel";

export default async function FriendsPage() {
  const profile = await requireProfile();

  const supabase = await createClient();
  const [{ data, error }, { data: tagData, error: tagError }] = await Promise.all([
    supabase.rpc("list_friendships"),
    supabase.rpc("list_tags"),
  ]);

  if (error) {
    throw new Error(`Could not load friendships: ${error.message}`);
  }
  if (tagError) {
    throw new Error(`Could not load tags: ${tagError.message}`);
  }

  const rows: FriendshipListRow[] = data ?? [];
  const tags: TagListRow[] = tagData ?? [];
  const incoming = rows.filter(
    (row) => row.status === "pending" && row.requested_by !== profile.id,
  );
  const outgoing = rows.filter(
    (row) => row.status === "pending" && row.requested_by === profile.id,
  );
  const friends = rows.filter((row) => row.status === "accepted");

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title="find friends">
          <FriendsSearch />
        </Window>

        <Window title={`requests (${incoming.length})`}>
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="font-display text-sm text-ink">to you</h3>
              {incoming.length === 0 ? (
                <p className="font-sans text-sm text-ink/70">
                  No requests waiting.
                </p>
              ) : (
                <ul className="space-y-2">
                  {incoming.map((row) => (
                    <PersonLine key={row.friendship_id} row={row}>
                      <IncomingActions friendshipId={row.friendship_id} />
                    </PersonLine>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-display text-sm text-ink">from you</h3>
              {outgoing.length === 0 ? (
                <p className="font-sans text-sm text-ink/70">
                  Nothing pending.
                </p>
              ) : (
                <ul className="space-y-2">
                  {outgoing.map((row) => (
                    <PersonLine key={row.friendship_id} row={row}>
                      <OutgoingActions friendshipId={row.friendship_id} />
                    </PersonLine>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Window>

        <Window title={`friends (${friends.length})`}>
          {friends.length === 0 ? (
            <p className="font-sans text-sm text-ink/70">
              Nobody yet. Search above to send a request — both people have to
              accept.
            </p>
          ) : (
            <FriendsWithTags friends={friends} tags={tags} />
          )}
        </Window>

        <TagsManager tags={tags} />
      </main>
    </>
  );
}

function PersonLine({
  row,
  children,
}: {
  row: FriendshipListRow;
  children?: React.ReactNode;
}) {
  return (
    <li className="border-ink flex items-center justify-between gap-3 bg-white px-3 py-2">
      <Link
        href={`/profile/${row.other_handle}`}
        className="flex min-w-0 items-center gap-3"
      >
        <AvatarChip
          name={row.other_display_name}
          src={row.other_avatar_url}
          size={32}
        />
        <div className="min-w-0">
          <p className="truncate font-sans text-sm text-ink hover:underline">
            {row.other_display_name}
          </p>
          <p className="truncate font-mono text-xs text-ink/60">
            @{row.other_handle}
          </p>
        </div>
      </Link>
      {children}
    </li>
  );
}
