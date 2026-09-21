import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpenCheck, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
const items=[{to:"/lessons",label:"Overview",icon:BookOpenCheck},{to:"/lessons/actions",label:"Improvement actions",icon:ListChecks}] as const;
export function LessonsNav(){const path=useRouterState({select:state=>state.location.pathname});return <nav aria-label="Lessons views" className="flex overflow-x-auto border-b">{items.map(item=>{const Icon=item.icon;return <Link key={item.to} to={item.to} activeOptions={{exact:true}} className={cn("flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium",path===item.to?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground")}><Icon className="size-4"/>{item.label}</Link>})}</nav>}
