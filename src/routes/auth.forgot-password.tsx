import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { useState } from "react";
import { CentredCard } from "@/components/auth/auth-gate";
import { Field, FormError } from "@/components/auth/auth-fields";
import { useCaptcha } from "@/components/auth/captcha";
import { Button } from "@/components/ui/button";
import { sendPasswordReset } from "@/services/auth";

const title = "Reset your password — ORMO PMO";
const description = "Get a link to set a new ORMO PMO password.";

export const Route = createFileRoute("/auth/forgot-password")({
  validateSearch: (search: Record<string, unknown>): { email?: string | undefined } => ({
    email: typeof search["email"] === "string" ? search["email"] : undefined,
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
  component: ForgotPassword,
});

function ForgotPassword() {
  const search = Route.useSearch();
  const captcha = useCaptcha();
  const [email, setEmail] = useState(search.email ?? "");
  const send = useMutation({
    meta: { silent: true },
    mutationFn: () => sendPasswordReset({ email, captchaToken: captcha.token }),
    onSettled: captcha.reset,
  });

  if (send.isSuccess)
    return (
      <CentredCard title="Check your email">
        <p className="flex gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-health-good" />
          <span>
            If <strong className="text-foreground">{email.trim()}</strong> has a ORMO PMO account,
            we've sent it a link to set a new password. The link expires in an hour.
          </span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Signed up with Microsoft? You can set a password this way too, then use either.
        </p>
        <Button asChild variant="ghost" className="mt-4">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </CentredCard>
    );

  return (
    <CentredCard title="Reset your password">
      <p className="text-sm text-muted-foreground">
        Enter your email and we'll send you a link to set a new password.
      </p>
      <form
        className="mt-5 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@yourcompany.com"
        />
        <FormError error={send.error} />
        {captcha.widget}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={send.isPending || !captcha.ready}
        >
          {send.isPending ? <LoaderCircle className="animate-spin" /> : <Mail />}Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </CentredCard>
  );
}
