"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { AvatarChip, Button, Field } from "@/components/ui";
import type { UserRow } from "@/lib/database.types";
import {
  checkHandleAvailable,
  updateProfile,
  type HandleCheckState,
  type UpdateProfileState,
} from "./actions";

const HANDLE_CHECK_INITIAL: HandleCheckState = { status: "idle" };
const UPDATE_INITIAL: UpdateProfileState = { status: "idle" };
const DEBOUNCE_MS = 400;

export function ProfileForm({ profile }: { profile: UserRow }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [handle, setHandle] = useState(profile.handle);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");

  const [handleState, checkHandle] = useActionState(
    checkHandleAvailable,
    HANDLE_CHECK_INITIAL,
  );
  const [updateState, submitUpdate] = useActionState(
    updateProfile,
    UPDATE_INITIAL,
  );

  // Debounced live handle check, same idea as the search box elsewhere but
  // client-timed since it has to fire on every keystroke rather than submit.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const trimmed = handle.trim().toLowerCase();
    if (!trimmed || trimmed.length < 3) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("handle", trimmed);
      checkHandle(fd);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [handle, checkHandle]);

  const normalizedHandle = handle.trim().toLowerCase();
  const handleUnchanged = normalizedHandle === profile.handle;
  const handleFormatOk = /^[a-z0-9_]{3,20}$/.test(normalizedHandle);
  const handleTaken =
    !handleUnchanged &&
    handleState.status === "ok" &&
    handleState.candidate === normalizedHandle &&
    !handleState.available &&
    handleFormatOk;
  const handleAvailableNote =
    !handleUnchanged &&
    handleState.status === "ok" &&
    handleState.candidate === normalizedHandle &&
    handleState.available &&
    handleFormatOk;

  const handleError = !handleFormatOk
    ? normalizedHandle.length > 0
      ? "3-20 characters: lowercase letters, numbers, underscore."
      : undefined
    : handleTaken
      ? "That handle is taken."
      : undefined;

  return (
    <form action={submitUpdate} className="space-y-4">
      <div className="flex items-center gap-3">
        <AvatarChip name={displayName || "?"} src={avatarUrl || null} size={48} />
        <p className="font-mono text-xs text-ink/60">
          Preview updates as you type below.
        </p>
      </div>

      <Field
        label="display name"
        name="display_name"
        required
        maxLength={60}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
      />

      <Field
        label="handle"
        name="handle"
        required
        autoComplete="off"
        value={handle}
        onChange={(event) => setHandle(event.target.value)}
        error={handleError}
        hint={
          !handleError
            ? handleUnchanged
              ? "Your current handle."
              : handleAvailableNote
                ? "Available."
                : "3-20 characters: lowercase letters, numbers, underscore."
            : undefined
        }
      />

      <Field
        label="avatar URL"
        name="avatar_url"
        type="url"
        placeholder="https://…"
        value={avatarUrl}
        onChange={(event) => setAvatarUrl(event.target.value)}
        hint="Link to an image already hosted somewhere — no upload yet. Leave blank for initials."
      />

      {updateState.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{updateState.message}</p>
      ) : null}
      {updateState.status === "success" ? (
        <p className="font-mono text-xs text-cobalt">Saved.</p>
      ) : null}

      <SaveButton disabled={handleTaken || !handleFormatOk} />
    </form>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "saving…" : "save"}
    </Button>
  );
}
