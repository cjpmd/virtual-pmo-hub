// Capability editor: details, delivering projects, forecast history, and acceptance with
// evidence. The database enforces who may accept (manager or PMO), that stored evidence exists
// and that only PMO can reverse; this screen explains those rules before the button is pressed.
import { useMemo, useRef, useState } from "react";
import { Download, FileText, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePathwayMutations } from "@/hooks/use-pathway";
import { useCan } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/format";
import { todayIso } from "@/lib/today";
import {
  capabilityStatusLabel,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_TYPES,
  evidenceUrl,
  liveDocuments,
  type CapabilityInput,
  type PathwayCapability,
  type PathwayData,
} from "@/services/pathway";
import { ErrorText, Field, RagChip, SectionCard, selectClass, SideSheet } from "./pathway-ui";

const editableStatuses = ["planned", "in_progress", "delivered"] as const;

export function CapabilitySheet({
  data,
  capability,
  programmeId,
  onClose,
}: {
  data: PathwayData;
  capability?: PathwayCapability;
  /** For a new capability: the programme filter in force, if any. */
  programmeId?: string;
  onClose: () => void;
}) {
  const mutations = usePathwayMutations();
  const [form, setForm] = useState<CapabilityInput>(() => ({
    programmeId: capability?.programmeId ?? programmeId ?? data.programmes[0]?.id ?? "",
    title: capability?.title ?? "",
    description: capability?.description ?? "",
    ownerId: capability?.ownerId ?? null,
    status: capability && capability.status !== "accepted" ? capability.status : "planned",
    targetDate: capability?.targetDate ?? null,
    forecastDate: capability?.forecastDate ?? null,
    deliveredDate: capability?.deliveredDate ?? null,
    projectIds: capability?.projectIds ?? [],
  }));
  const set = (patch: Partial<CapabilityInput>) => setForm((current) => ({ ...current, ...patch }));
  const workspaceId =
    capability?.workspaceId ??
    data.programmes.find((programme) => programme.id === form.programmeId)?.workspaceId;
  const canEdit = useCan("contributor", workspaceId);
  const projects = useMemo(
    () =>
      data.projects.filter(
        (project) =>
          project.programmeId === form.programmeId || form.projectIds.includes(project.id),
      ),
    [data.projects, form.programmeId, form.projectIds],
  );
  const accepted = capability?.status === "accepted";

  return (
    <SideSheet
      eyebrow="Capability"
      title={capability ? capability.title : "New capability"}
      onClose={onClose}
      aside={
        capability && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <RagChip rag={capability.rag} reason={capability.reason} complete={accepted} />
            <span>{capability.reason}</span>
          </div>
        )
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutations.saveCapability.mutate(
            { ...(capability ? { capability } : {}), input: form },
            { onSuccess: () => !capability && onClose() },
          );
        }}
      >
        <fieldset disabled={!canEdit} className="space-y-4">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(event) => set({ title: event.target.value })}
              required
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => set({ description: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Programme">
              <select
                className={selectClass}
                value={form.programmeId}
                disabled={Boolean(capability)}
                onChange={(event) => set({ programmeId: event.target.value })}
              >
                {data.programmes.map((programme) => (
                  <option key={programme.id} value={programme.id}>
                    {programme.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner">
              <select
                className={selectClass}
                value={form.ownerId ?? ""}
                onChange={(event) => set({ ownerId: event.target.value || null })}
              >
                <option value="">Unassigned</option>
                {data.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Status"
              hint={
                accepted
                  ? "Accepted. Only PMO can reverse an acceptance (below)."
                  : "Acceptance is recorded below, with evidence."
              }
            >
              <select
                className={selectClass}
                value={accepted ? "accepted" : form.status}
                disabled={accepted}
                onChange={(event) =>
                  set({ status: event.target.value as CapabilityInput["status"] })
                }
              >
                {accepted && <option value="accepted">Accepted</option>}
                {editableStatuses.map((status) => (
                  <option key={status} value={status}>
                    {capabilityStatusLabel[status]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Target date"
              hint="When it should be accepted. Required once past Planned."
            >
              <Input
                type="date"
                value={form.targetDate ?? ""}
                onChange={(event) => set({ targetDate: event.target.value || null })}
              />
            </Field>
            <Field
              label="Forecast date"
              hint="Current forecast of acceptance. Changes are kept in the history."
            >
              <Input
                type="date"
                value={form.forecastDate ?? ""}
                onChange={(event) => set({ forecastDate: event.target.value || null })}
              />
            </Field>
            {(form.status === "delivered" || accepted) && (
              <Field label="Delivered date">
                <Input
                  type="date"
                  value={(accepted ? capability?.deliveredDate : form.deliveredDate) ?? ""}
                  disabled={accepted}
                  onChange={(event) => set({ deliveredDate: event.target.value || null })}
                />
              </Field>
            )}
          </div>
          <Field
            label="Delivering projects"
            hint="Their delivery health feeds this capability's RAG."
          >
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
              {projects.map((project) => (
                <label key={project.id} className="flex items-center gap-2 text-sm font-normal">
                  <input
                    type="checkbox"
                    checked={form.projectIds.includes(project.id)}
                    onChange={(event) =>
                      set({
                        projectIds: event.target.checked
                          ? [...form.projectIds, project.id]
                          : form.projectIds.filter((id) => id !== project.id),
                      })
                    }
                  />
                  <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
                  {project.name}
                  {project.state === "closed" && (
                    <span className="text-xs text-muted-foreground">(closed)</span>
                  )}
                </label>
              ))}
              {!projects.length && (
                <p className="text-xs text-muted-foreground">No projects in this programme.</p>
              )}
            </div>
          </Field>
        </fieldset>
        <ErrorText error={mutations.saveCapability.error} />
        {canEdit ? (
          <div className="flex gap-2">
            <Button type="submit" disabled={mutations.saveCapability.isPending}>
              {capability ? "Save changes" : "Add capability"}
            </Button>
            {mutations.saveCapability.isSuccess && capability && (
              <span className="self-center text-xs text-muted-foreground">Saved</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Contributors and above can edit capabilities.
          </p>
        )}
      </form>

      {capability && capability.history.length > 0 && (
        <SectionCard title="Forecast history" description="One entry per day the forecast changed.">
          <ol className="space-y-1 text-sm">
            {[...capability.history].reverse().map((entry) => (
              <li key={entry.reportingDate} className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  Reported {formatDate(entry.reportingDate)}
                </span>
                <span className="font-mono tabular-nums">{formatDate(entry.forecastDate)}</span>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      {capability && <Acceptance data={data} capability={capability} />}
    </SideSheet>
  );
}

function Acceptance({ data, capability }: { data: PathwayData; capability: PathwayCapability }) {
  const mutations = usePathwayMutations();
  const canUpload = useCan("contributor", capability.workspaceId);
  const canAccept = useCan("manager", capability.workspaceId);
  const isPmo = useCan("pmo", capability.workspaceId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [acceptedAt, setAcceptedAt] = useState(todayIso());
  const [acceptedById, setAcceptedById] = useState<string | null>(capability.ownerId);
  const [note, setNote] = useState("");
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const documents = liveDocuments(capability);
  const archived = capability.documents.filter((document) => document.archivedAt);
  const accepted = capability.status === "accepted";
  const acceptedBy = data.people.find((person) => person.id === capability.acceptedById)?.name;

  const blocked = !canAccept
    ? "Only managers and PMO can record acceptance."
    : capability.status === "planned"
      ? "Move the capability to In progress or Delivered first."
      : !documents.length
        ? "Attach the acceptance evidence first."
        : null;

  const download = async (path: string) => {
    setDownloadError(null);
    try {
      window.open(await evidenceUrl(path), "_blank", "noopener");
    } catch (error) {
      setDownloadError(error);
    }
  };

  return (
    <SectionCard
      title="Acceptance"
      description="Only an accepted capability counts as delivered. Acceptance needs evidence and a manager or PMO to record it."
    >
      {accepted && (
        <div className="rounded-md bg-health-good/10 p-3 text-sm">
          Accepted on <strong>{formatDate(capability.acceptedAt ?? undefined)}</strong> by{" "}
          <strong>{acceptedBy ?? "—"}</strong>
          {capability.acceptanceNote && (
            <p className="mt-1 text-muted-foreground">{capability.acceptanceNote}</p>
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">Evidence</p>
        <ul className="mt-2 divide-y rounded-md border">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {document.fileName}
                <span className="ml-2 text-xs text-muted-foreground">
                  v{document.version} · {Math.max(1, Math.round(document.sizeBytes / 1024))} KB ·{" "}
                  {formatDate(document.createdAt.slice(0, 10))}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void download(document.storagePath)}>
                <Download />
                Download
              </Button>
              {canUpload && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mutations.archiveDocument.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Archive ${document.fileName}? It will no longer count as evidence.`,
                      )
                    )
                      mutations.archiveDocument.mutate(document.id);
                  }}
                >
                  Archive
                </Button>
              )}
            </li>
          ))}
          {!documents.length && (
            <li className="px-3 py-3 text-sm text-muted-foreground">No evidence attached yet.</li>
          )}
        </ul>
        {archived.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {archived.length} archived file{archived.length === 1 ? "" : "s"} kept for the record.
          </p>
        )}
        {canUpload && (
          <div className="mt-2">
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              aria-label="Upload acceptance evidence"
              accept={Object.keys(EVIDENCE_TYPES).join(",")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) mutations.uploadEvidence.mutate({ capabilityId: capability.id, file });
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={mutations.uploadEvidence.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload />
              {mutations.uploadEvidence.isPending ? "Uploading…" : "Upload evidence"}
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">
              PDF, Word, Excel or PowerPoint, up to {EVIDENCE_MAX_BYTES / 1024 / 1024} MB
            </span>
          </div>
        )}
        <ErrorText
          error={mutations.uploadEvidence.error ?? mutations.archiveDocument.error ?? downloadError}
        />
      </div>

      {!accepted && (
        <div className="space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Accepted by" hint="The receiving business owner.">
              <select
                className={selectClass}
                value={acceptedById ?? ""}
                disabled={!canAccept}
                onChange={(event) => setAcceptedById(event.target.value || null)}
              >
                <option value="">Choose a person</option>
                {data.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Accepted on">
              <Input
                type="date"
                value={acceptedAt}
                disabled={!canAccept}
                onChange={(event) => setAcceptedAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Note (optional)">
            <Textarea
              rows={2}
              value={note}
              disabled={!canAccept}
              placeholder="What was accepted, and any conditions"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={Boolean(blocked) || mutations.recordAcceptance.isPending}
              onClick={() =>
                mutations.recordAcceptance.mutate({
                  capability,
                  input: { acceptedAt, acceptedById, note },
                })
              }
            >
              Record acceptance
            </Button>
            {blocked && <span className="text-xs text-muted-foreground">{blocked}</span>}
          </div>
          <ErrorText error={mutations.recordAcceptance.error} />
        </div>
      )}

      {accepted && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button
            variant="outline"
            disabled={!isPmo || mutations.reverseAcceptance.isPending}
            onClick={() => {
              if (window.confirm("Reverse this acceptance? The capability goes back to Delivered."))
                mutations.reverseAcceptance.mutate(capability);
            }}
          >
            <RotateCcw />
            Reverse acceptance
          </Button>
          {!isPmo && (
            <span className="text-xs text-muted-foreground">
              Only PMO can reverse an acceptance.
            </span>
          )}
          <ErrorText error={mutations.reverseAcceptance.error} />
        </div>
      )}
    </SectionCard>
  );
}
