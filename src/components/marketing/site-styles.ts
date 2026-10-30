// Class names shared by the public site's buttons (ORMO brand restyle).
import { cn } from "@/lib/utils";

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Pill button on a dark background: white (primary) or outlined (secondary). */
export const sitePill = {
  primary: cn(
    "inline-flex min-h-[50px] items-center rounded-full bg-white px-[26px] text-[15px] font-bold text-site-navy no-underline hover:bg-[#e8f1ff] hover:text-site-navy",
    focusRing,
  ),
  secondary: cn(
    "inline-flex min-h-[50px] items-center rounded-full border border-site-ink-outline px-[26px] text-[15px] font-semibold text-white no-underline hover:bg-white/10 hover:text-white",
    focusRing,
  ),
  /** The primary button on light pages: navy with white text. */
  light:
    "inline-flex min-h-[50px] items-center rounded-full bg-site-navy px-[26px] text-[15px] font-bold text-white no-underline hover:bg-site-accent-strong hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent-strong",
};
