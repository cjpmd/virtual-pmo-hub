import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, redirect, useNavigate } from "@tanstack/react-router";
import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { CentredCard, Splash } from "@/components/auth/auth-gate";
import { useSession } from "@/components/auth/session-provider";
import { selfSignup } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createOrganisation, listMemberships, setLastOrganisation } from "@/services/auth";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup/setup")({
  // Self-service sign-up is off unless VITE_SELF_SIGNUP is "true" (see lib/features.ts).
  beforeLoad: () => {
    if (!selfSignup) throw redirect({ to: "/request-access", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Set up your organisation — Virtual PMO" },
      {
        name: "description",
        content: "Name your organisation and choose your region, currency and financial year.",
      },
      { property: "og:title", content: "Set up your organisation — Virtual PMO" },
      { property: "og:description", content: "A short setup with sensible defaults." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

const orgFromDomain = (domain: string) => {
  const base = (domain.split(".")[0] ?? "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return domain.endsWith(".ac.uk") && base ? `University of ${base}` : base;
};
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function SetupPage() {
  const session = useSession();
  if (session.status === "loading") return <Splash label="Checking your session…" />;
  if (session.status === "signed_out") return <Navigate to="/signup" replace />;
  return <Setup userId={session.session.user.id} email={session.session.user.email ?? ""} />;
}

function Setup({ userId, email }: { userId: string; email: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Own key: qk.memberships holds the organisation provider's { profile, organisations } shape.
  const memberships = useQuery({
    queryKey: [...qk.memberships(userId), "signup"],
    queryFn: () => listMemberships(userId),
  });
  const domain = email.split("@")[1] ?? "";
  const [step, setStep] = useState(0);
  const [another, setAnother] = useState(false);
  const [name, setName] = useState(() => orgFromDomain(domain));
  const [region, setRegion] = useState<"uk" | "eu">("uk");
  const [currency, setCurrency] = useState<"GBP" | "EUR">("GBP");
  const [fyStart, setFyStart] = useState(8);
  const create = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      const id = await createOrganisation({
        name,
        region,
        currency,
        financialYearStartMonth: fyStart,
      });
      // Open the new organisation next time. Best effort: the organisation already exists, and
      // the app falls back to the user's first membership if this doesn't stick.
      await setLastOrganisation(userId, id).catch(() => undefined);
      return id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.memberships(userId) });
      setStep(3);
    },
  });
  const steps = ["Organisation", "Region and money", "Lifecycle", "Get started"];
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";

  if (memberships.isPending) return <Splash label="Checking your organisations…" />;
  const existing = memberships.data ?? [];
  if (existing.length && step < 3 && !another)
    return (
      <CentredCard title="You're already in an organisation">
        <p className="text-sm text-muted-foreground">
          You're a member of {existing.map((item) => item.name).join(", ")}. You can carry on there,
          or set up a separate organisation.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/portfolio">Go to your organisation</Link>
          </Button>
          <Button variant="ghost" onClick={() => setAnother(true)}>
            Set up another
          </Button>
        </div>
      </CentredCard>
    );

  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 p-6">
      <div className="w-full max-w-2xl rounded-xl border border-border/70 bg-card p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Set up your organisation · about 2 minutes
        </p>
        <ol className="mt-4 flex flex-wrap gap-2 text-xs">
          {steps.map((label, i) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1",
                i === step
                  ? "border-primary bg-primary/10 text-primary"
                  : i < step
                    ? "text-health-good-foreground"
                    : "text-muted-foreground",
              )}
            >
              {i < step && <Check className="size-3" />}
              {label}
            </li>
          ))}
        </ol>

        <div className="mt-6 min-h-56 space-y-4">
          {step === 0 && (
            <>
              <h1 className="text-2xl font-semibold">Name your organisation</h1>
              <p className="text-sm text-muted-foreground">
                Suggested from your email address. Colleagues see this name when you invite them.
              </p>
              <label className="block text-sm">
                Organisation name
                <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <p className="text-xs text-muted-foreground">
                Signed in as {email}. You'll be the organisation's admin.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-semibold">Region and money</h1>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm">
                  Data stored in
                  <select
                    className={cn(sel, "mt-1")}
                    value={region}
                    onChange={(e) => setRegion(e.target.value as "uk" | "eu")}
                  >
                    <option value="uk">UK</option>
                    <option value="eu">EU</option>
                  </select>
                </label>
                <label className="text-sm">
                  Currency
                  <select
                    className={cn(sel, "mt-1")}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as "GBP" | "EUR")}
                  >
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </label>
                <label className="text-sm">
                  Financial year starts
                  <select
                    className={cn(sel, "mt-1")}
                    value={fyStart}
                    onChange={(e) => setFyStart(Number(e.target.value))}
                  >
                    {months.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="text-2xl font-semibold">Your lifecycle</h1>
              <p className="text-sm text-muted-foreground">
                New organisations start with the six-phase university IT lifecycle: pre-project,
                feasibility, design and procure, build and test, deploy and handover, close. Rename
                phases, change gate criteria or add your own in Settings → Lifecycle.
              </p>
              {create.isError && (
                <p
                  role="alert"
                  className="rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"
                >
                  {errorMessage(create.error)}
                </p>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="text-2xl font-semibold">{name} is ready</h1>
              <p className="text-sm text-muted-foreground">
                Your organisation is empty: add a portfolio, programmes and projects, or connect
                Microsoft 365.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => navigate({ to: "/portfolio" })}
                  className="rounded-lg border p-5 text-left hover:bg-muted/50"
                >
                  <p className="font-semibold">Go to your portfolio</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start adding programmes and projects.
                  </p>
                </button>
                <button
                  onClick={() => navigate({ to: "/connect-microsoft" })}
                  className="rounded-lg border p-5 text-left hover:bg-muted/50"
                >
                  <p className="font-semibold">Connect Microsoft 365</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ask your admin to approve Planner and directory access.
                  </p>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-between">
          <Button
            variant="ghost"
            disabled={step === 0 || step === 3 || create.isPending}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
          {step < 2 && (
            <Button disabled={!name.trim()} onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          )}
          {step === 2 && (
            <Button disabled={create.isPending || !name.trim()} onClick={() => create.mutate()}>
              {create.isPending && <LoaderCircle className="animate-spin" />}Create organisation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
