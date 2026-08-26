"use client";

import { useMemo, useState } from "react";

import { CalendarGrid } from "@/components/calendar-grid";
import { EventCard } from "@/components/event-card";
import { Window } from "@/components/window";
import type { FeedEventRow } from "@/lib/database.types";

type View = "list" | "calendar";
type Sort = "upcoming" | "recent";
type Filter = "all" | "interested";

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-ink/50">{label}</span>
      <div className="flex">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            className={`border-ink px-2 py-1 font-display text-xs leading-none ${
              option.value === value
                ? "bg-cobalt text-white"
                : "bg-paper text-ink hover:bg-grid"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FeedClient({ events }: { events: FeedEventRow[] }) {
  const [view, setView] = useState<View>("list");
  const [sort, setSort] = useState<Sort>("upcoming");
  const [filter, setFilter] = useState<Filter>("all");

  // Interest changes revalidate the page, but keeping a local override makes
  // the button flip immediately instead of waiting for the round trip.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  // Same idea, for the fork toggle.
  const [forkOverrides, setForkOverrides] = useState<Record<string, boolean>>(
    {},
  );

  const isInterested = (event: FeedEventRow) =>
    overrides[event.id] ?? event.is_interested;

  const isShared = (event: FeedEventRow) =>
    forkOverrides[event.id] ?? event.already_forked_by_me;

  const visible = useMemo(() => {
    const filtered =
      filter === "interested"
        ? events.filter((event) => overrides[event.id] ?? event.is_interested)
        : events;

    if (sort === "recent") {
      return [...filtered].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }

    // Upcoming: soonest first, undated pushed to the bottom rather than
    // sorting as epoch-zero and dominating the top.
    return [...filtered].sort((a, b) => {
      const aTime = a.event_datetime
        ? new Date(a.event_datetime).getTime()
        : null;
      const bTime = b.event_datetime
        ? new Date(b.event_datetime).getTime()
        : null;

      if (aTime === null && bTime === null) {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return aTime - bTime;
    });
  }, [events, filter, sort, overrides]);

  // Hide events whose start time has already passed — but only from the
  // list view. The calendar is a historical record too, so past events stay
  // visible there.
  const listVisible = useMemo(
    () =>
      visible.filter(
        (event) =>
          !event.event_datetime ||
          new Date(event.event_datetime).getTime() >= new Date().getTime(),
      ),
    [visible],
  );

  const rows = view === "list" ? listVisible : visible;

  const renderCards = (rows: FeedEventRow[]) => (
    <div className="space-y-6">
      {rows.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          interested={isInterested(event)}
          onToggled={(next) =>
            setOverrides((current) => ({ ...current, [event.id]: next }))
          }
          shared={isShared(event)}
          onForkToggled={(next) =>
            setForkOverrides((current) => ({ ...current, [event.id]: next }))
          }
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <Window title="feed">
        <div className="flex flex-wrap items-center gap-4">
          <Toggle
            label="view"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "list" },
              { value: "calendar", label: "calendar" },
            ]}
          />
          {/* Calendar is inherently date-ordered, so sort only applies to list. */}
          {view === "list" ? (
            <Toggle
              label="sort"
              value={sort}
              onChange={setSort}
              options={[
                { value: "upcoming", label: "upcoming" },
                { value: "recent", label: "recent" },
              ]}
            />
          ) : null}
          <Toggle
            label="show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "all" },
              { value: "interested", label: "interested" },
            ]}
          />
        </div>
      </Window>

      {rows.length === 0 ? (
        <Window title="nothing here">
          <p className="font-sans text-sm text-ink/80">
            {filter === "interested"
              ? "You haven't marked interest in anything yet."
              : view === "list"
                ? "No upcoming events. Post one, or add friends and wait for theirs."
                : "No events yet. Post one, or add friends and wait for theirs."}
          </p>
        </Window>
      ) : view === "list" ? (
        renderCards(rows)
      ) : (
        <Window title="calendar">
          <CalendarGrid events={rows} renderDay={renderCards} />
        </Window>
      )}
    </div>
  );
}
