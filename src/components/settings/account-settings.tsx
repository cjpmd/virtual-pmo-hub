import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut } from "@/services/auth";
import {
  closeMyAccount,
  deletionErrorMessage,
  emailMatches,
} from "@/services/organisation-deletion";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { SettingsCard, TextField } from "@/components/settings/settings-shell";
import { appRoleLabel } from "@/services/org-settings";
import { saveDisplayName } from "@/services/org-settings";
import { qk } from "@/services/query-keys";
import { MyNotificationSettings } from "@/components/settings/my-notification-settings";

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

  return (
    <>
      <SettingsCard
        requires="self"
        title="Your account"
        description="Manage the details shown beside your avatar."
      >
        <form
          className="max-w-md space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed) save.mutate(trimmed);
          }}
        >
          <TextField label="Name" value={name} onChange={(value) => setDraftName(value)} />
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Email</p>
            <p className="mt-1 text-sm">{profile.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              Role in {organisation.name}
            </p>
            <p className="mt-1 text-sm">{role}</p>
          </div>
          <Button
            type="submit"
            disabled={!name.trim() || name.trim() === profile.displayName || save.isPending}
          >
            Save changes
          </Button>
          {save.isSuccess && draftName === null && (
            <p role="status" className="text-sm text-health-good-foreground">
              Changes saved.
            </p>
          )}
        </form>
      </SettingsCard>
      <MyNotificationSettings />
      <CloseAccountSettings email={profile.email} />
    </>
  );
}

/**
 * GL-11: close your own account. The database refuses while you're the last admin of an
 * organisation, and asks for a sign-in within the last 10 minutes; records you added stay with
 * the organisations, shown as "Former member".
 */
function CloseAccountSettings({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const close = useMutation({
    mutationFn: () => closeMyAccount(typed),
    onSuccess: async () => {
      toast.success("Your account has been closed.");
      await signOut().catch(() => undefined);
    },
  });
  return (
    <SettingsCard
      requires="self"
      title="Close your account"
      description="Delete your sign-in and personal details. Your organisations keep the records you added."
    >
      <div className="space-y-3">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>You leave every organisation and can no longer sign in.</li>
          <li>Records you added stay with each organisation and show as "Former member".</li>
          <li>
            If you're the last admin of an organisation, make someone else admin or delete it first.
          </li>
        </ul>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          <UserX />
          Close my account…
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTyped("");
            close.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Close your account?</DialogTitle>
            <DialogDescription>
              This can't be undone. For your security, you need to have signed in within the last 10
              minutes; if not, sign out and back in first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <Label htmlFor="confirm-account-email">
              Type your email address, <strong>{email}</strong>, to confirm
            </Label>
            <Input
              id="confirm-account-email"
              type="email"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
            {close.error && (
              <p role="alert" className="text-health-bad-foreground">
                {deletionErrorMessage(close.error, "Couldn't close your account.")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="destructive"
              disabled={!emailMatches(typed, email) || close.isPending}
              onClick={() => close.mutate()}
            >
              {close.isPending ? "Closing…" : "Close my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
