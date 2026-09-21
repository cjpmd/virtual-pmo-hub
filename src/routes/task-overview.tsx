import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/pmo-ui";
import { PortfolioTaskWorkspace } from "@/components/task-portfolio-workspace";
import { Button } from "@/components/ui/button";
import { ListPlus } from "lucide-react";
import { openIssueTask } from "@/components/issue-task-sheet";

export const Route=createFileRoute("/task-overview")({head:()=>({meta:[{title:"Portfolio Task Overview — Virtual PMO"},{name:"description",content:"Portfolio-wide task status, effort, workload and delivery timelines."},{property:"og:title",content:"Portfolio Task Overview — Virtual PMO"},{property:"og:description",content:"Portfolio-wide task status, effort, workload and delivery timelines."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:TaskOverviewPage});
function TaskOverviewPage(){return <div className="space-y-7"><PageHeader eyebrow="Portfolio delivery" title="Task Overview" description="Monitor task delivery, effort and exceptions across every project." actions={<Button onClick={()=>openIssueTask()}><ListPlus/>Issue task</Button>}/><PortfolioTaskWorkspace/></div>}