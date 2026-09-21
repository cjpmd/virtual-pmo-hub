import { createFileRoute } from "@tanstack/react-router";
import { BoardWorkspace } from "@/components/board-workspace";
import { PageHeader } from "@/components/pmo-ui";
import { taskColumns, tasksToRows } from "@/lib/board-data";
import { getProjects } from "@/services/pmo";
export const Route=createFileRoute("/my-work")({head:()=>({meta:[{title:"My Work — Virtual PMO"},{name:"description",content:"Tasks and milestones assigned to Chris McDonald."},{property:"og:title",content:"My Work — Virtual PMO"},{property:"og:description",content:"Tasks and milestones assigned to Chris McDonald."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:MyWork});
function MyWork(){const tasks=getProjects().flatMap(project=>(project.tasks??[]).filter(task=>task.assignees.includes("Chris McDonald")||task.assignees.includes("Freya Walsh")).map(task=>({...task,title:`${task.title} · ${project.name}`})));return <div className="space-y-7"><PageHeader eyebrow="Personal workspace" title="My Work" description="Tasks and milestones needing your attention across the portfolio."/><BoardWorkspace title="My Work" rows={tasksToRows(tasks)} columns={taskColumns} groupOptions={["deliveryStatus","priority","group"]}/></div>}
