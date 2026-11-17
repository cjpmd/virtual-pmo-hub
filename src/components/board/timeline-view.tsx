import { useState } from "react";
import { Check, Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type BoardRow } from "./types";

export function Timeline({
  rows,
  setOpenItem,
}: {
  rows: BoardRow[];
  setOpenItem: (row: BoardRow) => void;
}) {
  const [month, setMonth] = useState(false);
  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="flex justify-end border-b p-2">
        <Button size="sm" variant="ghost" onClick={() => setMonth(!month)}>
          {month ? "Month" : "Week"}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {rows.map((row, index) => (
            <button
              key={row.id}
              onClick={() => setOpenItem(row)}
              className="grid w-full grid-cols-[220px_1fr] border-b text-left"
            >
              <span className="truncate px-3 py-4 text-sm font-medium">{row.title}</span>
              <span
                className="relative my-3 mr-4 h-6 bg-muted"
                style={{
                  backgroundImage: "linear-gradient(to right,var(--border) 1px,transparent 1px)",
                  backgroundSize: month ? "120px 100%" : "40px 100%",
                }}
              >
                {row.complete ? (
                  <Check className="absolute left-[75%] top-1 size-4 text-health-good" />
                ) : row.start === row.finish ? (
                  <Diamond className="absolute left-[55%] top-1 size-4 fill-primary text-primary" />
                ) : (
                  <span
                    className="absolute top-1 h-4 rounded bg-primary/80"
                    style={{
                      left: `${10 + ((index * 9) % 60)}%`,
                      width: `${15 + ((index * 4) % 25)}%`,
                    }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
