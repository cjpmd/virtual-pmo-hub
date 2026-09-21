import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DependencyPanel, typeLegend, type AcceptanceState } from "@/components/dependency-panel";
import { dependencyStrokeDash, getDependencies, healthStroke, type ResolvedDependency } from "@/services/dependencies";
import { getProgrammes, getProject } from "@/services/pmo";
import { cn } from "@/lib/utils";

type Level = "workstream" | "project";
const CONTAINER_WIDTH = 320, CONTAINER_GAP = 40, HEADER_HEIGHT = 76, CHILD_HEIGHT = 40, CHILD_GAP = 8, CHILD_PADDING = 14;

interface Box { x: number; y: number; width: number; height: number }

export function DependencyMap() {
  const [level, setLevel] = useState<Level>("workstream");
  const [selected, setSelected] = useState<ResolvedDependency | null>(null);
  const [overrides, setOverrides] = useState<Record<string, AcceptanceState>>({});
  const all = useMemo(() => getDependencies(), []);
  const programmes = getProgrammes();

  const items = all.map(item => {
    const override = overrides[item.id];
    if (!override) return item;
    const confirmed = override.giver && override.receiver;
    return { ...item, giverAccepted: override.giver, receiverAccepted: override.receiver, acceptance: confirmed ? "Confirmed" : override.giver ? "Awaiting receiver" : override.receiver ? "Awaiting giver" : "Awaiting both" };
  });

  // Projects that actually take part in a dependency, grouped under their programme container.
  const membership = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dependency of all) for (const end of [dependency.giver, dependency.receiver]) {
      if (!end.projectId) continue;
      const programmeId = getProject(end.projectId)?.programmeId;
      if (!programmeId) continue;
      const current = map.get(programmeId) ?? [];
      if (!current.includes(end.projectId)) map.set(programmeId, [...current, end.projectId]);
    }
    return map;
  }, [all]);

  const externals = useMemo(() => Array.from(new Set(all.flatMap(item => [item.giver, item.receiver].filter(end => end.kind === "External").map(end => end.externalName ?? "External party")))), [all]);

  const columns = 3;
  const containers = programmes.map((programme, index) => {
    const children = level === "project" ? membership.get(programme.id) ?? [] : [];
    const height = HEADER_HEIGHT + (children.length ? children.length * (CHILD_HEIGHT + CHILD_GAP) + CHILD_PADDING : 18);
    return { programme, children, index, height };
  });
  const boxes = new Map<string, Box>();
  let rowTop = 24;
  for (let row = 0; row * columns < containers.length; row += 1) {
    const inRow = containers.slice(row * columns, row * columns + columns);
    inRow.forEach((container, position) => {
      boxes.set(`programme:${container.programme.id}`, { x: 24 + position * (CONTAINER_WIDTH + CONTAINER_GAP), y: rowTop, width: CONTAINER_WIDTH, height: container.height });
      container.children.forEach((projectId, childIndex) => {
        boxes.set(`project:${projectId}`, { x: 24 + position * (CONTAINER_WIDTH + CONTAINER_GAP) + 14, y: rowTop + HEADER_HEIGHT + childIndex * (CHILD_HEIGHT + CHILD_GAP), width: CONTAINER_WIDTH - 28, height: CHILD_HEIGHT });
      });
    });
    rowTop += Math.max(...inRow.map(container => container.height), 100) + CONTAINER_GAP;
  }
  externals.forEach((name, index) => {
    boxes.set(`external:${name}`, { x: 24 + index * (CONTAINER_WIDTH + CONTAINER_GAP), y: rowTop, width: CONTAINER_WIDTH, height: 64 });
  });
  const canvasHeight = rowTop + (externals.length ? 64 + 40 : 0);
  const canvasWidth = columns * (CONTAINER_WIDTH + CONTAINER_GAP) + 24;

  const keyFor = (end: ResolvedDependency["giver"]) => {
    if (end.kind === "External") return `external:${end.externalName ?? "External party"}`;
    if (level === "project" && end.projectId && boxes.has(`project:${end.projectId}`)) return `project:${end.projectId}`;
    const programmeId = end.programmeId ?? (end.projectId ? getProject(end.projectId)?.programmeId : undefined);
    return programmeId ? `programme:${programmeId}` : "";
  };

  const edges = items.flatMap(dependency => {
    const from = boxes.get(keyFor(dependency.giver)), to = boxes.get(keyFor(dependency.receiver));
    if (!from || !to || from === to) return [];
    return [{ dependency, from, to }];
  });

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex gap-2">
        <Button size="sm" variant={level === "workstream" ? "default" : "outline"} onClick={() => setLevel("workstream")}>Workstream level</Button>
        <Button size="sm" variant={level === "project" ? "default" : "outline"} onClick={() => setLevel("project")}>Project level</Button>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-4 text-xs">
        {typeLegend.map(entry => <span key={entry.type} className="flex items-center gap-1.5" title={entry.note}>
          <svg width="30" height="8" aria-hidden><line x1="0" y1="4" x2="30" y2="4" stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray={dependencyStrokeDash(entry.type)} /></svg>{entry.type}
        </span>)}
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-health-good" />On track</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-health-warn" />At risk</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-health-bad" />Off track</span>
      </div>
    </div>

    <div className="overflow-auto rounded-lg border bg-card shadow-sm">
      <div className="relative" style={{ width: canvasWidth, height: canvasHeight }}>
        <svg className="pointer-events-none absolute inset-0" width={canvasWidth} height={canvasHeight} aria-hidden>
          <defs>{["good", "warn", "bad", "muted"].map(tone => <marker key={tone} id={`dep-arrow-${tone}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={tone === "muted" ? "var(--border)" : `var(--health-${tone === "good" ? "good" : tone === "warn" ? "warn" : "bad"})`} /></marker>)}</defs>
          {edges.map(({ dependency, from, to }) => {
            const x1 = from.x + from.width, y1 = from.y + from.height / 2, x2 = to.x, y2 = to.y + to.height / 2;
            const bend = Math.max(40, Math.abs(x2 - x1) / 2);
            const tone = dependency.health === "Off Track" ? "bad" : dependency.health === "At Risk" ? "warn" : "good";
            return <path key={dependency.id} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} fill="none"
              stroke={healthStroke(dependency.health)} strokeWidth={dependency.criticality === "High" ? 2.4 : 1.6} strokeDasharray={dependencyStrokeDash(dependency.type)} strokeOpacity={0.85} markerEnd={`url(#dep-arrow-${tone})`} />;
          })}
        </svg>
        {containers.map(container => {
          const box = boxes.get(`programme:${container.programme.id}`);
          if (!box) return null;
          const involved = items.filter(item => item.giverProgrammeId === container.programme.id || item.receiverProgrammeId === container.programme.id);
          return <div key={container.programme.id} style={{ left: box.x, top: box.y, width: box.width, height: box.height }} className="absolute rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-3">
            <p className="line-clamp-2 text-sm font-semibold">{container.programme.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">PM {container.programme.projectManager ?? container.programme.manager} · {involved.length} dependencies</p>
            {container.children.map(projectId => {
              const child = boxes.get(`project:${projectId}`);
              if (!child) return null;
              return <div key={projectId} style={{ left: child.x - box.x, top: child.y - box.y, width: child.width, height: child.height }} className="absolute grid place-items-center rounded-md border bg-card px-2 text-center">
                <span className="line-clamp-2 text-[11px] font-medium leading-tight">{getProject(projectId)?.name}</span>
              </div>;
            })}
          </div>;
        })}
        {externals.map(name => {
          const box = boxes.get(`external:${name}`);
          if (!box) return null;
          return <div key={name} style={{ left: box.x, top: box.y, width: box.width, height: box.height }} className="absolute grid place-items-center rounded-lg border-2 border-dashed border-chart-5/60 bg-chart-5/10 px-3 text-center">
            <div><p className="text-sm font-semibold">{name}</p><p className="text-[11px] text-muted-foreground">External party</p></div>
          </div>;
        })}
      </div>
    </div>

    <section className="rounded-lg border bg-card shadow-sm">
      <h2 className="border-b p-4 font-display text-base font-semibold">Arrows on this map</h2>
      <div className="divide-y">
        {items.map(item => <button key={item.id} onClick={() => setSelected(item)} className="grid w-full gap-1 p-3 text-left hover:bg-accent/30 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-medium">{item.reference} · {item.giverLabel} → {item.receiverLabel}</p>
            <p className="text-xs text-muted-foreground">{item.type} · {item.boundary} · required by {formatDate(item.requiredBy)}</p>
          </div>
          <span className={cn("self-center rounded-full px-2.5 py-1 text-xs font-semibold", item.health === "Off Track" ? "bg-health-bad/20 text-health-bad-foreground" : item.health === "At Risk" ? "bg-health-warn/25 text-health-warn-foreground" : "bg-health-good/20 text-health-good-foreground")}>{item.health}</span>
        </button>)}
      </div>
    </section>

    {selected && <DependencyPanel dependency={items.find(item => item.id === selected.id) ?? selected} overrides={overrides}
      onAccept={(id, side) => setOverrides(current => { const base = current[id] ?? { giver: all.find(item => item.id === id)?.giverAccepted ?? false, receiver: all.find(item => item.id === id)?.receiverAccepted ?? false }; return { ...current, [id]: { ...base, [side]: true } } })}
      onRaise={() => undefined} close={() => setSelected(null)} />}
  </div>;
}
