import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { BenefitsMapCanvas } from "@/components/benefits-map-canvas";
import { PageHeader } from "@/components/pmo-ui";
const title="Benefits Map — Virtual PMO",description="Trace projects through capabilities, outcomes and benefits to strategic objectives.";
export const Route=createFileRoute("/benefits/map")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:BenefitsMap});
function BenefitsMap(){return <div className="space-y-6"><AutoBreadcrumbs/><PageHeader eyebrow="Benefits management" title="Benefits Map" description="Projects deliver capabilities, capabilities enable outcomes, outcomes produce benefits, and benefits move strategic objectives. Disbenefits are shown in red."/><BenefitsMapCanvas/></div>}
