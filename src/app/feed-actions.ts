"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
};

/**
 * Forks an event into a new post owned by the caller. fork_event() copies
 * only source_url onto the new row — title/date/location/image are left
 * null and resolve through root_event_id at read time (see
 * list_feed_events()), so an edit to the original stays visible on the fork
 * for as long as the original exists, and survives unchanged if it's later
 * deleted.
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
  const { error } = await supabase.rpc("fork_event", { p_event_id: eventId });

  if (error) {
    return { status: "error", message: `Couldn't share that: ${error.message}` };
  }

  revalidatePath("/");
  return { status: "idle" };
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
