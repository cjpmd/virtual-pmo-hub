import { Download, Expand, Info, MoreHorizontal, Sheet } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface CsvExport { name: string; columns: string[]; rows: Array<Array<string | number | undefined>> }
export interface TimeRangeOption { value: string; label: string }

const escapeCell = (value: string | number | undefined) => {
  const text = value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
function download(name: string, href: string) {
  const link = document.createElement("a");
  link.href = href; link.download = name;
  document.body.append(link); link.click(); link.remove();
}
export function downloadCsv(data: CsvExport) {
  const body = [data.columns.join(","), ...data.rows.map(row => row.map(escapeCell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  download(`${data.name}.csv`, url);
  URL.revokeObjectURL(url);
}

const PAINT = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-opacity", "fill-opacity", "opacity", "font-size", "font-family", "font-weight", "letter-spacing", "text-anchor", "dominant-baseline"];
/**
 * Rasterises the card's chart. Custom properties do not survive serialisation, so the
 * computed paint is copied onto the clone before the SVG is drawn to a canvas.
 */
async function downloadPng(root: HTMLElement, name: string, background: string) {
  const source = root.querySelector("svg");
  if (!source) return;
  const clone = source.cloneNode(true) as SVGSVGElement;
  const originals = [source, ...Array.from(source.querySelectorAll("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
  originals.forEach((element, index) => {
    const target = copies[index];
    if (!(target instanceof SVGElement) && !(target instanceof HTMLElement)) return;
    const computed = getComputedStyle(element as Element);
    target.setAttribute("style", PAINT.map(property => `${property}:${computed.getPropertyValue(property)}`).join(";"));
  });
  const { width, height } = source.getBoundingClientRect();
  clone.setAttribute("width", String(width)); clone.setAttribute("height", String(height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  const image = new Image();
  await new Promise<void>(resolve => { image.addEventListener("load", () => resolve()); image.addEventListener("error", () => resolve()); image.src = encoded });
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width * ratio); canvas.height = Math.max(1, height * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(ratio, ratio);
  context.fillStyle = background; context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  download(`${name}.png`, canvas.toDataURL("image/png"));
}

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** One sentence explaining what the metric measures and how to read it. */
  info?: string;
  /** Rendered at the top right, e.g. a total or a "vs last quarter" note. */
  aside?: ReactNode;
  /** Filters and time ranges sit in a single row above the plot. */
  controls?: ReactNode;
  timeRange?: { value: string; options: TimeRangeOption[]; onChange: (value: string) => void };
  /** Legend and any direct-label key; kept out of the plot so the marks stay thin. */
  legend?: ReactNode;
  footer?: ReactNode;
  csv?: CsvExport | (() => CsvExport);
  /** A table view of the same numbers, shown inside the expanded dialog. */
  table?: ReactNode;
  loading?: boolean;
  empty?: { title: string; detail: string; action?: ReactNode } | undefined;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, info, aside, controls, timeRange, legend, footer, csv, table, loading, empty, className, bodyClassName, children }: ChartCardProps) {
  const [expanded, setExpanded] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const body = loading
    ? <ChartSkeleton />
    : empty
      ? <ChartEmpty {...empty} />
      : <div className="viz-animate">{children}</div>;
  return <section aria-labelledby={headingId} className={cn("flex flex-col rounded-lg border border-border/70 bg-card p-5 shadow-sm", className)}>
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 id={headingId} className="truncate font-display text-sm font-semibold text-card-foreground">{title}</h3>
          {info ? <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" aria-label={`About ${title}`} className="text-muted-foreground/70 transition-colors hover:text-foreground"><Info className="size-3.5"/></button></TooltipTrigger><TooltipContent className="max-w-xs text-xs leading-5">{info}</TooltipContent></Tooltip></TooltipProvider> : null}
        </div>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {aside}
        {timeRange ? <TimeRange {...timeRange}/> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`${title} options`}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => setExpanded(true)}><Expand className="size-4"/>Expand to full screen</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { const node = region.current; if (node) void downloadPng(node, title, getComputedStyle(node).getPropertyValue("--viz-surface") || "#ffffff") }}><Download className="size-4"/>Download PNG</DropdownMenuItem>
            {csv ? <DropdownMenuItem onSelect={() => downloadCsv(typeof csv === "function" ? csv() : csv)}><Sheet className="size-4"/>Export CSV</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    {controls ? <div className="mt-3 flex flex-wrap items-center gap-2">{controls}</div> : null}
    <div ref={region} className={cn("mt-4 min-w-0 flex-1", bodyClassName)}>{body}</div>
    {legend && !loading && !empty ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3">{legend}</div> : null}
    {footer && !loading ? <div className="mt-3 text-xs text-muted-foreground">{footer}</div> : null}
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">{title}</DialogTitle>{subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}</DialogHeader>
        <div className="min-h-[420px]">{expanded ? children : null}</div>
        {legend ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">{legend}</div> : null}
        {info ? <p className="text-xs leading-5 text-muted-foreground">{info}</p> : null}
        {table ? <div className="mt-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Table view</p>{table}</div> : null}
      </DialogContent>
    </Dialog>
  </section>;
}

function TimeRange({ value, options, onChange }: { value: string; options: TimeRangeOption[]; onChange: (value: string) => void }) {
  return <div role="group" aria-label="Time range" className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
    {options.map(option => <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={option.value === value}
      className={cn("rounded px-2 py-1 text-[11px] font-medium transition-colors", option.value === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </div>;
}

export function ChartSkeleton({ bars = 7 }: { bars?: number }) {
  const heights = [52, 74, 38, 88, 61, 45, 80, 34, 68, 56];
  return <div aria-hidden className="flex h-full min-h-[180px] items-end gap-2 pb-6">
    {Array.from({ length: bars }, (_, index) => <div key={index} className="flex-1 animate-pulse rounded-t bg-muted" style={{ height: `${heights[index % heights.length] ?? 50}%`, animationDelay: `${index * 60}ms` }}/>)}
  </div>;
}

export function ChartEmpty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="grid h-full min-h-[180px] place-items-center rounded-md border border-dashed border-border/80 p-6 text-center">
    <div className="max-w-xs">
      <svg viewBox="0 0 64 34" className="mx-auto mb-3 h-8 w-16" aria-hidden><g fill="none" stroke="var(--viz-axis)" strokeWidth="2" strokeLinecap="round"><path d="M2 32h60"/><path d="M8 32V22M20 32v-6M32 32V14M44 32v-9M56 32V6" strokeOpacity="0.45"/></g></svg>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  </div>;
}

/** Legend swatch. Identity is never colour alone, so the label always travels with it. */
export function LegendItem({ colour, label, value, shape = "square" }: { colour: string; label: string; value?: string; shape?: "square" | "line" | "dashed" | "dot" }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
    {shape === "square" ? <span className="size-2.5 rounded-[3px]" style={{ background: colour }}/>
      : shape === "dot" ? <span className="size-2.5 rounded-full" style={{ background: colour }}/>
        : <span className="h-0.5 w-4 rounded-full" style={shape === "dashed" ? { backgroundImage: `repeating-linear-gradient(90deg, ${colour} 0 4px, transparent 4px 7px)` } : { background: colour }}/>}
    <span className="text-foreground/80">{label}</span>
    {value ? <span className="tabular font-medium text-foreground">{value}</span> : null}
  </span>;
}
