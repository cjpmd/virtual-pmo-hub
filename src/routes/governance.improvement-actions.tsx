import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BoardWorkspace } from "@/components/board-workspace";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useLessonMutations, useLessons } from "@/hooks/use-lessons";
import { useCan } from "@/hooks/use-permissions";
import { actionInputFromBoard, improvementActionColumns, improvementActionsToRows } from "@/lib/lesson-board-data";
import type { ActionInput, LessonsData } from "@/services/lessons";
const title="Improvement Actions — Virtual PMO",description="Improvement actions arising from lessons, with owners, due dates and where each one is embedded.";
export const Route=createFileRoute("/governance/improvement-actions")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});
function Page(){
 const query=useLessons();
 return <QueryState query={query}>{data=><Actions data={data}/>}</QueryState>;
}
function Actions({data}:{data:LessonsData}){
 const actions=data.actions;
 const embedded=actions.filter(action=>action.embeddedIn);
 const mutations=useLessonMutations();
 const canEdit=useCan("contributor");
 const onRecordChange=useBoardRecordSync<ActionInput>({
  toInput:actionInputFromBoard,
  create:()=>toast.error("Raise improvement actions from a recurring theme on the Lessons page."),
  update:(id,input,lastSeen)=>mutations.updateAction.mutateAsync({id,input,lastSeen}),
  remove:()=>toast.error("Improvement actions are kept for the record. Mark them done instead."),
  lastSeen:id=>actions.find(item=>item.id===id)?.updatedAt,
 });
 return <div className="space-y-6">
  <AutoBreadcrumbs/><PageHeader eyebrow="Continuous improvement" title="Improvement actions" description="A lesson only becomes a lesson learned when something changes. These are the changes, and where they have been embedded."/>
  
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <KpiCard label="Actions" value={String(actions.length)} detail="Raised from lessons" icon="projects"/>
   <KpiCard label="Open" value={String(actions.filter(action=>action.status==="Open").length)} detail="Not yet started" icon="health"/>
   <KpiCard label="In progress" value={String(actions.filter(action=>action.status==="In progress").length)} detail="Underway" icon="forecast"/>
   <KpiCard label="Embedded" value={String(embedded.length)} detail={embedded.map(action=>action.embeddedIn).join(", ")||"None yet"} icon="budget"/>
  </div>
  <BoardWorkspace key={String(canEdit)} title="Improvement actions" itemLabel="action" rows={improvementActionsToRows(actions)} columns={canEdit?improvementActionColumns:improvementActionColumns.map(column=>({...column,editable:false}))} manage={canEdit} canDelete={false} canCreate={false} onRecordChange={onRecordChange} groupOptions={["group","people","embeddedIn"]} initialView="kanban"/>
 </div>;
}
