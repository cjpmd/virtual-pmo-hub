import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Info, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { requiredPermissions } from "@/data/integrations";
import { QueryState } from "@/components/query-state";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { useIntegrationMutations, useIntegrations } from "@/hooks/use-integrations";
import { useCan } from "@/hooks/use-permissions";
import type { IntegrationsData } from "@/services/integrations";
import { cn } from "@/lib/utils";

export function PermissionList() {
  return <ul className="divide-y rounded-md border">{requiredPermissions.map(p => <li key={p.name} className="flex flex-wrap items-start gap-3 p-3 text-sm">
    <ShieldCheck className="mt-0.5 size-4 text-primary" />
    <div className="min-w-0 flex-1"><p className="font-medium">{p.why}</p><p className="text-xs text-muted-foreground">{p.api} · {p.name}</p></div>
    <Badge variant={p.type === "Application" ? "secondary" : "outline"}>{p.type === "Application" ? "Needs admin" : "Your access"}</Badge>
  </li>)}</ul>;
}

export function ConnectFlow() {
  const query = useIntegrations();
  return <QueryState query={query}>{data => <Connect data={data} />}</QueryState>;
}

/**
 * Connecting Microsoft 365. There is no Entra app registration or sync backend yet, so the
 * honest steps today are: record a request to the organisation's Microsoft 365 admin, and
 * explain what the connection will do. Signing in to Microsoft and finding plans arrive with
 * the sync backend.
 */
function Connect({ data }: { data: IntegrationsData }) {
  const { organisation, profile } = useOrganisation();
  const mutations = useIntegrationMutations();
  const canRequest = useCan("pmo");
  const [adminEmail, setAdminEmail] = useState(data.connection.adminRequestSentTo ?? "");
  const status = data.connection.status;
  const send = () => mutations.requestConsent.mutate({ exists: data.connection.exists, email: adminEmail }, {
    onSuccess: () => toast.success("Request recorded"),
    onError: error => toast.error(error.message),
  });
  const subject = encodeURIComponent("Approve Virtual PMO for Microsoft 365");
  const body = encodeURIComponent(`Hello,\n\n${profile.displayName} would like to connect Virtual PMO to Microsoft 365 for ${organisation.name}.\n\nIt reads and updates Planner tasks, reads group names so plans can be found, and reads staff names and job titles for resourcing. It does not read email, files or Teams chats.\n\nData is stored in the UK. Access can be removed at any time from Microsoft Entra.\n\nThank you.`);

  return <div className="space-y-6">
    <ol className="flex flex-wrap gap-2 text-xs font-medium">
      {["Approve access", "Find plans", "Link to projects"].map((label, i) => <li key={label} className={cn("rounded-full border px-3 py-1", i === 0 ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}>{i + 1}. {label}</li>)}
    </ol>

    <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
      <div><h2 className="text-lg font-semibold">Connect Microsoft 365</h2><p className="text-sm text-muted-foreground">Virtual PMO needs permission to read and update your Planner plans.</p></div>
      <div className="mt-5"><PermissionList /></div>
      <div className="mt-5 flex items-start gap-2 rounded-md border bg-muted/40 p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">Signing in to Microsoft, finding plans and syncing tasks need the Virtual PMO app registered in Microsoft Entra and the sync service running. Neither is live yet, so for now you can record who will approve access. Native tasks work in the meantime.</p>
      </div>

      {status === "Pending approval" && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-health-warn/40 bg-health-warn/10 p-4 text-sm">
        <Clock className="size-4" /><span className="flex-1">Request recorded for <strong>{data.connection.adminRequestSentTo}</strong>.</span>
      </div>}

      {canRequest ? <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-semibold">Ask your Microsoft 365 admin</p>
          <p className="text-sm text-muted-foreground">Some permissions can only be approved by an admin. Record who that is, and send them the explanation.</p>
          <Input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="it-admin@your-university.ac.uk" aria-label="Admin email" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={!adminEmail.includes("@") || mutations.requestConsent.isPending}>Record request</Button>
            <Button variant="outline" asChild disabled={!adminEmail.includes("@")}><a href={`mailto:${adminEmail}?subject=${subject}&body=${body}`}><Mail />Email them</a></Button>
          </div>
        </div>
        <div className="rounded-md border bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">
          <p className="mb-2 text-sm font-semibold text-foreground">What your admin receives</p>
          <p>{profile.displayName} would like to connect <strong>Virtual PMO</strong> to Microsoft 365 for {organisation.name}.</p>
          <p className="mt-2">It reads and updates Planner tasks, reads group names so plans can be found, and reads staff names and job titles for resourcing. It does not read email, files or Teams chats.</p>
          <p className="mt-2">Data is stored in the UK. Access can be removed at any time from Microsoft Entra.</p>
        </div>
      </div> : <p className="mt-5 text-sm text-muted-foreground">Ask a PMO lead or admin in your organisation to start the connection.</p>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="outline" asChild><Link to="/settings/$section" params={{ section: "integrations" }}>Manage integrations</Link></Button><Button asChild><Link to="/portfolio">Go to portfolio</Link></Button></div>
    </section>
  </div>;
}
