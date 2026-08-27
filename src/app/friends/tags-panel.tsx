"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { Window } from "@/components/window";
import { Button, AvatarChip } from "@/components/ui";
import { TagPicker, type TagOption } from "@/components/tag-picker";
import type { FriendshipListRow, TagListRow } from "@/lib/database.types";
import {
  createTag,
  deleteTag,
  renameTag,
  setFriendTags,
  type TagState,
} from "./tag-actions";
import { TAG_NAME_MAX_LENGTH } from "./constants";

const TAG_INITIAL: TagState = { status: "idle" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="px-3 py-1.5 text-sm">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Create-tag form + list of existing tags with a rename/delete affordance
 * each. Tags themselves are private — this window is the only place their
 * names ever render. */
export function TagsManager({ tags }: { tags: TagListRow[] }) {
  const [createState, create] = useActionState(createTag, TAG_INITIAL);

  return (
    <Window title={`tags (${tags.length})`}>
      <div className="space-y-4">
        <form action={create} className="flex gap-2">
          <input
            name="name"
            required
            maxLength={TAG_NAME_MAX_LENGTH}
            placeholder="new tag name"
            className="border-ink bg-white min-w-0 flex-1 px-3 py-2 font-sans text-sm text-ink outline-none focus:shadow-[3px_3px_0_0_var(--color-cobalt)]"
          />
          <SubmitButton label="+ add" pendingLabel="…" />
        </form>
        {createState.status === "error" ? (
          <p className="font-mono text-xs text-poppy">{createState.message}</p>
        ) : null}

        {tags.length === 0 ? (
          <p className="font-sans text-sm text-ink/70">
            No tags yet. Tags are private — only you ever see the name or
            who&apos;s in it.
          </p>
        ) : (
          <ul className="space-y-2">
            {tags.map((tag) => (
              <TagRow key={tag.tag_id} tag={tag} />
            ))}
          </ul>
        )}
      </div>
    </Window>
  );
}

function TagRow({ tag }: { tag: TagListRow }) {
  const [editing, setEditing] = useState(false);
  const [renameState, rename] = useActionState(renameTag, TAG_INITIAL);
  const [deleteState, remove] = useActionState(deleteTag, TAG_INITIAL);

  if (editing) {
    return (
      <li className="border-ink bg-white px-3 py-2">
        <form
          action={(formData) => {
            setEditing(false);
            return rename(formData);
          }}
          className="flex gap-2"
        >
          <input type="hidden" name="tag_id" value={tag.tag_id} />
          <input
            name="name"
            defaultValue={tag.name}
            required
            maxLength={TAG_NAME_MAX_LENGTH}
            autoFocus
            className="border-ink bg-white min-w-0 flex-1 px-2 py-1.5 font-sans text-sm text-ink outline-none"
          />
          <SubmitButton label="save" pendingLabel="…" />
        </form>
        {renameState.status === "error" ? (
          <p className="mt-1 font-mono text-xs text-poppy">{renameState.message}</p>
        ) : null}
      </li>
    );
  }

  return (
    <li className="border-ink flex items-center justify-between gap-3 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-sans text-sm text-ink">{tag.name}</p>
        <p className="font-mono text-xs text-ink/60">
          {tag.members.length} {tag.members.length === 1 ? "person" : "people"}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="plain"
          className="px-2 py-1 text-xs"
          onClick={() => setEditing(true)}
        >
          rename
        </Button>
        <form action={remove}>
          <input type="hidden" name="tag_id" value={tag.tag_id} />
          <Button type="submit" variant="plain" className="px-2 py-1 text-xs">
            delete
          </Button>
        </form>
      </div>
      {deleteState.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{deleteState.message}</p>
      ) : null}
    </li>
  );
}

/** Which of a friend's tags are currently selected, derived fresh from the
 * tags list on every render so it always reflects the latest server data. */
function selectedTagIds(friendId: string, tags: TagListRow[]): string[] {
  return tags
    .filter((tag) => tag.members.some((member) => member.id === friendId))
    .map((tag) => tag.tag_id);
}

/** The full friends list: a filter row by tag, then each friend with an
 * inline tag picker. Replaces the plain <ul> the server page used to render
 * directly, since both pieces need client-side tag state. */
export function FriendsWithTags({
  friends,
  tags,
}: {
  friends: FriendshipListRow[];
  tags: TagListRow[];
}) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const visible = activeFilter
    ? friends.filter((row) =>
        selectedTagIds(row.other_id, tags).includes(activeFilter),
      )
    : friends;

  return (
    <div className="space-y-3">
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="filter by tag">
          <Button
            type="button"
            variant={activeFilter === null ? "primary" : "plain"}
            className="px-2.5 py-1 text-xs"
            onClick={() => setActiveFilter(null)}
          >
            all
          </Button>
          {tags.map((tag) => (
            <Button
              key={tag.tag_id}
              type="button"
              variant={activeFilter === tag.tag_id ? "primary" : "plain"}
              className="px-2.5 py-1 text-xs"
              onClick={() =>
                setActiveFilter((current) =>
                  current === tag.tag_id ? null : tag.tag_id,
                )
              }
            >
              {tag.name} ({tag.members.length})
            </Button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="font-sans text-sm text-ink/70">
          {activeFilter ? "Nobody in this tag." : "Nobody yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <FriendRow key={row.friendship_id} row={row} tags={tags} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FriendRow({
  row,
  tags,
}: {
  row: FriendshipListRow;
  tags: TagListRow[];
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    selectedTagIds(row.other_id, tags),
  );
  const [error, setError] = useState<string | undefined>();
  const [createError, setCreateError] = useState<string | undefined>();
  const [creating, startCreate] = useTransition();
  const [, startSync] = useTransition();

  const options: TagOption[] = tags.map((tag) => ({
    id: tag.tag_id,
    name: tag.name,
    count: tag.members.length,
  }));

  function persist(nextSelected: string[]) {
    setSelected(nextSelected);
    setError(undefined);
    startSync(async () => {
      const formData = new FormData();
      formData.set("friend_id", row.other_id);
      nextSelected.forEach((id) => formData.append("tag_ids", id));
      const result = await setFriendTags(TAG_INITIAL, formData);
      if (result.status === "error") setError(result.message);
    });
  }

  function handleToggle(tagId: string) {
    const next = selected.includes(tagId)
      ? selected.filter((id) => id !== tagId)
      : [...selected, tagId];
    persist(next);
  }

  function handleCreateTag(name: string) {
    setCreateError(undefined);
    startCreate(async () => {
      const formData = new FormData();
      formData.set("name", name);
      const result = await createTag(TAG_INITIAL, formData);
      if (result.status === "error") setCreateError(result.message);
      // The new tag's id isn't returned here, so it isn't auto-selected —
      // list_tags() revalidates via createTag's revalidatePath, and the new
      // tag shows up in the dropdown ready to check on the next open.
    });
  }

  return (
    <li className="border-ink flex flex-col gap-2 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-3">
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
      </div>

      <TagPicker
        triggerLabel="tag"
        panelTitle={`tag ${row.other_display_name} as...`}
        options={options}
        selectedIds={selected}
        onToggle={handleToggle}
        onCreateTag={handleCreateTag}
        creating={creating}
        createError={createError}
      />
      {error ? <p className="font-mono text-xs text-poppy">{error}</p> : null}
    </li>
  );
}
