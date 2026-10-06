// Connects a BoardWorkspace in server mode (onRecordChange) to service writes.
//
// The board reports edits as they happen, including every keystroke in an inline cell. This
// hook maps board column keys to service fields (via `toInput`), merges edits per record and
// writes them after a short pause, so typing a title is one write, not twenty. A patch that
// maps to nothing valid yet (e.g. a half-typed date) is held back until it becomes valid.
//
// Pending edits are never dropped. They are written:
//   - after the pause,
//   - as soon as focus leaves the field (blur),
//   - before the router navigates away, and when the board unmounts,
//   - when the tab is hidden or closed (and the browser is asked to confirm leaving while a
//     write is still pending or in flight).
// Writes to one record run one after another, each sending the updated_at the previous write
// returned, so a burst of edits never trips the optimistic-concurrency check on itself.
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import type { BoardRecordChange, BoardRow } from "@/components/board-workspace";
import { latest } from "@/services/write";

export interface BoardRecordHandlers<Input> {
  /** Board column key → service field. Return undefined for a value that isn't valid yet. */
  toInput: (patch: Partial<BoardRow>) => Input | undefined;
  create: (input: Input) => void;
  /** Resolves with the row's new updated_at (or nothing for tables without one). */
  update: (
    id: string,
    input: Input,
    lastSeen: string | null,
  ) => Promise<{ updatedAt: string | null } | void>;
  remove: (ids: string[]) => void;
  /** The updated_at the screen last loaded for a record. */
  lastSeen: (id: string) => string | null | undefined;
}

export function useBoardRecordSync<Input extends object>(
  handlers: BoardRecordHandlers<Input>,
  delay = 700,
) {
  const router = useRouter();
  const current = useRef(handlers);
  current.current = handlers;
  const pending = useRef(
    new Map<string, { patch: Partial<BoardRow>; timer: ReturnType<typeof setTimeout> }>(),
  );
  const inFlight = useRef(new Map<string, Promise<unknown>>());
  const writtenAt = useRef(new Map<string, string | null>());

  const flush = useCallback((id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    const input = current.current.toInput(entry.patch);
    // Hold back a patch that isn't valid yet; it stays pending for the next edit.
    if (input === undefined) return;
    clearTimeout(entry.timer);
    pending.current.delete(id);
    if (!Object.keys(input).length) return;
    const previous = inFlight.current.get(id) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        const lastSeen = latest(current.current.lastSeen(id), writtenAt.current.get(id));
        const result = await current.current.update(id, input, lastSeen);
        if (result) writtenAt.current.set(id, result.updatedAt);
      })
      .catch(() => {
        // The mutation reports the failure (toast) and refetches; forget our version so the
        // next edit uses what the server now says.
        writtenAt.current.delete(id);
      })
      .finally(() => {
        if (inFlight.current.get(id) === write) inFlight.current.delete(id);
      });
    inFlight.current.set(id, write);
  }, []);

  const flushAll = useCallback(() => {
    for (const id of [...pending.current.keys()]) flush(id);
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
      // Unmount (e.g. switching tab): write whatever is still waiting.
      flushAll();
    };
  }, [flushAll, router]);

  return useCallback(
    (change: BoardRecordChange) => {
      if (change.kind === "create") {
        const input = current.current.toInput(change.values);
        if (input) current.current.create(input);
        return;
      }
      if (change.kind === "delete") {
        for (const id of change.ids) {
          const entry = pending.current.get(id);
          if (entry) clearTimeout(entry.timer);
          pending.current.delete(id);
        }
        current.current.remove(change.ids);
        return;
      }
      const existing = pending.current.get(change.id);
      if (existing) clearTimeout(existing.timer);
      const patch = { ...existing?.patch, ...change.patch };
      pending.current.set(change.id, {
        patch,
        timer: setTimeout(() => flush(change.id), delay),
      });
    },
    [delay, flush],
  );
}
