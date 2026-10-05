// Connects a BoardWorkspace in server mode (onRecordChange) to service writes.
//
// The board reports edits as they happen, including every keystroke in an inline cell. This
// hook maps board column keys to service fields (via `toInput`), merges edits per record and
// writes them after a short pause, so typing a title is one write, not twenty. A patch that
// maps to nothing valid yet (e.g. a half-typed date) is held back until it becomes valid.
import { useCallback, useEffect, useRef } from "react";
import type { BoardRecordChange, BoardRow } from "@/components/board-workspace";

export interface BoardRecordHandlers<Input> {
  /** Board column key → service field. Return undefined for a value that isn't valid yet. */
  toInput: (patch: Partial<BoardRow>) => Input | undefined;
  create: (input: Input) => void;
  update: (id: string, input: Input) => void;
  remove: (ids: string[]) => void;
}

export function useBoardRecordSync<Input extends object>(
  handlers: BoardRecordHandlers<Input>,
  delay = 700,
) {
  const latest = useRef(handlers);
  latest.current = handlers;
  const pending = useRef(
    new Map<string, { patch: Partial<BoardRow>; timer: ReturnType<typeof setTimeout> }>(),
  );

  const flush = useCallback((id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current.delete(id);
    const input = latest.current.toInput(entry.patch);
    if (input && Object.keys(input).length) latest.current.update(id, input);
  }, []);

  // Write anything still waiting when the board unmounts (e.g. the user switches tab).
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const id of [...map.keys()]) flush(id);
    };
  }, [flush]);

  return useCallback(
    (change: BoardRecordChange) => {
      if (change.kind === "create") {
        const input = latest.current.toInput(change.values);
        if (input) latest.current.create(input);
        return;
      }
      if (change.kind === "delete") {
        for (const id of change.ids) pending.current.delete(id);
        latest.current.remove(change.ids);
        return;
      }
      const current = pending.current.get(change.id);
      if (current) clearTimeout(current.timer);
      const patch = { ...current?.patch, ...change.patch };
      pending.current.set(change.id, { patch, timer: setTimeout(() => flush(change.id), delay) });
    },
    [delay, flush],
  );
}
