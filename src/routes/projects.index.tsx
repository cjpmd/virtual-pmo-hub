import { createFileRoute, Link } from "@tanstack/react-router";
import { BoardWorkspace } from "@/components/board-workspace";
import { PageHeader } from "@/components/pmo-ui";
import { projectColumns, projectsToRows } from "@/lib/board-data";
import { getProjects } from "@/services/pmo";
export const Route=createFileRoute("/projects/")({head:()=>({meta:[{title:"Projects — Virtual PMO"},{name:"description",content:"Manage delivery across every project."},{property:"og:title",content:"Projects — Virtual PMO"},{property:"og:description",content:"Manage delivery across every project."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:ProjectsPage});
function ProjectsPage(){return <div className="space-y-7"><PageHeader eyebrow="Portfolio delivery" title="Projects" description="Plan, track and report on every project in one connected workspace."/><BoardWorkspace title="Projects" rows={projectsToRows(getProjects())} columns={projectColumns} groupOptions={["group","status","stage","priority"]} renderTitle={row=><Link to="/projects/$projectId" params={{projectId:row.id}} className="text-primary hover:underline">{row.title}</Link>}/></div>}
