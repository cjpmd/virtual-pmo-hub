import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { LoaderCircle, UserPlus } from "lucide-react";
import { useState } from "react";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { CheckEmail, Field, FormError, PasswordStrength } from "@/components/auth/auth-fields";
import { useCaptcha } from "@/components/auth/captcha";
import { OrDivider, ProviderButtons } from "@/components/auth/provider-buttons";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { checkPassword } from "@/lib/password";
import { safeNext } from "@/lib/safe-next";
import { signUpWithPassword } from "@/services/auth";

const title = "Create your account — Virtual PMO";
const description =
  "Create a Virtual PMO account with Microsoft or your email, then start a free trial for your organisation.";

// Anyone can create an account. Creating an organisation is separate (/signup/setup) and can
// be switched off with VITE_SELF_SIGNUP=false (see lib/features.ts).
export const Route = createFileRoute("/signup/")({
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
  component: SignupPage,
});

function SignupPage() {
  const { next } = Route.useSearch();
  const session = useSession();
  const captcha = useCaptcha();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const create = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      signUpWithPassword({ name, email, password, next, captchaToken: captcha.token }),
    onSettled: captcha.reset,
  });

  if (session.status === "loading") return <Splash label="Checking your session…" />;
  if (session.status === "signed_in") return <Navigate to={next ?? "/signup/setup"} replace />;

  if (create.isSuccess)
    return (
      <CentredCard title="Check your email">
        <CheckEmail email={email.trim()} next={next} onBack={() => create.reset()} />
      </CentredCard>
    );

  const passwordOk = checkPassword(password, email).acceptable;
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = name.trim() !== "" && passwordOk && confirm === password;
  return (
    <CentredCard title="Create your account">
      <p className="text-sm text-muted-foreground">
        Portfolio, programme and project management for PMOs and change teams. Free for 14 days, no
        card needed.
      </p>
      <div className="mt-5">
        <ProviderButtons next={next} />
      </div>
      <OrDivider />
      <form
        className="space-y-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (valid) create.mutate();
        }}
      >
        <Field
          label="Full name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@yourcompany.com"
        />
        <div className="space-y-1.5">
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={touched && !passwordOk}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordStrength password={password} email={email} />
        </div>
        <div className="space-y-1">
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={mismatch}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {mismatch && <p className="text-xs text-health-bad">The passwords don't match.</p>}
        </div>
        {touched && !valid && !mismatch && (
          <p role="alert" className="text-xs text-health-bad">
            Enter your name, a password of at least 10 characters, and the same password again.
          </p>
        )}
        <FormError error={create.error} />
        {captcha.widget}
        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={create.isPending || !captcha.ready}
        >
          {create.isPending ? <LoaderCircle className="animate-spin" /> : <UserPlus />}Create
          account
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" search={next ? { next } : {}} className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </CentredCard>
  );
}
