import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RoadmapWorkspace } from "@/components/roadmap-workspace";
import { PageHeader } from "@/components/pmo-ui";
import { getRoadmaps } from "@/services/pmo";

export const Route=createFileRoute("/portfolio/roadmap")({head:()=>({meta:[{title:"Portfolio Roadmaps — Virtual PMO"},{name:"description",content:"Plan and present portfolio delivery across linked projects and proposed initiatives."},{property:"og:title",content:"Portfolio Roadmaps — Virtual PMO"},{property:"og:description",content:"Plan and present portfolio delivery across linked projects and proposed initiatives."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:RoadmapsPage});

function RoadmapsPage(){const roadmaps=getRoadmaps(),[roadmapId,setRoadmapId]=useState(roadmaps[0]?.id??"");const roadmap=roadmaps.find(item=>item.id===roadmapId);if(!roadmap)return <p>No roadmaps available.</p>;return <div className="space-y-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><AutoBreadcrumbs/><PageHeader eyebrow="Portfolio planning" title="Roadmaps" description="Coordinate strategic delivery, proposed initiatives and key institutional dates."/><label className="grid gap-1 text-xs font-semibold text-muted-foreground">Roadmap<select aria-label="Roadmap" value={roadmapId} onChange={event=>setRoadmapId(event.target.value)} className="h-10 min-w-64 rounded-md border bg-background px-3 text-sm font-medium text-foreground">{roadmaps.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><RoadmapWorkspace key={roadmap.id} roadmap={roadmap}/></div>}