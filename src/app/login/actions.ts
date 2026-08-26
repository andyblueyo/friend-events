"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { HANDLE_HINT, isValidHandle } from "@/lib/handle";

export type AuthMode = "signin" | "signup";

export type LoginState = {
  status: "idle" | "error" | "check_email";
  message?: string;
};

const MIN_PASSWORD_LENGTH = 8;

async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  // Fall back to the request host so preview deploys and localhost work
  // without extra config.
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function authenticate(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const mode: AuthMode =
    formData.get("mode") === "signup" ? "signup" : "signin";
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!email.includes("@")) {
    return { status: "error", message: "That doesn't look like an email." };
  }

  const supabase = await createClient();

  if (mode === "signin") {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Supabase returns the same "Invalid login credentials" for a wrong
      // password and an unknown email — keep it that way rather than
      // confirming which addresses have accounts.
      return { status: "error", message: error.message };
    }

    redirect(next);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      status: "error",
      message: `Password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (!displayName) {
    return { status: "error", message: "Pick a display name." };
  }

  const handle = String(formData.get("handle") ?? "")
    .trim()
    .toLowerCase();

  if (!isValidHandle(handle)) {
    return { status: "error", message: `Handle: ${HANDLE_HINT}` };
  }

  // Checked up front so the common case gets a clean message. The real
  // guarantee is the UNIQUE constraint, handled below.
  const { data: available, error: availabilityError } = await supabase.rpc(
    "handle_available",
    { candidate: handle },
  );

  if (availabilityError) {
    return {
      status: "error",
      message: `Couldn't check that handle: ${availabilityError.message}`,
    };
  }
  if (available === false) {
    return { status: "error", message: `@${handle} is taken.` };
  }

  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user trigger when the auth.users row is created.
      data: { display_name: displayName, handle },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // The trigger inserts the profile inside the signup transaction, so a
    // handle claimed between our check and here surfaces as an opaque
    // "Database error saving new user" rather than a constraint message.
    const raced = /database error saving new user/i.test(error.message);
    return {
      status: "error",
      message: raced
        ? `Couldn't create that account — @${handle} may have just been taken. Try another.`
        : error.message,
    };
  }

  // Email confirmation off: Supabase returns a session, so we're already in.
  if (data.session) {
    redirect(next);
  }

  // Email confirmation on. An empty `identities` array means the address was
  // already registered — Supabase obfuscates this to prevent enumeration, so
  // show the same message either way.
  return { status: "check_email" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
