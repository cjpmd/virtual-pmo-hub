import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { useBenefits } from "@/hooks/use-benefits";
import { benefitsForProject } from "@/services/benefits-value";
import { getGateChecklist, phaseByName } from "@/services/gates";
import type { ProjectSummary } from "@/services/hierarchy";
import { cn } from "@/lib/utils";

/** Gate criteria for the project's current phase with pass/fail indicators (Prompt H3). */
export function GateChecklist({ project, lessonsReviewed, phaseReviewHeld, manualTicks, onToggleManual }: {
  project: ProjectSummary;
  lessonsReviewed: boolean;
  phaseReviewHeld: boolean;
  manualTicks: string[];
  onToggleManual: (id: string) => void;
}) {
  const benefits = useBenefits().data;
  const phase = phaseByName(project.phaseName);
  const items = getGateChecklist({ phaseName: project.phaseName, tier: project.tier, benefits: benefits ? benefitsForProject(benefits, project.id) : [], lessonsReviewed, phaseReviewHeld });
  const resolved = items.map(item => ({ ...item, passed: item.status === "Pass" || (item.status === "Manual" && manualTicks.includes(item.criterion.id)) }));
  const passed = resolved.filter(item => item.passed).length;

  return <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold">{phase?.gateName ?? "Exit gate"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Criteria that apply to a {project.tier.toLowerCase()} project at this phase. Benefit and lessons criteria are evaluated automatically.</p>
      </div>
      <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", passed === resolved.length ? "bg-health-good/20 text-health-good-foreground" : "bg-health-warn/25 text-health-warn-foreground")}>{passed} of {resolved.length} met</span>
    </div>
    <ul className="mt-4 divide-y">
      {resolved.map(item => <li key={item.criterion.id} className="flex items-start gap-3 py-3">
        {item.status === "Manual"
          ? <input type="checkbox" className="mt-1" checked={manualTicks.includes(item.criterion.id)} onChange={() => onToggleManual(item.criterion.id)} aria-label={item.criterion.label} />
          : item.passed ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-health-good-foreground" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-health-bad-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm">{item.criterion.label}</p>
          <p className={cn("mt-0.5 text-xs", item.status === "Fail" ? "text-health-bad-foreground" : "text-muted-foreground")}>{item.detail}</p>
          {item.criterion.document && <p className="mt-0.5 text-[11px] text-muted-foreground">Document: {item.criterion.document}</p>}
        </div>
        <span className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase", item.status === "Pass" ? "bg-health-good/20 text-health-good-foreground" : item.status === "Fail" ? "bg-health-bad/20 text-health-bad-foreground" : item.passed ? "bg-health-good/20 text-health-good-foreground" : "bg-muted text-muted-foreground")}>
          {item.status === "Manual" ? (item.passed ? "Confirmed" : "Manual") : item.status}
        </span>
      </li>)}
      {!resolved.length && <li className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><CircleDashed className="size-4" />No criteria configured for this phase and tier.</li>}
    </ul>
  </section>;
}
