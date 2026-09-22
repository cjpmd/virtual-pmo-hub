import { createFileRoute } from "@tanstack/react-router";
import { ListPlus } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { IssuedTaskTracker } from "@/components/issued-task-tracker";
import { openIssueTask } from "@/components/issue-task-sheet";
import { PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
const title="Issued to me — Virtual PMO",description="Work issued to you by others, and the work you have issued.";
export const Route=createFileRoute("/home/issued")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){return <div className="space-y-6"><AutoBreadcrumbs/><PageHeader eyebrow="Personal workspace" title="Issued to me" description="Acknowledge, accept or propose a new date for work issued to you, and track what you have issued to others." actions={<Button onClick={()=>openIssueTask()}><ListPlus/>Issue task</Button>}/><IssuedTaskTracker/></div>}
