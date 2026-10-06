import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";
const title = "Notifications — Virtual PMO",
  description = "Everything the workspace has told you, and how you are told.";
export const Route = createFileRoute("/home/notifications")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const settings = useSettings();
  const { feed, read, markRead } = useNotifications();
  const [filter, setFilter] = useState("All");
  const kinds = ["All", ...Array.from(new Set(feed.map((item) => item.kind)))];
  const shown = feed.filter((item) => filter === "All" || item.kind === filter);
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Personal workspace"
        title="Notifications"
        description="Everything the workspace has raised with you. Channels and per-event toggles are configured in Settings → Notifications."
        actions={
          <Button variant="outline" onClick={() => markRead(feed.map((item) => item.id))}>
            <CheckCheck />
            Mark all read
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Unread"
          value={String(feed.filter((item) => !read.includes(item.id)).length)}
          detail={`${feed.length} needing attention`}
          icon="projects"
        />
        <KpiCard
          label="Digest"
          value={settings.notifications.digest}
          detail="Delivery cadence"
          icon="forecast"
        />
        <KpiCard
          label="Channels on"
          value={String(Object.values(settings.notifications.channels).filter(Boolean).length)}
          detail={
            Object.entries(settings.notifications.channels)
              .filter(([, on]) => on)
              .map(([name]) => (name === "inApp" ? "In-app" : name === "email" ? "Email" : "Teams"))
              .join(", ") || "None"
          }
          icon="health"
        />
        <KpiCard
          label="Events enabled"
          value={String(Object.values(settings.notifications.events).filter(Boolean).length)}
          detail={`of ${Object.keys(settings.notifications.events).length} event types`}
          icon="budget"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={filter === kind ? "default" : "outline"}
            onClick={() => setFilter(kind)}
          >
            {kind}
          </Button>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <div className="divide-y">
          {shown.map((item) => (
            <button
              key={item.id}
              onClick={() => markRead([item.id])}
              className={cn(
                "flex w-full items-start gap-3 p-4 text-left hover:bg-accent/30",
                !read.includes(item.id) && "bg-primary/[0.03]",
              )}
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <BellRing className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !read.includes(item.id) && "font-semibold")}>
                  {item.text}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.kind} · {item.channel} · {formatDate(item.date)}
                </p>
              </div>
              {!read.includes(item.id) && (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          ))}
          {!shown.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nothing needs your attention.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
