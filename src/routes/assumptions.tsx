import { createFileRoute } from "@tanstack/react-router";
import { AssumptionsWorkspace } from "@/components/assumptions-workspace";
import { DecisionsNav } from "@/components/decisions-nav";
import { PageHeader } from "@/components/pmo-ui";
const title="Assumption Log — Virtual PMO",description="Assumptions, owners, validation dates and the issues raised when one turns out to be wrong.";
export const Route=createFileRoute("/assumptions")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><PageHeader eyebrow="Governance" title="Assumptions" description="What we are taking as true, who owns it, and when it will be checked. Invalidating an assumption prompts you to raise an issue."/><DecisionsNav/><AssumptionsWorkspace/></div>}
