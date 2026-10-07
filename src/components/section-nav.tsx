import { Fragment, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { findPage, findSection, type SubPage } from "@/lib/navigation";
import { useSettings, term } from "@/services/settings";
import { cn } from "@/lib/utils";

/** The current section's pages, as tabs in the dark header band. */
export function SectionTabs() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const settings = useSettings();
  const section = findSection(path);
  if (!section || section.pages.length < 2) return null;
  const active = findPage(section, path);
  const label = (page: SubPage) => (page.termKey ? term(page.termKey, settings) : page.label);
  return (
    <nav
      aria-label={`${section.label} pages`}
      className="flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none]"
    >
      {section.pages.map((page) => {
        const current = active?.to === page.to;
        return (
          <Link
            key={page.to}
            to={page.to}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex h-14 shrink-0 items-center px-2.5 text-[13px] transition-colors",
              current
                ? "font-semibold text-pmo-text shadow-[inset_0_-2px_0_var(--pmo-accent)]"
                : "text-pmo-muted hover:text-pmo-text",
            )}
          >
            {label(page)}
          </Link>
        );
      })}
    </nav>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

/** Breadcrumb trail, e.g. Portfolio › DTS 2025/26 › Efficiency, Automation & AI › Ebbot. */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  if (!trail.length) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
    >
      {trail.map((crumb, index) => (
        <Fragment key={`${crumb.label}-${index}`}>
          {index > 0 && <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />}
          {crumb.to && index < trail.length - 1 ? (
            <Link to={crumb.to} className="truncate hover:text-foreground hover:underline">
              {crumb.label}
            </Link>
          ) : (
            <span
              className={cn(
                "truncate",
                index === trail.length - 1 && "font-medium text-foreground",
              )}
            >
              {crumb.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/** Breadcrumbs derived from the route, with optional extra crumbs for a drill-down. */
export function AutoBreadcrumbs({ extra = [] }: { extra?: Crumb[] }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const settings = useSettings();
  const section = findSection(path);
  if (!section) return null;
  const page = findPage(section, path);
  const trail: Crumb[] = [{ label: section.label, to: section.to }];
  if (page && page.to !== section.to)
    trail.push({ label: page.termKey ? term(page.termKey, settings) : page.label, to: page.to });
  return <Breadcrumbs trail={[...trail, ...extra]} />;
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
