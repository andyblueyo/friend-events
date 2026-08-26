"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { AvatarChip, Button } from "@/components/ui";
import { toggleEventInterest, type InterestState } from "@/app/feed-actions";
import type { FeedEventRow } from "@/lib/database.types";

const INITIAL: InterestState = { status: "idle" };

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
  return (
    <article className="relative">
      {/* The one signature element on every card, per SPEC.md. */}
      <span
        aria-hidden
        className="border-ink bg-sunflower absolute -top-3 right-4 z-10 rotate-[-5deg] px-2 py-1 font-display text-xs leading-none text-ink"
      >
        open to company
      </span>

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
          <div className="flex items-center gap-2">
            <AvatarChip
              name={event.poster_display_name}
              src={event.poster_avatar_url}
              size={28}
            />
            <span className="truncate font-mono text-xs text-ink/60">
              @{event.poster_handle}
            </span>
          </div>

          <h3 className="font-display text-lg leading-tight text-ink">
            {event.title}
          </h3>

          <dl className="space-y-1 font-mono text-xs text-ink/80">
            <div className="flex gap-2">
              <dt className="text-ink/50">when</dt>
              <dd suppressHydrationWarning>
                {formatEventDate(event.event_datetime)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink/50">where</dt>
              <dd>{event.location ?? "location TBD"}</dd>
            </div>
          </dl>

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
        </div>
      </div>
    </article>
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
