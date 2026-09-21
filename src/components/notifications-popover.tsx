import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const notifications = [
  {
    id: "1",
    title: "Project Milestone Delayed",
    description: "The 'Infrastructure Upgrade' milestone in Student Hub is overdue.",
    time: "2h ago",
    unread: true,
  },
  {
    id: "2",
    title: "New Risk Identified",
    description: "A critical risk was added to the ERP Modernisation programme.",
    time: "5h ago",
    unread: true,
  },
  {
    id: "3",
    title: "Change Request Approved",
    description: "Budget increase for Network Security Phase 2 has been approved.",
    time: "1d ago",
    unread: false,
  },
];

export function NotificationsPopover() {
  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 flex size-2.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-2 ring-background">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h4 className="text-sm font-semibold">Notifications</h4>
          <Button variant="ghost" className="h-auto p-0 text-xs text-primary hover:bg-transparent">
            Mark all as read
          </Button>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex gap-3 border-b border-border/50 p-4 transition-colors last:border-0 hover:bg-muted/50"
            >
              <div className="mt-1 flex-1">
                <p className="text-xs font-semibold">{n.title}</p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {n.description}
                </p>
                <p className="mt-2 text-[10px] text-muted-foreground">{n.time}</p>
              </div>
              {n.unread && (
                <div className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button variant="ghost" className="w-full text-xs text-muted-foreground">
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
