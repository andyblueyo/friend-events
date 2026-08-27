"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TagListRow } from "@/lib/database.types";
import { TAG_NAME_MAX_LENGTH, TAG_NAME_MIN_LENGTH } from "./constants";

export type TagState = { status: "idle" | "error"; message?: string };

export type TagsQueryState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; tags: TagListRow[] };

function normalizeTagName(raw: FormDataEntryValue | null): string | null {
  const name = String(raw ?? "").trim();
  if (name.length < TAG_NAME_MIN_LENGTH || name.length > TAG_NAME_MAX_LENGTH) {
    return null;
  }
  return name;
}

/** Loads every tag the caller owns, members inlined. Used by both the
 * /friends tag picker and the post/edit audience picker. */
export async function loadTags(): Promise<TagsQueryState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_tags");

  if (error) {
    return { status: "error", message: `Couldn't load tags: ${error.message}` };
  }

  return { status: "ready", tags: data ?? [] };
}

export async function createTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const name = normalizeTagName(formData.get("name"));
  if (!name) {
    return {
      status: "error",
      message: `Tag names need to be ${TAG_NAME_MIN_LENGTH}-${TAG_NAME_MAX_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .insert({ owner_id: profile.id, name });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "You already have a tag with that name." };
    }
    return { status: "error", message: `Couldn't create that tag: ${error.message}` };
  }

  revalidatePath("/friends");
  revalidatePath("/post");
  return { status: "idle" };
}

export async function renameTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const tagId = String(formData.get("tag_id") ?? "").trim();
  const name = normalizeTagName(formData.get("name"));
  if (!tagId) return { status: "error", message: "Missing tag." };
  if (!name) {
    return {
      status: "error",
      message: `Tag names need to be ${TAG_NAME_MIN_LENGTH}-${TAG_NAME_MAX_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", tagId)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "You already have a tag with that name." };
    }
    return { status: "error", message: `Couldn't rename that: ${error.message}` };
  }
  if (!data?.length) {
    return { status: "error", message: "That tag isn't yours to rename." };
  }

  revalidatePath("/friends");
  revalidatePath("/post");
  return { status: "idle" };
}

export async function deleteTag(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const tagId = String(formData.get("tag_id") ?? "").trim();
  if (!tagId) return { status: "error", message: "Missing tag." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .select("id");

  if (error) {
    return { status: "error", message: `Couldn't delete that: ${error.message}` };
  }
  if (!data?.length) {
    return { status: "error", message: "That tag isn't yours to delete." };
  }

  revalidatePath("/friends");
  revalidatePath("/post");
  return { status: "idle" };
}

/**
 * Syncs one friend's tag membership to exactly the given set of tag ids, via
 * the set_friend_tags() RPC — one round trip instead of one insert/delete per
 * checkbox toggle in the dropdown.
 */
export async function setFriendTags(
  _prev: TagState,
  formData: FormData,
): Promise<TagState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const friendId = String(formData.get("friend_id") ?? "").trim();
  if (!friendId) return { status: "error", message: "Missing friend." };

  const tagIds = formData.getAll("tag_ids").map((value) => String(value));

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_friend_tags", {
    p_friend_id: friendId,
    p_tag_ids: tagIds,
  });

  if (error) {
    return { status: "error", message: `Couldn't update tags: ${error.message}` };
  }

  revalidatePath("/friends");
  return { status: "idle" };
}
