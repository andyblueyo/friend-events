"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseAudienceTagIds } from "@/lib/event-form";
import type { AudienceMode } from "@/lib/database.types";

export type DeleteState = {
  status: "idle" | "error";
  message?: string;
};

/**
 * Deletes an event via the delete_event() RPC rather than a raw table
 * delete, because which kind of delete happens depends on server-side state
 * the client shouldn't be trusted to branch on:
 *   - a fork always hard-deletes
 *   - a root with no forks hard-deletes
 *   - a root with forks soft-deletes, so the forks keep resolving their
 *     content exactly as before
 * The RPC also re-checks posted_by = auth.uid() itself, so a missing row and
 * a not-yours row both surface the same way here.
 */
export async function deleteEvent(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) return { status: "error", message: "Missing event." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_event", { p_event_id: eventId });

  if (error) {
    return { status: "error", message: `Couldn't delete that: ${error.message}` };
  }

  revalidatePath("/");
  // Redirect callers on the /edit page back to the feed; callers on the feed
  // itself (already at "/") just see the revalidated list.
  redirect("/");
}

export type ForkState = {
  status: "idle" | "error";
  message?: string;
  /** What the row looks like after the action; drives the button label. */
  shared?: boolean;
};

/**
 * Toggles a fork the same way toggleEventInterest toggles interest: read the
 * current state server-side, then insert or delete accordingly, rather than
 * trusting an intent flag from the client. Un-sharing deletes the fork row
 * via delete_event() (always a hard delete for a fork — see 0007) rather
 * than a raw table delete, for the same posted_by-ownership guarantee used
 * everywhere else deletion happens.
 *
 * events_one_fork_per_user (0008) backs this up at the database level, so a
 * double-click race still can't produce two forks of the same event.
 */
export async function forkEvent(
  _prev: ForkState,
  formData: FormData,
): Promise<ForkState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) return { status: "error", message: "Missing event." };

  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("events")
    .select("id")
    .eq("forked_from_event_id", eventId)
    .eq("posted_by", profile.id)
    .maybeSingle();

  if (readError) {
    return { status: "error", message: `Couldn't check that: ${readError.message}` };
  }

  if (existing) {
    const { error } = await supabase.rpc("delete_event", {
      p_event_id: existing.id,
    });

    if (error) {
      return { status: "error", message: `Couldn't un-share that: ${error.message}` };
    }

    revalidatePath("/");
    return { status: "idle", shared: false };
  }

  // "all" is the default whenever the field is missing or unrecognized —
  // same rule as the plain post flow.
  const audienceMode: AudienceMode =
    String(formData.get("audience_mode") ?? "").trim() === "tags"
      ? "tags"
      : "all";

  const { data: newEventId, error } = await supabase.rpc("fork_event", {
    p_event_id: eventId,
    p_audience_mode: audienceMode,
  });

  if (error) {
    // Another tab/request won the race and already forked it — the end
    // state is what the user wanted, so report success rather than error.
    if (error.code === "23505") {
      revalidatePath("/");
      return { status: "idle", shared: true };
    }
    return { status: "error", message: `Couldn't share that: ${error.message}` };
  }

  if (audienceMode === "tags" && newEventId) {
    const tagIds = parseAudienceTagIds(formData);
    if (tagIds.length > 0) {
      // event_tags' insert policy re-checks tag ownership server-side, same
      // as postEvent — a tampered id here just fails to insert rather than
      // scoping the fork to someone else's tag.
      const { error: tagError } = await supabase.from("event_tags").insert(
        tagIds.map((tagId) => ({ event_id: newEventId, tag_id: tagId })),
      );
      if (tagError) {
        return {
          status: "error",
          message: `Shared, but couldn't set the audience: ${tagError.message}`,
        };
      }
    }
  }

  revalidatePath("/");
  return { status: "idle", shared: true };
}

export type InterestState = {
  status: "idle" | "error";
  message?: string;
  /** What the row looks like after the action; drives the button label. */
  interested?: boolean;
};

/**
 * Interest is a row-exists toggle — event_interest has no status column, so
 * insert means interested and delete means not. Same insert/delete shape as
 * the friend-request actions.
 */
export async function toggleEventInterest(
  _prev: InterestState,
  formData: FormData,
): Promise<InterestState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) return { status: "error", message: "Missing event." };

  const supabase = await createClient();

  // Read the current state server-side rather than trusting an intent flag
  // from the client, so a double-click can't invert into the wrong operation.
  const { data: existing, error: readError } = await supabase
    .from("event_interest")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (readError) {
    return { status: "error", message: `Couldn't check that: ${readError.message}` };
  }

  if (existing) {
    const { error } = await supabase
      .from("event_interest")
      .delete()
      .eq("id", existing.id);

    if (error) {
      return { status: "error", message: `Couldn't un-mark that: ${error.message}` };
    }

    revalidatePath("/");
    return { status: "idle", interested: false };
  }

  const { error } = await supabase
    .from("event_interest")
    .insert({ event_id: eventId, user_id: profile.id });

  if (error) {
    // 23505 means someone (another tab) inserted between the read and here —
    // the end state is the one the user wanted, so report success.
    if (error.code === "23505") {
      revalidatePath("/");
      return { status: "idle", interested: true };
    }
    // 42501 is the RLS insert policy, which requires friendship with the
    // poster — i.e. this is your own event. The UI hides the button in that
    // case, so this is a fallback rather than an expected path.
    if (error.code === "42501") {
      return {
        status: "error",
        message: "You posted this one — that already means you're going.",
      };
    }
    return { status: "error", message: `Couldn't mark that: ${error.message}` };
  }

  revalidatePath("/");
  return { status: "idle", interested: true };
}
