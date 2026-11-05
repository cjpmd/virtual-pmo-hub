// Presentation mode (spec §9.3): full screen, one section or deep-dive per slide, ←/→ to move,
// Esc to leave. The side drawer records decisions and actions (Phase 3, MeetingDrawer).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/services/service-error";
import { BlockFrame, sectionsOf, type DocumentProps } from "./ReportDocument";
import { useReportView } from "./ReportViewer";

export function PresentationMode({
  reportId,
  drawer,
}: {
  reportId: string;
  drawer?: (props: { slideTitle: string }) => ReactNode;
}) {
  const view = useReportView(reportId);
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const sections = view.data ? sectionsOf(view.data.report.blocks, view.data.deepDives) : [];
  const total = sections.length;
  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    void navigate({ to: "/governance/reports/$reportId", params: { reportId } });
  }, [navigate, reportId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown")
        setIndex((i) => Math.min(i + 1, total - 1));
      if (event.key === "ArrowLeft" || event.key === "PageUp") setIndex((i) => Math.max(i - 1, 0));
      if (event.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, exit]);
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement)
      void el.requestFullscreen().catch(() => undefined);
  }, []);
  if (view.error) return <p role="alert">{errorMessage(view.error)}</p>;
  if (!view.data) return <div aria-busy className="h-64 animate-pulse rounded-lg bg-muted/50" />;
  const v = view.data;
  const section = sections[Math.min(index, total - 1)];
  const props: DocumentProps = { ...v.doc, mode: "present" };
  const deepBlocks = v.report.blocks.filter((b) => b.placement === "deep_dive");
  return (
    <div className="fixed inset-0 z-50 flex bg-background" role="dialog" aria-label="Presentation">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-2">
          <span className="truncate text-sm text-muted-foreground">{v.report.title}</span>
          <span className="ml-auto text-sm pmo-num" aria-live="polite">
            {index + 1} / {total}
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous slide"
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next slide"
            onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Exit presentation (Esc)" onClick={exit}>
            <X className="size-4" />
          </Button>
        </header>
        <main
          className="min-h-0 flex-1 overflow-auto p-6 text-base lg:p-10"
          data-slide={section?.id}
        >
          {section?.kind === "deep_dive" && section.project ? (
            <article className="mx-auto max-w-6xl space-y-4">
              <h2 className="font-display text-3xl font-semibold">
                <span className="text-muted-foreground">{section.project.code}</span>{" "}
                {section.project.name}
              </h2>
              <div className="flex flex-wrap gap-1">
                {section.project.reasons?.map((r) => (
                  <span key={r.label} className="rounded bg-muted px-2 py-0.5 text-sm">
                    {r.label}
                  </span>
                ))}
              </div>
              <div className="space-y-4">
                {deepBlocks.map((instance) => (
                  <BlockFrame
                    key={instance.id}
                    instance={instance}
                    entityId={section.project!.id}
                    props={props}
                    level={3}
                  />
                ))}
              </div>
            </article>
          ) : section?.instance ? (
            <div className="mx-auto max-w-6xl">
              <BlockFrame instance={section.instance} entityId={null} props={props} />
            </div>
          ) : (
            <p>Nothing to present.</p>
          )}
        </main>
      </div>
      {drawer?.({ slideTitle: section?.title ?? "" })}
    </div>
  );
}
