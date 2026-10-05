import { Crosshair, Maximize2, Minus, Plus, Search, Sparkles, Pencil, Link2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DependencyEditor } from "@/components/dependency-editor";
import { saveDependency, useDependencyVersion } from "@/services/dependency-store";
import { DependencyPanel, typeLegend, type AcceptanceState } from "@/components/dependency-panel";
import { DependencyFocusList, FilterChips, FocusBanner, focusEdgeColour, focusLegend } from "@/components/dependency-focus";
import { dependencyStrokeDash, dependencyTypes, getDependencies, healthStroke, type ResolvedDependency } from "@/services/dependencies";
import { buildDependencyGraph, focusGraph, focusSummary, getDelayImpact, nodeForEnd, programmeNodeId, type Granularity, type GraphNode } from "@/services/dependency-graph";
import { getProgrammes } from "@/services/pmo";
import type { DependencyBoundary, DependencyType, Health } from "@/data/types";
import { useMeasuredWidth } from "@/components/charts/use-measure";
import { cn } from "@/lib/utils";

const levels: Array<{ value: Granularity; label: string }> = [{ value: "programme", label: "Workstream" }, { value: "project", label: "Project" }, { value: "milestone", label: "Milestone" }];
const depths = [{ value: 1, label: "Direct only" }, { value: 2, label: "2 levels" }, { value: 64, label: "Full chain" }];
const boundaries: DependencyBoundary[] = ["Within programme", "Cross-programme", "Cross-PM", "Cross-portfolio"];
const healths: Health[] = ["On Track", "At Risk", "Off Track"];

const CONTAINER_WIDTH = 320, CONTAINER_GAP = 40, HEADER_HEIGHT = 76, CHILD_HEIGHT = 44, CHILD_GAP = 8, CHILD_PADDING = 14, VIEWPORT_HEIGHT = 560, COLUMNS = 3;
interface Box { x: number; y: number; width: number; height: number }

/**
 * Anchors the curve on the sides the two boxes actually face, so an arrow running
 * right-to-left or down a column stays on the canvas instead of looping off it.
 */
function edgePath(from: Box, to: Box, offset = 0) {
  const fromCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = toCentre.x - fromCentre.x, dy = toCentre.y - fromCentre.y;
  if (Math.abs(dx) >= Math.abs(dy) * 0.7) {
    const right = dx >= 0, x1 = right ? from.x + from.width : from.x, x2 = right ? to.x : to.x + to.width;
    const bend = Math.min(140, Math.max(36, Math.abs(x2 - x1) / 2)) * (right ? 1 : -1);
    const y1 = fromCentre.y + offset, y2 = toCentre.y + offset;
    return `M ${x1} ${y1} C ${x1 + bend} ${y1 + offset}, ${x2 - bend} ${y2 + offset}, ${x2} ${y2}`;
  }
  const down = dy >= 0, y1 = down ? from.y + from.height : from.y, y2 = down ? to.y : to.y + to.height;
  const bend = Math.min(120, Math.max(36, Math.abs(y2 - y1) / 2)) * (down ? 1 : -1);
  const x1 = fromCentre.x + offset, x2 = toCentre.x + offset;
  return `M ${x1} ${y1} C ${x1 + offset} ${y1 + bend}, ${x2 + offset} ${y2 - bend}, ${x2} ${y2}`;
}
type View = { scale: number; x: number; y: number };

export function DependencyMap({ focusId, onFocus }: { focusId?: string | undefined; onFocus: (id: string | undefined) => void }) {
  const dependencyVersion = useDependencyVersion();
  const [workshop, setWorkshop] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResolvedDependency | { from: string; to: string } | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const nodeDrag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const draggedNode = useRef<string | null>(null);
  const [level, setLevel] = useState<Granularity>("programme");
  const [depth, setDepth] = useState(1);
  const [types, setTypes] = useState<DependencyType[]>([]);
  const [bounds, setBounds] = useState<DependencyBoundary[]>([]);
  const [states, setStates] = useState<Health[]>([]);
  const [showCritical, setShowCritical] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ResolvedDependency | null>(null);
  const [overrides, setOverrides] = useState<Record<string, AcceptanceState>>({});
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const { ref: viewportRef, width: viewportWidth } = useMeasuredWidth(900);

  const all = useMemo(() => getDependencies(), [dependencyVersion]);
  const programmes = useMemo(() => getProgrammes(), [dependencyVersion]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("virtual-pmo-dependency-layout");
      if (saved) setPositions(JSON.parse(saved) as Record<string, { x: number; y: number }>);
    } catch { /* Start with the default arrangement. */ }
  }, []);
  const items = useMemo(() => all.map(item => {
    const override = overrides[item.id];
    if (!override) return item;
    const confirmed = override.giver && override.receiver;
    return { ...item, giverAccepted: override.giver, receiverAccepted: override.receiver, acceptance: confirmed ? "Confirmed" : override.giver ? "Awaiting receiver" : override.receiver ? "Awaiting giver" : "Awaiting both" };
  }), [all, overrides]);
  const filtered = useMemo(() => items.filter(item =>
    (!types.length || types.includes(item.type)) && (!bounds.length || bounds.includes(item.boundary)) && (!states.length || states.includes(item.health))), [items, types, bounds, states]);

  const graph = useMemo(() => buildDependencyGraph(filtered, level), [filtered, level]);
  const focus = useMemo(() => (focusId ? focusGraph(graph, focusId, depth) : undefined), [graph, focusId, depth]);
  const focusNode = focusId ? graph.nodes.get(focusId) : undefined;

  // ---- layout ---------------------------------------------------------------
  const layout = useMemo(() => {
    const children = new Map<string, GraphNode[]>();
    const externals: GraphNode[] = [];
    for (const node of graph.nodes.values()) {
      if (node.kind === "External") { externals.push(node); continue }
      if (node.kind === "Programme") continue;
      if (!node.programmeId) continue;
      children.set(node.programmeId, [...(children.get(node.programmeId) ?? []), node]);
    }
    const shown = programmes.filter(programme => graph.nodes.has(programmeNodeId(programme.id)) || (children.get(programme.id)?.length ?? 0) > 0);
    const boxes = new Map<string, Box>();
    const containers = shown.map(programme => {
      const kids = (children.get(programme.id) ?? []).sort((a, b) => a.label.localeCompare(b.label));
      return { programme, kids, height: HEADER_HEIGHT + (kids.length ? kids.length * (CHILD_HEIGHT + CHILD_GAP) + CHILD_PADDING : 18) };
    });
    let rowTop = 24;
    for (let row = 0; row * COLUMNS < containers.length; row += 1) {
      const inRow = containers.slice(row * COLUMNS, row * COLUMNS + COLUMNS);
      inRow.forEach((container, position) => {
        const x = 24 + position * (CONTAINER_WIDTH + CONTAINER_GAP);
        boxes.set(programmeNodeId(container.programme.id), { x, y: rowTop, width: CONTAINER_WIDTH, height: container.height });
        container.kids.forEach((node, index) => boxes.set(node.id, { x: x + 14, y: rowTop + HEADER_HEIGHT + index * (CHILD_HEIGHT + CHILD_GAP), width: CONTAINER_WIDTH - 28, height: CHILD_HEIGHT }));
      });
      rowTop += Math.max(...inRow.map(container => container.height), 100) + CONTAINER_GAP;
    }
    externals.sort((a, b) => a.label.localeCompare(b.label)).forEach((node, index) => {
      boxes.set(node.id, { x: 24 + (index % COLUMNS) * (CONTAINER_WIDTH + CONTAINER_GAP), y: rowTop + Math.floor(index / COLUMNS) * (72 + CHILD_GAP), width: CONTAINER_WIDTH, height: 64 });
    });
    const externalRows = Math.ceil(externals.length / COLUMNS);
    for (const [id, point] of Object.entries(positions)) {
      const box = boxes.get(id);
      if (box) boxes.set(id, { ...box, ...point });
    }
    const farRight = Math.max(COLUMNS * (CONTAINER_WIDTH + CONTAINER_GAP) + 24, ...Array.from(boxes.values()).map(box => box.x + box.width + 30));
    const farBottom = Math.max(rowTop + (externalRows ? externalRows * (72 + CHILD_GAP) + 24 : 0), ...Array.from(boxes.values()).map(box => box.y + box.height + 30));
    return { boxes, containers, externals, width: farRight, height: farBottom };
  }, [graph, programmes, positions]);

  // ---- zoom -----------------------------------------------------------------
  const fitTo = useCallback((box: Box, maxScale: number) => {
    const padding = 48;
    const scale = Math.min(maxScale, Math.max(0.35, Math.min((viewportWidth - padding) / box.width, (VIEWPORT_HEIGHT - padding) / box.height)));
    setView({ scale, x: (viewportWidth - box.width * scale) / 2 - box.x * scale, y: (VIEWPORT_HEIGHT - box.height * scale) / 2 - box.y * scale });
  }, [viewportWidth]);
  const fitAll = useCallback(() => fitTo({ x: 0, y: 0, width: layout.width, height: layout.height }, 1), [fitTo, layout.width, layout.height]);

  useEffect(() => {
    if (!focus) { fitAll(); return }
    const boxes = Array.from(focus.nodes.keys()).map(id => layout.boxes.get(id)).filter((box): box is Box => Boolean(box));
    if (!boxes.length) { fitAll(); return }
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    fitTo({ x: left, y: top, width: Math.max(...boxes.map(box => box.x + box.width)) - left, height: Math.max(...boxes.map(box => box.y + box.height)) - top }, 1.4);
  // Reframe for a changed graph/focus or viewport, not for each workshop drag.
  }, [focus, graph, viewportWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && focusId) onFocus(undefined) };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, onFocus]);

  // ---- emphasis -------------------------------------------------------------
  const hoverSet = useMemo(() => {
    if (!hover || focus) return undefined;
    const edges = new Set<string>(), nodes = new Set<string>([hover]);
    for (const edge of [...(graph.out.get(hover) ?? []), ...(graph.in.get(hover) ?? [])]) { edges.add(edge.id); nodes.add(edge.from); nodes.add(edge.to) }
    return { edges, nodes };
  }, [hover, focus, graph]);
  const nodeTone = (id: string) => {
    if (focus) return focus.nodes.has(id) ? (id === focusId ? "focus" : "chain") : "muted";
    if (hoverSet) return hoverSet.nodes.has(id) ? "preview" : "dim";
    return "normal";
  };
  const edgeTone = (edge: { id: string; from: string; to: string }) => {
    if (focus) return focus.edges.has(edge.id) ? "chain" : "muted";
    if (hoverSet) return hoverSet.edges.has(edge.id) ? "preview" : "dim";
    return "normal";
  };
  const toneOpacity: Record<string, number> = { focus: 1, chain: 1, preview: 1, normal: 0.9, dim: 0.35, muted: 0.15 };

  /** Edges between the same pair of boxes are fanned out so neither hides the other. */
  const edgeOffsets = useMemo(() => {
    const slots = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const key = [edge.from, edge.to].sort().join("||");
      slots.set(key, [...(slots.get(key) ?? []), edge.id]);
    }
    const result = new Map<string, number>();
    for (const ids of slots.values()) ids.forEach((id, index) => result.set(id, (index - (ids.length - 1) / 2) * 13));
    return result;
  }, [graph]);

  const matches = query.trim().length > 1
    ? Array.from(graph.nodes.values()).filter(node => node.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];
  const jumpTo = (endNode: GraphNode | undefined) => { if (endNode) { onFocus(endNode.id); setQuery("") } };
  const nodeFor = (dependency: ResolvedDependency, side: "giver" | "receiver") => nodeForEnd(dependency[side], level);
  const delayImpact = focusId && focus && focus.criticalNodes.has(focusId) ? getDelayImpact(graph, focusId) : 0;

  const beginPan = (event: React.PointerEvent) => {
    if (nodeDrag.current) return;
    if ((event.target as HTMLElement).closest("[data-node]")) return;
    pan.current = { x: event.clientX, y: event.clientY, view };
    setDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const movePan = (event: React.PointerEvent) => {
    if (!pan.current) return;
    setView({ scale: pan.current.view.scale, x: pan.current.view.x + event.clientX - pan.current.x, y: pan.current.view.y + event.clientY - pan.current.y });
  };
  const endPan = () => { const moved = pan.current; pan.current = null; setDragging(false); return moved };
  const onNodePointerDown = (event: React.PointerEvent, id: string) => {
    if (!workshop || linkFrom || (event.target as HTMLElement).closest("[data-link-handle]")) return;
    event.stopPropagation();
    nodeDrag.current = { id, x: event.clientX, y: event.clientY, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onNodePointerMove = (event: React.PointerEvent) => {
    const drag = nodeDrag.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / view.scale, dy = (event.clientY - drag.y) / view.scale;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !drag.moved) return;
    drag.moved = true;
    const box = layout.boxes.get(drag.id);
    if (box) setPositions(current => ({ ...current, [drag.id]: { x: Math.max(0, box.x + dx), y: Math.max(0, box.y + dy) } }));
    drag.x = event.clientX; drag.y = event.clientY;
  };
  const onNodePointerUp = (event: React.PointerEvent) => {
    if (nodeDrag.current?.moved) {
      event.stopPropagation();
      draggedNode.current = nodeDrag.current.id;
      setPositions(current => {
        try { localStorage.setItem("virtual-pmo-dependency-layout", JSON.stringify(current)); } catch { /* Layout remains available for this session. */ }
        return current;
      });
    }
    nodeDrag.current = null;
  };
  const onNodeClick = (id: string) => {
    if (draggedNode.current === id) { draggedNode.current = null; return; }
    if (workshop && linkFrom) {
      if (id !== linkFrom) { setEditing({ from: linkFrom, to: id }); setLinkFrom(null); }
      else setLinkFrom(null);
      return;
    }
    onFocus(focusId === id ? undefined : id);
  };
  const linkHandle = (id: string) => workshop && <Button data-link-handle type="button" size="icon" variant="outline" title="Draw a dependency from this node" aria-label={`Draw a dependency from ${graph.nodes.get(id)?.label ?? id}`} className="absolute -right-2 top-1/2 z-10 size-6 -translate-y-1/2 rounded-full border-primary bg-card text-primary shadow-sm" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setLinkFrom(id); }}><Plus className="size-3.5" /></Button>;

  return <div className="space-y-4">
    <div className="space-y-3 rounded-lg border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-primary" />Workshop mode<Switch checked={workshop} onCheckedChange={value => { setWorkshop(value); setLinkFrom(null); }} aria-label="Workshop mode" /></label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"/>
          <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find and focus a node" aria-label="Find a node" className="h-9 w-60 pl-8"/>
          {matches.length > 0 && <ul className="absolute z-40 mt-1 w-72 overflow-hidden rounded-md border bg-popover shadow-lg">
            {matches.map(node => <li key={node.id}><button type="button" onClick={() => jumpTo(node)} className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"><span className="font-medium">{node.label}</span><span className="block text-[11px] text-muted-foreground">{node.kind} · {node.sublabel}</span></button></li>)}
          </ul>}
        </div>
        <div role="group" aria-label="Map level" className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          {levels.map(option => <button key={option.value} type="button" onClick={() => { setLevel(option.value); if (focusId && !focusId.startsWith("programme:") && !focusId.startsWith("external:")) onFocus(undefined) }} aria-pressed={level === option.value}
            className={cn("rounded px-2.5 py-1 text-xs font-medium transition-colors", level === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="outline" className="size-8" aria-label="Zoom out" onClick={() => setView(current => ({ ...current, scale: Math.max(0.35, current.scale - 0.15) }))}><Minus className="size-4"/></Button>
          <Button size="icon" variant="outline" className="size-8" aria-label="Zoom in" onClick={() => setView(current => ({ ...current, scale: Math.min(2, current.scale + 0.15) }))}><Plus className="size-4"/></Button>
          <Button size="sm" variant="outline" onClick={() => { onFocus(undefined); fitAll() }}><Maximize2 className="size-4"/>Fit all</Button>
        </div>
      </div>
      <FilterChips types={types} setTypes={setTypes} bounds={bounds} setBounds={setBounds} states={states} setStates={setStates}
        options={{ types: dependencyTypes, bounds: boundaries, states: healths }}
        extra={<button type="button" onClick={() => setShowCritical(value => !value)} aria-pressed={showCritical}
          className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors", showCritical ? "border-transparent bg-viz-critical/15 text-viz-critical" : "border-border text-muted-foreground hover:text-foreground")}>Critical path</button>}/>
    </div>

    {focus && focusNode ? <FocusBanner summary={focusSummary(focusNode, focus)} node={focusNode} depth={depth} setDepth={setDepth} depths={depths}
      impact={delayImpact > 0 ? `Delay here affects ${delayImpact} downstream ${delayImpact === 1 ? "item" : "items"}` : undefined}
      clear={() => onFocus(undefined)}/> : null}

    <div className={cn("grid gap-4", focus ? "xl:grid-cols-[1fr_340px]" : "")}>
      <div className={cn("overflow-hidden rounded-lg border shadow-sm", workshop ? "border-dashed border-primary/40 bg-muted/25" : "border-border/70 bg-card")}>
        <div ref={viewportRef} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={event => { const moved = endPan(); if (moved && Math.abs(event.clientX - moved.x) < 4 && Math.abs(event.clientY - moved.y) < 4 && focusId) onFocus(undefined) }} onPointerLeave={endPan}
          className={cn("relative touch-none overflow-hidden", dragging ? "cursor-grabbing" : "cursor-grab")} style={{ height: VIEWPORT_HEIGHT }}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transition: dragging ? "none" : "transform 260ms cubic-bezier(0.22,0.61,0.36,1)" }}>
            <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
              <defs>{["good", "warn", "bad", "muted", "upstream", "downstream"].map(tone => <marker key={tone} id={`dep-arrow-${tone}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={tone === "muted" ? "var(--viz-ink-muted)" : tone === "upstream" ? "var(--viz-upstream)" : tone === "downstream" ? "var(--viz-downstream)" : `var(--health-${tone})`}/></marker>)}</defs>
              {graph.edges.map(edge => {
                const from = layout.boxes.get(edge.from), to = layout.boxes.get(edge.to);
                if (!from || !to) return null;
                const tone = edgeTone(edge);
                const direction = focus?.edges.get(edge.id);
                const path = edgePath(from, to, edgeOffsets.get(edge.id) ?? 0);
                const stroke = direction ? focusEdgeColour(direction) : healthStroke(edge.dependency.health);
                const marker = direction ?? (tone === "muted" ? "muted" : edge.dependency.health === "Off Track" ? "bad" : edge.dependency.health === "At Risk" ? "warn" : "good");
                const critical = showCritical && focus?.criticalEdges.has(edge.id) && tone !== "muted";
                return <g key={edge.id} style={{ transition: "opacity 200ms ease, filter 200ms ease", opacity: toneOpacity[tone] ?? 1, filter: tone === "muted" ? "grayscale(1)" : undefined }}>
                  {critical ? <path d={path} fill="none" stroke="var(--viz-critical)" strokeWidth={(edge.dependency.criticality === "High" ? 2.4 : 1.6) + 5} strokeOpacity={0.18} strokeLinecap="round"/> : null}
                  <path d={path} fill="none" stroke={tone === "muted" ? "var(--viz-ink-muted)" : stroke} strokeWidth={tone === "chain" || tone === "preview" ? 2.6 : edge.dependency.criticality === "High" ? 2.4 : 1.6} strokeDasharray={dependencyStrokeDash(edge.dependency.type)} markerEnd={`url(#dep-arrow-${marker})`}/>
                </g>;
              })}
            </svg>
            {layout.containers.map(container => {
              const nodeId = programmeNodeId(container.programme.id);
              const box = layout.boxes.get(nodeId);
              if (!box) return null;
              const tone = nodeTone(nodeId), isNode = graph.nodes.has(nodeId);
              const involved = filtered.filter(item => item.giverProgrammeId === container.programme.id || item.receiverProgrammeId === container.programme.id);
              // The container never dims as a whole: a focused child inside a muted container
              // would inherit the parent's opacity and disappear. Only its own chrome fades.
              return <div key={container.programme.id} style={{ left: box.x, top: box.y, width: box.width, height: box.height, transition: "opacity 200ms ease, border-color 200ms ease" }}
                className={cn("absolute rounded-lg border-2 border-dashed p-3", tone === "focus" ? "border-primary bg-primary/10" : tone === "muted" ? "border-border/60 bg-muted/20" : "border-primary/30 bg-primary/5", showCritical && focus?.criticalNodes.has(nodeId) && tone !== "muted" && "ring-2 ring-viz-critical/70")}>
                <button data-node type="button" disabled={!isNode} onClick={() => onNodeClick(nodeId)} onPointerDown={event => onNodePointerDown(event, nodeId)} onPointerMove={onNodePointerMove} onPointerUp={onNodePointerUp} onMouseEnter={() => isNode && setHover(nodeId)} onMouseLeave={() => setHover(null)}
                  style={{ opacity: toneOpacity[tone] ?? 1, filter: tone === "muted" ? "grayscale(1)" : undefined, transition: "opacity 200ms ease, filter 200ms ease" }}
                  className={cn("block w-full text-left", isNode && "cursor-pointer rounded hover:underline")}>
                  <p className="line-clamp-2 text-sm font-semibold">{container.programme.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">PM {container.programme.projectManager ?? container.programme.manager} · {involved.length} dependencies</p>
                </button>
                {isNode && linkHandle(nodeId)}
                {container.kids.map(child => {
                  const childBox = layout.boxes.get(child.id);
                  if (!childBox) return null;
                  const childTone = nodeTone(child.id);
                  return <div key={child.id}><button data-node type="button" onClick={event => { event.stopPropagation(); onNodeClick(child.id) }} onPointerDown={event => onNodePointerDown(event, child.id)} onPointerMove={onNodePointerMove} onPointerUp={onNodePointerUp} onMouseEnter={() => setHover(child.id)} onMouseLeave={() => setHover(null)}
                    style={{ left: childBox.x - box.x, top: childBox.y - box.y, width: childBox.width, height: childBox.height, opacity: toneOpacity[childTone] ?? 1, filter: childTone === "muted" ? "grayscale(1)" : undefined, transition: "opacity 200ms ease, filter 200ms ease" }}
                    className={cn("absolute grid place-items-center rounded-lg border border-border/70 bg-card px-2 text-center", childTone === "focus" ? "border-primary ring-2 ring-primary" : "hover:border-primary/60", showCritical && focus?.criticalNodes.has(child.id) && childTone !== "muted" && "ring-2 ring-viz-critical/70")}>
                    <span><span className="line-clamp-2 text-[11px] font-medium leading-tight">{child.label}</span>{child.kind === "Milestone" ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{child.sublabel}</span> : null}</span>
                  </button>{workshop && <div className="absolute z-10" style={{ left: childBox.x - box.x + childBox.width, top: childBox.y - box.y + childBox.height / 2 }}>{linkHandle(child.id)}</div>}</div>;
                })}
              </div>;
            })}
            {layout.externals.map(node => {
              const box = layout.boxes.get(node.id);
              if (!box) return null;
              const tone = nodeTone(node.id);
              return <div key={node.id}><button data-node type="button" onClick={() => onNodeClick(node.id)} onPointerDown={event => onNodePointerDown(event, node.id)} onPointerMove={onNodePointerMove} onPointerUp={onNodePointerUp} onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(null)}
                style={{ left: box.x, top: box.y, width: box.width, height: box.height, opacity: toneOpacity[tone] ?? 1, filter: tone === "muted" ? "grayscale(1)" : undefined, transition: "opacity 200ms ease, filter 200ms ease" }}
                className={cn("absolute grid place-items-center rounded-lg border-2 border-dashed px-3 text-center", tone === "focus" ? "border-chart-5 bg-chart-5/20 ring-2 ring-chart-5" : "border-chart-5/60 bg-chart-5/10 hover:border-chart-5", showCritical && focus?.criticalNodes.has(node.id) && tone !== "muted" && "ring-2 ring-viz-critical/70")}>
                <div><p className="text-sm font-semibold">{node.label}</p><p className="text-[11px] text-muted-foreground">External party</p></div>
              </button>{workshop && <div className="absolute z-10" style={{ left: box.x + box.width, top: box.y + box.height / 2 }}>{linkHandle(node.id)}</div>}</div>;
            })}
          </div>
          {linkFrom && <div className="absolute bottom-3 left-4 z-20 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs shadow-sm"><Link2 className="size-4 text-primary" />Select a receiving node <Button size="sm" variant="ghost" onClick={() => setLinkFrom(null)}>Cancel</Button></div>}
          {!focusId && !linkFrom ? <p className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Crosshair className="size-3.5"/>{workshop ? "Drag nodes to arrange · use + to draw a dependency" : "Click a node to focus its chain · drag to pan"}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t p-3 text-xs">
          {focus ? focusLegend : <>
            {typeLegend.map(entry => <span key={entry.type} className="flex items-center gap-1.5" title={entry.note}>
              <svg width="30" height="8" aria-hidden><line x1="0" y1="4" x2="30" y2="4" stroke="var(--viz-ink-muted)" strokeWidth="2" strokeDasharray={dependencyStrokeDash(entry.type)}/></svg>{entry.type}
            </span>)}
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-health-good"/>On track</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-health-warn"/>At risk</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-health-bad"/>Off track</span>
          </>}
        </div>
      </div>

      {focus && focusNode ? <DependencyFocusList focus={focus} node={focusNode} open={setSelected}
        jump={(dependency, side) => jumpTo(nodeFor(dependency, side))}/> : null}
    </div>

    <section className="rounded-lg border border-border/70 bg-card shadow-sm">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="font-display text-base font-semibold">Arrows on this map</h2>
        <p className="text-xs text-muted-foreground">{graph.edges.length} of {items.length} shown{focus ? ` · ${focus.edges.size} in the focused chain` : ""}</p>
      </header>
      <div className="divide-y">
        {graph.edges.map(({ dependency, id }) => <div key={id} className={cn("grid items-center gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]", focus && !focus.edges.has(id) && "opacity-45")}>
          <Button variant="link" onClick={() => workshop ? setEditing(dependency) : setSelected(dependency)} className="h-auto flex-col items-start gap-0 p-0 text-left">
            <p className="text-sm font-medium">{dependency.reference} · {dependency.giverLabel} → {dependency.receiverLabel}</p>
            <p className="text-xs text-muted-foreground">{dependency.type} · {dependency.boundary} · {dependency.validation}</p>
          </Button>
          {workshop && <Button size="sm" variant="ghost" onClick={() => setEditing(dependency)}><Pencil className="size-3.5" />Edit</Button>}
          <Button size="sm" variant="ghost" className="justify-self-start text-xs" onClick={() => jumpTo(nodeFor(dependency, "giver"))}><Crosshair className="size-3.5"/>Focus giver</Button>
          <span className={cn("self-center rounded-full px-2.5 py-1 text-xs font-semibold", dependency.health === "Off Track" ? "bg-health-bad/20 text-health-bad-foreground" : dependency.health === "At Risk" ? "bg-health-warn/25 text-health-warn-foreground" : "bg-health-good/20 text-health-good-foreground")}>{dependency.health}</span>
        </div>)}
        {graph.edges.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No dependency matches these filters. <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setTypes([]); setBounds([]); setStates([]) }}>Clear filters</button></p> : null}
      </div>
    </section>

    {selected && <DependencyPanel dependency={items.find(item => item.id === selected.id) ?? selected} overrides={overrides}
      onAccept={(id, side) => { const item = all.find(entry => entry.id === id); if (item) saveDependency({ ...item, [side === "giver" ? "giverAccepted" : "receiverAccepted"]: true }); setOverrides(current => { const base = current[id] ?? { giver: item?.giverAccepted ?? false, receiver: item?.receiverAccepted ?? false }; return { ...current, [id]: { ...base, [side]: true } } }); }}
      onRaise={() => undefined} close={() => setSelected(null)}/>}
    {editing && <DependencyEditor {...("id" in editing ? { item: editing } : { fromId: editing.from, toId: editing.to })} onClose={() => setEditing(null)} />}
  </div>;
}
