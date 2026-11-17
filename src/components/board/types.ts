import { type ReactNode } from "react";
import { type SavedViewRecord } from "@/services/saved-views";

export type BoardViewType = "table" | "kanban" | "timeline" | "calendar" | "chart";
export type BoardColumnType =
  | "text"
  | "status"
  | "people"
  | "date"
  | "timeline"
  | "number"
  | "progress"
  | "priority"
  | "tags"
  | "link"
  | "dependency"
  | "formula";
export interface BoardRow {
  id: string;
  title: string;
  status?: string;
  people?: string[];
  start?: string;
  finish?: string;
  number?: number;
  progress?: number;
  priority?: string;
  tags?: string[];
  link?: string;
  dependencies?: string[];
  formula?: string;
  group?: string;
  complete?: boolean;
  baselineFinish?: string;
  [key: string]: unknown;
}
export interface BoardColumn {
  key: string;
  label: string;
  type: BoardColumnType;
  editable?: boolean;
  unit?: string;
  options?: string[];
  summary?: "sum" | "average" | "count" | "rag";
  width?: number;
}
export interface BoardFilter {
  key: string;
  operator: "equals" | "notEquals" | "includes" | "oneOf" | "truthy";
  value?: string | string[];
}
export interface SavedView {
  id: string;
  name: string;
  type: BoardViewType;
  groupBy: string;
  sortKey: string;
  filter: string;
  filters?: BoardFilter[];
  visible: string[];
  isDefault: boolean;
  /** Where the view comes from: seeded in code (read-only), or saved (saved_views). */
  source?: "seeded" | "saved";
  /** Saved views only. */
  record?: SavedViewRecord;
}
export type BoardRecordChange =
  | { kind: "create"; values: BoardRow }
  | { kind: "update"; id: string; patch: Partial<BoardRow> }
  | { kind: "delete"; ids: string[] };
export interface BoardProps {
  title: string;
  rows: BoardRow[];
  columns: BoardColumn[];
  groupOptions?: string[];
  initialView?: BoardViewType;
  planner?: boolean;
  onRowsChange?: (rows: BoardRow[]) => void;
  onEdit?: () => void;
  renderTitle?: (row: BoardRow) => ReactNode;
  /** Shown after the title in the table (e.g. the GL-9 Sample chip); the title stays editable. */
  titleAdornment?: (row: BoardRow) => ReactNode;
  seededViews?: SavedView[];
  actions?: ReactNode;
  seededAutomations?: string[];
  storageKey?: string;
  /** Stable key for this board's saved views (saved_views.board_key); without one, views aren't saved. */
  boardKey?: string;
  itemLabel?: string;
  manage?: boolean;
  onRecordChange?: (change: BoardRecordChange) => void;
  /** False hides Delete (e.g. the user may edit but not delete). Defaults to true. */ canDelete?: boolean;
  /** False hides New (records created elsewhere). Defaults to true. */ canCreate?: boolean;
  /** Open a row in the caller's own detail view instead of the built-in item panel. */
  onOpenRow?: (row: BoardRow) => void;
  /** False makes every cell of that row read-only (e.g. a recorded decision). */
  rowEditable?: (row: BoardRow) => boolean;
  /** Group-by keys a kanban drag can't change (e.g. a status only RPCs set): cards don't drag. */
  lockedGroups?: string[];
}
