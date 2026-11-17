import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type BoardRow } from "./types";
import { getDeliveryStatus } from "./board-helpers";
import { DeliveryStatusIcon, AvatarStack } from "./cells";

export function Kanban({
  rows,
  groupBy,
  locked,
  groups,
  dragged,
  setDragged,
  update,
  setOpenItem,
}: {
  rows: BoardRow[];
  groupBy: string;
  /** Cards can't be moved between these columns. */
  locked: boolean;
  groups: string[];
  dragged: string | null;
  setDragged: (id: string | null) => void;
  update: (id: string, key: string, value: unknown) => void;
  setOpenItem: (row: BoardRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max auto-cols-[280px] grid-flow-col gap-3">
        {groups.map((group) => (
          <section
            key={group}
            onDragOver={(e) => {
              if (!locked) e.preventDefault();
            }}
            onDrop={() => {
              if (dragged && !locked) update(dragged, groupBy, group);
              setDragged(null);
            }}
            className="min-h-80 rounded-md border bg-muted/30 p-3"
          >
            <header className="mb-3 flex items-center justify-between">
              <strong className="text-sm">{group}</strong>
              <span className="text-xs text-muted-foreground">
                {rows.filter((row) => String(row[groupBy] ?? "Unassigned") === group).length}
              </span>
            </header>
            {rows
              .filter((row) => String(row[groupBy] ?? "Unassigned") === group)
              .map((row) => (
                <article
                  key={row.id}
                  draggable={!locked}
                  onDragStart={() => setDragged(row.id)}
                  onClick={() => setOpenItem(row)}
                  className={cn(
                    "mb-2 rounded-lg border border-border/70 bg-card p-3 shadow-sm",
                    locked ? "cursor-pointer" : "cursor-grab",
                  )}
                >
                  <div className="flex gap-2">
                    <DeliveryStatusIcon status={getDeliveryStatus(row)} />
                    <p className="text-sm font-medium">{row.title}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <AvatarStack names={row.people} />
                    <span className="text-xs text-muted-foreground">{formatDate(row.finish)}</span>
                  </div>
                </article>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}
