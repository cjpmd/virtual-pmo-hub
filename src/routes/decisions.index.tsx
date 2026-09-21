import { createFileRoute } from "@tanstack/react-router";
import { DecisionsNav } from "@/components/decisions-nav";
import { DecisionsWorkspace } from "@/components/decisions-workspace";
import { PageHeader } from "@/components/pmo-ui";
const title="Decision Log — Virtual PMO",description="Decisions required, decisions made, forums, latency and supersession.";
export const Route=createFileRoute("/decisions/")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><PageHeader eyebrow="Governance" title="Decisions" description="Every decision the portfolio needs, the options considered and the rationale for what was chosen. Made decisions are read-only; changing one creates a superseding decision."/><DecisionsNav/><DecisionsWorkspace/></div>}
