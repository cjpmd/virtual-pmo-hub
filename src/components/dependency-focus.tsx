import { ArrowLeftToLine, ArrowRightToLine, Crosshair, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { DependencyBoundary, DependencyType, Health } from "@/data/types";
import type { ResolvedDependency } from "@/services/dependencies";
import type { Direction, FocusResult, GraphNode } from "@/services/dependency-graph";
import { cn } from "@/lib/utils";

/** Upstream and downstream get their own hue in focus mode; health returns when focus clears. */
export const focusEdgeColour = (direction: Direction) =>
  direction === "upstream" ? "var(--viz-upstream)" : "var(--viz-downstream)";

export const focusLegend = (
  <>
    <span className="flex items-center gap-1.5">
      <svg width="30" height="8" aria-hidden>
        <line x1="0" y1="4" x2="30" y2="4" stroke="var(--viz-upstream)" strokeWidth="2.6" />
      </svg>
      Upstream — this waits on it
    </span>
    <span className="flex items-center gap-1.5">
      <svg width="30" height="8" aria-hidden>
        <line x1="0" y1="4" x2="30" y2="4" stroke="var(--viz-downstream)" strokeWidth="2.6" />
      </svg>
      Downstream — it waits on this
    </span>
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full ring-2 ring-viz-critical" />
      On a chain from an off-track dependency
    </span>
    <span className="ml-auto text-muted-foreground">
      Click the background or press Escape to clear the focus
    </span>
  </>
);

type Chip = { label: string; active: boolean; toggle: () => void; tone?: string };
function ChipRow({ label, chips }: { label: string; chips: Chip[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.toggle}
          aria-pressed={chip.active}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            chip.active
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          style={chip.active && chip.tone ? { background: chip.tone, color: "#fff" } : undefined}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

const healthTone: Record<string, string> = {
  "On Track": "var(--viz-good)",
  "At Risk": "var(--viz-warning)",
  "Off Track": "var(--viz-critical)",
};

export function FilterChips({
  types,
  setTypes,
  bounds,
  setBounds,
  states,
  setStates,
  options,
  extra,
}: {
  types: DependencyType[];
  setTypes: (value: DependencyType[]) => void;
  bounds: DependencyBoundary[];
  setBounds: (value: DependencyBoundary[]) => void;
  states: Health[];
  setStates: (value: Health[]) => void;
  options: {
    types: readonly DependencyType[];
    bounds: readonly DependencyBoundary[];
    states: readonly Health[];
  };
  extra?: ReactNode;
}) {
  const toggle =
    <T,>(list: T[], value: T, set: (next: T[]) => void) =>
    () =>
      set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const any = types.length || bounds.length || states.length;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3">
      <ChipRow
        label="Type"
        chips={options.types.map((type) => ({
          label: type,
          active: types.includes(type),
          toggle: toggle(types, type, setTypes),
        }))}
      />
      <ChipRow
        label="Boundary"
        chips={options.bounds.map((bound) => ({
          label: bound,
          active: bounds.includes(bound),
          toggle: toggle(bounds, bound, setBounds),
        }))}
      />
      <ChipRow
        label="Health"
        chips={options.states.map((state) => ({
          label: state,
          active: states.includes(state),
          toggle: toggle(states, state, setStates),
          ...(healthTone[state] ? { tone: healthTone[state] } : {}),
        }))}
      />
      {extra}
      {any ? (
        <button
          type="button"
          className="text-[11px] font-semibold text-primary hover:underline"
          onClick={() => {
            setTypes([]);
            setBounds([]);
            setStates([]);
          }}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

export function FocusBanner({
  summary,
  node,
  depth,
  setDepth,
  depths,
  impact,
  clear,
}: {
  summary: string;
  node: GraphNode;
  depth: number;
  setDepth: (value: number) => void;
  depths: Array<{ value: number; label: string }>;
  impact?: string | undefined;
  clear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <Crosshair className="size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{summary}</p>
        <p className="text-[11px] text-muted-foreground">
          {node.kind} · {node.sublabel}
        </p>
      </div>
      {impact ? (
        <span className="flex items-center gap-1.5 rounded-full bg-viz-critical/15 px-2.5 py-1 text-[11px] font-semibold text-viz-critical">
          <TriangleAlert className="size-3.5" />
          {impact}
        </span>
      ) : null}
      <div
        role="group"
        aria-label="Chain depth"
        className="ml-auto flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      >
        {depths.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setDepth(option.value)}
            aria-pressed={depth === option.value}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
              depth === option.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={clear}>
        <X className="size-4" />
        Clear focus
      </Button>
    </div>
  );
}

function DependencyRow({
  dependency,
  direction,
  jump,
  open,
}: {
  dependency: ResolvedDependency;
  direction: Direction;
  jump: () => void;
  open: () => void;
}) {
  const owner = direction === "upstream" ? dependency.giverPm : dependency.receiverPm;
  const other = direction === "upstream" ? dependency.giverLabel : dependency.receiverLabel;
  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={open} className="min-w-0 text-left hover:underline">
          <p className="truncate text-xs font-semibold text-foreground">{other}</p>
          <p className="text-[11px] text-muted-foreground">
            {dependency.reference} · {dependency.type} · {dependency.boundary}
          </p>
        </button>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: `color-mix(in oklab, ${healthTone[dependency.health] ?? "var(--viz-ink-muted)"} 18%, transparent)`,
            color: healthTone[dependency.health] ?? "var(--viz-ink-muted)",
          }}
        >
          {dependency.health}
        </span>
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <div className="flex gap-1">
          <dt>Owner</dt>
          <dd className="truncate text-foreground">{owner}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Required by</dt>
          <dd className="tabular text-foreground">{formatDate(dependency.requiredBy)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Status</dt>
          <dd className="truncate text-foreground">{dependency.validation}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Acceptance</dt>
          <dd className="truncate text-foreground">{dependency.acceptance}</dd>
        </div>
      </dl>
      <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-[11px]" onClick={jump}>
        <Crosshair className="size-3.5" />
        Focus this end
      </Button>
    </li>
  );
}

export function DependencyFocusList({
  focus,
  node,
  jump,
  open,
}: {
  focus: FocusResult;
  node: GraphNode;
  jump: (dependency: ResolvedDependency, side: "giver" | "receiver") => void;
  open: (dependency: ResolvedDependency) => void;
}) {
  return (
    <aside className="flex max-h-[620px] flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
      <header className="border-b p-4">
        <p className="font-display text-sm font-semibold">{node.label}</p>
        <p className="text-[11px] text-muted-foreground">
          {node.kind} · {node.sublabel}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section
          title="Upstream — this waits on"
          count={focus.upstream.length}
          colour="var(--viz-upstream)"
          icon={<ArrowLeftToLine className="size-3.5" />}
        >
          {focus.upstream.map((dependency) => (
            <DependencyRow
              key={dependency.id}
              dependency={dependency}
              direction="upstream"
              open={() => open(dependency)}
              jump={() => jump(dependency, "giver")}
            />
          ))}
        </Section>
        <Section
          title="Downstream — waiting on this"
          count={focus.downstream.length}
          colour="var(--viz-downstream)"
          icon={<ArrowRightToLine className="size-3.5" />}
        >
          {focus.downstream.map((dependency) => (
            <DependencyRow
              key={dependency.id}
              dependency={dependency}
              direction="downstream"
              open={() => open(dependency)}
              jump={() => jump(dependency, "receiver")}
            />
          ))}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  count,
  colour,
  icon,
  children,
}: {
  title: string;
  count: number;
  colour: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h3
        className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-card/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide backdrop-blur"
        style={{ color: colour }}
      >
        {icon}
        {title}
        <span className="ml-auto tabular text-muted-foreground">{count}</span>
      </h3>
      {count ? (
        <ul className="divide-y">{children}</ul>
      ) : (
        <p className="px-4 py-3 text-[11px] text-muted-foreground">None.</p>
      )}
    </section>
  );
}

export interface ConnectorStyle {
  stroke: string;
  opacity: number;
  width: number;
  marker: string;
  grey: boolean;
}
/** Shared connector painting so the roadmap and milestone timeline dim the same way the map does. */
export function connectorStyle(
  dependency: ResolvedDependency,
  focus: FocusResult | undefined,
  hovered?: boolean,
): ConnectorStyle {
  const direction = focus?.edges.get(dependency.id);
  if (focus && !direction)
    return {
      stroke: "var(--viz-ink-muted)",
      opacity: 0.15,
      width: 1.4,
      marker: "muted",
      grey: true,
    };
  if (direction)
    return {
      stroke: focusEdgeColour(direction),
      opacity: 1,
      width: 2.6,
      marker: direction,
      grey: false,
    };
  const tone =
    dependency.health === "Off Track" ? "bad" : dependency.health === "At Risk" ? "warn" : "good";
  return {
    stroke: `var(--health-${tone})`,
    opacity: hovered ? 1 : 0.9,
    width: hovered ? 2.6 : 1.8,
    marker: tone,
    grey: false,
  };
}
export const connectorMarkers = ["good", "warn", "bad", "muted", "upstream", "downstream"] as const;
export const markerFill = (tone: string) =>
  tone === "muted"
    ? "var(--viz-ink-muted)"
    : tone === "upstream"
      ? "var(--viz-upstream)"
      : tone === "downstream"
        ? "var(--viz-downstream)"
        : `var(--health-${tone})`;

/** Compact focus bar for pages where the map's full toolbar would be too much. */
export function ConnectorFocusBar({
  label,
  sublabel,
  summary,
  depth,
  setDepth,
  depths,
  impact,
  clear,
}: {
  label: string;
  sublabel: string;
  summary: string;
  depth: number;
  setDepth: (value: number) => void;
  depths: Array<{ value: number; label: string }>;
  impact?: string | undefined;
  clear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
      <Crosshair className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 text-xs">
        <span className="font-semibold">{summary}</span>
        <span className="ml-2 text-muted-foreground">
          {label} · {sublabel}
        </span>
      </p>
      {impact ? (
        <span className="flex items-center gap-1.5 rounded-full bg-viz-critical/15 px-2 py-0.5 text-[11px] font-semibold text-viz-critical">
          <TriangleAlert className="size-3.5" />
          {impact}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--viz-upstream)" strokeWidth="2.4" />
          </svg>
          Upstream
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--viz-downstream)" strokeWidth="2.4" />
          </svg>
          Downstream
        </span>
      </span>
      <span
        role="group"
        aria-label="Chain depth"
        className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      >
        {depths.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setDepth(option.value)}
            aria-pressed={depth === option.value}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              depth === option.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </span>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={clear}>
        <X className="size-3.5" />
        Clear focus
      </Button>
    </div>
  );
}
export const chainDepths = [
  { value: 1, label: "Direct only" },
  { value: 2, label: "2 levels" },
  { value: 64, label: "Full chain" },
];
