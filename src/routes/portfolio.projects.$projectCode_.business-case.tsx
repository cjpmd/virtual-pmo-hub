import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BusinessCasePage } from "@/components/business-case/business-case-page";
import { useProject, useProjectPermissions } from "@/hooks/use-hierarchy";

const title = "Business case — Virtual PMO",
  description = "The project's business case: Five Case Model sections, options, benefits and documents.";

export const Route = createFileRoute("/portfolio/projects/$projectCode_/business-case")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectBusinessCase,
});

function ProjectBusinessCase() {
  const { projectCode } = Route.useParams();
  const project = useProject(projectCode);
  const permissions = useProjectPermissions(project.data?.id);
  if (project.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!project.data) return <p className="text-sm text-muted-foreground">Project not found.</p>;
  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/portfolio/projects/$projectCode"
          params={{ projectCode }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {project.data.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold">Business case</h1>
      </div>
      <BusinessCasePage
        owner={{ projectId: project.data.id }}
        defaultTitle={`${project.data.name} business case`}
        canEdit={permissions.canEdit}
      />
    </div>
  );
}
