import { saveProject } from "@/services/entity-store";
import { formatCompactCurrency } from "@/lib/format";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ListPlus, Plus } from "lucide-react";
import { BoardWorkspace, type SavedView } from "@/components/board-workspace";
import { NewProjectSheet } from "@/components/new-project-sheet";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import type { Project } from "@/data/types";
import { projectColumns, projectsToRows } from "@/lib/board-data";
import { getProjectHealth, getProjectPortfolioDetails, getProjects } from "@/services/pmo";
import { openIssueTask } from "@/components/issue-task-sheet";
export const Route=createFileRoute("/portfolio/projects/")({head:()=>({meta:[{title:"Projects — Virtual PMO"},{name:"description",content:"Manage delivery across every project."},{property:"og:title",content:"Projects — Virtual PMO"},{property:"og:description",content:"Manage delivery across every project."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:ProjectsPage});

const visible=projectColumns.map(column=>column.key);
const seededViews:SavedView[]=[
 {id:"all-active",name:"All active",type:"table",groupBy:"",sortKey:"title",filter:"",filters:[{key:"state",operator:"equals",value:"Active"}],visible,isDefault:true},
 {id:"by-programme",name:"By programme",type:"table",groupBy:"programme",sortKey:"title",filter:"",filters:[{key:"state",operator:"equals",value:"Active"}],visible,isDefault:false},
 {id:"by-manager",name:"By project manager",type:"table",groupBy:"manager",sortKey:"title",filter:"",filters:[{key:"state",operator:"equals",value:"Active"}],visible,isDefault:false},
 {id:"rag-exceptions",name:"Red and amber",type:"table",groupBy:"status",sortKey:"programme",filter:"",filters:[{key:"status",operator:"oneOf",value:["At Risk","Off Track"]}],visible,isDefault:false},
 {id:"closed",name:"Closed",type:"table",groupBy:"programme",sortKey:"title",filter:"",filters:[{key:"state",operator:"equals",value:"Closed"}],visible,isDefault:false},
 {id:"reports-overdue",name:"Status reports overdue",type:"table",groupBy:"programme",sortKey:"lastReport",filter:"",filters:[{key:"statusReportOverdue",operator:"truthy"}],visible,isDefault:false},
 {id:"digital-committee",name:"Digital Committee",type:"table",groupBy:"status",sortKey:"title",filter:"",filters:[{key:"digitalCommittee",operator:"truthy"}],visible,isDefault:false},
];

function ProjectsPage(){
 const [items,setItems]=useState<Project[]>(()=>getProjects()),[createOpen,setCreateOpen]=useState(false);
 const metrics=useMemo(()=>{const counts={Proposed:0,Active:0,"On Hold":0,Closed:0};for(const project of items)counts[project.state]+=1;const budget=items.reduce((sum,item)=>sum+item.budget,0),forecast=items.reduce((sum,item)=>sum+item.forecast,0),onTrack=items.filter(item=>getProjectHealth(item)==="On Track").length,outstanding=items.filter(item=>getProjectPortfolioDetails(item).statusReportOverdue).length;return{counts,budget,forecast,percentOnTrack:items.length?Math.round(onTrack/items.length*100):0,outstanding}},[items]);
 const rows=useMemo(()=>projectsToRows(items),[items]);
 const exportCsv=()=>{const headings=projectColumns.map(column=>column.label);const values=rows.map(row=>projectColumns.map(column=>{const value=row[column.key];const text=Array.isArray(value)?value.join("; "):String(value??"");return `"${text.replaceAll('"','""')}"`}).join(","));const blob=new Blob([[headings.join(","),...values].join("\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="virtual-pmo-projects-21-09-2026.csv";anchor.click();URL.revokeObjectURL(url)};
 return <div className="space-y-6"><AutoBreadcrumbs/><PageHeader eyebrow="Portfolio delivery" title="Projects" description="Plan, track and report on every project in one connected workspace." actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>openIssueTask()}><ListPlus/>Issue task</Button><Button variant="outline" onClick={exportCsv}><Download/>Export CSV</Button><Button onClick={()=>setCreateOpen(true)}><Plus/>New project</Button></div>}/><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Projects by state" value={`${metrics.counts.Active} active`} detail={`${metrics.counts.Proposed} proposed · ${metrics.counts["On Hold"]} on hold · ${metrics.counts.Closed} closed`} icon="projects"/><KpiCard label="Budget vs forecast" value={formatCompactCurrency(metrics.budget)} detail={`Forecast ${formatCompactCurrency(metrics.forecast)} · variance ${formatCompactCurrency(metrics.forecast-metrics.budget)}`} icon="budget"/><KpiCard label="On track" value={`${metrics.percentOnTrack}%`} detail="Based on calculated overall health" icon="health"/><KpiCard label="Status reports outstanding" value={String(metrics.outstanding)} detail="Missing or older than 14 days" icon="forecast"/></section><BoardWorkspace title="Projects" manage={false} rows={rows} columns={projectColumns} seededViews={seededViews} groupOptions={["programme","manager","state","status","stage","tier","priority"]} renderTitle={row=><Link to="/portfolio/projects/$projectId" params={{projectId:row.id}} className="text-primary hover:underline">{row.title}</Link>}/><NewProjectSheet open={createOpen} onOpenChange={setCreateOpen} onCreate={project=>saveProject(project)}/></div>
}
