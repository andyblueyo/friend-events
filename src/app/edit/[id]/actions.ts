"use server";

import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  parseAudienceTagIds,
  parseEventForm,
  type EventFieldErrors,
} from "@/lib/event-form";

export type EditFieldErrors = EventFieldErrors;

export type EditState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: EditFieldErrors;
};

export async function updateEvent(
  _prev: EditState,
  formData: FormData,
): Promise<EditState> {
  const profile = await getCurrentProfile();
  if (!profile) return { status: "error", message: "Sign in first." };

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) return { status: "error", message: "Missing event." };

  const parsed = parseEventForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const supabase = await createClient();
  // Scoped by posted_by as well as id — belt and suspenders on top of the RLS
  // update policy, which already restricts this to the event's owner.
  const { error, count } = await supabase
    .from("events")
    .update(parsed.fields, { count: "exact" })
    .eq("id", eventId)
    .eq("posted_by", profile.id);

  if (error) {
    return {
      status: "error",
      message: `Couldn't save that: ${error.message}`,
    };
  }

  if (!count) {
    return {
      status: "error",
      message: "Couldn't find that event — it may have been deleted.",
    };
  }

  // Replace rather than diff: simpler, and event_tags is small per event, so
  // there's no meaningful cost to clearing and re-inserting on every save.
  const { error: clearError } = await supabase
    .from("event_tags")
    .delete()
    .eq("event_id", eventId);

  if (clearError) {
    return {
      status: "error",
      message: `Saved, but couldn't update the audience: ${clearError.message}`,
    };
  }

  if (parsed.fields.audience_mode === "tags") {
    const tagIds = parseAudienceTagIds(formData);
    if (tagIds.length > 0) {
      const { error: tagError } = await supabase.from("event_tags").insert(
        tagIds.map((tagId) => ({ event_id: eventId, tag_id: tagId })),
      );
      if (tagError) {
        return {
          status: "error",
          message: `Saved, but couldn't update the audience: ${tagError.message}`,
        };
      }
    }
  }

  redirect("/");
}
