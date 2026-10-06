import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Health } from "@/data/types";

/**
 * Data-visualisation design system.
 *
 * Four colour jobs, one rule each:
 *  - categorical (identity)  fixed order, never cycled; a ninth series folds into "Other"
 *  - sequential  (magnitude) one hue, light to dark; reversed for the dark surface
 *  - diverging   (polarity)  the two ends of the sequential hue plus a neutral midpoint
 *  - status      (state)     reserved; never reused as a series colour, always with a label
 *
 * Both modes were validated against their own chart surface (#ffffff light, #0f172b
 * dark) for the lightness band, chroma floor, adjacent-pair CVD separation, the
 * normal-vision floor and contrast. The same values live in `styles.css` as oklch
 * custom properties; the hexes below are only needed where a colour has to be
 * interpolated or serialised (heat maps, gradients, PNG export).
 */
export const vizHex = {
  light: {
    categorical: [
      "#2a78d6",
      "#eb6834",
      "#1baf7a",
      "#eda100",
      "#e87ba4",
      "#008300",
      "#4a3aa7",
      "#e34948",
    ],
    sequential: [
      "#cde2fb",
      "#b7d3f6",
      "#9ec5f4",
      "#86b6ef",
      "#6da7ec",
      "#5598e7",
      "#3987e5",
      "#2a78d6",
      "#256abf",
      "#1c5cab",
      "#184f95",
      "#104281",
      "#0d366b",
    ],
    surface: "#ffffff",
  },
  dark: {
    categorical: [
      "#3987e5",
      "#d95926",
      "#199e70",
      "#c98500",
      "#d55181",
      "#008300",
      "#9085e9",
      "#e66767",
    ],
    sequential: [
      "#0d366b",
      "#104281",
      "#184f95",
      "#1c5cab",
      "#256abf",
      "#2a78d6",
      "#3987e5",
      "#5598e7",
      "#6da7ec",
      "#86b6ef",
      "#9ec5f4",
      "#b7d3f6",
      "#cde2fb",
    ],
    surface: "#0f172b",
  },
} as const;

/** Reserved state colours. Identical in both modes so a red always means the same thing. */
export const statusHex = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const CAT_COUNT = 8;
/** CSS custom property for categorical slot `index`. Never wraps: slot 9+ is "Other". */
export const catVar = (index: number) => `var(--viz-cat-${Math.min(index, CAT_COUNT - 1) + 1})`;
export const seqVar = (step: number) =>
  `var(--viz-seq-${Math.min(12, Math.max(0, Math.round(step))) + 1})`;
/** Sequential colour for a 0–1 magnitude. */
export const seqScale = (fraction: number) =>
  seqVar(Math.round(Math.min(1, Math.max(0, fraction)) * 12));

export const vizInk = "var(--viz-ink)";
export const vizInkMuted = "var(--viz-ink-muted)";
export const vizGrid = "var(--viz-grid)";
export const vizAxis = "var(--viz-axis)";
export const vizTrack = "var(--viz-track)";
export const vizSurface = "var(--viz-surface)";

export const healthVar: Record<Health, string> = {
  "On Track": "var(--viz-good)",
  "At Risk": "var(--viz-warning)",
  "Off Track": "var(--viz-critical)",
  "Not Set": "var(--viz-ink-muted)",
};
export const healthOrder: Health[] = ["On Track", "At Risk", "Off Track", "Not Set"];
/** Short state words carry the meaning when colour cannot: never ship the swatch alone. */
export const healthLabel: Record<Health, string> = {
  "On Track": "On track",
  "At Risk": "At risk",
  "Off Track": "Off track",
  "Not Set": "Not set",
};

/** Colour follows the entity, not its rank, so filtering a chart never repaints the survivors. */
export function seriesColours<T extends string>(keys: readonly T[]): Record<T, string> {
  const result = {} as Record<T, string>;
  keys.forEach((key, index) => {
    result[key] = catVar(index);
  });
  return result;
}

// ---- Dark mode ----
const darkListeners = new Set<() => void>();
let observer: MutationObserver | undefined;
function subscribeDark(listener: () => void) {
  darkListeners.add(listener);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      for (const item of darkListeners) item();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
  return () => {
    darkListeners.delete(listener);
  };
}
const readDark = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

/** Tracks the `.dark` class so colours that must be computed in JS follow the theme. */
export function useDarkMode() {
  return useSyncExternalStore(subscribeDark, readDark, () => false);
}

export interface ChartTheme {
  dark: boolean;
  categorical: readonly string[];
  sequential: readonly string[];
  surface: string;
  status: typeof statusHex;
  /** Resolved hex for a 0–1 magnitude, for inline interpolation such as heat-map cells. */
  scale: (fraction: number) => string;
  /** Resolved hex for categorical slot `index`. */
  series: (index: number) => string;
}

/** Resolved hex values for the active mode, for charts that must compute a colour. */
export function useChartTheme(): ChartTheme {
  const dark = useDarkMode();
  const mode = dark ? vizHex.dark : vizHex.light;
  const scale = useCallback(
    (fraction: number) =>
      mode.sequential[Math.round(Math.min(1, Math.max(0, fraction)) * 12)] ??
      mode.sequential[0] ??
      "#000",
    [mode],
  );
  const series = useCallback(
    (index: number) =>
      mode.categorical[Math.min(index, CAT_COUNT - 1)] ?? mode.categorical[0] ?? "#000",
    [mode],
  );
  return useMemo(
    () => ({
      dark,
      categorical: mode.categorical,
      sequential: mode.sequential,
      surface: mode.surface,
      status: statusHex,
      scale,
      series,
    }),
    [dark, mode, scale, series],
  );
}

// ---- Shared recharts chrome ----
/** Recessive axes: no axis line, no ticks, muted small labels. */
export const axisProps = {
  stroke: vizAxis,
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--viz-ink-muted)", fontSize: 11 },
} as const;
export const gridProps = { stroke: vizGrid, strokeDasharray: "0", vertical: false } as const;
/** 2px surface gap between adjacent fills, per the mark spec. */
export const SPACER = 2;
export const BAR_RADIUS = 4;
