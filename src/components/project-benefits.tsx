// Benefits a project enables, from the benefits service (realisation and health from the views).
import { AppraisalPanel } from "@/components/appraisal-panel";
import { BenefitSummary } from "@/components/benefit-summary";
import { QueryState } from "@/components/query-state";
import { useBenefits } from "@/hooks/use-benefits";
import {
  benefitsForProgramme,
  benefitsForProject,
  draftsFromBenefits,
} from "@/services/benefits-value";

export function ProjectBenefits({ projectId }: { projectId: string }) {
  const benefits = useBenefits();
  return (
    <QueryState query={benefits}>
      {(data) => <BenefitSummary items={benefitsForProject(data, projectId)} />}
    </QueryState>
  );
}

/** Business case appraisal seeded from the project's confirmed benefit profiles. */
export function ProjectAppraisal({
  projectId,
  wholeLifeCost,
}: {
  projectId: string;
  wholeLifeCost: number;
}) {
  const benefits = useBenefits();
  return (
    <QueryState query={benefits}>
      {(data) => (
        <AppraisalPanel
          drafts={draftsFromBenefits(benefitsForProject(data, projectId))}
          wholeLifeCost={wholeLifeCost}
          years={5}
        />
      )}
    </QueryState>
  );
}

/** Benefits a programme's projects enable (or that are owned by the programme). */
export function ProgrammeBenefits({ programmeId }: { programmeId: string }) {
  const benefits = useBenefits();
  return (
    <QueryState query={benefits}>
      {(data) => <BenefitSummary items={benefitsForProgramme(data, programmeId)} />}
    </QueryState>
  );
}
