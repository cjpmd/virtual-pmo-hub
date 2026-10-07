import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { RoadmapWorkspace } from "@/components/roadmap-workspace";
import { PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { useRoadmaps } from "@/hooks/use-roadmaps";
import type { RoadmapView } from "@/services/roadmaps";

const title = "Portfolio Roadmaps — Virtual PMO",
  description =
    "Plan and present portfolio delivery across linked projects and proposed initiatives.";
export const Route = createFileRoute("/portfolio/roadmap")({
  // The focused dependency chain travels in the URL so the view can be shared.
  validateSearch: (search: Record<string, unknown>): { focus?: string } => {
    const focus = typeof search["focus"] === "string" ? search["focus"] : "";
    return /^(project|programme|milestone|external):/.test(focus) ? { focus } : {};
  },
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
  component: RoadmapsPage,
});

function RoadmapsPage() {
  const query = useRoadmaps();
  return (
    <QueryState query={query}>
      {(roadmaps) =>
        roadmaps.length ? (
          <Roadmaps roadmaps={roadmaps} />
        ) : (
          <div className="space-y-6">
            <AutoBreadcrumbs />
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No roadmaps yet.
            </p>
          </div>
        )
      }
    </QueryState>
  );
}

function Roadmaps({ roadmaps }: { roadmaps: RoadmapView[] }) {
  const [roadmapId, setRoadmapId] = useState(roadmaps[0]?.id ?? "");
  const { focus } = useSearch({ from: "/portfolio/roadmap" });
  const navigate = useNavigate();
  const roadmap = roadmaps.find((item) => item.id === roadmapId);
  if (!roadmap) return null;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <AutoBreadcrumbs />
          <PageHeader
            eyebrow="Portfolio planning"
            title="Roadmaps"
            description="Coordinate strategic delivery, proposed initiatives and key institutional dates. Click a dependency line to follow its chain."
          />
        </div>
        <label className="grid shrink-0 gap-1 pt-1 text-xs font-semibold text-muted-foreground">
          Roadmap
          <select
            aria-label="Roadmap"
            value={roadmapId}
            onChange={(event) => setRoadmapId(event.target.value)}
            className="h-10 min-w-64 rounded-md border bg-background px-3 text-sm font-medium text-foreground"
          >
            {roadmaps.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <RoadmapWorkspace
        key={roadmap.id}
        roadmap={roadmap}
        focusId={focus}
        onFocus={(id) =>
          navigate({ to: "/portfolio/roadmap", search: id ? { focus: id } : {}, replace: true })
        }
      />
    </div>
  );
}
