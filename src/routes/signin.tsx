import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { useState } from "react";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMagicLink } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import { safeNext } from "@/lib/safe-next";

export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search["next"]),
  }),
  head: () => ({ meta: [{ title: "Sign in — Virtual PMO" }] }),
  component: SignInPage,
});

function SignInPage() {
  const { next } = Route.useSearch();
  const session = useSession();
  const [email, setEmail] = useState("");
  const send = useMutation({
    mutationFn: (address: string) => sendMagicLink(address, next ?? "/"),
  });

  if (session.status === "loading") return <Splash label="Checking your session…" />;
  if (session.status === "signed_in") return <Navigate to={next ?? "/"} replace />;

  if (send.isSuccess)
    return (
      <CentredCard title="Check your email">
        <p className="flex gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-health-good" />
          We've sent a sign-in link to <strong className="text-foreground">{send.variables}</strong>
          . Open it on this device to continue. The link expires in an hour.
        </p>
        <Button variant="ghost" className="mt-4" onClick={() => send.reset()}>
          Use a different email
        </Button>
      </CentredCard>
    );

  return (
    <CentredCard title="Sign in">
      <p className="text-sm text-muted-foreground">
        Enter your work email and we'll send you a link to sign in. No password needed.
      </p>
      <form
        className="mt-5 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate(email);
        }}
      >
        <label className="block text-xs font-medium text-muted-foreground">
          Work email
          <Input
            className="mt-1"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@university.ac.uk"
          />
        </label>
        {send.isError && (
          <p
            role="alert"
            className="rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"
          >
            {errorMessage(send.error)}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={send.isPending}>
          {send.isPending ? <LoaderCircle className="animate-spin" /> : <Mail />}Email me a sign-in
          link
        </Button>
      </form>
    </CentredCard>
  );
}
