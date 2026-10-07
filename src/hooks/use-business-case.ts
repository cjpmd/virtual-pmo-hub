// TanStack Query hooks over src/services/business-cases.ts. Every write refreshes the case
// (and its documents where relevant).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  getBusinessCase,
  listBenefitCategories,
  listCaseDocuments,
  type CaseOwner,
} from "@/services/business-cases";

const ownerKey = (owner: CaseOwner) =>
  "projectId" in owner ? `project:${owner.projectId}` : `request:${owner.requestId}`;

export const businessCaseKey = (orgId: string, owner: CaseOwner) =>
  ["org", orgId, "business-case", ownerKey(owner)] as const;

export function useBusinessCase(owner: CaseOwner | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: owner ? businessCaseKey(orgId, owner) : ["org", orgId, "business-case", "none"],
    queryFn: () => getBusinessCase(owner as CaseOwner),
    enabled: Boolean(owner),
  });
}

export function useCaseDocuments(businessCaseId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org", orgId, "business-case-documents", businessCaseId ?? ""] as const,
    queryFn: () => listCaseDocuments(businessCaseId as string),
    enabled: Boolean(businessCaseId),
  });
}

export function useBenefitCategories() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org", orgId, "lookup", "benefit_category"] as const,
    queryFn: () => listBenefitCategories(orgId),
    staleTime: 10 * 60_000,
  });
}

/** A mutation that refreshes the case (and documents) and reports errors as toasts. */
export function useCaseAction<TArgs>(
  owner: CaseOwner,
  run: (args: TArgs) => Promise<unknown>,
  success?: string,
) {
  const orgId = useOrgId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      if (success) toast.success(success);
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: businessCaseKey(orgId, owner) });
      await client.invalidateQueries({ queryKey: ["org", orgId, "business-case-documents"] });
    },
  });
}
