"use server";

import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isBlockedIpLiteral,
  parseHttpUrl,
  UnsafeUrlError,
} from "@/lib/safe-fetch";
import { scrapeEventUrl, type ScrapeResult } from "@/lib/scrape-event";

/**
 * Validates a URL we're going to store and later render as a link. The scrape
 * path checks addresses as part of fetching; this path never fetches, so the
 * literal check has to happen here or a private link sails through.
 */
function parseStorableUrl(raw: string): URL {
  const url = parseHttpUrl(raw);
  if (isBlockedIpLiteral(url.hostname)) {
    throw new UnsafeUrlError("That link points at a private address.");
  }
  return url;
}

export type ScrapeState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; result: ScrapeResult };

export type PostState = { status: "idle" | "error"; message?: string };

export async function scrapeLink(
  _prev: ScrapeState,
  formData: FormData,
): Promise<ScrapeState> {
  // Server actions are callable by anyone who can reach the app, and this one
  // makes outbound requests — so it's sign-in gated, not just UI-gated.
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const url = String(formData.get("url") ?? "");

  try {
    return { status: "ready", result: await scrapeEventUrl(url) };
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message: "Couldn't read that link. Check it and try again.",
    };
  }
}

export async function postEvent(
  _prev: PostState,
  formData: FormData,
): Promise<PostState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const title = String(formData.get("title") ?? "").trim();
  const rawSource = String(formData.get("source_url") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const rawImage = String(formData.get("image_url") ?? "").trim();
  // The client converts the datetime-local value to ISO using the *browser's*
  // timezone; parsing the raw local string here would silently apply the
  // server's instead.
  const isoDatetime = String(formData.get("event_datetime") ?? "").trim();

  if (!title) return { status: "error", message: "Give it a title." };

  let sourceUrl: string;
  try {
    sourceUrl = parseStorableUrl(rawSource).toString();
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof UnsafeUrlError
          ? error.message
          : "That source link isn't valid.",
    };
  }

  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      imageUrl = parseStorableUrl(rawImage).toString();
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof UnsafeUrlError
            ? `Image link: ${error.message.toLowerCase()}`
            : "That image link isn't valid.",
      };
    }
  }

  let eventDatetime: string | null = null;
  if (isoDatetime) {
    const parsed = new Date(isoDatetime);
    if (Number.isNaN(parsed.getTime())) {
      return { status: "error", message: "That date didn't parse." };
    }
    eventDatetime = parsed.toISOString();
  }

  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    posted_by: profile.id, // never from the client
    title,
    event_datetime: eventDatetime,
    location: location || null,
    image_url: imageUrl,
    source_url: sourceUrl,
  });

  if (error) {
    return {
      status: "error",
      message: `Couldn't post that: ${error.message}`,
    };
  }

  // Outside the try/catch above on purpose — redirect() signals by throwing.
  redirect("/");
}
