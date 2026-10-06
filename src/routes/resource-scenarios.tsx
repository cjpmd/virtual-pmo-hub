import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/resource-scenarios")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/scenarios", replace: true });
  },
});
