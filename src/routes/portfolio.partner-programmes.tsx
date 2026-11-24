import { createFileRoute, Outlet } from "@tanstack/react-router";

// NHS-7: partner (ICS) programmes, module `cross_org`.
export const Route = createFileRoute("/portfolio/partner-programmes")({
  head: () => ({
    meta: [
      { title: "Partner programmes — ORMO PMO" },
      {
        name: "description",
        content: "Programmes shared between partner organisations, with each partner's projects.",
      },
    ],
  }),
  component: () => <Outlet />,
});
