// Renders a report: report-level blocks in order, then "Project deep-dives" with the
// deep-dive blocks repeated per included project (spec §6.1). Drafts resolve live data per
// block (report_block_data); published reports render only from snapshots (§4). Every block
// sits in an error boundary, and unknown keys render a neutral placeholder (§6.1).
import { Component, useLayoutEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBlockData } from "@/hooks/use-reports";
import { errorMessage } from "@/services/service-error";
import type { ReportInput } from "@/services/reports";
import { ALL_BLOCKS } from "../blocks/catalogue";
import { getBlock, resolveConfig } from "../blocks/registry";
import type { BlockInstance, ProjectMovement, RatingScheme, RenderContext } from "../blocks/types";

export interface DeepDiveProject {
  id: string;
  code: string;
  name: string;
  reasons?: Array<{ label: string }>;
  mode?: "rule" | "pinned";
}

export type SnapshotLookup = (blockId: string, entityId: string | null) => unknown | undefined;

export interface DocumentProps {
  blocks: BlockInstance[];
  deepDives: DeepDiveProject[];
  scheme: RatingScheme;
  asAt: string;
  mode: RenderContext["mode"];
  audience: RenderContext["audience"];
  reportId: string | null;
  editable: boolean;
  /** Live: resolve each block from this input. Snapshot: look data up. */
  live?: ReportInput | null;
  snapshot?: SnapshotLookup;
  movement?: Record<string, ProjectMovement>;
  /** Partner audience: block keys hidden by shares (plus partnerSafe=false blocks). */
  hiddenBlockKeys?: string[];
  /** Internal editors see a placeholder where partners would see nothing. */
  showPartnerPlaceholders?: boolean;
  /** Builder only: pin/unpin a project from deep dives (used by project_status_grid). */
  onPinProject?: (projectId: string, pin: boolean) => void;
  /** Builder: click to select a block. */
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string) => void;
  blockActions?: (instance: BlockInstance, entityId: string | null) => ReactNode;
}

export interface Section {
  id: string;
  title: string;
  kind: "block" | "deep_dive_heading" | "deep_dive";
  instance?: BlockInstance;
  project?: DeepDiveProject;
  pageBreakBefore: boolean;
}

export const blockTitle = (instance: BlockInstance) => {
  if (instance.title) return instance.title;
  const config = (instance.config ?? {}) as Record<string, unknown>;
  if (instance.blockKey === "section_heading" && typeof config["title"] === "string")
    return config["title"];
  if (instance.blockKey === "free_text" && typeof config["heading"] === "string")
    return config["heading"];
  // ALL_BLOCKS.length keeps the catalogue import live in production (sideEffects: false).
  return getBlock(instance.blockKey)?.name ?? `Block unavailable (${ALL_BLOCKS.length} registered)`;
};

/** Report-level blocks, then one section per deep-dive project (spec §9.2 contents). */
export function sectionsOf(blocks: BlockInstance[], deepDives: DeepDiveProject[]): Section[] {
  const sections: Section[] = blocks
    .filter((b) => b.placement !== "deep_dive")
    .map((instance) => ({
      id: `s-${instance.id}`,
      title: blockTitle(instance),
      kind: "block" as const,
      instance,
      pageBreakBefore: !!instance.pageBreakBefore || instance.blockKey === "report_cover",
    }));
  const dd = blocks.filter((b) => b.placement === "deep_dive");
  if (dd.length && deepDives.length) {
    for (const project of deepDives)
      sections.push({
        id: `dd-${project.id}`,
        title: `${project.code} ${project.name}`,
        kind: "deep_dive",
        project,
        pageBreakBefore: true,
      });
  }
  return sections;
}

class BlockBoundary extends Component<
  { children: ReactNode; name: string },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error)
      return (
        <p role="alert" className="flex items-center gap-2 text-sm text-health-bad-foreground">
          <AlertTriangle className="size-4" /> {this.props.name} couldn't be shown:{" "}
          {this.state.error.message}
        </p>
      );
    return this.props.children;
  }
}

export function UnavailableBlock({ blockKey }: { blockKey: string }) {
  return (
    <div
      className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
      data-unavailable={blockKey}
    >
      Block unavailable ({blockKey}). It may come from a newer version of the app.
    </div>
  );
}

type BodyProps = { instance: BlockInstance; entityId: string | null; props: DocumentProps };

/** Snapshot (published) and live (draft) bodies are separate so a snapshot needs no session. */
function BlockBody(p: BodyProps) {
  return p.props.snapshot ? <SnapshotBody {...p} /> : <LiveBody {...p} />;
}

function SnapshotBody({ instance, entityId, props }: BodyProps) {
  const definition = getBlock(instance.blockKey);
  if (!definition) return <UnavailableBlock blockKey={instance.blockKey} />;
  if (definition.static)
    return <Rendered instance={instance} entityId={entityId} props={props} data={null} />;
  const data = props.snapshot!(instance.id, entityId);
  if (data === undefined)
    return <p className="text-sm text-muted-foreground">Not stored in this snapshot.</p>;
  return <Rendered instance={instance} entityId={entityId} props={props} data={data} />;
}

function LiveBody({ instance, entityId, props }: BodyProps) {
  const definition = getBlock(instance.blockKey);
  const query = useBlockData(
    props.live ?? null,
    instance,
    entityId,
    !!definition && !definition.static,
  );
  if (!definition) return <UnavailableBlock blockKey={instance.blockKey} />;
  if (definition.static)
    return <Rendered instance={instance} entityId={entityId} props={props} data={null} />;
  if (query.isError)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 text-sm text-health-bad-foreground"
      >
        <AlertTriangle className="size-4" /> {errorMessage(query.error)}
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  if (!query.data)
    return (
      <div aria-busy aria-label="Loading" className="h-20 animate-pulse rounded-md bg-muted/50" />
    );
  return <Rendered instance={instance} entityId={entityId} props={props} data={query.data} />;
}

/**
 * Sets data-export-ready="true" on the nearest [data-block] ancestor after the
 * block has rendered with real data. captureAtWidth polls this attribute before
 * cloning, ensuring the clone always captures a fully-painted block.
 */
function ReadySignaller() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    // Walk up to the [data-block] section wrapper and mark it ready.
    let el: HTMLElement | null = ref.current;
    while (el && !el.dataset["block"]) el = el.parentElement;
    if (el) el.dataset["exportReady"] = "true";
  });
  return <span ref={ref} style={{ display: "none" }} aria-hidden="true" />;
}

function Rendered({ instance, entityId, props, data }: BodyProps & { data: unknown }) {
  const definition = getBlock(instance.blockKey)!;
  if (data && typeof data === "object" && (data as { unavailable?: boolean }).unavailable)
    return <UnavailableBlock blockKey={instance.blockKey} />;
  const ctx: RenderContext = {
    scheme: props.scheme,
    mode: props.mode,
    audience: props.audience,
    reportId: props.reportId,
    entityId,
    editable: props.editable,
    source: props.snapshot ? "snapshot" : "live",
    asAt: props.asAt,
    instance,
    ...(props.movement && { movement: props.movement }),
    ...(props.onPinProject && { onPinProject: props.onPinProject }),
  };
  const config = resolveConfig(definition, instance);
  const Renderer = (props.mode === "print" && definition.PrintRenderer) || definition.Renderer;
  return (
    <BlockBoundary name={definition.name}>
      <ReadySignaller />
      <Renderer data={data} config={config} ctx={ctx} />
    </BlockBoundary>
  );
}

function hiddenFor(instance: BlockInstance, props: DocumentProps) {
  if (props.audience !== "partner" && !props.showPartnerPlaceholders) return false;
  const definition = getBlock(instance.blockKey);
  return (
    !!instance.hideFromPartners ||
    (definition ? !definition.partnerSafe : false) ||
    (props.hiddenBlockKeys ?? []).includes(instance.blockKey)
  );
}

export function BlockFrame({
  instance,
  entityId,
  props,
  level = 2,
}: {
  instance: BlockInstance;
  entityId: string | null;
  props: DocumentProps;
  level?: 2 | 3;
}) {
  const hidden = hiddenFor(instance, props);
  if (hidden && props.audience === "partner") return null;
  const selected = props.selectedBlockId === instance.id;
  const Heading = level === 2 ? "h2" : "h3";
  const isHeading = instance.blockKey === "section_heading";
  const isCover = instance.blockKey === "report_cover";
  return (
    <section
      id={entityId ? `b-${instance.id}-${entityId}` : `s-${instance.id}`}
      data-block={instance.blockKey}
      className={cn(
        "report-block scroll-mt-24",
        (instance.pageBreakBefore || (isCover && props.mode === "print")) && "report-page-break",
        isHeading ? "pt-4" : "rounded-lg border bg-card p-4",
        props.onSelectBlock && "cursor-pointer",
        selected && "ring-2 ring-primary",
      )}
      onClick={props.onSelectBlock ? () => props.onSelectBlock!(instance.id) : undefined}
    >
      {!isCover && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <Heading
            className={cn(
              "font-display font-semibold",
              isHeading ? "border-b pb-1 text-xl" : level === 2 ? "text-base" : "text-sm",
            )}
          >
            {blockTitle(instance)}
          </Heading>
          {props.blockActions?.(instance, entityId)}
        </div>
      )}
      {hidden ? (
        <p className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          <EyeOff className="size-3.5" /> Hidden from partner organisations.
        </p>
      ) : null}
      <BlockBody instance={instance} entityId={entityId} props={props} />
    </section>
  );
}

export function ReportDocument(props: DocumentProps) {
  const reportBlocks = props.blocks.filter((b) => b.placement !== "deep_dive");
  const deepBlocks = props.blocks.filter((b) => b.placement === "deep_dive");
  return (
    <div className="report-document space-y-4">
      {reportBlocks.map((instance) => (
        <BlockFrame key={instance.id} instance={instance} entityId={null} props={props} />
      ))}
      {deepBlocks.length > 0 && (
        <div className="space-y-6">
          {props.deepDives.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No projects are selected for a deep-dive.
            </p>
          ) : (
            props.deepDives.map((project) => (
              <article
                key={project.id}
                id={`dd-${project.id}`}
                className="report-page-break report-deep-dive scroll-mt-24 space-y-3 rounded-xl border-2 border-dashed border-border p-4"
                aria-label={`Deep-dive: ${project.name}`}
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold">
                    <span className="text-muted-foreground">{project.code}</span> {project.name}
                  </h2>
                  {props.mode === "screen" && (
                    <Link
                      to="/portfolio/projects/$projectCode"
                      params={{ projectCode: project.code }}
                      className="text-xs text-primary underline-offset-2 hover:underline print:hidden"
                    >
                      Open project
                      {props.snapshot ? " (live data may differ from this snapshot)" : ""}
                    </Link>
                  )}
                </header>
                {project.reasons?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {project.mode === "pinned" && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                        Pinned
                      </span>
                    )}
                    {project.reasons.map((reason) => (
                      <span key={reason.label} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {reason.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {deepBlocks.map((instance) => (
                  <BlockFrame
                    key={instance.id}
                    instance={instance}
                    entityId={project.id}
                    props={props}
                    level={3}
                  />
                ))}
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Sticky contents (spec §9.2). */
export function ReportToc({ sections }: { sections: Section[] }) {
  return (
    <nav aria-label="Contents" className="text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Contents
      </p>
      <ol className="space-y-1">
        {sections.map((section) => (
          <li key={section.id} className={section.kind === "deep_dive" ? "pl-3" : undefined}>
            <a href={`#${section.id}`} className="text-muted-foreground hover:text-foreground">
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
