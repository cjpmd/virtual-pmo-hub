import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Element width in real pixels.
 *
 * Line charts here are drawn at true pixel coordinates rather than in a stretched
 * viewBox: `preserveAspectRatio="none"` would squash every dot into an ellipse and
 * thin the strokes unevenly.
 */
export function useMeasuredWidth(fallback = 220) {
  const [width, setWidth] = useState(fallback);
  const observer = useRef<ResizeObserver>(null);
  const ref = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!node || typeof ResizeObserver === "undefined") return;
      observer.current = new ResizeObserver((entries) => {
        const next = entries[0]?.contentRect.width;
        if (next) setWidth(next);
      });
      observer.current.observe(node);
      setWidth(node.getBoundingClientRect().width || fallback);
    },
    [fallback],
  );
  useEffect(() => () => observer.current?.disconnect(), []);
  return { ref, width };
}
