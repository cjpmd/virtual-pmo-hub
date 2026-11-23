import { createFileRoute } from "@tanstack/react-router";
import { StrategicRiskRegister } from "@/components/assurance/strategic-risk-register";

// NHS-1: Board assurance (strategic risk register). Shown in navigation only while the
// 'assurance' module is on (lib/modules.ts navPaths); the page itself says when it's off.
const title = "Board assurance — ORMO PMO",
  description =
    "The organisation's strategic risks with controls, sources of assurance, gaps, appetite and trend.";
export const Route = createFileRoute("/governance/assurance")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: StrategicRiskRegister,
});
