import { createContext } from "react";

/**
 * Places in the app frame that a page can fill: the dark top band under the header (summary
 * strip, chart, signals) and the sticky status bar at the bottom. The shell owns the elements,
 * so the band joins the header and rail as one frame whatever the page's own layout.
 */
export interface ShellSlots {
  band: HTMLElement | null;
  status: HTMLElement | null;
}

export const ShellSlotsContext = createContext<ShellSlots>({ band: null, status: null });
