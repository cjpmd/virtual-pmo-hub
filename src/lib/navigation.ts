import { BarChart3, BookOpenCheck, BriefcaseBusiness, CalendarRange, ChartNoAxesCombined, ClipboardList, Diamond, FileText, FlaskConical, Gauge, GitFork, Gift, Home, Landmark, LayoutDashboard, Layers3, ListChecks, ListTodo, Rows3, ScrollText, Settings, ShieldAlert, Target, UsersRound, Waypoints } from "lucide-react";
import type { TermKey } from "@/data/settings-types";

export interface SubPage { to: string; label: string; icon: typeof Home; termKey?: TermKey }
export interface Section { id: string; to: string; label: string; icon: typeof Home; description: string; pages: SubPage[] }

/** Single source of truth for the sidebar, section tab bars, breadcrumbs and the command palette. */
export const sections: Section[] = [
  {
    id: "home", to: "/home", label: "Home", icon: Home, description: "Your work, your dates and anything waiting on you.",
    pages: [
      { to: "/home/my-work", label: "My Work", icon: ListTodo },
      { to: "/home/my-timeline", label: "My Timeline", icon: CalendarRange },
      { to: "/home/issued", label: "Issued to me", icon: ListChecks },
      { to: "/home/approvals", label: "Approvals", icon: ClipboardList },
      { to: "/home/notifications", label: "Notifications", icon: ScrollText },
    ],
  },
  {
    id: "portfolio", to: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness, description: "Investment, structure and pipeline.",
    pages: [
      { to: "/portfolio", label: "Overview", icon: Gauge },
      { to: "/portfolio/programmes", label: "Programmes", icon: Layers3, termKey: "programmePlural" },
      { to: "/portfolio/projects", label: "Projects", icon: BriefcaseBusiness, termKey: "projectPlural" },
      { to: "/portfolio/collections", label: "Collections", icon: Landmark, termKey: "collectionPlural" },
      { to: "/portfolio/roadmap", label: "Roadmap", icon: CalendarRange },
      { to: "/portfolio/requests", label: "Requests", icon: ListTodo },
    ],
  },
  {
    id: "delivery", to: "/delivery", label: "Delivery", icon: ListChecks, description: "What is being delivered, when, and what it waits on.",
    pages: [
      { to: "/delivery/tasks", label: "Tasks", icon: ListTodo, termKey: "task" },
      { to: "/delivery/milestones", label: "Milestones", icon: Diamond, termKey: "milestonePlural" },
      { to: "/delivery/dependencies", label: "Dependencies", icon: Waypoints, termKey: "dependencyPlural" },
      { to: "/delivery/issue-tasks", label: "Issue tasks", icon: ListChecks },
    ],
  },
  {
    id: "resources", to: "/resources", label: "Resources", icon: UsersRound, description: "Capacity, allocation and scenario planning.",
    pages: [
      { to: "/resources", label: "Dashboard", icon: Gauge },
      { to: "/resources/assignments", label: "Assignments", icon: Rows3 },
      { to: "/resources/allocation", label: "Allocation", icon: CalendarRange },
      { to: "/resources/scenarios", label: "Scenarios", icon: FlaskConical },
    ],
  },
  {
    id: "governance", to: "/governance", label: "Governance", icon: ShieldAlert, description: "RAIDD, change, lessons and committee reporting.",
    pages: [
      { to: "/governance/raidd", label: "RAIDD", icon: ShieldAlert },
      { to: "/governance/forum", label: "Decision forum", icon: Landmark },
      { to: "/governance/changes", label: "Changes", icon: GitFork },
      { to: "/governance/lessons", label: "Lessons", icon: BookOpenCheck, termKey: "lesson" },
      { to: "/governance/improvement-actions", label: "Improvement actions", icon: ListChecks },
      { to: "/governance/committee-packs", label: "Committee packs", icon: FileText },
    ],
  },
  {
    id: "benefits", to: "/benefits", label: "Benefits", icon: Gift, description: "Value planned, mapped, measured and realised.",
    pages: [
      { to: "/benefits", label: "Value dashboard", icon: Gauge },
      { to: "/benefits/register", label: "Register", icon: Rows3 },
      { to: "/benefits/map", label: "Map", icon: Target },
      { to: "/benefits/realisation", label: "Realisation", icon: ChartNoAxesCombined },
    ],
  },
  {
    id: "insights", to: "/insights", label: "Insights", icon: BarChart3, description: "Dashboards and reporting across the portfolio.",
    pages: [
      { to: "/insights/dashboards", label: "Dashboards", icon: LayoutDashboard },
      { to: "/insights/reports", label: "Reports", icon: FileText },
    ],
  },
];

export const settingsSection: Section = {
  id: "settings", to: "/settings", label: "Settings", icon: Settings, description: "Configure the workspace.",
  pages: [],
};

/** The section a path belongs to, matching the longest section prefix. */
export function findSection(pathname: string): Section | undefined {
  if (pathname.startsWith("/settings")) return settingsSection;
  return [...sections].sort((a, b) => b.to.length - a.to.length).find(section => pathname === section.to || pathname.startsWith(`${section.to}/`));
}
/** The sub-page within a section, preferring the longest matching address. */
export function findPage(section: Section, pathname: string): SubPage | undefined {
  const candidates = section.pages.filter(page => pathname === page.to || pathname.startsWith(`${page.to}/`));
  return candidates.sort((a, b) => b.to.length - a.to.length)[0];
}
export const allPages = sections.flatMap(section => section.pages.map(page => ({ ...page, section })));
