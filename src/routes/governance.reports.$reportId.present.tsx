import { createFileRoute } from "@tanstack/react-router";
import { PresentationMode } from "@/features/reports/viewer/PresentationMode";
import { MeetingDrawer } from "@/features/reports/viewer/MeetingDrawer";

export const Route = createFileRoute("/governance/reports/$reportId/present")({
  head: () => ({ meta: [{ title: "Present report — ORMO PMO" }] }),
  component: Page,
});

function Page() {
  const { reportId } = Route.useParams();
  return (
    <PresentationMode reportId={reportId} drawer={() => <MeetingDrawer reportId={reportId} />} />
  );
}
