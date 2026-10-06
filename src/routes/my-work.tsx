import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/my-work")({
  beforeLoad: () => {
    throw redirect({ to: "/home/my-work", replace: true });
  },
});
