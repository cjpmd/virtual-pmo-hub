import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { SiteFooter, SiteHeader, SitePage } from "@/components/marketing/site-chrome";
import { siteFontLinks } from "@/components/marketing/site-fonts";
import { contactEmail } from "@/lib/features";
import { cn } from "@/lib/utils";

const title = "Request access — Virtual PMO";
const description =
  "Ask for access to Virtual PMO for your organisation, or book a demo with the team.";

export const Route = createFileRoute("/request-access")({
  validateSearch: (search: Record<string, unknown>): { demo?: boolean } =>
    search["demo"] === true || search["demo"] === "true" ? { demo: true } : {},
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
  component: RequestAccessPage,
});

type Interest = "access" | "demo";

const fieldClass =
  "mt-1.5 block w-full rounded-lg border border-site-line bg-site-paper px-3 py-2.5 text-base text-site-text outline-none focus:border-site-accent focus:ring-2 focus:ring-site-accent/25";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[0.9rem] font-medium text-site-text-soft">
      {label}
      {children}
    </label>
  );
}

/**
 * Access is by arrangement while self-service sign-up is off (VITE_SELF_SIGNUP). There is no
 * request store yet, so the form opens an email to VITE_CONTACT_EMAIL with the details filled in.
 */
function RequestAccessPage() {
  const { demo } = Route.useSearch();
  const [interest, setInterest] = useState<Interest>(demo ? "demo" : "access");
  const [form, setForm] = useState({ name: "", email: "", organisation: "", role: "", notes: "" });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const subject =
    interest === "demo"
      ? `Demo request: ${form.organisation || "Virtual PMO"}`
      : `Access request: ${form.organisation || "Virtual PMO"}`;
  const body = [
    `Name: ${form.name}`,
    `Work email: ${form.email}`,
    `Organisation: ${form.organisation}`,
    `Role: ${form.role}`,
    `Interested in: ${interest === "demo" ? "a demo" : "access for our organisation"}`,
    "",
    form.notes,
  ].join("\n");
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <SitePage>
      <div className="bg-site-ink text-site-on-ink">
        <SiteHeader />
        <div className="mx-auto max-w-[1240px] px-7 pt-14 pb-16">
          <h1 className="m-0 max-w-[20ch] text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.08] font-semibold tracking-[-0.03em]">
            {interest === "demo" ? "Book a demo." : "Get started with Virtual PMO."}
          </h1>
          <p className="mt-4 max-w-[40rem] text-[1.1rem] leading-[1.6] text-site-on-ink-muted">
            We're setting organisations up one at a time. Tell us a little about yours and we'll
            arrange access or a walkthrough with your team.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-[1240px] px-7 py-14">
        <form
          className="grid max-w-[44rem] gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (contactEmail) window.location.href = mailto;
          }}
        >
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-[0.9rem] font-medium text-site-text-soft">I'd like</legend>
            {(
              [
                ["access", "Access for my organisation"],
                ["demo", "A demo"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-[0.95rem]",
                  interest === value
                    ? "border-site-accent bg-site-tint-blue text-site-accent-strong"
                    : "border-site-line text-site-text-soft",
                )}
              >
                <input
                  type="radio"
                  name="interest"
                  value={value}
                  checked={interest === value}
                  onChange={() => setInterest(value)}
                  className="accent-site-accent"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name">
              <input
                className={fieldClass}
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
              />
            </Field>
            <Field label="Work email">
              <input
                className={fieldClass}
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => set("email")(e.target.value)}
              />
            </Field>
            <Field label="Organisation">
              <input
                className={fieldClass}
                required
                autoComplete="organization"
                value={form.organisation}
                onChange={(e) => set("organisation")(e.target.value)}
              />
            </Field>
            <Field label="Your role">
              <input
                className={fieldClass}
                autoComplete="organization-title"
                value={form.role}
                onChange={(e) => set("role")(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Anything we should know (optional)">
            <textarea
              className={cn(fieldClass, "min-h-28")}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </Field>
          {contactEmail ? (
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                className="inline-flex min-h-[50px] items-center rounded-[10px] bg-site-accent px-6 font-semibold text-white hover:bg-site-accent-strong"
              >
                {interest === "demo" ? "Request a demo" : "Request access"}
              </button>
              <p className="text-[0.9rem] text-site-text-muted">
                This opens an email to {contactEmail} with your details filled in.
              </p>
            </div>
          ) : (
            <p
              role="status"
              className="rounded-lg border border-site-line bg-site-tint-blue p-4 text-[0.95rem] text-site-text-soft"
            >
              Requests aren't being taken online yet. Please contact the Virtual PMO team directly.
            </p>
          )}
          <p className="text-[0.95rem] text-site-text-muted">
            Already have an account?{" "}
            <Link to="/signin" className="font-medium text-site-accent-strong hover:underline">
              Log in
            </Link>
          </p>
        </form>
      </main>

      <SiteFooter />
    </SitePage>
  );
}
