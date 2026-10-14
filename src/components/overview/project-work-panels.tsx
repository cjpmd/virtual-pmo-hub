import type { ReactNode } from "react";
import { HealthMark } from "@/components/overview/project-watchlist";
import { Button } from "@/components/ui/button";
import type { Health } from "@/data/types";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  HealthDimension,
  LatestReport,
  ProjectOverviewHealth,
} from "@/services/project-overview";
import type { RankedRaid, ScheduleStats } from "@/services/project-schedule";

// Panels for the project overview's light working area (project overview design, Stage 4).
// Everything shown is read as recorded; the figures come from services/project-schedule.ts.

const WORD: Record<Health, string> = {
  "On Track": "green",
  "At Risk": "amber",
  "Off Track": "red",
  "Not Set": "not set",
};
const TAG: Record<Health, string> = {
  "On Track": "bg-health-good/15 text-health-good-foreground border-health-good/25",
  "At Risk": "bg-health-warn/18 text-health-warn-foreground border-health-warn/30",
  "Off Track": "bg-health-bad/15 text-health-bad-foreground border-health-bad/25",
  "Not Set": "bg-muted text-muted-foreground border-border",
};

/** A RAG tag that always carries its word ("Declared amber"), never colour alone. */
function RagTag({ health, children }: { health: Health; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TAG[health],
      )}
    >
      {children}
    </span>
  );
}

function Panel({
  title,
  lede,
  tags,
  children,
  className,
}: {
  title: string;
  lede?: ReactNode;
  tags?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border/70 bg-card p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-card-foreground">{title}</h3>
          {lede ? <p className="mt-0.5 text-xs text-muted-foreground">{lede}</p> : null}
        </div>
        {tags ? <div className="flex flex-wrap gap-1.5">{tags}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-geist-mono text-xl font-medium tabular-nums">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

const days = (n: number) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;

/** Replaces the sprint forecast card: the schedule as the milestone forecasts show it. */
export function ScheduleForecastCard({
  health,
  stats,
  closed,
}: {
  health: ProjectOverviewHealth | null;
  stats: ScheduleStats;
  closed: boolean;
}) {
  const format = useFormat();
  const slip = health?.finishVsBaselineDays ?? null;
  const tolerance =
    slip === null || slip <= 0
      ? null
      : health?.finishSlipHealth === "Off Track"
        ? "beyond tolerance"
        : "within tolerance";
  const basis =
    health?.forecastBasis === "declared"
      ? "Based on the declared finish date, which is later than the milestone forecasts"
      : "Based on milestone forecasts";
  return (
    <Panel
      title="Schedule forecast"
      lede={closed ? `${basis}. Final values: the project is closed.` : `${basis}.`}
      tags={
        health ? (
          <>
            <RagTag health={health.schedule}>Schedule {WORD[health.schedule]}</RagTag>
            {tolerance ? (
              <RagTag health={health.finishSlipHealth ?? "Not Set"}>Finish {tolerance}</RagTag>
            ) : null}
          </>
        ) : null
      }
    >
      <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Figure
          label="Forecast finish"
          value={health?.forecastFinishDate ? format.date(health.forecastFinishDate) : "—"}
          note={
            slip === null
              ? undefined
              : slip === 0
                ? "on baseline"
                : `${days(Math.abs(slip))} ${slip > 0 ? "late" : "early"}`
          }
        />
        <Figure
          label="Slip vs baseline finish"
          value={
            slip === null ? "—" : slip > 0 ? `+${days(slip)}` : slip === 0 ? "None" : days(slip)
          }
          note={tolerance ?? (slip !== null && slip < 0 ? "ahead of baseline" : undefined)}
        />
        <Figure
          label="Hit baseline"
          value={stats.hitBaseline === null ? "—" : `${stats.hitBaseline}%`}
          note={
            stats.delivered
              ? `${stats.onTime} of ${stats.delivered} delivered on time`
              : "nothing delivered yet"
          }
        />
        <Figure
          label="Overdue"
          value={String(stats.overdue)}
          note={
            stats.overdue === 1 ? "milestone past its forecast" : "milestones past their forecast"
          }
        />
      </dl>
    </Panel>
  );
}

/** Lines of a free-text field as a list ("- item" or one per line), else a paragraph. */
function Text({ value }: { value: string | null }) {
  const lines = (value ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-•*]\s+)/, "").trim())
    .filter(Boolean);
  if (!lines.length) return <p className="text-sm text-muted-foreground">Nothing recorded.</p>;
  if (lines.length === 1) return <p className="text-sm">{lines[0]}</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-sm">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

const DIMENSION_ROWS: Array<[HealthDimension, string]> = [
  ["schedule", "Schedule"],
  ["financial", "Financial"],
  ["effort", "Effort"],
  ["issue", "Issues and risks"],
  ["benefit", "Benefits"],
  ["overall", "Overall"],
];

/** Last submitted highlight (status) report: what the project said, against the evidence then. */
export function HighlightReport({
  report,
  nextDue,
  onOpen,
  onStart,
}: {
  report: LatestReport | null;
  nextDue: string | null;
  onOpen: () => void;
  onStart: () => void;
}) {
  const format = useFormat();
  if (!report)
    return (
      <Panel title="Last highlight report">
        <div className="mt-6 flex flex-col items-start gap-2">
          <p className="text-sm font-medium">No highlight report yet</p>
          <p className="text-sm text-muted-foreground">
            {nextDue ? `The first report is due ${format.date(nextDue)}.` : "Nothing submitted."}
          </p>
          <Button size="sm" onClick={onStart}>
            Start report
          </Button>
        </div>
      </Panel>
    );
  const meta =
    `Reporting date ${format.date(report.reportingDate)}, submitted` +
    (report.author ? ` by ${report.author}` : "") +
    (report.submittedAt ? ` on ${format.date(report.submittedAt)}` : "") +
    "." +
    (nextDue ? ` Next due ${format.date(nextDue)}.` : "");
  return (
    <Panel
      title="Last highlight report"
      lede={meta}
      tags={
        <>
          <RagTag health={report.declared.overall}>Declared {WORD[report.declared.overall]}</RagTag>
          <RagTag health={report.evidenced.overall}>
            Evidenced {WORD[report.evidenced.overall]} at the time
          </RagTag>
        </>
      }
    >
      <div className="mt-2 grid gap-x-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <h4 className="mb-1 mt-3 text-[13px] font-semibold">Summary</h4>
          <Text value={report.comments} />
          <h4 className="mb-1 mt-3 text-[13px] font-semibold">Done this period</h4>
          <Text value={report.accomplished} />
          <h4 className="mb-1 mt-3 text-[13px] font-semibold">Planned next period</h4>
          <Text value={report.planned} />
        </div>
        <div>
          <h4 className="mb-1 mt-3 text-[13px] font-semibold">Decisions needed</h4>
          <Text value={report.decisionsNeeded} />
          <h4 className="mb-1 mt-3 text-[13px] font-semibold">Declared in this report</h4>
          <table className="w-full text-sm">
            <caption className="sr-only">
              Declared health against the evidence when the report was submitted
            </caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Dimension</th>
                <th scope="col">Declared</th>
                <th scope="col">Evidence at submission</th>
              </tr>
            </thead>
            <tbody>
              {DIMENSION_ROWS.map(([key, label]) => {
                const declared = report.declared[key],
                  evidenced = report.evidenced[key];
                return (
                  <tr
                    key={key}
                    className={cn(
                      "border-t border-border/60",
                      key === "overall" && "font-semibold",
                    )}
                  >
                    <th scope="row" className="py-1.5 text-left font-medium text-muted-foreground">
                      {label}
                    </th>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <HealthMark health={declared} shape="ring" />
                        {WORD[declared].replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-xs text-muted-foreground">
                      evidence{" "}
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <HealthMark health={evidenced} shape="dot" />
                        {WORD[evidenced].replace(/^./, (c) => c.toUpperCase())}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Button
        variant="link"
        size="sm"
        className="mt-3 h-auto self-start p-0 text-pmo-accent"
        onClick={onOpen}
      >
        Open full report
      </Button>
    </Panel>
  );
}

const LEVEL_HEALTH = { red: "Off Track", amber: "At Risk", green: "On Track" } as const;

/** The three most severe open risks and issues, then the longest since last updated. */
export function TopRisks({ items, onOpen }: { items: RankedRaid[]; onOpen: () => void }) {
  return (
    <Panel title="Top risks and issues" lede="Most severe first, then longest since last updated">
      {items.length ? (
        <ul className="mt-3 divide-y divide-border/60">
          {items.map(({ item, level, word, daysSinceUpdate }) => (
            <li key={item.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-2.5 py-2.5">
              <span className="mt-1">
                <HealthMark health={LEVEL_HEALTH[level]} shape="dot" />
              </span>
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">
                  {item.ref ? `${item.ref} ` : ""}
                  {item.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {word} · updated{" "}
                  {daysSinceUpdate === 0 ? "today" : `${days(daysSinceUpdate)} ago`}
                </span>
              </span>
              <span className="font-geist-mono text-xs text-muted-foreground">
                {item.kind === "risk" ? "Risk" : "Issue"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No open risks or issues.</p>
      )}
      <Button
        variant="link"
        size="sm"
        className="mt-3 h-auto self-start p-0 text-pmo-accent"
        onClick={onOpen}
      >
        Open RAID log
      </Button>
    </Panel>
  );
}
