"use client";

import { useEffect, useState } from "react";

import { TagPicker, type TagOption } from "@/components/tag-picker";
import { createTag, loadTags } from "@/app/friends/tag-actions";
import type { AudienceMode } from "@/lib/database.types";

function toTagOptions(
  tags: { tag_id: string; name: string; members: unknown[] }[],
): TagOption[] {
  return tags.map((tag) => ({
    id: tag.tag_id,
    name: tag.name,
    count: tag.members.length,
  }));
}

/**
 * "who sees this" — defaults to all friends. Picking "specific tags" reveals
 * the same TagPicker checklist used on /friends, sourced live from
 * loadTags() rather than a prop, since both the post confirm screen and the
 * edit page can be reached without a fresh server round trip right before
 * this renders. Shared between /post's ConfirmForm and /edit's EditFlow.
 */
export function AudiencePicker({
  audienceMode,
  onAudienceModeChange,
  selectedTagIds,
  onSelectedTagIdsChange,
}: {
  audienceMode: AudienceMode;
  onAudienceModeChange: (mode: AudienceMode) => void;
  selectedTagIds: string[];
  onSelectedTagIdsChange: (ids: string[]) => void;
}) {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [createError, setCreateError] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTags().then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setLoadError(result.message);
        return;
      }
      if (result.status === "ready") {
        setTags(toTagOptions(result.tags));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleToggle(tagId: string) {
    onSelectedTagIdsChange(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId],
    );
  }

  function handleCreateTag(name: string) {
    setCreateError(undefined);
    setCreating(true);
    const formData = new FormData();
    formData.set("name", name);
    createTag({ status: "idle" }, formData)
      .then((result) => {
        if (result.status === "error") {
          setCreateError(result.message);
          return;
        }
        return loadTags().then((refreshed) => {
          if (refreshed.status === "ready") {
            setTags(toTagOptions(refreshed.tags));
          }
        });
      })
      .finally(() => setCreating(false));
  }

  return (
    <div>
      <span className="font-display mb-1 block text-sm text-ink">
        who sees this
      </span>
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="audience_mode_choice"
            className="accent-cobalt h-4 w-4"
            checked={audienceMode === "all"}
            onChange={() => onAudienceModeChange("all")}
          />
          <span className="font-sans text-sm text-ink">all friends</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="audience_mode_choice"
            className="accent-cobalt h-4 w-4"
            checked={audienceMode === "tags"}
            onChange={() => onAudienceModeChange("tags")}
          />
          <span className="font-sans text-sm text-ink">specific tags</span>
        </label>
      </div>

      {audienceMode === "tags" ? (
        <div className="border-ink/20 mt-2 border-l-2 pl-3">
          {loadError ? (
            <p className="font-mono text-xs text-poppy">{loadError}</p>
          ) : tags.length === 0 ? (
            <p className="font-mono text-xs text-ink/60">
              No tags yet — create one below, or tag friends first on the
              friends page.
            </p>
          ) : null}
          <TagPicker
            triggerLabel="pick tags"
            panelTitle="who sees this"
            options={tags}
            selectedIds={selectedTagIds}
            onToggle={handleToggle}
            onCreateTag={handleCreateTag}
            creating={creating}
            createError={createError}
            emptyWarning="nobody's tagged here yet — only you'll see this"
          />
        </div>
      ) : null}

      <input type="hidden" name="audience_mode" value={audienceMode} />
      {audienceMode === "tags"
        ? selectedTagIds.map((tagId) => (
            <input key={tagId} type="hidden" name="tag_ids" value={tagId} />
          ))
        : null}
    </div>
  );
}
