// TanStack Query hooks over src/services/benefits.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  createBenefit,
  deleteBenefits,
  loadBenefits,
  reviewMeasurement,
  saveHandover,
  submitMeasurement,
  updateBenefit,
  type BenefitInput,
  type HandoverInput,
  type MeasurementInput,
} from "@/services/benefits";
import { qk } from "@/services/query-keys";
import { invalidateRollups } from "./use-project-records";

export function useBenefits() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.benefits.list(orgId), queryFn: () => loadBenefits(orgId) });
}

/** Benefit records feed benefit health, which rolls up into project, programme and portfolio health. */
function useOnSettled() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.benefits.all(orgId) }),
      invalidateRollups(queryClient, orgId),
    ]);
}

export function useBenefitMutations() {
  const onSettled = useOnSettled();
  return {
    update: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: BenefitInput;
        lastSeen?: string | null;
      }) => updateBenefit(id, input, lastSeen),
      onSettled,
    }),
    create: useMutation({ mutationFn: createBenefit, onSettled }),
    remove: useMutation({ mutationFn: deleteBenefits, onSettled }),
    submitMeasurement: useMutation({
      mutationFn: (input: MeasurementInput) => submitMeasurement(input),
      onSettled,
    }),
    reviewMeasurement: useMutation({ mutationFn: reviewMeasurement, onSettled }),
    saveHandover: useMutation({
      mutationFn: (input: HandoverInput) => saveHandover(input),
      onSettled,
    }),
  };
}
