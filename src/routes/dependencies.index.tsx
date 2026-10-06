import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/dependencies/")({
  beforeLoad: () => {
    throw redirect({ to: "/delivery/dependencies", replace: true });
  },
});
