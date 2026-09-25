import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Mail, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { requiredPermissions } from "@/data/integrations";
import { discoverPlans, linkPlan, requestAdminConsent, startConsent, useIntegrations } from "@/services/integrations";
import { getProjects } from "@/services/pmo";
import { cn } from "@/lib/utils";

export function PermissionList() {
  return <ul className="divide-y rounded-md border">{requiredPermissions.map(p => <li key={p.name} className="flex flex-wrap items-start gap-3 p-3 text-sm">
    <ShieldCheck className="mt-0.5 size-4 text-primary" />
    <div className="min-w-0 flex-1"><p className="font-medium">{p.why}</p><p className="text-xs text-muted-foreground">{p.api} · {p.name}</p></div>
    <Badge variant={p.type === "Application" ? "secondary" : "outline"}>{p.type === "Application" ? "Needs admin" : "Your access"}</Badge>
  </li>)}</ul>;
}

export function ConnectFlow() {
  const integ = useIntegrations();
  const [role, setRole] = useState<"admin" | "user">("user");
  const [step, setStep] = useState<"consent" | "discover">(integ.connection.status === "Connected" ? "discover" : "consent");
  const [adminEmail, setAdminEmail] = useState("it-admin@dundee.ac.uk");
  const [consentOpen, setConsentOpen] = useState(false);
  const status = integ.connection.status;

  return <div className="space-y-6">
    <ol className="flex flex-wrap gap-2 text-xs font-medium">
      {["Approve access", "Find plans", "Link to projects"].map((label, i) => {
        const active = (step === "consent" && i === 0) || (step === "discover" && i > 0);
        return <li key={label} className={cn("rounded-full border px-3 py-1", active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>{i + 1}. {label}</li>;
      })}
    </ol>

    {step === "consent" && <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Connect Microsoft 365</h2><p className="text-sm text-muted-foreground">Virtual PMO needs permission to read and update your Planner plans.</p></div>
        <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Demo role">
          {(["user", "admin"] as const).map(r => <button key={r} onClick={() => setRole(r)} className={cn("rounded px-3 py-1.5", role === r ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{r === "admin" ? "I'm a Microsoft 365 admin" : "I'm not an admin"}</button>)}
        </div>
      </div>
      <div className="mt-5"><PermissionList /></div>

      {role === "admin" ? <div className="mt-5 flex justify-end"><Button onClick={() => setConsentOpen(true)}>Continue to Microsoft</Button></div>
        : status === "Pending approval" ? <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-health-warning/40 bg-health-warning/10 p-4 text-sm">
          <Clock className="size-4" /><span className="flex-1">Request sent to <strong>{integ.connection.adminRequestSentTo}</strong>. You can keep using native tasks while you wait.</span>
          <Button size="sm" variant="outline" onClick={() => { startConsent(); setStep("discover"); }}>Simulate admin approval</Button>
        </div>
        : <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-md border p-4">
            <p className="text-sm font-semibold">This needs approval from your IT admin</p>
            <p className="text-sm text-muted-foreground">Some permissions can only be approved by an admin. We'll send them a request with a one-page explanation.</p>
            <Input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} aria-label="Admin email" />
            <Button onClick={() => requestAdminConsent(adminEmail)} disabled={!adminEmail.includes("@")}><Mail />Send request</Button>
          </div>
          <div className="rounded-md border bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">
            <p className="mb-2 text-sm font-semibold text-foreground">Preview: what your admin receives</p>
            <p>Chris McDonald would like to connect <strong>Virtual PMO</strong> to Microsoft 365 for the University of Dundee.</p>
            <p className="mt-2">It reads and updates Planner tasks, reads group names so plans can be found, and reads staff names and job titles for resourcing. It does not read email, files or Teams chats.</p>
            <p className="mt-2">Data is stored in the UK. Access can be removed at any time from Microsoft Entra.</p>
          </div>
        </div>}

      {consentOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-label="Microsoft consent">
        <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
          <p className="text-xs text-muted-foreground">Microsoft · chris.mcdonald@dundee.ac.uk</p>
          <h3 className="mt-2 text-lg font-semibold">Permissions requested</h3>
          <p className="text-sm text-muted-foreground">Virtual PMO (unverified demo) wants to access resources in your organisation.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{requiredPermissions.map(p => <li key={p.name}>{p.why}</li>)}</ul>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> Consent on behalf of your organisation</label>
          <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setConsentOpen(false)}>Cancel</Button><Button onClick={() => { startConsent(); setConsentOpen(false); setStep("discover"); }}>Accept</Button></div>
        </div>
      </div>}
    </section>}

    {step === "discover" && <PlanDiscovery />}
  </div>;
}

export function PlanDiscovery() {
  const integ = useIntegrations();
  const plans = useMemo(() => discoverPlans(), []);
  const projects = getProjects();
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(plans.map(p => [p.id, p.suggestedProjectId ?? ""])));
  const [q, setQ] = useState("");
  const groups = ["Premium", "Basic"] as const;
  const linkedPlanIds = new Set(integ.links.map(l => l.planId));

  return <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="size-5 text-health-good" />Connected to {integ.connection.tenantName}</h2><p className="text-sm text-muted-foreground">We found {plans.length} plans you can see. Check the suggested matches and link them.</p></div>
      <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="w-64 pl-8" placeholder="Filter plans" value={q} onChange={e => setQ(e.target.value)} /></div>
    </div>
    {groups.map(kind => <div key={kind} className="mt-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planner {kind} {kind === "Premium" ? "· dundee.crm11.dynamics.com" : "· Microsoft 365 groups"}</h3>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[720px] text-sm">
        <thead className="bg-table-head text-left text-xs text-muted-foreground"><tr><th className="h-10 px-3">Plan</th><th className="px-3">Location</th><th className="px-3">Tasks</th><th className="px-3">Link to project</th><th className="px-3" /></tr></thead>
        <tbody>{plans.filter(p => p.kind === kind && p.name.toLowerCase().includes(q.toLowerCase())).map(plan => {
          const linked = linkedPlanIds.has(plan.id);
          return <tr key={plan.id} className="border-t">
            <td className="px-3 py-2.5 font-medium">{plan.name}{plan.matchReason && <p className="text-xs font-normal text-muted-foreground">Suggested: {plan.matchReason}</p>}</td>
            <td className="px-3 text-muted-foreground">{plan.container}</td>
            <td className="px-3 tabular-nums">{plan.tasks}</td>
            <td className="px-3"><select className="h-9 w-full max-w-64 rounded-md border bg-background px-2 text-sm" value={choice[plan.id]} onChange={e => setChoice(c => ({ ...c, [plan.id]: e.target.value }))} aria-label={`Project for ${plan.name}`}>
              <option value="">Skip this plan</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></td>
            <td className="px-3 text-right">{linked ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4" />Linked</span>
              : <Button size="sm" disabled={!choice[plan.id]} onClick={() => linkPlan(choice[plan.id] ?? "", plan)}>Link</Button>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>)}
    <div className="mt-6 flex justify-end gap-2"><Button variant="outline" asChild><Link to="/settings/$section" params={{ section: "integrations" }}>Manage integrations</Link></Button><Button asChild><Link to="/portfolio">Go to portfolio</Link></Button></div>
  </section>;
}
