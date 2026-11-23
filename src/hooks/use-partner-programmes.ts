// NHS-7: queries and mutations for partner programmes (services/partner-programmes.ts).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  acceptPartnerInvite,
  contributeProject,
  createPartnerInvite,
  getProgrammePartners,
  getSharedProgrammeOverview,
  listSharedProgrammes,
  previewPartnerInvite,
  revokePartnerInvite,
  revokeProgrammeShare,
  setProgrammeShareAccess,
  withdrawContribution,
  type ShareAccess,
} from "@/services/partner-programmes";
import { errorMessage } from "@/services/service-error";

export const partnerKeys = {
  all: ["partner-programmes"] as const,
  list: () => [...partnerKeys.all, "list"] as const,
  overview: (programmeId: string) => [...partnerKeys.all, "overview", programmeId] as const,
  partners: (programmeId: string) => [...partnerKeys.all, "partners", programmeId] as const,
  preview: (token: string, userId: string | null) =>
    [...partnerKeys.all, "preview", token, userId] as const,
};

export const useSharedProgrammes = (enabled = true) =>
  useQuery({ queryKey: partnerKeys.list(), queryFn: listSharedProgrammes, enabled });

export const useSharedProgrammeOverview = (programmeId: string, enabled = true) =>
  useQuery({
    queryKey: partnerKeys.overview(programmeId),
    queryFn: () => getSharedProgrammeOverview(programmeId),
    enabled,
  });

export const useProgrammePartners = (programmeId: string, enabled = true) =>
  useQuery({
    queryKey: partnerKeys.partners(programmeId),
    queryFn: () => getProgrammePartners(programmeId),
    enabled,
  });

export const usePartnerInvitePreview = (token: string | undefined, userId: string | null) =>
  useQuery({
    queryKey: partnerKeys.preview(token ?? "", userId),
    queryFn: () => previewPartnerInvite(token!),
    enabled: !!token && !!userId,
    retry: false,
  });

/** Every partner mutation refreshes all partner queries: they are small and few. */
function usePartnerMutation<A, R>(fn: (args: A) => Promise<R>, success?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success);
      return client.invalidateQueries({ queryKey: partnerKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export const useCreatePartnerInvite = () =>
  usePartnerMutation((a: { programmeId: string; email: string; access: ShareAccess }) =>
    createPartnerInvite(a.programmeId, a.email, a.access),
  );
export const useRevokePartnerInvite = () =>
  usePartnerMutation((id: string) => revokePartnerInvite(id), "Invitation withdrawn");
export const useAcceptPartnerInvite = () =>
  usePartnerMutation((a: { token: string; organisationId: string }) =>
    acceptPartnerInvite(a.token, a.organisationId),
  );
export const useSetShareAccess = () =>
  usePartnerMutation(
    (a: { shareId: string; access: ShareAccess }) => setProgrammeShareAccess(a.shareId, a.access),
    "Access changed",
  );
export const useRevokeShare = () =>
  usePartnerMutation((id: string) => revokeProgrammeShare(id), "Sharing ended");
export const useContributeProject = () =>
  usePartnerMutation(
    (a: { projectId: string; programmeId: string }) =>
      contributeProject(a.projectId, a.programmeId),
    "Project added to the programme",
  );
export const useWithdrawContribution = () =>
  usePartnerMutation(
    (id: string) => withdrawContribution(id),
    "Project taken out of the programme",
  );
