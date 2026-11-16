import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";
import { useNotificationPreferences, useNotifications } from "@/hooks/use-notifications";
import { effectiveDigest, DIGEST_LABEL } from "@/lib/notification-settings";
const title = "Notifications — ORMO PMO",
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
  const { feed, read, markRead, markAllRead, unread } = useNotifications();
  const { preferences } = useNotificationPreferences();
  const navigate = useNavigate();
  const digest = effectiveDigest(settings.notifications, preferences.digest);
  const [filter, setFilter] = useState("All");
  const kinds = ["All", ...Array.from(new Set(feed.map((item) => item.kind)))];
  const shown = feed.filter((item) => filter === "All" || item.kind === filter);
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Personal workspace"
        title="Notifications"
        description="Everything the workspace has raised with you. Choose what you're told, and how, in Settings → Account."
        actions={
          <Button variant="outline" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck />
            Mark all read
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Unread"
          value={String(unread)}
          detail={`${feed.filter((item) => !item.resolved).length} needing attention`}
          icon="projects"
        />
        <KpiCard
          label="Email"
          value={DIGEST_LABEL[digest]}
          detail={preferences.digest ? "Your choice" : "Organisation default"}
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
              onClick={() => {
                markRead([item.id]);
                if (item.link) void navigate({ href: item.link });
              }}
              className={cn(
                "flex w-full items-start gap-3 p-4 text-left hover:bg-accent/30",
                !read.includes(item.id) && !item.resolved && "bg-primary/[0.03]",
                item.resolved && "text-muted-foreground",
              )}
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                <BellRing className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    !read.includes(item.id) && !item.resolved && "font-semibold",
                  )}
                >
                  {item.text}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.kind} · {formatDate(item.date)}
                  {item.resolved && " · Resolved"}
                </p>
              </div>
              {!read.includes(item.id) && !item.resolved && (
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
