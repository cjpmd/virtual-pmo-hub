// Starred projects and programmes, from Supabase (services/favourites.ts).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import { addFavourite, listFavourites, removeFavourite } from "@/services/favourites";
import { qk } from "@/services/query-keys";

export type FavouriteTarget = { projectId: string } | { programmeId: string };

export function useFavourites() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.favourites(orgId), queryFn: () => listFavourites(orgId) });
  const find = (target: FavouriteTarget) =>
    (query.data ?? []).find((row) =>
      "projectId" in target ? row.projectId === target.projectId : row.programmeId === target.programmeId,
    );
  const toggle = useMutation({
    mutationFn: async (target: FavouriteTarget) => {
      const existing = find(target);
      if (existing) await removeFavourite(existing.id);
      else await addFavourite(target);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.favourites(orgId) }),
  });
  return { favourites: query.data ?? [], isFavourite: (target: FavouriteTarget) => Boolean(find(target)), toggle };
}
