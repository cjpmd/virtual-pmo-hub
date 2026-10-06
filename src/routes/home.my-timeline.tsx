import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/pmo-ui";
import { TaskGantt, TaskKpis } from "@/components/task-portfolio-workspace";
import { QueryState } from "@/components/query-state";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { usePortfolioTasks } from "@/hooks/use-work-items";
import { personalTaskGroup } from "@/services/work-items";

export const Route = createFileRoute("/home/my-timeline")({
  head: () => ({
    meta: [
      { title: "My Timeline — Virtual PMO" },
      { name: "description", content: "Your personal task schedule across portfolio projects." },
      { property: "og:title", content: "My Timeline — Virtual PMO" },
      {
        property: "og:description",
        content: "Your personal task schedule across portfolio projects.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyTimeline,
});
function MyTimeline() {
  const query = usePortfolioTasks();
  const me = useMyResourceId();
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Personal workspace"
        title="My Timeline"
        description="Your delivery commitments across projects, grouped by when they need attention."
      />
      <QueryState query={query}>
        {(data) => {
          const items = data.tasks
            .filter((item) => me !== null && item.assigneeIds.includes(me))
            .map((item) => ({ ...item, personalGroup: personalTaskGroup(item) }));
          return (
            <>
              <TaskKpis items={items} />
              <TaskGantt items={items} personal />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
