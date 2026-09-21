import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarCheck, Lightbulb, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
const items=[{to:"/decisions",label:"Decision log",icon:Rows3},{to:"/decisions/forum",label:"Forum view",icon:CalendarCheck},{to:"/assumptions",label:"Assumptions",icon:Lightbulb}] as const;
export function DecisionsNav(){const path=useRouterState({select:state=>state.location.pathname});return <nav aria-label="Decision views" className="flex overflow-x-auto border-b">{items.map(item=>{const Icon=item.icon;return <Link key={item.to} to={item.to} activeOptions={{exact:true}} className={cn("flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium",path===item.to?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground")}><Icon className="size-4"/>{item.label}</Link>})}</nav>}
