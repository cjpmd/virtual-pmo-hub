import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/my-timeline")({
  beforeLoad: () => {
    throw redirect({ to: "/home/my-timeline", replace: true });
  },
});
