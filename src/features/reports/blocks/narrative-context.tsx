// Narrative editing for draft reports. The builder provides it; renderers only read it, so a
// narrative block stays a pure renderer that shows an editor when one is available.
import { createContext, useContext } from "react";

export interface NarrativeEditing {
  save: (input: {
    blockInstanceId: string;
    entityId: string | null;
    text: string;
    source?: "human" | "ai_draft" | "highlight_report";
    existing: { id: string; updatedAt: string } | null;
  }) => Promise<void>;
  /** Latest PM summary for "Use PM's summary" (deep-dive or project-scope reports). */
  pmSummary?: (entityId: string | null) => Promise<string | null>;
  /** Phase 4: draft the executive summary with AI. */
  draftWithAi?: (blockInstanceId: string) => Promise<void>;
  /** Phase 4: acknowledge an AI draft (marks it reviewed). */
  acknowledgeAi?: (narrativeId: string) => Promise<void>;
}

export const NarrativeEditingContext = createContext<NarrativeEditing | null>(null);
export const useNarrativeEditing = () => useContext(NarrativeEditingContext);
