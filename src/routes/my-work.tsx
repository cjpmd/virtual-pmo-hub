import { createFileRoute, Link } from "@tanstack/react-router";
import { GanttChart, ListPlus } from "lucide-react";
import { IssuedTaskTracker } from "@/components/issued-task-tracker";
import { openIssueTask } from "@/components/issue-task-sheet";
import { PageHeader } from "@/components/pmo-ui";
import { PortfolioTaskWorkspace } from "@/components/task-portfolio-workspace";
import { Button } from "@/components/ui/button";

export const Route=createFileRoute("/my-work")({head:()=>({meta:[{title:"My Work — Virtual PMO"},{name:"description",content:"Chris McDonald’s tasks, acknowledgements and issued work across the portfolio."},{property:"og:title",content:"My Work — Virtual PMO"},{property:"og:description",content:"Chris McDonald’s tasks, acknowledgements and issued work across the portfolio."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:MyWork});
function MyWork(){return <div className="space-y-7"><PageHeader eyebrow="Personal workspace" title="My Work" description="Your tasks, incoming requests and work issued to others across the portfolio." actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/my-timeline"><GanttChart/>My Timeline</Link></Button><Button onClick={()=>openIssueTask()}><ListPlus/>Issue task</Button></div>}/><IssuedTaskTracker/><PortfolioTaskWorkspace personal showCharts={false}/></div>}