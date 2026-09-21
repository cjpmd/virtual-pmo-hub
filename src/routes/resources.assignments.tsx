import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { ResourceAssignments } from "@/components/resource-assignments";
import { PageHeader } from "@/components/pmo-ui";
export const Route=createFileRoute("/resources/assignments")({head:()=>({meta:[{title:"Resource Assignments — Virtual PMO"},{name:"description",content:"Review resource, project and task assignments across the portfolio."},{property:"og:title",content:"Resource Assignments — Virtual PMO"},{property:"og:description",content:"Review resource, project and task assignments across the portfolio."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><AutoBreadcrumbs/><PageHeader eyebrow="Portfolio capacity" title="Resource Assignments" description="Review planned effort from each resource through projects and tasks."/><ResourceAssignments/></div>}