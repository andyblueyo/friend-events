"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui";
import {
  acceptFriendRequest,
  declineFriendRequest,
  type RequestState,
} from "./actions";

const INITIAL: RequestState = { status: "idle" };

function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "plain";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      className="px-3 py-1.5 text-sm"
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Accept / decline for a request someone sent you. */
export function IncomingActions({ friendshipId }: { friendshipId: string }) {
  const [acceptState, accept] = useActionState(acceptFriendRequest, INITIAL);
  const [declineState, decline] = useActionState(declineFriendRequest, INITIAL);

  const message =
    acceptState.status === "error"
      ? acceptState.message
      : declineState.status === "error"
        ? declineState.message
        : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={accept}>
          <input type="hidden" name="friendship_id" value={friendshipId} />
          <SubmitButton label="accept" pendingLabel="…" />
        </form>
        <form action={decline}>
          <input type="hidden" name="friendship_id" value={friendshipId} />
          <SubmitButton label="decline" pendingLabel="…" variant="plain" />
        </form>
      </div>
      {message ? (
        <p className="font-mono text-xs text-poppy">{message}</p>
      ) : null}
    </div>
  );
}

/**
 * Cancelling a request you sent. Same delete as decline — the RLS policy lets
 * either member remove the row, so this is the same operation from the other
 * side rather than a separate permission.
 */
export function OutgoingActions({ friendshipId }: { friendshipId: string }) {
  const [state, cancel] = useActionState(declineFriendRequest, INITIAL);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={cancel}>
        <input type="hidden" name="friendship_id" value={friendshipId} />
        <SubmitButton label="cancel" pendingLabel="…" variant="plain" />
      </form>
      {state.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{state.message}</p>
      ) : null}
    </div>
  );
}
