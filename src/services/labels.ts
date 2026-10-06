// Database enum values ⇄ the labels the screens use. Pure lookups: no health logic lives here
// (health is computed by the database views; this only turns "amber" into "At Risk").
import type { Database } from "@/integrations/supabase/types";
import type { Health, MilestoneStatus, MilestoneType, Priority } from "@/data/types";

type Enums = Database["public"]["Enums"];

const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;

export const healthLabel: Record<Enums["health"], Health> = {
  green: "On Track",
  amber: "At Risk",
  red: "Off Track",
  not_set: "Not Set",
};
export const toHealth = (value: Enums["health"] | null | undefined): Health =>
  value ? healthLabel[value] : "Not Set";

export type ProjectStateLabel = "Proposed" | "Active" | "On Hold" | "Closed";
export const projectStateLabel: Record<Enums["project_state"], ProjectStateLabel> = {
  proposed: "Proposed",
  active: "Active",
  on_hold: "On Hold",
  closed: "Closed",
};
export const projectStateValue = invert(projectStateLabel);

export type EntityStateLabel = "Active" | "Closed";
export const entityStateLabel: Record<Enums["entity_state"], EntityStateLabel> = {
  active: "Active",
  closed: "Closed",
};

export const priorityLabel: Record<Enums["priority"], Priority> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};
export const priorityValue = invert(priorityLabel);

export type TierLabel = "Small" | "Medium" | "Large";
export const tierLabel: Record<Enums["project_tier"], TierLabel> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export type OpenClosedLabel = "Open" | "Closed";
export const openClosedLabel: Record<Enums["open_closed"], OpenClosedLabel> = {
  open: "Open",
  closed: "Closed",
};
export const openClosedValue = invert(openClosedLabel);

export type SeverityLabel = "Low" | "Medium" | "High";
export const severityLabel: Record<Enums["issue_severity"], SeverityLabel> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
export const severityValue = invert(severityLabel);

export type ResponseLabel = "Avoid" | "Reduce" | "Transfer" | "Accept";
export const responseLabel: Record<Enums["risk_response"], ResponseLabel> = {
  avoid: "Avoid",
  reduce: "Reduce",
  transfer: "Transfer",
  accept: "Accept",
};
export const responseValue = invert(responseLabel);

export const milestoneTypeLabel: Record<Enums["milestone_type"], MilestoneType> = {
  delivery: "Delivery",
  gate: "Gate",
  key_date: "Key date",
  external_dependency: "External dependency",
};
export const milestoneTypeValue = invert(milestoneTypeLabel);

/** v_milestones.status is text derived by the database's date rule. */
export const milestoneStatusLabel = (value: string | null): MilestoneStatus =>
  (
    ({
      completed: "Completed",
      overdue: "Overdue",
      late: "Late",
      on_track: "On Track",
      future: "Future",
    }) as Record<string, MilestoneStatus>
  )[value ?? ""] ?? "Future";
