import { createFileRoute, redirect } from "@tanstack/react-router";
import { toProjectCode } from "@/services/legacy-bridge";

// Short link: /projects/EBB → /portfolio/projects/EBB. Old prototype ids still resolve.
export const Route = createFileRoute("/projects/$projectCode")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/portfolio/projects/$projectCode",
      params: { projectCode: toProjectCode(params.projectCode).toUpperCase() },
      replace: true,
    });
  },
});
