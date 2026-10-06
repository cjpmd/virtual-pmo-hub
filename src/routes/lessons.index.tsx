import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/lessons/")({
  beforeLoad: () => {
    throw redirect({ to: "/governance/lessons", replace: true });
  },
});
