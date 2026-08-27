"use server";

import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  parseAudienceTagIds,
  parseEventForm,
  type EventFieldErrors,
} from "@/lib/event-form";
import { UnsafeUrlError } from "@/lib/safe-fetch";
import { scrapeEventUrl, type ScrapeResult } from "@/lib/scrape-event";

export type ScrapeState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; result: ScrapeResult };

export type PostFieldErrors = EventFieldErrors;

export type PostState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: PostFieldErrors;
};

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

  const parsed = parseEventForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("events")
    .insert({
      posted_by: profile.id, // never from the client
      ...parsed.fields,
    })
    .select("id")
    .single();

  if (error) {
    return {
      status: "error",
      message: `Couldn't post that: ${error.message}`,
    };
  }

  if (parsed.fields.audience_mode === "tags") {
    const tagIds = parseAudienceTagIds(formData);
    if (tagIds.length > 0) {
      // event_tags' insert policy re-checks that every tag_id is actually
      // owned by profile.id, so a tampered id here just fails to insert
      // rather than scoping the event to someone else's tag.
      const { error: tagError } = await supabase.from("event_tags").insert(
        tagIds.map((tagId) => ({ event_id: inserted.id, tag_id: tagId })),
      );
      if (tagError) {
        return {
          status: "error",
          message: `Posted, but couldn't set the audience: ${tagError.message}`,
        };
      }
    }
  }

  // Outside the try/catch above on purpose — redirect() signals by throwing.
  redirect("/");
}
