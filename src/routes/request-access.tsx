import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { SiteFooter, SitePage } from "@/components/marketing/site-chrome";
import { sitePill } from "@/components/marketing/site-styles";
import { siteFontLinks } from "@/components/marketing/site-fonts";
import { SiteHero } from "@/components/marketing/site-page-parts";
import { contactEmail } from "@/lib/features";
import { cn } from "@/lib/utils";

const title = "Contact sales / book a demo — ORMO PMO";
const description = "Talk to the ORMO PMO team about your organisation, or book a demo.";

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
  "mt-1.5 block w-full rounded-[10px] border border-site-line bg-site-surface px-3 py-2.5 text-base text-site-text outline-none focus:border-site-accent-strong focus:ring-2 focus:ring-site-accent-strong/25";

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
      ? `Demo request: ${form.organisation || "ORMO PMO"}`
      : `Sales enquiry: ${form.organisation || "ORMO PMO"}`;
  const body = [
    `Name: ${form.name}`,
    `Work email: ${form.email}`,
    `Organisation: ${form.organisation}`,
    `Role: ${form.role}`,
    `Interested in: ${interest === "demo" ? "a demo" : "talking to sales"}`,
    "",
    form.notes,
  ].join("\n");
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <SitePage>
      <SiteHero eyebrow="Contact" title="Contact sales or book a demo.">
        Tell us a little about your organisation and we'll get back to you, or arrange a walkthrough
        with your team. Want to try it yourself?{" "}
        <Link to="/signup" className="font-semibold text-site-link hover:text-site-link-hover">
          Start a free trial
        </Link>
        .
      </SiteHero>

      <main className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-8 sm:py-20">
        <form
          className="grid max-w-[44rem] gap-5 rounded-[20px] border border-site-line bg-site-surface p-6 sm:p-9"
          onSubmit={(event) => {
            event.preventDefault();
            if (contactEmail) window.location.href = mailto;
          }}
        >
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-[0.9rem] font-medium text-site-text-soft">I'd like</legend>
            {(
              [
                ["access", "Talk to sales"],
                ["demo", "A demo"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[0.95rem]",
                  interest === value
                    ? "border-site-accent-strong bg-site-tint-blue text-site-navy"
                    : "border-site-line text-site-text-soft",
                )}
              >
                <input
                  type="radio"
                  name="interest"
                  value={value}
                  checked={interest === value}
                  onChange={() => setInterest(value)}
                  className="accent-site-accent-strong"
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
              <button type="submit" className={cn(sitePill.light, "cursor-pointer")}>
                {interest === "demo" ? "Request a demo" : "Contact sales"}
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
              Requests aren't being taken online yet. Please contact the ORMO PMO team directly.
            </p>
          )}
          <p className="text-[0.95rem] text-site-text-muted">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-site-accent-strong hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </main>

      <SiteFooter />
    </SitePage>
  );
}
