import { useSyncExternalStore } from "react";
import { defaultSettings } from "@/data/settings-data";
import type { AppSettings, PermissionKey, TermKey, UserRole } from "@/data/settings-types";

const STORAGE_KEY = "virtual-pmo-settings";
type Listener = () => void;
const listeners = new Set<Listener>();

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Deep merge stored settings over the defaults so new keys appear after an upgrade. */
function merge<T>(base: T, patch: unknown): T {
  if (Array.isArray(base) || patch === null || typeof patch !== "object" || typeof base !== "object" || base === null) {
    return (patch === undefined ? base : (patch as T));
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = (base as Record<string, unknown>)[key];
    result[key] = current !== undefined && !Array.isArray(current) && typeof current === "object" && current !== null
      ? merge(current, value)
      : value;
  }
  return result as T;
}

const serverSnapshot: AppSettings = clone(defaultSettings);
let snapshot: AppSettings = clone(defaultSettings);
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) snapshot = merge(clone(defaultSettings), JSON.parse(stored));
  } catch {
    snapshot = clone(defaultSettings);
  }
}

/**
 * Stored settings are only adopted once the client has hydrated, so the first client
 * render matches the server markup exactly. `hydrateSettings` swaps them in afterwards.
 */
export function getSettings(): AppSettings {
  return snapshot;
}
function getServerSettings(): AppSettings { return serverSnapshot }
export function hydrateSettings() {
  if (loaded) return;
  load();
  emit();
}

function emit() {
  for (const listener of listeners) listener();
}
function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

/** Apply a partial update. Nested objects are merged, arrays replaced. */
export function updateSettings(patch: Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>)) {
  load();
  const resolved = typeof patch === "function" ? patch(snapshot) : patch;
  snapshot = merge(snapshot, resolved);
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)) } catch { /* storage unavailable */ }
  }
  emit();
}
export function resetSettings() {
  loaded = true;
  snapshot = clone(defaultSettings);
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* storage unavailable */ }
  }
  emit();
}

/** Subscribe a component to the settings store so changes apply instantly. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getServerSettings);
}

// ---- Derived helpers ----
export const getCurrentUser = () => {
  const settings = getSettings();
  return settings.users.find(user => user.id === settings.currentUserId) ?? settings.users[0];
};
export const getRoleDefinition = (role: UserRole, settings = getSettings()) => settings.roles.find(item => item.role === role);
export const getDefaultHome = (settings = getSettings()) => {
  const user = settings.users.find(item => item.id === settings.currentUserId) ?? settings.users[0];
  return (user ? getRoleDefinition(user.role, settings)?.defaultHome : undefined) ?? "/portfolio";
};
export const hasPermission = (permission: PermissionKey, settings = getSettings()) => {
  const user = settings.users.find(item => item.id === settings.currentUserId);
  return user ? Boolean(getRoleDefinition(user.role, settings)?.permissions[permission]) : false;
};

/** Configurable entity name, e.g. term("programme") becomes "Workstream" when renamed. */
export const term = (key: TermKey, settings = getSettings()) => settings.terminology.terms[key] ?? key;
export const lowerTerm = (key: TermKey, settings = getSettings()) => term(key, settings).toLowerCase();
export function useTerm() {
  const settings = useSettings();
  return (key: TermKey) => term(key, settings);
}
