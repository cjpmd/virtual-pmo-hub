/**
 * Sprint data is not stored in Supabase yet (it lives in the browser-local sprints.ts store,
 * generated per project), so nothing here may show its figures. The Delivery tab and the
 * forecast card say so until sprints move into the database (the "option A" phase), when
 * SprintDeliveryWorkspace and SprintForecastPanel (kept in ./sprint-delivery since GL-20c)
 * come back, reading the database.
 */
function NoSprintData({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-5 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground">
        No sprint data yet. Sprints, the burn-up, velocity and the what-if forecast return once
        sprints are recorded in ORMO PMO.
      </p>
    </div>
  );
}

export function DeliveryWorkspace(_props: { projectId: string }) {
  return <NoSprintData title="Delivery" />;
}

export function ForecastPanel(_props: { projectId: string; compact?: boolean }) {
  return <NoSprintData title="Evidence-based forecast" />;
}
