// Accepting an invitation (work package 2.1). The emailed link is /invite?token=…. Anyone can open
// it: signed out, it shows who invited you and offers sign-in or sign-up, both returning here; signed
// in, it checks the address and accepts through accept_invite (seat, expiry and email checks run in
// the database). See docs/invites-and-seats.md.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, LoaderCircle, LogIn, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { CentredCard, SignOutButton, Splash } from "@/components/auth/auth-gate";
import { FormError } from "@/components/auth/auth-fields";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { setLastOrganisation } from "@/services/auth";
import { acceptInvite, getInvitePreview, roleLabel, usesPaidSeat } from "@/services/members";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";

const title = "Accept your invitation — Virtual PMO";

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>): { token?: string | undefined } => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: "Join your organisation in Virtual PMO." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );

function InvitePage() {
  const { token } = Route.useSearch();
  const session = useSession();
  const userId = session.status === "signed_in" ? session.session.user.id : null;
  const preview = useQuery({
    // The preview depends on who is signed in (address match), so the user is part of the key.
    queryKey: ["invite", token, userId],
    queryFn: () => getInvitePreview(token!),
    enabled: !!token && session.status !== "loading",
    retry: false,
  });

  if (!token)
    return (
      <CentredCard title="This invitation link isn't complete">
        <p className="text-sm text-muted-foreground">
          Open the link from your invitation email again, or copy the whole address into your
          browser.
        </p>
      </CentredCard>
    );
  if (session.status === "loading" || preview.isPending)
    return <Splash label="Checking your invitation…" />;
  if (preview.isError)
    return (
      <CentredCard title="We couldn't check your invitation">
        <p className="text-sm text-muted-foreground">{errorMessage(preview.error)}</p>
        <Button className="mt-4" onClick={() => void preview.refetch()}>
          Try again
        </Button>
      </CentredCard>
    );

  const invite = preview.data;
  if (invite.status === "accepted" && invite.acceptedByMe)
    return (
      <CentredCard title={`You're in ${invite.organisationName ?? "the organisation"}`}>
        <p className="text-sm text-muted-foreground">You've already accepted this invitation.</p>
        <Button asChild className="mt-4">
          <Link to="/">Open Virtual PMO</Link>
        </Button>
      </CentredCard>
    );
  if (invite.status !== "valid")
    return (
      <CentredCard
        title={
          invite.status === "expired"
            ? "This invitation has expired"
            : invite.status === "revoked"
              ? "This invitation was withdrawn"
              : invite.status === "accepted"
                ? "This invitation has already been used"
                : "This invitation link isn't valid"
        }
      >
        <p className="text-sm text-muted-foreground">
          {invite.status === "expired" && invite.expiresAt
            ? `It expired on ${longDate(invite.expiresAt)}. Ask ${invite.inviterName ?? "your admin"} to send a new one.`
            : invite.status === "not_found"
              ? "If you were sent a newer invitation, use the link in that email. Otherwise ask your admin to invite you again."
              : "Ask your organisation's admin to invite you again."}
        </p>
        {session.status === "signed_in" && (
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/">Go to Virtual PMO</Link>
            </Button>
          </div>
        )}
      </CentredCard>
    );

  const next = `/invite?token=${encodeURIComponent(token)}`;
  const summary = (
    <div className="rounded-md border bg-muted/40 p-4 text-sm">
      <p>
        <span className="font-semibold">{invite.inviterName ?? "An admin"}</span> invited you to
        join <span className="font-semibold">{invite.organisationName}</span> as{" "}
        <span className="font-semibold">{invite.role ? roleLabel(invite.role) : "a member"}</span>.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sent to {invite.emailHint}
        {invite.expiresAt && ` · valid until ${longDate(invite.expiresAt)}`}
        {invite.role && !usesPaidSeat(invite.role) && " · viewers have read-only access"}
      </p>
    </div>
  );

  if (session.status !== "signed_in")
    return (
      <CentredCard title={`Join ${invite.organisationName ?? "your organisation"}`}>
        {summary}
        <p className="mt-4 text-sm text-muted-foreground">
          Sign in or create an account with the address the invitation was sent to.
        </p>
        <div className="mt-4 grid gap-2">
          <Button asChild size="lg">
            <Link to="/signup" search={{ next }}>
              <UserPlus />
              Create an account
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login" search={{ next }}>
              <LogIn />I already have an account
            </Link>
          </Button>
        </div>
      </CentredCard>
    );

  return (
    <AcceptCard
      token={token}
      userId={session.session.user.id}
      email={session.session.user.email ?? ""}
      emailMatches={invite.emailMatches !== false}
      emailConfirmed={invite.emailConfirmed !== false}
      emailHint={invite.emailHint ?? ""}
      organisationName={invite.organisationName ?? "the organisation"}
    >
      {summary}
    </AcceptCard>
  );
}

function AcceptCard(props: {
  token: string;
  userId: string;
  email: string;
  emailMatches: boolean;
  emailConfirmed: boolean;
  emailHint: string;
  organisationName: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accept = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      const result = await acceptInvite(props.token);
      // Open the new organisation straight away. Best effort: the membership already exists.
      await setLastOrganisation(props.userId, result.organisationId).catch(() => undefined);
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.memberships(props.userId) });
      await queryClient.invalidateQueries({ queryKey: qk.me() });
      void navigate({ to: "/", replace: true });
    },
  });

  if (!props.emailMatches)
    return (
      <CentredCard title="This invitation is for a different address">
        {props.children}
        <p className="mt-4 text-sm text-muted-foreground">
          You're signed in as <span className="font-medium text-foreground">{props.email}</span>,
          but the invitation was sent to {props.emailHint}. Sign out and sign in with that address,
          or ask your admin to invite {props.email} instead.
        </p>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </CentredCard>
    );

  if (!props.emailConfirmed)
    return (
      <CentredCard title="Confirm your email address first">
        {props.children}
        <p className="mt-4 text-sm text-muted-foreground">
          Open the confirmation link we sent to {props.email}, then come back to this invitation.
        </p>
      </CentredCard>
    );

  return (
    <CentredCard title={`Join ${props.organisationName}`}>
      {props.children}
      <p className="mt-4 text-sm text-muted-foreground">Signed in as {props.email}.</p>
      <div className="mt-4 space-y-3">
        <FormError error={accept.error} />
        <Button
          size="lg"
          className="w-full"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
          Accept and join
        </Button>
      </div>
    </CentredCard>
  );
}
