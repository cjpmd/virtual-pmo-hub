import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayNames } from "@/data/settings-data";
import type { AppSettings } from "@/data/settings-types";
import { formatDate } from "@/lib/format";
import { useSettings } from "@/services/settings";
import { NumberField, SettingsCard } from "@/components/settings/settings-shell";
import { cn } from "@/lib/utils";
import { patch } from "./settings-helpers";

export function WorkingTimeSettings() {
  const settings = useSettings();
  const working = settings.workingTime;
  const set = (value: Partial<AppSettings["workingTime"]>) => patch("workingTime", value);
  return (
    <>
      <SettingsCard
        title="Standard working time"
        description="Used for capacity, allocation and every effort calculation."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <NumberField
            label="Hours per week"
            value={working.hoursPerWeek}
            onChange={(value) => set({ hoursPerWeek: value })}
            step={0.25}
          />
          <NumberField
            label="Hours per day"
            value={working.hoursPerDay}
            onChange={(value) => set({ hoursPerDay: value })}
            step={0.25}
          />
          <NumberField
            label="Default BAU percentage"
            value={working.defaultBauPercentage}
            onChange={(value) => set({ defaultBauPercentage: value })}
            min={0}
            max={100}
            hint="Deducted before delivery capacity is offered."
          />
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted-foreground">Working days</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {dayNames.map((name, index) => {
              const on = working.workingDays.includes(index);
              return (
                <button
                  key={name}
                  onClick={() =>
                    set({
                      workingDays: on
                        ? working.workingDays.filter((day) => day !== index)
                        : [...working.workingDays, index].sort(),
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/40",
                  )}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      </SettingsCard>
      <SettingsCard
        requires="pmo"
        title="Public holiday calendars"
        description="Holidays are excluded from capacity and from working-day calculations."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                holidayCalendars: [
                  ...working.holidayCalendars,
                  { id: `cal-${Date.now()}`, name: "New calendar", dates: [] },
                ],
              })
            }
          >
            <Plus />
            Add calendar
          </Button>
        }
      >
        <div className="space-y-4">
          {working.holidayCalendars.map((calendar) => (
            <div key={calendar.id} className="rounded-md border p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={calendar.name}
                  onChange={(event) =>
                    set({
                      holidayCalendars: working.holidayCalendars.map((item) =>
                        item.id === calendar.id ? { ...item, name: event.target.value } : item,
                      ),
                    })
                  }
                  className="h-9 max-w-64"
                />
                <span className="text-xs text-muted-foreground">{calendar.dates.length} dates</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  aria-label="Remove calendar"
                  onClick={() =>
                    set({
                      holidayCalendars: working.holidayCalendars.filter(
                        (item) => item.id !== calendar.id,
                      ),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...calendar.dates]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((entry) => (
                    <span
                      key={`${entry.date}-${entry.name}`}
                      className="rounded-full border bg-background px-2.5 py-1 text-xs"
                    >
                      {formatDate(entry.date, settings)} · {entry.name}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}
