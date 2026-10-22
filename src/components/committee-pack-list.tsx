// Issued committee packs, newest meeting first. Packs are immutable once issued.
import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileDown, FileText } from "lucide-react";
import { IssuedCommitteePack } from "@/components/committee-pack";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { CommitteePackRecord } from "@/services/committee-packs";

const issuedOn = (iso: string) =>
  `${formatDate(iso.slice(0, 10))} at ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

export function CommitteePackList({
  query,
  collectionId,
  collectionNames,
}: {
  query: UseQueryResult<CommitteePackRecord[]>;
  /** Only this collection's packs. */
  collectionId?: string;
  /** Show which collection each pack came from. */
  collectionNames?: Map<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <QueryState query={query}>
        {(all) => {
          const packs = collectionId
            ? all.filter((pack) => pack.collectionId === collectionId)
            : all;
          if (!packs.length)
            return (
              <div className="rounded-lg border border-dashed border-border py-10 text-center">
                <Clock3 className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No packs issued yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generate a pack, check every page, then issue it for the meeting.
                </p>
              </div>
            );
          return (
            <div className="grid gap-3">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center"
                >
                  <span className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground">
                    <FileText className="size-5" />
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {pack.title} · {formatDate(pack.meetingDate)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        !collectionId &&
                          pack.collectionId &&
                          collectionNames?.get(pack.collectionId),
                        pack.issuedAt && `Issued ${issuedOn(pack.issuedAt)}`,
                        pack.issuedBy && `by ${pack.issuedBy}`,
                        pack.pageCount != null && `${pack.pageCount} pages`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {pack.issuedAt ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground">
                        <CheckCircle2 className="size-4" />
                        Issued
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setOpenId(pack.id)}>
                        <FileDown className="size-4" />
                        Export to PDF
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">Draft</span>
                  )}
                </div>
              ))}
            </div>
          );
        }}
      </QueryState>
      {openId && <IssuedCommitteePack packId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
