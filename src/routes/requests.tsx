import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/requests")({
  beforeLoad: () => {
    throw redirect({ to: "/portfolio/requests", replace: true });
  },
});
