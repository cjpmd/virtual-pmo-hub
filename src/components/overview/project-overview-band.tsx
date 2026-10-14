import { useMemo } from "react";
import { StatusBarSlot, TopBand } from "@/components/shell-slots";
import { ProgressChart } from "@/components/overview/progress-chart";
import { SignalsList } from "@/components/overview/signals-list";
import { StatusBar } from "@/components/overview/status-bar";
import { SummaryStrip } from "@/components/overview/summary-strip";
import { useProjectOverview } from "@/hooks/use-project-overview";
import { useFormat } from "@/lib/format";
import { dataAsOf, getProjectSummaryMetrics } from "@/services/overview";
import { buildProjectSignals } from "@/services/overview-panels";
import { addMonths, buildProgressChart } from "@/services/progress-chart";
import type { ProjectSummary } from "@/services/hierarchy";
import { useSettings } from "@/services/settings";

const monthName = (month: string) =>
  new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });

/**
 * The project overview's second dark band (project overview design, Stage 3): summary strip,
 * progress chart and assurance signals, plus the status bar. One RPC (get_project_overview)
 * feeds the shared builders and components with scope = "project".
 */
export function ProjectOverviewBand({
  project,
  gateChecklist,
}: {
  project: Pick<ProjectSummary, "id">;
  /** The current phase's gate checklist (Plan › Gates), for the next-gate signal. */
  gateChecklist?: { passed: number; total: number } | undefined;
}) {
  const query = useProjectOverview(project.id);
  const settings = useSettings();
  const format = useFormat();
  const data = query.data;
  const gatePassed = gateChecklist?.passed,
    gateTotal = gateChecklist?.total;

  const built = useMemo(() => {
    if (!data) return null;
    const { today, health, financials } = data;
    const closed = data.project.state === "closed";
    const budget = financials?.budget ?? 0;
    const metrics = getProjectSummaryMetrics({
      financials,
      forecastHistory: data.forecastHistory,
      milestones: data.milestones,
      risks: data.inputs.risks,
      redRiskMinScore: data.redRiskMinScore,
      forecastFinish: health?.forecastFinishDate ?? null,
      finishVsBaselineDays: health?.finishVsBaselineDays ?? null,
      today,
    });
    const progress = buildProgressChart({
      inputs: data.inputs,
      milestones: data.milestones,
      history: [],
      projectHistory: data.projectHistory,
      liveGreen: 0,
      programmeIds: null,
      today,
      fyStartMonth: settings.regional.financialYearStartMonth,
      range: "all",
      redRiskMinScore: data.redRiskMinScore,
      project: {
        startDate: data.project.startDate,
        baselineFinishDate: data.project.baselineFinishDate,
        forecastFinishDate: health?.forecastFinishDate ?? null,
        budget,
        actualsThrough: (financials?.actualsThrough ?? data.cutoffMonth)?.slice(0, 7) ?? null,
        closed,
      },
    });
    // Spend and plan at the last closed month, read from the chart so both show one number.
    const closedPoint = progress.points.find(
      (point) => point.month === (financials?.actualsThrough ?? data.cutoffMonth)?.slice(0, 7),
    );
    const nextGate = data.milestones
      .filter((m) => m.type === "gate" && !m.actualDate && m.forecastDate >= today)
      .sort((a, b) => a.forecastDate.localeCompare(b.forecastDate))
      .map((m) => ({ title: m.title, date: m.forecastDate }))[0];
    const signals = buildProjectSignals({
      code: data.project.code,
      today,
      closed,
      health,
      openRaid: data.openRaid,
      redRiskMinScore: data.redRiskMinScore,
      spendVsPlan:
        closedPoint?.values.spend !== undefined && closedPoint.values.plan !== undefined
          ? {
              month: monthName(closedPoint.month),
              spend: closedPoint.values.spend,
              plan: closedPoint.values.plan,
            }
          : undefined,
      milestonesBaselinedByNow: data.milestones.filter((m) => m.baselineDate <= today).length,
      milestonesDelivered: data.milestones.filter((m) => m.actualDate).length,
      nextGate:
        nextGate && gatePassed !== undefined && gateTotal !== undefined
          ? { ...nextGate, passed: gatePassed, total: gateTotal }
          : undefined,
      date: (iso) => format.date(iso),
    });
    const closedMonth = data.cutoffMonth?.slice(0, 7) ?? null;
    const asOf = dataAsOf([
      data.project.updatedAt,
      data.latestReport?.submittedAt,
      ...data.milestones.map((m) => m.updatedAt),
      ...data.openRaid.map((item) => item.updatedAt),
    ]);
    return {
      metrics,
      progress,
      signals,
      asOf,
      closedMonth: closedMonth ? monthName(closedMonth) : null,
      openMonth: monthName(closedMonth ? addMonths(closedMonth, 1) : today.slice(0, 7)),
    };
  }, [data, settings.regional.financialYearStartMonth, format, gatePassed, gateTotal]);

  if (query.isSuccess && !data) return null;
  return (
    <>
      <TopBand>
        <section aria-label="Project summary" className="border-t border-pmo-line bg-pmo-panel">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
            {built ? (
              <SummaryStrip scope="project" metrics={built.metrics} className="border-t-0" />
            ) : (
              <div
                aria-busy
                aria-label="Loading the summary"
                className="h-[78px] animate-pulse border-b border-pmo-line bg-pmo-panel-2/40"
              />
            )}
            <div className="flex flex-col min-[1100px]:flex-row">
              <div className="min-w-0 flex-1 [&>section]:px-0 sm:[&>section]:px-0">
                {built ? (
                  <ProgressChart scope="project" data={built.progress} />
                ) : (
                  <div
                    aria-busy
                    aria-label="Loading the progress chart"
                    className="my-5 h-[330px] animate-pulse rounded-md bg-pmo-panel-2/40"
                  />
                )}
              </div>
              <div className="border-t border-pmo-line min-[1100px]:ml-6 min-[1100px]:w-[320px] min-[1100px]:shrink-0 min-[1100px]:border-t-0 [&>section]:px-0 sm:[&>section]:px-0">
                {built ? (
                  <SignalsList scope="project" signals={built.signals} />
                ) : (
                  <div
                    aria-busy
                    aria-label="Loading the signals"
                    className="my-4 h-[220px] animate-pulse rounded-md bg-pmo-panel-2/40"
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      </TopBand>
      {built && (
        <StatusBarSlot>
          <StatusBar
            scope="project"
            asOf={built.asOf}
            closedMonth={built.closedMonth}
            openMonth={built.openMonth}
          />
        </StatusBarSlot>
      )}
    </>
  );
}
