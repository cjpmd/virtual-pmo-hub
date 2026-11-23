// NHS-7: the host's Partners tab on a programme. Workspace members see who the programme is shared
// with and which partner projects are linked in; the workspace's PMO / admin invite partner
// organisations (a link to send to one of their admins), change access, end sharing and take
// projects out. Every rule is enforced by the RPCs; this only decides which buttons to show.
import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, Handshake, Mail, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgWritable } from "@/hooks/use-org-access";
import {
  useCreatePartnerInvite,
  useProgrammePartners,
  useRevokePartnerInvite,
  useRevokeShare,
  useSetShareAccess,
  useWithdrawContribution,
} from "@/hooks/use-partner-programmes";
import { useFormat } from "@/lib/format";
import { partnerInviteLink, type ShareAccess } from "@/services/partner-programmes";

const accessLabel: Record<ShareAccess, string> = {
  read: "Can view",
  contribute: "Can view and add projects",
};

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProgrammePartnersPanel({ programmeId }: { programmeId: string }) {
  const query = useProgrammePartners(programmeId);
  const writable = useOrgWritable();
  const { date } = useFormat();
  const setAccess = useSetShareAccess();
  const revokeShare = useRevokeShare();
  const revokeInvite = useRevokePartnerInvite();
  const withdraw = useWithdrawContribution();
  const data = query.data;

  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (query.isError)
    return <p className="text-sm text-health-bad-foreground">{query.error.message}</p>;
  if (!data) return null;
  const manage = data.canManage && writable;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Handshake className="size-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Partner organisations</h2>
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link to="/portfolio/partner-programmes/$programmeId" params={{ programmeId }}>
              <ExternalLink />
              System roll-up
            </Link>
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Partners see this programme's projects, stored health, milestones, open risks and benefit
          totals, read-only. They never see anything else in your organisation, and nothing moves
          between organisations.
        </p>
        {!data.sharingEnabled && (
          <p className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">
            Sharing with partner organisations is paused at the moment, so new partners can't be
            invited. Existing partners keep their access.
          </p>
        )}
        {data.shares.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Not shared with any organisation yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border/70">
            {data.shares.map((share) => (
              <li key={share.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">{share.partnerOrganisation}</span>
                <span className="text-xs text-muted-foreground">since {date(share.createdAt)}</span>
                <span className="ml-auto flex items-center gap-2">
                  {manage ? (
                    <select
                      aria-label={`Access for ${share.partnerOrganisation}`}
                      className={selectClass}
                      value={share.access}
                      disabled={setAccess.isPending}
                      onChange={(e) =>
                        setAccess.mutate({
                          shareId: share.id,
                          access: e.target.value as ShareAccess,
                        })
                      }
                    >
                      <option value="read">{accessLabel.read}</option>
                      <option value="contribute">{accessLabel.contribute}</option>
                    </select>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {accessLabel[share.access]}
                    </span>
                  )}
                  {data.canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revokeShare.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Stop sharing this programme with ${share.partnerOrganisation}?`,
                          )
                        )
                          revokeShare.mutate(share.id);
                      }}
                    >
                      End sharing
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.canManage && (
        <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">Invite a partner organisation</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send the link to an admin of the partner organisation. They accept on behalf of their
            organisation. Links last 14 days.
          </p>
          <InviteForm
            programmeId={programmeId}
            disabled={!data.sharingEnabled || !data.moduleOn}
            writable={writable}
          />
          {data.invites.length > 0 && (
            <ul className="mt-4 divide-y divide-border/70">
              {data.invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Mail className="size-4 text-muted-foreground" />
                  <span>{invite.email}</span>
                  <span className="text-muted-foreground">{accessLabel[invite.access]}</span>
                  <span className="text-xs text-muted-foreground">
                    expires {date(invite.expiresAt)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    disabled={revokeInvite.isPending}
                    onClick={() => revokeInvite.mutate(invite.id)}
                  >
                    <X />
                    Withdraw
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold">Projects added by partners</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          These stay owned and edited by the partner. They appear in the system roll-up while the
          partner can add projects; they don't change this programme's own health.
        </p>
        {data.contributions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/70">
            {data.contributions.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs">{item.projectCode}</span>
                <span className="font-medium">{item.project}</span>
                <span className="text-muted-foreground">{item.partnerOrganisation}</span>
                {!item.active && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    Not shown: partner can't add projects now
                  </span>
                )}
                {manage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    disabled={withdraw.isPending}
                    onClick={() => {
                      if (window.confirm(`Take ${item.projectCode} out of this programme?`))
                        withdraw.mutate(item.id);
                    }}
                  >
                    Take out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InviteForm({
  programmeId,
  disabled,
  writable,
}: {
  programmeId: string;
  disabled: boolean;
  writable: boolean;
}) {
  const create = useCreatePartnerInvite();
  const [email, setEmail] = useState("");
  const [access, setAccessLevel] = useState<ShareAccess>("read");
  const [link, setLink] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    create.mutate(
      { programmeId, email: email.trim(), access },
      {
        onSuccess: (result) => {
          setLink(partnerInviteLink(result.token, window.location.origin));
          setEmail("");
        },
      },
    );
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy: select the link and copy it");
    }
  };

  return (
    <>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span>Partner admin's email</span>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8 w-72 max-w-full"
            disabled={disabled || !writable}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Access</span>
          <select
            className={selectClass}
            value={access}
            onChange={(e) => setAccessLevel(e.target.value as ShareAccess)}
            disabled={disabled || !writable}
          >
            <option value="read">{accessLabel.read}</option>
            <option value="contribute">{accessLabel.contribute}</option>
          </select>
        </label>
        <ReadOnlyTip readOnly={!writable}>
          <Button type="submit" size="sm" disabled={disabled || !writable || create.isPending}>
            Create invitation link
          </Button>
        </ReadOnlyTip>
      </form>
      {link && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Send this link to the partner's admin</p>
          <p className="mt-1 text-muted-foreground">
            It is shown once. Create a new one if it's lost.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-background px-2 py-1 text-xs">
              {link}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy />
              Copy
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
