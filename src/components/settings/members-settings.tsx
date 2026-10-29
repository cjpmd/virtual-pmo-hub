// Settings › Members (work package 2.1): seats, members and their roles, invitations, requests to
// join and the join settings. Every action goes through the 2.1 RPCs or the send-invite edge
// function, which check permissions, seats and rate limits; refusals show as they come back.
// Everyone can see who is in the organisation; only admins see invitations, requests and controls.
// See docs/invites-and-seats.md.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Mail, Plus, RotateCw, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/components/auth/session-provider";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useInvites,
  useJoinRequests,
  useJoinSettings,
  useMemberMutations,
  useMembers,
  useSeatUsage,
} from "@/hooks/use-members";
import { useOrgRole } from "@/hooks/use-permissions";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/services/auth";
import {
  INVITE_OUTCOME_LABELS,
  INVITE_STATE_LABELS,
  inviteState,
  paidSeatsNeeded,
  ROLE_CHOICES,
  roleLabel,
  seatsFit,
  seatSummary,
  signInMethods,
  splitEmails,
  usesPaidSeat,
  type Invite,
  type InviteResult,
  type JoinRequest,
  type MemberTier,
  type OrgMember,
  type SeatUsage,
} from "@/services/members";
import { errorMessage } from "@/services/service-error";
import { useSettings } from "@/services/settings";
import type { Workspace } from "@/services/workspaces";
import { SettingsCard } from "./settings-shell";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-sm";

const TIER_STYLES: Record<MemberTier, string> = {
  admin: "border-primary/40 bg-primary/10 text-primary",
  member: "border-border bg-muted/60",
  viewer: "border-dashed text-muted-foreground",
};

function TierBadge({ tier }: { tier: MemberTier }) {
  return (
    <span
      className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", TIER_STYLES[tier])}
    >
      {tier === "admin" ? "Admin" : tier === "member" ? "Member · paid seat" : "Viewer · free"}
    </span>
  );
}

export function MembersSettings() {
  const isAdmin = useOrgRole() === "admin";
  return (
    <>
      <SeatsCard />
      {isAdmin && <JoinRequestsCard />}
      <MembersCard />
      {isAdmin && <InvitesCard />}
      {isAdmin && <JoinSettingsCard />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------------------------

function SeatsCard() {
  const seats = useSeatUsage();
  const settings = useSettings();
  return (
    <SettingsCard
      requires="self"
      title="Seats"
      description="Admins and members use a paid seat. Viewers are free and read-only."
    >
      <QueryState query={seats} loading={<p className="text-sm text-muted-foreground">Loading…</p>}>
        {(usage) =>
          usage ? (
            <div className="space-y-3">
              <SeatBar usage={usage} />
              <p className="text-sm">
                {seatSummary(usage)} · {usage.paidMembers} paid member
                {usage.paidMembers === 1 ? "" : "s"}
                {usage.pendingPaidInvites > 0 &&
                  `, ${usage.pendingPaidInvites} pending paid invitation${usage.pendingPaidInvites === 1 ? "" : "s"}`}
                {" · "}
                {usage.viewers} viewer{usage.viewers === 1 ? "" : "s"} (free)
              </p>
              {usage.onTrial && (
                <p className="text-xs text-muted-foreground">
                  The free trial includes {usage.trialSeatAllowance} paid seats. Subscribe to add
                  more.
                </p>
              )}
              {usage.scheduledChangeAt &&
                (usage.scheduledSeats !== null || usage.scheduledInterval) && (
                  <p className="text-xs text-muted-foreground">
                    From {formatDate(usage.scheduledChangeAt.slice(0, 10), settings)}:{" "}
                    {[
                      usage.scheduledSeats !== null && `${usage.scheduledSeats} seats`,
                      usage.scheduledInterval &&
                        (usage.scheduledInterval === "year" ? "annual billing" : "monthly billing"),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    .
                  </p>
                )}
              {settings.subscription.canManage && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/settings/$section" params={{ section: "subscription" }}>
                    {usage.onTrial ? "Subscribe" : "Change seats"}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Seat details aren't available.</p>
          )
        }
      </QueryState>
    </SettingsCard>
  );
}

function SeatBar({ usage }: { usage: SeatUsage }) {
  const percent = Math.round((usage.used / Math.max(1, usage.limit)) * 100);
  return (
    <div className="h-2 max-w-md rounded-full bg-muted" aria-hidden>
      <div
        className={cn(
          "h-full rounded-full",
          percent > 100 ? "bg-health-bad" : percent >= 90 ? "bg-health-warn" : "bg-primary",
        )}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

function MembersCard() {
  const members = useMembers();
  const isAdmin = useOrgRole() === "admin";
  return (
    <SettingsCard
      requires="self"
      title="Members"
      description="People in this organisation. Workspace roles can be higher in individual workspaces (Settings › Workspaces)."
      actions={
        <span className="text-xs text-muted-foreground">
          {members.data
            ? `${members.data.length} member${members.data.length === 1 ? "" : "s"}`
            : ""}
        </span>
      }
    >
      <QueryState
        query={members}
        loading={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        {(rows) => <MembersTable members={rows} isAdmin={isAdmin} />}
      </QueryState>
    </SettingsCard>
  );
}

function MembersTable({ members, isAdmin }: { members: OrgMember[]; isAdmin: boolean }) {
  const me = useUser().id;
  const settings = useSettings();
  const mutations = useMemberMutations();
  const [removing, setRemoving] = useState<OrgMember | null>(null);

  const changeRole = (member: OrgMember, role: AppRole) =>
    mutations.changeRole.mutate(
      { profileId: member.profileId, role },
      {
        onSuccess: () => toast.success(`${member.name} is now ${roleLabel(role).toLowerCase()}.`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground">
            <tr>
              <th className="h-10 px-3 font-semibold">Name</th>
              <th className="px-3 font-semibold">Role</th>
              <th className="px-3 font-semibold">Signs in with</th>
              <th className="px-3 font-semibold">{isAdmin ? "Last sign-in" : "Joined"}</th>
              {isAdmin && <th className="px-3" />}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.profileId} className="border-t align-top">
                <td className="px-3 py-2.5">
                  <p className="font-medium">
                    {member.name}
                    {member.profileId === me && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin ? (
                      <select
                        aria-label={`${member.name} role`}
                        value={member.role}
                        disabled={mutations.changeRole.isPending}
                        onChange={(event) => changeRole(member, event.target.value as AppRole)}
                        className={selectClass}
                      >
                        {ROLE_CHOICES.map((choice) => (
                          <option key={choice.role} value={choice.role}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{roleLabel(member.role)}</span>
                    )}
                    {member.tier !== "admin" && <TierBadge tier={member.tier} />}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {signInMethods(member.providers)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {isAdmin
                    ? member.lastSignInAt
                      ? formatDate(member.lastSignInAt.slice(0, 10), settings)
                      : "Never"
                    : formatDate(member.joinedAt.slice(0, 10), settings)}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${member.name}`}
                      onClick={() => setRemoving(member)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              {removing?.profileId === me
                ? "You'll lose access to this organisation straight away."
                : `${removing?.name} loses access to this organisation and its workspaces straight away.`}{" "}
              Their work stays: projects, tasks and history keep their name. You can invite them
              again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={mutations.remove.isPending}
              onClick={() =>
                removing &&
                mutations.remove.mutate(removing.profileId, {
                  onSuccess: () => {
                    toast.success(`${removing.name} was removed.`);
                    setRemoving(null);
                  },
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------------------------

function InvitesCard() {
  const invites = useInvites();
  const workspaces = useWorkspaces();
  const [inviting, setInviting] = useState(false);
  return (
    <SettingsCard
      title="Invitations"
      description="Invitations are emailed from ORMO PMO and stay valid for 7 days. Each link works once, for the address it was sent to."
      actions={
        <Button onClick={() => setInviting(true)}>
          <UserPlus className="size-4" />
          Invite people
        </Button>
      }
    >
      <QueryState
        query={invites}
        loading={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        {(rows) =>
          rows.length ? (
            <InviteList invites={rows} workspaces={workspaces.data ?? []} />
          ) : (
            <p className="text-sm text-muted-foreground">No open invitations.</p>
          )
        }
      </QueryState>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </SettingsCard>
  );
}

const STATE_STYLES: Record<ReturnType<typeof inviteState>, string> = {
  sent: "border-border bg-muted/60",
  delivered: "border-health-good/40 bg-health-good/10 text-health-good-foreground",
  not_sent: "border-health-warn/40 bg-health-warn/10",
  not_delivered: "border-health-bad/40 bg-health-bad/10",
  expired: "border-dashed text-muted-foreground",
};

function InviteList({ invites, workspaces }: { invites: Invite[]; workspaces: Workspace[] }) {
  const settings = useSettings();
  const mutations = useMemberMutations();
  const busy = mutations.resend.isPending || mutations.revoke.isPending;
  const workspaceNames = (ids: string[]) =>
    ids.length
      ? ids.map((id) => workspaces.find((item) => item.id === id)?.name ?? "Workspace").join(", ")
      : "All workspaces (PMO and admin)";

  return (
    <ul className="divide-y rounded-md border">
      {invites.map((invite) => {
        const state = inviteState(invite);
        return (
          <li key={invite.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="break-all text-sm font-medium">{invite.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {roleLabel(invite.role)} · {workspaceNames(invite.workspaceIds)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {invite.lastSentAt
                  ? `Sent ${formatDate(invite.lastSentAt.slice(0, 10), settings)}`
                  : "Not sent yet"}
                {" · "}
                {state === "expired" ? "expired" : "expires"}{" "}
                {formatDate(invite.expiresAt.slice(0, 10), settings)}
              </p>
              {state === "not_delivered" && (
                <p className="mt-1 text-xs text-health-bad-foreground">
                  The email bounced{invite.emailStatusNote ? ` (${invite.emailStatusNote})` : ""}.
                  Check the address, then revoke and invite again, or resend.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  STATE_STYLES[state],
                )}
              >
                {INVITE_STATE_LABELS[state]}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  mutations.resend.mutate(invite.id, {
                    onSuccess: (result) =>
                      result.emailStatus === "sent"
                        ? toast.success(`Invitation sent again to ${invite.email}.`)
                        : toast.error(
                            result.emailError ??
                              "The email couldn’t be sent. Use Resend invite to try again.",
                          ),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <RotateCw className="size-3.5" />
                Resend invite
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  mutations.revoke.mutate(invite.id, {
                    onSuccess: () => toast.success(`Invitation to ${invite.email} revoked.`),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <X className="size-3.5" />
                Revoke
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Role picker: admin, member and viewer, with the manager and PMO variants under "More roles". */
function RolePicker({
  value,
  onChange,
  idPrefix,
}: {
  value: AppRole;
  onChange: (role: AppRole) => void;
  idPrefix: string;
}) {
  const [advanced, setAdvanced] = useState(value === "manager" || value === "pmo");
  const choices = ROLE_CHOICES.filter((choice) => advanced || !choice.advanced);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Role</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((choice) => (
          <label
            key={choice.role}
            htmlFor={`${idPrefix}-${choice.role}`}
            className={cn(
              "flex cursor-pointer gap-2 rounded-md border p-3 text-sm",
              value === choice.role
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:bg-muted/50",
            )}
          >
            <input
              id={`${idPrefix}-${choice.role}`}
              type="radio"
              name={`${idPrefix}-role`}
              className="mt-0.5"
              checked={value === choice.role}
              onChange={() => onChange(choice.role)}
            />
            <span>
              <span className="font-medium">{choice.label}</span>
              <span className="block text-xs text-muted-foreground">{choice.description}</span>
            </span>
          </label>
        ))}
      </div>
      {!advanced && (
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => setAdvanced(true)}
        >
          More roles (manager, PMO)
        </button>
      )}
    </fieldset>
  );
}

/** Workspace checkboxes; PMO and admin work across every workspace, so they need none. */
function WorkspacePicker({
  workspaces,
  selected,
  onChange,
  role,
}: {
  workspaces: Workspace[];
  selected: string[];
  onChange: (ids: string[]) => void;
  role: AppRole;
}) {
  const active = workspaces.filter((workspace) => !workspace.archivedAt);
  const optional = role === "pmo" || role === "admin";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Workspaces</legend>
      <p className="text-xs text-muted-foreground">
        {optional
          ? "PMO and admins see every workspace. Ticking one also gives them that workspace role there."
          : "They'll see and work in the workspaces you tick."}
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {active.map((workspace) => (
          <label key={workspace.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(workspace.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, workspace.id]
                    : selected.filter((id) => id !== workspace.id),
                )
              }
            />
            {workspace.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const workspaces = useWorkspaces().data ?? [];
  const seats = useSeatUsage().data ?? null;
  const settings = useSettings();
  const mutations = useMemberMutations();
  const [text, setText] = useState("");
  const [role, setRole] = useState<AppRole>("contributor");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(() =>
    workspaces.filter((workspace) => !workspace.archivedAt).map((workspace) => workspace.id),
  );
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const emails = splitEmails(text);
  const needed = paidSeatsNeeded(emails.map(() => role));
  const fits = !seats || seatsFit(seats, needed);
  const needsWorkspace = !(role === "pmo" || role === "admin") && workspaceIds.length === 0;
  const tooMany = emails.length > 20;

  const submit = () =>
    mutations.invite.mutate(
      { invites: emails.map((email) => ({ email, role })), workspaceIds },
      {
        onSuccess: (rows) => {
          setResults(rows);
          const sent = rows.filter(
            (row) => row.outcome === "created" && row.emailStatus === "sent",
          ).length;
          if (sent) toast.success(`${sent} invitation${sent === 1 ? "" : "s"} sent.`);
        },
      },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            We'll email each person a link to join{" "}
            {settings.organisation.name || "this organisation"}. Up to 20 at a time.
          </DialogDescription>
        </DialogHeader>
        {results ? (
          <ul className="divide-y rounded-md border text-sm">
            {results.map((row) => (
              <li key={row.email} className="flex items-start justify-between gap-3 p-2.5">
                <span className="break-all">{row.email}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    row.outcome === "created" && row.emailStatus === "sent"
                      ? "text-health-good-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {row.outcome === "created"
                    ? row.emailStatus === "sent"
                      ? "Invitation sent"
                      : "Invited, but the email couldn’t be sent. Use Resend invite to try again."
                    : INVITE_OUTCOME_LABELS[row.outcome]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-5">
            <label className="block text-sm">
              <span className="font-medium">Email addresses</span>
              <Textarea
                className="mt-1.5"
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="name@yourcompany.com, another@yourcompany.com"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Separate addresses with commas, spaces or new lines.
                {emails.length > 0 &&
                  ` ${emails.length} address${emails.length === 1 ? "" : "es"}.`}
              </span>
            </label>
            <RolePicker value={role} onChange={setRole} idPrefix="invite" />
            <WorkspacePicker
              workspaces={workspaces}
              selected={workspaceIds}
              onChange={setWorkspaceIds}
              role={role}
            />
            {seats && usesPaidSeat(role) && emails.length > 0 && (
              <p
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  fits
                    ? "bg-muted/40 text-muted-foreground"
                    : "border-health-warn/40 bg-health-warn/10",
                )}
              >
                {fits
                  ? `Uses ${needed} paid seat${needed === 1 ? "" : "s"}: ${seats.used + needed} of ${seats.limit} after these invitations.`
                  : `Not enough paid seats: ${seats.used} of ${seats.limit} in use and these need ${needed} more. Add seats in Settings › Subscription, or invite them as viewers (free).`}
              </p>
            )}
            {mutations.invite.error && (
              <p
                role="alert"
                className="rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"
              >
                {errorMessage(mutations.invite.error)}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          {results ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setResults(null);
                  setText("");
                  mutations.invite.reset();
                }}
              >
                <Plus className="size-4" />
                Invite more
              </Button>
              <Button onClick={onClose}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={
                  !emails.length || tooMany || needsWorkspace || !fits || mutations.invite.isPending
                }
                onClick={submit}
              >
                <Mail className="size-4" />
                {mutations.invite.isPending
                  ? "Sending…"
                  : `Send ${emails.length > 1 ? `${emails.length} invitations` : "invitation"}`}
              </Button>
            </>
          )}
        </DialogFooter>
        {!results && (tooMany || needsWorkspace) && (
          <p className="text-right text-xs text-health-bad-foreground">
            {tooMany ? "Invite up to 20 people at a time." : "Tick at least one workspace."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Requests to join
// ---------------------------------------------------------------------------------------------

function JoinRequestsCard() {
  const requests = useJoinRequests();
  const mutations = useMemberMutations();
  const settings = useSettings();
  const [approving, setApproving] = useState<JoinRequest | null>(null);
  if (!requests.data?.length) return null;
  return (
    <SettingsCard
      title="Requests to join"
      description="People who signed in with your organisation's email domain or Microsoft account and asked to join."
    >
      <ul className="divide-y rounded-md border">
        {requests.data.map((request) => (
          <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{request.name}</p>
              <p className="break-all text-xs text-muted-foreground">
                {request.email} ·{" "}
                {request.matchedBy === "entra_tenant" ? "Microsoft account" : "email domain"} ·{" "}
                {formatDate(request.createdAt.slice(0, 10), settings)}
              </p>
              {request.message && <p className="mt-1 text-sm">“{request.message}”</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setApproving(request)}>
                <Check className="size-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={mutations.decide.isPending}
                onClick={() =>
                  mutations.decide.mutate(
                    { requestId: request.id, decision: { approve: false } },
                    {
                      onSuccess: () => toast.success(`Request from ${request.email} declined.`),
                      onError: (error) => toast.error(errorMessage(error)),
                    },
                  )
                }
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {approving && <ApproveDialog request={approving} onClose={() => setApproving(null)} />}
    </SettingsCard>
  );
}

function ApproveDialog({ request, onClose }: { request: JoinRequest; onClose: () => void }) {
  const workspaces = useWorkspaces().data ?? [];
  const seats = useSeatUsage().data ?? null;
  const mutations = useMemberMutations();
  const [role, setRole] = useState<AppRole>("viewer");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(() =>
    workspaces.filter((workspace) => !workspace.archivedAt).map((workspace) => workspace.id),
  );
  const fits = !seats || !usesPaidSeat(role) || seatsFit(seats, 1);
  const needsWorkspace = !(role === "pmo" || role === "admin") && workspaceIds.length === 0;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Approve {request.name}</DialogTitle>
          <DialogDescription>
            Choose their role and workspaces. They can open the organisation straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <RolePicker value={role} onChange={setRole} idPrefix="approve" />
          <WorkspacePicker
            workspaces={workspaces}
            selected={workspaceIds}
            onChange={setWorkspaceIds}
            role={role}
          />
          {!fits && seats && (
            <p className="rounded-md border border-health-warn/40 bg-health-warn/10 px-3 py-2 text-sm">
              Every paid seat is in use ({seats.used} of {seats.limit}). Approve them as a viewer,
              or add seats first.
            </p>
          )}
          {mutations.decide.error && (
            <p
              role="alert"
              className="rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"
            >
              {errorMessage(mutations.decide.error)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!fits || needsWorkspace || mutations.decide.isPending}
            onClick={() =>
              mutations.decide.mutate(
                { requestId: request.id, decision: { approve: true, role, workspaceIds } },
                {
                  onSuccess: () => {
                    toast.success(`${request.name} joined as ${roleLabel(role).toLowerCase()}.`);
                    onClose();
                  },
                },
              )
            }
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Join settings
// ---------------------------------------------------------------------------------------------

function JoinSettingsCard() {
  const join = useJoinSettings();
  const mutations = useMemberMutations();
  const onError = (error: unknown) => toast.error(errorMessage(error));
  return (
    <SettingsCard
      title="Let colleagues ask to join"
      description="People who sign in with an address on your verified domain, or with your organisation's Microsoft account, can ask to join. An admin approves each request; nobody joins automatically."
    >
      <QueryState query={join} loading={<p className="text-sm text-muted-foreground">Loading…</p>}>
        {(data) => (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-md border p-4">
              <span className="text-sm font-medium">Accept requests to join</span>
              <Switch
                checked={data.enabled}
                disabled={mutations.setJoinEnabled.isPending}
                onCheckedChange={(value) => mutations.setJoinEnabled.mutate(value, { onError })}
                aria-label="Accept requests to join"
              />
            </label>
            <div>
              <p className="text-sm font-medium">Verified domains and accounts</p>
              {data.domains.length ? (
                <ul className="mt-2 divide-y rounded-md border">
                  {data.domains.map((domain) => (
                    <li
                      key={domain.id}
                      className="flex items-center justify-between gap-3 p-2.5 text-sm"
                    >
                      <span className="min-w-0 break-all">
                        {domain.kind === "entra_tenant"
                          ? `Microsoft tenant ${domain.value}`
                          : `@${domain.value}`}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${domain.value}`}
                        disabled={mutations.removeDomain.isPending}
                        onClick={() => mutations.removeDomain.mutate(domain.id, { onError })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">None yet.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutations.addDomain.isPending}
                  onClick={() => mutations.addDomain.mutate("email_domain", { onError })}
                >
                  <Plus className="size-3.5" />
                  Add my email domain
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mutations.addDomain.isPending}
                  onClick={() => mutations.addDomain.mutate("entra_tenant", { onError })}
                >
                  <Plus className="size-3.5" />
                  Add my Microsoft organisation
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                You can add only the domain of your own confirmed email address, or the Microsoft
                organisation you signed in with, which proves your organisation controls it.
                Personal addresses (Gmail, Outlook.com and similar) can't be added.
              </p>
            </div>
          </div>
        )}
      </QueryState>
    </SettingsCard>
  );
}
