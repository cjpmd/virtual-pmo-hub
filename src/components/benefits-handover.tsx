import { formatDate, displayUnit } from "@/lib/format";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, PackageCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BenefitMeasure } from "@/data/types";
import { getHandoverCandidates } from "@/services/benefits-value";
import type { BenefitsData } from "@/services/benefits";
import { QueryState } from "@/components/query-state";
import { useBenefitMutations, useBenefits } from "@/hooks/use-benefits";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { todayIso } from "@/lib/today";
import { cn } from "@/lib/utils";

interface HandoverEntry { bauOwner: string; bauService: string; frequency: BenefitMeasure["frequency"]; nextReviewDate: string; postImplementationReviewDate: string; confirmed: boolean }
const frequencies: BenefitMeasure["frequency"][] = ["Monthly", "Quarterly", "Annually"];

interface WizardProps { project: { id: string; name: string }; close: () => void; onComplete: (count: number) => void }

/** Closing a project launches this wizard, one step per benefit (Prompt H3). Confirmed handovers are saved to benefit_handovers. */
export function BenefitsHandoverWizard(props: WizardProps) {
  const benefits = useBenefits();
  return <QueryState query={benefits}>{data => <Wizard {...props} data={data} />}</QueryState>;
}

function Wizard({ project, close, onComplete, data }: WizardProps & { data: BenefitsData }) {
  const benefits = getHandoverCandidates(data, project.id);
  const confirmerId = useMyResourceId();
  const { saveHandover } = useBenefitMutations();
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [entries, setEntries] = useState<Record<string, HandoverEntry>>(() => Object.fromEntries(benefits.map(benefit => [benefit.id, {
    bauOwner: benefit.handover?.bauOwner ?? benefit.owner,
    bauService: benefit.handover?.bauService ?? "",
    frequency: benefit.handover?.frequency ?? benefit.measures[0]?.frequency ?? "Quarterly",
    nextReviewDate: benefit.handover?.nextReviewDate ?? "",
    postImplementationReviewDate: benefit.handover?.postImplementationReviewDate ?? "",
    confirmed: Boolean(benefit.handover),
  }])));

  const benefit = benefits[step];
  const entry = benefit ? entries[benefit.id] : undefined;
  const confirmedCount = Object.values(entries).filter(item => item.confirmed).length;
  const update = (patch: Partial<HandoverEntry>) => { if (benefit) setEntries(current => ({ ...current, [benefit.id]: { ...(current[benefit.id] as HandoverEntry), ...patch } })) };

  return <>
    <button aria-label="Close benefits handover" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
    <aside role="dialog" aria-label="Benefits handover" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l bg-background shadow-xl">
      <header className="flex items-start justify-between gap-3 border-b p-6">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">Project closure</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Benefits handover</h2>
          <p className="mt-1 text-sm text-muted-foreground">{project.name} · {benefits.length} benefit{benefits.length === 1 ? "" : "s"} still being tracked. Each one needs a BAU owner before the project can close.</p>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="Close"><X /></Button>
      </header>

      <div className="flex gap-1.5 px-6 pt-4">{benefits.map((item, index) => <button key={item.id} onClick={() => setStep(index)} aria-label={`Go to ${item.reference}`} className={cn("h-1.5 flex-1 rounded-full", index === step ? "bg-primary" : entries[item.id]?.confirmed ? "bg-health-good" : "bg-muted")} />)}</div>

      <div className="flex-1 overflow-y-auto p-6">
        {!benefits.length && <div className="rounded-md border border-dashed p-10 text-center">
          <PackageCheck className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No benefits need handing over</p>
          <p className="mt-1 text-xs text-muted-foreground">This project has no benefits still in realisation.</p>
        </div>}

        {benefit && entry && <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Benefit {step + 1} of {benefits.length}</p>
          <h3 className="mt-1.5 font-display text-lg font-semibold">{benefit.reference} · {benefit.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{benefit.classification} · {benefit.category} · current owner {benefit.owner || "unassigned"}</p>

          <div className="mt-5 rounded-md border bg-muted/30 p-4 text-sm">
            <p className="text-xs font-semibold text-muted-foreground">Measures continuing after closure</p>
            {benefit.measures.map(measure => <p key={measure.id} className="mt-1.5">{measure.name} · {displayUnit(measure.unit)} · currently {measure.frequency.toLowerCase()} · next due {formatDate(measure.nextDue)}</p>)}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">BAU owner</span><Input list="handover-people" value={entry.bauOwner} onChange={event => update({ bauOwner: event.target.value })} placeholder="Who owns this in business as usual?" /><datalist id="handover-people">{data.people.map(person => <option key={person.id} value={person.name} />)}</datalist></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Receiving service</span><Input value={entry.bauService} onChange={event => update({ bauService: event.target.value })} placeholder="e.g. Service Desk" /></label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Measurement schedule</span>
              <select value={entry.frequency} onChange={event => update({ frequency: event.target.value as BenefitMeasure["frequency"] })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{frequencies.map(option => <option key={option}>{option}</option>)}</select>
            </label>
            <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Next review date</span><Input type="date" value={entry.nextReviewDate} onChange={event => update({ nextReviewDate: event.target.value })} /></label>
            <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-semibold text-muted-foreground">Post-implementation review date</span><Input type="date" value={entry.postImplementationReviewDate} onChange={event => update({ postImplementationReviewDate: event.target.value })} /></label>
          </div>

          <label className={cn("mt-5 flex items-start gap-2.5 rounded-md border p-3", entry.confirmed ? "border-health-good/40 bg-health-good/10" : "border-health-warn/40 bg-health-warn/10")}>
            <input type="checkbox" className="mt-0.5" checked={entry.confirmed} onChange={event => update({ confirmed: event.target.checked })} />
            <span className="text-sm"><strong>Handover confirmed</strong><span className="mt-0.5 block text-xs text-muted-foreground">{entry.bauOwner || "The BAU owner"} has accepted ownership, the measurement schedule and the review dates.</span></span>
          </label>

          <p className="mt-4 text-xs text-muted-foreground">Once confirmed, this benefit keeps appearing on Realisation and the Value Dashboard after the project closes.</p>
        </div>}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t p-4">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft />Previous</Button>
        <Button variant="outline" disabled={step >= benefits.length - 1} onClick={() => setStep(step + 1)}>Next<ArrowRight /></Button>
        <span className="ml-auto text-xs text-muted-foreground">{confirmedCount} of {benefits.length} confirmed</span>
        {error && <p role="alert" className="w-full text-xs text-health-bad-foreground">{error}</p>}
        <Button disabled={(benefits.length > 0 && confirmedCount < benefits.length) || saveHandover.isPending} onClick={async () => {
          setError("");
          const owners = new Map(data.people.map(person => [person.name, person.id]));
          const missing = benefits.find(item => !owners.has(entries[item.id]?.bauOwner ?? ""));
          if (missing) { setError(`${missing.reference}: choose a BAU owner from the people list.`); setStep(benefits.indexOf(missing)); return; }
          try {
            for (const item of benefits) {
              const value = entries[item.id];
              if (!value) continue;
              await saveHandover.mutateAsync({ benefitId: item.id, bauOwnerId: owners.get(value.bauOwner) ?? null, bauService: value.bauService, frequency: value.frequency, nextReviewDate: value.nextReviewDate || null, postImplementationReviewDate: value.postImplementationReviewDate || null, confirmedById: confirmerId, confirmedDate: todayIso(), lastSeen: item.handoverUpdatedAt });
            }
            onComplete(confirmedCount);
          } catch {
            // The failed save is reported by the mutation toast; stay open so nothing is lost.
          }
        }}><CheckCircle2 />Complete handover and close</Button>
      </footer>
    </aside>
  </>;
}
