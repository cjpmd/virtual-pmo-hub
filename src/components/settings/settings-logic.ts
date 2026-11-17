// Pure helpers behind the settings sections (GL-20b), kept apart from the components so they
// can be unit-tested without the settings store.

/** The list with item `index` swapped with its neighbour in `direction`; null at either end. */
export function movedItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] | null {
  const target = index + direction;
  if (target < 0 || target >= items.length) return null;
  const next = [...items];
  const moved = next[index]!;
  next[index] = next[target]!;
  next[target] = moved;
  return next;
}

/** Turns `tier` off if it's in `current`, else on, keeping the order of `all`. */
export function toggledTiers<T>(all: readonly T[], current: readonly T[], tier: T): T[] {
  return current.includes(tier)
    ? current.filter((item) => item !== tier)
    : all.filter((item) => item === tier || current.includes(item));
}

/** Axis labels for a matrix of `size`: the existing ones, then "Level n" for any new level. */
export function resizedLabels(labels: readonly string[], size: number): string[] {
  return Array.from({ length: size }, (_, index) => labels[index] ?? `Level ${index + 1}`);
}

/** The highest band whose minimum score `score` reaches; undefined below every band. */
export function bandForScore<B extends { minScore: number }>(
  bands: readonly B[],
  score: number,
): B | undefined {
  return [...bands].sort((a, b) => b.minScore - a.minScore).find((band) => score >= band.minScore);
}
