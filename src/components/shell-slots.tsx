import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ShellSlotsContext } from "@/components/shell-slots-context";

/** Content for the dark top band under the header. Always rendered with the dark tokens. */
export function TopBand({ children }: { children: ReactNode }) {
  const { band } = useContext(ShellSlotsContext);
  return band ? createPortal(children, band) : null;
}

/** Content for the sticky status bar at the bottom of the page. */
export function StatusBarSlot({ children }: { children: ReactNode }) {
  const { status } = useContext(ShellSlotsContext);
  return status ? createPortal(children, status) : null;
}
