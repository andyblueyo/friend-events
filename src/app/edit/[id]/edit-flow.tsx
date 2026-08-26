"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field, Textarea, ToggleGroup } from "@/components/ui";
import { deleteEvent, type DeleteState } from "@/app/feed-actions";
import type { EventRow, PriceType, RsvpType } from "@/lib/database.types";
import { updateEvent, type EditFieldErrors, type EditState } from "./actions";

const NOTES_MAX_LENGTH = 150;

const PRICE_OPTIONS: { value: PriceType; label: string }[] = [
  { value: "free", label: "free" },
  { value: "paid", label: "paid" },
];

const RSVP_OPTIONS: { value: RsvpType; label: string }[] = [
  { value: "registration", label: "registration" },
  { value: "drop_in", label: "drop-in" },
];

const EDIT_INITIAL: EditState = { status: "idle" };
const DELETE_INITIAL: DeleteState = { status: "idle" };

/** ISO → the "YYYY-MM-DDTHH:mm" a datetime-local input expects, in local time. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Back to ISO, resolved against the browser's timezone rather than the server's. */
function localInputToIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function EditFlow({ event }: { event: EventRow }) {
  const [state, action] = useActionState(updateEvent, EDIT_INITIAL);

  // Controlled on purpose: React resets uncontrolled fields once a form action
  // resolves, which would wipe the user's edits when saving fails.
  // title is only ever null on a fork row, and this page is unreachable for
  // forks (event-card.tsx doesn't render an edit link for one) — the
  // fallback here is just satisfying the type, not a real case.
  const [title, setTitle] = useState(event.title ?? "");
  const [datetime, setDatetime] = useState(
    toLocalInputValue(event.event_datetime),
  );
  const [endDatetime, setEndDatetime] = useState(
    toLocalInputValue(event.end_datetime),
  );
  const [location, setLocation] = useState(event.location ?? "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [priceType, setPriceType] = useState<PriceType | null>(
    event.price_type,
  );
  const [rsvpType, setRsvpType] = useState<RsvpType | null>(event.rsvp_type);
  const [imageUrl, setImageUrl] = useState(event.image_url ?? "");
  const [sourceUrl, setSourceUrl] = useState(event.source_url);
  const [imageBroken, setImageBroken] = useState(false);

  // A field only turns red once the person has left it, not on first paint.
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  // Client-side checks mirror the server's required-field rules exactly, so
  // the button disables/enables in step with what the server would accept.
  const clientErrors: EditFieldErrors = {
    title: title.trim() ? undefined : "Give it a title.",
    event_datetime: datetime ? undefined : "Add a date & time.",
    location: location.trim() ? undefined : "Add a location.",
    source_url: sourceUrl.trim()
      ? undefined
      : "Add the link friends will register at.",
  };

  const canSubmit = Object.values(clientErrors).every((message) => !message);

  // Server errors (from an actual submit attempt) always win over the local
  // touched/client-error guess, since they reflect what really happened.
  const errorFor = (field: keyof EditFieldErrors) =>
    state.fieldErrors?.[field] ??
    (touched[field] ? clientErrors[field] : undefined);

  return (
    <div className="space-y-4">
    <form action={action} className="space-y-4">
      <input type="hidden" name="event_id" value={event.id} />

      <Field
        label="title"
        name="title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => markTouched("title")}
        error={errorFor("title")}
      />

      <Field
        label="date & time"
        type="datetime-local"
        className="font-mono"
        required
        value={datetime}
        onChange={(e) => setDatetime(e.target.value)}
        onBlur={() => markTouched("event_datetime")}
        error={errorFor("event_datetime")}
      />
      <input
        type="hidden"
        name="event_datetime"
        value={localInputToIso(datetime)}
      />

      <Field
        label="end time"
        type="datetime-local"
        className="font-mono"
        value={endDatetime}
        onChange={(e) => setEndDatetime(e.target.value)}
        onBlur={() => markTouched("end_datetime")}
        error={state.fieldErrors?.end_datetime}
        hint="Optional."
      />
      <input
        type="hidden"
        name="end_datetime"
        value={localInputToIso(endDatetime)}
      />

      <Field
        label="location"
        name="location"
        className="font-mono"
        required
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        onBlur={() => markTouched("location")}
        error={errorFor("location")}
        placeholder="where is it?"
      />

      <Textarea
        label="notes"
        name="notes"
        rows={2}
        maxLength={NOTES_MAX_LENGTH}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={state.fieldErrors?.notes}
        placeholder="anything friends should know?"
        hint="Optional."
      />

      <div className="flex flex-wrap gap-6">
        <ToggleGroup
          label="cost"
          options={PRICE_OPTIONS}
          value={priceType}
          onChange={setPriceType}
        />
        <ToggleGroup
          label="rsvp"
          options={RSVP_OPTIONS}
          value={rsvpType}
          onChange={setRsvpType}
        />
      </div>
      <input type="hidden" name="price_type" value={priceType ?? ""} />
      <input type="hidden" name="rsvp_type" value={rsvpType ?? ""} />

      <Field
        label="image link"
        name="image_url"
        type="url"
        value={imageUrl}
        onChange={(e) => {
          setImageUrl(e.target.value);
          setImageBroken(false);
        }}
        error={state.fieldErrors?.image_url}
        placeholder="https://…"
      />

      {imageUrl && !imageBroken ? (
        <div className="border-ink bg-white p-2">
          {/* Event images come from arbitrary hosts, so no next/image here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="max-h-48 w-full object-cover"
            onError={() => setImageBroken(true)}
          />
        </div>
      ) : null}

      {imageBroken ? (
        <p className="font-mono text-xs text-ink/60">
          That image didn&apos;t load — clear it or paste another.
        </p>
      ) : null}

      <Field
        label="source link"
        name="source_url"
        type="url"
        required
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        onBlur={() => markTouched("source_url")}
        error={errorFor("source_url")}
        hint="Where friends go to actually register."
      />

      <EditActions canSubmit={canSubmit} />

      {state.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{state.message}</p>
      ) : null}
    </form>

    <div className="border-t-[1.5px] border-ink/20 pt-4">
      <DeleteControl eventId={event.id} />
    </div>
    </div>
  );
}

function EditActions({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending || !canSubmit}>
        {pending ? "saving…" : "save changes"}
      </Button>
      <Link
        href="/"
        className="font-display text-sm text-ink/60 underline underline-offset-2"
      >
        cancel
      </Link>
    </div>
  );
}

/**
 * Rendered as a sibling of the edit form, not nested inside it — HTML
 * doesn't allow nested <form> elements, and this needs its own action
 * (deleteEvent) separate from the edit form's (updateEvent).
 */
function DeleteControl({ eventId }: { eventId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(deleteEvent, DELETE_INITIAL);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-display text-sm text-poppy underline underline-offset-2"
      >
        delete this event
      </button>
    );
  }

  return (
    <div className="border-poppy space-y-2 border-[1.5px] border-dashed bg-poppy/10 p-3">
      <p className="font-display text-sm text-poppy">
        delete this event? this can&apos;t be undone.
      </p>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="event_id" value={eventId} />
        <ConfirmDeleteButton />
        <Button
          type="button"
          variant="plain"
          className="px-3 py-1.5 text-sm"
          onClick={() => setConfirming(false)}
        >
          cancel
        </Button>
      </form>
      {state.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{state.message}</p>
      ) : null}
    </div>
  );
}

function ConfirmDeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-poppy border-ink px-3 py-1.5 text-sm text-white"
    >
      {pending ? "deleting…" : "yes, delete"}
    </Button>
  );
}
