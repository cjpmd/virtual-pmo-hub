// Impact assessments (NHS-3 part 2): a project's (Plan › Gates) or programme's (Status) quality and
// equality impact assessment. Shown only while the 'impact_assessment' module is on. Members read
// it; the target's editors start, edit and submit it; holders of each sign-off role decide their
// step; editors flag a material change. The database checks every one of these again.
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { QueryState } from "@/components/query-state";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ASSESSMENT_STATUS_LABELS,
  EDITABLE_STATUSES,
  missingItems,
  PATIENT_DATA_HINT,
  screeningResult,
  signoffRoute,
  type AssessmentAnswers,
  type AssessmentDecision,
  type AssessmentStatus,
} from "@/data/impact-assessment";
import {
  useAssessmentMutations,
  useGovernanceRoleInfo,
  useTargetAssessment,
} from "@/hooks/use-impact-assessments";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useCan } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/format";
import { useModule, useModuleTerm } from "@/lib/modules";
import {
  cleanAnswers,
  decidableSteps,
  type AssessmentDecisionRecord,
  type AssessmentStep,
  type ImpactAssessment,
  type ImpactTarget,
} from "@/services/impact-assessments";
import { ImpactAssessmentForm } from "./impact-assessment-form";

const DECISION_LABELS: Record<AssessmentDecision, string> = {
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  rejected: "Rejected",
  returned: "Returned for revision",
};

const STATUS_TONE: Record<AssessmentStatus, string> = {
  draft: "border-border text-muted-foreground",
  in_review: "border-amber-500/60 text-amber-800 dark:text-amber-300",
  approved: "border-emerald-600/60 text-emerald-800 dark:text-emerald-300",
  rejected: "border-red-600/60 text-red-800 dark:text-red-300",
  reassessment_required: "border-red-600/60 text-red-800 dark:text-red-300",
};

export function AssessmentStatusChip({ status }: { status: AssessmentStatus }) {
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}
    >
      {ASSESSMENT_STATUS_LABELS[status]}
    </span>
  );
}

export function ImpactAssessmentPanel({
  entityType,
  entityId,
  workspaceId,
}: {
  entityType: ImpactTarget;
  entityId: string;
  workspaceId: string;
}) {
  const enabled = useModule("impact_assessment");
  const term = useModuleTerm();
  const data = useTargetAssessment(entityType, entityId);
  // RLS: project editors are contributors and above; programme editors managers and above.
  const canEdit = useCan(entityType === "project" ? "contributor" : "manager", workspaceId);
  const canDecide = useCan("contributor", workspaceId);
  if (!enabled) return null;
  return (
    <section
      aria-labelledby={`impact-${entityId}-heading`}
      className="rounded-lg border border-border/70 bg-card p-6 shadow-sm"
    >
      <h2 id={`impact-${entityId}-heading`} className="font-display text-lg font-semibold">
        {term("impactAssessment.name")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The quality and equality impact of this {entityType}, signed off by the named governance
        roles.
      </p>
      <QueryState query={data}>
        {(value) =>
          value ? (
            <Assessment
              assessment={value.assessment}
              steps={value.steps}
              decisions={value.decisions}
              canEdit={canEdit}
              canDecide={canDecide}
            />
          ) : (
            <StartAssessment entityType={entityType} entityId={entityId} canEdit={canEdit} />
          )
        }
      </QueryState>
    </section>
  );
}

function StartAssessment({
  entityType,
  entityId,
  canEdit,
}: {
  entityType: ImpactTarget;
  entityId: string;
  canEdit: boolean;
}) {
  const term = useModuleTerm();
  const writable = useOrgWritable();
  const { start } = useAssessmentMutations();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
      <p className="text-sm text-muted-foreground">No assessment has been started.</p>
      {canEdit && (
        <ReadOnlyTip readOnly={!writable}>
          <Button
            size="sm"
            disabled={!writable || start.isPending}
            onClick={() => start.mutate({ entityType, entityId })}
          >
            Start {term("impactAssessment.short")}
          </Button>
        </ReadOnlyTip>
      )}
    </div>
  );
}

function Assessment({
  assessment,
  steps,
  decisions,
  canEdit,
  canDecide,
}: {
  assessment: ImpactAssessment;
  steps: AssessmentStep[];
  decisions: AssessmentDecisionRecord[];
  canEdit: boolean;
  canDecide: boolean;
}) {
  const writable = useOrgWritable();
  const roles = useGovernanceRoleInfo();
  const { save, submit } = useAssessmentMutations();
  const stored: AssessmentAnswers = useMemo(
    () => ({
      screening: assessment.screening,
      quality: assessment.quality,
      equality: assessment.equality,
    }),
    [assessment],
  );
  const [answers, setAnswers] = useState(stored);
  const [title, setTitle] = useState(assessment.title);
  const [summary, setSummary] = useState(assessment.summary);
  const [reviewDate, setReviewDate] = useState(assessment.reviewDate ?? "");
  // A saved or reloaded row replaces the draft.
  useEffect(() => {
    setAnswers(stored);
    setTitle(assessment.title);
    setSummary(assessment.summary);
    setReviewDate(assessment.reviewDate ?? "");
  }, [stored, assessment.title, assessment.summary, assessment.reviewDate]);

  const editable = canEdit && writable && EDITABLE_STATUSES.includes(assessment.status);
  const { template } = assessment;
  const result = screeningResult(template, answers);
  const missing = missingItems(template, answers);
  const route = signoffRoute(template, result.fullRequired);
  const unheld = roles.data ? route.filter((role) => !roles.data.holdersByRole.get(role)) : [];
  const label = (role: string | null) =>
    (role && roles.data?.labels.get(role)) ?? role ?? "Approver";
  const edit = {
    title: title.trim() || assessment.title,
    summary,
    reviewDate: reviewDate || null,
    ...cleanAnswers(template, answers),
  };
  const busy = save.isPending || submit.isPending;
  const mine = decidableSteps(assessment.status, steps, roles.data?.held ?? new Set());

  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <AssessmentStatusChip status={assessment.status} />
        <span>Version {assessment.version}</span>
        <span>
          Highest screening score <span className="font-semibold">{result.maxScore || "—"}</span>
        </span>
        <span>{result.fullRequired ? "Full assessment needed" : "Screening only"}</span>
        {assessment.reviewDate && <span>Review {formatDate(assessment.reviewDate)}</span>}
        {assessment.isSample && <span className="text-muted-foreground">Sample</span>}
      </div>

      {assessment.status === "reassessment_required" && assessment.materialChangeReason && (
        <p className="flex items-start gap-2 rounded-md border border-red-600/40 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden />
          <span>
            Re-assessment required
            {assessment.materialChangeAt &&
              ` since ${formatDate(assessment.materialChangeAt)}`}:{" "}
            {assessment.materialChangeReason}
          </span>
        </p>
      )}

      {steps.length > 0 && (
        <SignOff
          steps={steps}
          label={label}
          decidable={canDecide && writable ? mine : []}
          awaiting={assessment.status === "in_review"}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="block text-xs font-medium text-muted-foreground">
          Title
          <Input
            className="mt-1 text-foreground"
            value={title}
            maxLength={200}
            disabled={!editable}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Post-implementation review
          <Input
            type="date"
            className="mt-1 text-foreground"
            value={reviewDate}
            disabled={!editable}
            onChange={(event) => setReviewDate(event.target.value)}
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-muted-foreground">
        Summary of the change
        <Textarea
          className="mt-1 min-h-16 text-sm text-foreground"
          value={summary}
          maxLength={4000}
          disabled={!editable}
          placeholder={editable ? PATIENT_DATA_HINT : undefined}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>

      <ImpactAssessmentForm
        template={template}
        answers={answers}
        fullRequired={result.fullRequired}
        disabled={!editable}
        onChange={setAnswers}
      />

      {editable && (
        <div className="space-y-3 border-t pt-4">
          {missing.length > 0 ? (
            <div className="text-sm">
              <p className="font-medium">Complete these before submitting:</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm">
              Ready to submit. Sign-off: {route.map((role) => label(role)).join(", then ")}.
            </p>
          )}
          {unheld.length > 0 && (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Nobody holds {unheld.map((role) => label(role)).join(", ")}. An admin or PMO can
              assign it in Settings › Modules › Governance roles.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                save.mutate({ id: assessment.id, edit, lastSeen: assessment.updatedAt })
              }
            >
              Save draft
            </Button>
            <Button
              disabled={busy || missing.length > 0 || unheld.length > 0}
              onClick={() =>
                submit.mutate({ id: assessment.id, edit, lastSeen: assessment.updatedAt })
              }
            >
              Submit for sign-off
            </Button>
          </div>
        </div>
      )}

      {canEdit &&
        writable &&
        (assessment.status === "approved" || assessment.status === "in_review") && (
          <MaterialChange assessmentId={assessment.id} />
        )}

      {decisions.length > 0 && <History decisions={decisions} label={label} />}
    </div>
  );
}

function SignOff({
  steps,
  label,
  decidable,
  awaiting,
}: {
  steps: AssessmentStep[];
  label: (role: string | null) => string;
  decidable: AssessmentStep[];
  awaiting: boolean;
}) {
  const [deciding, setDeciding] = useState<AssessmentStep | null>(null);
  return (
    <div>
      <h3 className="text-sm font-medium">Sign-off</h3>
      <ol className="mt-2 space-y-2">
        {steps.map((step) => {
          const Icon =
            step.decision === "approved"
              ? CheckCircle2
              : step.decision === "rejected"
                ? XCircle
                : CircleDashed;
          const text =
            step.decision === "approved"
              ? "Approved"
              : step.decision === "rejected"
                ? "Not approved"
                : awaiting
                  ? "Awaiting decision"
                  : "Not decided";
          return (
            <li key={step.stepId} className="flex flex-wrap items-center gap-2 text-sm">
              <Icon className="size-4" aria-hidden />
              <span className="font-medium">{step.roleLabel || label(step.role)}</span>
              <span className="text-muted-foreground">
                {text}
                {step.decidedAt && ` · ${formatDate(step.decidedAt)}`}
              </span>
              {decidable.some((s) => s.stepId === step.stepId) && (
                <Button size="sm" variant="outline" onClick={() => setDeciding(step)}>
                  Decide
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {deciding && (
        <DecideDialog
          step={deciding}
          roleLabel={deciding.roleLabel || label(deciding.role)}
          onClose={() => setDeciding(null)}
        />
      )}
    </div>
  );
}

function DecideDialog({
  step,
  roleLabel,
  onClose,
}: {
  step: AssessmentStep;
  roleLabel: string;
  onClose: () => void;
}) {
  const { decide } = useAssessmentMutations();
  const [decision, setDecision] = useState<AssessmentDecision>("approved");
  const [comment, setComment] = useState("");
  const [conditions, setConditions] = useState("");
  const needsComment = decision === "rejected" || decision === "returned";
  const needsConditions = decision === "approved_with_conditions";
  const ready =
    (!needsComment || comment.trim() !== "") && (!needsConditions || conditions.trim() !== "");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decide as {roleLabel}</DialogTitle>
          <DialogDescription>
            Your decision is recorded with your name and the date. {PATIENT_DATA_HINT}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="sr-only">Decision</legend>
          {(Object.keys(DECISION_LABELS) as AssessmentDecision[]).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="impact-decision"
                value={value}
                checked={decision === value}
                onChange={() => setDecision(value)}
              />
              {DECISION_LABELS[value]}
            </label>
          ))}
        </fieldset>
        {needsConditions && (
          <label className="block text-xs font-medium text-muted-foreground">
            Conditions
            <Textarea
              className="mt-1 text-sm text-foreground"
              value={conditions}
              maxLength={4000}
              onChange={(event) => setConditions(event.target.value)}
            />
          </label>
        )}
        <label className="block text-xs font-medium text-muted-foreground">
          {needsComment ? "Reason" : "Comment (optional)"}
          <Textarea
            className="mt-1 text-sm text-foreground"
            value={comment}
            maxLength={4000}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready || decide.isPending}
            onClick={() =>
              decide.mutate(
                {
                  stepId: step.stepId,
                  decision,
                  ...(comment.trim() ? { comment: comment.trim() } : {}),
                  ...(needsConditions ? { conditions: conditions.trim() } : {}),
                },
                { onSuccess: onClose },
              )
            }
          >
            Record decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MaterialChange({ assessmentId }: { assessmentId: string }) {
  const { flag } = useAssessmentMutations();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="border-t pt-4">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Flag a material change
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        If the scope or design changes materially, the assessment must be revised and signed off
        again before the delivery gate.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag a material change</DialogTitle>
            <DialogDescription>
              The assessment goes back for re-assessment and the delivery gate is blocked until it
              is approved again.
            </DialogDescription>
          </DialogHeader>
          <label className="block text-xs font-medium text-muted-foreground">
            What changed
            <Textarea
              className="mt-1 text-sm text-foreground"
              value={reason}
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!reason.trim() || flag.isPending}
              onClick={() =>
                flag.mutate(
                  { id: assessmentId, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setReason("");
                    },
                  },
                )
              }
            >
              Flag for re-assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function History({
  decisions,
  label,
}: {
  decisions: AssessmentDecisionRecord[];
  label: (role: string | null) => string;
}) {
  return (
    <div className="border-t pt-4">
      <h3 className="text-sm font-medium">Decision history</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {decisions.map((d) => (
          <li key={d.id}>
            <span className="font-medium">{DECISION_LABELS[d.decision]}</span>
            <span className="text-muted-foreground">
              {" "}
              · {label(d.governanceRole)} · version {d.version} · {formatDate(d.decidedAt)}
            </span>
            {d.conditions && <p className="text-muted-foreground">Conditions: {d.conditions}</p>}
            {d.comment && <p className="text-muted-foreground">{d.comment}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
