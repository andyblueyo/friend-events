import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/database.types";

/**
 * The invariant that keeps redirects terminating:
 *
 *   getCurrentProfile() returns null ONLY when there is no session.
 *
 * Anything else — a failed query, a missing profile row — must throw or
 * recover, never return null. requireProfile() sends null to /login, and the
 * proxy sends signed-in users at /login back to /, so a signed-in user who
 * resolves to null ping-pongs between the two forever.
 */
export async function getCurrentProfile(): Promise<UserRow | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Could not load the profile for ${user.id}: ${error.message}` +
        (error.code ? ` (${error.code})` : ""),
    );
  }

  if (data) return data;

  // Signed in, but no profile row — the handle_new_user trigger didn't fire,
  // or the account predates the users table. Recreate it instead of stranding
  // the account. RLS restricts the insert to the caller's own id.
  return createProfileFor(user.id, user.email, user.user_metadata);
}

async function createProfileFor(
  id: string,
  email: string | undefined,
  metadata: Record<string, unknown> | undefined,
): Promise<UserRow> {
  const supabase = await createClient();

  const metaName =
    typeof metadata?.display_name === "string"
      ? metadata.display_name.trim()
      : "";
  const metaAvatar =
    typeof metadata?.avatar_url === "string" ? metadata.avatar_url.trim() : "";

  const { data, error } = await supabase
    .from("users")
    .insert({
      id,
      email: email ?? "",
      display_name: metaName || email?.split("@")[0] || "friend",
      avatar_url: metaAvatar || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Signed in as ${id} but no profile row exists, and creating one failed: ` +
        `${error.message}${error.code ? ` (${error.code})` : ""}`,
    );
  }

  return data;
}

/**
 * Same as getCurrentProfile but redirects to /login when signed out.
 * Use in pages that assume a signed-in user.
 */
export async function requireProfile(): Promise<UserRow> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}
