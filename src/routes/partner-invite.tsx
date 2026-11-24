// NHS-7: accepting a partner-programme invitation (/partner-invite?token=…). The person signs in
// with the address the invitation was sent to and accepts on behalf of an organisation they are an
// admin of. Accepting only creates the programme share; no data moves between organisations.
// Every check (address, admin, module, expiry, sharing pause) runs in accept_partner_invite.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { useAcceptPartnerInvite, usePartnerInvitePreview } from "@/hooks/use-partner-programmes";
import { useFormat } from "@/lib/format";
import { invitePreviewMessage } from "@/services/partner-programmes";

export const Route = createFileRoute("/partner-invite")({
  validateSearch: (search: Record<string, unknown>): { token?: string | undefined } => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Partner programme invitation — ORMO PMO" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PartnerInvitePage,
});

function PartnerInvitePage() {
  const { token } = Route.useSearch();
  const session = useSession();
  const userId = session.status === "signed_in" ? session.session.user.id : null;
  const preview = usePartnerInvitePreview(token, userId);
  const accept = useAcceptPartnerInvite();
  const navigate = useNavigate();
  const { date } = useFormat();
  const [orgId, setOrgId] = useState("");

  const shell = (body: React.ReactNode) => (
    <div className="mx-auto max-w-xl space-y-4 py-6">
      <div className="flex items-center gap-2">
        <Handshake className="size-5 text-primary" />
        <h1 className="font-display text-2xl font-semibold">Partner programme invitation</h1>
      </div>
      <div className="rounded-lg border border-border/70 bg-card p-6 text-sm shadow-sm">{body}</div>
    </div>
  );

  if (!token)
    return shell(<p>This invitation link isn't complete. Open the link you were sent again.</p>);
  if (preview.isPending)
    return shell(<p className="text-muted-foreground">Checking the invitation…</p>);
  if (preview.isError)
    return shell(<p className="text-health-bad-foreground">{preview.error.message}</p>);

  const data = preview.data;
  const message = invitePreviewMessage(data.status);
  if (data.status !== "pending" && data.status !== "paused") return shell(<p>{message}</p>);

  const choices = data.organisations;
  const chosen = choices.find(
    (o) => o.id === (orgId || (choices.length === 1 ? choices[0]!.id : "")),
  );
  return shell(
    <div className="space-y-4">
      <p>
        <span className="font-medium">{data.hostOrganisation}</span> invites your organisation to
        the programme <span className="font-medium">{data.programme}</span>, with access to{" "}
        {data.access === "contribute" ? "view it and add your own projects" : "view it"}.
      </p>
      <p className="text-muted-foreground">
        Your organisation will see the programme's projects, stored health, milestones, open risks
        and benefit totals, read-only.{" "}
        {data.access === "contribute" &&
          "Projects you add stay in your organisation; the programme's members see their name, health, next milestone and open risk count. "}
        Nothing else is shared either way.{" "}
        {data.expiresAt && `The link expires on ${date(data.expiresAt)}.`}
      </p>
      {message && (
        <p role="status" className="rounded-md bg-muted/50 p-3">
          {message}
        </p>
      )}
      {choices.length === 0 ? (
        <p>
          Only an admin of an organisation can accept for it, and you aren't an admin of any
          organisation other than the host. Ask one of your organisation's admins to be invited
          instead.
        </p>
      ) : (
        <>
          {choices.length > 1 && (
            <label className="grid gap-1">
              <span>Accept for</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
              >
                <option value="">Choose an organisation</option>
                {choices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {chosen && !chosen.moduleOn && (
            <p className="rounded-md bg-muted/50 p-3">
              Partner programmes are switched off for {chosen.name}. Switch them on in Settings ›
              Modules first, then come back to this link.
            </p>
          )}
          <Button
            disabled={!chosen || !chosen.moduleOn || data.status === "paused" || accept.isPending}
            onClick={() =>
              chosen &&
              accept.mutate(
                { token, organisationId: chosen.id },
                {
                  onSuccess: (result) =>
                    navigate({
                      to: "/portfolio/partner-programmes/$programmeId",
                      params: { programmeId: result.programmeId },
                    }),
                },
              )
            }
          >
            Accept for {chosen?.name ?? "your organisation"}
          </Button>
        </>
      )}
      <p>
        <Link to="/portfolio/partner-programmes" className="text-primary hover:underline">
          Partner programmes
        </Link>
      </p>
    </div>,
  );
}
