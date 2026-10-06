// The public homepage at /. Signed-out visitors see what Virtual PMO is and how to start;
// signed-in users are sent straight to their workspace (see routes/index.tsx).
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarRange,
  Gauge,
  Landmark,
  ListChecks,
  LockKeyhole,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <Gauge className="size-5" />,
    title: "Health from the evidence",
    text: "Schedule, finance, effort, issues and benefits are worked out from the data, so a RAG means the same thing on every screen and in every board pack.",
  },
  {
    icon: <Sparkles className="size-5" />,
    title: "Benefits that get measured",
    text: "Profiles, measures and targets, owners prompted when a measurement is due, PMO validation, and handover to the service that keeps the benefit.",
  },
  {
    icon: <Landmark className="size-5" />,
    title: "Governance without the chasing",
    text: "Decisions with options and rationale, RAIDD logs, change requests, stage gates and a committee pack built from live data.",
  },
  {
    icon: <ListChecks className="size-5" />,
    title: "Delivery in one place",
    text: "Tasks, milestones, dependencies and roadmaps across every project, with issued work that people accept, decline or re-date.",
  },
  {
    icon: <UsersRound className="size-5" />,
    title: "Capacity you can plan with",
    text: "Bookings against contracted hours, leave and BAU, so over-allocation shows up before it becomes a missed date.",
  },
  {
    icon: <BookOpenCheck className="size-5" />,
    title: "Lessons that change things",
    text: "Phase reviews, recurring themes across projects and improvement actions, surfaced when the next similar project starts.",
  },
];

const steps = [
  { title: "Sign up with your work email", text: "We send you a link. No passwords." },
  {
    title: "Set up your organisation",
    text: "Region, currency and when your financial year starts. The lifecycle comes ready to edit.",
  },
  {
    title: "Bring in your portfolio",
    text: "Add programmes and projects, invite colleagues and give each the right role.",
  },
];

function Mark() {
  return (
    <span className="grid size-8 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
      VP
    </span>
  );
}

/** An illustrative portfolio summary for the hero (not live data). */
function Preview() {
  const rows = [
    { name: "Digital student journey", rag: "bg-health-good", label: "On track", width: "72%" },
    { name: "Research data platform", rag: "bg-health-warn", label: "At risk", width: "48%" },
    { name: "Network refresh", rag: "bg-health-good", label: "On track", width: "86%" },
    { name: "Identity and access", rag: "bg-health-bad", label: "Off track", width: "35%" },
  ];
  return (
    <div aria-hidden className="rounded-xl border border-border/70 bg-card p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Portfolio overview
        </p>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
          Example
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Active projects", "24"],
          ["On track", "67%"],
          ["Benefits realised", "£1.2m"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/60 p-3">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div>
              <p className="text-xs font-medium">{row.name}</p>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: row.width }} />
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold">
              <span className={cn("size-2 rounded-full", row.rag)} />
              {row.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PublicHome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-display font-semibold">
            <Mark />
            Virtual PMO
          </Link>
          <nav className="ml-6 hidden gap-5 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              What it does
            </a>
            <a href="#how" className="hover:text-foreground">
              Getting started
            </a>
            <a href="#trust" className="hover:text-foreground">
              Security
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/signin">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Start free trial</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              For university IT and change teams
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
              Every project, programme and benefit, in one honest view.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Virtual PMO brings portfolio health, governance, delivery and benefits together, with
              health worked out from the evidence rather than copied between spreadsheets.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">
                  Start free trial
                  <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/signin">Sign in</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Sign up with your work email. No card, no passwords.
            </p>
          </div>
          <Preview />
        </section>

        <section id="features" className="border-t border-border/60 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl font-semibold">What it does</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Built around how university PMOs actually work: a six-phase lifecycle, stage gates,
              committees and a financial year that starts in August.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-lg border border-border/70 bg-card p-6 shadow-sm"
                >
                  <span className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground">
                    {feature.icon}
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-semibold">Getting started takes minutes</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-lg border border-border/70 bg-card p-6 shadow-sm"
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="trust" className="border-t border-border/60 bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
            <div className="flex gap-3">
              <LockKeyhole className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Your data stays yours</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Each organisation is kept separate in the database itself, not just in the
                  screens.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Roles that match your PMO</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Admin, PMO, manager, contributor and viewer, per workspace. People only see the
                  buttons they can use.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Scale className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">An audit trail by design</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Status reports keep the evidence at the time they were submitted; closed and
                  archived work is never deleted.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <CalendarRange className="mx-auto size-8 text-primary" />
          <h2 className="mt-4 font-display text-3xl font-semibold">
            Ready for your next board pack?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Set up your organisation now and invite your project managers when you're ready.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup">
                Start free trial
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2 font-display font-semibold text-foreground">
            <Mark />
            Virtual PMO
          </span>
          <span>Portfolio management for universities.</span>
          <Link to="/signin" className="ml-auto hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
