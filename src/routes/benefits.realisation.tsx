import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { RealisationWorkspace } from "@/components/realisation-workspace";
import { PageHeader } from "@/components/pmo-ui";
const title="Benefit Realisation — Virtual PMO",description="Cumulative benefit value, measurement cadence, PMO validation and benefits tracked beyond closure.";
export const Route=createFileRoute("/benefits/realisation")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Realisation});
function Realisation(){return <div className="space-y-6"><AutoBreadcrumbs/><PageHeader eyebrow="Benefits management" title="Realisation" description="Track the cumulative profile, chase measurements, validate evidence and keep hold of benefits after the project closes."/><RealisationWorkspace/></div>}
