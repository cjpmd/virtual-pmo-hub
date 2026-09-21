import { Link, useRouterState } from "@tanstack/react-router";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, FolderKanban, LayoutDashboard, Layers3, ListTodo, Menu, Moon, Search, ShieldAlert, Star, Sun, UsersRound, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CommandMenu } from "./command-menu";
import { NotificationsPopover } from "./notifications-popover";
import { useFavourites } from "@/hooks/use-favourites";

const nav = [
  { label: "Portfolio", to: "/", icon: BriefcaseBusiness },
  { label: "Dashboards", to: "/dashboards", icon: LayoutDashboard },
  { label: "Programmes", to: "/programmes", icon: Layers3 },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Collections", to: "/collections", icon: Layers3 },
  { label: "Requests", to: "/requests", icon: ListTodo },
  { label: "Resources", to: "/resources", icon: UsersRound },
  { label: "Risks", to: "/risks", icon: ShieldAlert },
  { label: "My Work", to: "/my-work", icon: ListTodo },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { favourites } = useFavourites();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
            collapsed && "lg:w-18",
            mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="flex h-16 items-center border-b border-sidebar-border px-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
              VP
            </div>
            {!collapsed && (
              <div className="ml-3">
                <p className="font-display text-base font-semibold text-sidebar-foreground">Virtual PMO</p>
                <p className="text-[11px] text-muted-foreground">DTS portfolio office</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X />
            </Button>
          </div>
          
          <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-none">
            {nav.map((item) => {
              const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
              const Icon = item.icon;
              const link = (
                <Link
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "lg:justify-center lg:px-0"
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.to}>{link}</div>
              );
            })}

            {favourites.length > 0 && (
              <div className="mt-8">
                {!collapsed && (
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Favourites
                  </p>
                )}
                {favourites.map((fav) => (
                  <Link
                    key={fav.id}
                    to={fav.type === "project" ? "/projects/$projectId" : "/programmes/$programmeId"}
                    params={fav.type === "project" ? { projectId: fav.id } : { programmeId: fav.id }}
                    className={cn(
                      "flex h-9 items-center gap-3 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      collapsed && "lg:justify-center lg:px-0"
                    )}
                  >
                    <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                    {!collapsed && <span className="truncate">{fav.name}</span>}
                  </Link>
                ))}
              </div>
            )}
          </nav>
          
          <div className="border-t border-sidebar-border p-3">
            <Button
              variant="ghost"
              className={cn("w-full text-muted-foreground", collapsed ? "px-0" : "justify-start")}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {collapsed ? (
                <ChevronRight />
              ) : (
                <>
                  <ChevronLeft />
                  <span>Collapse</span>
                </>
              )}
            </Button>
          </div>
        </aside>
        
        <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-18" : "lg:pl-64")}>
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            
            <div className="relative max-w-xl flex-1">
              <Button
                variant="outline"
                className="flex h-9 w-full items-center justify-start bg-muted/60 px-3 font-normal text-muted-foreground"
                onClick={() => setCommandOpen(true)}
              >
                <Search className="mr-2 size-4" />
                <span className="hidden sm:inline">Search projects, programmes or people...</span>
                <span className="inline sm:hidden">Search...</span>
                <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <NotificationsPopover />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDark(!dark)}
                aria-label={dark ? "Use light mode" : "Use dark mode"}
              >
                {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </Button>
            </div>
            
            <div className="hidden h-8 w-px bg-border sm:block" />
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold">Chris McDonald</p>
              <p className="text-[10px] text-muted-foreground">Head of Programmes & Projects</p>
            </div>
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                CM
              </AvatarFallback>
            </Avatar>
          </header>
          
          <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
        </div>
        
        {mobileOpen && (
          <button
            className="fixed inset-0 z-30 bg-overlay lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation overlay"
          />
        )}
        
        <CommandMenu open={commandOpen} setOpen={setCommandOpen} />
      </div>
    </TooltipProvider>
  );
}
