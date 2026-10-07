import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { PathwayBoard } from "@/components/pathway/pathway-board";
import { usePathway } from "@/hooks/use-pathway";

const title = "Benefits pathway — Virtual PMO",
  description =
    "Capabilities enable outcomes, outcomes produce benefits: dates, acceptance and RAG.";

export const Route = createFileRoute("/benefits/pathway")({
  validateSearch: (search: Record<string, unknown>): { programme?: string } =>
    typeof search["programme"] === "string" && search["programme"]
      ? { programme: search["programme"] }
      : {},
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Pathway,
});

function Pathway() {
  const { programme } = useSearch({ from: "/benefits/pathway" });
  const navigate = useNavigate();
  const query = usePathway();
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Benefits management"
        title="Pathway"
        description="Projects deliver capabilities, capabilities enable outcomes, outcomes produce benefits. Hover or focus a RAG chip for the reason; open a capability or outcome to edit it."
      />
      <QueryState query={query}>
        {(data) => (
          <PathwayBoard
            data={data}
            programmeId={programme}
            onProgrammeChange={(id) =>
              navigate({
                to: "/benefits/pathway",
                search: id ? { programme: id } : {},
                replace: true,
              })
            }
          />
        )}
      </QueryState>
    </div>
  );
}
