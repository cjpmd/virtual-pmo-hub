import type { Health } from "@/data/types";
import type { ResolvedDependency, ResolvedEnd } from "@/services/dependencies";

export type NodeKind = "Programme" | "Project" | "Milestone" | "External";
export type Granularity = "programme" | "project" | "milestone";
export type Direction = "upstream" | "downstream";

export interface GraphNode {
  id: string;
  label: string;
  sublabel: string;
  kind: NodeKind;
  projectId?: string;
  programmeId?: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  dependency: ResolvedDependency;
}
export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  /** Edges leaving a node: it gives, so the other end is downstream of it. */
  out: Map<string, GraphEdge[]>;
  /** Edges arriving at a node: it receives, so the other end is upstream of it. */
  in: Map<string, GraphEdge[]>;
}

export const externalNodeId = (name: string) => `external:${name}`;
export const projectNodeId = (projectId: string) => `project:${projectId}`;
export const programmeNodeId = (programmeId: string) => `programme:${programmeId}`;
export const milestoneNodeId = (projectId: string, milestoneId: string) =>
  `milestone:${projectId}:${milestoneId}`;

/** The node an end collapses to at a given granularity. Milestones fall back to their project. */
export function nodeForEnd(end: ResolvedEnd, granularity: Granularity): GraphNode | undefined {
  if (end.kind === "External") {
    const name = end.externalName ?? "External party";
    return { id: externalNodeId(name), label: name, sublabel: "External party", kind: "External" };
  }
  const programmeId = end.programmeId;
  if (granularity === "milestone" && end.milestoneId && end.projectId && end.milestoneTitle)
    return {
      id: milestoneNodeId(end.projectId, end.milestoneId),
      label: end.milestoneTitle,
      sublabel: end.projectName ?? "Project",
      kind: "Milestone",
      projectId: end.projectId,
      ...(programmeId ? { programmeId } : {}),
    };
  if (granularity !== "programme" && end.projectId)
    return {
      id: projectNodeId(end.projectId),
      label: end.projectName ?? "Project",
      sublabel: end.programmeName ?? "Programme",
      kind: "Project",
      projectId: end.projectId,
      ...(programmeId ? { programmeId } : {}),
    };
  if (!programmeId) return undefined;
  return {
    id: programmeNodeId(programmeId),
    label: end.programmeName ?? "Programme",
    sublabel: `PM ${end.programmeManager || "Unassigned"}`,
    kind: "Programme",
    programmeId,
  };
}

export function buildDependencyGraph(
  items: ResolvedDependency[],
  granularity: Granularity,
): DependencyGraph {
  const nodes = new Map<string, GraphNode>(),
    edges: GraphEdge[] = [];
  const out = new Map<string, GraphEdge[]>(),
    incoming = new Map<string, GraphEdge[]>();
  for (const dependency of items) {
    const from = nodeForEnd(dependency.giver, granularity),
      to = nodeForEnd(dependency.receiver, granularity);
    if (!from || !to) continue;
    nodes.set(from.id, nodes.get(from.id) ?? from);
    nodes.set(to.id, nodes.get(to.id) ?? to);
    if (from.id === to.id) continue;
    const edge: GraphEdge = { id: dependency.id, from: from.id, to: to.id, dependency };
    edges.push(edge);
    out.set(from.id, [...(out.get(from.id) ?? []), edge]);
    incoming.set(to.id, [...(incoming.get(to.id) ?? []), edge]);
  }
  return { nodes, edges, out, in: incoming };
}

export interface FocusResult {
  focusId: string;
  /** Every node in the focused chain, with how many hops away and on which side. */
  nodes: Map<string, { distance: number; direction: Direction | "focus" }>;
  edges: Map<string, Direction>;
  upstream: ResolvedDependency[];
  downstream: ResolvedDependency[];
  atRisk: number;
  /** Distinct delivery nodes downstream along the full chain, however deep the view is set. */
  downstreamReach: number;
  /** Edges and nodes on a chain flowing out of an off-track dependency. */
  criticalEdges: Set<string>;
  criticalNodes: Set<string>;
}

function walk(
  graph: DependencyGraph,
  start: string,
  direction: Direction,
  depth: number,
  nodes: Map<string, { distance: number; direction: Direction | "focus" }>,
  edges: Map<string, Direction>,
) {
  let frontier = [start];
  for (let level = 1; level <= depth && frontier.length; level += 1) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      // Upstream means "what this node waits on", so it follows the edges arriving here.
      for (const edge of (direction === "upstream"
        ? graph.in.get(nodeId)
        : graph.out.get(nodeId)) ?? []) {
        const other = direction === "upstream" ? edge.from : edge.to;
        if (!edges.has(edge.id)) edges.set(edge.id, direction);
        if (nodes.has(other)) continue;
        nodes.set(other, { distance: level, direction });
        next.push(other);
      }
    }
    frontier = next;
  }
}

const DEEP = 64;

/** Everything reachable from `nodeId` within `depth` hops each way, plus the critical chain. */
export function focusGraph(
  graph: DependencyGraph,
  nodeId: string,
  depth: number,
): FocusResult | undefined {
  if (!graph.nodes.has(nodeId)) return undefined;
  const nodes = new Map<string, { distance: number; direction: Direction | "focus" }>([
    [nodeId, { distance: 0, direction: "focus" }],
  ]);
  const edges = new Map<string, Direction>();
  walk(graph, nodeId, "upstream", depth, nodes, edges);
  walk(graph, nodeId, "downstream", depth, nodes, edges);

  const fullNodes = new Map<string, { distance: number; direction: Direction | "focus" }>([
    [nodeId, { distance: 0, direction: "focus" }],
  ]);
  walk(graph, nodeId, "downstream", DEEP, fullNodes, new Map());
  const downstreamReach = Array.from(fullNodes.entries()).filter(
    ([id, entry]) => entry.direction === "downstream" && !id.startsWith("external:"),
  ).length;

  const upstream = (graph.in.get(nodeId) ?? []).map((edge) => edge.dependency);
  const downstream = (graph.out.get(nodeId) ?? []).map((edge) => edge.dependency);
  const { criticalEdges, criticalNodes } = getCriticalChain(graph);
  return {
    focusId: nodeId,
    nodes,
    edges,
    upstream,
    downstream,
    atRisk: [...upstream, ...downstream].filter((item) => item.health !== "On Track").length,
    downstreamReach,
    criticalEdges,
    criticalNodes,
  };
}

/**
 * An off-track dependency puts everything it feeds at risk, so the chain flowing out of
 * it is marked all the way down rather than just the one red arrow.
 */
export function getCriticalChain(graph: DependencyGraph) {
  const criticalEdges = new Set<string>(),
    criticalNodes = new Set<string>();
  const seeds = graph.edges.filter((edge) => edge.dependency.health === "Off Track");
  for (const seed of seeds) {
    criticalEdges.add(seed.id);
    criticalNodes.add(seed.from);
    criticalNodes.add(seed.to);
    let frontier = [seed.to];
    for (let level = 0; level < DEEP && frontier.length; level += 1) {
      const next: string[] = [];
      for (const nodeId of frontier)
        for (const edge of graph.out.get(nodeId) ?? []) {
          if (criticalEdges.has(edge.id)) continue;
          criticalEdges.add(edge.id);
          criticalNodes.add(edge.to);
          next.push(edge.to);
        }
      frontier = next;
    }
  }
  return { criticalEdges, criticalNodes };
}

/** Nodes downstream of an off-track dependency, keyed by the node that is late. */
export function getDelayImpact(graph: DependencyGraph, nodeId: string) {
  const reached = new Map<string, { distance: number; direction: Direction | "focus" }>([
    [nodeId, { distance: 0, direction: "focus" }],
  ]);
  walk(graph, nodeId, "downstream", DEEP, reached, new Map());
  return Array.from(reached.keys()).filter((id) => id !== nodeId && !id.startsWith("external:"))
    .length;
}

export const healthRank: Record<Health, number> = {
  "Not Set": 0,
  "On Track": 1,
  "At Risk": 2,
  "Off Track": 3,
};
/** One-line summary for the focus banner. */
export function focusSummary(node: GraphNode, focus: FocusResult) {
  const parts = [`depends on ${focus.upstream.length}`, `${focus.downstream.length} depend on it`];
  if (focus.atRisk) parts.push(`${focus.atRisk} at risk`);
  return `${node.label}: ${parts.join(", ")}`;
}
