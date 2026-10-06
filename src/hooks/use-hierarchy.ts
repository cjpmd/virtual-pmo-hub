// TanStack Query hooks over src/services/hierarchy.ts. Components call these; they never call
// supabase directly. Keys come from qk (src/services/query-keys.ts) and are always scoped to
// the current organisation, so switching organisation can never show another tenant's cache.
import { useQuery } from "@tanstack/react-query";
import { useOrganisation, useOrgId } from "@/components/auth/organisation-provider";
import {
  getMyResourceId,
  getProgramme,
  getProjectByCode,
  getProjectPermissions,
  listPeople,
  listPhases,
  listPortfolios,
  listProgrammes,
  listProjects,
} from "@/services/hierarchy";
import { loadPortfolioOverview } from "@/services/analytics";
import {
  listForecastHistory,
  listMilestones,
  listOrgRaid,
  listRaid,
} from "@/services/project-records";
import { qk } from "@/services/query-keys";

export function usePortfolios() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.portfolios.list(orgId), queryFn: () => listPortfolios(orgId) });
}

export function useProgrammes() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.programmes.list(orgId), queryFn: () => listProgrammes(orgId) });
}

export function useProgramme(programmeId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.programmes.detail(orgId, programmeId),
    queryFn: () => getProgramme(orgId, programmeId),
  });
}

export function useProjects() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.projects.list(orgId), queryFn: () => listProjects(orgId) });
}

export function useProject(code: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.detail(orgId, code.toUpperCase()),
    queryFn: () => getProjectByCode(orgId, code),
  });
}

/** What the current user may do on a project. Defaults to read-only until it loads. */
export function useProjectPermissions(projectId: string | undefined) {
  const orgId = useOrgId();
  const query = useQuery({
    queryKey: qk.projects.canEdit(orgId, projectId ?? ""),
    queryFn: () => getProjectPermissions(projectId ?? ""),
    enabled: Boolean(projectId),
    staleTime: 5 * 60_000,
  });
  return query.data ?? { canEdit: false, canDelete: false, canManageProject: false };
}

export function usePeople() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.resources.list(orgId),
    queryFn: () => listPeople(orgId),
    staleTime: 5 * 60_000,
  });
}

export function usePhases() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.phases(orgId),
    queryFn: () => listPhases(orgId),
    staleTime: 10 * 60_000,
  });
}

export function useMilestones(projectIds: string[], scopeKey: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.milestones(orgId, scopeKey),
    queryFn: () => listMilestones(projectIds),
    enabled: projectIds.length > 0,
  });
}

export function useRaid(projectId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.raid(orgId, projectId ?? ""),
    queryFn: () => listRaid(projectId ?? ""),
    enabled: Boolean(projectId),
  });
}

export function usePortfolioOverview(portfolioId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.portfolios.overview(orgId, portfolioId ?? ""),
    queryFn: () => loadPortfolioOverview(orgId, portfolioId ?? ""),
    enabled: Boolean(portfolioId),
  });
}

/** The signed-in user's resource id (null when their profile isn't linked to a person yet). */
export function useMyResourceId() {
  const orgId = useOrgId();
  const { profile } = useOrganisation();
  const query = useQuery({
    queryKey: qk.resources.mine(orgId, profile.id),
    queryFn: () => getMyResourceId(orgId, profile.id),
    staleTime: 10 * 60_000,
  });
  return query.data ?? null;
}

/** Every risk and issue in the organisation (RAIDD register). Lives under projects, so record writes refresh it. */
export function useOrgRaid() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.orgRaid(orgId), queryFn: () => listOrgRaid(orgId) });
}

export function useForecastHistory(projectId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.forecastHistory(orgId, projectId ?? ""),
    queryFn: () => listForecastHistory(projectId ?? ""),
    enabled: Boolean(projectId),
  });
}
