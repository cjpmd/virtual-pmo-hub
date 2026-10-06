import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LoaderCircle, LogOut } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { joinDemoOrganisation, signOut } from "@/services/auth";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import { OrganisationProvider, useOrganisationState } from "./organisation-provider";
import { useSession, useUser } from "./session-provider";
import { SettingsSync } from "./settings-sync";

/** Paths anyone can open. Everything else needs a session and an organisation. */
export const isPublicPath = (path: string) =>
  path === "/signin" ||
  path.startsWith("/auth/") ||
  path === "/signup" ||
  path.startsWith("/signup/");

export function Splash({ label = "Loading your workspace…" }: { label?: string }) {
  return (
    <div
      className="grid min-h-screen place-items-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        {label}
      </div>
    </div>
  );
}

/**
 * Route protection. Signed-out visitors go to /signin (and come back afterwards); signed-in
 * users without an organisation see the onboarding screen. RLS remains the real boundary:
 * this only decides what to render.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const navigate = useNavigate();
  const href = useRouterState({ select: (state) => state.location.href });
  const hrefRef = useRef(href);
  hrefRef.current = href;
  const redirected = useRef(false);

  // Redirect once per sign-out. (<Navigate> re-navigates whenever this component re-renders,
  // which it does on every router state change during the redirect itself.)
  useEffect(() => {
    if (session.status === "signed_in") redirected.current = false;
    if (session.status !== "signed_out" || redirected.current) return;
    redirected.current = true;
    const next = hrefRef.current;
    void navigate({
      to: "/signin",
      search: next && next !== "/" && !isPublicPath(next.split("?")[0] ?? "") ? { next } : {},
      replace: true,
    });
  }, [session.status, navigate]);

  if (session.status === "loading") return <Splash />;
  if (session.status === "signed_out") return <Splash label="Taking you to sign in…" />;
  return <OrganisationGate>{children}</OrganisationGate>;
}

function OrganisationGate({ children }: { children: ReactNode }) {
  const state = useOrganisationState();
  if (state.status === "loading") return <Splash />;
  if (state.status === "error")
    return (
      <CentredCard title="We couldn't load your account">
        <p className="text-sm text-muted-foreground">{errorMessage(state.error)}</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={state.retry}>Try again</Button>
          <SignOutButton />
        </div>
      </CentredCard>
    );
  if (state.status === "none") return <NoOrganisation email={state.profile.email} />;
  return (
    <OrganisationProvider value={state.value}>
      <SettingsSync>{children}</SettingsSync>
    </OrganisationProvider>
  );
}

function NoOrganisation({ email }: { email: string }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const join = useMutation({
    meta: { silent: true },
    mutationFn: joinDemoOrganisation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.memberships(user.id) }),
  });
  return (
    <CentredCard title="You're not in an organisation yet">
      <p className="text-sm text-muted-foreground">
        You're signed in as <strong className="text-foreground">{email}</strong>, but no
        organisation has added you. Ask an organisation admin to invite this address, or create a
        new organisation for your team.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        If you've been given access to the demo organisation, you can join it now.
      </p>
      {join.isError && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"
        >
          {errorMessage(join.error)}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/signup/setup">Create an organisation</Link>
        </Button>
        <Button variant="outline" onClick={() => join.mutate()} disabled={join.isPending}>
          {join.isPending && <LoaderCircle className="animate-spin" />}Join the demo organisation
        </Button>
        <SignOutButton />
      </div>
    </CentredCard>
  );
}

export function SignOutButton() {
  const out = useMutation({ mutationFn: signOut });
  return (
    <Button variant="ghost" onClick={() => out.mutate()} disabled={out.isPending}>
      <LogOut />
      Sign out
    </Button>
  );
}

export function CentredCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 p-6">
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-card p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Virtual PMO</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
