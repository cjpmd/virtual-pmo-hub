// Delivery assurance inputs: projects with their declared RAG. Loading them also registers the
// projects with the browser-local sprint store, so any screen that reads delivery data
// (backlog, sprints, forecasts, highlight drafts) calls this first.
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useOrgId, useOrganisation } from "@/components/auth/organisation-provider";
import { loadAssuranceProjects } from "@/services/assurance";
import { qk } from "@/services/query-keys";
import { setDeliveryUser } from "@/services/sprints";

export function useAssuranceProjects() {
  const orgId = useOrgId();
  const { profile } = useOrganisation();
  useEffect(() => setDeliveryUser(profile.displayName ?? ""), [profile.displayName]);
  return useQuery({
    queryKey: qk.projects.assurance(orgId),
    queryFn: () => loadAssuranceProjects(orgId),
  });
}
