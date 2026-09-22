import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { ResourceScenarios } from "@/components/resource-scenarios";
import { PageHeader } from "@/components/pmo-ui";
export const Route=createFileRoute("/resources/scenarios")({head:()=>({meta:[{title:"Resource Scenarios — Virtual PMO"},{name:"description",content:"Model proposed project demand before portfolio approval."},{property:"og:title",content:"Resource Scenarios — Virtual PMO"},{property:"og:description",content:"Model proposed project demand before portfolio approval."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-6"><AutoBreadcrumbs/><PageHeader eyebrow="Portfolio capacity" title="Scenario Planning" description="Test when new work could start and understand its impact before approval."/><ResourceScenarios/></div>}