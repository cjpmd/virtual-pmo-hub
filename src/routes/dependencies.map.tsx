import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/dependencies/map")({
  beforeLoad: () => {
    throw redirect({ to: "/delivery/dependencies/map", replace: true });
  },
});
