"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field, ProgressBar, Textarea, ToggleGroup } from "@/components/ui";
import type { PriceType, RsvpType } from "@/lib/database.types";
import type { ScrapeResult } from "@/lib/scrape-event";
import {
  postEvent,
  scrapeLink,
  type PostFieldErrors,
  type PostState,
  type ScrapeState,
} from "./actions";

const NOTES_MAX_LENGTH = 150;

const PRICE_OPTIONS: { value: PriceType; label: string }[] = [
  { value: "free", label: "free" },
  { value: "paid", label: "paid" },
];

const RSVP_OPTIONS: { value: RsvpType; label: string }[] = [
  { value: "registration", label: "registration" },
  { value: "drop_in", label: "drop-in" },
];

const SCRAPE_INITIAL: ScrapeState = { status: "idle" };
const POST_INITIAL: PostState = { status: "idle" };

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

export function PostFlow() {
  // Remounting is the simplest way to clear both actions' state when the user
  // wants to start over with a different link.
  const [attempt, setAttempt] = useState(0);

  return (
    <PostFlowInner
      key={attempt}
      onRestart={() => setAttempt((value) => value + 1)}
    />
  );
}

function PostFlowInner({ onRestart }: { onRestart: () => void }) {
  const [state, action] = useActionState(scrapeLink, SCRAPE_INITIAL);

  if (state.status === "ready") {
    return <ConfirmForm result={state.result} onRestart={onRestart} />;
  }

  return (
    <form action={action} className="space-y-4">
      <PasteFields
        error={state.status === "error" ? state.message : undefined}
      />
    </form>
  );
}

function PasteFields({ error }: { error?: string }) {
  const { pending } = useFormStatus();

  return (
    <>
      <fieldset disabled={pending} className="space-y-4">
        <Field
          label="event link"
          name="url"
          type="url"
          required
          autoComplete="off"
          placeholder="https://lu.ma/some-event"
          hint="Partiful, Luma, Eventbrite — anything with a public page."
        />
        <Button type="submit">{pending ? "reading…" : "scrape it"}</Button>
      </fieldset>

      {pending ? <ProgressBar label="fetching the page…" /> : null}

      {error && !pending ? (
        <p className="font-mono text-xs text-poppy">{error}</p>
      ) : null}
    </>
  );
}

function ConfirmForm({
  result,
  onRestart,
}: {
  result: ScrapeResult;
  onRestart: () => void;
}) {
  const [state, action] = useActionState(postEvent, POST_INITIAL);

  // Controlled on purpose: React resets uncontrolled fields once a form action
  // resolves, which would wipe the user's edits when posting fails.
  const [title, setTitle] = useState(result.title ?? "");
  const [datetime, setDatetime] = useState(
    toLocalInputValue(result.event_datetime),
  );
  const [endDatetime, setEndDatetime] = useState("");
  const [location, setLocation] = useState(result.location ?? "");
  const [notes, setNotes] = useState("");
  const [priceType, setPriceType] = useState<PriceType | null>(null);
  const [rsvpType, setRsvpType] = useState<RsvpType | null>(null);
  const [imageUrl, setImageUrl] = useState(result.image_url ?? "");
  const [sourceUrl, setSourceUrl] = useState(result.source_url);
  const [imageBroken, setImageBroken] = useState(false);

  // A field only turns red once the person has left it, not on first paint —
  // otherwise a freshly-opened form (title blank, nothing scraped) would look
  // broken before anyone's typed anything.
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  // Client-side checks mirror the server's required-field rules exactly, so
  // the button disables/enables in step with what the server would accept.
  const clientErrors: PostFieldErrors = {
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
  const errorFor = (field: keyof PostFieldErrors) =>
    state.fieldErrors?.[field] ??
    (touched[field] ? clientErrors[field] : undefined);

  return (
    <form action={action} className="space-y-4">
      {result.scrape_status === "failed" ? (
        <p className="border-ink bg-sunflower/40 px-3 py-2 font-mono text-xs">
          couldn&apos;t read that page — fill in the details yourself
        </p>
      ) : null}

      {result.scrape_status === "partial" ? (
        <p className="font-mono text-xs text-ink/60">
          Some fields came back empty — add what&apos;s missing.
        </p>
      ) : null}

      <Field
        label="title"
        name="title"
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => markTouched("title")}
        error={errorFor("title")}
      />

      <Field
        label="date & time"
        type="datetime-local"
        className="font-mono"
        required
        value={datetime}
        onChange={(event) => setDatetime(event.target.value)}
        onBlur={() => markTouched("event_datetime")}
        error={errorFor("event_datetime")}
      />
      {/* The action reads this, not the visible field — see localInputToIso. */}
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
        onChange={(event) => setEndDatetime(event.target.value)}
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
        onChange={(event) => setLocation(event.target.value)}
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
        onChange={(event) => setNotes(event.target.value)}
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
        onChange={(event) => {
          setImageUrl(event.target.value);
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
        onChange={(event) => setSourceUrl(event.target.value)}
        onBlur={() => markTouched("source_url")}
        error={errorFor("source_url")}
        hint="Where friends go to actually register."
      />

      <ConfirmActions onRestart={onRestart} canSubmit={canSubmit} />

      {state.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{state.message}</p>
      ) : null}
    </form>
  );
}

function ConfirmActions({
  onRestart,
  canSubmit,
}: {
  onRestart: () => void;
  canSubmit: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending || !canSubmit}>
        {pending ? "posting…" : "post to your feed"}
      </Button>
      <Button
        type="button"
        variant="plain"
        onClick={onRestart}
        disabled={pending}
      >
        paste a different link
      </Button>
    </div>
  );
}
