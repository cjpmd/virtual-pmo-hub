import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Splash } from "@/components/auth/auth-gate";
import { AuthSplit } from "@/components/marketing/auth-split";
import { siteFontLinks } from "@/components/marketing/site-fonts";
import { Field, FormError, PasswordStrength } from "@/components/auth/auth-fields";
import { useSession } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { authUrlParams, readAuthUrlError, type AuthUrlError } from "@/lib/auth-url";
import { checkPassword } from "@/lib/password";
import {
  completeSignIn,
  isPasswordRecovery,
  onPasswordRecovery,
  updatePassword,
} from "@/services/auth";

const title = "Set a new password — ORMO PMO";
const description = "Choose a new password for your ORMO PMO account.";

// The reset email links here. supabase-js reads the recovery tokens from the URL, signs the
// user in and raises PASSWORD_RECOVERY (services/auth.ts remembers it in case it fired before
// this page mounted). A ?code= (PKCE) is exchanged here, which raises the same event.
export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: siteFontLinks,
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const session = useSession();
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState(isPasswordRecovery);
  const [urlError, setUrlError] = useState<AuthUrlError | null>(null);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    const params = authUrlParams(window.location.search, window.location.hash);
    setUrlError(readAuthUrlError(params));
    const unsubscribe = onPasswordRecovery(() => setRecovery(true));
    void completeSignIn(params.get("code"))
      .catch(() => undefined)
      .finally(() => {
        setRecovery((value) => value || isPasswordRecovery());
        setChecked(true);
      });
    return unsubscribe;
  }, []);

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => updatePassword(password),
    onSuccess: () => void navigate({ to: "/", replace: true }),
  });

  if (!checked || session.status === "loading") return <Splash label="Checking your link…" />;

  // Signed in without a recovery link (e.g. opened directly) may still change their password.
  if (session.status !== "signed_in")
    return (
      <AuthSplit title="That reset link didn't work">
        <p className="text-sm text-muted-foreground">
          {urlError?.message ?? "The link has expired or has already been used."}
        </p>
        <Button asChild className="mt-4">
          <Link to="/auth/forgot-password">Send a new link</Link>
        </Button>
      </AuthSplit>
    );

  const email = session.user.email ?? "";
  const valid = checkPassword(password, email).acceptable && password === confirm;
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <AuthSplit title={recovery ? "Set a new password" : "Change your password"}>
      <p className="text-sm text-muted-foreground">
        For <strong className="text-foreground">{email}</strong>. You'll stay signed in on this
        device.
      </p>
      <form
        className="mt-5 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordStrength password={password} email={email} />
        </div>
        <div className="space-y-1">
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={mismatch}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {mismatch && <p className="text-xs text-health-bad">The passwords don't match.</p>}
        </div>
        <FormError error={save.error} />
        <Button type="submit" size="lg" className="w-full" disabled={save.isPending || !valid}>
          {save.isPending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}Save password
        </Button>
      </form>
    </AuthSplit>
  );
}
