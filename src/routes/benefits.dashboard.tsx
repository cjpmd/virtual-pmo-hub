import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/benefits/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/benefits", replace: true });
  },
});
