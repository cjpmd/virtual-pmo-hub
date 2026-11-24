import { createFileRoute } from "@tanstack/react-router";
import { ImpactAssessmentRegister } from "@/components/impact-assessment/impact-assessment-register";

// NHS-3: the impact assessment register. Shown in navigation only while the 'impact_assessment'
// module is on (lib/modules.ts navPaths); the page itself says when it's off.
const title = "Impact assessments — ORMO PMO",
  description =
    "Quality and equality impact assessments of projects and programmes, their sign-off and review dates.";
export const Route = createFileRoute("/governance/impact-assessments")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ImpactAssessmentRegister,
});
