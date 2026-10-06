import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, redirect } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { useState } from "react";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { useSession } from "@/components/auth/session-provider";
import { selfSignup } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMagicLink } from "@/services/auth";
import { errorMessage } from "@/services/service-error";

export const Route = createFileRoute("/signup/")({
  // Self-service sign-up is off unless VITE_SELF_SIGNUP is "true" (see lib/features.ts).
  beforeLoad: () => { if (!selfSignup) throw redirect({ to: "/request-access", replace: true }); },
  head: () => ({ meta: [
    { title: "Start your free trial — Virtual PMO" },
    { name: "description", content: "Create your Virtual PMO organisation in minutes with your work email." },
    { property: "og:title", content: "Start your free trial — Virtual PMO" },
    { property: "og:description", content: "Create your Virtual PMO organisation in minutes with your work email." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SignupPage,
});

const PERSONAL = /@(outlook|hotmail|live|gmail|googlemail|yahoo|icloud|me|aol|proton|protonmail)\./i;

/** Sign up: verify a work email with a sign-in link, then set up the organisation. */
function SignupPage() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const personal = PERSONAL.test(email);
  const send = useMutation({ meta: { silent: true }, mutationFn: (address: string) => sendMagicLink(address, "/signup/setup") });

  if (session.status === "loading") return <Splash label="Checking your session…" />;
  if (session.status === "signed_in") return <Navigate to="/signup/setup" replace />;

  if (send.isSuccess)
    return <CentredCard title="Check your email">
      <p className="flex gap-2 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-health-good" />We've sent a link to <strong className="text-foreground">{send.variables}</strong>. Open it on this device to set up your organisation. The link expires in an hour.</p>
      <Button variant="ghost" className="mt-4" onClick={() => send.reset()}>Use a different email</Button>
    </CentredCard>;

  return <CentredCard title="Start your free trial">
    <p className="text-sm text-muted-foreground">Portfolio management for university IT and change teams. Enter your work email and we'll send you a link: no password needed.</p>
    <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); if (!personal) send.mutate(email.trim()); }}>
      <label className="block text-xs font-medium text-muted-foreground">Work email
        <Input className="mt-1" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@your-university.ac.uk" /></label>
      {personal && <p className="flex gap-2 rounded-md border border-health-warn/40 bg-health-warn/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Please use your work email. Personal addresses can't create an organisation.</p>}
      {send.isError && <p role="alert" className="rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm">{errorMessage(send.error)}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={send.isPending || personal || !email.includes("@")}>{send.isPending ? <LoaderCircle className="animate-spin" /> : <Mail />}Email me a link</Button>
    </form>
    <p className="mt-6 text-center text-xs text-muted-foreground">Already using Virtual PMO? <Link to="/signin" className="text-primary hover:underline">Sign in</Link></p>
  </CentredCard>;
}
