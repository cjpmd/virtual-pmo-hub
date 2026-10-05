import { Link, useRouterState } from "@tanstack/react-router";
import { Rows3, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

export function DependencyViewTabs() {
  const path = useRouterState({ select: state => state.location.pathname });
  return <nav aria-label="Dependency views" className="flex gap-1 border-b">
    {([{ to: "/delivery/dependencies", label: "Register", Icon: Rows3 }, { to: "/delivery/dependencies/map", label: "Map", Icon: Waypoints }] as const).map(({ to, label, Icon }) => <Link key={to} to={to} className={cn("flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium", (to.endsWith("/map") ? path.endsWith("/map") : !path.endsWith("/map")) ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}><Icon className="size-4" />{label}</Link>)}
  </nav>;
}