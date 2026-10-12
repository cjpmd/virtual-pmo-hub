// Delivery assurance rows (declared vs evidenced, divergence, report due dates) from
// v_project_divergence, and the justification write.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  addDivergenceJustification,
  loadAssurance,
  loadProjectAssurance,
  type AssuranceRow,
} from "@/services/assurance";
import type { ProjectSummary } from "@/services/hierarchy";
import { qk } from "@/services/query-keys";

export function useAssurance() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.assurance(orgId),
    queryFn: () => loadAssurance(orgId),
  });
}

/** One project's assurance row (the project header); refreshed with the list on justification. */
export function useProjectAssurance(project: ProjectSummary) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.projectAssurance(orgId, project.id),
    queryFn: () => loadProjectAssurance(orgId, project),
  });
}

export function useJustifyDivergence() {
  const orgId = useOrgId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ row, text }: { row: AssuranceRow; text: string }) =>
      addDivergenceJustification(row, text),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.projects.assurance(orgId) }),
  });
}
