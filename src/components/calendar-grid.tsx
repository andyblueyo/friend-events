"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui";
import type { FeedEventRow } from "@/lib/database.types";

const WEEKDAYS = ["s", "m", "t", "w", "t", "f", "s"];

/** Local-time YYYY-MM-DD key. Avoids toISOString(), which shifts to UTC. */
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Hand-rolled month grid — no calendar dependency, per the spec.
 *
 * Only ever rendered after the user switches to calendar view, so it always
 * runs client-side and groups events by the *browser's* local date. Rendering
 * it during SSR would bucket events using the server's timezone instead.
 */
export function CalendarGrid({
  events,
  renderDay,
}: {
  events: FeedEventRow[];
  renderDay: (dayEvents: FeedEventRow[]) => React.ReactNode;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  const { dated, undated } = useMemo(() => {
    const withDate: FeedEventRow[] = [];
    const withoutDate: FeedEventRow[] = [];

    for (const event of events) {
      const parsed = event.event_datetime
        ? new Date(event.event_datetime)
        : null;
      if (parsed && !Number.isNaN(parsed.getTime())) withDate.push(event);
      else withoutDate.push(event);
    }

    return { dated: withDate, undated: withoutDate };
  }, [events]);

  const byDay = useMemo(() => {
    const map = new Map<string, FeedEventRow[]>();
    for (const event of dated) {
      const key = dayKey(new Date(event.event_datetime as string));
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [dated]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const result: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) result.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      result.push(new Date(year, month, day));
    }
    // Pad to whole weeks so the grid keeps its shape.
    while (result.length % 7 !== 0) result.push(null);

    return result;
  }, [cursor]);

  const monthLabel = cursor.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayKey = dayKey(new Date());
  const selectedEvents = selected ? (byDay.get(selected) ?? []) : [];

  function shiftMonth(delta: number) {
    setCursor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="plain"
          onClick={() => shiftMonth(-1)}
          className="px-2 py-1 text-sm"
          aria-label="previous month"
        >
          ‹
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-display text-base text-ink">{monthLabel}</span>
          <Button
            variant="plain"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelected(null);
            }}
            className="px-2 py-1 text-xs"
          >
            today
          </Button>
        </div>
        <Button
          variant="plain"
          onClick={() => shiftMonth(1)}
          className="px-2 py-1 text-sm"
          aria-label="next month"
        >
          ›
        </Button>
      </div>

      <div className="border-ink grid grid-cols-7 bg-ink/20 gap-[2px]">
        {WEEKDAYS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="bg-cobalt py-1 text-center font-display text-xs text-white"
          >
            {label}
          </div>
        ))}

        {cells.map((date, index) => {
          if (!date) {
            return <div key={`pad-${index}`} className="min-h-14 bg-paper/40" />;
          }

          const key = dayKey(date);
          const dayEvents = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selected;

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(isSelected ? null : key)}
              disabled={dayEvents.length === 0}
              className={`min-h-14 p-1 text-left align-top transition-colors ${
                isSelected ? "bg-sunflower" : "bg-white"
              } ${dayEvents.length ? "cursor-pointer hover:bg-sunflower/50" : "cursor-default"}`}
            >
              <span
                className={`font-mono text-xs ${
                  isToday
                    ? "bg-cobalt px-1 text-white"
                    : "text-ink/70"
                }`}
              >
                {date.getDate()}
              </span>
              {dayEvents.length ? (
                <span className="mt-1 block truncate font-sans text-[10px] leading-tight text-ink">
                  <span className="bg-poppy mr-1 inline-block h-2 w-2 align-middle" />
                  {dayEvents.length === 1
                    ? dayEvents[0].title
                    : `${dayEvents.length} events`}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <section className="space-y-3">
          <h3 className="font-display text-sm text-ink">
            {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
          {renderDay(selectedEvents)}
        </section>
      ) : (
        <p className="font-sans text-sm text-ink/60">
          Pick a highlighted day to see what&apos;s on.
        </p>
      )}

      {undated.length ? (
        <section className="space-y-2">
          <h3 className="font-display text-sm text-ink">
            undated ({undated.length})
          </h3>
          <p className="font-mono text-xs text-ink/60">
            No date scraped — these can&apos;t sit on the grid.
          </p>
          {renderDay(undated)}
        </section>
      ) : null}
    </div>
  );
}
