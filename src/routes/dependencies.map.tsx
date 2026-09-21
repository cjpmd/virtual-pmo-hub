import { createFileRoute } from "@tanstack/react-router";
import { DependenciesNav } from "@/components/dependencies-nav";
import { DependencyMap } from "@/components/dependency-map";
import { PageHeader } from "@/components/pmo-ui";
const title="Dependency Map — Virtual PMO",description="Network view of dependencies between programmes, projects and external parties.";
export const Route=createFileRoute("/dependencies/map")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><PageHeader eyebrow="Portfolio assurance" title="Dependency Map" description="Programmes are containers, projects sit inside them, and arrows are coloured by health and styled by type."/><DependenciesNav/><DependencyMap/></div>}
