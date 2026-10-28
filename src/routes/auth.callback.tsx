import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { Button } from "@/components/ui/button";
import { authUrlParams, readAuthUrlError } from "@/lib/auth-url";
import { selfSignup } from "@/lib/features";
import { safeNext } from "@/lib/safe-next";
import { completeSignIn, listMemberships } from "@/services/auth";
import { errorMessage } from "@/services/service-error";

// Microsoft sign-in and the sign-up confirmation email both return here. Tokens arrive in the
// hash (supabase-js reads them before completeSignIn resolves) or as ?code= (PKCE, exchanged
// here); errors arrive in the query string or the hash. Then the user goes on to `next`, or
// to organisation setup when they don't belong to an organisation yet.
export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search["next"]),
  }),
  head: () => ({
    meta: [
      { title: "Signing in — Virtual PMO" },
      { name: "description", content: "Completing your secure Virtual PMO sign-in." },
      { property: "og:title", content: "Signing in — Virtual PMO" },
      { property: "og:description", content: "Completing your secure Virtual PMO sign-in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: AuthCallback,
});

/** Signs in from the URL and decides where to go next. */
async function finishSignIn(next: string | undefined) {
  const params = authUrlParams(window.location.search, window.location.hash);
  const urlError = readAuthUrlError(params);
  const session = await completeSignIn(params.get("code")).catch((error: unknown) => {
    if (urlError) return null;
    throw error;
  });
  if (!session) return { urlError, to: null };
  if (next) return { urlError: null, to: next };
  const memberships = await listMemberships(session.user.id);
  return { urlError: null, to: !memberships.length && selfSignup ? "/signup/setup" : "/" };
}

function AuthCallback() {
  const { next } = Route.useSearch();
  const result = useQuery({
    queryKey: ["auth", "callback", next],
    queryFn: () => finishSignIn(next),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (result.isPending) return <Splash label="Signing you in…" />;
  if (result.isSuccess && result.data.to) return <Navigate to={result.data.to} replace />;

  const urlError = result.data?.urlError;
  const consent = urlError?.kind === "consent";
  return (
    <CentredCard
      title={
        consent
          ? "Your organisation needs to approve Virtual PMO"
          : urlError?.kind === "cancelled"
            ? "Sign-in cancelled"
            : "We couldn't sign you in"
      }
    >
      <p className="text-sm text-muted-foreground">
        {urlError?.message ??
          (result.isError
            ? errorMessage(result.error)
            : "The link has expired or has already been used. Sign in again, or request a new link.")}
      </p>
      {consent && (
        <p className="mt-3 text-xs text-muted-foreground">
          Administrators can approve Virtual PMO for everyone by signing in with Microsoft once and
          accepting the permissions request on behalf of the organisation.
        </p>
      )}
      {urlError?.detail && (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Details for your IT team</summary>
          <p className="mt-1 break-words font-mono">{urlError.detail}</p>
        </details>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/login" search={next ? { next } : {}}>
            Back to sign in
          </Link>
        </Button>
        {urlError?.kind === "expired" && (
          <Button asChild variant="outline">
            <Link to="/auth/forgot-password">Reset password</Link>
          </Button>
        )}
      </div>
    </CentredCard>
  );
}
