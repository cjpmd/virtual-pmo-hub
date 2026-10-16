// Decision drawer (brief §3): create, edit while Pending, and the lifecycle actions, each
// through its RPC. The database enforces every rule; this only hides what a status can't do and
// shows the database's message when a write is refused.
import { formatDate } from "@/lib/format";
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  CircleDot,
  FileText,
  Lock,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DecisionFlags, DecisionStatusPill } from "@/components/decision-pills";
import type { DecisionAction, DecisionImpact } from "@/data/types";
import {
  decisionActionsFor,
  type DecisionEventView,
  type DecisionLinkKind,
  type LinkTargets,
  type NewDecisionInput,
  type ResolvedDecision,
} from "@/services/decisions";
import { errorMessage } from "@/services/service-error";
import {
  useDecisionEvents,
  useDecisionLinkTargets,
  useGovernance,
  useGovernanceMutations,
} from "@/hooks/use-governance";
import { useProjectPermissions } from "@/hooks/use-hierarchy";
import { useCan } from "@/hooks/use-permissions";
import { addDaysIso, todayIso } from "@/lib/today";
import { cn } from "@/lib/utils";

const impactKeys: Array<keyof DecisionImpact> = ["scope", "cost", "time", "benefits"];
const impactLabels: Record<keyof DecisionImpact, string> = {
  scope: "Scope",
  cost: "Cost",
  time: "Time",
  benefits: "Benefits",
};
const linkKinds: Array<{ kind: DecisionLinkKind; label: string }> = [
  { kind: "risk", label: "Risks" },
  { kind: "issue", label: "Issues" },
  { kind: "change", label: "Change requests" },
  { kind: "dependency", label: "Dependencies" },
  { kind: "benefit", label: "Benefits" },
  { kind: "milestone", label: "Milestones" },
];
const linkIds = (decision: ResolvedDecision): Record<DecisionLinkKind, string[]> => ({
  risk: decision.riskIds,
  issue: decision.issueIds,
  change: decision.changeIds,
  dependency: decision.dependencyIds,
  benefit: decision.benefitIds,
  milestone: decision.milestoneIds,
});
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface DecisionCreateScope {
  projectId?: string | null;
  programmeId?: string | null;
  portfolioId?: string | null;
  workspaceId?: string | null;
}

// Failed writes are already toasted once by the MutationCache (src/router.tsx); this only stops
// the rejected promise going unhandled.
const report = (_error?: unknown) => undefined;

export function DecisionPanel({
  decision,
  all,
  close,
  onOpen,
  createScope,
  onCreated,
}: {
  /** Omit to open in create mode (with createScope). */
  decision?: ResolvedDecision | undefined;
  all: ResolvedDecision[];
  close: () => void;
  /** Open another decision in the drawer (successor, predecessor). */
  onOpen?: (id: string) => void;
  createScope?: DecisionCreateScope;
  onCreated?: (id: string) => void;
}) {
  const projectId = decision?.projectId ?? createScope?.projectId ?? undefined;
  const workspaceId = decision?.scope.workspaceId ?? createScope?.workspaceId ?? undefined;
  // PMO / admin default "decided by" to the forum when recording.
  const isPmo = useCan("pmo", workspaceId);

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-2xl sm:p-6">
        {decision ? (
          <DecisionDetail
            key={decision.id + decision.updatedAt}
            decision={decision}
            all={all}
            // What this user may do with this decision comes from v_decisions (can_write,
            // can_record), the same rules the RPCs check.
            canEdit={decision.canWrite}
            canRecord={decision.canRecord}
            isPmo={isPmo}
            onOpen={onOpen}
          />
        ) : (
          <CreateDecision
            scope={createScope ?? {}}
            close={close}
            onCreated={(id) => {
              onCreated?.(id);
              onOpen?.(id);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---- Create and edit ----------------------------------------------------------------------

type EditorValues = Omit<NewDecisionInput, "scope" | "links">;
const blankValues = (): EditorValues => ({
  title: "",
  context: "",
  options: [
    { title: "", pros: [], cons: [] },
    { title: "", pros: [], cons: [] },
  ],
  decisionMakerId: null,
  forumId: null,
  neededBy: addDaysIso(14),
  impact: {
    scope: { impacted: false, note: "" },
    cost: { impacted: false, note: "" },
    time: { impacted: false, note: "" },
    benefits: { impacted: false, note: "" },
  },
  evidenceLink: "",
});
const valuesOf = (decision: ResolvedDecision): EditorValues => ({
  title: decision.title,
  context: decision.context,
  options: decision.options.map((option) => ({
    title: option.title,
    pros: option.pros,
    cons: option.cons,
  })),
  decisionMakerId: decision.decisionMakerId,
  forumId: decision.forumId,
  neededBy: decision.neededBy,
  impact: {
    scope: { ...decision.impact.scope },
    cost: { ...decision.impact.cost },
    time: { ...decision.impact.time },
    benefits: { ...decision.impact.benefits },
  },
  evidenceLink: decision.evidenceLink ?? "",
});

function CreateDecision({
  scope,
  close,
  onCreated,
}: {
  scope: DecisionCreateScope;
  close: () => void;
  onCreated: (id: string) => void;
}) {
  const mutations = useGovernanceMutations();
  const targets = useDecisionLinkTargets(scope.projectId);
  const [links, setLinks] = useState<Partial<Record<DecisionLinkKind, string[]>>>({});
  return (
    <>
      <SheetHeader className="text-left">
        <SheetTitle className="font-display text-xl">New decision</SheetTitle>
        <SheetDescription>
          It starts as Pending. Record it once the forum has decided.
        </SheetDescription>
      </SheetHeader>
      <DecisionEditor
        initial={blankValues()}
        submitLabel="Create decision"
        pending={mutations.create.isPending}
        onCancel={close}
        extra={
          scope.projectId && targets.data ? (
            <LinkPicker
              targets={targets.data}
              selected={links}
              onToggle={(kind, id, on) =>
                setLinks((current) => ({
                  ...current,
                  [kind]: on
                    ? [...(current[kind] ?? []), id]
                    : (current[kind] ?? []).filter((item) => item !== id),
                }))
              }
            />
          ) : null
        }
        onSave={async (values) => {
          try {
            const written = await mutations.create.mutateAsync({ ...values, scope, links });
            toast.success("Decision created");
            onCreated(written.id);
          } catch (error) {
            report(error);
          }
        }}
      />
    </>
  );
}

function DecisionEditor({
  initial,
  submitLabel,
  pending,
  onSave,
  onCancel,
  extra,
}: {
  initial: EditorValues;
  submitLabel: string;
  pending: boolean;
  onSave: (values: EditorValues) => void;
  onCancel: () => void;
  extra?: ReactNode;
}) {
  const governance = useGovernance();
  const forums = governance.data?.forums ?? [];
  const people = governance.data?.people ?? [];
  const [values, setValues] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const set = (patch: Partial<EditorValues>) => setValues((current) => ({ ...current, ...patch }));
  const namedOptions = values.options.filter((option) => option.title.trim()).length;
  const invalid = !values.title.trim() || namedOptions < 2 || !values.neededBy;
  const lines = (text: string) => text.split("\n");

  return (
    <form
      className="mt-5 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!invalid) onSave(values);
      }}
    >
      <Field label="Title (required)">
        <Input value={values.title} onChange={(event) => set({ title: event.target.value })} />
      </Field>
      <Field label="Context">
        <Textarea
          rows={3}
          value={values.context}
          onChange={(event) => set({ context: event.target.value })}
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Options (at least two)</legend>
        {values.options.map((option, index) => (
          <div key={index} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Option ${index + 1} title`}
                placeholder={`Option ${index + 1}`}
                value={option.title}
                onChange={(event) =>
                  set({
                    options: values.options.map((item, i) =>
                      i === index ? { ...item, title: event.target.value } : item,
                    ),
                  })
                }
              />
              {values.options.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() => set({ options: values.options.filter((_, i) => i !== index) })}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Pros (one per line)">
                <Textarea
                  rows={3}
                  value={option.pros.join("\n")}
                  onChange={(event) =>
                    set({
                      options: values.options.map((item, i) =>
                        i === index ? { ...item, pros: lines(event.target.value) } : item,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Cons (one per line)">
                <Textarea
                  rows={3}
                  value={option.cons.join("\n")}
                  onChange={(event) =>
                    set({
                      options: values.options.map((item, i) =>
                        i === index ? { ...item, cons: lines(event.target.value) } : item,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set({ options: [...values.options, { title: "", pros: [], cons: [] }] })}
        >
          <Plus />
          Add option
        </Button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Decision maker">
          <select
            className={selectClass}
            value={values.decisionMakerId ?? ""}
            onChange={(event) => set({ decisionMakerId: event.target.value || null })}
          >
            <option value="">Not set</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Forum">
          <select
            className={selectClass}
            value={values.forumId ?? ""}
            onChange={(event) => set({ forumId: event.target.value || null })}
          >
            <option value="">Not set</option>
            {forums.map((forum) => (
              <option key={forum.id} value={forum.id}>
                {forum.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Needed by">
          <Input
            type="date"
            value={values.neededBy}
            onChange={(event) => set({ neededBy: event.target.value })}
          />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Impact</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {impactKeys.map((key) => (
            <div key={key} className="space-y-2 rounded-md border p-3">
              <label className="flex items-center justify-between gap-2 text-xs font-semibold">
                {impactLabels[key]}
                <Switch
                  checked={values.impact[key].impacted}
                  onCheckedChange={(checked) =>
                    set({
                      impact: {
                        ...values.impact,
                        [key]: { ...values.impact[key], impacted: checked },
                      },
                    })
                  }
                  aria-label={`${impactLabels[key]} impacted`}
                />
              </label>
              <Input
                aria-label={`${impactLabels[key]} note`}
                placeholder="Note"
                value={values.impact[key].note}
                onChange={(event) =>
                  set({
                    impact: {
                      ...values.impact,
                      [key]: { ...values.impact[key], note: event.target.value },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </fieldset>

      <Field label="Evidence link">
        <Input
          value={values.evidenceLink}
          onChange={(event) => set({ evidenceLink: event.target.value })}
          placeholder="https://…"
        />
      </Field>

      {extra}

      {attempted && invalid && (
        <p role="alert" className="text-xs font-semibold text-health-bad-foreground">
          Add a title, at least two named options and a needed-by date.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function LinkPicker({
  targets,
  selected,
  onToggle,
  disabled,
}: {
  targets: LinkTargets;
  selected: Partial<Record<DecisionLinkKind, string[]>>;
  onToggle: (kind: DecisionLinkKind, id: string, on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Links on this project</legend>
      {linkKinds.map(({ kind, label }) =>
        targets[kind].length ? (
          <div key={kind}>
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <ul className="mt-1 space-y-1">
              {targets[kind].map((target) => (
                <li key={target.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={disabled}
                      checked={(selected[kind] ?? []).includes(target.id)}
                      onChange={(event) => onToggle(kind, target.id, event.target.checked)}
                    />
                    <span>{target.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </fieldset>
  );
}

// ---- Detail -------------------------------------------------------------------------------

function DecisionDetail({
  decision,
  all,
  canEdit,
  canRecord,
  isPmo,
  onOpen,
}: {
  decision: ResolvedDecision;
  all: ResolvedDecision[];
  canEdit: boolean;
  canRecord: boolean;
  isPmo: boolean;
  onOpen: ((id: string) => void) | undefined;
}) {
  const mutations = useGovernanceMutations();
  const allowed = decisionActionsFor(decision);
  const [editing, setEditing] = useState(false);
  const readOnly = decision.status !== "Pending";
  const chosenId = decision.chosenOptionId;
  const byId = (id: string | undefined | null) =>
    id ? all.find((item) => item.id === id) : undefined;
  const supersedes = byId(decision.supersedesId);
  const refLink = (id: string | null | undefined, ref: string | null | undefined) =>
    id && onOpen ? (
      <button
        type="button"
        className="font-semibold text-primary hover:underline"
        onClick={() => onOpen(id)}
      >
        {ref}
      </button>
    ) : (
      <strong>{ref}</strong>
    );

  return (
    <>
      <SheetHeader className="text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {decision.reference}
          {decision.forum ? ` · ${decision.forum}` : ""}
        </p>
        <SheetTitle className="font-display text-xl">{decision.title}</SheetTitle>
        <SheetDescription>
          {decision.scopeName}
          {decision.decisionMaker ? ` · decision maker ${decision.decisionMaker}` : ""}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <DecisionStatusPill status={decision.status} />
        <DecisionFlags
          overdue={decision.overdue}
          daysOverdue={decision.daysOverdue}
          deferralCount={decision.deferralCount}
        />
        <span className="text-muted-foreground">Needed by {formatDate(decision.neededBy)}</span>
        {decision.decisionDate && (
          <span className="text-muted-foreground">
            · Decided {formatDate(decision.decisionDate)}
          </span>
        )}
        {readOnly && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">
            <Lock className="size-3" />
            Read-only
          </span>
        )}
      </div>

      {supersedes && (
        <p className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">
          Supersedes {refLink(supersedes.id, supersedes.reference)} · {supersedes.title}
        </p>
      )}
      {decision.supersededById && (
        <p className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">
          Superseded by {refLink(decision.supersededById, decision.supersededByRef)}
        </p>
      )}
      {decision.pendingSuccessorRef && (
        <p className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
          Replacement proposed: {refLink(decision.pendingSuccessorId, decision.pendingSuccessorRef)}
          . {decision.reference} stays Made until the replacement is recorded.
        </p>
      )}

      {editing && allowed.edit ? (
        <DecisionEditor
          initial={valuesOf(decision)}
          submitLabel="Save changes"
          pending={mutations.savePending.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (values) => {
            try {
              await mutations.savePending.mutateAsync({
                id: decision.id,
                input: values,
                optionIds: decision.options.map((option) => option.id),
                lastSeen: decision.updatedAt,
              });
              toast.success("Decision saved");
              setEditing(false);
            } catch (error) {
              report(error);
            }
          }}
        />
      ) : (
        <>
          {decision.context && (
            <p className="mt-5 text-sm leading-6 text-muted-foreground">{decision.context}</p>
          )}
          {allowed.edit && canEdit && (
            <Button className="mt-4" variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit decision
            </Button>
          )}

          {decision.status === "Made" && (
            <dl className="mt-5 grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Decided by</dt>
                <dd>{decision.decidedBy || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Recorded by</dt>
                <dd>
                  {decision.recordedBy || "—"}
                  {decision.recordedAt ? ` · ${formatDate(decision.recordedAt.slice(0, 10))}` : ""}
                </dd>
              </div>
            </dl>
          )}

          <section className="mt-5">
            <h3 className="text-sm font-semibold">Options considered</h3>
            <div className="mt-3 space-y-3">
              {decision.options.map((option) => (
                <div
                  key={option.id}
                  className={cn(
                    "rounded-md border p-4",
                    chosenId === option.id && "border-primary bg-primary/5",
                  )}
                >
                  <p className="flex items-start gap-2 text-sm font-semibold">
                    <CircleDot
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        chosenId === option.id ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="flex-1">
                      {option.title}
                      {chosenId === option.id && (
                        <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">
                          Chosen
                        </span>
                      )}
                    </span>
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <ProsCons
                      icon={<ThumbsUp className="size-3.5" />}
                      label="Pros"
                      items={option.pros}
                      tone="text-health-good-foreground"
                    />
                    <ProsCons
                      icon={<ThumbsDown className="size-3.5" />}
                      label="Cons"
                      items={option.cons}
                      tone="text-health-bad-foreground"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {decision.rationale && (
            <section className="mt-5">
              <h3 className="text-sm font-semibold">
                {decision.status === "Reversed" ? "Rationale (as recorded)" : "Rationale"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{decision.rationale}</p>
            </section>
          )}

          <section className="mt-5">
            <h3 className="text-sm font-semibold">Impact</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {impactKeys.map((key) => (
                <div key={key} className="rounded-md border p-3">
                  <p className="flex items-center justify-between text-xs font-semibold">
                    {impactLabels[key]}
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        decision.impact[key].impacted
                          ? "bg-health-warn/25 text-health-warn-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {decision.impact[key].impacted ? "Yes" : "No"}
                    </span>
                  </p>
                  {decision.impact[key].note && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {decision.impact[key].note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {allowed.record && canRecord && !editing && <RecordForm decision={decision} isPmo={isPmo} />}
      {allowed.defer && canRecord && !editing && <DeferForm decision={decision} />}
      {allowed.withdraw && canEdit && !editing && <WithdrawForm decision={decision} />}
      {decision.status === "Made" && canEdit && allowed.supersede && (
        <SupersedeForm decision={decision} onOpen={onOpen} />
      )}
      {allowed.reverse && canRecord && <ReverseForm decision={decision} />}

      <LinksSection decision={decision} editable={allowed.edit && canEdit} />
      <ActionsSection decision={decision} editable={canEdit || isPmo} />

      {decision.evidenceLink && (
        <p className="mt-5 inline-flex items-center gap-1.5 break-all text-xs text-muted-foreground">
          <FileText className="size-3.5 shrink-0" />
          {decision.evidenceLink}
        </p>
      )}
      {decision.projectCode && (
        <p className="mt-3 text-sm">
          <Link
            to="/portfolio/projects/$projectCode"
            params={{ projectCode: decision.projectCode }}
            className="font-semibold text-primary hover:underline"
          >
            Open the project →
          </Link>
        </p>
      )}

      <History decisionId={decision.id} />
    </>
  );
}

function ProsCons({
  icon,
  label,
  items,
  tone,
}: {
  icon: ReactNode;
  label: string;
  items: string[];
  tone: string;
}) {
  return (
    <div>
      <p className={cn("flex items-center gap-1.5 text-xs font-semibold", tone)}>
        {icon}
        {label}
      </p>
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
        {!items.length && <li>None listed</li>}
      </ul>
    </div>
  );
}

function ActionBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function RecordForm({ decision, isPmo }: { decision: ResolvedDecision; isPmo: boolean }) {
  const mutations = useGovernanceMutations();
  const people = useGovernance().data?.people ?? [];
  const [optionId, setOptionId] = useState(decision.options[0]?.id ?? "");
  const [rationale, setRationale] = useState("");
  const [date, setDate] = useState(todayIso());
  const [by, setBy] = useState<"forum" | "person">(
    isPmo && decision.forumId ? "forum" : decision.decisionMakerId ? "person" : "forum",
  );
  const [actions, setActions] = useState<
    Array<{ description: string; ownerId: string; dueDate: string }>
  >([]);
  const future = date > todayIso();
  return (
    <ActionBox title="Record decision">
      <fieldset>
        <legend className="text-xs font-semibold text-muted-foreground">Chosen option</legend>
        <div className="mt-1 space-y-1">
          {decision.options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`record-${decision.id}`}
                checked={optionId === option.id}
                onChange={() => setOptionId(option.id)}
              />
              {option.title}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Rationale (required)">
        <Textarea
          rows={3}
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Decision date">
          <Input
            type="date"
            max={todayIso()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <fieldset>
          <legend className="text-xs font-semibold text-muted-foreground">Decided by</legend>
          <div className="mt-1 space-y-1 text-sm">
            {decision.forumId && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`by-${decision.id}`}
                  checked={by === "forum"}
                  onChange={() => setBy("forum")}
                />
                Forum: {decision.forum}
              </label>
            )}
            {decision.decisionMakerId && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`by-${decision.id}`}
                  checked={by === "person"}
                  onChange={() => setBy("person")}
                />
                Person: {decision.decisionMaker}
              </label>
            )}
          </div>
        </fieldset>
      </div>
      {future && (
        <p role="alert" className="text-xs font-semibold text-health-bad-foreground">
          The decision date can't be in the future.
        </p>
      )}
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground">Follow-up actions</legend>
        {actions.map((action, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_10rem_9rem_auto]"
          >
            <Input
              aria-label={`Action ${index + 1} description`}
              placeholder="Description"
              value={action.description}
              onChange={(event) =>
                setActions(
                  actions.map((item, i) =>
                    i === index ? { ...item, description: event.target.value } : item,
                  ),
                )
              }
            />
            <select
              aria-label={`Action ${index + 1} owner`}
              className={selectClass}
              value={action.ownerId}
              onChange={(event) =>
                setActions(
                  actions.map((item, i) =>
                    i === index ? { ...item, ownerId: event.target.value } : item,
                  ),
                )
              }
            >
              <option value="">No owner</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <Input
              aria-label={`Action ${index + 1} due date`}
              type="date"
              value={action.dueDate}
              onChange={(event) =>
                setActions(
                  actions.map((item, i) =>
                    i === index ? { ...item, dueDate: event.target.value } : item,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove action ${index + 1}`}
              onClick={() => setActions(actions.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setActions([...actions, { description: "", ownerId: "", dueDate: "" }])}
        >
          <Plus />
          Add action
        </Button>
      </fieldset>
      <Button
        disabled={
          !optionId || !rationale.trim() || !date || future || mutations.recordDecision.isPending
        }
        onClick={() =>
          mutations.recordDecision
            .mutateAsync({
              id: decision.id,
              optionId,
              rationale,
              decisionDate: date,
              lastSeen: decision.updatedAt,
              decidedByForumId: by === "forum" ? decision.forumId : null,
              decidedByResourceId: by === "person" ? decision.decisionMakerId : null,
              actions: actions.map((action) => ({
                description: action.description,
                ownerId: action.ownerId || null,
                dueDate: action.dueDate || null,
              })),
            })
            .then(() => toast.success("Decision recorded"), report)
        }
      >
        <CheckCircle2 />
        Record decision
      </Button>
      <p className="text-xs text-muted-foreground">
        Once recorded, the decision is read-only. Changing it later creates a replacement decision.
      </p>
    </ActionBox>
  );
}

function DeferForm({ decision }: { decision: ResolvedDecision }) {
  const mutations = useGovernanceMutations();
  const forums = useGovernance().data?.forums ?? [];
  const [neededBy, setNeededBy] = useState(addDaysIso(14));
  const [reason, setReason] = useState("");
  const [meeting, setMeeting] = useState(todayIso());
  const [forumId, setForumId] = useState(decision.forumId ?? "");
  return (
    <ActionBox title="Defer">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="New needed-by">
          <Input
            type="date"
            min={todayIso()}
            value={neededBy}
            onChange={(event) => setNeededBy(event.target.value)}
          />
        </Field>
        <Field label="Meeting date">
          <Input
            type="date"
            max={todayIso()}
            value={meeting}
            onChange={(event) => setMeeting(event.target.value)}
          />
        </Field>
        <Field label="Forum">
          <select
            className={selectClass}
            value={forumId}
            onChange={(event) => setForumId(event.target.value)}
          >
            <option value="">Not set</option>
            {forums.map((forum) => (
              <option key={forum.id} value={forum.id}>
                {forum.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Reason (required)">
        <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <Button
        variant="outline"
        disabled={!reason.trim() || !neededBy || mutations.defer.isPending}
        onClick={() =>
          mutations.defer
            .mutateAsync({
              id: decision.id,
              newNeededBy: neededBy,
              reason,
              eventDate: meeting || undefined,
              forumId: forumId || null,
              lastSeen: decision.updatedAt,
            })
            .then(() => toast.success("Decision deferred"), report)
        }
      >
        Defer decision
      </Button>
    </ActionBox>
  );
}

function ConfirmButton({
  label,
  title,
  description,
  disabled,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirm}
            >
              {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WithdrawForm({ decision }: { decision: ResolvedDecision }) {
  const mutations = useGovernanceMutations();
  const [reason, setReason] = useState("");
  return (
    <ActionBox title="Withdraw">
      <p className="text-xs text-muted-foreground">
        The decision is no longer needed. It is kept for the record and becomes read-only.
      </p>
      <Field label="Reason (required)">
        <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <ConfirmButton
        label="Withdraw decision"
        title={`Withdraw ${decision.reference}?`}
        description="This can't be undone. The decision stays in the log as Withdrawn."
        disabled={!reason.trim() || mutations.withdraw.isPending}
        onConfirm={() =>
          mutations.withdraw
            .mutateAsync({ id: decision.id, reason, lastSeen: decision.updatedAt })
            .then(() => toast.success("Decision withdrawn"), report)
        }
      />
    </ActionBox>
  );
}

function SupersedeForm({
  decision,
  onOpen,
}: {
  decision: ResolvedDecision;
  onOpen: ((id: string) => void) | undefined;
}) {
  const mutations = useGovernanceMutations();
  const [neededBy, setNeededBy] = useState(addDaysIso(14));
  return (
    <ActionBox title="Supersede">
      <p className="text-xs text-muted-foreground">
        Creates a Pending replacement with the same context, options and links. {decision.reference}{" "}
        stays Made until the replacement is recorded.
      </p>
      <Field label="Replacement needed by">
        <Input
          type="date"
          min={todayIso()}
          value={neededBy}
          onChange={(event) => setNeededBy(event.target.value)}
          className="sm:w-44"
        />
      </Field>
      <Button
        variant="outline"
        disabled={!neededBy || mutations.supersede.isPending}
        onClick={() =>
          mutations.supersede.mutateAsync({ decision, neededBy }).then((row) => {
            toast.success("Replacement decision created");
            const id = (row as { id?: string } | null)?.id;
            if (id) onOpen?.(id);
          }, report)
        }
      >
        Supersede with a new decision
      </Button>
    </ActionBox>
  );
}

function ReverseForm({ decision }: { decision: ResolvedDecision }) {
  const mutations = useGovernanceMutations();
  const [rationale, setRationale] = useState("");
  const [date, setDate] = useState(todayIso());
  return (
    <ActionBox title="Reverse">
      <p className="text-xs text-muted-foreground">
        Undo this decision without a replacement. It becomes Reversed and read-only.
      </p>
      <Field label="Rationale (required)">
        <Textarea
          rows={2}
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
        />
      </Field>
      <Field label="Date">
        <Input
          type="date"
          max={todayIso()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="sm:w-44"
        />
      </Field>
      <ConfirmButton
        label="Reverse decision"
        title={`Reverse ${decision.reference}?`}
        description="This can't be undone. The decision stays in the log as Reversed."
        disabled={!rationale.trim() || mutations.reverse.isPending}
        onConfirm={() =>
          mutations.reverse
            .mutateAsync({
              id: decision.id,
              rationale,
              eventDate: date,
              lastSeen: decision.updatedAt,
            })
            .then(() => toast.success("Decision reversed"), report)
        }
      />
    </ActionBox>
  );
}

function LinksSection({ decision, editable }: { decision: ResolvedDecision; editable: boolean }) {
  const mutations = useGovernanceMutations();
  const targets = useDecisionLinkTargets(decision.projectId);
  const selected = linkIds(decision);
  const total = Object.values(selected).reduce((sum, ids) => sum + ids.length, 0);
  if (editable && targets.data)
    return (
      <section className="mt-5 rounded-md border p-4">
        <LinkPicker
          targets={targets.data}
          selected={selected}
          disabled={mutations.link.isPending}
          onToggle={(kind, targetId, add) =>
            mutations.link.mutateAsync({ id: decision.id, kind, targetId, add }).catch(report)
          }
        />
      </section>
    );
  const labelOf = (kind: DecisionLinkKind, id: string) =>
    targets.data?.[kind].find((target) => target.id === id)?.label;
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">Linked records</h3>
      {total ? (
        <ul className="mt-2 space-y-1 text-sm">
          {linkKinds.flatMap(({ kind, label }) =>
            selected[kind].map((id) => (
              <li key={kind + id} className="text-muted-foreground">
                <span className="font-semibold text-foreground">{label.replace(/s$/, "")}:</span>{" "}
                {labelOf(kind, id) ?? "Linked record"}
              </li>
            )),
          )}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No linked records.</p>
      )}
    </section>
  );
}

function ActionsSection({ decision, editable }: { decision: ResolvedDecision; editable: boolean }) {
  const mutations = useGovernanceMutations();
  const people = useGovernance().data?.people ?? [];
  if (!decision.actions.length) return null;
  const save = (
    id: string,
    lastSeen: string,
    input: Parameters<typeof mutations.updateAction.mutate>[0]["input"],
  ) => mutations.updateAction.mutateAsync({ id, input, lastSeen }).catch(report);
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">Resulting actions</h3>
      <div className="mt-2 divide-y rounded-md border">
        {decision.actions.map((action) => (
          <div key={action.id} className="space-y-2 p-3">
            <p className="text-sm">{action.description}</p>
            {editable ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  aria-label="Action status"
                  className={selectClass}
                  value={action.status}
                  onChange={(event) =>
                    save(action.id, action.updatedAt, {
                      status: event.target.value as DecisionAction["status"],
                    })
                  }
                >
                  {(["Open", "In progress", "Done"] as const).map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
                <select
                  aria-label="Action owner"
                  className={selectClass}
                  value={action.ownerId ?? ""}
                  onChange={(event) =>
                    save(action.id, action.updatedAt, { ownerId: event.target.value || null })
                  }
                >
                  <option value="">No owner</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="Action due date"
                  type="date"
                  defaultValue={action.dueDate}
                  onBlur={(event) =>
                    event.target.value !== action.dueDate &&
                    save(action.id, action.updatedAt, { dueDate: event.target.value || null })
                  }
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {action.status} · {action.owner || "No owner"}
                {action.dueDate ? ` · due ${formatDate(action.dueDate)}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const eventLabel: Record<DecisionEventView["type"], string> = {
  edited: "Edited",
  deferred: "Deferred",
  made: "Recorded",
  superseded: "Superseded",
  reversed: "Reversed",
  withdrawn: "Withdrawn",
};
const short = (iso: string | null) => (iso ? formatDate(iso).slice(0, 5) : "—");

function History({ decisionId }: { decisionId: string }) {
  const events = useDecisionEvents(decisionId);
  return (
    <section className="mt-6 border-t pt-5">
      <h3 className="text-sm font-semibold">History</h3>
      {events.isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
      {events.error && (
        <p className="mt-2 text-sm text-health-bad-foreground">{errorMessage(events.error)}</p>
      )}
      <ol className="mt-3 space-y-3">
        {(events.data ?? []).map((event) => (
          <li key={event.id} className="border-l-2 border-border pl-3">
            <p className="text-sm font-semibold">
              {eventLabel[event.type]}
              {event.type === "deferred" &&
                ` from ${short(event.previousNeededBy)} to ${short(event.newNeededBy)}`}
              {event.type === "edited" &&
                event.changedFields.length > 0 &&
                `: ${event.changedFields.map((field) => field.replace(/_/g, " ")).join(", ")}`}
            </p>
            {event.reason && <p className="mt-0.5 text-sm text-muted-foreground">{event.reason}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDate(event.eventDate)} · {event.actor}
              {event.forum ? ` · ${event.forum}` : ""}
              {event.decidedBy ? ` · decided by ${event.decidedBy}` : ""}
            </p>
          </li>
        ))}
        {events.data && !events.data.length && (
          <li className="text-sm text-muted-foreground">No history yet.</li>
        )}
      </ol>
    </section>
  );
}
