import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { DecisionForumView } from "@/components/decision-forum";
import { PageHeader } from "@/components/pmo-ui";
const title = "Boards — Virtual PMO",
  description = "Decision forums, their members and meetings.";
export const Route = createFileRoute("/governance/forum")({
  validateSearch: (search: Record<string, unknown>): { forum?: string; meeting?: string } => ({
    ...(typeof search["forum"] === "string" && { forum: search["forum"] }),
    ...(typeof search["meeting"] === "string" &&
      typeof search["forum"] === "string" && { meeting: search["meeting"] }),
  }),
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
  component: Page,
});
function Page() {
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader eyebrow="Governance" title="Boards" description={description} />
      <DecisionForumView />
    </div>
  );
}
