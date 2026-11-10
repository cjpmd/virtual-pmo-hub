// GL-11: Settings › Organisation › Delete organisation (admins). Asking makes the organisation
// read-only at once and deletes its data after 30 days; any admin can cancel until then. The
// exports are offered first (a full export is GL-11b). See docs/design/account-closure.md.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { SettingsCard } from "@/components/settings/settings-shell";
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
import { usePendingDeletion } from "@/hooks/use-org-access";
import { formatDate } from "@/lib/format";
import {
  cancelOrganisationDeletion,
  deletionErrorMessage,
  nameMatches,
  requestOrganisationDeletion,
} from "@/services/organisation-deletion";
import { qk } from "@/services/query-keys";
import { useSettings } from "@/services/settings";

export function OrganisationDeletionSettings() {
  const { organisation } = useOrganisation();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const pending = usePendingDeletion();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const orgId = organisation.organisationId;
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.access.all(orgId) });

  const request = useMutation({
    mutationFn: () => requestOrganisationDeletion(orgId, typed),
    onSuccess: async () => {
      setOpen(false);
      setTyped("");
      await refresh();
      toast.success(
        "Deletion scheduled. The organisation is now read-only; any admin can cancel for 30 days.",
      );
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelOrganisationDeletion(orgId),
    onSuccess: async () => {
      await refresh();
      toast.success("Deletion cancelled. Nothing has been deleted.");
    },
    onError: (error) => toast.error(deletionErrorMessage(error, "Couldn't cancel the deletion.")),
  });

  if (organisation.isDemo) return null;
  const day = (iso: string) => formatDate(iso.slice(0, 10), settings);

  return (
    <SettingsCard
      title="Delete organisation"
      description="Delete this organisation and everything in it. Admins only."
    >
      {pending.data ? (
        <div className="space-y-3" data-testid="deletion-pending">
          <p className="text-sm">
            <strong className="font-semibold">
              {organisation.name} is scheduled for deletion on {day(pending.data.purgeAfter)}.
            </strong>{" "}
            It is read-only until then. After that date its data is deleted and can't be recovered.
          </p>
          <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <Undo2 />
            {cancel.isPending ? "Cancelling…" : "Cancel deletion"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>The organisation becomes read-only for everyone straight away.</li>
            <li>
              After 30 days, all its data and files are deleted. Any admin can cancel before then.
            </li>
            <li>
              A subscription is set to end at the end of its current period; nothing is refunded.
            </li>
            <li>Members keep their own accounts.</li>
          </ul>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 />
            Delete organisation…
          </Button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTyped("");
            request.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {organisation.name}?</DialogTitle>
            <DialogDescription>
              It becomes read-only now, and its data is deleted after 30 days. Any admin can cancel
              until then. Every admin gets an email now and reminders before the date.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p>
              Export what you need first:{" "}
              <Link to="/settings/$section" params={{ section: "data" }} className="underline">
                Settings › Data
              </Link>{" "}
              has the portfolio and settings exports.
            </p>
            <div className="space-y-2">
              <Label htmlFor="confirm-org-name">
                Type <strong>{organisation.name}</strong> to confirm
              </Label>
              <Input
                id="confirm-org-name"
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
            {request.error && (
              <p role="alert" className="text-health-bad-foreground">
                {deletionErrorMessage(request.error, "Couldn't schedule the deletion.")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Keep organisation
            </Button>
            <Button
              variant="destructive"
              disabled={!nameMatches(typed, organisation.name) || request.isPending}
              onClick={() => request.mutate()}
            >
              {request.isPending ? "Scheduling…" : "Delete in 30 days"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
