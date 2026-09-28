import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsCard, TextField } from "@/components/settings/settings-shell";
import { updateSettings, useSettings } from "@/services/settings";

export function AccountSettings() {
  const settings = useSettings();
  const user = settings.users.find(item => item.id === settings.currentUserId) ?? settings.users[0];
  const [draftName, setDraftName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!user) return <p className="text-sm text-muted-foreground">No account is selected.</p>;
  const name = draftName ?? user.name;

  return <SettingsCard title="Your account" description="Manage the details shown beside your avatar.">
    <form className="max-w-md space-y-5" onSubmit={event => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      updateSettings({ users: settings.users.map(item => item.id === user.id ? { ...item, name: trimmed } : item) });
      setDraftName(null);
      setSaved(true);
    }}>
      <TextField label="Name" value={name} onChange={value => { setDraftName(value); setSaved(false) }} />
      <div><p className="text-xs font-semibold text-muted-foreground">Email</p><p className="mt-1 text-sm">{user.email}</p></div>
      <div><p className="text-xs font-semibold text-muted-foreground">Role</p><p className="mt-1 text-sm">{user.role}</p></div>
      <Button type="submit" disabled={!name.trim() || name.trim() === user.name}>Save changes</Button>
      {saved && <p role="status" className="text-sm text-health-good-foreground">Changes saved.</p>}
    </form>
  </SettingsCard>;
}