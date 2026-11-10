// GL-5: whether the organisation accepts writes, and which banner the app shell shows. The
// database decides writability (public.organisation_writable); the browser only reads it.
import { useQuery } from "@tanstack/react-query";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { useProjectPermissions } from "@/hooks/use-hierarchy";
import {
  accessBanner,
  getOrgWritable,
  getSubscriptionStatus,
  type AccessBanner,
} from "@/services/billing";
import { qk } from "@/services/query-keys";

const STALE = 5 * 60_000;

function useWritableQuery() {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  return useQuery({
    queryKey: qk.access.writable(orgId),
    queryFn: () => getOrgWritable(orgId),
    staleTime: STALE,
    // The demo organisation is always writable; no need to ask.
    enabled: !organisation.isDemo,
  });
}

/**
 * False only once the database has said the organisation is read-only (trial ended or the
 * subscription lapsed). True while loading, so buttons don't flicker disabled.
 */
export function useOrgWritable(): boolean {
  return useWritableQuery().data ?? true;
}

/** The banner for the app shell, or null. Admins also read the subscription row. */
export function useOrgAccess(): { banner: AccessBanner | null; isAdmin: boolean } {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const isAdmin = organisation.role === "admin";
  const writable = useWritableQuery();
  const subscription = useQuery({
    queryKey: qk.access.subscription(orgId),
    queryFn: () => getSubscriptionStatus(orgId),
    staleTime: STALE,
    enabled: isAdmin && !organisation.isDemo,
  });
  const banner =
    organisation.isDemo || writable.data === undefined
      ? null
      : accessBanner({
          isDemo: organisation.isDemo,
          isAdmin,
          writable: writable.data,
          subscription: subscription.data ?? null,
        });
  return { banner, isAdmin };
}

/**
 * A project's edit permissions with the organisation's read-only state applied: everything
 * false while read-only, so the project's tabs offer no edits the database would refuse.
 */
export function useProjectEditPermissions(projectId: string | undefined) {
  const permissions = useProjectPermissions(projectId);
  const writable = useOrgWritable();
  return writable
    ? permissions
    : { ...permissions, canEdit: false, canDelete: false, canManageProject: false };
}
