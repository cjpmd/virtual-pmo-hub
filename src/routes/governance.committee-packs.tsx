import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Presentation } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { CollectionCommitteePack } from "@/components/committee-pack";
import { CommitteePackList } from "@/components/committee-pack-list";
import { QueryState } from "@/components/query-state";
import { useCollections } from "@/hooks/use-collections";
import type { CollectionView } from "@/services/collections";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { useCommitteePacks } from "@/hooks/use-committee-packs";
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
 const packs=useCommitteePacks();
 const collection=governance.find(item=>item.id===previewId);
 return <div className="space-y-6">
  <AutoBreadcrumbs/>
  <PageHeader eyebrow="Governance" title="Committee packs" description="Build the pack for a governance forum, preview every page and issue it for the meeting. Section order and cover text are set in Settings → Templates."/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <KpiCard label="Governance forums" value={String(governance.length)} detail="Collections that generate a pack" icon="projects"/>
   <KpiCard label="Pack sections" value={String(settings.templates.committeePack.sectionOrder.length)} detail={settings.templates.committeePack.sectionOrder.slice(0,3).join(", ")} icon="forecast"/>
   <KpiCard label="Packs issued" value={packs.data?String(packs.data.length):"—"} detail="Kept permanently" icon="budget"/>
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
  <section><h2 className="font-display text-lg font-semibold">Issued packs</h2>
   <div className="mt-3"><CommitteePackList query={packs} collectionNames={new Map(collections.map(item=>[item.id,item.name]))}/></div>
  </section>
  {collection&&<CollectionCommitteePack collection={collection} onClose={()=>setPreviewId(null)}
   onIssued={()=>setPreviewId(null)}/>}
 </div>;
}
