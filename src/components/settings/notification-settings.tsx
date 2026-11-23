import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/data/settings-types";
import { useSettings } from "@/services/settings";
import { SelectField, SettingsCard } from "@/components/settings/settings-shell";
import { availableEvents } from "@/lib/notification-settings";
import { patch } from "./settings-helpers";

export function NotificationSettings() {
  const settings = useSettings();
  const notifications = settings.notifications;
  const events = availableEvents(settings);
  const set = (value: Partial<AppSettings["notifications"]>) => patch("notifications", value);
  return (
    <>
      <SettingsCard
        title="Channels"
        description="Where notifications are delivered. Each person can turn kinds off, or change how often they get email, in Settings › Account."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Teams comes back with Planner sync; its stored value is left as it is. */}
          {(
            [
              ["inApp", "In-app"],
              ["email", "Email"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-md border p-4">
              <span className="text-sm font-medium">{label}</span>
              <Switch
                checked={notifications.channels[key]}
                onCheckedChange={(value) =>
                  set({ channels: { ...notifications.channels, [key]: value } })
                }
                aria-label={label}
              />
            </label>
          ))}
          <SelectField
            label="Default email digest"
            value={notifications.channels.email ? notifications.digest : "Off"}
            onChange={(value) => set({ digest: value as AppSettings["notifications"]["digest"] })}
            options={
              notifications.channels.email
                ? [
                    { value: "Real time", label: "As they happen" },
                    { value: "Daily", label: "Daily (07:30)" },
                    { value: "Weekly", label: "Weekly (Mondays)" },
                  ]
                : [{ value: "Off", label: "Email is off" }]
            }
          />
        </div>
      </SettingsCard>
      <SettingsCard
        title="Events"
        description="Turn individual notifications on or off for everyone in the organisation."
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set({
                  events: {
                    ...notifications.events,
                    ...Object.fromEntries(events.map((event) => [event, true])),
                  },
                })
              }
            >
              Enable all
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set({
                  events: {
                    ...notifications.events,
                    ...Object.fromEntries(events.map((event) => [event, false])),
                  },
                })
              }
            >
              Disable all
            </Button>
          </div>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {events.map((event) => (
            <label
              key={event}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
            >
              <span className="text-sm">{event}</span>
              <Switch
                checked={notifications.events[event] !== false}
                onCheckedChange={(value) =>
                  set({ events: { ...notifications.events, [event]: value } })
                }
                aria-label={event}
              />
            </label>
          ))}
        </div>
      </SettingsCard>
    </>
  );
}
