// Cover, narrative and layout blocks: report_cover, executive_summary, free_text,
// section_heading, highlight_report_summary.
import { useState } from "react";
import { z } from "zod";
import { Markdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { errorMessage } from "@/services/service-error";
import { registerBlock } from "../registry";
import { useNarrativeEditing } from "../narrative-context";
import { BlockNote, Empty, RatingChip, useReportFormat } from "../primitives";
import type { RenderContext } from "../types";

// ---------------------------------------------------------------- report_cover
interface CoverData {
  title: string;
  status: string;
  as_at: string;
  forum_name: string | null;
  meeting_date: string | null;
  overall_rating: string | null;
  overall_rating_rationale: string | null;
  author: string | null;
  scope_label: string | null;
  project_count: number;
  /** What the figures are as at (e.g. "All figures as at 31 Oct 2026"). */
  data_basis?: string | null;
}

function Cover({
  data,
  ctx,
}: {
  data: CoverData;
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <div className="space-y-4">
      <div>
        {data.forum_name && (
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {data.forum_name}
          </p>
        )}
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">{data.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.scope_label}
          {data.meeting_date && ` · Meeting ${f.date(data.meeting_date)}`} · As at{" "}
          {f.date(data.as_at)}
          {data.author && ` · Prepared by ${data.author}`}
        </p>
        {data.data_basis && (
          <p className="mt-1 text-xs text-muted-foreground" data-basis>
            Data basis: {data.data_basis}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Overall rating
          </div>
          {data.overall_rating ? (
            <RatingChip scheme={ctx.scheme} value={data.overall_rating} size="lg" />
          ) : (
            <span className="text-sm text-muted-foreground">Not set yet</span>
          )}
        </div>
        {data.overall_rating_rationale && (
          <p className="max-w-2xl flex-1 text-sm leading-6">{data.overall_rating_rationale}</p>
        )}
      </div>
    </div>
  );
}

export const _report_cover = registerBlock<Record<string, never>, CoverData>({
  key: "report_cover",
  version: 1,
  name: "Cover",
  category: "meta",
  description: "Title, forum, meeting date, as-at, overall rating and rationale, author.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: false,
  configSchema: z.object({}).passthrough() as never,
  defaultConfig: {},
  Renderer: Cover,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- narratives
interface NarrativeData {
  heading: string | null;
  narrative: {
    id: string;
    body: { format: string; text: string };
    source: "human" | "ai_draft" | "highlight_report";
    updated_at: string;
  } | null;
}

const SOURCE_LABEL = {
  human: null,
  ai_draft: "AI draft — check before submitting",
  highlight_report: "From the PM's highlight report",
} as const;

function NarrativeBlock({
  data,
  ctx,
  placeholder,
  allowAi,
}: {
  data: NarrativeData;
  ctx: RenderContext;
  placeholder: string;
  allowAi?: boolean;
}) {
  const editing = useNarrativeEditing();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = data.narrative?.body?.text ?? "";
  const canEdit = ctx.editable && !!editing && ctx.mode === "screen";
  const save = async (value: string, source?: "human" | "highlight_report") => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await editing.save({
        blockInstanceId: ctx.instance.id,
        entityId: ctx.entityId,
        text: value,
        ...(source && { source }),
        existing: data.narrative
          ? { id: data.narrative.id, updatedAt: data.narrative.updated_at }
          : null,
      });
      setDraft(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const badge = data.narrative ? SOURCE_LABEL[data.narrative.source] : null;
  return (
    <div className="space-y-2">
      {badge && (
        <Badge variant={data.narrative?.source === "ai_draft" ? "destructive" : "secondary"}>
          {badge}
        </Badge>
      )}
      {draft !== null ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={8}
            aria-label="Narrative (Markdown)"
            placeholder={placeholder}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save(draft)}>
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              Markdown: **bold**, - lists, # headings
            </span>
          </div>
        </div>
      ) : text ? (
        <div className="prose-sm max-w-none text-sm leading-6">
          <Markdown source={text} />
        </div>
      ) : (
        <Empty>{canEdit ? placeholder : "No narrative written."}</Empty>
      )}
      {canEdit && draft === null && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button size="sm" variant="outline" onClick={() => setDraft(text)}>
            {text ? "Edit" : "Write"}
          </Button>
          {editing?.pmSummary && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const summary = await editing.pmSummary!(ctx.entityId);
                if (summary) await save(summary, "highlight_report");
                else setError("No submitted highlight report to use.");
              }}
            >
              Use PM's summary
            </Button>
          )}
          {allowAi && editing?.draftWithAi && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await editing.draftWithAi!(ctx.instance.id);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Draft with AI
            </Button>
          )}
          {data.narrative?.source === "ai_draft" && editing?.acknowledgeAi && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void editing.acknowledgeAi!(data.narrative!.id)}
            >
              Mark AI draft reviewed
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-health-bad-foreground">
          {error}
        </p>
      )}
    </div>
  );
}

const narrativeSchema = z.object({ heading: z.string().max(120).optional() });
type NarrativeConfig = z.infer<typeof narrativeSchema>;

export const _executive_summary = registerBlock<NarrativeConfig, NarrativeData>({
  key: "executive_summary",
  version: 1,
  name: "Executive summary",
  category: "narrative",
  description: "The report owner's summary for the forum (Markdown). Draft with AI from Phase 4.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: false,
  configSchema: narrativeSchema,
  defaultConfig: {},
  Renderer: ({ data, ctx }) => (
    <NarrativeBlock
      data={data}
      ctx={ctx}
      placeholder="Summarise the position for the forum."
      allowAi
    />
  ),
  partnerSafe: true,
  phase: 1,
});

export const _free_text = registerBlock<NarrativeConfig, NarrativeData>({
  key: "free_text",
  version: 1,
  name: "Free text",
  category: "narrative",
  description: "A heading and text, e.g. Forward look.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: narrativeSchema,
  defaultConfig: { heading: "Notes" },
  Renderer: ({ data, ctx }) => <NarrativeBlock data={data} ctx={ctx} placeholder="Write here." />,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- section_heading
const headingSchema = z.object({ title: z.string().max(120).default("Section") });
export const _section_heading = registerBlock<z.infer<typeof headingSchema>, { title: string }>({
  key: "section_heading",
  version: 1,
  name: "Section heading",
  category: "layout",
  description: "A section divider; tick 'Page break before' to start a new page.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: false,
  configSchema: headingSchema,
  defaultConfig: { title: "Section" },
  Renderer: () => null,
  partnerSafe: true,
  static: true,
  phase: 1,
});

// ---------------------------------------------------------------- highlight_report_summary
interface HighlightData {
  id: string | null;
  ref?: string;
  project_code?: string;
  project_name?: string;
  reporting_date?: string;
  author?: string | null;
  comments?: string | null;
  accomplished?: string | null;
  planned?: string | null;
  decisions_needed?: string | null;
  declared?: Record<string, string>;
  evidenced?: Record<string, string>;
}

function Highlight({
  data,
  ctx,
}: {
  data: HighlightData;
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.id) return <Empty>No highlight report submitted on or before the as-at date.</Empty>;
  const sections: Array<[string, string | null | undefined]> = [
    ["Summary", data.comments],
    ["Achieved this period", data.accomplished],
    ["Planned next period", data.planned],
    ["Decisions needed", data.decisions_needed],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <RatingChip scheme={ctx.scheme} value={data.declared?.["overall"]} prefix="Declared" />
        <RatingChip
          scheme={ctx.scheme}
          value={data.evidenced?.["overall"]}
          prefix="Evidence at submission"
        />
        <span className="text-muted-foreground">
          {data.ref} · {f.date(data.reporting_date)}
          {data.author && ` · ${data.author}`}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {sections
          .filter(([, text]) => text && text.trim())
          .map(([label, text]) => (
            <div key={label} className="report-avoid-break">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </h4>
              <p className="whitespace-pre-line text-sm leading-6">{text}</p>
            </div>
          ))}
      </div>
      <BlockNote>
        Declared by the project manager; the evidence column is what the data showed when it was
        submitted.
      </BlockNote>
    </div>
  );
}

export const _highlight_report_summary = registerBlock<Record<string, never>, HighlightData>({
  key: "highlight_report_summary",
  version: 1,
  name: "Last highlight report",
  category: "narrative",
  description:
    "Latest submitted highlight report for the period: declared status, summary, next steps.",
  supportedScopes: ["project"],
  perEntity: true,
  configSchema: z.object({}).passthrough() as never,
  defaultConfig: {},
  Renderer: Highlight,
  partnerSafe: true,
  phase: 1,
});
