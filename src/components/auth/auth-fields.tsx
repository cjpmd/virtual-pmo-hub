import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, RotateCw } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkPassword, MIN_PASSWORD_LENGTH, strengthLabels } from "@/lib/password";
import { cn } from "@/lib/utils";
import { resendConfirmation } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import { useCaptcha } from "./captcha";

export function Field({
  label,
  className,
  ...props
}: { label: string } & ComponentProps<typeof Input>) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <Input className={cn("mt-1", className)} {...props} />
    </label>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm">
      {errorMessage(error)}
    </p>
  );
}

const barColour = [
  "bg-health-bad",
  "bg-health-bad",
  "bg-health-warn",
  "bg-health-good",
  "bg-health-good",
];

/** Strength bar and hints for a new password. */
export function PasswordStrength({ password, email }: { password: string; email: string }) {
  if (!password) {
    return (
      <p className="text-xs text-muted-foreground">
        At least {MIN_PASSWORD_LENGTH} characters. A short phrase of four or more words works well.
      </p>
    );
  }
  const check = checkPassword(password, email);
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={cn(
              "h-1 flex-1 rounded-full",
              check.strength >= level ? barColour[check.strength] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{strengthLabels[check.strength]}.</span>{" "}
        {check.hints[0] ?? "Good choice."}
      </p>
    </div>
  );
}

const RESEND_COOLDOWN_SECONDS = 60;

/** "Check your email" after sign-up, with a resend button limited to one a minute. */
export function CheckEmail({
  email,
  next,
  onBack,
}: {
  email: string;
  next?: string | undefined;
  onBack: () => void;
}) {
  const captcha = useCaptcha();
  const [wait, setWait] = useState(RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);
  const resend = useMutation({
    meta: { silent: true },
    mutationFn: () => resendConfirmation({ email, next, captchaToken: captcha.token }),
    onSettled: () => {
      captcha.reset();
      setWait(RESEND_COOLDOWN_SECONDS);
    },
  });
  return (
    <div className="space-y-4">
      <p className="flex gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-health-good" />
        <span>
          If <strong className="text-foreground">{email}</strong> can be used for a new account,
          we've sent it a confirmation link. Open the link to finish creating your account; you can
          sign in once it's confirmed.
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Nothing there? Check your junk folder. If you already have an account, sign in or reset your
        password instead.
      </p>
      {resend.isSuccess && !resend.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          We've sent the link again.
        </p>
      )}
      <FormError error={resend.error} />
      {captcha.widget}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => resend.mutate()}
          disabled={wait > 0 || resend.isPending || !captcha.ready}
        >
          {resend.isPending ? <LoaderCircle className="animate-spin" /> : <RotateCw />}
          {wait > 0 ? `Resend in ${wait}s` : "Resend the link"}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Use a different email
        </Button>
      </div>
    </div>
  );
}
