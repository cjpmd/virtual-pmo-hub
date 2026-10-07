import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gavel,
  MessageCircleQuestion,
  ShieldCheck,
} from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { DecisionPanel } from "@/components/decision-panel";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { getValidationQueue } from "@/services/benefits-value";
import { useBenefits } from "@/hooks/use-benefits";
import { useBenefitMutations } from "@/hooks/use-benefits";
import { usePathway, usePathwayMutations } from "@/hooks/use-pathway";
import { useGovernance } from "@/hooks/use-governance";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useCan, useWorkspaceRole } from "@/hooks/use-permissions";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { QueryError } from "@/components/query-state";
import { appRoleLabel } from "@/services/org-settings";
import { todayIso } from "@/lib/today";
import type { ValidationQueueItem } from "@/services/benefits-value";
import { cn } from "@/lib/utils";

const title = "Approvals — Virtual PMO",
  description = "Decisions and measurement records waiting on you.";
export const Route = createFileRoute("/home/approvals")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { profile } = useOrganisation();
  const role = useWorkspaceRole();
  const me = useMyResourceId();
  const canValidate = useCan("pmo");
  const { reviewMeasurement } = useBenefitMutations();
  const [handled, setHandled] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mine, setMine] = useState(true);

  const governance = useGovernance();
  const allDecisions = useMemo(() => governance.data?.decisions ?? [], [governance.data]);
  const open = allDecisions.find((item) => item.id === openId);
  const benefits = useBenefits();
  const queue = useMemo(() => getValidationQueue(benefits.data?.benefits ?? []), [benefits.data]);
  const pending = allDecisions.filter(
    (item) => item.status === "Pending" && (!mine || (me !== null && item.decisionMakerId === me)),
  );
  const outstanding = queue.filter((item) => item.record.status === "Submitted");
  // Outcome indicator measurements share the validate / query workflow.
  const pathway = usePathway();
  const pathwayMutations = usePathwayMutations();
  const indicatorQueue = useMemo(
    () =>
      (pathway.data?.outcomes ?? [])
        .flatMap((outcome) =>
          outcome.indicators.flatMap((indicator) =>
            indicator.measurements
              .filter((measurement) => measurement.status !== "validated")
              .map((measurement) => ({ outcome, indicator, measurement })),
          ),
        )
        .sort((a, b) =>
          (a.measurement.submittedDate ?? "").localeCompare(b.measurement.submittedDate ?? ""),
        ),
    [pathway.data],
  );
  const peopleName = new Map(
    (pathway.data?.people ?? []).map((person) => [person.id, person.name]),
  );
  const outstandingIndicators = indicatorQueue.filter(
    (item) => item.measurement.status === "submitted",
  );
  const decideIndicator = (
    item: (typeof indicatorQueue)[number],
    decision: "validated" | "queried",
  ) => {
    const queryNote =
      decision === "queried"
        ? (window.prompt("What needs checking? The submitter sees this note.") ?? "")
        : undefined;
    if (decision === "queried" && !queryNote?.trim()) return;
    pathwayMutations.reviewMeasurement.mutate(
      {
        id: item.measurement.id,
        decision,
        ...(queryNote ? { queryNote } : {}),
        reviewerId: me,
        today: todayIso(),
        lastSeen: item.measurement.updatedAt,
      },
      { onSuccess: () => setHandled((count) => count + 1) },
    );
  };
  const decide = (item: ValidationQueueItem, decision: "Validated" | "Queried") => {
    const queryNote =
      decision === "Queried"
        ? (window.prompt("What needs checking? The submitter sees this note.") ?? "")
        : undefined;
    if (decision === "Queried" && !queryNote?.trim()) return;
    reviewMeasurement.mutate(
      {
        id: item.record.id,
        decision,
        ...(queryNote ? { queryNote } : {}),
        reviewerId: me,
        today: todayIso(),
        lastSeen: item.record.updatedAt,
      },
      { onSuccess: () => setHandled((count) => count + 1) },
    );
  };

  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      {(governance.isError || benefits.isError) && (
        <QueryError
          error={governance.error ?? benefits.error}
          retry={() => {
            void governance.refetch();
            void benefits.refetch();
          }}
        />
      )}
      <PageHeader
        eyebrow="Personal workspace"
        title="Approvals"
        description="Everything waiting on a decision or a validation from you, in one queue."
        actions={
          <Button variant={mine ? "default" : "outline"} onClick={() => setMine((value) => !value)}>
            {mine ? "Showing mine" : "Showing everyone's"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Decisions awaiting me"
          value={String(pending.length)}
          detail={`${pending.filter((item) => item.overdue).length} past the needed-by date`}
          icon="projects"
        />
        <KpiCard
          label="Measurements to validate"
          value={String(outstanding.length + outstandingIndicators.length)}
          detail={`${outstanding.length} benefit · ${outstandingIndicators.length} outcome indicator`}
          icon="health"
        />
        <KpiCard
          label="Handled in this session"
          value={String(handled)}
          detail="Validated or queried"
          icon="forecast"
        />
        <KpiCard
          label="Your role"
          value={role ? appRoleLabel[role] : "—"}
          detail={profile.displayName}
          icon="budget"
        />
      </div>

      <section className="rounded-lg border border-border/70 bg-card shadow-sm">
        <header className="flex items-center gap-3 border-b p-5">
          <Gavel className="size-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Decisions awaiting approval</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Open one to review the options and record the outcome.
            </p>
          </div>
        </header>
        <div className="divide-y">
          {pending.map((item) => (
            <button
              key={item.id}
              onClick={() => setOpenId(item.id)}
              className="grid w-full gap-2 p-4 text-left hover:bg-accent/30 lg:grid-cols-[1fr_auto] lg:items-center"
            >
              <div>
                <p className="text-sm font-semibold">
                  {item.reference} · {item.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.scopeName} · {item.forum} · {item.options.length} options · impact on{" "}
                  {item.impactSummary.toLowerCase()}
                </p>
              </div>
              <span
                className={cn(
                  "justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold lg:justify-self-auto",
                  item.overdue
                    ? "bg-health-bad/20 text-health-bad-foreground"
                    : "bg-health-warn/25 text-health-warn-foreground",
                )}
              >
                Needed by {formatDate(item.neededBy)}
                {item.overdue ? " · overdue" : ""}
              </span>
            </button>
          ))}
          {!pending.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No decisions are waiting on you.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border/70 bg-card shadow-sm">
        <header className="flex items-center gap-3 border-b p-5">
          <ShieldCheck className="size-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Measurements awaiting validation</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Benefit evidence submitted by owners for PMO validation.
            </p>
          </div>
        </header>
        <div className="divide-y">
          {queue.map((item) => {
            const outcome = item.record.status === "Submitted" ? undefined : item.record.status;
            const profile =
              item.measure.targetProfile.find((target) => target.period === item.record.period)
                ?.value ?? 0;
            return (
              <div key={item.record.id} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm font-semibold">
                    <Link
                      to="/benefits/$benefitId"
                      params={{ benefitId: item.benefit.id }}
                      className="text-primary hover:underline"
                    >
                      {item.benefit.reference}
                    </Link>{" "}
                    · {item.measure.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.record.period} · submitted by {item.record.submittedBy}
                    {item.record.submittedDate
                      ? ` on ${formatDate(item.record.submittedDate)}`
                      : ""}
                  </p>
                  <p className="mt-2 text-sm">
                    Reported{" "}
                    <strong>
                      {item.measure.unit === "currency"
                        ? formatCurrency(item.record.actualValue)
                        : `${item.record.actualValue.toLocaleString()} ${item.measure.unit}`}
                    </strong>{" "}
                    against a profile of{" "}
                    {item.measure.unit === "currency"
                      ? formatCurrency(profile)
                      : `${profile.toLocaleString()} ${item.measure.unit}`}
                    .
                  </p>
                  {item.record.evidence && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="size-3.5" />
                      {item.record.evidence}
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  {outcome ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                        outcome === "Validated"
                          ? "bg-health-good/20 text-health-good-foreground"
                          : "bg-health-warn/25 text-health-warn-foreground",
                      )}
                    >
                      <CheckCircle2 className="size-4" />
                      {outcome}
                    </span>
                  ) : canValidate ? (
                    <>
                      <Button
                        size="sm"
                        disabled={reviewMeasurement.isPending}
                        onClick={() => decide(item, "Validated")}
                      >
                        <ClipboardCheck />
                        Validate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewMeasurement.isPending}
                        onClick={() => decide(item, "Queried")}
                      >
                        <MessageCircleQuestion />
                        Query
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Awaiting PMO validation</span>
                  )}
                </div>
              </div>
            );
          })}
          {!queue.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nothing is waiting for validation.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border/70 bg-card shadow-sm">
        <header className="flex items-center gap-3 border-b p-5">
          <ShieldCheck className="size-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">
              Outcome indicator measurements awaiting validation
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Indicator readings submitted against benefits pathway outcomes. Queried readings never
              count towards the outcome&apos;s RAG.
            </p>
          </div>
        </header>
        {pathway.isError && (
          <div className="p-5">
            <QueryError error={pathway.error} retry={() => void pathway.refetch()} />
          </div>
        )}
        <div className="divide-y">
          {indicatorQueue.map((item) => {
            const unit = item.indicator.unit;
            const show = (value: number | null) =>
              value === null
                ? "—"
                : `${Number(value.toFixed(2)).toLocaleString()}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
            return (
              <div key={item.measurement.id} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm font-semibold">
                    <Link
                      to="/benefits/pathway"
                      search={{ programme: item.outcome.programmeId }}
                      className="text-primary hover:underline"
                    >
                      {item.outcome.title}
                    </Link>{" "}
                    · {item.indicator.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Measured {formatDate(item.measurement.measuredOn)} · submitted by{" "}
                    {peopleName.get(item.measurement.submittedById ?? "") ?? "—"}
                    {item.measurement.submittedDate
                      ? ` on ${formatDate(item.measurement.submittedDate)}`
                      : ""}
                  </p>
                  <p className="mt-2 text-sm">
                    Reported <strong>{show(item.measurement.actualValue)}</strong> against a target
                    of {show(item.indicator.targetValue)} by {formatDate(item.indicator.targetDate)}{" "}
                    (baseline {show(item.indicator.baselineValue)}).
                  </p>
                  {item.measurement.evidence && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="size-3.5" />
                      {item.measurement.evidence}
                    </p>
                  )}
                  {item.measurement.status === "queried" && item.measurement.queryNote && (
                    <p className="mt-1 text-xs text-health-warn-foreground">
                      Query: {item.measurement.queryNote}
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  {item.measurement.status === "queried" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-health-warn/25 px-3 py-1 text-xs font-semibold text-health-warn-foreground">
                      <CheckCircle2 className="size-4" />
                      Queried
                    </span>
                  ) : canValidate ? (
                    <>
                      <Button
                        size="sm"
                        disabled={pathwayMutations.reviewMeasurement.isPending}
                        onClick={() => decideIndicator(item, "validated")}
                      >
                        <ClipboardCheck />
                        Validate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pathwayMutations.reviewMeasurement.isPending}
                        onClick={() => decideIndicator(item, "queried")}
                      >
                        <MessageCircleQuestion />
                        Query
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Awaiting PMO validation</span>
                  )}
                </div>
              </div>
            );
          })}
          {!indicatorQueue.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No indicator measurements are waiting for validation.
            </p>
          )}
        </div>
        {pathwayMutations.reviewMeasurement.error && (
          <p role="alert" className="px-5 pb-4 text-sm text-health-bad-foreground">
            {pathwayMutations.reviewMeasurement.error.message}
          </p>
        )}
      </section>

      {open && <DecisionPanel decision={open} all={allDecisions} close={() => setOpenId(null)} />}
    </div>
  );
}
