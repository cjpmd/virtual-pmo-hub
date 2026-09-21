import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, KpiCard } from "@/components/pmo-ui";
import { BarChart3, LayoutDashboard, User2, Zap } from "lucide-react";

export const Route = createFileRoute("/dashboards")({
  component: DashboardsPage,
});

function DashboardsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Intelligence"
        title="Dashboards"
        description="Personalized and shared views of portfolio performance."
      />
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <DashboardCard 
          title="Executive Summary" 
          description="High-level portfolio health and financial status for leadership."
          icon={BarChart3}
        />
        <DashboardCard 
          title="Project Manager Home" 
          description="Focus on your active projects, tasks, and overdue items."
          icon={User2}
        />
        <DashboardCard 
          title="Resource Allocation" 
          description="Visualize team capacity and identify over-allocations."
          icon={Zap}
        />
      </div>
      
      <section className="rounded-lg border border-dashed border-border p-12 text-center">
        <LayoutDashboard className="mx-auto size-12 text-muted-foreground/40" />
        <h3 className="mt-4 text-lg font-semibold">Custom Dashboards</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Create custom views by pinning charts and tables from across the Virtual PMO.
        </p>
      </section>
    </div>
  );
}

function DashboardCard({ title, description, icon: Icon }: { title: string; description: string; icon: any }) {
  return (
    <div className="group relative flex flex-col justify-between rounded-lg border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md">
      <div>
        <div className="mb-4 inline-flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <button className="mt-6 w-full rounded-md border border-border py-2 text-sm font-medium transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        Open Dashboard
      </button>
    </div>
  );
}
