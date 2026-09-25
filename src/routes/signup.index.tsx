import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/signup/")({
  head: () => ({ meta: [
    { title: "Start your free trial — Virtual PMO" },
    { name: "description", content: "Sign in with Microsoft to create your Virtual PMO workspace in minutes." },
    { property: "og:title", content: "Start your free trial — Virtual PMO" },
    { property: "og:description", content: "Sign in with Microsoft to create your Virtual PMO workspace in minutes." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SignupPage,
});

function MicrosoftLogo() { return <svg viewBox="0 0 21 21" className="size-4" aria-hidden><rect width="10" height="10" fill="#f25022" /><rect x="11" width="10" height="10" fill="#7fba00" /><rect y="11" width="10" height="10" fill="#00a4ef" /><rect x="11" y="11" width="10" height="10" fill="#ffb900" /></svg>; }

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("chris.mcdonald@dundee.ac.uk");
  const [stage, setStage] = useState<"start" | "signing" | "existing" | "personal">("start");
  const personal = /@(outlook|hotmail|live|gmail)\./i.test(email);
  const domain = email.split("@")[1] ?? "";

  const signIn = () => {
    if (personal) { setStage("personal"); return; }
    setStage("signing");
    setTimeout(() => setStage(domain === "st-andrews.ac.uk" ? "existing" : "start"), 1200);
    if (domain !== "st-andrews.ac.uk") setTimeout(() => navigate({ to: "/signup/setup", search: { email } }), 1200);
  };

  return <div className="grid min-h-screen place-items-center bg-muted/40 p-6">
    <div className="w-full max-w-md rounded-xl border border-border/70 bg-card p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Virtual PMO</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Start your free trial</h1>
      <p className="mt-2 text-sm text-muted-foreground">Portfolio management that works with Microsoft Planner. No forms or passwords, just your work account.</p>
      <label className="mt-6 block text-xs font-medium text-muted-foreground">Demo: work email to sign in with
        <Input className="mt-1" value={email} onChange={e => { setEmail(e.target.value); setStage("start"); }} /></label>
      <p className="mt-1 text-xs text-muted-foreground">Try a personal address, or someone@st-andrews.ac.uk to see an existing workspace.</p>
      <Button className="mt-4 w-full" size="lg" onClick={signIn} disabled={stage === "signing"}>{stage === "signing" ? <LoaderCircle className="animate-spin" /> : <MicrosoftLogo />}Sign in with Microsoft</Button>
      {stage === "personal" && <div className="mt-4 flex gap-2 rounded-md border border-health-warning/40 bg-health-warning/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Personal Microsoft accounts can't be used. Please sign in with your university work account.</div>}
      {stage === "existing" && <div className="mt-4 space-y-3 rounded-md border p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-health-good" />University of St Andrews already has a workspace</p>
        <p className="text-muted-foreground">Created by a colleague. Join it rather than creating a duplicate.</p>
        <div className="flex gap-2"><Button asChild><Link to="/portfolio">Join University of St Andrews's workspace</Link></Button><Button variant="ghost" onClick={() => navigate({ to: "/signup/setup", search: { email } })}>Create new</Button></div>
      </div>}
      <p className="mt-6 text-center text-xs text-muted-foreground">Already using Virtual PMO? <Link to="/portfolio" className="text-primary hover:underline">Go to your workspace</Link></p>
    </div>
  </div>;
}
