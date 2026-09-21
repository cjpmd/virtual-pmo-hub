import { createFileRoute } from "@tanstack/react-router";
import { ListPlus } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { IssuedTaskTracker } from "@/components/issued-task-tracker";
import { openIssueTask } from "@/components/issue-task-sheet";
import { PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
const title="Issue Tasks — Virtual PMO",description="Issue work to colleagues and track acknowledgement across the portfolio.";
export const Route=createFileRoute("/delivery/issue-tasks")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-7"><AutoBreadcrumbs/><PageHeader eyebrow="Portfolio delivery" title="Issue tasks" description="Send work to a named colleague with a due date and checklist, then track acknowledgement, acceptance and Planner sync." actions={<Button onClick={()=>openIssueTask()}><ListPlus/>Issue task</Button>}/><IssuedTaskTracker/></div>}
