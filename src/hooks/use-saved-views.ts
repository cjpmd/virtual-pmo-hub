// Hooks over src/services/saved-views.ts and src/services/dashboards.ts (work package 1.3).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useUser } from "@/components/auth/session-provider";
import { useOrgRole } from "@/hooks/use-permissions";
import { atLeast } from "@/services/auth";
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
  updateDashboard,
  type DashboardPatch,
} from "@/services/dashboards";
import { qk } from "@/services/query-keys";
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
  type SavedViewPatch,
  type ViewConfig,
} from "@/services/saved-views";

/** Who is asking: their profile id, and whether they may edit shared (organisation) rows. */
function useViewer() {
  const me = useUser().id;
  const canManageShared = atLeast(useOrgRole(), "pmo");
  return { me, canManageShared };
}

/** A board's saved views. Without a board key the board keeps its seeded views only. */
export function useSavedViews(boardKey: string | undefined, fallback: ViewConfig) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const key = qk.savedViews(orgId, boardKey ?? "");
  const query = useQuery({
    queryKey: key,
    queryFn: () => listSavedViews(orgId, boardKey!, fallback),
    enabled: Boolean(boardKey),
  });
  const onSettled = () => queryClient.invalidateQueries({ queryKey: key });
  return {
    query,
    ...useViewer(),
    create: useMutation({
      meta: { silent: true }, // the board shows the error itself
      mutationFn: (input: { name: string; config: ViewConfig }) =>
        createSavedView({ orgId, boardKey: boardKey!, ...input }),
      onSettled,
    }),
    update: useMutation({
      meta: { silent: true },
      mutationFn: (input: { id: string; patch: SavedViewPatch; lastSeen: string }) =>
        updateSavedView(input.id, input.patch, input.lastSeen),
      onSettled,
    }),
    remove: useMutation({
      meta: { silent: true },
      mutationFn: deleteSavedView,
      onSettled,
    }),
  };
}

export function useDashboards() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const key = qk.dashboards(orgId);
  const query = useQuery({ queryKey: key, queryFn: () => listDashboards(orgId) });
  const onSettled = () => queryClient.invalidateQueries({ queryKey: key });
  return {
    query,
    ...useViewer(),
    create: useMutation({
      meta: { silent: true }, // the page shows the error itself
      mutationFn: (input: {
        name: string;
        widgets: Parameters<typeof createDashboard>[0]["widgets"];
      }) => createDashboard({ orgId, ...input }),
      onSettled,
    }),
    update: useMutation({
      meta: { silent: true },
      mutationFn: (input: { id: string; patch: DashboardPatch; lastSeen: string }) =>
        updateDashboard(input.id, input.patch, input.lastSeen),
      onSettled,
    }),
    remove: useMutation({ meta: { silent: true }, mutationFn: deleteDashboard, onSettled }),
  };
}
