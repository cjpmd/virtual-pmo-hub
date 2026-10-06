import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { Button } from "@/components/ui/button";
import { completeSignIn } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import { safeNext } from "@/lib/safe-next";

// The magic link lands here with ?code=… (PKCE). The client exchanges it for a session,
// then sends the user on to where they started.
export const Route = createFileRoute("/auth/callback")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    next?: string | undefined;
    code?: string | undefined;
    error_description?: string | undefined;
  } => ({
    next: safeNext(search["next"]),
    code: typeof search["code"] === "string" ? search["code"] : undefined,
    error_description:
      typeof search["error_description"] === "string" ? search["error_description"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Signing in — Virtual PMO" }] }),
  ssr: false,
  component: AuthCallback,
});

function AuthCallback() {
  const { next, code, error_description } = Route.useSearch();
  const result = useQuery({
    queryKey: ["auth", "callback", code],
    queryFn: () => completeSignIn(code ?? null),
    enabled: !error_description,
    retry: false,
    staleTime: Infinity,
  });

  if (error_description || result.isError || (result.isSuccess && !result.data)) {
    return (
      <CentredCard title="That sign-in link didn't work">
        <p className="text-sm text-muted-foreground">
          {error_description ??
            (result.isError
              ? errorMessage(result.error)
              : "The link has expired or was already used.")}
        </p>
        <Button asChild className="mt-4">
          <Link to="/signin" search={next ? { next } : {}}>
            Send a new link
          </Link>
        </Button>
      </CentredCard>
    );
  }
  if (result.isPending) return <Splash label="Signing you in…" />;
  return <Navigate to={next ?? "/"} replace />;
}
