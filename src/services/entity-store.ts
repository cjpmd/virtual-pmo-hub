import { useSyncExternalStore } from "react";
import { portfolio, programmes, projects } from "@/data/mock-data";
import type { Portfolio, Programme, Project } from "@/data/types";
import { clearAllRecords } from "@/services/record-store";

/** Browser-local store for created/edited portfolios, programmes and projects.
 *  Mutates the shared mock arrays in place so every service function sees the changes. */
const KEY = "virtual-pmo-entities";
interface Saved { portfolios: Portfolio[]; programmes: Programme[]; projects: Project[]; edits: Record<string, Record<string, unknown>>; currentPortfolioId?: string }

export const portfolios: Portfolio[] = [portfolio];
const seededIds = new Set([portfolio.id, ...programmes.map(p => p.id), ...projects.map(p => p.id)]);
const originals = new Map<string, Record<string, unknown>>();
for (const item of [portfolio, ...programmes, ...projects]) originals.set(item.id, { ...item });

let saved: Saved = { portfolios: [], programmes: [], projects: [], edits: {} };
let currentPortfolioId = portfolio.id;
let version = 0;
let loaded = false;
const listeners = new Set<() => void>();

function persist() {
  saved.currentPortfolioId = currentPortfolioId;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ }
  version += 1;
  listeners.forEach(listener => listener());
}

function applyCreated<T extends { id: string }>(target: T[], items: T[]) {
  for (const item of items) { const index = target.findIndex(entry => entry.id === item.id); if (index >= 0) target[index] = item; else target.push(item); }
}

export function loadEntities() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) saved = { ...saved, ...JSON.parse(raw) }; } catch { /* ignore */ }
  applyCreated(portfolios, saved.portfolios);
  applyCreated(programmes, saved.programmes);
  applyCreated(projects, saved.projects);
  for (const [id, patch] of Object.entries(saved.edits)) {
    const item = [...portfolios, ...programmes, ...projects].find(entry => entry.id === id);
    if (item) Object.assign(item, patch);
  }
  if (saved.currentPortfolioId && portfolios.some(p => p.id === saved.currentPortfolioId)) currentPortfolioId = saved.currentPortfolioId;
  version += 1;
  listeners.forEach(listener => listener());
}

export function useEntityVersion() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => version, () => 0);
}

export const getCurrentPortfolioId = () => currentPortfolioId;
export function setCurrentPortfolio(id: string) { currentPortfolioId = id; persist(); }

function upsert<T extends { id: string }>(kind: "portfolios" | "programmes" | "projects", target: T[], item: T) {
  const existing = target.find(entry => entry.id === item.id);
  if (existing) Object.assign(existing, item); else target.push(item);
  if (seededIds.has(item.id)) saved.edits[item.id] = { ...(saved.edits[item.id] ?? {}), ...item };
  else applyCreated(saved[kind] as unknown as T[], [{ ...item }]);
  persist();
}

export const savePortfolio = (item: Portfolio) => upsert("portfolios", portfolios, item);
export const saveProgramme = (item: Programme) => upsert("programmes", programmes, item);
export const saveProject = (item: Project) => upsert("projects", projects, item);

export function resetEntities() {
  clearAllRecords();
  saved = { portfolios: [], programmes: [], projects: [], edits: {} };
  currentPortfolioId = portfolio.id;
  for (const list of [portfolios, programmes, projects] as { id: string }[][]) {
    for (let i = list.length - 1; i >= 0; i--) { const item = list[i]!; const original = originals.get(item.id); if (original) { for (const key of Object.keys(item)) if (!(key in original)) delete (item as Record<string, unknown>)[key]; Object.assign(item, original); } else list.splice(i, 1); }
  }
  persist();
}

export const slugId = (prefix: string, name: string) => `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${Date.now().toString(36)}`;
