import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { SettingsCard, TextField } from "@/components/settings/settings-shell";
import { appRoleLabel } from "@/services/org-settings";
import { saveDisplayName } from "@/services/org-settings";
import { qk } from "@/services/query-keys";

export function AccountSettings() {
  const { profile, organisation } = useOrganisation();
  const queryClient = useQueryClient();
  const [draftName, setDraftName] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (name: string) => saveDisplayName(profile.id, name),
    onSuccess: async () => {
      setDraftName(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.memberships(profile.id) }),
        queryClient.invalidateQueries({ queryKey: qk.settings(organisation.organisationId) }),
      ]);
    },
  });
  const name = draftName ?? profile.displayName;
  const role = appRoleLabel[organisation.role as keyof typeof appRoleLabel] ?? organisation.role;

  return <SettingsCard requires="self" title="Your account" description="Manage the details shown beside your avatar.">
    <form className="max-w-md space-y-5" onSubmit={event => {
      event.preventDefault();
      const trimmed = name.trim();
      if (trimmed) save.mutate(trimmed);
    }}>
      <TextField label="Name" value={name} onChange={value => setDraftName(value)} />
      <div><p className="text-xs font-semibold text-muted-foreground">Email</p><p className="mt-1 text-sm">{profile.email}</p></div>
      <div><p className="text-xs font-semibold text-muted-foreground">Role in {organisation.name}</p><p className="mt-1 text-sm">{role}</p></div>
      <Button type="submit" disabled={!name.trim() || name.trim() === profile.displayName || save.isPending}>Save changes</Button>
      {save.isSuccess && draftName === null && <p role="status" className="text-sm text-health-good-foreground">Changes saved.</p>}
    </form>
  </SettingsCard>;
}
