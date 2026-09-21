import { Link, useRouterState } from "@tanstack/react-router";
import { GitFork, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
const items=[{to:"/dependencies",label:"Register",icon:Rows3},{to:"/dependencies/map",label:"Map",icon:GitFork}] as const;
export function DependenciesNav(){const path=useRouterState({select:state=>state.location.pathname});return <nav aria-label="Dependency views" className="flex overflow-x-auto border-b">{items.map(item=>{const Icon=item.icon;return <Link key={item.to} to={item.to} activeOptions={{exact:true}} className={cn("flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium",path===item.to?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground")}><Icon className="size-4"/>{item.label}</Link>})}</nav>}
