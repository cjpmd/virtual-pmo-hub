import { formatCompactCurrency } from "@/lib/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Link2, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { buildBenefitMap, getMapValidationSummary, mapColumns, type MapFilter, type MapLink, type MapNode } from "@/services/benefits-map";
import { getBenefits, getProgrammes, getProjects, getStrategicObjectives } from "@/services/pmo";
import type { BenefitMapNodeType } from "@/data/types";
import { cn } from "@/lib/utils";

const COLUMN_WIDTH = 270, NODE_WIDTH = 222, NODE_HEIGHT = 108, ROW_GAP = 22, PADDING_Y = 24;
const columnLabels: Record<BenefitMapNodeType, string> = { Project: "Projects", Capability: "Capabilities (outputs)", Outcome: "Outcomes (business change)", Benefit: "Benefits", Objective: "Strategic objectives" };
const columnTone: Record<BenefitMapNodeType, string> = {
  Project: "border-chart-3/45 bg-chart-3/10",
  Capability: "border-chart-2/45 bg-chart-2/10",
  Outcome: "border-primary/35 bg-primary/8",
  Benefit: "border-health-good/45 bg-health-good/10",
  Objective: "border-chart-5/50 bg-chart-5/12",
};
const money = formatCompactCurrency;

interface Position { x: number; y: number }

function layout(nodes: MapNode[]): Record<string, Position> {
  const positions: Record<string, Position> = {};
  mapColumns.forEach((type, columnIndex) => {
    nodes.filter(node => node.type === type).forEach((node, rowIndex) => {
      positions[node.id] = { x: columnIndex * COLUMN_WIDTH + 18, y: PADDING_Y + rowIndex * (NODE_HEIGHT + ROW_GAP) };
    });
  });
  return positions;
}

function Edge({ from, to, disbenefit, workshop }: { from: Position; to: Position; disbenefit: boolean; workshop: boolean }) {
  const x1 = from.x + NODE_WIDTH, y1 = from.y + NODE_HEIGHT / 2, x2 = to.x, y2 = to.y + NODE_HEIGHT / 2;
  const midpoint = (x1 + x2) / 2;
  const stroke = disbenefit ? "var(--health-bad)" : workshop ? "var(--muted-foreground)" : "var(--primary)";
  return <path d={`M ${x1} ${y1} C ${midpoint} ${y1}, ${midpoint} ${y2}, ${x2} ${y2}`} fill="none" stroke={stroke} strokeWidth={1.6} strokeOpacity={disbenefit ? 0.85 : 0.45} markerEnd={disbenefit ? "url(#arrow-bad)" : "url(#arrow)"} />;
}

export function BenefitsMapCanvas() {
  const [filter, setFilter] = useState<MapFilter>({});
  const [workshop, setWorkshop] = useState(false);
  const [selected, setSelected] = useState<MapNode | null>(null);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [extraLinks, setExtraLinks] = useState<MapLink[]>([]);
  const [linking, setLinking] = useState<{ from: MapNode; x: number; y: number } | null>(null);
  const [message, setMessage] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const model = useMemo(() => buildBenefitMap(filter), [filter]);
  const validation = useMemo(() => getMapValidationSummary(model), [model]);
  const base = useMemo(() => layout(model.nodes), [model]);
  useEffect(() => { setPositions({}); setExtraLinks([]); setSelected(null); }, [filter]);

  const positionOf = (id: string) => positions[id] ?? base[id] ?? { x: 0, y: 0 };
  const links = [...model.links, ...extraLinks.filter(link => model.nodes.some(node => node.id === link.from) && model.nodes.some(node => node.id === link.to))];
  const height = Math.max(420, ...model.nodes.map(node => positionOf(node.id).y + NODE_HEIGHT + PADDING_Y));
  const width = mapColumns.length * COLUMN_WIDTH + 40;

  const point = (event: { clientX: number; clientY: number }) => {
    const box = surface.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0) + (surface.current?.scrollLeft ?? 0), y: event.clientY - (box?.top ?? 0) };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const where = point(event);
    if (dragging.current) {
      const { id, offsetX, offsetY } = dragging.current;
      setPositions(current => ({ ...current, [id]: { x: Math.max(0, where.x - offsetX), y: Math.max(0, where.y - offsetY) } }));
    } else if (linking) setLinking({ ...linking, x: where.x, y: where.y });
  };
  const endLink = (node?: MapNode) => {
    if (linking && node && node.id !== linking.from.id) {
      const id = `new-${linking.from.id}-${node.id}`;
      setExtraLinks(current => (current.some(link => link.id === id) ? current : [...current, { id, from: linking.from.id, to: node.id, disbenefit: linking.from.disbenefit || node.disbenefit }]));
      setMessage(`Linked “${linking.from.title}” to “${node.title}”. Links drawn in a workshop are saved as proposed and reviewed by the benefits lead.`);
    }
    setLinking(null);
  };

  const setKey = (key: keyof MapFilter, value: string) => setFilter(current => { const next = { ...current }; if (value) next[key] = value; else delete next[key]; return next; });
  const programmes = getProgrammes(), objectives = getStrategicObjectives();
  const projectOptions = useMemo(() => getProjects().filter(project => getBenefits().some(benefit => benefit.enablingProjects.some(link => link.projectId === project.id))), []);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Programme
        <select value={filter.programmeId ?? ""} onChange={event => setKey("programmeId", event.target.value)} className="h-9 min-w-52 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground">
          <option value="">All programmes</option>{programmes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Strategic objective
        <select value={filter.objectiveId ?? ""} onChange={event => setKey("objectiveId", event.target.value)} className="h-9 min-w-52 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground">
          <option value="">All objectives</option>{objectives.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Project
        <select value={filter.projectId ?? ""} onChange={event => setKey("projectId", event.target.value)} className="h-9 min-w-52 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground">
          <option value="">All projects</option>{projectOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-primary" />Workshop mode<Switch checked={workshop} onCheckedChange={setWorkshop} aria-label="Workshop mode" /></label>
        <Button variant="outline" size="sm" onClick={() => { setPositions({}); setExtraLinks([]); }}><RotateCcw />Reset layout</Button>
      </div>
    </div>

    {!workshop && validation.total > 0 && <div className="flex flex-wrap items-center gap-3 rounded-md border border-health-warn/40 bg-health-warn/10 p-3 text-xs">
      <TriangleAlert className="size-4 text-health-warn-foreground" />
      <span className="font-semibold">{validation.total} nodes need attention</span>
      <span className="text-muted-foreground">{validation.benefits} benefits missing a measure, owner or enabling project · {validation.outcomes} outcomes with no benefit · {validation.objectives} objectives with no supporting benefit · {validation.capabilities} capabilities with no delivering project</span>
    </div>}
    {message && <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs"><Link2 className="mt-0.5 size-4 text-primary" /><span className="flex-1">{message}</span><button onClick={() => setMessage("")} className="font-semibold text-primary">Dismiss</button></div>}

    <div className={cn("overflow-auto rounded-lg border shadow-sm", workshop ? "border-dashed bg-[color-mix(in_oklab,var(--muted)_55%,var(--background))]" : "bg-card")}>
      <div className="grid min-w-max border-b" style={{ gridTemplateColumns: `repeat(${mapColumns.length}, ${COLUMN_WIDTH}px)` }}>
        {mapColumns.map(type => <div key={type} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{columnLabels[type]}</div>)}
      </div>
      <div ref={surface} className="relative min-w-max touch-none select-none" style={{ width, height }}
        onPointerMove={onPointerMove}
        onPointerUp={() => { dragging.current = null; endLink(); }}
        onPointerLeave={() => { dragging.current = null; setLinking(null); }}>
        <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" fillOpacity={0.5} /></marker>
            <marker id="arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--health-bad)" /></marker>
          </defs>
          {links.map(link => <Edge key={link.id} from={positionOf(link.from)} to={positionOf(link.to)} disbenefit={link.disbenefit} workshop={workshop} />)}
          {linking && <line x1={positionOf(linking.from.id).x + NODE_WIDTH} y1={positionOf(linking.from.id).y + NODE_HEIGHT / 2} x2={linking.x} y2={linking.y} stroke="var(--primary)" strokeWidth={1.8} strokeDasharray="5 4" />}
        </svg>
        {model.nodes.map((node, index) => {
          const position = positionOf(node.id);
          return <div key={node.id} role="button" tabIndex={0}
            onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(node) } }}
            onClick={() => setSelected(node)}
            onPointerUp={() => endLink(node)}
            onPointerDown={event => {
              if ((event.target as HTMLElement).dataset["handle"]) return;
              const where = point(event);
              dragging.current = { id: node.id, offsetX: where.x - position.x, offsetY: where.y - position.y };
            }}
            style={{ left: position.x, top: position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT, ...(workshop ? { rotate: `${((index % 5) - 2) * 0.8}deg` } : {}) }}
            className={cn("absolute cursor-grab rounded-md border p-3 text-left shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
              workshop ? "border-health-warn/50 bg-health-warn/25 shadow-[3px_4px_0_0_color-mix(in_oklab,var(--foreground)_12%,transparent)]" : columnTone[node.type],
              node.disbenefit && (workshop ? "border-health-bad/60 bg-health-bad/20" : "border-health-bad/60 bg-health-bad/10"),
              selected?.id === node.id && "ring-2 ring-primary")}>
            <div className="flex items-start justify-between gap-1">
              <p className="line-clamp-3 text-[13px] font-semibold leading-snug">{node.disbenefit && <span className="mr-1 text-health-bad">●</span>}{node.title}</p>
              {!workshop && node.warnings.length > 0 && <span title={node.warnings.join(" · ")} className="shrink-0 text-health-warn-foreground"><CircleAlert className="size-4" /></span>}
            </div>
            {!workshop && <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{node.subtitle}</p>}
            <div className="mt-2 flex items-end justify-between gap-2">
              <span className="truncate text-[10px] text-muted-foreground">{node.owner}</span>
              {!workshop && node.value !== undefined && <span className={cn("shrink-0 text-[11px] font-semibold", node.disbenefit && "text-health-bad-foreground")}>{money(node.value)}</span>}
            </div>
            {!workshop && node.warnings.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{node.warnings.map(warning => <span key={warning} className="rounded bg-health-warn/25 px-1.5 py-0.5 text-[9px] font-semibold text-health-warn-foreground">{warning}</span>)}</div>}
            <button data-handle="true" aria-label={`Draw a link from ${node.title}`} onPointerDown={event => { event.stopPropagation(); const where = point(event); setLinking({ from: node, x: where.x, y: where.y }) }}
              className="absolute -right-2 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full border border-primary bg-background text-primary opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100" style={{ opacity: linking ? 1 : undefined }}>
              <span data-handle="true" className="block size-1.5 rounded-full bg-primary" />
            </button>
          </div>;
        })}
        {!model.nodes.length && <p className="p-10 text-center text-sm text-muted-foreground">No nodes match the current filters.</p>}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Drag a node to reposition it. Drag from the dot on a node's right edge onto another node to propose a new link. {workshop ? "Workshop mode hides values so the group can focus on the logic." : "Switch on Workshop mode for a clean sticky-note canvas."}</p>

    {selected && <NodePanel node={selected} close={() => setSelected(null)} />}
  </div>;
}

function NodePanel({ node, close }: { node: MapNode; close: () => void }) {
  const benefit = node.benefitId ? getBenefits().find(item => item.id === node.benefitId) : undefined;
  return <>
    <button aria-label="Close node detail" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
    <aside role="dialog" aria-label={`${node.type} detail`} className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{node.type}</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{node.disbenefit && <span className="mr-1 text-health-bad">●</span>}{node.title}</h2>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="Close"><X /></Button>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{node.subtitle}</p>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">Owner</dt><dd className="mt-1 font-medium">{node.owner}</dd></div>
        {node.value !== undefined && <div><dt className="text-xs text-muted-foreground">Planned value</dt><dd className="mt-1 font-medium">{money(node.value)}</dd></div>}
        {node.realised !== undefined && <div><dt className="text-xs text-muted-foreground">Realised</dt><dd className="mt-1 font-medium">{money(node.realised)}</dd></div>}
        {node.percent !== undefined && <div><dt className="text-xs text-muted-foreground">% realised</dt><dd className="mt-1 font-medium">{node.percent}%</dd></div>}
      </dl>
      {node.warnings.length > 0 && <div className="mt-5 rounded-md border border-health-warn/40 bg-health-warn/10 p-4">
        <p className="text-sm font-semibold">Validation</p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{node.warnings.map(warning => <li key={warning}>• {warning}</li>)}</ul>
      </div>}
      {benefit && <div className="mt-5 space-y-3 text-sm">
        <p><span className="text-xs text-muted-foreground">Classification</span><br />{benefit.classification} · {benefit.category}</p>
        <p><span className="text-xs text-muted-foreground">Confidence</span><br />{benefit.confidence}</p>
        <Link to="/benefits/$benefitId" params={{ benefitId: benefit.id }} className="inline-flex text-sm font-semibold text-primary hover:underline">Open the benefit profile →</Link>
      </div>}
      {node.projectId && <Link to="/portfolio/projects/$projectId" params={{ projectId: node.projectId }} className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline">Open the project →</Link>}
    </aside>
  </>;
}
