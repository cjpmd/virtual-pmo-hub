import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Building2, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, LogOut, Menu, Moon, Search, Settings, Star, Sun, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { readFavourites, type Favourite } from "@/components/favourite-button";
import { SectionTabs } from "@/components/section-nav";
import { getProgrammes, getProjects } from "@/services/pmo";
import { hydrateSettings, term, useSettings } from "@/services/settings";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { signOut } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import { toast } from "sonner";
import { allPages, findSection, sections, settingsSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { openIssueTask } from "@/components/issue-task-sheet";

const COLLAPSE_KEY = "virtual-pmo-sidebar-collapsed";
const RECENT_KEY = "virtual-pmo-recent";
interface RecentEntry { id: string; label: string; type: "Project" | "Programme"; to: string }

const seedNotifications = [
  { id: "n1", text: "Maya Harrison mentioned you on Ebbot", kind: "Mention", read: false },
  { id: "n2", text: "3 Ebbot tasks are overdue", kind: "Overdue alert", read: false },
  { id: "n3", text: "Status report due Friday", kind: "Reminder", read: false },
  { id: "n-ben", text: "Benefit measurement due: record this quarter's actuals for BEN-003", kind: "Benefit reminder", read: false },
  { id: "n-div", text: "Divergence alert: declared RAG is better than the evidence on a project", kind: "Assurance", read: false },
  { id: "n4", text: "Digital assessment pilot awaits approval", kind: "Approval request", read: true },
];

function readRecent(): RecentEntry[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentEntry[] } catch { return [] }
}

export function AppShell({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [notifications, setNotifications] = useState(seedNotifications);
  const [inbox, setInbox] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [showFavourites, setShowFavourites] = useState(true);
  const [showRecent, setShowRecent] = useState(true);
  const [flyout, setFlyout] = useState<{ id: string; top: number; left: number } | null>(null);
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const path = useRouterState({ select: state => state.location.pathname });
  const navigate = useNavigate();
  const activeSection = findSection(path);
  const { profile, organisation, organisations, switchOrganisation, switching } = useOrganisation();
  const user = { name: profile.displayName, email: profile.email, role: organisation.role.charAt(0).toUpperCase() + organisation.role.slice(1) };
  // Signing out ends the session; the auth gate then shows the sign-in page.
  const logOut = () => { signOut().catch(error => toast.error(errorMessage(error))) };

  useEffect(() => { hydrateSettings() }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark) }, [dark]);
  // The collapsed choice is remembered between visits.
  useEffect(() => { try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "true") } catch { /* storage unavailable */ } }, []);
  const toggleCollapsed = () => setCollapsed(value => {
    const next = !value;
    try { localStorage.setItem(COLLAPSE_KEY, String(next)) } catch { /* storage unavailable */ }
    return next;
  });
  useEffect(() => {
    const refresh = () => setFavourites(readFavourites());
    refresh(); setRecent(readRecent());
    window.addEventListener("favourites-changed", refresh);
    return () => window.removeEventListener("favourites-changed", refresh);
  }, []);
  // Visiting a project or programme adds it to Recent.
  useEffect(() => {
    const project = /^\/portfolio\/projects\/([^/]+)/.exec(path)?.[1];
    const programme = /^\/portfolio\/programmes\/([^/]+)/.exec(path)?.[1];
    const entry: RecentEntry | undefined = project
      ? { id: project, label: getProjects().find(item => item.id === project)?.name ?? project, type: "Project", to: path }
      : programme
        ? { id: programme, label: getProgrammes().find(item => item.id === programme)?.name ?? programme, type: "Programme", to: path }
        : undefined;
    if (!entry) return;
    setRecent(current => {
      const next = [entry, ...current.filter(item => item.id !== entry.id)].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
      return next;
    });
  }, [path]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette(true) }
      if (event.key === "Escape") { setPalette(false); setMobileOpen(false) }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // The brand colour drives the accent used across the app.
  useEffect(() => {
    const root = document.documentElement;
    const colour = settings.organisation.brandColour;
    root.style.setProperty("--primary", colour);
    root.style.setProperty("--sidebar-primary", colour);
    root.style.setProperty("--accent", `color-mix(in oklab, ${colour} 14%, var(--background))`);
    root.style.setProperty("--accent-foreground", `color-mix(in oklab, ${colour} 78%, var(--foreground))`);
    root.style.setProperty("--sidebar-accent", `color-mix(in oklab, ${colour} 10%, var(--background))`);
  }, [settings.organisation.brandColour]);

  const results = useMemo(() => {
    const text = query.toLowerCase();
    if (!text) return [];
    return [
      ...allPages.filter(page => page.label.toLowerCase().includes(text)).map(page => ({ id: page.to, label: page.label, detail: page.section.label, to: page.to, params: undefined })),
      ...getProjects().filter(item => item.name.toLowerCase().includes(text)).slice(0, 6).map(item => ({ id: item.id, label: item.name, detail: term("project", settings), to: "/portfolio/projects/$projectId", params: { projectId: item.id } })),
      ...getProgrammes().filter(item => item.name.toLowerCase().includes(text)).slice(0, 4).map(item => ({ id: item.id, label: item.name, detail: term("programme", settings), to: "/portfolio/programmes/$programmeId", params: { programmeId: item.id } })),
    ].slice(0, 10);
  }, [query, settings]);

  const openFlyout = (id: string, element?: HTMLElement | null) => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
    setFlyout(current => {
      if (!element) return current?.id === id ? current : current;
      const box = element.getBoundingClientRect();
      return { id, top: box.top, left: box.right + 6 };
    });
  };
  const closeFlyout = () => { flyoutTimer.current = setTimeout(() => setFlyout(null), 140) };
  // Changing how values are formatted re-renders every page below.
  const formatKey = `${settings.regional.baseCurrency}-${settings.regional.dateFormat}-${settings.regional.compactFormatting}-${settings.regional.decimalPlaces}-${settings.regional.symbolPosition}-${JSON.stringify(settings.terminology.terms)}`;

  const navItems = [...sections, settingsSection];

  return <TooltipProvider>
    <div className="min-h-screen bg-background text-foreground">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar transition-[width]",
        collapsed ? "w-64 lg:w-[68px]" : "w-64", mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            {settings.organisation.logoDataUrl
              ? <img src={settings.organisation.logoDataUrl} alt="" className="size-7 rounded object-contain" />
              : settings.organisation.shortName.slice(0, 2).toUpperCase()}
          </span>
          {!collapsed && <div className="ml-3 min-w-0"><p className="truncate font-display font-semibold">Virtual PMO</p><p className="truncate text-[11px] text-muted-foreground">{settings.organisation.shortName} portfolio office</p></div>}
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X /></Button>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2.5" aria-label="Sections">
          {navItems.filter(section => section.id !== "settings").map(section => {
            const Icon = section.icon;
            const active = activeSection?.id === section.id;
            const link = <Link to={section.to} onClick={() => setMobileOpen(false)}
              className={cn("relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-sidebar-accent text-sidebar-primary" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                collapsed && "lg:justify-center lg:px-0")}>
              {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-sidebar-primary" aria-hidden />}
              <Icon className="size-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{section.label}</span>}
            </Link>;
            return <div key={section.id} className="relative" onMouseEnter={event => { if (collapsed) openFlyout(section.id, event.currentTarget) }} onMouseLeave={closeFlyout}>
              {collapsed
                ? <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{section.label}</TooltipContent></Tooltip>
                : link}
              {collapsed && flyout?.id === section.id && section.pages.length > 0 && <div
                style={{ top: flyout.top, left: flyout.left }}
                onMouseEnter={() => openFlyout(section.id)} onMouseLeave={closeFlyout}
                className="fixed z-50 hidden min-w-56 rounded-md border bg-popover p-2 shadow-xl lg:block">
                <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</p>
                {section.pages.map(page => <Link key={page.to} to={page.to} onClick={() => setFlyout(null)} className="flex h-9 items-center gap-2.5 rounded px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                  <page.icon className="size-4" />{page.label}
                </Link>)}
              </div>}
            </div>;
          })}

          {favourites.length > 0 && <SidebarGroup title="Favourites" open={showFavourites} collapsed={collapsed} onToggle={() => setShowFavourites(value => !value)}>
            {favourites.map(item => item.type === "Project"
              ? <Link key={item.id} to="/portfolio/projects/$projectId" params={{ projectId: item.id }} className="flex h-8 items-center gap-2.5 rounded px-3 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Star className="size-3.5 shrink-0 fill-primary text-primary" />{!collapsed && <span className="truncate">{item.label}</span>}</Link>
              : item.type === "Programme"
                ? <Link key={item.id} to="/portfolio/programmes/$programmeId" params={{ programmeId: item.id }} className="flex h-8 items-center gap-2.5 rounded px-3 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Star className="size-3.5 shrink-0 fill-primary text-primary" />{!collapsed && <span className="truncate">{item.label}</span>}</Link>
                : null)}
          </SidebarGroup>}

          {recent.length > 0 && <SidebarGroup title="Recent" open={showRecent} collapsed={collapsed} onToggle={() => setShowRecent(value => !value)}>
            {recent.map(item => <Link key={item.id} to={item.type === "Project" ? "/portfolio/projects/$projectId" : "/portfolio/programmes/$programmeId"}
              params={item.type === "Project" ? { projectId: item.id } : { programmeId: item.id }}
              className="flex h-8 items-center gap-2.5 rounded px-3 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
              <span className="grid size-3.5 shrink-0 place-items-center rounded-sm bg-muted text-[8px] font-bold">{item.type[0]}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>)}
          </SidebarGroup>}
        </nav>

        <div className="border-t border-sidebar-border p-2.5">
          {(() => {
            const active = activeSection?.id === "settings";
            const link = <Link to="/settings" onClick={() => setMobileOpen(false)} className={cn("relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium",
              active ? "bg-sidebar-accent text-sidebar-primary" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground", collapsed && "lg:justify-center lg:px-0")}>
              {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-sidebar-primary" aria-hidden />}
              <Settings className="size-[18px] shrink-0" />{!collapsed && <span>Settings</span>}
            </Link>;
            return collapsed ? <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">Settings</TooltipContent></Tooltip> : link;
          })()}
          <Button variant="ghost" className={cn("mt-1 w-full text-muted-foreground", collapsed ? "lg:px-0" : "justify-start")} onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronRight /> : <><ChevronLeft /><span>Collapse</span></>}
          </Button>
        </div>
      </aside>

      <div className={cn("transition-[padding]", collapsed ? "lg:pl-[68px]" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu /></Button>
          <div className="min-w-0 flex-1">
            <Button variant="ghost" onClick={() => setPalette(true)} className="relative flex h-9 w-full max-w-xl justify-start bg-muted/60 pl-9 pr-3 text-left text-sm font-normal text-muted-foreground">
              <Search className="absolute left-3 size-4" />Search anything…
              <kbd className="ml-auto hidden rounded border bg-background px-1.5 py-0.5 text-[10px] sm:inline">⌘K</kbd>
            </Button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="relative">
            <Button variant="ghost" size="icon" onClick={() => setInbox(!inbox)} aria-label="Notifications"><Bell />{notifications.some(item => !item.read) && <span className="absolute right-1 top-1 size-2 rounded-full bg-health-bad" />}</Button>
            {inbox && <div className="absolute right-0 top-12 w-[340px] rounded-md border bg-popover p-3 shadow-xl">
              <div className="flex items-center justify-between"><strong>Notifications</strong><Button variant="ghost" size="sm" onClick={() => setNotifications(items => items.map(item => ({ ...item, read: true })))}><CheckCheck />Mark all read</Button></div>
              <div className="mt-2 divide-y">{notifications.map(item => <button key={item.id} onClick={() => setNotifications(items => items.map(entry => entry.id === item.id ? { ...entry, read: true } : entry))} className={cn("block w-full py-3 text-left", !item.read && "font-semibold")}>
                <span className="text-[10px] uppercase text-primary">{item.kind}</span><p className="mt-1 text-sm">{item.text}</p>
              </button>)}</div>
              <Link to="/home/notifications" onClick={() => setInbox(false)} className="mt-2 block text-xs font-semibold text-primary hover:underline">Open the notification centre →</Link>
            </div>}
          </div>
          {organisations.length > 1
            ? <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="hidden max-w-56 gap-2 sm:flex" aria-label={`Organisation: ${organisation.name}. Switch organisation`} disabled={switching}>
                  {switching ? <LoaderCircle className="animate-spin" /> : <Building2 />}<span className="truncate">{organisation.name}</span><ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Switch organisation</div>
                {organisations.map(item => <DropdownMenuItem key={item.organisationId} onSelect={() => switchOrganisation(item.organisationId)}>
                  <Check className={cn("size-4", item.organisationId !== organisation.organisationId && "invisible")} /><span className="truncate">{item.name}</span>
                </DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            : <span className="hidden max-w-56 items-center gap-2 truncate px-2 text-sm text-muted-foreground sm:flex"><Building2 className="size-4" />{organisation.name}</span>}
          <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun /> : <Moon />}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-11 gap-2 px-1 sm:px-2" aria-label={`Account menu for ${user?.name ?? "user"}`}>
                <span className="hidden min-w-0 text-right sm:block"><span className="block text-xs font-semibold">{user?.name}</span><span className="block text-[10px] text-muted-foreground">{user?.role}</span></span>
                <Avatar className="size-9 shrink-0"><AvatarFallback className="bg-primary text-primary-foreground">{(user?.name ?? "").split(" ").map(part => part[0]).join("").slice(0, 2)}</AvatarFallback></Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{user?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/settings/$section", params: { section: "account" } })}><UserRound />Account settings</DropdownMenuItem>
              <DropdownMenuItem onSelect={logOut}><LogOut />Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        <main key={formatKey} className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
          {activeSection && activeSection.id !== "settings" && <div className="mb-6"><SectionTabs /></div>}
          {children}
        </main>
      </div>

      {(mobileOpen || palette) && <button aria-label="Close overlay" className="fixed inset-0 z-40 bg-overlay lg:hidden" onClick={() => { setMobileOpen(false); setPalette(false) }} />}
      {palette && <>
        <button aria-label="Close command palette" className="fixed inset-0 z-40 bg-overlay" onClick={() => setPalette(false)} />
        <div role="dialog" aria-label="Command palette" className="fixed left-1/2 top-24 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-md border bg-popover p-3 shadow-2xl">
          <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Jump to a page, project or programme…" className="h-11 pl-9" /></div>
          {!query && <>
            <p className="px-2 pb-2 pt-4 text-[10px] font-semibold uppercase text-muted-foreground">Quick actions</p>
            <div className="grid gap-1 sm:grid-cols-3">
              <Button variant="ghost" onClick={() => { navigate({ to: "/portfolio/projects/$projectId", params: { projectId: "ebbot-chatbot" } }); setPalette(false) }}>Go to Ebbot</Button>
              <Button variant="ghost" onClick={() => { setPalette(false); openIssueTask() }}>Issue task</Button>
              <Button variant="ghost" onClick={() => { navigate({ to: "/settings" }); setPalette(false) }}>Open settings</Button>
            </div>
            <p className="px-2 pb-2 pt-4 text-[10px] font-semibold uppercase text-muted-foreground">Sections</p>
            <div className="grid gap-1 sm:grid-cols-2">{sections.map(section => <Button key={section.id} variant="ghost" className="justify-start" onClick={() => { navigate({ to: section.to }); setPalette(false) }}><section.icon className="size-4" />{section.label}</Button>)}</div>
          </>}
          {query && <>
            <p className="px-2 pb-2 pt-4 text-[10px] font-semibold uppercase text-muted-foreground">Results</p>
            {results.map(item => <button key={`${item.to}-${item.id}`} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => { navigate(item.params ? { to: item.to, params: item.params } : { to: item.to }); setPalette(false); setQuery("") }}>
              <span className="flex-1 truncate">{item.label}</span><span className="text-xs text-muted-foreground">{item.detail}</span>
            </button>)}
            {!results.length && <p className="px-3 py-4 text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
          </>}
        </div>
      </>}
    </div>
  </TooltipProvider>;
}

function SidebarGroup({ title, open, collapsed, onToggle, children }: { title: string; open: boolean; collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  return <div className="pt-4">
    <button onClick={onToggle} className={cn("flex w-full items-center gap-1 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground", collapsed && "lg:justify-center lg:px-0")}>
      {!collapsed && <>{title}<ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} /></>}
      {collapsed && <span className="hidden lg:block lg:h-px lg:w-6 lg:bg-border" />}
    </button>
    {open && <div className="space-y-0.5">{children}</div>}
  </div>;
}
