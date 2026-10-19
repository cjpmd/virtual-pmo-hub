import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useForumMutations, useForumPermissions } from "@/hooks/use-forums";
import { usePeople } from "@/hooks/use-hierarchy";
import type { ForumItem, MeetingItem } from "@/services/forums";
import type { ForumCadenceLabel, ForumLevelLabel } from "@/services/labels";
import { errorMessage } from "@/services/service-error";
import { todayIso } from "@/lib/today";

export const forumSelectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring";
export function ForumField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function FormDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function ForumForm({
  forum,
  workspaces,
  close,
}: {
  forum?: ForumItem | undefined;
  workspaces: { id: string; name: string }[];
  close: () => void;
}) {
  const permissions = useForumPermissions();
  const people = usePeople();
  const mutations = useForumMutations();
  const [name, setName] = useState(forum?.name ?? "");
  const [workspaceId, setWorkspaceId] = useState(
    forum?.workspaceId ??
      (permissions.canAddOrganisationForum ? "" : (permissions.workspaceIds[0] ?? "")),
  );
  const [level, setLevel] = useState<ForumLevelLabel>(forum?.level ?? "Organisation");
  const [chair, setChair] = useState(forum?.chairResourceId ?? "");
  const [cadence, setCadence] = useState<ForumCadenceLabel | "">(forum?.cadence ?? "");
  const [days, setDays] = useState(forum?.papersDeadlineDays ?? 5);
  const [error, setError] = useState<unknown>();
  const pending = mutations.createForum.isPending || mutations.updateForum.isPending;
  const allowed = workspaces.filter((workspace) => permissions.workspaceIds.includes(workspace.id));
  return (
    <FormDialog title={forum ? "Edit forum" : "Add forum"} close={close}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(undefined);
          const input = {
            name,
            level,
            chairResourceId: chair || null,
            cadence: cadence || null,
            papersDeadlineDays: days,
          };
          try {
            if (forum)
              await mutations.updateForum.mutateAsync({
                id: forum.id,
                input,
                lastSeen: forum.updatedAt,
              });
            else
              await mutations.createForum.mutateAsync({ workspaceId: workspaceId || null, input });
            close();
          } catch (failure) {
            setError(failure);
          }
        }}
      >
        <ForumField label="Name">
          <Input required value={name} onChange={(event) => setName(event.target.value)} />
        </ForumField>
        {!forum && (
          <ForumField label="Scope">
            <select
              className={forumSelectClass}
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              {permissions.canAddOrganisationForum && <option value="">Organisation-wide</option>}
              {allowed.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </ForumField>
        )}
        <ForumField label="Level">
          <select
            className={forumSelectClass}
            value={level}
            onChange={(event) => setLevel(event.target.value as ForumLevelLabel)}
          >
            {["Project", "Programme", "Portfolio", "Organisation"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </ForumField>
        <ForumField label="Chair">
          <select
            className={forumSelectClass}
            value={chair}
            onChange={(event) => setChair(event.target.value)}
          >
            <option value="">No chair</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </ForumField>
        <ForumField label="Cadence">
          <select
            className={forumSelectClass}
            value={cadence}
            onChange={(event) => setCadence(event.target.value as ForumCadenceLabel | "")}
          >
            <option value="">Not set</option>
            {["Weekly", "Fortnightly", "Monthly", "Quarterly", "Ad hoc"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </ForumField>
        <ForumField label="Papers deadline days">
          <Input
            type="number"
            min={0}
            max={60}
            step={1}
            required
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          />
        </ForumField>
        {error != null && (
          <p role="alert" className="text-sm text-health-bad-foreground">
            {errorMessage(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={
              pending ||
              !name.trim() ||
              (!forum && !workspaceId && !permissions.canAddOrganisationForum)
            }
          >
            Save forum
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

const papersDate = (date: string, days: number) => {
  if (!date) return "";
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};
export function MeetingForm({
  forum,
  meeting,
  mode = "edit",
  close,
}: {
  forum: ForumItem;
  meeting?: MeetingItem | undefined;
  mode?: "edit" | "held" | "cancel";
  close: () => void;
}) {
  const mutations = useForumMutations();
  const [date, setDate] = useState(meeting?.meetingDate ?? todayIso());
  const [papers, setPapers] = useState(
    meeting?.papersDeadline ?? papersDate(todayIso(), forum.papersDeadlineDays),
  );
  const [customPapers, setCustomPapers] = useState(Boolean(meeting));
  const [minutes, setMinutes] = useState(meeting?.minutesLink ?? "");
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [error, setError] = useState<unknown>();
  const pending =
    mutations.createMeeting.isPending ||
    mutations.updateMeeting.isPending ||
    mutations.setMeetingStatus.isPending;
  const title =
    mode === "held"
      ? "Mark meeting held"
      : mode === "cancel"
        ? "Cancel meeting"
        : meeting
          ? "Edit meeting"
          : "Add meeting";
  return (
    <FormDialog title={title} close={close}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(undefined);
          try {
            if (meeting && mode !== "edit")
              await mutations.setMeetingStatus.mutateAsync({
                id: meeting.id,
                status: mode === "held" ? "Held" : "Cancelled",
                lastSeen: meeting.updatedAt,
                ...(mode === "held" ? { minutesLink: minutes || null } : {}),
              });
            else {
              const input = {
                meetingDate: date,
                papersDeadline: papers || null,
                minutesLink: minutes || null,
                notes: notes || null,
              };
              if (meeting)
                await mutations.updateMeeting.mutateAsync({
                  id: meeting.id,
                  input,
                  lastSeen: meeting.updatedAt,
                });
              else await mutations.createMeeting.mutateAsync({ forumId: forum.id, input });
            }
            close();
          } catch (failure) {
            setError(failure);
          }
        }}
      >
        {mode === "edit" && (
          <>
            <ForumField label="Meeting date">
              <Input
                required
                type="date"
                value={date}
                onChange={(event) => {
                  const value = event.target.value;
                  setDate(value);
                  if (!customPapers) setPapers(papersDate(value, forum.papersDeadlineDays));
                }}
              />
            </ForumField>
            <ForumField label="Papers deadline">
              <Input
                required
                type="date"
                max={date}
                value={papers}
                onChange={(event) => {
                  setCustomPapers(true);
                  setPapers(event.target.value);
                }}
              />
            </ForumField>
            <ForumField label="Notes">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </ForumField>
          </>
        )}
        {mode !== "cancel" && (
          <ForumField label="Minutes link (optional)">
            <Input
              type="url"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </ForumField>
        )}
        {mode === "cancel" && (
          <p className="text-sm text-muted-foreground">
            This meeting stays on the record as Cancelled.
          </p>
        )}
        {error != null && (
          <p role="alert" className="text-sm text-health-bad-foreground">
            {errorMessage(error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Back
          </Button>
          <Button disabled={pending}>{mode === "edit" ? "Save meeting" : title}</Button>
        </div>
      </form>
    </FormDialog>
  );
}
