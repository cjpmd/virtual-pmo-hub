import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/pmo-ui";
import { getLifecyclePhases, getTierDefinitions } from "@/services/pmo";
import type { LifecyclePhase, ProjectTier } from "@/data/types";
import { cn } from "@/lib/utils";

const title = "Admin · Lifecycle — Virtual PMO";
const description = "Configure the DTS project lifecycle phases, exit gate criteria and project tiers.";
export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: AdminPage,
});

const allTiers: ProjectTier[] = ["Small", "Medium", "Large"];

function AdminPage() {
  const [phases, setPhases] = useState<LifecyclePhase[]>(() => getLifecyclePhases().map(phase => ({ ...phase, criteria: phase.criteria.map(item => ({ ...item })) })));
  const [activeId, setActiveId] = useState(phases[0]?.id ?? "");
  const [newCriterion, setNewCriterion] = useState("");
  const tiers = getTierDefinitions();
  const active = phases.find(phase => phase.id === activeId) ?? phases[0];

  const updatePhase = (id: string, patch: Partial<LifecyclePhase>) => setPhases(current => current.map(phase => (phase.id === id ? { ...phase, ...patch } : phase)));
  const toggleTier = (criterionId: string, tier: ProjectTier) => {
    if (!active) return;
    updatePhase(active.id, { criteria: active.criteria.map(item => item.id !== criterionId ? item : { ...item, tiers: item.tiers.includes(tier) ? item.tiers.filter(value => value !== tier) : [...item.tiers, tier] }) });
  };
  const addCriterion = () => {
    if (!active || !newCriterion.trim()) return;
    updatePhase(active.id, { criteria: [...active.criteria, { id: `c-${Date.now()}`, label: newCriterion.trim(), tiers: [...allTiers] }] });
    setNewCriterion("");
  };
  const removeCriterion = (criterionId: string) => { if (active) updatePhase(active.id, { criteria: active.criteria.filter(item => item.id !== criterionId) }) };

  return <div className="space-y-8">
    <PageHeader eyebrow="Administration" title="Lifecycle" description="Define the phases every project moves through, the exit gate criteria for each phase, and how tiering changes what is required." />

    <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="font-display text-sm font-semibold">Phases</h2>
        <p className="mt-1 text-xs text-muted-foreground">Select a phase to edit its exit gate.</p>
        <ul className="mt-4 space-y-2">
          {phases.map((phase, index) => <li key={phase.id}>
            <button type="button" onClick={() => setActiveId(phase.id)} className={cn("flex w-full items-center gap-2 rounded-md border p-3 text-left transition-colors", phase.id === active?.id ? "border-primary bg-primary/5" : "hover:bg-accent/30")}>
              <GripVertical className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{phase.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{phase.criteria.length} gate criteria · step {index + 1}</span>
              </span>
            </button>
          </li>)}
        </ul>
      </div>

      {active && <div className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="text-xs font-semibold text-muted-foreground">Phase name</span><Input value={active.name} onChange={event => updatePhase(active.id, { name: event.target.value })} /></label>
          <label className="space-y-2"><span className="text-xs font-semibold text-muted-foreground">Exit gate</span><Input value={active.gateName} onChange={event => updatePhase(active.id, { gateName: event.target.value })} /></label>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{active.description}</p>

        <h3 className="mt-6 font-display text-sm font-semibold">Exit gate criteria</h3>
        <p className="mt-1 text-xs text-muted-foreground">Tick the tiers each criterion applies to. Small projects skip the heavier requirements.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-left font-semibold">Criterion</th>{allTiers.map(tier => <th key={tier} className="w-20 py-2 text-center font-semibold">{tier}</th>)}<th className="w-10" /></tr></thead>
            <tbody>
              {active.criteria.map(criterion => <tr key={criterion.id} className="border-b last:border-0">
                <td className="py-3 pr-4"><span className="block">{criterion.label}</span>{criterion.document && <span className="text-[11px] text-muted-foreground">Document: {criterion.document}</span>}</td>
                {allTiers.map(tier => <td key={tier} className="text-center"><input type="checkbox" aria-label={`${criterion.label} applies to ${tier}`} checked={criterion.tiers.includes(tier)} onChange={() => toggleTier(criterion.id, tier)} /></td>)}
                <td><Button variant="ghost" size="icon" aria-label="Remove criterion" onClick={() => removeCriterion(criterion.id)}><Trash2 className="size-4" /></Button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex gap-2">
          <Input value={newCriterion} onChange={event => setNewCriterion(event.target.value)} placeholder="Add a gate criterion…" />
          <Button onClick={addCriterion}><Plus />Add</Button>
        </div>
      </div>}
    </section>

    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold">Project tiers</h2>
      <p className="mt-1 text-xs text-muted-foreground">Tier decides which gate criteria and documents apply to a project.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {tiers.map(tier => <div key={tier.tier} className="rounded-md border p-4">
          <div className="flex items-center justify-between"><strong className="text-sm">{tier.tier}</strong><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{phases.reduce((total, phase) => total + phase.criteria.filter(item => item.tiers.includes(tier.tier)).length, 0)} criteria</span></div>
          <p className="mt-2 text-xs text-muted-foreground">{tier.guideline}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{tier.description}</p>
        </div>)}
      </div>
    </section>
  </div>;
}
