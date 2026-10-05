import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  getProfile,
  listMemberships,
  setLastOrganisation,
  type Membership,
  type Profile,
} from "@/services/auth";
import { qk } from "@/services/query-keys";
import { useUser } from "./session-provider";

export interface OrganisationContextValue {
  profile: Profile;
  organisation: Membership;
  organisations: Membership[];
  switchOrganisation: (organisationId: string) => void;
  switching: boolean;
}

const OrganisationContext = createContext<OrganisationContextValue | null>(null);

type OrganisationState =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "none"; profile: Profile }
  | { status: "ready"; value: OrganisationContextValue };

/**
 * Works out which organisation the user is in: profiles.last_organisation_id when they are
 * still a member, otherwise the first membership (and remembers that choice).
 */
export function useOrganisationState(): OrganisationState {
  const user = useUser();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: qk.memberships(user.id),
    queryFn: async () => {
      const [profile, organisations] = await Promise.all([
        getProfile(user.id),
        listMemberships(user.id),
      ]);
      return { profile, organisations };
    },
    staleTime: 5 * 60_000,
  });

  const switcher = useMutation({
    mutationFn: (organisationId: string) => setLastOrganisation(user.id, organisationId),
    onSuccess: async () => {
      // Drop every organisation-scoped query, then reload membership with the new choice.
      queryClient.removeQueries({ queryKey: ["org"] });
      await queryClient.invalidateQueries({ queryKey: qk.memberships(user.id) });
    },
  });

  const { mutate, isPending } = switcher;
  const data = me.data;
  const current = data
    ? (data.organisations.find((item) => item.organisationId === data.profile.lastOrganisationId) ??
      data.organisations[0])
    : undefined;

  // First sign-in, or the remembered organisation is gone: remember the one we picked.
  const needsRemember =
    !!data && !!current && current.organisationId !== data.profile.lastOrganisationId;
  useEffect(() => {
    if (needsRemember && current && !isPending) mutate(current.organisationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRemember, current?.organisationId]);

  const value = useMemo<OrganisationContextValue | null>(
    () =>
      data && current
        ? {
            profile: data.profile,
            organisation: current,
            organisations: data.organisations,
            switchOrganisation: (id) => {
              if (id !== current.organisationId) mutate(id);
            },
            switching: isPending,
          }
        : null,
    [data, current, mutate, isPending],
  );

  if (me.isPending) return { status: "loading" };
  if (me.isError) return { status: "error", error: me.error, retry: () => void me.refetch() };
  if (!value) return { status: "none", profile: me.data.profile };
  return { status: "ready", value };
}

export function OrganisationProvider({
  value,
  children,
}: {
  value: OrganisationContextValue;
  children: ReactNode;
}) {
  return <OrganisationContext.Provider value={value}>{children}</OrganisationContext.Provider>;
}

export function useOrganisation(): OrganisationContextValue {
  const value = useContext(OrganisationContext);
  if (!value) throw new Error("useOrganisation called outside OrganisationProvider");
  return value;
}

/** Shorthand for the current organisation id, used in every query key. */
export const useOrgId = () => useOrganisation().organisation.organisationId;
