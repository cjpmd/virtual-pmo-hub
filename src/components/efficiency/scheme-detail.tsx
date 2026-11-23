// One efficiency / savings scheme (NHS-4 part 3): Portfolio › Efficiency › <ref>. Its stage (with
// what it still needs for the next one), details and links, finance validation, the phasing grid
// and its impact assessment. The database decides every write; these screens only hide actions a
// person can't take (lib: schemePermissions).
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useOrgId } from "@/components/auth/organisation-provider";
import { ImpactAssessmentPanel } from "@/components/impact-assessment/impact-assessment-panel";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { SampleChip } from "@/components/sample-badge";
import { Breadcrumbs } from "@/components/section-nav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIDENCE_LABELS,
  RECURRENCE_LABELS,
  SAVINGS_TYPE_LABELS,
  STAGE_LABELS,
  adjacentStages,
  schemePermissions,
} from "@/data/efficiency";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useEfficiencyMutations, useScheme, useSchemeOptions } from "@/hooks/use-efficiency";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useWorkspaceRole } from "@/hooks/use-permissions";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useFormat } from "@/lib/format";
import { useModule, useModuleTerm } from "@/lib/modules";
import { atLeast } from "@/services/auth";
import { stageCheck, type EfficiencyScheme } from "@/services/efficiency";
import { qk } from "@/services/query-keys";
import { StageMover } from "./efficiency-pipeline";
import { PhasingGrid } from "./phasing-grid";
import { NO_PATIENT_DATA, SchemeFormSheet } from "./scheme-form";

export function SchemeDetailPage({ schemeId }: { schemeId: string }) {
  const query = useScheme(schemeId);
  return (
    <QueryState query={query}>
      {(scheme) =>
        scheme ? (
          <SchemeDetail scheme={scheme} />
        ) : (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Scheme not found. It may have been removed, or you may not have access.
          </p>
        )
      }
    </QueryState>
  );
}

function SchemeDetail({ scheme }: { scheme: EfficiencyScheme }) {
  const term = useModuleTerm();
  const fmt = useFormat();
  const moduleOn = useModule("efficiency");
  const writable = useOrgWritable();
  const role = useWorkspaceRole(scheme.workspaceId);
  const me = useMyResourceId();
  const [editing, setEditing] = useState(false);
  const options = useSchemeOptions().data;
  const workspace = (useWorkspaces().data ?? []).find((w) => w.id === scheme.workspaceId);
  const perms = schemePermissions({
    role,
    myResourceId: me,
    schemeLeadId: scheme.schemeLeadId,
    financeLeadId: scheme.financeLeadId,
    moduleOn,
    writable: writable && !workspace?.archivedAt,
  });
  const category = scheme.category
    ? (options?.categories.find((c) => c.value === scheme.category)?.label ?? scheme.category)
    : null;
  const benefit = scheme.benefitId
    ? options?.benefits.find((b) => b.id === scheme.benefitId)
    : undefined;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        trail={[
          { label: "Portfolio", to: "/portfolio" },
          { label: term("efficiency.programme"), to: "/portfolio/efficiency" },
          { label: scheme.ref },
        ]}
      />
      <PageHeader
        eyebrow={term("efficiency.scheme")}
        title={`${scheme.ref} · ${scheme.title}`}
        description={scheme.description || "No description yet."}
        actions={
          atLeast(role, "manager") ? (
            <ReadOnlyTip readOnly={!perms.canEdit}>
              <Button variant="outline" disabled={!perms.canEdit} onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-4 w-4" aria-hidden />
                Edit
              </Button>
            </ReadOnlyTip>
          ) : undefined
        }
      />
      {!moduleOn && (
        <p className="rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          The {term("efficiency.programme")} module is switched off, so this scheme is read-only.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Stage">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{STAGE_LABELS[scheme.stage]}</span>
            {scheme.isSample && <SampleChip />}
          </div>
          {scheme.stageChangedAt && (
            <p className="text-xs text-muted-foreground">Since {fmt.date(scheme.stageChangedAt)}</p>
          )}
          {perms.canEdit && <StageMover scheme={scheme} compact={false} />}
          <NextStageNeeds scheme={scheme} />
        </Card>
        <Card title={`This financial year`}>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Item label="Plan">{fmt.currency(scheme.planInYear)}</Item>
            <Item label="Risk-adjusted">{fmt.currency(scheme.riskAdjustedInYear)}</Item>
            <Item label="Forecast">{fmt.currency(scheme.forecastInYear)}</Item>
            <Item label="Actual">{fmt.currency(scheme.actualInYear)}</Item>
            <Item label="Full-year effect">
              {scheme.fullYearEffect == null ? "—" : fmt.currency(scheme.fullYearEffect)}
            </Item>
            <Item label="Confidence">
              {scheme.confidence ? CONFIDENCE_LABELS[scheme.confidence] : "Not set"}
            </Item>
          </dl>
        </Card>
        <FinanceValidation scheme={scheme} canValidate={perms.canValidate} />
      </div>

      <Card title="Details">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {workspace && <Item label="Workspace">{workspace.name}</Item>}
          <Item label={term("orgUnit")}>{scheme.businessUnit ?? "—"}</Item>
          <Item label="Category">{category ?? "—"}</Item>
          <Item label="Savings type">{SAVINGS_TYPE_LABELS[scheme.savingsType]}</Item>
          <Item label="Recurrence">{RECURRENCE_LABELS[scheme.recurrence]}</Item>
          <Item label="Start month">{scheme.startMonth ? fmt.date(scheme.startMonth) : "—"}</Item>
          <Item label="Executive lead">{scheme.executiveLeadName ?? "—"}</Item>
          <Item label="Scheme lead">{scheme.schemeLeadName ?? "—"}</Item>
          <Item label="Finance lead">{scheme.financeLeadName ?? "—"}</Item>
          <Item label="Delivering project">
            {scheme.projectCode ? (
              <Link
                className="underline-offset-2 hover:underline"
                to="/portfolio/projects/$projectCode"
                params={{ projectCode: scheme.projectCode }}
              >
                {scheme.projectCode} · {scheme.projectName}
              </Link>
            ) : (
              "—"
            )}
          </Item>
          <Item label="Delivering programme">
            {scheme.programmeId ? (
              <Link
                className="underline-offset-2 hover:underline"
                to="/portfolio/programmes/$programmeId"
                params={{ programmeId: scheme.programmeId }}
              >
                {scheme.programmeName ?? "Programme"}
              </Link>
            ) : (
              "—"
            )}
          </Item>
          <Item label="Benefit">
            {scheme.benefitId ? (
              <Link
                className="underline-offset-2 hover:underline"
                to="/benefits/$benefitId"
                params={{ benefitId: scheme.benefitId }}
              >
                {benefit?.label ?? "Linked benefit"}
              </Link>
            ) : (
              "—"
            )}
          </Item>
        </dl>
        <div className="mt-4">
          <h3 className="text-sm font-medium">Delivery plan</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {scheme.deliveryPlan ||
              "No delivery plan yet (needed before the scheme is fully developed)."}
          </p>
        </div>
      </Card>

      <section
        aria-labelledby="phasing-heading"
        className="rounded-lg border border-border/70 bg-card p-6 shadow-sm"
      >
        <h2 id="phasing-heading" className="font-display text-lg font-semibold">
          Monthly phasing
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Plan, forecast and actual savings by month, split recurrent and non-recurrent.
        </p>
        <PhasingGrid
          scheme={scheme}
          canEditPlan={perms.canEditValues}
          canEditActuals={perms.canEditValues}
          canValidate={perms.canValidate}
        />
      </section>

      <ImpactAssessmentPanel
        entityType="efficiency_scheme"
        entityId={scheme.id}
        workspaceId={scheme.workspaceId}
      />

      <SchemeFormSheet open={editing} scheme={scheme} onClose={() => setEditing(false)} />
    </div>
  );
}

/** What the scheme still needs before its next pipeline stage (from the database's own check). */
function NextStageNeeds({ scheme }: { scheme: EfficiencyScheme }) {
  const orgId = useOrgId();
  const { forward } = adjacentStages(scheme.stage);
  const check = useQuery({
    queryKey: [...qk.efficiency.scheme(orgId, scheme.id), "next", forward, scheme.updatedAt],
    queryFn: () => (forward ? stageCheck(scheme.id, forward) : Promise.resolve([])),
    enabled: Boolean(forward),
  });
  if (!forward || !check.data) return null;
  return check.data.length ? (
    <p className="text-xs text-muted-foreground">
      Before {STAGE_LABELS[forward]} it needs {check.data.join(", ")}.
    </p>
  ) : (
    <p className="text-xs text-muted-foreground">Ready to move to {STAGE_LABELS[forward]}.</p>
  );
}

function FinanceValidation({
  scheme,
  canValidate,
}: {
  scheme: EfficiencyScheme;
  canValidate: boolean;
}) {
  const fmt = useFormat();
  const { validateScheme } = useEfficiencyMutations();
  const [comment, setComment] = useState("");
  const validated = Boolean(scheme.financeValidatedAt);
  return (
    <Card title="Finance validation">
      {validated ? (
        <p className="text-sm">
          Validated on {fmt.date(scheme.financeValidatedAt ?? undefined)}
          {scheme.financeComment && (
            <span className="mt-1 block text-muted-foreground">“{scheme.financeComment}”</span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not validated yet. The finance lead (or the PMO) validates the planned values before the
          scheme goes into delivery.
        </p>
      )}
      {canValidate && (
        <div className="space-y-2">
          {!validated && (
            <label className="block text-xs">
              <span className="text-muted-foreground">Comment (optional)</span>
              <Textarea
                rows={2}
                maxLength={4000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <span className="text-muted-foreground">{NO_PATIENT_DATA}</span>
            </label>
          )}
          <Button
            size="sm"
            variant={validated ? "outline" : "default"}
            disabled={validateScheme.isPending}
            onClick={() =>
              validateScheme.mutate(
                {
                  id: scheme.id,
                  validate: !validated,
                  ...(comment.trim() ? { comment: comment.trim() } : {}),
                  lastSeen: scheme.updatedAt,
                },
                { onSuccess: () => setComment("") },
              )
            }
          >
            {validated ? "Withdraw validation" : "Validate scheme"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-border/70 bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
