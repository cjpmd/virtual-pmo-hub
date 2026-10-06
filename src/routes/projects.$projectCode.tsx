import { createFileRoute, redirect } from "@tanstack/react-router";

// Short link: /projects/EBB → /portfolio/projects/EBB.
export const Route = createFileRoute("/projects/$projectCode")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/portfolio/projects/$projectCode",
      params: { projectCode: params.projectCode.toUpperCase() },
      replace: true,
    });
  },
});
