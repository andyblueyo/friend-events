"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

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

  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user trigger when the auth.users row is created.
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { status: "error", message: error.message };
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
