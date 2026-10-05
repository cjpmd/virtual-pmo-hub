// Which portfolio the Portfolio, Programmes and Projects pages show. The choice is a
// per-browser convenience (localStorage, per organisation); it is never needed for
// correctness, so a blocked or empty store falls back to the first open portfolio.
import { useCallback, useSyncExternalStore } from "react";
import { useOrgId } from "@/components/auth/organisation-provider";
import { usePortfolios } from "@/hooks/use-hierarchy";

const key = (orgId: string) => `vpmo.portfolio.${orgId}`;
const listeners = new Set<() => void>();

function read(orgId: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key(orgId));
  } catch {
    return null;
  }
}

export function setCurrentPortfolioId(orgId: string, portfolioId: string) {
  try {
    window.localStorage.setItem(key(orgId), portfolioId);
  } catch {
    // Not persisted; the in-memory notification below still switches this tab.
  }
  remembered.set(orgId, portfolioId);
  listeners.forEach((listener) => listener());
}

const remembered = new Map<string, string>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The selected portfolio, or the first open one. Undefined while portfolios load. */
export function useCurrentPortfolio() {
  const orgId = useOrgId();
  const portfolios = usePortfolios();
  const stored = useSyncExternalStore(
    subscribe,
    () => remembered.get(orgId) ?? read(orgId),
    () => null,
  );
  const items = portfolios.data ?? [];
  const portfolio =
    items.find((item) => item.id === stored) ??
    items.find((item) => item.state === "Active") ??
    items[0];
  const select = useCallback((id: string) => setCurrentPortfolioId(orgId, id), [orgId]);
  return { portfolio, portfolios, select };
}
