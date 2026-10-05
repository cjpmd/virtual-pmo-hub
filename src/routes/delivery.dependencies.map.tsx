import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { DependencyMap } from "@/components/dependency-map";
import { PageHeader } from "@/components/pmo-ui";
import { DependencyViewTabs } from "@/components/dependency-view-tabs";

const title = "Dependency Map — Virtual PMO", description = "Network view of dependencies between programmes, projects and external parties.";
export const Route = createFileRoute("/delivery/dependencies/map")({
  // The focused node travels in the URL so a chain can be shared as a link.
  validateSearch: (search: Record<string, unknown>): { focus?: string } => {
    const focus = typeof search["focus"] === "string" ? search["focus"] : "";
    return /^(programme|project|milestone|external):/.test(focus) ? { focus } : {};
  },
  head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Page,
});

function Page() {
  const { focus } = useSearch({ from: "/delivery/dependencies/map" });
  const navigate = useNavigate();
  return <div className="space-y-6">
    <AutoBreadcrumbs/>
    <PageHeader eyebrow="Portfolio assurance" title="Dependency Map" description="Programmes are containers, projects and milestones sit inside them, and arrows are coloured by health and styled by type. Click a node to follow its chain." />
    <DependencyViewTabs/>
    <DependencyMap focusId={focus} onFocus={id => navigate({ to: "/delivery/dependencies/map", search: id ? { focus: id } : {}, replace: true })}/>
  </div>;
}
