import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/today";
import { monthGrid, shiftMonth, toIsoDay, weekdayLabels } from "@/lib/calendar";
import { monthNames } from "@/data/settings-data";
import { useSettings } from "@/services/settings";
import { type BoardRow } from "./types";
import { statusTone, getDeliveryStatus } from "./board-helpers";

const CALENDAR_ITEMS_PER_DAY = 3;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * A month of the board's items, each on its finish date (or its start date when it has no
 * finish). Opens on the current month in the organisation's time zone; the week starts on the
 * day set in Settings › Regional.
 */
export function CalendarView({
  rows,
  setOpenItem,
}: {
  rows: BoardRow[];
  setOpenItem: (row: BoardRow) => void;
}) {
  const regional = useSettings().regional;
  const today = todayIso(regional.timeZone);
  const [shown, setShown] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const weekStart = regional.firstDayOfWeek ?? 1;
  const days = monthGrid(shown.year, shown.month, weekStart);
  const byDay = useMemo(() => {
    const map = new Map<string, BoardRow[]>();
    for (const row of rows) {
      const iso = toIsoDay(row.finish) ?? toIsoDay(row.start);
      if (iso) map.set(iso, [...(map.get(iso) ?? []), row]);
    }
    return map;
  }, [rows]);
  const heading = `${monthNames[shown.month - 1]} ${shown.year}`;
  const move = (delta: number) =>
    setShown((current) => shiftMonth(current.year, current.month, delta));
  const longDate = (iso: string) =>
    `${Number(iso.slice(8, 10))} ${monthNames[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => move(-1)}>
            <ChevronDown className="rotate-90" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => move(1)}>
            <ChevronRight />
          </Button>
        </div>
        <h3 className="font-semibold" aria-live="polite">
          {heading}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setShown({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })
          }
        >
          Today
        </Button>
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label={heading}>
        {weekdayLabels(weekStart, WEEKDAYS).map((day) => (
          <div
            key={day}
            role="columnheader"
            className="border-b border-r p-2 text-center text-xs font-semibold text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {days.map((day) => {
          const items = byDay.get(day.iso) ?? [];
          return (
            <div
              key={day.iso}
              role="gridcell"
              data-date={day.iso}
              aria-label={`${longDate(day.iso)}, ${items.length} ${items.length === 1 ? "item" : "items"}`}
              className={cn(
                "min-h-28 min-w-0 border-b border-r p-1.5 sm:p-2",
                !day.inMonth && "bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "inline-grid size-6 place-items-center rounded-full text-xs",
                  day.inMonth ? "text-foreground" : "text-muted-foreground",
                  day.iso === today && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {day.day}
              </span>
              {items.slice(0, CALENDAR_ITEMS_PER_DAY).map((row) => (
                <button
                  key={row.id}
                  onClick={() => setOpenItem(row)}
                  className={cn(
                    "mt-1 block w-full truncate rounded px-1.5 py-1 text-left text-[10px]",
                    statusTone(getDeliveryStatus(row)),
                  )}
                >
                  {row.start === row.finish && "◆ "}
                  {row.title}
                </button>
              ))}
              {items.length > CALENDAR_ITEMS_PER_DAY && (
                <p
                  className="mt-1 truncate px-1.5 text-[10px] text-muted-foreground"
                  title={items
                    .slice(CALENDAR_ITEMS_PER_DAY)
                    .map((row) => row.title)
                    .join("\n")}
                >
                  +{items.length - CALENDAR_ITEMS_PER_DAY} more
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
