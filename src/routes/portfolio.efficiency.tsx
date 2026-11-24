import { createFileRoute, Outlet } from "@tanstack/react-router";

// NHS-4: the efficiency / savings programme (CIP in the NHS pack). Shown in navigation only while
// the 'efficiency' module is on (lib/modules.ts navPaths); the pages say when it's off.
const title = "Efficiency programme — ORMO PMO",
  description =
    "Savings schemes from idea to delivery, with monthly phasing, targets and risk-adjusted values.";
export const Route = createFileRoute("/portfolio/efficiency")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => <Outlet />,
});
