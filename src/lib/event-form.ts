import type { PriceType, RsvpType } from "@/lib/database.types";
import {
  isBlockedIpLiteral,
  parseHttpUrl,
  UnsafeUrlError,
} from "@/lib/safe-fetch";

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

export type EventFieldErrors = Partial<
  Record<
    | "title"
    | "event_datetime"
    | "end_datetime"
    | "location"
    | "notes"
    | "source_url"
    | "image_url",
    string
  >
>;

export type ParsedEventFields = {
  title: string;
  event_datetime: string;
  end_datetime: string | null;
  location: string;
  notes: string | null;
  price_type: PriceType | null;
  rsvp_type: RsvpType | null;
  image_url: string | null;
  source_url: string;
};

export type ParseEventFormResult =
  | { ok: true; fields: ParsedEventFields }
  | { ok: false; fieldErrors: EventFieldErrors };

const NOTES_MAX_LENGTH = 150;
const PRICE_TYPES: PriceType[] = ["free", "paid"];
const RSVP_TYPES: RsvpType[] = ["registration", "drop_in"];

/** Parses an optional toggle value: empty string means "not set" (null), and
 * anything else must be one of the known options. */
function parseOptionalEnum<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
): T | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Shared validation for both "post a new event" and "edit an existing
 * event" — same fields, same rules, so both actions call this instead of
 * duplicating it.
 */
export function parseEventForm(formData: FormData): ParseEventFormResult {
  const title = String(formData.get("title") ?? "").trim();
  const rawSource = String(formData.get("source_url") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const rawImage = String(formData.get("image_url") ?? "").trim();
  const rawNotes = String(formData.get("notes") ?? "").trim();
  // The client converts the datetime-local value to ISO using the *browser's*
  // timezone; parsing the raw local string here would silently apply the
  // server's instead.
  const isoDatetime = String(formData.get("event_datetime") ?? "").trim();
  const isoEndDatetime = String(formData.get("end_datetime") ?? "").trim();
  const priceType = parseOptionalEnum(formData.get("price_type"), PRICE_TYPES);
  const rsvpType = parseOptionalEnum(formData.get("rsvp_type"), RSVP_TYPES);

  // Collected rather than returned on the first failure, so the form can
  // highlight every bad field at once instead of one at a time.
  const fieldErrors: EventFieldErrors = {};

  if (!title) fieldErrors.title = "Give it a title.";

  if (rawNotes.length > NOTES_MAX_LENGTH) {
    fieldErrors.notes = `Notes need to be ${NOTES_MAX_LENGTH} characters or fewer.`;
  }
  const notes = rawNotes || null;

  let sourceUrl: string | null = null;
  if (!rawSource.trim()) {
    fieldErrors.source_url = "Add the link friends will register at.";
  } else {
    try {
      sourceUrl = parseStorableUrl(rawSource).toString();
    } catch (error) {
      fieldErrors.source_url =
        error instanceof UnsafeUrlError
          ? error.message
          : "That source link isn't valid.";
    }
  }

  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      imageUrl = parseStorableUrl(rawImage).toString();
    } catch (error) {
      fieldErrors.image_url =
        error instanceof UnsafeUrlError
          ? error.message
          : "That image link isn't valid.";
    }
  }

  let eventDatetime: string | null = null;
  if (!isoDatetime) {
    fieldErrors.event_datetime = "Add a date & time.";
  } else {
    const parsed = new Date(isoDatetime);
    if (Number.isNaN(parsed.getTime())) {
      fieldErrors.event_datetime = "That date didn't parse.";
    } else {
      eventDatetime = parsed.toISOString();
    }
  }

  let endDatetime: string | null = null;
  if (isoEndDatetime) {
    const parsed = new Date(isoEndDatetime);
    if (Number.isNaN(parsed.getTime())) {
      fieldErrors.end_datetime = "That end time didn't parse.";
    } else {
      endDatetime = parsed.toISOString();
    }
  }

  if (
    eventDatetime &&
    endDatetime &&
    new Date(endDatetime) <= new Date(eventDatetime)
  ) {
    fieldErrors.end_datetime = "End time needs to be after the start time.";
  }

  if (!location) fieldErrors.location = "Add a location.";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    fields: {
      title,
      // Validated above — if we got here, eventDatetime/sourceUrl are set.
      event_datetime: eventDatetime as string,
      end_datetime: endDatetime,
      location,
      notes,
      price_type: priceType,
      rsvp_type: rsvpType,
      image_url: imageUrl,
      source_url: sourceUrl as string,
    },
  };
}
