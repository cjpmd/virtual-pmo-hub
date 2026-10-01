/** Browser-local record store for items managed on boards (tasks, risks, issues, benefits, decisions...).
 *  Saves per-board deltas (created, edited, closed, deleted) so changes survive a refresh. */
const PREFIX = "virtual-pmo-records:";

export interface RecordDelta<T extends { id: string }> { created: T[]; edits: Record<string, Partial<T>>; deleted: string[] }

const empty = <T extends { id: string }>(): RecordDelta<T> => ({ created: [], edits: {}, deleted: [] });

export function loadDelta<T extends { id: string }>(key: string): RecordDelta<T> {
  if (typeof window === "undefined") return empty();
  try { const raw = localStorage.getItem(PREFIX + key); return raw ? { ...empty<T>(), ...JSON.parse(raw) } : empty(); } catch { return empty(); }
}

export function saveDelta<T extends { id: string }>(key: string, delta: RecordDelta<T>) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(delta)); } catch { /* ignore */ }
}

export function applyDelta<T extends { id: string }>(seed: T[], delta: RecordDelta<T>): T[] {
  const deleted = new Set(delta.deleted);
  const merged = [...delta.created, ...seed.filter(item => !delta.created.some(c => c.id === item.id))];
  return merged.filter(item => !deleted.has(item.id)).map(item => delta.edits[item.id] ? { ...item, ...delta.edits[item.id] } : item);
}

export function clearAllRecords() {
  try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
}

/** Status used when an item is closed, picked from the item's own status options. */
export function closedStatusFor(options: string[] | undefined): string {
  const order = ["Closed", "Done", "Completed", "Realised", "Embedded", "Superseded", "Approved"];
  return order.find(s => options?.includes(s)) ?? "Closed";
}
