import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { DecisionForumView } from "@/components/decision-forum";
import { PageHeader } from "@/components/pmo-ui";
const title="Decision Forum — Virtual PMO",description="Generate a decision agenda for a forum and record outcomes in meeting mode.";
export const Route=createFileRoute("/governance/forum")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><AutoBreadcrumbs/><PageHeader eyebrow="Governance" title="Forum view" description="Pick a forum and meeting date to produce the decision agenda, then switch to meeting mode to record outcomes as you go."/><DecisionForumView/></div>}
