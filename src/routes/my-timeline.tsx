import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/pmo-ui";
import { TaskGantt, TaskKpis } from "@/components/task-portfolio-workspace";
import { getPersonalTaskGroup, getPortfolioTasks } from "@/services/pmo";

export const Route=createFileRoute("/my-timeline")({head:()=>({meta:[{title:"My Timeline — Virtual PMO"},{name:"description",content:"Chris McDonald’s personal task schedule across portfolio projects."},{property:"og:title",content:"My Timeline — Virtual PMO"},{property:"og:description",content:"Chris McDonald’s personal task schedule across portfolio projects."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:MyTimeline});
function MyTimeline(){const items=getPortfolioTasks().filter(item=>item.assignees.includes("Chris McDonald")).map(item=>({...item,personalGroup:getPersonalTaskGroup(item)}));return <div className="space-y-7"><PageHeader eyebrow="Personal workspace" title="My Timeline" description="Your delivery commitments across projects, grouped by when they need attention."/><TaskKpis items={items}/><TaskGantt items={items} personal/></div>}