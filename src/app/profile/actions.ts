"use server";

import { revalidatePath } from "next/cache";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/database.types";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export type UpdateProfileState =
  | { status: "idle" }
  | { status: "error"; message: string; field?: "display_name" | "handle" | "avatar_url" }
  | { status: "success"; profile: UserRow };

export type HandleCheckState =
  | { status: "idle" }
  | { status: "checking"; candidate: string }
  | { status: "ok"; candidate: string; available: boolean };

/**
 * Live availability check for the profile-edit form. Mirrors the signup
 * flow's use of handle_available(), but treats the user's *current* handle
 * as available to them — otherwise leaving the field untouched would show
 * as "taken".
 */
export async function checkHandleAvailable(
  _prev: HandleCheckState,
  formData: FormData,
): Promise<HandleCheckState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "idle" };

  const candidate = String(formData.get("handle") ?? "").trim().toLowerCase();
  if (!HANDLE_RE.test(candidate)) {
    return { status: "ok", candidate, available: false };
  }
  if (candidate === profile.handle) {
    return { status: "ok", candidate, available: true };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("handle_available", {
    candidate,
  });

  if (error) {
    return { status: "ok", candidate, available: false };
  }

  return { status: "ok", candidate, available: Boolean(data) };
}

export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const displayName = String(formData.get("display_name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase();
  const avatarUrlRaw = String(formData.get("avatar_url") ?? "").trim();

  if (!displayName) {
    return {
      status: "error",
      field: "display_name",
      message: "Display name can't be empty.",
    };
  }
  if (displayName.length > 60) {
    return {
      status: "error",
      field: "display_name",
      message: "Keep it under 60 characters.",
    };
  }

  if (!HANDLE_RE.test(handle)) {
    return {
      status: "error",
      field: "handle",
      message: "3-20 characters: lowercase letters, numbers, underscore.",
    };
  }

  const avatarUrl: string | null = avatarUrlRaw || null;
  if (avatarUrl) {
    try {
      const parsed = new URL(avatarUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      return {
        status: "error",
        field: "avatar_url",
        message: "That doesn't look like a valid image URL.",
      };
    }
  }

  const supabase = await createClient();

  if (handle !== profile.handle) {
    const { data: available, error: availError } = await supabase.rpc(
      "handle_available",
      { candidate: handle },
    );
    if (availError) {
      return {
        status: "error",
        field: "handle",
        message: `Couldn't check that handle: ${availError.message}`,
      };
    }
    if (!available) {
      return {
        status: "error",
        field: "handle",
        message: "That handle is taken.",
      };
    }
  }

  const { data, error } = await supabase
    .from("users")
    .update({
      display_name: displayName,
      handle,
      avatar_url: avatarUrl,
    })
    .eq("id", profile.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", field: "handle", message: "That handle is taken." };
    }
    return { status: "error", message: `Couldn't save: ${error.message}` };
  }

  revalidatePath("/profile");
  revalidatePath("/friends");
  revalidatePath("/");

  return { status: "success", profile: data };
}
