// Collects calls made within a short window into one request per group (RB-50). A report page
// asks for every block's data in the same render; batching turns ~45 requests into one, while
// each caller still gets its own promise (so every block keeps its own cache entry, error and
// retry). Groups split into requests of at most `maxSize` items.

export interface BatchOutcome<R> {
  ok: boolean;
  value?: R;
  error?: unknown;
}

export function createBatcher<G, I, R>(options: {
  /** Same key → same request. */
  groupKey: (group: G) => string;
  /** One request for many items; returns one outcome per item, in order. */
  run: (group: G, items: I[]) => Promise<Array<BatchOutcome<R>>>;
  windowMs?: number;
  maxSize?: number;
}) {
  const { groupKey, run, windowMs = 10, maxSize = 60 } = options;
  type Entry = { item: I; resolve: (value: R) => void; reject: (error: unknown) => void };
  const pending = new Map<string, { group: G; entries: Entry[] }>();

  const send = async (group: G, entries: Entry[]) => {
    try {
      const outcomes = await run(
        group,
        entries.map((e) => e.item),
      );
      entries.forEach((entry, i) => {
        const outcome = outcomes[i];
        if (!outcome) entry.reject(new Error("No result for this item."));
        else if (outcome.ok) entry.resolve(outcome.value as R);
        else entry.reject(outcome.error);
      });
    } catch (error) {
      for (const entry of entries) entry.reject(error);
    }
  };

  const flush = (key: string) => {
    const batch = pending.get(key);
    pending.delete(key);
    if (!batch) return;
    for (let i = 0; i < batch.entries.length; i += maxSize)
      void send(batch.group, batch.entries.slice(i, i + maxSize));
  };

  return function load(group: G, item: I): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const key = groupKey(group);
      let batch = pending.get(key);
      if (!batch) {
        batch = { group, entries: [] };
        pending.set(key, batch);
        setTimeout(() => flush(key), windowMs);
      }
      batch.entries.push({ item, resolve, reject });
    });
  };
}
