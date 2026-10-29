import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { LoaderCircle, LogIn, RotateCw } from "lucide-react";
import { useState } from "react";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { Field, FormError } from "@/components/auth/auth-fields";
import { useCaptcha } from "@/components/auth/captcha";
import { OrDivider, ProviderButtons } from "@/components/auth/provider-buttons";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { isUnconfirmedEmail, resendConfirmation, signInWithPassword } from "@/services/auth";
import { nextLocation, safeNext } from "@/lib/safe-next";

const title = "Sign in — Virtual PMO";
const description = "Sign in to Virtual PMO with Microsoft or your email and password.";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search["next"]),
  }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { next } = Route.useSearch();
  const demo = next === "/auth/demo";
  const session = useSession();
  const captcha = useCaptcha();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useMutation({
    meta: { silent: true },
    mutationFn: () => signInWithPassword({ email, password, captchaToken: captcha.token }),
    onSettled: captcha.reset,
  });
  const resend = useMutation({
    meta: { silent: true },
    mutationFn: () => resendConfirmation({ email, next, captchaToken: captcha.token }),
    onSettled: captcha.reset,
  });

  if (session.status === "loading") return <Splash label="Checking your session…" />;
  if (session.status === "signed_in") return <Navigate {...nextLocation(next ?? "/")} replace />;

  const unconfirmed = isUnconfirmedEmail(signIn.error);
  return (
    <CentredCard title={demo ? "Sign in to view the demo" : "Sign in"}>
      <p className="text-sm text-muted-foreground">
        {demo
          ? "Sign in or create a free account to explore the demo portfolio, read-only."
          : "Welcome back. Sign in to your organisation's portfolio."}
      </p>
      <div className="mt-5">
        <ProviderButtons next={next} />
      </div>
      <OrDivider />
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          resend.reset();
          signIn.mutate();
        }}
      >
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@yourcompany.com"
        />
        <div>
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1 text-right text-xs">
            <Link
              to="/auth/forgot-password"
              search={email ? { email } : {}}
              className="text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </p>
        </div>
        <FormError error={signIn.error} />
        {unconfirmed && (
          <div className="space-y-2">
            {resend.isSuccess ? (
              <p role="status" className="text-sm text-muted-foreground">
                We've sent the confirmation link again. Check your inbox.
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => resend.mutate()}
                disabled={resend.isPending || !captcha.ready}
              >
                {resend.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCw />}
                Resend the confirmation link
              </Button>
            )}
            <FormError error={resend.error} />
          </div>
        )}
        {captcha.widget}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={signIn.isPending || !captcha.ready}
        >
          {signIn.isPending ? <LoaderCircle className="animate-spin" /> : <LogIn />}Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        New to Virtual PMO?{" "}
        <Link to="/signup" search={next ? { next } : {}} className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </CentredCard>
  );
}
