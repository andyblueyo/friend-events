"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SearchPersonRow } from "@/lib/database.types";
import { MIN_QUERY_LENGTH } from "./constants";

export type SearchState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; query: string; results: SearchPersonRow[] };

export type RequestState = { status: "idle" | "error"; message?: string };

export async function searchPeople(
  _prev: SearchState,
  formData: FormData,
): Promise<SearchState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const query = String(formData.get("q") ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return {
      status: "error",
      message: `Type at least ${MIN_QUERY_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_people", { q: query });

  if (error) {
    return { status: "error", message: `Search failed: ${error.message}` };
  }

  return { status: "ready", query, results: data ?? [] };
}

export async function sendFriendRequest(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const targetId = String(formData.get("target_id") ?? "").trim();
  if (!targetId) return { status: "error", message: "Pick someone first." };
  if (targetId === profile.id) {
    return { status: "error", message: "You can't friend yourself." };
  }

  const supabase = await createClient();

  // friendship_pair() returns the (user_a, user_b) ordering the
  // friendships_canonical_order CHECK requires.
  const { data: pair, error: pairError } = await supabase.rpc(
    "friendship_pair",
    { one: profile.id, two: targetId },
  );

  if (pairError || !pair?.[0]) {
    return {
      status: "error",
      message: `Couldn't send that request: ${pairError?.message ?? "no pair"}`,
    };
  }

  const { error } = await supabase.from("friendships").insert({
    user_a: pair[0].user_a,
    user_b: pair[0].user_b,
    status: "pending",
    requested_by: profile.id,
  });

  if (error) {
    // 23505 is friendships_unique_pair — a request already exists in some
    // direction, or they're already friends.
    if (error.code === "23505") {
      return {
        status: "error",
        message: "There's already a request between you two.",
      };
    }
    return { status: "error", message: `Couldn't send that: ${error.message}` };
  }

  revalidatePath("/friends");
  return { status: "idle" };
}

export async function acceptFriendRequest(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const friendshipId = String(formData.get("friendship_id") ?? "").trim();
  if (!friendshipId) return { status: "error", message: "Missing request." };

  const supabase = await createClient();

  // No hand-rolled "am I the recipient?" check — the RLS policy already says
  // only the non-requester can accept, and duplicating it here would let the
  // two drift apart. A blocked update just matches zero rows.
  const { data, error } = await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", friendshipId)
    .select("id");

  if (error) {
    return { status: "error", message: `Couldn't accept: ${error.message}` };
  }
  if (!data?.length) {
    return { status: "error", message: "That request isn't yours to accept." };
  }

  revalidatePath("/friends");
  return { status: "idle" };
}

export async function declineFriendRequest(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const friendshipId = String(formData.get("friendship_id") ?? "").trim();
  if (!friendshipId) return { status: "error", message: "Missing request." };

  const supabase = await createClient();

  // Deleting rather than marking declined, so the pair can start over later.
  const { data, error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .select("id");

  if (error) {
    return { status: "error", message: `Couldn't decline: ${error.message}` };
  }
  if (!data?.length) {
    return { status: "error", message: "That request isn't yours to decline." };
  }

  revalidatePath("/friends");
  return { status: "idle" };
}
