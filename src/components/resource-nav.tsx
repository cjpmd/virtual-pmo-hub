import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, CalendarRange, FlaskConical, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

const items=[{to:"/resources",label:"Dashboard",icon:BarChart3},{to:"/resource-assignments",label:"Assignments",icon:Rows3},{to:"/resource-allocation",label:"Allocation",icon:CalendarRange},{to:"/resource-scenarios",label:"Scenarios",icon:FlaskConical}] as const;
export function ResourceNav(){const path=useRouterState({select:state=>state.location.pathname});return <nav aria-label="Resource views" className="flex overflow-x-auto border-b">{items.map(item=>{const Icon=item.icon;return <Link key={item.to} to={item.to} className={cn("flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium",path===item.to?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground")}><Icon className="size-4"/>{item.label}</Link>})}</nav>}