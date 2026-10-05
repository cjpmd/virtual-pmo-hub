import { useSyncExternalStore } from "react";
import { defaultSettings } from "@/data/settings-data";
import type { AppSettings, PermissionKey, TermKey, UserRole } from "@/data/settings-types";

// Settings belong to the organisation and live in Supabase (see services/org-settings.ts).
// This store holds the live copy every screen renders from. SettingsSync (components/auth)
// loads it when an organisation is selected and registers a persister that writes edits back.
// Until then, and on the server, the shipped defaults are used.
type Listener = () => void;
const listeners = new Set<Listener>();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Deep merge a patch over a base; arrays are replaced, not merged. */
function merge<T>(base: T, patch: unknown): T {
  if (
    Array.isArray(base) ||
    patch === null ||
    typeof patch !== "object" ||
    typeof base !== "object" ||
    base === null
  ) {
    return patch === undefined ? base : (patch as T);
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = (base as Record<string, unknown>)[key];
    result[key] =
      current !== undefined &&
      !Array.isArray(current) &&
      typeof current === "object" &&
      current !== null
        ? merge(current, value)
        : value;
  }
  return result as T;
}

const serverSnapshot: AppSettings = clone(defaultSettings);
let snapshot: AppSettings = clone(defaultSettings);

type Persister = (previous: AppSettings, next: AppSettings) => void;
let persister: Persister | null = null;

export function getSettings(): AppSettings {
  return snapshot;
}
function getServerSettings(): AppSettings {
  return serverSnapshot;
}
/** Kept for callers from the prototype; settings now arrive from the organisation. */
export function hydrateSettings() {}

function emit() {
  for (const listener of listeners) listener();
}
function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replace the live settings with what the organisation has stored (over the defaults). */
export function applyServerSettings(settings: Partial<AppSettings>) {
  snapshot = merge(clone(defaultSettings), settings);
  emit();
}

/** Back to the shipped defaults, e.g. when signing out or switching organisation. */
export function clearServerSettings() {
  snapshot = clone(defaultSettings);
  emit();
}

/** SettingsSync registers the function that saves edits; null while no organisation is loaded. */
export function setSettingsPersister(next: Persister | null) {
  persister = next;
}

/** Apply a partial update. Nested objects are merged, arrays replaced. Saved by the persister. */
export function updateSettings(
  patch: Partial<AppSettings> | ((current: AppSettings) => Partial<AppSettings>),
) {
  const resolved = typeof patch === "function" ? patch(snapshot) : patch;
  const previous = snapshot;
  snapshot = merge(snapshot, resolved);
  emit();
  persister?.(previous, snapshot);
}

/** Restore the organisation-wide preferences (not lists, phases or members) to the defaults. */
export function resetSettings() {
  const defaults = clone(defaultSettings);
  updateSettings({
    regional: { ...defaults.regional, exchangeRates: snapshot.regional.exchangeRates },
    workingTime: {
      ...defaults.workingTime,
      holidayCalendars: snapshot.workingTime.holidayCalendars,
    },
    terminology: defaults.terminology,
    health: defaults.health,
    risk: defaults.risk,
    benefits: { ...defaults.benefits, categories: snapshot.benefits.categories },
    notifications: defaults.notifications,
    templates: { ...defaults.templates, projectTemplates: snapshot.templates.projectTemplates },
  });
}

/** Subscribe a component to the settings store so changes apply instantly. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getServerSettings);
}

// ---- Derived helpers ----
export const getCurrentUser = () => {
  const settings = getSettings();
  return settings.users.find((user) => user.id === settings.currentUserId) ?? settings.users[0];
};
export const getRoleDefinition = (role: UserRole, settings = getSettings()) =>
  settings.roles.find((item) => item.role === role);
export const getDefaultHome = (settings = getSettings()) => {
  const user =
    settings.users.find((item) => item.id === settings.currentUserId) ?? settings.users[0];
  return (user ? getRoleDefinition(user.role, settings)?.defaultHome : undefined) ?? "/portfolio";
};
export const hasPermission = (permission: PermissionKey, settings = getSettings()) => {
  const user = settings.users.find((item) => item.id === settings.currentUserId);
  return user ? Boolean(getRoleDefinition(user.role, settings)?.permissions[permission]) : false;
};

/** Configurable entity name, e.g. term("programme") becomes "Workstream" when renamed. */
export const term = (key: TermKey, settings = getSettings()) =>
  settings.terminology.terms[key] ?? key;
export const lowerTerm = (key: TermKey, settings = getSettings()) =>
  term(key, settings).toLowerCase();
export function useTerm() {
  const settings = useSettings();
  return (key: TermKey) => term(key, settings);
}
