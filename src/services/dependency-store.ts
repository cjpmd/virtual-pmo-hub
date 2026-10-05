import { useSyncExternalStore } from "react";
import { dependencies } from "@/data/dependencies-data";
import type { Dependency } from "@/data/types";

const KEY = "virtual-pmo-dependencies";
let version = 0;
const listeners = new Set<() => void>();
let loaded = false;
let records: Dependency[] = dependencies;

export function loadDependencyRecords() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) records = parsed.filter((item): item is Dependency => typeof item?.id === "string" && !!item.giver?.kind && !!item.receiver?.kind);
    }
  } catch { records = dependencies; }
}

export function getDependencyRecords() {
  loadDependencyRecords();
  return records;
}

export function useDependencyVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(next: Dependency[]) {
  records = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  version += 1;
  listeners.forEach(listener => listener());
}

export function saveDependency(item: Dependency) {
  loadDependencyRecords();
  publish(records.some(record => record.id === item.id) ? records.map(record => record.id === item.id ? item : record) : [...records, item]);
}

export function deleteDependency(id: string) {
  loadDependencyRecords();
  publish(records.filter(record => record.id !== id));
}

export function nextDependencyReference() {
  const highest = Math.max(0, ...getDependencyRecords().map(item => Number(item.reference.match(/\d+$/)?.[0] ?? 0)));
  return `DEP-${String(highest + 1).padStart(3, "0")}`;
}

export function resetDependencyRecords() {
  records = dependencies;
  loaded = false;
  localStorage.removeItem(KEY);
  version += 1;
  listeners.forEach(listener => listener());
}