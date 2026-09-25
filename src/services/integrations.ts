// Swappable integration service. Today it keeps mock state in the browser;
// later each function can call real server functions without screen changes.
import { useSyncExternalStore } from "react";
import { conflictSeed, discoveredPlanSeeds, logSeed, outboxSeed, type DiscoveredPlan, type MsConnection, type OutboxItem, type PlanLink, type SyncConflict, type SyncLogEntry } from "@/data/integrations";
import { getProjects } from "@/services/pmo";

export interface Workspace { orgName: string; domain: string; region: "UK" | "EU"; currency: string; fyStartMonth: string; lifecycle: string; createdBy: string }
interface State { connection: MsConnection; links: PlanLink[]; outbox: OutboxItem[]; conflicts: SyncConflict[]; log: SyncLogEntry[]; workspace?: Workspace; syncing: string[] }

const KEY = "virtual-pmo-integrations";
const find = (text: string) => getProjects().find(p => p.name.toLowerCase().includes(text.toLowerCase()));

function seed(): State {
  const ebbot = find("Ebbot"); const planner = getProjects().filter(p => p.taskSource !== "Native").slice(0, 5);
  const linked = [ebbot, ...planner].filter((p, i, all): p is NonNullable<typeof p> => !!p && all.findIndex(x => x?.id === p.id) === i).slice(0, 5);
  const pid = (i: number) => linked[i % Math.max(1, linked.length)]?.id ?? "";
  return {
    connection: { tenantName: "University of Dundee", tenantDomain: "dundee.ac.uk", status: "Connected", connectedBy: "Chris McDonald", connectedOn: "02/09/2026", environments: ["dundee.crm11.dynamics.com"], directorySyncedAt: "25/09/2026 02:00", directoryPeople: 412 },
    links: linked.map((p, i) => ({ projectId: p.id, planId: `plan-${p.id}`, kind: p.taskSource === "Planner (Basic)" ? "Basic" : "Premium", lastSync: i === 2 ? "25/09/2026 11:06" : "25/09/2026 13:45", mode: p.taskSource === "Planner (Basic)" ? "Polling (5 min)" : i === 0 ? "Live updates" : "Change tracking", health: i === 2 ? "Failing" : i === 1 ? "Warning" : "Healthy" })),
    outbox: outboxSeed.map((o, i) => ({ ...o, projectId: pid(i) })),
    conflicts: conflictSeed.map((c, i) => ({ ...c, projectId: pid(i) })),
    log: logSeed.map((l, i) => ({ ...l, projectId: l.kind === "Directory" ? undefined : pid(i) })),
    syncing: [],
  };
}

let state: State = seed();
let loaded = false;
const listeners = new Set<() => void>();
const server = seed();
function load() { loaded = true; try { const raw = localStorage.getItem(KEY); if (raw) state = { ...state, ...JSON.parse(raw), syncing: [] }; } catch { /* ignore */ } }
function set(next: Partial<State>) { state = { ...state, ...next }; try { localStorage.setItem(KEY, JSON.stringify({ ...state, syncing: [] })); } catch { /* ignore */ } listeners.forEach(l => l()); }
const get = () => { if (!loaded && typeof window !== "undefined") load(); return state; };
export function useIntegrations() { return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, get, () => server); }
const now = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const addLog = (entry: Omit<SyncLogEntry, "id" | "at">) => [{ ...entry, id: crypto.randomUUID(), at: now() }, ...get().log];

export const getConnection = () => get().connection;
export function startConsent() { set({ connection: { ...get().connection, status: "Connected", connectedBy: "Chris McDonald", connectedOn: now().slice(0, 10), adminRequestSentTo: undefined }, log: addLog({ kind: "Directory", message: "Admin consent granted for Virtual PMO" }) }); }
export function requestAdminConsent(adminEmail: string) { set({ connection: { ...get().connection, status: "Pending approval", adminRequestSentTo: adminEmail } }); }
export function disconnect() { set({ connection: { ...get().connection, status: "Needs reconnect" } }); }

export function discoverPlans(): DiscoveredPlan[] {
  return discoveredPlanSeeds.map(plan => {
    const word = plan.name.split(/[ (]/)[0];
    const match = plan.name.includes("social") ? undefined : find(plan.name) ?? find(word);
    return { ...plan, suggestedProjectId: match?.id, matchReason: match ? (plan.kind === "Premium" ? "Same project ID in Dataverse" : "Similar name") : undefined };
  });
}
export function linkPlan(projectId: string, plan: DiscoveredPlan) {
  const links = get().links.filter(l => l.projectId !== projectId && l.planId !== plan.id);
  set({ links: [...links, { projectId, planId: plan.id, kind: plan.kind, lastSync: now(), mode: plan.kind === "Basic" ? "Polling (5 min)" : "Change tracking", health: "Healthy" }], log: addLog({ projectId, kind: "Read", message: `Linked to “${plan.name}” and read ${plan.tasks} tasks` }) });
}
export function unlinkPlan(projectId: string) { set({ links: get().links.filter(l => l.projectId !== projectId) }); }
export function syncNow(projectId: string) {
  set({ syncing: [...get().syncing, projectId] });
  setTimeout(() => set({ syncing: get().syncing.filter(id => id !== projectId), links: get().links.map(l => l.projectId === projectId ? { ...l, lastSync: now(), health: "Healthy" } : l), log: addLog({ projectId, kind: "Read", message: "Manual sync complete" }) }), 1500);
}
export const listOutbox = () => get().outbox;
export function retryOutbox(id: string) { set({ outbox: get().outbox.map(o => o.id === id ? { ...o, status: "Sending", attempts: o.attempts + 1, lastError: undefined } : o) }); setTimeout(() => set({ outbox: get().outbox.filter(o => o.id !== id), log: addLog({ kind: "Write", message: "Queued change sent to Planner" }) }), 1500); }
export const listConflicts = () => get().conflicts;
export function resolveConflict(id: string, resolution: "Kept Planner" | "Reapplied") { set({ conflicts: get().conflicts.map(c => c.id === id ? { ...c, resolved: resolution } : c) }); }
export const listSyncLog = () => get().log;
export function saveWorkspace(workspace: Workspace) { set({ workspace, connection: { ...get().connection, tenantName: workspace.orgName, tenantDomain: workspace.domain } }); }
export function resetIntegrations() { state = seed(); set({}); }
