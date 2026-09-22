import { formatCompactCurrency } from "@/lib/format";
import { useState } from "react";
import { Calculator, Info, Percent } from "lucide-react";
import type { DraftBenefitProfile, OptimismBiasSetting } from "@/data/types";
import { getOptimismBias } from "@/data/settings";
import { appraise } from "@/services/benefits-value";
import { getStrategicObjectives } from "@/services/pmo";
import { cn } from "@/lib/utils";

const money = formatCompactCurrency;

/** Whole-life appraisal with a Green Book style optimism bias adjustment (Prompt H3). */
export function AppraisalPanel({ drafts, wholeLifeCost, years = 5, settings = getOptimismBias(), alignment, compact = false }: {
  drafts: DraftBenefitProfile[];
  wholeLifeCost: number;
  years?: number;
  settings?: OptimismBiasSetting[];
  alignment?: number;
  compact?: boolean;
}) {
  const [showAdjusted, setShowAdjusted] = useState(true);
  const result = appraise({ drafts, wholeLifeCost, years, settings });
  const objectives = getStrategicObjectives();

  return <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-display text-base font-semibold"><Calculator className="size-4 text-primary" />Appraisal</h3>
        <p className="mt-1 text-sm text-muted-foreground">Whole-life cost against whole-life benefit, shown raw and after the optimism bias adjustment for each benefit category.</p>
      </div>
      <button onClick={() => setShowAdjusted(value => !value)} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-accent/40">{showAdjusted ? "Emphasise raw figures" : "Emphasise adjusted figures"}</button>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Figure label="Whole-life cost" value={money(result.wholeLifeCost)} note={`${years} year appraisal period`} />
      <Figure label="Whole-life benefit" value={money(showAdjusted ? result.adjustedBenefit : result.rawBenefit)} note={showAdjusted ? `Raw ${money(result.rawBenefit)}` : `Adjusted ${money(result.adjustedBenefit)}`} emphasis />
      <Figure label="Benefit-cost ratio" value={`${(showAdjusted ? result.adjustedRatio : result.rawRatio).toFixed(2)} : 1`} note={showAdjusted ? `Raw ${result.rawRatio.toFixed(2)} : 1` : `Adjusted ${result.adjustedRatio.toFixed(2)} : 1`} emphasis tone={(showAdjusted ? result.adjustedRatio : result.rawRatio) >= 1 ? "good" : "warn"} />
      <Figure label="Payback period" value={(showAdjusted ? result.adjustedPaybackYears : result.rawPaybackYears) === undefined ? "No cash benefit" : `${(showAdjusted ? result.adjustedPaybackYears : result.rawPaybackYears)?.toFixed(1)} years`} note={showAdjusted ? (result.rawPaybackYears === undefined ? "—" : `Raw ${result.rawPaybackYears.toFixed(1)} years`) : (result.adjustedPaybackYears === undefined ? "—" : `Adjusted ${result.adjustedPaybackYears.toFixed(1)} years`)} />
    </div>

    {!compact && <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-10 px-3 font-semibold">Draft benefit profile</th><th className="px-3 font-semibold">Classification</th><th className="px-3 font-semibold">Measure</th><th className="px-3 font-semibold">Baseline → target</th><th className="px-3 font-semibold">Raw</th><th className="px-3 font-semibold">Bias</th><th className="px-3 font-semibold">Adjusted</th></tr></thead>
        <tbody>
          {result.lines.map(line => <tr key={line.draft.id} className="border-t">
            <td className="px-3 py-2.5">
              <p className="font-medium">{line.draft.title}</p>
              <p className="text-xs text-muted-foreground">{line.draft.owner} · {objectives.find(objective => objective.id === line.draft.strategicObjectiveId)?.title ?? "No objective"}</p>
            </td>
            <td className="px-3 py-2.5 text-xs">{line.draft.classification}<br /><span className="text-muted-foreground">{line.draft.category}</span></td>
            <td className="px-3 py-2.5 text-xs">{line.draft.measure}</td>
            <td className="px-3 py-2.5 text-xs">{line.draft.baseline} → {line.draft.target}</td>
            <td className="px-3 py-2.5">{money(line.raw)}</td>
            <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold"><Percent className="size-3" />{line.bias}</span></td>
            <td className="px-3 py-2.5 font-semibold">{money(line.adjusted)}</td>
          </tr>)}
          {!result.lines.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">No draft benefit profiles have been entered yet. Benefits are captured as profiles, not a single number.</td></tr>}
        </tbody>
      </table>
    </div>}

    {alignment !== undefined && <div className="mt-4 rounded-md border bg-muted/30 p-4">
      <p className="text-sm font-semibold">Prioritisation score</p>
      <p className="mt-1 text-xs text-muted-foreground">Adjusted value for money (60%) and strategic alignment (40%).</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Figure label="Value score" value={String(Math.max(0, Math.min(100, Math.round((result.adjustedRatio / 3) * 100))))} note="Adjusted benefit-cost ratio, capped at 3:1" />
        <Figure label="Strategic alignment" value={String(alignment)} note="Scored against portfolio objectives" />
        <Figure label="Priority score" value={String(Math.round(Math.max(0, Math.min(100, Math.round((result.adjustedRatio / 3) * 100))) * 0.6 + alignment * 0.4))} note="Used to rank the request pipeline" emphasis />
      </div>
    </div>}

    <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />Optimism bias defaults are set in Admin → Appraisal: {settings.filter(setting => ["Efficiency", "Income", "Student experience"].includes(setting.category)).map(setting => `${setting.category} ${setting.percentage}%`).join(", ")}.</p>
  </section>;
}

function Figure({ label, value, note, emphasis = false, tone }: { label: string; value: string; note: string; emphasis?: boolean; tone?: "good" | "warn" }) {
  return <div className={cn("rounded-md border p-4", emphasis && "border-primary/35 bg-primary/5", tone === "good" && "border-health-good/40 bg-health-good/5", tone === "warn" && "border-health-warn/45 bg-health-warn/5")}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1.5 font-display text-xl font-semibold">{value}</p>
    <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
  </div>;
}
