// Project page tabs and sub-tabs, and how the URL (?tab=&sub=, plus the old single-level tab
// names and ?task=<id>) maps onto them.

export const PROJECT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan" },
  { id: "delivery", label: "Delivery" },
  { id: "status", label: "Status" },
  { id: "raid", label: "RAID log" },
  { id: "resources", label: "Resources" },
  { id: "financials", label: "Financials" },
  { id: "benefits", label: "Benefits" },
  { id: "business-case", label: "Business case" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["id"];

export const PROJECT_SUBTABS = {
  plan: [
    { id: "milestones", label: "Milestones" },
    { id: "tasks", label: "Tasks" },
    { id: "dependencies", label: "Dependencies" },
  ],
  raid: [
    { id: "risks", label: "Risks / Issues" },
    { id: "decisions", label: "Decisions" },
    { id: "assumptions", label: "Assumptions" },
    { id: "lessons", label: "Lessons" },
    { id: "changes", label: "Changes" },
  ],
} as const;

export type GroupedTab = keyof typeof PROJECT_SUBTABS;
export type ProjectSubtab = (typeof PROJECT_SUBTABS)[GroupedTab][number]["id"];

export interface ProjectTabState {
  tab: ProjectTab;
  sub: ProjectSubtab | undefined;
}

/** Tab names from before the grouping (links and bookmarks still use them). */
const OLD_NAMES: Record<string, { tab: ProjectTab; sub?: ProjectSubtab }> = {
  milestones: { tab: "plan", sub: "milestones" },
  tasks: { tab: "plan", sub: "tasks" },
  dependencies: { tab: "plan", sub: "dependencies" },
  raid: { tab: "raid", sub: "risks" },
  risks: { tab: "raid", sub: "risks" },
  issues: { tab: "raid", sub: "risks" },
  decisions: { tab: "raid", sub: "decisions" },
  assumptions: { tab: "raid", sub: "assumptions" },
  lessons: { tab: "raid", sub: "lessons" },
  changes: { tab: "raid", sub: "changes" },
  "business case": { tab: "business-case" },
  businesscase: { tab: "business-case" },
};

const isTab = (value: string): value is ProjectTab => PROJECT_TABS.some((t) => t.id === value);
const isGrouped = (tab: ProjectTab): tab is GroupedTab => tab in PROJECT_SUBTABS;
const subsOf = (tab: GroupedTab): readonly { id: ProjectSubtab }[] => PROJECT_SUBTABS[tab];

/** First sub-tab of a grouped tab; undefined for the others. */
export const defaultSub = (tab: ProjectTab): ProjectSubtab | undefined =>
  isGrouped(tab) ? subsOf(tab)[0]?.id : undefined;

/**
 * Resolves the URL to a tab and sub-tab. Unknown values fall back to the tab's first sub-tab or to
 * Overview; ?task=<id> with no tab opens Plan › Tasks.
 */
export function resolveProjectTab(search: {
  tab?: string | undefined;
  sub?: string | undefined;
  task?: string | undefined;
}): ProjectTabState {
  const raw = search.tab?.trim().toLowerCase().replace(/_/g, "-");
  if (!raw) {
    return search.task ? { tab: "plan", sub: "tasks" } : { tab: "overview", sub: undefined };
  }
  const old = OLD_NAMES[raw] ?? OLD_NAMES[raw.replace(/-/g, " ")];
  const tab: ProjectTab | undefined = isTab(raw) ? raw : old?.tab;
  if (!tab) return { tab: "overview", sub: undefined };
  if (!isGrouped(tab)) return { tab, sub: undefined };
  const wanted = search.sub?.trim().toLowerCase() ?? (isTab(raw) ? undefined : old?.sub);
  const sub = subsOf(tab).find((s) => s.id === wanted)?.id;
  return { tab, sub: sub ?? defaultSub(tab) };
}

/** "Phase 3 - Design & Procure" → "Design & Procure" (lifecycle_phases names carry the prefix). */
export const phaseLabel = (name: string) => name.replace(/^Phase\s*\d+\s*[-–—:]\s*/i, "").trim();

/** Element ids tying the header's tab strip to the page's tab panel. */
export const projectTabId = (tab: ProjectTab) => `project-tab-${tab}`;
export const projectPanelId = "project-tab-panel";
