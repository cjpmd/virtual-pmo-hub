// Hooks over src/services/programme-notes.ts and src/services/dependency-layouts.ts
// (work package 1.5).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  deleteLayout,
  getOrganisationLayout,
  saveLayoutMerging,
  type NodePositions,
  type SavedLayout,
} from "@/services/dependency-layouts";
import { getProgrammeNote, saveProgrammeNote } from "@/services/programme-notes";
import { qk } from "@/services/query-keys";

export function useProgrammeNote(programmeId: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const key = qk.programmeNote(orgId, programmeId);
  return {
    query: useQuery({ queryKey: key, queryFn: () => getProgrammeNote(programmeId) }),
    save: useMutation({
      meta: { silent: true }, // the tab shows the error itself
      mutationFn: (input: { note: string; lastSeen: string | null }) =>
        saveProgrammeNote(programmeId, input.note, input.lastSeen),
      onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    }),
  };
}

export function useDependencyLayout() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const key = qk.dependencyLayout(orgId);
  return {
    query: useQuery({ queryKey: key, queryFn: () => getOrganisationLayout(orgId) }),
    save: useMutation({
      meta: { silent: true }, // the map shows the error itself
      mutationFn: (input: {
        saved: SavedLayout | null;
        positions: NodePositions;
        moved: Iterable<string>;
      }) => saveLayoutMerging({ orgId, ...input }),
      // The saved layout (merged with others' moves after a conflict) becomes the cache.
      onSuccess: (saved) => queryClient.setQueryData(key, saved),
    }),
    reset: useMutation({
      meta: { silent: true },
      mutationFn: deleteLayout,
      onSuccess: () => queryClient.setQueryData(key, null),
    }),
  };
}
