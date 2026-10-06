import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CheckCircle2, LoaderCircle, LogIn, Mail } from "lucide-react";
import { useState } from "react";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_EMAIL, sendMagicLink, signInWithPassword, verifyEmailCode } from "@/services/auth";
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
    meta: { silent: true },
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
      <DemoSignIn />
    </CentredCard>
  );
}

function DemoSignIn() {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const demo = useMutation({
    meta: { silent: true },
    mutationFn: () => signInWithPassword(DEMO_EMAIL, password),
  });
  const verify = useMutation({
    meta: { silent: true },
    mutationFn: () => verifyEmailCode(DEMO_EMAIL, code),
  });
  const error = demo.error ?? verify.error;
  return (
    <div className="mt-6 border-t border-border/70 pt-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Demo access (temporary)
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in as <strong className="text-foreground">{DEMO_EMAIL}</strong> without an email link.
      </p>
      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          demo.mutate();
        }}
      >
        <Input
          type="password"
          aria-label="Demo password"
          placeholder="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" variant="secondary" className="w-full" disabled={demo.isPending}>
          {demo.isPending ? <LoaderCircle className="animate-spin" /> : <LogIn />}Sign in as demo
          user
        </Button>
      </form>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          verify.mutate();
        }}
      >
        <Input
          aria-label="Code from email"
          inputMode="numeric"
          placeholder="Or enter code from email"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={verify.isPending}>
          {verify.isPending && <LoaderCircle className="animate-spin" />}Verify
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm">
          {errorMessage(error)}
        </p>
      )}
    </div>
  );
}
