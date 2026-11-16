// GL-13: a person's own notification settings (profiles.preferences -> 'notifications'). The
// organisation decides what is sent at all (Settings › Notifications); this narrows it for one
// person: which kinds show in the app, which are emailed, and how often.
import { Switch } from "@/components/ui/switch";
import { SelectField, SettingsCard } from "@/components/settings/settings-shell";
import { useNotificationPreferences } from "@/hooks/use-notifications";
import { DIGEST_LABEL, effectiveDigest, orgDefaultDigest } from "@/lib/notification-settings";
import {
  NOTIFICATION_EVENT,
  NOTIFICATION_KINDS,
  NOTIFICATION_LABEL,
  type Digest,
  type NotificationKind,
} from "@/services/notifications";
import { useSettings } from "@/services/settings";

export function MyNotificationSettings() {
  const settings = useSettings();
  const org = settings.notifications;
  const { preferences, save } = useNotificationPreferences();
  const emailAllowed = org.channels.email !== false;
  const digest = effectiveDigest(org, preferences.digest);
  // Kinds the organisation has switched off aren't offered.
  const kinds = NOTIFICATION_KINDS.filter((kind) => org.events[NOTIFICATION_EVENT[kind]] !== false);
  const toggle = (channel: "inApp" | "email", kind: NotificationKind, on: boolean) =>
    save.mutate({ [channel]: { [kind]: on } });
  return (
    <SettingsCard
      requires="self"
      title="Your notifications"
      description="What you're told about, in the app and by email. Your organisation's admins choose which kinds are sent at all."
    >
      <div className="max-w-2xl space-y-5">
        <SelectField
          label="Email"
          value={emailAllowed ? (preferences.digest ?? "default") : "off"}
          onChange={(value) =>
            save.mutate({ digest: value === "default" ? null : (value as Digest) })
          }
          options={
            emailAllowed
              ? [
                  {
                    value: "default",
                    label: `Organisation default (${DIGEST_LABEL[orgDefaultDigest(org)]})`,
                  },
                  { value: "immediate", label: DIGEST_LABEL.immediate },
                  { value: "daily", label: DIGEST_LABEL.daily },
                  { value: "weekly", label: DIGEST_LABEL.weekly },
                  { value: "off", label: "Off" },
                ]
              : [{ value: "off", label: "Off: your organisation doesn't send email" }]
          }
          {...(emailAllowed && {
            hint: "Draft packs are emailed separately when they are ready; they're never in the digest.",
          })}
        />
        {kinds.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Notification</th>
                  <th className="px-3 py-2 font-medium">In the app</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((kind) => (
                  <tr key={kind} className="border-t">
                    <td className="px-3 py-2">{NOTIFICATION_LABEL[kind]}</td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={preferences.inApp[kind] !== false}
                        onCheckedChange={(on) => toggle("inApp", kind, on)}
                        aria-label={`${NOTIFICATION_LABEL[kind]} in the app`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={
                          kind !== "pack_drafted" &&
                          digest !== "off" &&
                          preferences.email[kind] !== false
                        }
                        disabled={kind === "pack_drafted" || digest === "off"}
                        onCheckedChange={(on) => toggle("email", kind, on)}
                        aria-label={`${NOTIFICATION_LABEL[kind]} by email`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
