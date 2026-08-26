"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field, ProgressBar } from "@/components/ui";
import type { ScrapeResult } from "@/lib/scrape-event";
import {
  postEvent,
  scrapeLink,
  type PostState,
  type ScrapeState,
} from "./actions";

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
  const [location, setLocation] = useState(result.location ?? "");
  const [imageUrl, setImageUrl] = useState(result.image_url ?? "");
  const [sourceUrl, setSourceUrl] = useState(result.source_url);
  const [imageBroken, setImageBroken] = useState(false);

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
      />

      <Field
        label="date & time"
        type="datetime-local"
        className="font-mono"
        value={datetime}
        onChange={(event) => setDatetime(event.target.value)}
        hint="Leave empty if you're not sure."
      />
      {/* The action reads this, not the visible field — see localInputToIso. */}
      <input
        type="hidden"
        name="event_datetime"
        value={localInputToIso(datetime)}
      />

      <Field
        label="location"
        name="location"
        className="font-mono"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder="where is it?"
      />

      <Field
        label="image link"
        name="image_url"
        type="url"
        value={imageUrl}
        onChange={(event) => {
          setImageUrl(event.target.value);
          setImageBroken(false);
        }}
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
        hint="Where friends go to actually register."
      />

      <ConfirmActions onRestart={onRestart} />

      {state.status === "error" ? (
        <p className="font-mono text-xs text-poppy">{state.message}</p>
      ) : null}
    </form>
  );
}

function ConfirmActions({ onRestart }: { onRestart: () => void }) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
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
