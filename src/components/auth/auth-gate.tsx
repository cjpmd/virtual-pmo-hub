import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { Eye, LoaderCircle, LogOut } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { selfSignup } from "@/lib/features";
import { consumeSigningOut, signOut } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import { OrganisationProvider, useOrganisationState } from "./organisation-provider";
import { useSession } from "./session-provider";
import { SettingsSync } from "./settings-sync";

/** Paths anyone can open. Everything else needs a session and an organisation. */
export const isPublicPath = (path: string) =>
  path === "/" ||
  path === "/login" ||
  path === "/signin" ||
  path.startsWith("/auth/") ||
  path === "/request-access" ||
  path === "/invite" ||
  path === "/signup" ||
  path.startsWith("/signup/");

export function Splash({ label = "Loading your workspace…" }: { label?: string }) {
  return (
    <div
      className="grid min-h-screen place-items-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm text-foreground/75">
        <LoaderCircle className="size-5 animate-spin" />
        {label}
      </div>
    </div>
  );
}

/**
 * Route protection. Signed-out visitors go to /login (and come back afterwards, unless they
 * signed out on purpose); signed-in users without an organisation go to organisation setup
 * (or, with organisation creation switched off, see the "no organisation" screen). RLS remains the real boundary:
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
    const next = consumeSigningOut() ? undefined : hrefRef.current;
    void navigate({
      to: "/login",
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
  if (state.status === "none")
    return selfSignup ? (
      <Navigate to="/signup/setup" replace />
    ) : (
      <NoOrganisation email={state.profile.email} />
    );
  return (
    <OrganisationProvider value={state.value}>
      <SettingsSync>{children}</SettingsSync>
    </OrganisationProvider>
  );
}

function NoOrganisation({ email }: { email: string }) {
  return (
    <CentredCard title="You're not in an organisation yet">
      <p className="text-sm text-muted-foreground">
        You're signed in as <strong className="text-foreground">{email}</strong>, but no
        organisation has added you.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">Ask your administrator for an invite.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/auth/demo">
            <Eye />
            View demo
          </Link>
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
