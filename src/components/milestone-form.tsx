import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ForumField, forumSelectClass } from "@/components/forum-forms";
import { useForums } from "@/hooks/use-forums";
import { usePeople, usePhases, useProjectPermissions } from "@/hooks/use-hierarchy";
import { useMilestoneMutations } from "@/hooks/use-project-records";
import type { MilestoneItem } from "@/services/project-records";
import type { MilestoneType } from "@/data/types";
import { errorMessage } from "@/services/service-error";
import { todayIso } from "@/lib/today";

export function MilestoneForm({
  projectId,
  item,
  close,
}: {
  projectId: string;
  item?: MilestoneItem;
  close: () => void;
}) {
  const permissions = useProjectPermissions(projectId);
  const forums = useForums();
  const people = usePeople();
  const phases = usePhases();
  const mutations = useMilestoneMutations(projectId);
  const [title, setTitle] = useState(item?.title ?? "");
  const [type, setType] = useState<MilestoneType>(item?.type ?? "Delivery");
  const [forumId, setForumId] = useState(item?.forumId ?? "");
  const [phaseId, setPhaseId] = useState(item?.phaseId ?? "");
  const [ownerId, setOwnerId] = useState(item?.ownerId ?? "");
  const [baselineDate, setBaseline] = useState(item?.baselineDate ?? todayIso());
  const [forecastDate, setForecast] = useState(item?.forecastDate ?? todayIso());
  const [actualDate, setActual] = useState(item?.actualDate ?? "");
  const [committee, setCommittee] = useState(item?.reportToCommittee ?? false);
  const [error, setError] = useState<unknown>();
  const pending = mutations.create.isPending || mutations.update.isPending;
  const save = async () => {
    setError(undefined);
    const input = {
      title,
      type,
      forumId: type === "Approval" ? forumId || null : null,
      phaseId: type === "Gate" ? phaseId || null : null,
      ownerId: ownerId || null,
      baselineDate,
      forecastDate,
      actualDate: actualDate || null,
      reportToCommittee: committee,
    };
    try {
      if (item)
        await mutations.update.mutateAsync({ id: item.id, input, lastSeen: item.updatedAt });
      else await mutations.create.mutateAsync({ projectId, input });
      close();
    } catch (failure) {
      setError(failure);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Milestone" : "New milestone"}</DialogTitle>
          <DialogDescription className="sr-only">
            Milestone dates, ownership and approval
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={!permissions.canEdit || pending} className="space-y-4">
            <ForumField label="Title">
              <Input required value={title} onChange={(event) => setTitle(event.target.value)} />
            </ForumField>
            <ForumField label="Type">
              <select
                className={forumSelectClass}
                value={type}
                onChange={(event) => setType(event.target.value as MilestoneType)}
              >
                {["Delivery", "Gate", "Key date", "External dependency", "Approval"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </ForumField>
            {type === "Approval" && (
              <ForumField label="Approving forum (required)">
                <select
                  className={forumSelectClass}
                  value={forumId}
                  onChange={(event) => setForumId(event.target.value)}
                >
                  <option value="">Choose the forum that gives this approval</option>
                  {(forums.data ?? [])
                    .filter((forum) => forum.active || forum.id === item?.forumId)
                    .map((forum) => (
                      <option key={forum.id} value={forum.id} disabled={!forum.active}>
                        {forum.name}
                        {!forum.active ? " (inactive)" : ""}
                      </option>
                    ))}
                </select>
              </ForumField>
            )}
            {type === "Gate" && (
              <ForumField label="Phase (required)">
                <select
                  className={forumSelectClass}
                  value={phaseId}
                  onChange={(event) => setPhaseId(event.target.value)}
                >
                  <option value="">Choose a phase</option>
                  {(phases.data ?? []).map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                    </option>
                  ))}
                </select>
              </ForumField>
            )}
            <ForumField label="Owner">
              <select
                className={forumSelectClass}
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {(people.data ?? []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </ForumField>
            <div className="grid gap-3 sm:grid-cols-2">
              <ForumField label="Baseline">
                <Input
                  required
                  type="date"
                  value={baselineDate}
                  onChange={(event) => setBaseline(event.target.value)}
                />
              </ForumField>
              <ForumField label="Forecast">
                <Input
                  required
                  type="date"
                  value={forecastDate}
                  onChange={(event) => setForecast(event.target.value)}
                />
              </ForumField>
            </div>
            <ForumField label="Actual">
              <Input
                type="date"
                value={actualDate}
                onChange={(event) => setActual(event.target.value)}
              />
            </ForumField>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={committee} onCheckedChange={setCommittee} />
              Report to committee
            </label>
          </fieldset>
          {(error ?? forums.error) != null && (
            <p role="alert" className="text-sm text-health-bad-foreground">
              {errorMessage(error ?? forums.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Close
            </Button>
            {permissions.canEdit && <Button disabled={pending}>Save milestone</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
