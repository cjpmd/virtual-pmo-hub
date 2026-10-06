import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/programmes/$programmeId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/portfolio/programmes/$programmeId", params, replace: true });
  },
});
