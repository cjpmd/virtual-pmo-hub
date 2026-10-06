// Debounced writes keyed by cell (or any id), for grids that save as people type.
//
// The same guarantees as useBoardRecordSync: an edit is written after a short pause, and
// pending edits are never dropped. They are written as soon as focus leaves the field, before
// the router navigates away, when the component unmounts, and when the tab is hidden or
// closed (the browser is asked to confirm leaving while a write is pending or in flight).
// Writes to one key run one after another, so a later value always lands last.
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";

export function useDebouncedWrites<V>(
  write: (key: string, value: V) => Promise<unknown>,
  delay = 600,
) {
  const router = useRouter();
  const current = useRef(write);
  current.current = write;
  const pending = useRef(new Map<string, { value: V; timer: ReturnType<typeof setTimeout> }>());
  const inFlight = useRef(new Map<string, Promise<unknown>>());

  const flush = useCallback((key: string) => {
    const entry = pending.current.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current.delete(key);
    const previous = inFlight.current.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(() => current.current(key, entry.value))
      .catch(() => {
        // The mutation reports the failure (toast) and refetches.
      })
      .finally(() => {
        if (inFlight.current.get(key) === next) inFlight.current.delete(key);
      });
    inFlight.current.set(key, next);
  }, []);

  const flushAll = useCallback(() => {
    for (const key of [...pending.current.keys()]) flush(key);
  }, [flush]);

  useEffect(() => {
    const busy = () => pending.current.size > 0 || inFlight.current.size > 0;
    const onFocusOut = () => flushAll();
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flushAll();
      if (busy()) event.preventDefault();
    };
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onBeforeUnload);
    const unsubscribe = router.subscribe("onBeforeNavigate", flushAll);
    return () => {
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onBeforeUnload);
      unsubscribe();
      flushAll();
    };
  }, [flushAll, router]);

  const queue = useCallback(
    (key: string, value: V) => {
      const existing = pending.current.get(key);
      if (existing) clearTimeout(existing.timer);
      pending.current.set(key, { value, timer: setTimeout(() => flush(key), delay) });
    },
    [delay, flush],
  );
  /** Drop a pending edit (e.g. the field went back to an invalid value). */
  const cancel = useCallback((key: string) => {
    const existing = pending.current.get(key);
    if (existing) clearTimeout(existing.timer);
    pending.current.delete(key);
  }, []);
  return { queue, cancel, flushAll };
}
