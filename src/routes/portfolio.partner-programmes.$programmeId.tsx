// NHS-7: the system-level roll-up of a shared programme (shared_programme_overview), for the
// host's members and for partner organisations it is shared with. Read-only: health is the stored
// health of each organisation's own projects. Partners with "add projects" access can link one of
// their own projects in (workspace PMO / admin); a partner organisation's admin can leave.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useOrgId } from "@/components/auth/organisation-provider";
import { HealthPill } from "@/components/health-pill";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { Fact } from "@/components/pmo-ui";
import { SampleChip } from "@/components/sample-badge";
import { Breadcrumbs } from "@/components/section-nav";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-hierarchy";
import { useOrgWritable } from "@/hooks/use-org-access";
import {
  useContributeProject,
  useRevokeShare,
  useSharedProgrammeOverview,
} from "@/hooks/use-partner-programmes";
import { useOrgRole, useWorkspaceRoles } from "@/hooks/use-permissions";
import { useFormat } from "@/lib/format";
import { moduleName, useModule } from "@/lib/modules";
import { atLeast } from "@/services/auth";
import type { PartnerProjectRollup } from "@/services/partner-programmes";
import { useSettings } from "@/services/settings";

export const Route = createFileRoute("/portfolio/partner-programmes/$programmeId")({
  component: SharedProgrammePage,
});

function SharedProgrammePage() {
  const { programmeId } = Route.useParams();
  const enabled = useModule("cross_org");
  const settings = useSettings();
  const title = moduleName("cross_org", settings);
  const overview = useSharedProgrammeOverview(programmeId, enabled);
  const format = useFormat();
  const orgId = useOrgId();
  const orgRole = useOrgRole();
  const writable = useOrgWritable();
  const navigate = useNavigate();
  const leave = useRevokeShare();
  const data = overview.data;

  const trail = [
    { label: "Portfolio", to: "/portfolio" },
    { label: title, to: "/portfolio/partner-programmes" },
    { label: data?.programme.name ?? "Programme" },
  ];
  if (!enabled)
    return (
      <div className="space-y-4">
        <Breadcrumbs trail={trail} />
        <p className="rounded-lg border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          {title} are switched off for your organisation. An admin can switch them on in Settings ›
          Modules.
        </p>
      </div>
    );
  if (overview.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (overview.isError)
    return <p className="text-sm text-health-bad-foreground">{overview.error.message}</p>;
  if (!data)
    return (
      <div className="space-y-4">
        <Breadcrumbs trail={trail} />
        <p className="rounded-lg border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          This programme isn't shared with your organisation, or its host has switched partner
          programmes off.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/portfolio/partner-programmes">All {title.toLowerCase()}</Link>
        </Button>
      </div>
    );

  const { programme, viewer } = data;
  const isMyShare = !viewer.isHost && viewer.partnerOrganisationId === orgId;
  const canContribute = isMyShare && viewer.access === "contribute";
  const all = [...data.projects, ...data.contributedProjects];

  return (
    <div className="space-y-6">
      <Breadcrumbs trail={trail} />
      <header className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Hosted by {programme.organisation}
            </p>
            <h1 className="font-display text-2xl font-semibold">{programme.name}</h1>
            {programme.description && (
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {programme.description}
              </p>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <HealthPill health={programme.overall} />
            {viewer.isHost && (
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/portfolio/programmes/$programmeId"
                  params={{ programmeId: programme.id }}
                >
                  Open programme
                </Link>
              </Button>
            )}
            {isMyShare && orgRole === "admin" && viewer.shareId && (
              <Button
                size="sm"
                variant="outline"
                disabled={leave.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Leave ${programme.name}? Your organisation will stop seeing it, and your projects will no longer show in it.`,
                    )
                  )
                    leave.mutate(viewer.shareId!, {
                      onSuccess: () => navigate({ to: "/portfolio/partner-programmes" }),
                    });
                }}
              >
                Leave programme
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Organisations" value={String(data.organisations.length)} />
          <Fact label="Projects" value={String(all.length)} />
          <Fact
            label="Forecast finish"
            value={programme.forecastFinishDate ? format.date(programme.forecastFinishDate) : "—"}
          />
          <Fact label="Benefit health" value={programme.benefitHealth} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Health is each organisation's own stored health. Projects added by partners don't change
          the programme's health.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Benefits">
        <BenefitTile
          label="Cash-releasing benefits (planned)"
          value={format.currency(data.benefits.cashReleasing)}
        />
        <BenefitTile
          label="Non-cash benefits (planned)"
          value={format.currency(data.benefits.nonCash)}
        />
        <BenefitTile
          label="Benefits"
          value={`${data.benefits.count}`}
          detail={`${data.benefits.realised} realised or partly realised`}
        />
      </section>

      <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Contributions by organisation</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.organisations.map((org) => {
            const projects = all.filter((p) => p.organisationId === org.id);
            return (
              <li
                key={org.id}
                className="flex items-center gap-2 rounded-md border border-border/70 p-3 text-sm"
              >
                <Building2 className="size-4 text-muted-foreground" />
                <span className="font-medium">{org.name}</span>
                <span className="text-xs text-muted-foreground">
                  {org.role === "host" ? "Host" : "Partner"}
                </span>
                <span className="ml-auto">{projects.length} projects</span>
              </li>
            );
          })}
        </ul>
      </section>

      <ProjectTable title="Programme projects" rows={data.projects} />
      <ProjectTable
        title="Projects added by partners"
        rows={data.contributedProjects}
        showOrganisation
      />
      {canContribute && (
        <ContributeCard
          programmeId={programme.id}
          already={new Set(data.contributedProjects.map((p) => p.id))}
          writable={writable}
        />
      )}
    </div>
  );
}

function BenefitTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ProjectTable({
  title,
  rows,
  showOrganisation = false,
}: {
  title: string;
  rows: PartnerProjectRollup[];
  showOrganisation?: boolean;
}) {
  const { date } = useFormat();
  return (
    <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Project</th>
                {showOrganisation && <th className="py-2 pr-3 font-medium">Organisation</th>}
                <th className="py-2 pr-3 font-medium">State</th>
                <th className="py-2 pr-3 font-medium">Overall</th>
                <th className="py-2 pr-3 font-medium">Schedule</th>
                <th className="py-2 pr-3 font-medium">Next milestone</th>
                <th className="py-2 pr-3 font-medium">Overdue milestones</th>
                <th className="py-2 font-medium">Open risks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs text-muted-foreground">{row.code}</span>{" "}
                    <span className="font-medium">{row.name}</span>
                    {row.isSample && <SampleChip className="ml-1" />}
                  </td>
                  {showOrganisation && <td className="py-2 pr-3">{row.organisation}</td>}
                  <td className="py-2 pr-3">{row.state}</td>
                  <td className="py-2 pr-3">
                    <HealthPill health={row.overall} />
                  </td>
                  <td className="py-2 pr-3">
                    <HealthPill health={row.schedule} />
                  </td>
                  <td className="py-2 pr-3">
                    {row.nextMilestone
                      ? `${row.nextMilestone.title}, ${date(row.nextMilestone.date)}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">{row.milestonesOverdue}</td>
                  <td className="py-2">{row.openRisks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ContributeCard({
  programmeId,
  already,
  writable,
}: {
  programmeId: string;
  already: Set<string>;
  writable: boolean;
}) {
  const projects = useProjects();
  const roles = useWorkspaceRoles().data;
  const contribute = useContributeProject();
  const [choice, setChoice] = useState("");
  const pmoWorkspaces = useMemo(
    () => new Set((roles ?? []).filter((r) => atLeast(r.role, "pmo")).map((r) => r.workspaceId)),
    [roles],
  );
  const options = (projects.data ?? []).filter(
    (p) => pmoWorkspaces.has(p.workspaceId) && !already.has(p.id),
  );
  if (pmoWorkspaces.size === 0) return null;
  return (
    <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold">Add one of your projects</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The project stays in your organisation and is edited there. Everyone in this programme sees
        its name, stored health, next milestone and open risk count.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span>Project</span>
          <select
            className="h-8 w-80 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">Choose a project</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.name}
              </option>
            ))}
          </select>
        </label>
        <ReadOnlyTip readOnly={!writable}>
          <Button
            size="sm"
            disabled={!choice || !writable || contribute.isPending}
            onClick={() =>
              contribute.mutate(
                { projectId: choice, programmeId },
                { onSuccess: () => setChoice("") },
              )
            }
          >
            <Plus />
            Add to programme
          </Button>
        </ReadOnlyTip>
      </div>
    </section>
  );
}
