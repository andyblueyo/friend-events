"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { AvatarChip, Button } from "@/components/ui";
import {
  deleteEvent,
  toggleEventInterest,
  type DeleteState,
  type InterestState,
} from "@/app/feed-actions";
import type { FeedEventRow } from "@/lib/database.types";

const INITIAL: InterestState = { status: "idle" };
const DELETE_INITIAL: DeleteState = { status: "idle" };

/**
 * Dates render with the *browser's* timezone, which won't match the server's
 * during SSR. The markup is identical either way, only the text differs, so
 * suppressHydrationWarning is the right tool rather than deferring the render.
 */
export function formatEventDate(iso: string | null): string {
  if (!iso) return "date TBD";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "date TBD";

  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Just the clock time, for pairing with formatEventDate on an end time that
 * shares the same day as the start. */
function formatTimeOnly(date: Date): string {
  return date.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Sat Aug 30, 2:30 PM" → paired with an end time as either "– 4:00 PM"
 * (same day) or a full second date (different day). Returns null when
 * there's nothing to add. */
export function formatEventEndSuffix(
  startIso: string | null,
  endIso: string | null,
): string | null {
  if (!endIso) return null;

  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return null;

  const start = startIso ? new Date(startIso) : null;
  const sameDay =
    start &&
    !Number.isNaN(start.getTime()) &&
    start.toDateString() === end.toDateString();

  return sameDay ? `– ${formatTimeOnly(end)}` : `– ${formatEventDate(endIso)}`;
}

/**
 * "today" / "tmrw" for the yellow stamp badge, or null to hide it entirely
 * (past events, events further out, or events with no date). Compares
 * calendar days rather than a 24h window, and — like formatEventDate — reads
 * off the *browser's* local clock/timezone, so it needs the same
 * suppressHydrationWarning treatment at the call site.
 *
 * An ongoing multi-day event (start ≤ today ≤ end) still counts as "today";
 * "tmrw" only applies once "today" no longer matches.
 */
export function getUrgencyBadge(
  startIso: string | null,
  endIso: string | null,
): "today" | "tmrw" | null {
  if (!startIso) return null;

  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;

  const parsedEnd = endIso ? new Date(endIso) : null;
  const end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : start;

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const startDay = startOfDay(start);
  const endDay = startOfDay(end);

  const now = new Date();
  const todayDay = startOfDay(now);
  const tomorrowDay = todayDay + 24 * 60 * 60 * 1000;

  if (startDay <= todayDay && todayDay <= endDay) return "today";
  if (startDay <= tomorrowDay && tomorrowDay <= endDay) return "tmrw";
  return null;
}

const PRICE_LABEL: Record<string, string> = { free: "free", paid: "paid" };
const RSVP_LABEL: Record<string, string> = {
  registration: "registration",
  drop_in: "drop-in",
};

/** Small bordered label for the optional price/rsvp facts — quieter than the
 * "open to company" stamp, since these are just metadata, not the hook. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="border-ink bg-white px-1.5 py-0.5 font-mono text-[10px] leading-none text-ink/70">
      {children}
    </span>
  );
}

export function EventCard({
  event,
  interested,
  onToggled,
  compact = false,
}: {
  event: FeedEventRow;
  interested: boolean;
  onToggled: (next: boolean) => void;
  compact?: boolean;
}) {
  const urgency = getUrgencyBadge(event.event_datetime, event.end_datetime);

  return (
    <article className="relative">
      {/* Signature yellow stamp badge, per SPEC.md — now flags near-term
          urgency instead of a redundant "open to company" (every event is
          open to company, so that text carried no signal). Hidden entirely
          for events that aren't today or tomorrow. */}
      {urgency ? (
        <span
          aria-hidden
          suppressHydrationWarning
          className="border-ink bg-sunflower absolute -top-3 right-4 z-10 rotate-[-5deg] px-2 py-1 font-display text-xs leading-none text-ink"
        >
          {urgency === "today" ? "today!" : "happening tomorrow"}
        </span>
      ) : null}

      <div className="border-ink bg-paper shadow-[6px_6px_0_0_var(--color-ink)]">
        <header className="bg-cobalt flex items-center justify-between gap-2 border-b-[2.5px] border-ink px-3 py-1.5">
          <h2 className="truncate font-display text-base leading-none text-white">
            {event.poster_display_name} is going
          </h2>
          <span
            aria-hidden
            className="font-display shrink-0 select-none text-base leading-none tracking-[0.2em] text-white"
          >
            _ □ x
          </span>
        </header>

        <div className="space-y-3 p-4">
          <Link
            href={`/profile/${event.poster_handle}`}
            className="flex items-center gap-2"
          >
            <AvatarChip
              name={event.poster_display_name}
              src={event.poster_avatar_url}
              size={28}
            />
            <span className="truncate font-mono text-xs text-ink/60 hover:underline">
              @{event.poster_handle}
            </span>
          </Link>

          <h3 className="font-display text-lg leading-tight text-ink">
            {event.title}
          </h3>

          {event.price_type || event.rsvp_type ? (
            <div className="flex flex-wrap gap-1.5">
              {event.price_type ? (
                <Tag>{PRICE_LABEL[event.price_type]}</Tag>
              ) : null}
              {event.rsvp_type ? <Tag>{RSVP_LABEL[event.rsvp_type]}</Tag> : null}
            </div>
          ) : null}

          <dl className="space-y-1 font-mono text-xs text-ink/80">
            <div className="flex gap-2">
              <dt className="text-ink/50">when</dt>
              <dd suppressHydrationWarning>
                {formatEventDate(event.event_datetime)}
                {formatEventEndSuffix(event.event_datetime, event.end_datetime)
                  ? ` ${formatEventEndSuffix(event.event_datetime, event.end_datetime)}`
                  : ""}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink/50">where</dt>
              <dd>{event.location ?? "location TBD"}</dd>
            </div>
          </dl>

          {event.notes ? (
            <p className="font-mono text-xs text-ink/70 italic">
              &ldquo;{event.notes}&rdquo;
            </p>
          ) : null}

          {event.image_url && !compact ? (
            <div className="border-ink bg-white p-1">
              {/* Event images come from arbitrary hosts, so no next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.image_url}
                alt=""
                className="max-h-52 w-full object-cover"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              {event.is_mine ? (
                // Posting already means "I'm going" — and the event_interest
                // RLS insert policy requires friendship with the poster, so
                // there's no self-interest row to create anyway.
                <span className="font-mono text-xs text-ink/50">your post</span>
              ) : (
                <InterestButton
                  eventId={event.id}
                  interested={interested}
                  onToggled={onToggled}
                />
              )}

              {event.interest_count > 0 ? (
                <span className="font-mono text-xs text-ink/60">
                  {event.interest_count} interested
                </span>
              ) : null}
            </div>

            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-sm text-poppy underline underline-offset-2"
            >
              open link ↗
            </a>
          </div>

          {event.is_mine ? <OwnerControls eventId={event.id} /> : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Edit link + delete, shown only on the poster's own cards (event.is_mine —
 * driven by the RLS policies, which are the real enforcement here). Delete
 * flips this row into an inline "are you sure?" confirmation rather than
 * deleting on the first click.
 */
function OwnerControls({ eventId }: { eventId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(deleteEvent, DELETE_INITIAL);

  if (confirming) {
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

  return (
    <div className="flex items-center gap-3 border-t-[1.5px] border-ink/10 pt-2">
      <Link
        href={`/edit/${eventId}`}
        className="font-display text-xs text-ink/60 underline underline-offset-2"
      >
        edit
      </Link>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-display text-xs text-poppy underline underline-offset-2"
      >
        delete
      </button>
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

function InterestButton({
  eventId,
  interested,
  onToggled,
}: {
  eventId: string;
  interested: boolean;
  onToggled: (next: boolean) => void;
}) {
  const [state, action] = useActionState(
    async (prev: InterestState, formData: FormData) => {
      const result = await toggleEventInterest(prev, formData);
      if (result.status === "idle" && typeof result.interested === "boolean") {
        onToggled(result.interested);
      }
      return result;
    },
    INITIAL,
  );

  return (
    <span className="flex flex-col gap-1">
      <form action={action}>
        <input type="hidden" name="event_id" value={eventId} />
        <ToggleButton interested={interested} />
      </form>
      {state.status === "error" ? (
        <span className="font-mono text-xs text-poppy">{state.message}</span>
      ) : null}
    </span>
  );
}

function ToggleButton({ interested }: { interested: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={interested ? "plain" : "primary"}
      disabled={pending}
      className="px-3 py-1.5 text-sm"
    >
      {pending ? "…" : interested ? "✓ interested" : "i'm interested"}
    </Button>
  );
}
