import { currencySymbol, formatCurrency } from "@/lib/format";
import { formatCompactCurrency } from "@/lib/format";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Clock3, FileText, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/pmo-ui";
import { BoardWorkspace } from "@/components/board-workspace";
import { projectColumns, projectsToRows } from "@/lib/board-data";
import { HealthPill } from "@/components/health-pill";
import { CommitteePack, type CommitteePackSnapshot } from "@/components/committee-pack";
import { getBenefitRealised, getCollection, getCollectionMetrics, getCollectionProjects, getProjectBenefits, getProjectHealth } from "@/services/pmo";
import { Breadcrumbs } from "@/components/section-nav";
import { cn } from "@/lib/utils";
import type { Collection, Project } from "@/data/types";

export const Route=createFileRoute("/portfolio/collections/$collectionId")({head:({params})=>{const collection=getCollection(params.collectionId);const title=collection?`${collection.name} — Virtual PMO Collections`:"Collection — Virtual PMO";const description=collection?`Governance view and committee packs for ${collection.name}.`:"Portfolio collection.";return{meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}},component:CollectionPage});
const money = formatCompactCurrency;
function CollectionPage(){const {collectionId}=Route.useParams();const collection=getCollection(collectionId),projects=getCollectionProjects(collectionId),metrics=getCollectionMetrics(collectionId);const [preview,setPreview]=useState(false),[packs,setPacks]=useState<CommitteePackSnapshot[]>([]);if(!collection)return <p>Collection not found.</p>;const canGenerate=collection.id==="digital-committee";return <div className="space-y-8"><Breadcrumbs trail={[{label:"Portfolio",to:"/portfolio"},{label:"Collections",to:"/portfolio/collections"},{label:collection.name}]}/><PageHeader eyebrow={collection.type} title={collection.name} description="A cross-portfolio view used to focus governance discussion, decisions and delivery assurance." actions={canGenerate?<Button onClick={()=>setPreview(true)}><Presentation className="size-4"/>Generate committee pack</Button>:undefined}/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Projects" value={String(metrics.projectCount)}/><Metric label="Collection budget" value={money(metrics.budget)}/><Metric label="Forecast" value={money(metrics.forecast)}/><Metric label="Exceptions" value={String(metrics.rag.amber+metrics.rag.red)} detail={`${metrics.rag.amber} amber · ${metrics.rag.red} red`}/></div><section><div className="mb-4"><h2 className="font-display text-xl font-semibold">Projects</h2><p className="mt-1 text-sm text-muted-foreground">Projects included in this collection.</p></div><BoardWorkspace title="Collection projects" rows={projectsToRows(projects)} columns={projectColumns} groupOptions={["status","stage","priority"]} renderTitle={row=><Link to="/portfolio/projects/$projectId" params={{projectId:row.id}} className="text-primary hover:underline">{row.title}</Link>}/></section>{collection.type==="Funding stream"&&<InnovationPotReturn collection={collection} projects={projects}/>}<section><div className="mb-4"><h2 className="font-display text-xl font-semibold">Past packs</h2><p className="mt-1 text-sm text-muted-foreground">Saved snapshots from previous committee cycles.</p></div>{packs.length?<div className="grid gap-3">{packs.map(pack=><div key={pack.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center"><span className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground"><FileText className="size-5"/></span><div className="flex-1"><p className="font-semibold">Digital Committee pack · {pack.meetingDate}</p><p className="mt-1 text-xs text-muted-foreground">Generated {pack.generatedAt} · {pack.pageCount} pages</p></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4"/>Snapshot saved</span></div>)}</div>:<div className="rounded-lg border border-dashed border-border py-10 text-center"><Clock3 className="mx-auto size-6 text-muted-foreground"/><p className="mt-3 text-sm font-medium">No saved packs yet</p><p className="mt-1 text-xs text-muted-foreground">Generate and save a snapshot to create the first record.</p></div>}</section>{preview&&<CommitteePack collection={collection} projects={projects} onClose={()=>setPreview(false)} onSave={snapshot=>{setPacks(current=>[snapshot,...current]);setPreview(false)}}/>}</div>}
function Metric({label,value,detail}:{label:string;value:string;detail?:string}){return <div className="rounded-lg border border-border bg-card p-5 shadow-sm"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-4 text-3xl font-semibold">{value}</p>{detail&&<p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>}

function InnovationPotReturn({collection,projects}:{collection:Collection;projects:Project[]}){
  const rows=projects.map(project=>{
    const awarded=collection.awards?.[project.id]??0;
    const benefits=getProjectBenefits(project.id);
    const planned=benefits.reduce((sum,benefit)=>sum+Math.max(0,benefit.plannedTotalValue),0);
    const realised=benefits.reduce((sum,benefit)=>sum+Math.max(0,getBenefitRealised(benefit)),0);
    return {project,awarded,planned,realised,perPound:awarded?realised/awarded:0,plannedPerPound:awarded?planned/awarded:0,benefitCount:benefits.length};
  }).sort((a,b)=>b.perPound-a.perPound);
  const totalAwarded=rows.reduce((sum,row)=>sum+row.awarded,0),totalRealised=rows.reduce((sum,row)=>sum+row.realised,0);
  return <section>
    <div className="mb-4"><h2 className="font-display text-xl font-semibold">Benefits realised per {currencySymbol()} awarded</h2><p className="mt-1 text-sm text-muted-foreground">What each funded project has returned against the money it drew from the {collection.name}{collection.potAmount?` (${money(collection.potAmount)} pot)`:""}.</p></div>
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"><div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-11 px-4 font-semibold">Funded project</th><th className="px-4 font-semibold">Awarded</th><th className="px-4 font-semibold">Benefits</th><th className="px-4 font-semibold">Planned value</th><th className="px-4 font-semibold">Realised</th><th className="px-4 font-semibold">Realised per {currencySymbol()} awarded</th></tr></thead>
        <tbody>
          {rows.map(row=><tr key={row.project.id} className="border-t border-border">
            <td className="px-4 py-3"><Link to="/portfolio/projects/$projectId" params={{projectId:row.project.id}} className="font-medium text-primary hover:underline">{row.project.name}</Link></td>
            <td className="px-4 py-3">{money(row.awarded)}</td>
            <td className="px-4 py-3">{row.benefitCount}</td>
            <td className="px-4 py-3">{money(row.planned)}</td>
            <td className="px-4 py-3">{money(row.realised)}</td>
            <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",row.perPound>=1?"bg-health-good/20 text-health-good-foreground":row.perPound>0?"bg-health-warn/25 text-health-warn-foreground":"bg-muted text-muted-foreground")}>{formatCurrency(row.perPound, undefined, 2)}</span><span className="ml-2 text-xs text-muted-foreground">planned {formatCurrency(row.plannedPerPound, undefined, 2)}</span></td>
          </tr>)}
          <tr className="border-t border-border bg-muted/40 font-semibold"><td className="px-4 py-3">Pot total</td><td className="px-4 py-3">{money(totalAwarded)}</td><td className="px-4 py-3">{rows.reduce((sum,row)=>sum+row.benefitCount,0)}</td><td className="px-4 py-3">{money(rows.reduce((sum,row)=>sum+row.planned,0))}</td><td className="px-4 py-3">{money(totalRealised)}</td><td className="px-4 py-3">{formatCurrency(totalAwarded?totalRealised/totalAwarded:0, undefined, 2)}</td></tr>
        </tbody>
      </table>
    </div></div>
  </section>;
}
