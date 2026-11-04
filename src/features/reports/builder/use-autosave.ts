// Debounced autosave (spec §9.1: 1 s). Saves the latest value after it stops changing; a save
// that fails with a conflict stops autosaving until the page reloads the record.
import { useEffect, useRef, useState } from "react";
import { errorMessage, isServiceError } from "@/services/service-error";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";

export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  { delay = 1000, enabled = true }: { delay?: number; enabled?: boolean } = {},
) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const serialised = JSON.stringify(value);
  const last = useRef(serialised);
  const failed = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const valueRef = useRef(value);
  valueRef.current = value;
  // One save at a time: the effect re-runs when status changes, and without this a save slower
  // than `delay` was followed by a second one carrying the stale updated_at, which the server
  // refused as "changed by someone else" (RB-49). Changes made during a save are saved after it.
  const inFlight = useRef(false);
  useEffect(() => {
    if (!enabled || status === "conflict" || inFlight.current) return;
    if (serialised === last.current || serialised === failed.current) return;
    setStatus("pending");
    const timer = window.setTimeout(async () => {
      inFlight.current = true;
      setStatus("saving");
      try {
        await saveRef.current(valueRef.current);
        last.current = serialised;
        failed.current = null;
        setStatus("saved");
        setError(null);
      } catch (e) {
        failed.current = serialised;
        setError(errorMessage(e));
        setStatus(isServiceError(e) && e.kind === "conflict" ? "conflict" : "error");
      } finally {
        inFlight.current = false;
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [serialised, enabled, delay, status]);
  /** Mark a value as already saved (after loading or reloading the record). */
  const reset = (next: T) => {
    last.current = JSON.stringify(next);
    failed.current = null;
    setStatus("idle");
    setError(null);
  };
  return { status, error, reset, dirty: serialised !== last.current };
}
