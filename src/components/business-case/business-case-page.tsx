// Business case page (design §2, §3): status and version history, Submit / Start a new
// version, Markdown sections with guidance (read-only once submitted), options with the
// preferred radio, the benefits that will go to the register, and the documents panel.
// Approve / reject and the hand-off actions arrive in F5.
// NHS-5 (module five_case): template set and stage on creation, SOC → OBC → FBC, sections grouped
// by case, objectives, long and short lists, the appraisal aid and the approval route; Export to
// Word or PDF, and an approved case sets the project's budget baseline.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  FilePlus2,
  Pencil,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useUser } from "@/components/auth/session-provider";
import { CaseBaselinePanel } from "@/components/business-case/case-baseline-panel";
import { CaseExportMenu } from "@/components/business-case/case-export";
import { DocumentsPanel } from "@/components/business-case/documents-panel";
import {
  AppraisalAidPanel,
  ApprovalRoutePanel,
  ObjectivesPanel,
  StagePill,
} from "@/components/business-case/five-case-panels";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBenefitCategories, useBusinessCase, useCaseAction } from "@/hooks/use-business-case";
import { useFormat } from "@/lib/format";
import { useModule } from "@/lib/modules";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import {
  addBenefit,
  addOption,
  businessCaseStatusLabel,
  classificationLabel,
  createBusinessCase,
  deleteBenefit,
  deleteOption,
  saveSection,
  setPreferredOption,
  startVersion,
  submitVersion,
  updateBenefit,
  updateOption,
  type BenefitClassification,
  type BenefitInput,
  type BusinessCaseStatus,
  type CaseBenefit,
  type CaseOption,
  type CaseOwner,
  type CaseSection,
  type CaseVersion,
  type OptionInput,
} from "@/services/business-cases";
import {
  TEMPLATE_SETS,
  allowedNextStages,
  caseGroupLabel,
  stageLabel,
  stageShort,
  startStage,
  type CaseStage,
} from "@/services/five-case";

const statusStyle: Record<BusinessCaseStatus, { icon: ReactNode; className: string }> = {
  draft: { icon: <Circle className="size-3" />, className: "border-pmo-line text-pmo-muted" },
  submitted: {
    icon: <CircleDot className="size-3" />,
    className: "border-pmo-accent/50 text-pmo-accent",
  },
  approved: {
    icon: <CheckCircle2 className="size-3" />,
    className: "border-pmo-good/50 text-pmo-good",
  },
  rejected: {
    icon: <XCircle className="size-3" />,
    className: "border-pmo-bad/50 text-pmo-bad-text",
  },
  superseded: {
    icon: <Circle className="size-3" />,
    className: "border-pmo-line text-pmo-muted line-through",
  },
};

function StatusPill({ status }: { status: BusinessCaseStatus }) {
  const style = statusStyle[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        style.className,
      )}
    >
      {style.icon}
      {businessCaseStatusLabel[status]}
    </span>
  );
}

function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-pmo-line bg-pmo-panel font-geist">
      <header className="flex items-center justify-between gap-2 border-b border-pmo-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-pmo-text">{title}</h2>
          {subtitle && <p className="text-[11px] text-pmo-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function BusinessCasePage({
  owner,
  defaultTitle,
  canEdit,
}: {
  owner: CaseOwner;
  defaultTitle: string;
  canEdit: boolean;
}) {
  const format = useFormat();
  const user = useUser();
  const query = useBusinessCase(owner);
  const [versionId, setVersionId] = useState<string>("");
  const fiveCase = useModule("five_case");
  const [templateSet, setTemplateSet] = useState<string>("five_case");
  const [firstStage, setFirstStage] = useState<CaseStage>("single");
  const create = useCaseAction(
    owner,
    () =>
      createBusinessCase(owner, defaultTitle, fiveCase ? { templateSet, stage: firstStage } : {}),
    "Business case started",
  );
  const nextStage = useCaseAction(
    owner,
    (args: { caseId: string; stage: CaseStage }) => startStage(args.caseId, args.stage),
    "New stage started",
  );
  const start = useCaseAction(owner, (id: string) => startVersion(id), "New draft version started");
  const submit = useCaseAction(owner, (id: string) => submitVersion(id), "Business case submitted");

  const businessCase = query.data;
  const versions = businessCase?.versions ?? [];
  const version = versions.find((v) => v.id === versionId) ?? versions[0];
  useEffect(() => {
    if (versions.length && !versions.some((v) => v.id === versionId)) setVersionId(versions[0]!.id);
  }, [versions, versionId]);

  if (query.isLoading)
    return <p className="text-sm text-muted-foreground">Loading the business case…</p>;
  if (query.isError)
    return <p className="text-sm text-health-bad-foreground">{(query.error as Error).message}</p>;

  if (!businessCase || !version) {
    return (
      <div className="rounded-xl border border-dashed border-pmo-line bg-pmo-panel px-6 py-12 text-center font-geist">
        <p className="text-sm font-medium text-pmo-text">No business case yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-pmo-muted">
          Starting one creates version 1 with the organisation's Five Case Model sections
          {"requestId" in owner ? " and this request's draft benefits" : ""}.
        </p>
        {canEdit && fiveCase && (
          <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-3 text-left">
            <label className="grid gap-1 text-[11px] text-pmo-muted">
              Template
              <Select value={templateSet} onValueChange={setTemplateSet}>
                <SelectTrigger className="h-8 w-[180px]" aria-label="Template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATE_SETS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-[11px] text-pmo-muted">
              First stage
              <Select value={firstStage} onValueChange={(v) => setFirstStage(v as CaseStage)}>
                <SelectTrigger className="h-8 w-[200px]" aria-label="First stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["single", "soc", "obc", "fbc"] as CaseStage[]).map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stageLabel[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        )}
        {canEdit && (
          <Button
            className="mt-4"
            size="sm"
            disabled={create.isPending}
            onClick={() => create.mutate(undefined)}
          >
            <FilePlus2 />
            Start the business case
          </Button>
        )}
      </div>
    );
  }

  const editable = canEdit && version.status === "draft";
  const hasDraft = versions.some((v) => v.status === "draft");
  const awaiting = versions.some((v) => v.status === "submitted");
  const preferred = version.options.find((o) => o.isPreferred);
  const benefitTotal = version.benefits.reduce((sum, b) => sum + b.annualValue * b.yearsCounted, 0);
  // NHS-5: Five Case Model features show while the module is on, or when the case already uses them.
  const staged = versions.some((v) => v.stage !== "single");
  const showFiveCase = fiveCase || staged || version.objectives.length > 0;
  const approvedStages = versions
    .filter((v) => v.status === "approved" || v.status === "superseded")
    .map((v) => v.stage);
  // After an approved stage, offer the next one (the database enforces the same rule).
  const nextStages = approvedStages.some((stage) => stage !== "single")
    ? allowedNextStages(approvedStages).filter(
        (stage) => stage !== "single" && !approvedStages.includes(stage),
      )
    : [];
  const grouped = version.sections.some((section) => section.caseGroup);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pmo-line bg-pmo-panel px-4 py-3 font-geist">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={version.id} onValueChange={setVersionId}>
            <SelectTrigger className="h-8 w-[260px]" aria-label="Version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  v{v.version}
                  {v.stage !== "single" ? ` · ${stageShort[v.stage]}` : ""} ·{" "}
                  {businessCaseStatusLabel[v.status]} · {format.date(v.submittedAt ?? v.createdAt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showFiveCase && <StagePill stage={version.stage} />}
          <StatusPill status={version.status} />
          <span className="text-[11px] text-pmo-muted">
            {version.submittedAt
              ? `Submitted ${format.date(version.submittedAt)}${version.submittedBy ? ` by ${version.submittedBy}` : ""}`
              : `Started ${format.date(version.createdAt)}`}
            {version.decidedAt ? ` · decided ${format.date(version.decidedAt)}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <CaseExportMenu businessCase={businessCase} version={version} />
          {canEdit && (
            <>
              {version.status === "draft" && (
                <Button
                  size="sm"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate(version.id)}
                >
                  <Send />
                  Submit
                </Button>
              )}
              {!hasDraft && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={start.isPending || awaiting}
                  title={awaiting ? "A version is awaiting a decision" : undefined}
                  onClick={() => start.mutate(businessCase.id)}
                >
                  <FilePlus2 />
                  Start a new version
                </Button>
              )}
              {fiveCase &&
                !hasDraft &&
                nextStages.map((stage) => (
                  <Button
                    key={stage}
                    size="sm"
                    disabled={nextStage.isPending || awaiting}
                    onClick={() => nextStage.mutate({ caseId: businessCase.id, stage })}
                  >
                    <FilePlus2 />
                    Start the {stageShort[stage]}
                  </Button>
                ))}
            </>
          )}
        </div>
      </section>

      <section
        aria-label="Business case figures"
        className="flex flex-wrap rounded-xl border border-pmo-line bg-pmo-panel font-geist"
      >
        {[
          {
            label: "Whole-life cost",
            value: preferred?.wholeLifeCost ?? version.wholeLifeCost,
            detail: preferred ? `Preferred: ${preferred.name}` : "No preferred option yet",
          },
          {
            label: "Delivery cost",
            value: preferred?.deliveryCost ?? null,
            detail: "Becomes the budget baseline once approved",
          },
          {
            label: "Benefits counted",
            value: benefitTotal,
            detail: `${version.benefits.length} benefit${version.benefits.length === 1 ? "" : "s"}`,
          },
          {
            label: "Options appraised",
            value: null,
            count: version.options.length,
            detail: "Including do nothing, if listed",
          },
        ].map((cell) => (
          <div
            key={cell.label}
            className="flex min-w-0 flex-[1_1_180px] flex-col gap-0.5 border-r border-pmo-line px-[18px] py-3 last:border-r-0"
          >
            <span className="text-[11px] uppercase tracking-[0.05em] text-pmo-muted">
              {cell.label}
            </span>
            <span className="pmo-num text-xl font-medium text-pmo-text">
              {"count" in cell && cell.count !== undefined
                ? cell.count
                : cell.value === null || cell.value === undefined
                  ? "—"
                  : format.currency(cell.value)}
            </span>
            <span className="text-[11px] text-pmo-muted">{cell.detail}</span>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {version.sections.map((section, index) => (
            <Fragment key={section.id}>
              {grouped &&
                section.caseGroup &&
                section.caseGroup !== version.sections[index - 1]?.caseGroup && (
                  <h2 className="pt-2 text-xs font-semibold uppercase tracking-[0.06em] text-pmo-muted">
                    {caseGroupLabel[section.caseGroup]}
                  </h2>
                )}
              <SectionCard owner={owner} section={section} editable={editable} />
              {showFiveCase && section.key === "fc_case_for_change" && (
                <ObjectivesPanel owner={owner} version={version} editable={editable && fiveCase} />
              )}
            </Fragment>
          ))}
          {showFiveCase && !version.sections.some((s) => s.key === "fc_case_for_change") && (
            <ObjectivesPanel owner={owner} version={version} editable={editable && fiveCase} />
          )}
          <OptionsTable
            owner={owner}
            version={version}
            editable={editable}
            fiveCase={showFiveCase}
          />
          {showFiveCase && (
            <AppraisalAidPanel owner={owner} version={version} editable={editable && fiveCase} />
          )}
          <BenefitsTable owner={owner} version={version} editable={editable} />
        </div>
        <div className="space-y-5">
          <ApprovalRoutePanel owner={owner} version={version} />
          {"projectId" in owner && (
            <CaseBaselinePanel
              projectId={owner.projectId}
              workspaceId={businessCase.workspaceId}
              version={version}
            />
          )}
          <DocumentsPanel
            owner={owner}
            businessCaseId={businessCase.id}
            canEdit={canEdit}
            currentUserId={user?.id ?? null}
          />
          <Panel title="Version history">
            <ol className="divide-y divide-pmo-line">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setVersionId(v.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-pmo-panel-2/40",
                      v.id === version.id && "bg-pmo-panel-2/60",
                    )}
                  >
                    <span className="pmo-num text-sm text-pmo-text">
                      v{v.version}
                      {v.stage !== "single" && (
                        <span className="ml-1 text-[11px] text-pmo-muted">
                          {stageShort[v.stage]}
                        </span>
                      )}
                    </span>
                    <span className="flex-1 text-[11px] text-pmo-muted">
                      {format.date(v.submittedAt ?? v.createdAt)}
                      {v.submittedBy ? ` · ${v.submittedBy}` : ""}
                    </span>
                    <StatusPill status={v.status} />
                  </button>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  owner,
  section,
  editable,
}: {
  owner: CaseOwner;
  section: CaseSection;
  editable: boolean;
}) {
  const [text, setText] = useState(section.content);
  const [mode, setMode] = useState<"write" | "preview">("write");
  useEffect(() => setText(section.content), [section.content]);
  const save = useCaseAction(owner, (content: string) =>
    saveSection(section.id, content, section.updatedAt),
  );
  const flush = () => {
    if (text !== section.content) save.mutate(text);
  };
  return (
    <Panel
      title={section.title}
      subtitle={section.guidance ?? undefined}
      actions={
        <div className="flex items-center gap-2">
          {section.isRequired && !section.content.trim() && (
            <span className="text-[11px] text-pmo-warn">▲ Required</span>
          )}
          {save.isPending && <span className="text-[11px] text-pmo-muted">Saving…</span>}
          {editable && (
            <ToggleGroup
              type="single"
              size="sm"
              value={mode}
              onValueChange={(value) => value && setMode(value as "write" | "preview")}
            >
              <ToggleGroupItem value="write" className="h-7 px-2 text-xs">
                Write
              </ToggleGroupItem>
              <ToggleGroupItem value="preview" className="h-7 px-2 text-xs">
                Preview
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      }
    >
      <div className="px-4 py-3">
        {editable && mode === "write" ? (
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={flush}
            rows={6}
            placeholder="Markdown: # heading, - list, **bold**, *italic*"
            aria-label={section.title}
            className="font-geist text-sm"
          />
        ) : text.trim() ? (
          <Markdown source={text} />
        ) : (
          <p className="text-xs text-pmo-muted">Not written yet.</p>
        )}
      </div>
    </Panel>
  );
}

const emptyOption: OptionInput = {
  name: "",
  description: "",
  wholeLifeCost: null,
  deliveryCost: null,
  benefitsSummary: "",
  riskSummary: "",
};
const moneyInput = (value: string) => (value.trim() === "" ? null : Number(value));

function OptionsTable({
  owner,
  version,
  editable,
  fiveCase = false,
}: {
  owner: CaseOwner;
  version: CaseVersion;
  editable: boolean;
  fiveCase?: boolean;
}) {
  const format = useFormat();
  const [editing, setEditing] = useState<CaseOption | "new" | null>(null);
  const prefer = useCaseAction(owner, (option: CaseOption) =>
    setPreferredOption(option.id, option.updatedAt),
  );
  const remove = useCaseAction(owner, (id: string) => deleteOption(id), "Option removed");
  const save = useCaseAction(owner, (input: OptionInput) =>
    editing === "new" || !editing
      ? addOption(version.id, input, version.options.length)
      : updateOption(editing.id, input, editing.updatedAt),
  );
  return (
    <Panel
      title="Options"
      subtitle={
        fiveCase
          ? "Long list and short list. Exactly one short-listed preferred option, with whole-life and delivery costs, is needed to submit"
          : "Exactly one preferred option, with whole-life and delivery costs, is needed to submit"
      }
      actions={
        editable && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus />
            Add option
          </Button>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-pmo-muted">
              <th className="px-4 py-2 font-medium">Preferred</th>
              <th className="px-2 py-2 font-medium">Option</th>
              <th className="px-2 py-2 text-right font-medium">Whole-life cost</th>
              <th className="px-2 py-2 text-right font-medium">Delivery cost</th>
              <th className="px-2 py-2 font-medium">Benefits</th>
              <th className="px-2 py-2 font-medium">Risks</th>
              {editable && <th className="w-20" />}
            </tr>
          </thead>
          <tbody>
            {version.options.map((option) => (
              <tr key={option.id} className="border-t border-pmo-line align-top">
                <td className="px-4 py-2.5">
                  <input
                    type="radio"
                    name={`preferred-${version.id}`}
                    checked={option.isPreferred}
                    disabled={!editable || prefer.isPending || option.listStage === "long"}
                    onChange={() => prefer.mutate(option)}
                    aria-label={`Prefer ${option.name}`}
                    className="accent-[var(--color-pmo-accent)]"
                  />
                  {option.isPreferred && (
                    <span className="ml-1.5 text-[11px] text-pmo-accent">Preferred</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <p className="font-medium text-pmo-text">
                    {option.name}
                    {fiveCase && (
                      <span className="ml-1.5 rounded-full border border-pmo-line px-1.5 py-px text-[10px] font-normal text-pmo-muted">
                        {option.listStage === "long" ? "Long list" : "Short list"}
                      </span>
                    )}
                  </p>
                  {option.description && (
                    <p className="text-xs text-pmo-muted">{option.description}</p>
                  )}
                  {fiveCase && option.shortlistNote && (
                    <p className="text-xs italic text-pmo-muted">{option.shortlistNote}</p>
                  )}
                </td>
                <td className="pmo-num px-2 py-2.5 text-right">
                  {option.wholeLifeCost === null ? "—" : format.currency(option.wholeLifeCost)}
                </td>
                <td className="pmo-num px-2 py-2.5 text-right">
                  {option.deliveryCost === null ? "—" : format.currency(option.deliveryCost)}
                </td>
                <td className="px-2 py-2.5 text-xs text-pmo-muted">
                  {option.benefitsSummary ?? "—"}
                </td>
                <td className="px-2 py-2.5 text-xs text-pmo-muted">{option.riskSummary ?? "—"}</td>
                {editable && (
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Edit ${option.name}`}
                      onClick={() => setEditing(option)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Remove ${option.name}`}
                      onClick={() => remove.mutate(option.id)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {!version.options.length && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-pmo-muted">
                  No options yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <OptionDialog
          initial={
            editing === "new"
              ? fiveCase
                ? { ...emptyOption, listStage: "short", shortlistNote: "", optimismBiasPct: null }
                : emptyOption
              : {
                  name: editing.name,
                  description: editing.description ?? "",
                  wholeLifeCost: editing.wholeLifeCost,
                  deliveryCost: editing.deliveryCost,
                  benefitsSummary: editing.benefitsSummary ?? "",
                  riskSummary: editing.riskSummary ?? "",
                  ...(fiveCase && {
                    listStage: editing.listStage,
                    shortlistNote: editing.shortlistNote ?? "",
                    optimismBiasPct: editing.optimismBiasPct,
                  }),
                }
          }
          fiveCase={fiveCase}
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onSave={(input) => save.mutate(input, { onSuccess: () => setEditing(null) })}
          saving={save.isPending}
        />
      )}
    </Panel>
  );
}

function OptionDialog({
  initial,
  isNew,
  fiveCase = false,
  onClose,
  onSave,
  saving,
}: {
  initial: OptionInput;
  isNew: boolean;
  fiveCase?: boolean;
  onClose: () => void;
  onSave: (input: OptionInput) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [whole, setWhole] = useState(initial.wholeLifeCost?.toString() ?? "");
  const [delivery, setDelivery] = useState(initial.deliveryCost?.toString() ?? "");
  const [bias, setBias] = useState(initial.optimismBiasPct?.toString() ?? "");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add option" : "Edit option"}</DialogTitle>
          <DialogDescription>Costs in the organisation's base currency.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Whole-life cost">
              <Input
                inputMode="decimal"
                className="pmo-num text-right"
                value={whole}
                onChange={(e) => setWhole(e.target.value)}
              />
            </Field>
            <Field label="Delivery cost">
              <Input
                inputMode="decimal"
                className="pmo-num text-right"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Benefits summary">
            <Textarea
              rows={2}
              value={form.benefitsSummary}
              onChange={(e) => setForm({ ...form, benefitsSummary: e.target.value })}
            />
          </Field>
          <Field label="Risk summary">
            <Textarea
              rows={2}
              value={form.riskSummary}
              onChange={(e) => setForm({ ...form, riskSummary: e.target.value })}
            />
          </Field>
          {fiveCase && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="List">
                  <Select
                    value={form.listStage ?? "short"}
                    onValueChange={(value) =>
                      setForm({ ...form, listStage: value as "long" | "short" })
                    }
                  >
                    <SelectTrigger aria-label="List">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short list</SelectItem>
                      <SelectItem value="long">Long list (discounted)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Optimism bias (%)">
                  <Input
                    inputMode="decimal"
                    className="pmo-num text-right"
                    value={bias}
                    placeholder="—"
                    onChange={(e) => setBias(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Why it was short-listed or discounted">
                <Textarea
                  rows={2}
                  value={form.shortlistNote ?? ""}
                  onChange={(e) => setForm({ ...form, shortlistNote: e.target.value })}
                />
              </Field>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              onSave({
                ...form,
                wholeLifeCost: moneyInput(whole),
                deliveryCost: moneyInput(delivery),
                ...(fiveCase && { optimismBiasPct: moneyInput(bias) }),
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function BenefitsTable({
  owner,
  version,
  editable,
}: {
  owner: CaseOwner;
  version: CaseVersion;
  editable: boolean;
}) {
  const format = useFormat();
  const categories = useBenefitCategories();
  const categoryName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.label])),
    [categories.data],
  );
  const [editing, setEditing] = useState<CaseBenefit | "new" | null>(null);
  const remove = useCaseAction(owner, (id: string) => deleteBenefit(id), "Benefit removed");
  const save = useCaseAction(owner, (input: BenefitInput) =>
    editing === "new" || !editing
      ? addBenefit(version.id, input, version.benefits.length)
      : updateBenefit(editing.id, input, editing.updatedAt),
  );
  return (
    <Panel
      title="Benefits"
      subtitle="These go to the benefits register after approval"
      actions={
        editable && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus />
            Add benefit
          </Button>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-pmo-muted">
              <th className="px-4 py-2 font-medium">Benefit</th>
              <th className="px-2 py-2 font-medium">Classification</th>
              <th className="px-2 py-2 font-medium">Category</th>
              <th className="px-2 py-2 text-right font-medium">Annual value</th>
              <th className="px-2 py-2 text-right font-medium">Years</th>
              <th className="px-2 py-2 text-right font-medium">Counted</th>
              {editable && <th className="w-20" />}
            </tr>
          </thead>
          <tbody>
            {version.benefits.map((benefit) => (
              <tr key={benefit.id} className="border-t border-pmo-line align-top">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-pmo-text">{benefit.title}</p>
                  {benefit.measure && <p className="text-xs text-pmo-muted">{benefit.measure}</p>}
                </td>
                <td className="px-2 py-2.5 text-xs">
                  {classificationLabel[benefit.classification]}
                </td>
                <td className="px-2 py-2.5 text-xs">
                  {categoryName.get(benefit.categoryId) ?? "—"}
                </td>
                <td className="pmo-num px-2 py-2.5 text-right">
                  {format.currency(benefit.annualValue)}
                </td>
                <td className="pmo-num px-2 py-2.5 text-right">{benefit.yearsCounted}</td>
                <td className="pmo-num px-2 py-2.5 text-right">
                  {format.currency(benefit.annualValue * benefit.yearsCounted)}
                </td>
                {editable && (
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Edit ${benefit.title}`}
                      onClick={() => setEditing(benefit)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Remove ${benefit.title}`}
                      onClick={() => remove.mutate(benefit.id)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {!version.benefits.length && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-xs text-pmo-muted">
                  No benefits yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <BenefitDialog
          categories={categories.data ?? []}
          initial={
            editing === "new"
              ? {
                  title: "",
                  classification: "non_cash_releasing",
                  categoryId: categories.data?.[0]?.id ?? "",
                  measure: "",
                  annualValue: 0,
                  yearsCounted: 5,
                }
              : {
                  title: editing.title,
                  classification: editing.classification,
                  categoryId: editing.categoryId,
                  measure: editing.measure ?? "",
                  annualValue: editing.annualValue,
                  yearsCounted: editing.yearsCounted,
                }
          }
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onSave={(input) => save.mutate(input, { onSuccess: () => setEditing(null) })}
          saving={save.isPending}
        />
      )}
    </Panel>
  );
}

function BenefitDialog({
  categories,
  initial,
  isNew,
  onClose,
  onSave,
  saving,
}: {
  categories: { id: string; label: string }[];
  initial: BenefitInput;
  isNew: boolean;
  onClose: () => void;
  onSave: (input: BenefitInput) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [annual, setAnnual] = useState(String(initial.annualValue));
  const [years, setYears] = useState(String(initial.yearsCounted));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add benefit" : "Edit benefit"}</DialogTitle>
          <DialogDescription>
            Counted value is the annual value times the years counted.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Classification">
              <Select
                value={form.classification}
                onValueChange={(value) =>
                  setForm({ ...form, classification: value as BenefitClassification })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(classificationLabel).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm({ ...form, categoryId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Measure">
            <Input
              value={form.measure}
              onChange={(e) => setForm({ ...form, measure: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Annual value">
              <Input
                inputMode="decimal"
                className="pmo-num text-right"
                value={annual}
                onChange={(e) => setAnnual(e.target.value)}
              />
            </Field>
            <Field label="Years counted">
              <Input
                inputMode="numeric"
                className="pmo-num text-right"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              onSave({
                ...form,
                annualValue: Number(annual) || 0,
                yearsCounted: Math.max(1, Math.round(Number(years) || 1)),
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
