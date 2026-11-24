// NHS-7: programmes other organisations share with this one (shared_programmes). Hosts manage
// sharing from the programme's Partners tab.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { Breadcrumbs } from "@/components/section-nav";
import { useSharedProgrammes } from "@/hooks/use-partner-programmes";
import { useFormat } from "@/lib/format";
import { moduleName, useModule } from "@/lib/modules";
import { useSettings } from "@/services/settings";

export const Route = createFileRoute("/portfolio/partner-programmes/")({
  component: PartnerProgrammesPage,
});

const accessText = { read: "View", contribute: "View and add projects" } as const;

function PartnerProgrammesPage() {
  const enabled = useModule("cross_org");
  const settings = useSettings();
  const title = moduleName("cross_org", settings);
  const list = useSharedProgrammes(enabled);
  const { date } = useFormat();

  return (
    <div className="space-y-6">
      <Breadcrumbs trail={[{ label: "Portfolio", to: "/portfolio" }, { label: title }]} />
      <div>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Programmes other organisations share with yours. To share one of your own programmes, open
          it and use its Partners tab.
        </p>
      </div>
      {!enabled ? (
        <p className="rounded-lg border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          {title} are switched off for your organisation. An admin can switch them on in Settings ›
          Modules.
        </p>
      ) : list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.isError ? (
        <p className="text-sm text-health-bad-foreground">{list.error.message}</p>
      ) : list.data.length === 0 ? (
        <p className="rounded-lg border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          No programmes are shared with your organisation yet. When a partner invites you, an admin
          of your organisation accepts from the link in the invitation.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.data.map((item) => (
            <li
              key={item.shareId}
              className="rounded-lg border border-border/70 bg-card p-5 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <Handshake className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  {item.hostModuleOn ? (
                    <Link
                      to="/portfolio/partner-programmes/$programmeId"
                      params={{ programmeId: item.programmeId }}
                      className="font-semibold hover:underline"
                    >
                      {item.programme}
                    </Link>
                  ) : (
                    <span className="font-semibold">{item.programme}</span>
                  )}
                  <p className="text-sm text-muted-foreground">Hosted by {item.hostOrganisation}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Your access</dt>
                <dd>{accessText[item.access]}</dd>
                <dt className="text-muted-foreground">Shared with</dt>
                <dd>{item.partnerOrganisation}</dd>
                <dt className="text-muted-foreground">Since</dt>
                <dd>{date(item.sharedAt)}</dd>
                <dt className="text-muted-foreground">Your projects in it</dt>
                <dd>{item.myContributions}</dd>
              </dl>
              {!item.hostModuleOn && (
                <p className="mt-3 text-xs text-muted-foreground">
                  The host has switched partner programmes off, so the roll-up isn't available.
                </p>
              )}
              {item.archived && (
                <p className="mt-3 text-xs text-muted-foreground">
                  The host has archived this programme.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
