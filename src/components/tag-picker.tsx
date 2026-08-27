"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
import { TAG_NAME_MAX_LENGTH } from "@/app/friends/constants";

export type TagOption = {
  id: string;
  name: string;
  /** Current member count for this tag, shown next to the name. */
  count: number;
};

/**
 * The reusable "tag ▾" dropdown: checkboxes with live member counts, chips
 * for whatever's currently selected, and an inline "+ new tag" form at the
 * bottom so a tag can be created without leaving the row. Used for both the
 * per-friend tag picker on /friends and the audience picker in the post/edit
 * confirm step — the two differ only in trigger/panel copy and what
 * onToggle/onCreateTag actually do.
 */
export function TagPicker({
  triggerLabel,
  panelTitle,
  options,
  selectedIds,
  onToggle,
  onCreateTag,
  creating = false,
  createError,
  emptyWarning,
}: {
  triggerLabel: string;
  panelTitle: string;
  options: TagOption[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  onCreateTag: (name: string) => void;
  creating?: boolean;
  createError?: string;
  /** Shown under the checklist when selectedIds is empty. */
  emptyWarning?: string;
}) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const selected = options.filter((option) => selectedIds.includes(option.id));

  function submitNewTag() {
    const name = newTagName.trim();
    if (!name) return;
    onCreateTag(name);
    setNewTagName("");
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {selected.length === 0 ? (
          <span className="font-mono text-xs text-ink/50">no tags yet</span>
        ) : (
          selected.map((tag) => (
            <span
              key={tag.id}
              className="border-ink bg-white px-2 py-0.5 font-mono text-xs leading-none text-ink"
            >
              {tag.name} ({tag.count})
            </span>
          ))
        )}
      </div>

      <Button
        type="button"
        variant="plain"
        className="mt-2 px-3 py-1.5 text-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {triggerLabel} ▾
      </Button>

      {open ? (
        <div className="border-ink bg-paper absolute left-0 z-20 mt-2 w-64 shadow-[6px_6px_0_0_var(--color-ink)]">
          <div className="bg-cobalt border-b-[2.5px] border-ink px-3 py-1.5">
            <span className="font-display text-sm leading-none text-white">
              {panelTitle}
            </span>
          </div>

          <div className="flex flex-col gap-2 p-3">
            {options.length === 0 ? (
              <p className="font-sans text-sm text-ink/70">
                No tags yet — create one below.
              </p>
            ) : (
              options.map((option) => {
                const checked = selectedIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      className="accent-cobalt h-4 w-4"
                      checked={checked}
                      onChange={() => onToggle(option.id)}
                    />
                    <span className="flex-1 font-sans text-sm text-ink">
                      {option.name}
                    </span>
                    <span className="font-mono text-xs text-ink/55">
                      ({option.count})
                    </span>
                  </label>
                );
              })
            )}

            {emptyWarning && selectedIds.length === 0 ? (
              <span className="font-mono text-[11px] text-poppy">
                {emptyWarning}
              </span>
            ) : null}
          </div>

          <div className="border-t-[2.5px] border-ink p-3">
            <div className="flex gap-2">
              <input
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitNewTag();
                  }
                }}
                maxLength={TAG_NAME_MAX_LENGTH}
                placeholder="new tag name"
                className="border-ink bg-white min-w-0 flex-1 px-2 py-1.5 font-sans text-sm text-ink outline-none focus:shadow-[3px_3px_0_0_var(--color-cobalt)]"
              />
              <Button
                type="button"
                className="px-3 py-1.5 text-sm"
                disabled={creating || !newTagName.trim()}
                onClick={submitNewTag}
              >
                + add
              </Button>
            </div>
            {createError ? (
              <span className="mt-1 block font-mono text-xs text-poppy">
                {createError}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
