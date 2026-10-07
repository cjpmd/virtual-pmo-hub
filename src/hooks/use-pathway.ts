// TanStack Query hooks over src/services/pathway.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  archiveDocument,
  createCapability,
  createOutcome,
  deleteIndicator,
  loadPathway,
  recordAcceptance,
  reverseAcceptance,
  reviewIndicatorMeasurement,
  saveIndicator,
  setRealisationStart,
  submitIndicatorMeasurement,
  updateCapability,
  updateOutcome,
  uploadEvidence,
  type CapabilityInput,
  type IndicatorInput,
  type OutcomeInput,
  type PathwayBenefit,
  type PathwayCapability,
  type PathwayIndicator,
  type PathwayOutcome,
} from "@/services/pathway";
import { qk } from "@/services/query-keys";
import { invalidateRollups } from "./use-project-records";

export function usePathway() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.benefits.pathway(orgId), queryFn: () => loadPathway(orgId) });
}

/** Pathway records feed capability, outcome and benefit health, and the project and programme benefit dimension. */
function useOnSettled() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.benefits.all(orgId) }),
      invalidateRollups(queryClient, orgId),
    ]);
}

export function usePathwayMutations() {
  const onSettled = useOnSettled();
  return {
    saveCapability: useMutation({
      mutationFn: ({
        capability,
        input,
      }: {
        capability?: PathwayCapability;
        input: CapabilityInput;
      }) => (capability ? updateCapability(capability, input) : createCapability(input)),
      onSettled,
    }),
    recordAcceptance: useMutation({
      mutationFn: ({
        capability,
        input,
      }: {
        capability: PathwayCapability;
        input: { acceptedAt: string; acceptedById: string | null; note: string };
      }) => recordAcceptance(capability, input),
      onSettled,
    }),
    reverseAcceptance: useMutation({ mutationFn: reverseAcceptance, onSettled }),
    uploadEvidence: useMutation({
      mutationFn: ({ capabilityId, file }: { capabilityId: string; file: File }) =>
        uploadEvidence(capabilityId, file),
      onSettled,
    }),
    archiveDocument: useMutation({ mutationFn: archiveDocument, onSettled }),
    saveOutcome: useMutation({
      mutationFn: ({ outcome, input }: { outcome?: PathwayOutcome; input: OutcomeInput }) =>
        outcome ? updateOutcome(outcome, input) : createOutcome(input),
      onSettled,
    }),
    saveIndicator: useMutation({
      mutationFn: ({ input, existing }: { input: IndicatorInput; existing?: PathwayIndicator }) =>
        saveIndicator(input, existing),
      onSettled,
    }),
    deleteIndicator: useMutation({ mutationFn: deleteIndicator, onSettled }),
    submitMeasurement: useMutation({ mutationFn: submitIndicatorMeasurement, onSettled }),
    reviewMeasurement: useMutation({ mutationFn: reviewIndicatorMeasurement, onSettled }),
    setRealisationStart: useMutation({
      mutationFn: ({ benefit, date }: { benefit: PathwayBenefit; date: string | null }) =>
        setRealisationStart(benefit, date),
      onSettled,
    }),
  };
}
