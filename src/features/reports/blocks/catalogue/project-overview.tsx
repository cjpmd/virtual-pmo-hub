// project_overview: composite deep-dive block. Maps the JSON shapes returned by
// private.rb_project_overview (which calls six sub-functions) into the props accepted by the
// shared ProjectOverviewPanel component, so both the portfolio row panel and this block render
// the identical visual output. Layout is controlled by CSS container queries inside the panel.
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import {
  ProjectOverviewPanel,
  type PanelProject,
} from "@/components/overview/ProjectOverviewPanel";
import { Empty } from "../primitives";
import { registerBlock } from "../registry";
import type { RenderContext } from "../types";
import { priorityLabel, tierLabel, toHealth } from "@/services/labels";
import type { Phase } from "@/services/hierarchy";
import type { Health } from "@/data/types";
import type {
  LatestReport,
  OpenRaidItem,
  ProjectHealthMonth,
  ProjectOverviewHealth,
  ProjectOverviewMilestone,
  RiskBand,
  HealthDimension,
} from "@/services/project-overview";
import { HEALTH_DIMENSIONS } from "@/services/project-overview";
import { todayIso } from "@/lib/today";

// ─── SQL shape types ──────────────────────────────────────────────────────────
// These mirror what private.rb_project_overview composes from its six sub-functions.

interface RbSummary {
  id: string;
  code: string;
  name: string;
  tier: string | null;
  priority: string | null;
  state: string | null;
  phase_id: string | null;
  phases: Array<{
    id: string;
    name: string;
    short_name: string;
    gate_name: string | null;
    sort_order: number;
  }>;
  start_date: string | null;
  finish_date: string | null;
  baseline_finish_date: string | null;
  forecast_finish_date: string | null;
  finish_vs_baseline_days: number | null;
  manager: string | null;
  sponsor: string | null;
  project_officer: string | null;
}

type RagStr = string | null | undefined;

interface RbHealth {
  mode: string;
  declared: RagStr;
  evidenced: RagStr;
  divergence_days: number | null;
  divergence_alert: boolean | null;
  justified: boolean | null;
  last_report_date: string | null;
  report_overdue: boolean | null;
}

interface RbHealthMonth {
  month: string;
  evidenced: Record<string, RagStr>;
  declared: Record<string, RagStr> | null;
}

interface RbHistory {
  mode: string;
  months: RbHealthMonth[];
  current: Record<string, RagStr> | null;
}

interface RbMilestoneRow {
  id: string;
  ref: string | null;
  title: string;
  type: string;
  project_code: string;
  project_name: string;
  baseline_date: string;
  forecast_date: string;
  actual_date: string | null;
  slip_days: number | null;
  slip_band: string | null;
  status: string;
}

interface RbMilestones {
  multi: boolean;
  rows: RbMilestoneRow[];
}

interface RbRaidRow {
  kind: string;
  id: string;
  ref: string | null;
  title: string;
  score: number | null;
  band: { min?: number; label?: string } | null;
  severity: string | null;
  review_date: string | null;
  updated_at: string;
  owner: string | null;
  rank: number;
}

interface RbRaid {
  matrix: { name: string; bands: Array<{ min?: number; label?: string }> };
  rows: RbRaidRow[];
  open_total: number;
}

interface RbHighlight {
  id: string | null;
  ref?: string | null;
  project_code?: string | null;
  reporting_date?: string | null;
  submitted_at?: string | null;
  author?: string | null;
  comments?: string | null;
  accomplished?: string | null;
  planned?: string | null;
  decisions_needed?: string | null;
  declared?: Record<string, RagStr> | null;
  evidenced?: Record<string, RagStr> | null;
}

interface BlockData {
  summary: RbSummary | null;
  health: RbHealth | null;
  history: RbHistory | null;
  milestones: RbMilestones | null;
  raid: RbRaid | null;
  highlight: RbHighlight | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RagText = Parameters<typeof toHealth>[0];
const rag = (v: RagStr): Health => toHealth(v as RagText);

function dimRecord(
  src: Record<string, RagStr> | null | undefined,
): Record<HealthDimension, Health> {
  return Object.fromEntries(HEALTH_DIMENSIONS.map((d) => [d, rag(src?.[d])])) as Record<
    HealthDimension,
    Health
  >;
}

// ─── Mapper: SQL block shapes → ProjectOverviewPanel props ───────────────────

interface MappedPanel {
  project: PanelProject;
  health: ProjectOverviewHealth | null;
  milestones: ProjectOverviewMilestone[];
  healthMonths: ProjectHealthMonth[];
  latestReport: LatestReport | null;
  riskBands: RiskBand[];
  openRaid: OpenRaidItem[];
}

function mapBlockData(data: BlockData): MappedPanel | null {
  const s = data.summary;
  if (!s) return null;

  // ── Health ────────────────────────────────────────────────────────────────
  const h = data.health;
  const cur = data.history?.current ?? null;
  const health: ProjectOverviewHealth | null =
    h && h.mode === "project"
      ? {
          overall: rag(cur?.["overall"] ?? h.evidenced),
          schedule: rag(cur?.["schedule"]),
          financial: rag(cur?.["financial"]),
          effort: rag(cur?.["effort"]),
          issue: rag(cur?.["issue"]),
          benefit: rag(cur?.["benefit"]),
          declared: h.declared ? rag(h.declared) : null,
          evidenced: h.evidenced ? rag(h.evidenced) : null,
          divergent: (h.divergence_days ?? 0) > 0,
          divergenceKind: null,
          divergenceDays: h.divergence_days ?? null,
          divergenceAlert: h.divergence_alert ?? false,
          justified: h.justified ?? false,
          lastReportDate: h.last_report_date ?? null,
          nextReportDue: null,
          reportOverdue: h.report_overdue ?? false,
          forecastFinishDate: s.forecast_finish_date ?? null,
          forecastBasis: null,
          finishSlipHealth: null,
          finishVsBaselineDays: s.finish_vs_baseline_days ?? null,
          milestonesAfterBaselineFinish: 0,
          computedAt: null,
        }
      : null;

  // ── Health months ─────────────────────────────────────────────────────────
  const healthMonths: ProjectHealthMonth[] = (data.history?.months ?? []).map((m) => ({
    month: m.month,
    snapshotDate: m.month + "-28",
    source: "job",
    evidenced: dimRecord(m.evidenced),
    declared: m.declared ? dimRecord(m.declared) : null,
  }));

  // ── Milestones ────────────────────────────────────────────────────────────
  const milestones: ProjectOverviewMilestone[] = (data.milestones?.rows ?? []).map((m) => ({
    id: m.id,
    ref: m.ref,
    title: m.title,
    type: m.type,
    phaseName: null,
    baselineDate: m.baseline_date,
    forecastDate: m.forecast_date,
    actualDate: m.actual_date,
    status: m.status,
    slipDays: m.slip_days,
    slipBand: m.slip_band,
    pastBaseline: (m.slip_days ?? 0) > 0,
    reportToCommittee: false,
    updatedAt: null,
  }));

  // ── RAID ──────────────────────────────────────────────────────────────────
  const riskBands: RiskBand[] = (data.raid?.matrix?.bands ?? [])
    .map((b) => ({ label: b.label ?? "", minScore: Number(b.min ?? 0) }))
    .filter((b) => Number.isFinite(b.minScore));

  const openRaid: OpenRaidItem[] = (data.raid?.rows ?? []).map((r) => ({
    kind: r.kind === "issue" ? "issue" : ("risk" as const),
    id: r.id,
    ref: r.ref ?? null,
    title: r.title,
    score: r.score ?? null,
    severity: r.severity ?? null,
    reviewDate: r.review_date ?? null,
    createdAt: r.updated_at,
    updatedAt: r.updated_at,
  }));

  // ── Highlight report ──────────────────────────────────────────────────────
  const hi = data.highlight;
  const latestReport: LatestReport | null =
    hi?.id && hi.reporting_date
      ? {
          id: hi.id,
          reportingDate: hi.reporting_date,
          submittedAt: hi.submitted_at ?? null,
          author: hi.author ?? null,
          comments: hi.comments ?? null,
          accomplished: hi.accomplished ?? null,
          planned: hi.planned ?? null,
          decisionsNeeded: hi.decisions_needed ?? null,
          declared: dimRecord(hi.declared),
          evidenced: dimRecord(hi.evidenced),
          projectCode: hi.project_code ?? s.code,
          decisions: [],
        }
      : null;

  return {
    project: {
      id: s.id,
      code: s.code,
      name: s.name,
      tier: s.tier ? (tierLabel[s.tier as keyof typeof tierLabel] ?? s.tier) : "",
      priority: s.priority
        ? (priorityLabel[s.priority as keyof typeof priorityLabel] ?? s.priority)
        : "",
      state: s.state ?? "active",
      phaseId: s.phase_id ?? null,
      phases: (s.phases ?? []).map((p): Phase => ({
        id: p.id,
        name: p.name,
        shortName: p.short_name,
        gateName: p.gate_name,
        index: p.sort_order,
      })),
      managerName: s.manager ?? null,
      sponsorName: s.sponsor ?? null,
      projectOfficerName: s.project_officer ?? null,
      startDate: s.start_date ?? null,
      baselineFinishDate: s.baseline_finish_date ?? null,
    },
    health,
    milestones,
    healthMonths,
    latestReport,
    riskBands,
    openRaid,
  };
}

// ─── Block renderer ───────────────────────────────────────────────────────────

const overviewSchema = z.object({
  milestones_limit: z.number().int().min(1).max(20).default(6),
  raid_limit: z.number().int().min(1).max(20).default(5),
});

// Outer shell: maps data and returns early. No hooks so it's safe to render without a router.
function ProjectOverviewBlock({
  data,
  config,
  ctx,
}: {
  data: BlockData | null;
  config: z.infer<typeof overviewSchema>;
  ctx: RenderContext;
}) {
  if (!data) return <Empty>No project data for this overview.</Empty>;
  const mapped = mapBlockData(data);
  if (!mapped) return <Empty>No project summary available.</Empty>;
  return <ProjectOverviewInner mapped={mapped} config={config} ctx={ctx} />;
}

// Inner shell: calls useNavigate so it only runs when we have real data (and a router).
function ProjectOverviewInner({
  mapped,
  config,
  ctx,
}: {
  mapped: MappedPanel;
  config: z.infer<typeof overviewSchema>;
  ctx: RenderContext;
}) {
  const navigate = useNavigate();
  const { project, health, milestones, healthMonths, latestReport, riskBands, openRaid } = mapped;
  const asAt = ctx.asAt ?? todayIso();

  // In screen mode (live viewer, preview) offer navigation to the project page.
  // In print mode the buttons are hidden by [&_button]:print:hidden on the panel anyway.
  const handleNavigate =
    ctx.mode !== "print"
      ? (tab: string, sub?: string) =>
          void navigate({
            to: "/portfolio/projects/$projectCode",
            params: { projectCode: project.code },
            search: sub ? { tab, sub } : { tab },
          })
      : undefined;

  return (
    // print-overview-project: triggers the per-project print styles defined in styles.css
    // (page break before each project, project name as a print heading).
    <div className="print-overview-project">
      <ProjectOverviewPanel
        project={project}
        health={health}
        milestones={milestones}
        today={asAt}
        healthMonths={healthMonths}
        latestReport={latestReport}
        riskBands={riskBands}
        openRaid={openRaid}
        milestoneLimit={config.milestones_limit}
        {...(handleNavigate && { onNavigate: handleNavigate })}
      />
    </div>
  );
}

export const _project_overview = registerBlock<z.infer<typeof overviewSchema>, BlockData | null>({
  key: "project_overview",
  version: 1,
  name: "Project overview",
  category: "status",
  description:
    "Full project panel: summary, status, health history, milestones, top risks and last highlight report.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: overviewSchema,
  defaultConfig: { milestones_limit: 6, raid_limit: 5 },
  Renderer: ProjectOverviewBlock,
  partnerSafe: true,
  phase: 2,
});
