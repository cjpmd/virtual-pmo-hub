// Block registry: registerBlock(), getBlock(), listBlocks() (spec §6.1). Definitions live in
// ./catalogue/*; importing ./catalogue registers them all.
import type {
  AnyBlockDefinition,
  BlockCategory,
  BlockDefinition,
  BlockInstance,
  ScopeLevel,
} from "./types";

const blocks = new Map<string, AnyBlockDefinition>();

export function registerBlock<C, D>(definition: BlockDefinition<C, D>) {
  blocks.set(definition.key, definition as AnyBlockDefinition);
  return definition;
}

export const getBlock = (key: string): AnyBlockDefinition | undefined => blocks.get(key);

/**
 * Whether a block can render in a scope. A collection is a hand-picked list of projects, so a
 * block that supports a custom list supports a collection too (GL-14).
 */
export const supportsScope = (definition: AnyBlockDefinition, scope: ScopeLevel | "any") =>
  scope === "any" ||
  definition.supportedScopes.includes(scope) ||
  (scope === "collection" && definition.supportedScopes.includes("custom"));

export const listBlocks = (): AnyBlockDefinition[] =>
  [...blocks.values()].sort((a, b) => a.name.localeCompare(b.name));

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  meta: "Cover",
  layout: "Layout",
  narrative: "Narrative",
  status: "Status",
  assurance: "Assurance",
  progress: "Progress",
  roadmap: "Roadmap",
  budget: "Budget",
  resources: "Resources",
  decisions: "Decisions",
  raid: "RAID",
  dependencies: "Dependencies",
  benefits: "Benefits",
  requests: "Requests",
  governance: "Governance",
};

/**
 * The instance's config, parsed through the block's schema over its defaults. Older versions
 * go through migrateConfig; anything that still fails falls back to the defaults.
 */
export function resolveConfig(definition: AnyBlockDefinition, instance: BlockInstance): unknown {
  let raw: unknown = instance.config ?? {};
  if (instance.blockVersion < definition.version && definition.migrateConfig)
    raw = definition.migrateConfig(raw, instance.blockVersion);
  const merged = {
    ...(definition.defaultConfig as Record<string, unknown>),
    ...(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}),
  };
  const parsed = definition.configSchema.safeParse(merged);
  return parsed.success ? parsed.data : definition.defaultConfig;
}

let counter = 0;
/** A short id, stable within a template / report. */
export function newInstanceId(key: string, taken: Iterable<string> = []) {
  const used = new Set(taken);
  for (;;) {
    counter += 1;
    const id = `${key.slice(0, 12)}-${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
    if (!used.has(id)) return id;
  }
}

/** A new instance of a block with its default config. */
export function newInstance(
  definition: AnyBlockDefinition,
  placement: BlockInstance["placement"],
  taken: Iterable<string> = [],
): BlockInstance {
  return {
    id: newInstanceId(definition.key, taken),
    blockKey: definition.key,
    blockVersion: definition.version,
    config: { ...(definition.defaultConfig as Record<string, unknown>) },
    placement,
  };
}
