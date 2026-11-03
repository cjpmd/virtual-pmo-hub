// Block registry types (spec §6.1). A block is pure: its data comes from one SQL function
// (private.rb_<key>, called through report_block_data, RB-10) and its renderer never fetches.
import type { FC } from "react";
import type { z } from "zod";

export type ScopeLevel = "project" | "programme" | "portfolio" | "custom";

export type BlockCategory =
  | "meta"
  | "layout"
  | "narrative"
  | "status"
  | "assurance"
  | "progress"
  | "roadmap"
  | "budget"
  | "resources"
  | "decisions"
  | "raid"
  | "dependencies"
  | "benefits"
  | "requests"
  | "governance";

/** A rating scheme level (rating_schemes.levels). `rag` maps evidenced RAG onto the scheme. */
export interface RatingLevel {
  key: string;
  label: string;
  colour: string;
  rank: number;
  rag: "green" | "amber" | "red" | "not_set";
}

export interface RatingScheme {
  id: string | null;
  key: string;
  name: string;
  levels: RatingLevel[];
  isAssurance: boolean;
}

export interface RiskBand {
  min: number;
  max: number;
  key: string;
  label: string;
  colour: string;
}

export interface RiskMatrix {
  name: string;
  bands: RiskBand[];
}

/** One placed block in a template or report (stored in `blocks` jsonb). */
export interface BlockInstance {
  id: string;
  blockKey: string;
  blockVersion: number;
  title?: string;
  config: unknown;
  placement: "report" | "deep_dive";
  pageBreakBefore?: boolean;
  hideFromPartners?: boolean;
}

/** What a renderer gets besides its data. */
export interface RenderContext {
  scheme: RatingScheme;
  mode: "screen" | "print" | "present";
  audience: "internal" | "partner";
  /** Report id when rendering a saved report (narrative editing, links). */
  reportId: string | null;
  /** Deep-dive project, when the block repeats per project. */
  entityId: string | null;
  /** True when the viewer can edit draft content (narratives). */
  editable: boolean;
  /** Snapshot (published) or live (draft) data. */
  source: "live" | "snapshot";
  asAt: string;
  instance: BlockInstance;
  /** Per-project movement since the previous published pack (changes_since_last markers). */
  movement?: Record<string, ProjectMovement>;
}

export interface ProjectMovement {
  evidenced?: { from: string | null; to: string | null };
  declared?: { from: string | null; to: string | null };
  eacChange?: number | null;
  slipChange?: number | null;
}

export interface BlockDefinition<C = Record<string, unknown>, D = unknown> {
  key: string;
  version: number;
  name: string;
  category: BlockCategory;
  description: string;
  supportedScopes: ScopeLevel[];
  /** Can render inside a project deep-dive. */
  perEntity: boolean;
  configSchema: z.ZodType<C, z.ZodTypeDef, unknown>;
  defaultConfig: C;
  exposedMetrics?: string[];
  Renderer: FC<{ data: D; config: C; ctx: RenderContext }>;
  PrintRenderer?: FC<{ data: D; config: C; ctx: RenderContext }>;
  migrateConfig?: (old: unknown, fromVersion: number) => C;
  /** False = hidden from partner organisations by default (spec §14). */
  partnerSafe: boolean;
  /** Blocks with no data call (layout). */
  static?: boolean;
  /** Phase the block was introduced in (catalogue grouping only). */
  phase: 1 | 2 | 3 | 4;
}

// Registries hold definitions of different config/data types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBlockDefinition = BlockDefinition<any, any>;
