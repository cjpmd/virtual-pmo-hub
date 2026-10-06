import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Clock3, FileText, Presentation } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { CollectionCommitteePack, type CommitteePackSnapshot } from "@/components/committee-pack";
import { QueryState } from "@/components/query-state";
import { useCollections } from "@/hooks/use-collections";
import type { CollectionView } from "@/services/collections";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useSettings } from "@/services/settings";
const title="Committee Packs — Virtual PMO",description="Generate and store governance packs for each committee.";
export const Route=createFileRoute("/governance/committee-packs")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});

function Page(){
 const query=useCollections();
 return <QueryState query={query}>{collections=><Packs collections={collections}/>}</QueryState>;
}

function Packs({collections}:{collections:CollectionView[]}){
 const settings=useSettings();
 const governance=collections.filter(item=>item.type==="Governance");
 const [previewId,setPreviewId]=useState<string|null>(null);
 const [packs,setPacks]=useState<Array<CommitteePackSnapshot&{collectionId:string;collectionName:string}>>([]);
 const collection=governance.find(item=>item.id===previewId);
 return <div className="space-y-6">
  <AutoBreadcrumbs/>
  <PageHeader eyebrow="Governance" title="Committee packs" description="Build the pack for a governance forum, preview every page and save a dated snapshot. Section order and cover text are set in Settings → Templates."/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <KpiCard label="Governance forums" value={String(governance.length)} detail="Collections that generate a pack" icon="projects"/>
   <KpiCard label="Pack sections" value={String(settings.templates.committeePack.sectionOrder.length)} detail={settings.templates.committeePack.sectionOrder.slice(0,3).join(", ")} icon="forecast"/>
   <KpiCard label="Snapshots saved" value={String(packs.length)} detail="In this session" icon="budget"/>
   <KpiCard label="Logo on cover" value={settings.templates.committeePack.showLogo?"Yes":"No"} detail="Template setting" icon="health"/>
  </div>
  <div className="grid gap-4 lg:grid-cols-3">
   {governance.map(item=>{const projects=item.projectIds;return <div key={item.id} className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">{item.name}</h2><p className="mt-1 text-xs text-muted-foreground">{projects.length} projects in scope</p></div><FileText className="size-5 text-primary"/></div>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{settings.templates.committeePack.coverText}</p>
    <div className="mt-4 flex gap-2"><Button size="sm" onClick={()=>setPreviewId(item.id)}><Presentation/>Generate pack</Button><Button size="sm" variant="outline" asChild><Link to="/portfolio/collections/$collectionId" params={{collectionId:item.id}}>Open collection</Link></Button></div>
   </div>})}
   {!governance.length&&<p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground lg:col-span-3">No governance collections are configured.</p>}
  </div>
  <section><h2 className="font-display text-lg font-semibold">Saved snapshots</h2>
   {packs.length?<div className="mt-3 grid gap-3">{packs.map(pack=><div key={pack.id} className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center">
    <span className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground"><FileText className="size-5"/></span>
    <div className="flex-1"><p className="font-semibold">{pack.collectionName} pack · {formatDate(pack.meetingDate)}</p><p className="mt-1 text-xs text-muted-foreground">Generated {pack.generatedAt} · {pack.pageCount} pages</p></div>
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4"/>Snapshot saved</span>
   </div>)}</div>
   :<div className="mt-3 rounded-lg border border-dashed py-10 text-center"><Clock3 className="mx-auto size-6 text-muted-foreground"/><p className="mt-3 text-sm font-medium">No saved packs yet</p><p className="mt-1 text-xs text-muted-foreground">Snapshots are kept for this session only; stored pack history needs document storage, which isn't set up yet.</p></div>}
  </section>
  {collection&&<CollectionCommitteePack collection={collection} onClose={()=>setPreviewId(null)}
   onSave={snapshot=>{setPacks(current=>[{...snapshot,collectionId:collection.id,collectionName:collection.name},...current]);setPreviewId(null)}}/>}
 </div>;
}
