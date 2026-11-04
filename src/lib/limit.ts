// Runs at most `max` async tasks at once; the rest wait in order. Used for the report builder's
// block data (RB-49): a pack fires ~30 RPCs on load, and all at once they queue on a small
// Supabase instance past the 8 s statement timeout, although each takes under a second alone.
export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    if (active >= max) return;
    const start = waiting.shift();
    if (start) {
      active += 1;
      start();
    }
  };
  // PromiseLike: Supabase query builders are thenables, not promises.
  return function limit<T>(task: () => PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
  };
}
