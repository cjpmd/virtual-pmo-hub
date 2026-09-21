import { createFileRoute } from "@tanstack/react-router";
import { BoardWorkspace } from "@/components/board-workspace";
import { LessonsNav } from "@/components/lessons-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { improvementActionColumns, improvementActionsToRows } from "@/lib/lesson-board-data";
import { getImprovementActions } from "@/services/lessons";
const title="Improvement Actions — Virtual PMO",description="Improvement actions arising from lessons, with owners, due dates and where each one is embedded.";
export const Route=createFileRoute("/lessons/actions")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){
 const actions=getImprovementActions();
 const embedded=actions.filter(action=>action.embeddedIn);
 return <div className="space-y-7">
  <PageHeader eyebrow="Continuous improvement" title="Improvement actions" description="A lesson only becomes a lesson learned when something changes. These are the changes, and where they have been embedded."/>
  <LessonsNav/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <KpiCard label="Actions" value={String(actions.length)} detail="Raised from lessons" icon="projects"/>
   <KpiCard label="Open" value={String(actions.filter(action=>action.status==="Open").length)} detail="Not yet started" icon="health"/>
   <KpiCard label="In progress" value={String(actions.filter(action=>action.status==="In progress").length)} detail="Underway" icon="forecast"/>
   <KpiCard label="Embedded" value={String(embedded.length)} detail={embedded.map(action=>action.embeddedIn).join(", ")||"None yet"} icon="budget"/>
  </div>
  <BoardWorkspace title="Improvement actions" rows={improvementActionsToRows(actions)} columns={improvementActionColumns} groupOptions={["group","people","embeddedIn"]} initialView="kanban"/>
 </div>;
}
