// One strategic risk: the form (PMO / admin), its actions, the programme and project risks that
// contribute to it, and its score history. Read-only for everyone else.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/format";
import { useModuleTerm } from "@/lib/modules";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import {
  ACTION_STATUS_LABELS,
  addStrategicRiskAction,
  createStrategicRisk,
  linkRiskToStrategicRisk,
  listLinkableRisks,
  listLinkedRisks,
  listStrategicRiskActions,
  listStrategicRiskScores,
  removeStrategicRiskAction,
  setStrategicRiskActionStatus,
  unlinkRisk,
  updateStrategicRisk,
  inputFromRisk,
  type ActionStatus,
  type AssuranceOptions,
  type StrategicRiskInput,
  type StrategicRiskView,
} from "@/services/strategic-risks";
import { ScoreChip, TrendMark } from "./assurance-ui";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const NO_PATIENT_DATA = "Do not enter patient-identifiable information.";

export function StrategicRiskSheet({
  risk,
  options,
  canEdit,
  onClose,
}: {
  risk: StrategicRiskView | null;
  options: AssuranceOptions;
  canEdit: boolean;
  onClose: () => void;
}) {
  const term = useModuleTerm();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-2xl sm:p-6">
        <SheetHeader>
          <SheetTitle>
            {risk
              ? `${risk.ref} ${risk.title}`
              : `New ${term("assurance.strategicRisk").toLowerCase()}`}
          </SheetTitle>
          <SheetDescription>
            {risk
              ? `Scored on the ${risk.riskMatrixName} matrix.`
              : "Scored on your organisation's board assurance matrix; it stays on that matrix if the choice changes later."}
          </SheetDescription>
        </SheetHeader>
        <StrategicRiskForm
          key={risk ? risk.id + risk.updatedAt : "new"}
          risk={risk}
          options={options}
          canEdit={canEdit}
          onSaved={risk ? undefined : onClose}
        />
        {risk && (
          <>
            <ActionsSection risk={risk} options={options} canEdit={canEdit} />
            <LinkedRisksSection risk={risk} />
            <HistorySection risk={risk} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function StrategicRiskForm({
  risk,
  options,
  canEdit,
  onSaved,
}: {
  risk: StrategicRiskView | null;
  options: AssuranceOptions;
  canEdit: boolean;
  onSaved?: (() => void) | undefined;
}) {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => inputFromRisk(risk));
  const set = (patch: Partial<StrategicRiskInput>) => setValues((v) => ({ ...v, ...patch }));
  const matrix = useMemo(
    () =>
      options.matrices.find((m) => m.id === risk?.riskMatrixId) ??
      options.matrices.find((m) => m.key === options.defaultMatrixKey) ??
      options.matrices[0],
    [options, risk],
  );
  const scheme =
    options.schemes.find((s) => s.id === risk?.ratingSchemeId) ??
    options.schemes.find((s) => s.key === "nhs_assurance") ??
    options.schemes[0];
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      risk
        ? updateStrategicRisk(risk.id, values, risk.updatedAt)
        : createStrategicRisk(orgId, values),
    onSuccess: () => {
      toast.success(risk ? "Saved" : "Added");
      queryClient.invalidateQueries({ queryKey: qk.strategicRisks.all(orgId) });
      onSaved?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const disabled = !canEdit || save.isPending;
  const scoreSelect = (
    label: string,
    levels: Array<{ value: number; label: string }>,
    value: number | null,
    onChange: (value: number | null) => void,
    optional: boolean,
  ) => (
    <Field label={label}>
      <select
        className={selectClass}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        {optional && <option value="">Not set</option>}
        {levels.map((level) => (
          <option key={level.value} value={level.value}>
            {level.value} {level.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const scoreRow = (
    title: string,
    l: keyof StrategicRiskInput,
    c: keyof StrategicRiskInput,
    optional: boolean,
  ) => (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-semibold">{title}</legend>
      {scoreSelect(
        "Likelihood",
        matrix?.likelihood ?? [],
        values[l] as number | null,
        (v) => set({ [l]: v } as Partial<StrategicRiskInput>),
        optional,
      )}
      {scoreSelect(
        "Consequence",
        matrix?.consequence ?? [],
        values[c] as number | null,
        (v) => set({ [c]: v } as Partial<StrategicRiskInput>),
        optional,
      )}
    </fieldset>
  );
  const text = (label: string, key: keyof StrategicRiskInput, hint?: string | undefined) => (
    <Field label={label} hint={hint}>
      <Textarea
        disabled={disabled}
        rows={3}
        value={(values[key] as string) ?? ""}
        onChange={(event) => set({ [key]: event.target.value } as Partial<StrategicRiskInput>)}
      />
    </Field>
  );

  return (
    <form
      className="mt-5 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!values.title.trim()) toast.error("Give it a title.");
        else save.mutate();
      }}
    >
      {risk && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border p-3 text-sm">
          <span>
            Current <ScoreChip score={risk.current.score} band={risk.currentBand} />
          </span>
          <TrendMark trend={risk.trend} previous={risk.previousScore} />
          {risk.aboveAppetite && (
            <span className="font-semibold text-red-700 dark:text-red-400">Above appetite</span>
          )}
        </div>
      )}
      <Field label="Title">
        <Input
          disabled={disabled}
          value={values.title}
          onChange={(event) => set({ title: event.target.value })}
        />
      </Field>
      {text("Description", "description", NO_PATIENT_DATA)}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Strategic objective">
          <select
            className={selectClass}
            disabled={disabled}
            value={values.strategicObjectiveId ?? ""}
            onChange={(event) => set({ strategicObjectiveId: event.target.value || null })}
          >
            <option value="">Not set</option>
            {options.objectives.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Executive lead">
          <select
            className={selectClass}
            disabled={disabled}
            value={values.executiveLeadId ?? ""}
            onChange={(event) => set({ executiveLeadId: event.target.value || null })}
          >
            <option value="">Not set</option>
            {options.resources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lead committee">
          <select
            className={selectClass}
            disabled={disabled}
            value={values.leadForumId ?? ""}
            onChange={(event) => set({ leadForumId: event.target.value || null })}
          >
            <option value="">Not set</option>
            {options.forums.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Review date">
          <Input
            type="date"
            disabled={disabled}
            value={values.reviewDate ?? ""}
            onChange={(event) => set({ reviewDate: event.target.value || null })}
          />
        </Field>
        <Field label="Risk appetite">
          <select
            className={selectClass}
            disabled={disabled}
            value={values.riskAppetite ?? ""}
            onChange={(event) => set({ riskAppetite: event.target.value || null })}
          >
            <option value="">Not set</option>
            {options.appetite.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tolerated score" hint="Scores above this show as above appetite.">
          <Input
            type="number"
            min={1}
            max={100}
            disabled={disabled}
            value={values.appetiteScore ?? ""}
            onChange={(event) =>
              set({ appetiteScore: event.target.value ? Number(event.target.value) : null })
            }
          />
        </Field>
      </div>
      {scoreRow("Initial score", "initialLikelihood", "initialConsequence", true)}
      {scoreRow("Current score", "currentLikelihood", "currentConsequence", false)}
      {scoreRow("Target score", "targetLikelihood", "targetConsequence", true)}
      {text("Key controls", "keyControls")}
      {text("Assurance: first line (management)", "assuranceFirstLine")}
      {text("Assurance: second line (oversight)", "assuranceSecondLine")}
      {text("Assurance: third line (independent)", "assuranceThirdLine")}
      {text("Gaps in control", "gapsInControl")}
      {text("Gaps in assurance", "gapsInAssurance")}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assurance rating">
          <select
            className={selectClass}
            disabled={disabled}
            value={values.assuranceRating ?? ""}
            onChange={(event) => set({ assuranceRating: event.target.value || null })}
          >
            <option value="">Not rated</option>
            {(scheme?.levels ?? []).map((level) => (
              <option key={level.key} value={level.key}>
                {level.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={selectClass}
            disabled={disabled}
            value={values.status}
            onChange={(event) =>
              set({ status: event.target.value === "closed" ? "closed" : "open" })
            }
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </Field>
      </div>
      {canEdit && (
        <Button type="submit" disabled={save.isPending}>
          {risk ? "Save changes" : "Add"}
        </Button>
      )}
    </form>
  );
}

function ActionsSection({
  risk,
  options,
  canEdit,
}: {
  risk: StrategicRiskView;
  options: AssuranceOptions;
  canEdit: boolean;
}) {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const key = [...qk.strategicRisks.detail(orgId, risk.id), "actions"];
  const actions = useQuery({ queryKey: key, queryFn: () => listStrategicRiskActions(risk.id) });
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const done = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: qk.strategicRisks.list(orgId) });
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const add = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      addStrategicRiskAction(orgId, risk.id, {
        title,
        ownerId: ownerId || null,
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      setTitle("");
      setOwnerId("");
      setDueDate("");
      done();
    },
    onError,
  });
  const status = useMutation({
    meta: { silent: true },
    mutationFn: (input: { id: string; status: ActionStatus }) => {
      const action = actions.data?.find((item) => item.id === input.id);
      if (!action) throw new Error("Action not found");
      return setStrategicRiskActionStatus(action, input.status);
    },
    onSuccess: done,
    onError,
  });
  const remove = useMutation({
    meta: { silent: true },
    mutationFn: removeStrategicRiskAction,
    onSuccess: done,
    onError,
  });
  const owner = (id: string | null) =>
    options.resources.find((r) => r.id === id)?.name ?? "No owner";
  return (
    <section className="mt-8 space-y-3 border-t pt-5">
      <h3 className="font-semibold">Actions to close the gaps</h3>
      {(actions.data ?? []).length ? (
        <ul className="space-y-2">
          {(actions.data ?? []).map((action) => (
            <li
              key={action.id}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span className="min-w-40 flex-1">{action.title}</span>
              <span className="text-xs text-muted-foreground">
                {owner(action.ownerId)}
                {action.dueDate && ` · due ${formatDate(action.dueDate)}`}
              </span>
              <select
                aria-label={`Status of ${action.title}`}
                className={`${selectClass} w-36`}
                disabled={!canEdit || status.isPending}
                value={action.status}
                onChange={(event) =>
                  status.mutate({ id: action.id, status: event.target.value as ActionStatus })
                }
              >
                {Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${action.title}`}
                  onClick={() => remove.mutate(action.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No actions yet.</p>
      )}
      {canEdit && (
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto]">
          <Input
            aria-label="New action"
            placeholder="New action"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <select
            aria-label="Owner"
            className={selectClass}
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
          >
            <option value="">No owner</option>
            {options.resources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Input
            aria-label="Due date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <Button disabled={!title.trim() || add.isPending} onClick={() => add.mutate()}>
            Add
          </Button>
        </div>
      )}
    </section>
  );
}

function LinkedRisksSection({ risk }: { risk: StrategicRiskView }) {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  // Linking is a contributor's job in the risk's workspace (record_links RLS).
  const canLink = useCan("contributor");
  const key = [...qk.strategicRisks.detail(orgId, risk.id), "links"];
  const linked = useQuery({ queryKey: key, queryFn: () => listLinkedRisks(risk.id) });
  const linkable = useQuery({
    queryKey: qk.strategicRisks.linkable(orgId),
    queryFn: () => listLinkableRisks(orgId),
    enabled: canLink,
  });
  const [choice, setChoice] = useState("");
  const done = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: qk.strategicRisks.list(orgId) });
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const link = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const target = linkable.data?.find((item) => item.id === choice);
      if (!target) throw new Error("Choose a risk to link.");
      return linkRiskToStrategicRisk(target, risk.id);
    },
    onSuccess: () => {
      setChoice("");
      done();
    },
    onError,
  });
  const unlink = useMutation({
    meta: { silent: true },
    mutationFn: unlinkRisk,
    onSuccess: done,
    onError,
  });
  const linkedIds = new Set((linked.data ?? []).map((item) => item.riskId));
  return (
    <section className="mt-8 space-y-3 border-t pt-5">
      <h3 className="font-semibold">Contributing programme and project risks</h3>
      {(linked.data ?? []).length ? (
        <ul className="space-y-1 text-sm">
          {(linked.data ?? []).map((item) => (
            <li key={item.linkId} className="flex items-center gap-2">
              <span className="font-mono text-xs">{item.ref}</span>
              <span className="flex-1">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                Score {item.score}
                {item.status === "closed" && " · closed"}
              </span>
              {canLink && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Unlink ${item.ref}`}
                  onClick={() => unlink.mutate(item.linkId)}
                >
                  Unlink
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No risks linked yet.</p>
      )}
      {canLink && (
        <div className="flex gap-2">
          <select
            aria-label="Risk to link"
            className={selectClass}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">Choose an open risk…</option>
            {(linkable.data ?? [])
              .filter((item) => !linkedIds.has(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.ref} {item.title}
                </option>
              ))}
          </select>
          <Button disabled={!choice || link.isPending} onClick={() => link.mutate()}>
            <Link2 className="size-4" /> Link
          </Button>
        </div>
      )}
    </section>
  );
}

function HistorySection({ risk }: { risk: StrategicRiskView }) {
  const { organisation } = useOrganisation();
  const history = useQuery({
    queryKey: [...qk.strategicRisks.detail(organisation.organisationId, risk.id), "scores"],
    queryFn: () => listStrategicRiskScores(risk.id),
  });
  return (
    <section className="mt-8 space-y-2 border-t pt-5">
      <h3 className="font-semibold">Current score history</h3>
      <ol className="space-y-1 text-sm">
        {(history.data ?? []).map((point) => (
          <li key={point.recordedAt} className="flex gap-3">
            <span className="w-28 text-muted-foreground">
              {formatDate(point.recordedAt.slice(0, 10))}
            </span>
            <span>
              {point.score ?? "—"} (likelihood {point.likelihood} × consequence {point.consequence})
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
