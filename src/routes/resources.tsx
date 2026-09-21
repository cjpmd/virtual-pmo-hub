import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/pmo-ui";
import { ResourceDashboard } from "@/components/resource-dashboard";
import { ResourceNav } from "@/components/resource-nav";
export const Route=createFileRoute("/resources")({head:()=>({meta:[{title:"Resource Dashboard — Virtual PMO"},{name:"description",content:"Portfolio capacity, utilisation and staffing insight."},{property:"og:title",content:"Resource Dashboard — Virtual PMO"},{property:"og:description",content:"Portfolio capacity, utilisation and staffing insight."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><PageHeader eyebrow="Portfolio capacity" title="Resource Dashboard" description="Understand capacity, utilisation, effort and staffing demand across DTS."/><ResourceNav/><ResourceDashboard/></div>}