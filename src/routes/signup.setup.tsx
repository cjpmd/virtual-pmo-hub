import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Database, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWorkspace } from "@/services/integrations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup/setup")({
  validateSearch: (s: Record<string, unknown>) => ({ email: typeof s["email"] === "string" ? s["email"] : "chris.mcdonald@dundee.ac.uk" }),
  head: () => ({ meta: [
    { title: "Set up your workspace — Virtual PMO" },
    { name: "description", content: "Choose your region, currency, financial year and lifecycle to finish setting up Virtual PMO." },
    { property: "og:title", content: "Set up your workspace — Virtual PMO" },
    { property: "og:description", content: "A five-minute setup wizard with sensible defaults." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SetupPage,
});

const orgFromDomain = (d: string) => { const base = d.split(".")[0] ?? ""; const name = base.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()); return d.endsWith(".ac.uk") ? `University of ${name}` : name; };
const lifecycles = [
  { id: "University IT six-phase", note: "Pre-project, feasibility, design, build, deploy, close" },
  { id: "PRINCE2-style", note: "Start up, initiate, stages, close" },
  { id: "Agile", note: "Discovery, alpha, beta, live" },
  { id: "Custom", note: "Start blank and build your own" },
];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function SetupPage() {
  const { email } = Route.useSearch();
  const navigate = useNavigate();
  const domain = email.split("@")[1] ?? "dundee.ac.uk";
  const [step, setStep] = useState(0);
  const [ws, setWs] = useState({ orgName: orgFromDomain(domain), domain, region: "UK" as "UK" | "EU", currency: "GBP (£)", fyStartMonth: "August", lifecycle: "University IT six-phase", createdBy: email });
  const steps = ["Organisation", "Region and money", "Lifecycle", "Get started"];
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  const finish = (to: "/portfolio" | "/connect-microsoft") => { saveWorkspace(ws); navigate({ to }); };

  return <div className="grid min-h-screen place-items-center bg-muted/40 p-6">
    <div className="w-full max-w-2xl rounded-xl border border-border/70 bg-card p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Set up your workspace · about 5 minutes</p>
      <ol className="mt-4 flex flex-wrap gap-2 text-xs">{steps.map((s, i) => <li key={s} className={cn("flex items-center gap-1 rounded-full border px-3 py-1", i === step ? "border-primary bg-primary/10 text-primary" : i < step ? "text-health-good-foreground" : "text-muted-foreground")}>{i < step && <Check className="size-3" />}{s}</li>)}</ol>

      <div className="mt-6 min-h-56 space-y-4">
        {step === 0 && <>
          <h1 className="text-2xl font-semibold">We found your organisation</h1>
          <p className="text-sm text-muted-foreground">Taken from your Microsoft account. Change it if it doesn't look right.</p>
          <label className="block text-sm">Organisation name<Input className="mt-1" value={ws.orgName} onChange={e => setWs({ ...ws, orgName: e.target.value })} /></label>
          <label className="block text-sm">Domain<Input className="mt-1" value={ws.domain} disabled /></label>
        </>}
        {step === 1 && <>
          <h1 className="text-2xl font-semibold">Region and money</h1>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">Data stored in<select className={cn(sel, "mt-1")} value={ws.region} onChange={e => setWs({ ...ws, region: e.target.value as "UK" | "EU" })}><option>UK</option><option>EU</option></select></label>
            <label className="text-sm">Currency<select className={cn(sel, "mt-1")} value={ws.currency} onChange={e => setWs({ ...ws, currency: e.target.value })}><option>GBP (£)</option><option>EUR (€)</option></select></label>
            <label className="text-sm">Financial year starts<select className={cn(sel, "mt-1")} value={ws.fyStartMonth} onChange={e => setWs({ ...ws, fyStartMonth: e.target.value })}>{months.map(m => <option key={m}>{m}</option>)}</select></label>
          </div>
        </>}
        {step === 2 && <>
          <h1 className="text-2xl font-semibold">Pick a lifecycle to start from</h1>
          <p className="text-sm text-muted-foreground">You can change phases and gates later in Settings.</p>
          <div className="grid gap-3 sm:grid-cols-2">{lifecycles.map(l => <button key={l.id} onClick={() => setWs({ ...ws, lifecycle: l.id })} className={cn("rounded-lg border p-4 text-left", ws.lifecycle === l.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}><p className="font-semibold">{l.id}</p><p className="mt-1 text-xs text-muted-foreground">{l.note}</p></button>)}</div>
        </>}
        {step === 3 && <>
          <h1 className="text-2xl font-semibold">{ws.orgName} is ready</h1>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => finish("/portfolio")} className="rounded-lg border p-5 text-left hover:bg-muted/50"><Database className="size-5 text-primary" /><p className="mt-2 font-semibold">Explore with sample data</p><p className="mt-1 text-xs text-muted-foreground">Look around a full demo portfolio before involving IT.</p></button>
            <button onClick={() => finish("/connect-microsoft")} className="rounded-lg border p-5 text-left hover:bg-muted/50"><Plug className="size-5 text-primary" /><p className="mt-2 font-semibold">Connect Microsoft 365</p><p className="mt-1 text-xs text-muted-foreground">Bring in your Planner plans and people directory.</p></button>
          </div>
        </>}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>Back</Button>
        {step < 3 && <Button onClick={() => setStep(s => s + 1)}>Continue</Button>}
      </div>
    </div>
  </div>;
}
