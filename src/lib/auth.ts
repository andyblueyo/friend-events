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
  const metaHandle =
    typeof metadata?.handle === "string" ? metadata.handle.trim() : "";

  const displayName = metaName || email?.split("@")[0] || "friend";
  const seed = metaHandle || displayName || email?.split("@")[0] || "friend";

  // handle is NOT NULL and UNIQUE, so a fixed candidate would make this path
  // fail permanently for the second person who needs it. Retry with a fresh
  // suffix on a unique violation.
  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("users")
      .insert({
        id,
        email: email ?? "",
        display_name: displayName,
        handle: handleCandidate(seed, attempt),
        avatar_url: metaAvatar || null,
      })
      .select()
      .single();

    if (!error) return data;

    lastError = `${error.message}${error.code ? ` (${error.code})` : ""}`;
    if (error.code !== "23505") break; // not a uniqueness clash — no point retrying
  }

  throw new Error(
    `Signed in as ${id} but no profile row exists, and creating one failed: ${lastError}`,
  );
}

/** Mirrors the users_handle_format CHECK: [a-z0-9_], 3-20 characters. */
function handleCandidate(seed: string, attempt: number): string {
  const base =
    seed.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15) || "friend";
  const padded = base.padEnd(3, "0");

  // First attempt uses the clean handle; later ones append a random suffix.
  if (attempt === 0) return padded;

  const suffix = Math.random().toString(16).slice(2, 6).padEnd(4, "0");
  return `${padded.slice(0, 15)}_${suffix}`;
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
