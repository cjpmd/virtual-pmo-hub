import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { ResourceAllocation } from "@/components/resource-allocation";
import { PageHeader } from "@/components/pmo-ui";
export const Route=createFileRoute("/resources/allocation")({head:()=>({meta:[{title:"Resource Allocation — Virtual PMO"},{name:"description",content:"Plan weekly people and skill capacity across the next 26 weeks."},{property:"og:title",content:"Resource Allocation — Virtual PMO"},{property:"og:description",content:"Plan weekly people and skill capacity across the next 26 weeks."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><AutoBreadcrumbs/><PageHeader eyebrow="Portfolio capacity" title="Resource Allocation" description="See pressure points, leave and demand across the next 26 weeks."/><ResourceAllocation/></div>}