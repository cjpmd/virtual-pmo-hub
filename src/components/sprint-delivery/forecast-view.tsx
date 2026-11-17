import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ChartCard } from "@/components/charts/chart-card";
import { DeliveryChip, HowCalculated, RagPill } from "@/components/evidence-ui";
import { cn } from "@/lib/utils";
import { basisLabels, getProjectForecast, type VelocityBasis } from "@/services/forecast";
import {
  activeSprint,
  forecastInputFor,
  getDelivery,
  toDate,
  unitLabel,
  useDeliveryVersion,
  type ProjectDelivery,
} from "@/services/sprints";
import { fmt } from "./shared";
import { sprintDaily } from "./report-data";
import { BurnUpChart, burnLegend } from "./burn-up-chart";

/** Kept for the sprints phase; not rendered (see NoSprintData). */
export function SprintForecastPanel({
  projectId,
  compact,
}: {
  projectId: string;
  compact?: boolean;
}) {
  useDeliveryVersion();
  const d = getDelivery(projectId);
  const f = getProjectForecast(forecastInputFor(d));
  const u = unitLabel(d);
  if (f.deliveryStatus === "insufficient_evidence")
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-5 text-sm">
        <p className="font-semibold">Evidence-based forecast</p>
        <p className="mt-1 text-muted-foreground">{f.explanation}</p>
      </div>
    );
  return (
    <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Evidence-based forecast</h3>
        <div className="flex gap-1.5">
          <DeliveryChip status={f.deliveryStatus} />
          <RagPill rag={f.evidencedRag} prefix="Evidenced" />
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{f.explanation}</p>
      <dl className={cn("mt-4 grid gap-4", compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
        <Metric
          label="Gap to plan"
          value={`${f.gapUnits > 0 ? f.gapUnits : 0} ${u}`}
          detail={f.gapUnits > 0 ? "behind baseline" : `${Math.abs(f.gapUnits)} ahead`}
          how={
            <>
              Planned so far ({f.plannedNow}) minus done so far ({f.doneNow}). The plan is a
              straight line from baseline scope {d.settings.baselineScope} over{" "}
              {d.settings.baselinePeriods} periods.
            </>
          }
        />
        <Metric
          label="Recovery date"
          value={f.gapUnits <= 0 ? "Not needed" : fmt(f.recoveryDate)}
          detail={
            f.gapUnits > 0 && !f.recoveryDate
              ? "No recovery before baseline end"
              : "When done catches the plan"
          }
          how={
            <>
              Adds {f.velocity} per period ({basisLabels[f.basis].toLowerCase()}) to work done and
              finds the first period end where done reaches the baseline plan. Blank if that is
              after the baseline end ({fmt(f.baselineEndDate)}).
            </>
          }
        />
        <Metric
          label="Forecast finish"
          value={f.converging ? fmt(f.forecastFinishDate) : "Not converging"}
          detail={
            f.daysVsBaseline === null
              ? "Scope grows faster than delivery"
              : f.daysVsBaseline > 0
                ? `${f.daysVsBaseline} days late`
                : `${Math.abs(f.daysVsBaseline)} days early`
          }
          how={
            <>
              Each period, scope grows by {f.scopeGrowth} (average of the last 3) and done grows by{" "}
              {f.velocity}. The finish is the first period where done reaches scope. Range:{" "}
              {fmt(f.range.best)} (best) to {fmt(f.range.worst)} (worst).
            </>
          }
        />
        <Metric
          label="Required velocity"
          value={f.requiredVelocity === null ? "—" : `${f.requiredVelocity} ${u}`}
          detail={<span className="capitalize">{f.plausibility}</span>}
          how={
            <>
              (Scope {f.scopeNow} − done {f.doneNow}) ÷ periods left before baseline end, plus scope
              growth {f.scopeGrowth}. Realistic if at or below the best of the last 6 (
              {f.velocities.best}); stretch if within 25% of it.
            </>
          }
        />
      </dl>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  how,
}: {
  label: string;
  value: string;
  detail: React.ReactNode;
  how: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <HowCalculated title={label}>{how}</HowCalculated>
      </dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function ForecastView({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const input = forecastInputFor(d);
  const [basis, setBasis] = useState<VelocityBasis>("rolling3");
  const base = getProjectForecast(input, basis);
  const [v, setV] = useState<number | null>(null);
  const [g, setG] = useState<number | null>(null);
  const f = getProjectForecast(input, basis, {
    velocity: v ?? undefined,
    scopeGrowth: g ?? undefined,
  });
  const sprint = activeSprint(d);
  const burn = sprint ? sprintDaily(d, sprint) : null;
  return (
    <div className="space-y-6">
      <SprintForecastPanel projectId={projectId} />
      <ChartCard
        title="Burn-up with forecast"
        subtitle={`${basisLabels[basis]} · diamond marks the recovery point`}
        legend={burnLegend}
        controls={
          <div className="flex flex-wrap gap-1">
            {(["last", "rolling3", "plan"] as VelocityBasis[]).map((b) => (
              <button
                key={b}
                onClick={() => {
                  setBasis(b);
                  setV(null);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  basis === b
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {basisLabels[b]}
              </button>
            ))}
          </div>
        }
        empty={
          input.completed.length < 3
            ? { title: "Not enough evidence", detail: "Close 3 sprints to unlock forecasting." }
            : undefined
        }
      >
        <BurnUpChart d={d} f={f} height={340} />
      </ChartCard>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5 rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <div>
            <h3 className="font-semibold">What if?</h3>
            <p className="text-sm text-muted-foreground">
              Try a different velocity or scope growth. This only previews the result; nothing is
              saved.
            </p>
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <Label>Velocity per period</Label>
              <span className="font-medium">{f.velocity}</span>
            </div>
            <Slider
              className="mt-2"
              min={0}
              max={Math.max(80, Math.ceil(base.velocities.best * 2))}
              step={1}
              value={[f.velocity]}
              onValueChange={([x]) => setV(x ?? 0)}
            />
          </div>
          <div>
            <div className="flex justify-between text-sm">
              <Label>Scope growth per period</Label>
              <span className="font-medium">{f.scopeGrowth}</span>
            </div>
            <Slider
              className="mt-2"
              min={-10}
              max={30}
              step={1}
              value={[f.scopeGrowth]}
              onValueChange={([x]) => setG(x ?? 0)}
            />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Recovery</dt>
              <dd className="font-semibold">
                {f.gapUnits <= 0 ? "Not needed" : fmt(f.recoveryDate)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Finish</dt>
              <dd className="font-semibold">
                {f.converging ? fmt(f.forecastFinishDate) : "Not converging"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <DeliveryChip status={f.deliveryStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Evidenced RAG</dt>
              <dd>
                <RagPill rag={f.evidencedRag} />
              </dd>
            </div>
          </dl>
          {(v !== null || g !== null) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setV(null);
                setG(null);
              }}
            >
              Reset to evidence
            </Button>
          )}
        </div>
        <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold">
            <CalendarRange className="size-4" />
            Sprint dashboard
          </h3>
          {burn && sprint ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <strong>{sprint.name}</strong> · ends {fmt(toDate(sprint.end))}
              </p>
              <RagPill
                rag={burn.forecast.willLand ? "Green" : "Red"}
                label={burn.forecast.willLand ? "This sprint will land" : "This sprint won't land"}
              />
              <p className="text-muted-foreground">
                {burn.committed} committed, {burn.remaining} left, {burn.forecast.daysLeft} days to
                go, completing about {burn.forecast.rate} a day recently.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No active sprint.</p>
          )}
        </div>
      </div>
    </div>
  );
}
