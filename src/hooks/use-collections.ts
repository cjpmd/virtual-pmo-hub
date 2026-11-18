// Hooks over src/services/collections.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  addCollectionProjects,
  addCollectionType,
  createCollection,
  deleteCollection,
  listCollections,
  listCollectionTypes,
  removeCollectionProject,
  renameCollectionType,
  setCollectionArchived,
  setCollectionAward,
  updateCollection,
  type CollectionTypeOption,
  type CollectionView,
} from "@/services/collections";
import { qk } from "@/services/query-keys";

export function useCollections() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.collections(orgId),
    queryFn: () => listCollections(orgId),
  });
}

/** The organisation's collection types, hidden ones included (Settings › Lists). */
export function useCollectionTypes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.lookups(orgId, "collection_type"),
    queryFn: () => listCollectionTypes(orgId),
    staleTime: 5 * 60_000,
  });
}

/** GL-22 writes. Dialogs show their own errors (silent); the rest use the global toast. */
export function useCollectionMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.projects.collections(orgId) });
  // Types are also a Settings › Lists list, and collections show their type's label.
  const refreshTypes = () =>
    Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: qk.lookups(orgId, "collection_type") }),
      queryClient.invalidateQueries({ queryKey: qk.settings(orgId) }),
    ]);
  type Fields = { name: string; typeId: string; potAmount: number | null };
  return {
    create: useMutation({
      meta: { silent: true },
      mutationFn: (input: Fields & { workspaceId: string }) => createCollection(input),
      onSuccess: refresh,
    }),
    update: useMutation({
      meta: { silent: true },
      mutationFn: (input: { collection: CollectionView } & Fields) =>
        updateCollection(input.collection, input),
      onSuccess: refresh,
    }),
    setArchived: useMutation({
      mutationFn: (input: { collection: CollectionView; archived: boolean }) =>
        setCollectionArchived(input.collection, input.archived),
      onSuccess: refresh,
    }),
    remove: useMutation({
      meta: { silent: true },
      mutationFn: (id: string) => deleteCollection(id),
      onSuccess: refresh,
    }),
    addProjects: useMutation({
      meta: { silent: true },
      mutationFn: (input: { collectionId: string; projectIds: string[] }) =>
        addCollectionProjects(input.collectionId, input.projectIds),
      onSuccess: refresh,
    }),
    removeProject: useMutation({
      mutationFn: (input: { collectionId: string; projectId: string }) =>
        removeCollectionProject(input.collectionId, input.projectId),
      onSuccess: refresh,
    }),
    addType: useMutation({
      meta: { silent: true },
      mutationFn: (input: { label: string; types: CollectionTypeOption[] }) =>
        addCollectionType(orgId, input.label, input.types),
      onSuccess: refreshTypes,
    }),
    renameType: useMutation({
      meta: { silent: true },
      mutationFn: (input: { type: CollectionTypeOption; label: string }) =>
        renameCollectionType(input.type, input.label),
      onSuccess: refreshTypes,
    }),
    setAward: useMutation({
      mutationFn: (input: { collectionId: string; projectId: string; amount: number | null }) =>
        setCollectionAward(input.collectionId, input.projectId, input.amount),
      onSuccess: refresh,
    }),
  };
}
