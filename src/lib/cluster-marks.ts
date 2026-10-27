/**
 * Groups chart marks that sit closer than `minGap` pixels into one mark (progress chart
 * markers). A mark joins the cluster when it's within `minGap` of the previous mark, and the
 * cluster sits at the mean position of its members, so neighbouring clusters stay at least
 * `minGap` apart.
 */
export function clusterMarks<T>(
  marks: ReadonlyArray<{ x: number; item: T }>,
  minGap = 8,
): Array<{ x: number; items: T[] }> {
  const sorted = [...marks].sort((a, b) => a.x - b.x);
  const clusters: Array<{ xs: number[]; items: T[] }> = [];
  sorted.forEach((mark, i) => {
    const last = clusters[clusters.length - 1];
    if (last && i > 0 && mark.x - sorted[i - 1]!.x < minGap) {
      last.xs.push(mark.x);
      last.items.push(mark.item);
    } else clusters.push({ xs: [mark.x], items: [mark.item] });
  });
  return clusters.map(({ xs, items }) => ({
    x: xs.reduce((sum, value) => sum + value, 0) / xs.length,
    items,
  }));
}
