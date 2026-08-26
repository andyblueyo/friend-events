"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { AvatarChip, Button, Field } from "@/components/ui";
import type { RelationshipState, SearchPersonRow } from "@/lib/database.types";
import { MIN_QUERY_LENGTH } from "./constants";
import {
  searchPeople,
  sendFriendRequest,
  type RequestState,
  type SearchState,
} from "./actions";

const SEARCH_INITIAL: SearchState = { status: "idle" };
const REQUEST_INITIAL: RequestState = { status: "idle" };

export function FriendsSearch() {
  const [state, action] = useActionState(searchPeople, SEARCH_INITIAL);
  // Locally-sent requests, so a button flips to "requested" without refetching
  // the whole result set.
  const [justSent, setJustSent] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      {/* Submit-triggered, mirroring the link input in /post — no debounce
          machinery, and it keeps each keystroke from hitting the database. */}
      <form action={action} className="space-y-3">
        <SearchFields />
      </form>

      {state.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{state.message}</p>
      ) : null}

      {state.status === "ready" ? (
        state.results.length === 0 ? (
          <p className="font-sans text-sm text-ink/70">
            Nobody matching “{state.query}”.
          </p>
        ) : (
          <ul className="space-y-2">
            {state.results.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                justSent={justSent.includes(person.id)}
                onSent={() => setJustSent((ids) => [...ids, person.id])}
              />
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function SearchFields() {
  const { pending } = useFormStatus();

  return (
    <fieldset disabled={pending} className="space-y-3">
      <Field
        label="find a friend"
        name="q"
        required
        minLength={MIN_QUERY_LENGTH}
        autoComplete="off"
        placeholder="name or handle"
        hint={`At least ${MIN_QUERY_LENGTH} characters. Matches names and @handles.`}
      />
      <Button type="submit">{pending ? "looking…" : "search"}</Button>
    </fieldset>
  );
}

const STATE_LABEL: Record<Exclude<RelationshipState, "none">, string> = {
  pending_sent: "requested",
  pending_received: "respond below",
  friends: "friends",
};

function PersonRow({
  person,
  justSent,
  onSent,
}: {
  person: SearchPersonRow;
  justSent: boolean;
  onSent: () => void;
}) {
  const [state, action] = useActionState(
    async (prev: RequestState, formData: FormData) => {
      const result = await sendFriendRequest(prev, formData);
      if (result.status === "idle") onSent();
      return result;
    },
    REQUEST_INITIAL,
  );

  const effectiveState: RelationshipState = justSent
    ? "pending_sent"
    : person.state;

  return (
    <li className="border-ink flex items-center justify-between gap-3 bg-white px-3 py-2">
      <Link
        href={`/profile/${person.handle}`}
        className="flex min-w-0 items-center gap-3"
      >
        <AvatarChip
          name={person.display_name}
          src={person.avatar_url}
          size={32}
        />
        <div className="min-w-0">
          <p className="truncate font-sans text-sm text-ink hover:underline">
            {person.display_name}
          </p>
          <p className="truncate font-mono text-xs text-ink/60">
            @{person.handle}
          </p>
        </div>
      </Link>

      <div className="flex flex-col items-end gap-1">
        {effectiveState === "none" ? (
          <form action={action}>
            <input type="hidden" name="target_id" value={person.id} />
            <AddButton />
          </form>
        ) : (
          <Button
            type="button"
            variant="plain"
            disabled
            className="px-3 py-1.5 text-sm"
          >
            {STATE_LABEL[effectiveState]}
          </Button>
        )}

        {state.status === "error" ? (
          <p className="font-mono text-xs text-poppy">{state.message}</p>
        ) : null}
      </div>
    </li>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="px-3 py-1.5 text-sm">
      {pending ? "…" : "add friend"}
    </Button>
  );
}
