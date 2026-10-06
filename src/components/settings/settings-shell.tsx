import type { ReactNode } from "react";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { Link } from "@tanstack/react-router";
import {
  Banknote,
  BellRing,
  Building2,
  ClipboardList,
  Clock4,
  CreditCard,
  Database,
  FileStack,
  Gift,
  Globe2,
  Languages,
  LayoutList,
  Plug,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SettingsSectionDefinition {
  id: string;
  label: string;
  icon: typeof Building2;
  blurb: string;
}

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: "account",
    label: "Account settings",
    icon: UserRound,
    blurb: "Your name and account details.",
  },
  {
    id: "organisation",
    label: "Organisation",
    icon: Building2,
    blurb: "Name, logo, brand colour and support contact.",
  },
  {
    id: "regional",
    label: "Regional & currency",
    icon: Globe2,
    blurb: "Currency, dates, locale, time zone and financial year.",
  },
  {
    id: "working-time",
    label: "Working time",
    icon: Clock4,
    blurb: "Standard hours, working days, holidays and BAU.",
  },
  {
    id: "terminology",
    label: "Terminology",
    icon: Languages,
    blurb: "Rename core entities and roles across the app.",
  },
  {
    id: "lifecycle",
    label: "Lifecycle & governance",
    icon: ClipboardList,
    blurb: "Phases, gate criteria, tiers and RAG thresholds.",
  },
  {
    id: "risk",
    label: "Risk & RAIDD",
    icon: ShieldAlert,
    blurb: "Matrix size, score bands, appetite and option lists.",
  },
  {
    id: "benefits",
    label: "Benefits",
    icon: Gift,
    blurb: "Categories, classifications, optimism bias and cadence.",
  },
  {
    id: "lists",
    label: "Lists & categories",
    icon: LayoutList,
    blurb: "Lessons categories, project types, units and tags.",
  },
  {
    id: "users",
    label: "Users, roles & permissions",
    icon: Users,
    blurb: "People, roles, default home pages and permissions.",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: BellRing,
    blurb: "Channels, digest frequency and per-event toggles.",
  },
  {
    id: "templates",
    label: "Templates",
    icon: FileStack,
    blurb: "Project, status report and committee pack templates.",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Plug,
    blurb: "Microsoft 365 and Planner connections.",
  },
  {
    id: "data",
    label: "Data & audit",
    icon: Database,
    blurb: "Import, export, retention and the audit log.",
  },
  {
    id: "subscription",
    label: "Subscription",
    icon: CreditCard,
    blurb: "Plan, seats and renewal.",
  },
];
export const isSettingsSection = (id: string) =>
  settingsSections.some((section) => section.id === id);
export const financeIcon = Banknote;

/** Left-hand settings menu with the section content beside it. */
export function SettingsShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[264px_1fr]">
      <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const current = section.id === active;
            return (
              <Link
                key={section.id}
                to="/settings/$section"
                params={{ section: section.id }}
                className={cn(
                  "flex items-start gap-3 border-b px-3.5 py-2.5 text-sm last:border-0 transition-colors",
                  current
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", current && "text-primary")} />
                <span className="min-w-0">
                  <span className={cn("block truncate font-medium", current && "text-foreground")}>
                    {section.label}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}

const roleRank: Record<string, number> = {
  viewer: 0,
  contributor: 1,
  manager: 2,
  pmo: 3,
  admin: 4,
};
/** Who may change a card's settings (RLS: organisation settings need admin, shared lists and lifecycle need pmo). */
export type SettingsAccess = "admin" | "pmo" | "self";
export function useCanEditSettings(requires: SettingsAccess) {
  const { organisation } = useOrganisation();
  return requires === "self" || (roleRank[organisation.role] ?? 0) >= (roleRank[requires] ?? 4);
}

export function SettingsCard({
  title,
  description,
  children,
  actions,
  requires = "admin",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  requires?: SettingsAccess;
}) {
  const canEdit = useCanEditSettings(requires);
  return (
    <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {canEdit && actions}
      </div>
      {!canEdit && (
        <p className="mt-3 rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Only {requires === "pmo" ? "PMO members and admins" : "organisation admins"} can change
          these settings.
        </p>
      )}
      {/* A disabled fieldset disables every control inside it, so read-only users can't make edits that would be refused. */}
      <fieldset disabled={!canEdit} className="mt-5 min-w-0 disabled:opacity-80">
        {children}
      </fieldset>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={cn("block space-y-1.5", wide && "sm:col-span-2")}>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <Field label={label} {...(hint ? { hint } : {})} {...(wide ? { wide: true } : {})}>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <Field label={label} {...(hint ? { hint } : {})} {...(wide ? { wide: true } : {})}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Editable list of free-text options used by the list-driven settings sections. */
export function ListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
          >
            {value}
            <button
              onClick={() => onChange(values.filter((_, position) => position !== index))}
              aria-label={`Remove ${value}`}
              className="text-muted-foreground hover:text-health-bad-foreground"
            >
              ×
            </button>
          </span>
        ))}
        {!values.length && (
          <span className="text-xs text-muted-foreground">Nothing configured.</span>
        )}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("value") as HTMLInputElement | null;
          if (input?.value.trim()) {
            onChange([...values, input.value.trim()]);
            input.value = "";
          }
        }}
      >
        <Input
          name="value"
          placeholder={placeholder ?? "Add an option…"}
          className="h-9 max-w-64"
        />
        <Button type="submit" size="sm" variant="outline">
          Add
        </Button>
      </form>
    </div>
  );
}
