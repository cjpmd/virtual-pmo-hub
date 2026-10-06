// Committee packs on Supabase (committee_packs). Issuing a pack stores what the forum was
// shown: the sections and the collection and project facts at that moment. Issued packs are
// immutable and never deleted; the database records when and by whom each was issued.
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./service-error";
import { insertRow } from "./write";

export interface CommitteePackContent {
  collection: { id: string; name: string };
  sections: string[];
  pageCount: number;
  coverText: string;
  projects: unknown[];
}

export interface CommitteePackRecord {
  id: string;
  collectionId: string | null;
  title: string;
  meetingDate: string;
  issuedAt: string | null;
  issuedBy: string | null;
  pageCount: number | null;
}

export async function listCommitteePacks(orgId: string): Promise<CommitteePackRecord[]> {
  const rows = unwrap(
    await supabase
      .from("committee_packs")
      .select(
        "id, collection_id, title, meeting_date, issued_at, issued_by, page_count:content->pageCount",
      )
      .eq("organisation_id", orgId)
      .order("meeting_date", { ascending: false })
      .order("created_at", { ascending: false }),
    "Loading committee packs",
  );
  const issuerIds = [...new Set(rows.flatMap((row) => (row.issued_by ? [row.issued_by] : [])))];
  const names = new Map<string, string>();
  if (issuerIds.length) {
    const profiles = unwrap(
      await supabase.from("profiles").select("id, display_name").in("id", issuerIds),
      "Loading who issued the packs",
    );
    for (const profile of profiles) names.set(profile.id, profile.display_name);
  }
  return rows.map((row) => {
    return {
      id: row.id,
      collectionId: row.collection_id,
      title: row.title,
      meetingDate: row.meeting_date,
      issuedAt: row.issued_at,
      issuedBy: (row.issued_by && names.get(row.issued_by)) || null,
      pageCount: typeof row.page_count === "number" ? row.page_count : null,
    };
  });
}

/** Issue a pack for a governance collection. The pack can't be changed afterwards. */
export async function issueCommitteePack(input: {
  collectionId: string;
  title: string;
  meetingDate: string;
  content: CommitteePackContent;
}) {
  return insertRow(
    "committee_packs",
    {
      collection_id: input.collectionId,
      title: input.title.trim(),
      meeting_date: input.meetingDate,
      content: JSON.parse(JSON.stringify(input.content)) as Json,
      // The database replaces this with its own clock and records who issued it.
      issued_at: new Date().toISOString(),
    },
    "Issuing the committee pack",
  );
}
