import { CheckCircle2, Circle, Diamond, Triangle } from "lucide-react";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePeople } from "@/hooks/use-hierarchy";
import { type BoardRow, type BoardColumn } from "./types";
import { initials, statusTone } from "./board-helpers";

export function DeliveryStatusIcon({ status }: { status: string }) {
  if (status === "Completed") return <CheckCircle2 className="size-4 text-health-good" />;
  if (status === "Overdue") return <Diamond className="size-4 fill-health-bad text-health-bad" />;
  if (status === "Late") return <Triangle className="size-4 fill-health-warn text-health-warn" />;
  if (status === "On Track") return <Circle className="size-4 fill-health-good text-health-good" />;
  return <Circle className="size-4 text-muted-foreground" />;
}
export function AvatarStack({ names }: { names: string[] | undefined }) {
  const people = names ?? [];
  return (
    <span className="flex -space-x-2">
      {people.slice(0, 3).map((name) => (
        <span
          key={name}
          title={name}
          className="grid size-7 place-items-center rounded-full border-2 border-card bg-accent text-[10px] font-semibold"
        >
          {initials(name)}
        </span>
      ))}
      {people.length > 3 && (
        <span className="grid size-7 place-items-center rounded-full border-2 border-card bg-muted text-[10px]">
          +{people.length - 3}
        </span>
      )}
    </span>
  );
}
export function CellValue({
  row,
  column,
  edit,
}: {
  row: BoardRow;
  column: BoardColumn;
  edit: (value: unknown) => void;
}) {
  const value = row[column.key];
  const peopleNames = (usePeople().data ?? []).map((person) => person.name);
  const base =
    "h-8 w-full min-w-20 rounded border border-transparent bg-transparent px-2 text-sm outline-none hover:border-input focus:border-ring focus:bg-background";
  if (column.type === "formula")
    return <span className="text-sm font-medium">{String(value ?? "")}</span>;
  if (column.type === "people")
    return (
      <details className="relative">
        <summary className="list-none cursor-pointer">
          <AvatarStack names={Array.isArray(value) ? value.map(String) : []} />
        </summary>
        <div className="absolute top-9 z-30 max-h-64 w-52 overflow-y-auto rounded-md border bg-popover p-2 shadow-lg">
          {peopleNames.map((name) => (
            <label key={name} className="flex items-center gap-2 p-2 text-xs">
              <input
                type="checkbox"
                checked={Array.isArray(value) && value.includes(name)}
                onChange={() => {
                  const current = Array.isArray(value) ? value.map(String) : [];
                  edit(
                    current.includes(name)
                      ? current.filter((item) => item !== name)
                      : [...current, name],
                  );
                }}
              />
              {name}
            </label>
          ))}
        </div>
      </details>
    );
  if (column.type === "status" || column.type === "priority") {
    const text = String(value ?? "");
    return column.editable ? (
      <select
        value={text}
        onChange={(event) => edit(event.target.value)}
        className={cn(base, statusTone(text))}
      >
        {(column.options ?? ["Not Started", "On Track", "At Risk", "Off Track", "Completed"]).map(
          (option) => (
            <option key={option}>{option}</option>
          ),
        )}
      </select>
    ) : (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold",
          statusTone(text),
        )}
      >
        {column.key === "deliveryStatus" && <DeliveryStatusIcon status={text} />} {text}
      </span>
    );
  }
  if (column.type === "progress") {
    const amount = Number(value ?? 0);
    return (
      <div className="flex min-w-28 items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${amount}%` }} />
        </div>
        {column.editable ? (
          <input
            aria-label={`${column.label} for ${row.title}`}
            type="number"
            min="0"
            max="100"
            value={amount}
            onChange={(event) => edit(Number(event.target.value))}
            className="w-12 bg-transparent text-xs"
          />
        ) : (
          <span className="text-xs">{amount}%</span>
        )}
      </div>
    );
  }
  if (column.type === "timeline")
    return (
      <div className="min-w-40">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary/80"
            style={{ width: `${Math.max(8, Number(row.progress ?? 30))}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {formatDate(row.start)} – {formatDate(row.finish)}
        </p>
      </div>
    );
  if (column.type === "tags")
    return (
      <div className="flex flex-wrap gap-1">
        {(Array.isArray(value) ? value : []).map((tag) => (
          <span key={String(tag)} className="rounded bg-accent px-2 py-0.5 text-xs">
            {String(tag)}
          </span>
        ))}
      </div>
    );
  if (column.type === "link")
    return value ? (
      <a
        href={String(value)}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="text-primary underline"
      >
        Open
      </a>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  if (column.type === "dependency")
    return (
      <span className="text-xs text-muted-foreground">
        {Array.isArray(value) ? value.join(", ") : "—"}
      </span>
    );
  if (column.type === "number")
    return column.editable ? (
      <input
        type="number"
        value={Number(value ?? 0)}
        onChange={(event) => edit(Number(event.target.value))}
        className={base}
      />
    ) : (
      <span>
        {column.unit === "currency"
          ? formatCurrency(Number(value ?? 0))
          : `${formatNumber(Number(value ?? 0))}${column.unit ?? ""}`}
      </span>
    );
  return column.editable ? (
    <input
      inputMode={column.type === "date" ? "numeric" : undefined}
      value={String(value ?? "")}
      onChange={(event) => edit(event.target.value)}
      className={base}
    />
  ) : (
    <span
      className={cn(
        column.key === "title" && row.complete && "text-muted-foreground line-through",
        column.key === "lastReport" &&
          Boolean(row["statusReportOverdue"]) &&
          "font-semibold text-health-bad-foreground",
      )}
    >
      {column.key === "title" && Boolean(row["isMilestone"]) && (
        <Diamond className="mr-1 inline size-3.5 fill-primary text-primary" />
      )}
      {column.key === "title" && row.complete && (
        <CheckCircle2 className="mr-1 inline size-3.5 text-health-good" />
      )}
      {column.type === "date" ? formatDate(String(value ?? "")) || "—" : String(value ?? "—")}
    </span>
  );
}
export function Summary({ rows, column }: { rows: BoardRow[]; column: BoardColumn }) {
  if (!column.summary) return null;
  if (column.summary === "count") return <span>{rows.length} items</span>;
  const nums = rows.map((row) => Number(row[column.key] ?? 0));
  if (column.summary === "sum") {
    const total = nums.reduce((a, b) => a + b, 0);
    return (
      <span>
        {column.unit === "currency"
          ? formatCurrency(total)
          : `${formatNumber(total)}${column.unit ?? ""}`}
      </span>
    );
  }
  if (column.summary === "average") {
    const mean = Math.round(nums.reduce((a, b) => a + b, 0) / (nums.length || 1));
    return (
      <span>
        {column.unit === "currency"
          ? formatCurrency(mean)
          : `${formatNumber(mean)}${column.unit ?? ""}`}
      </span>
    );
  }
  const statuses = rows.map((row) => String(row[column.key]));
  const good = statuses.filter((s) => s === "On Track" || s === "Completed").length,
    warn = statuses.filter((s) => s === "At Risk" || s === "Late").length,
    bad = statuses.filter((s) => s === "Off Track" || s === "Overdue").length;
  return (
    <div className="flex h-2 w-24 overflow-hidden rounded-full bg-muted">
      <span className="bg-health-good" style={{ width: `${(good / (rows.length || 1)) * 100}%` }} />
      <span className="bg-health-warn" style={{ width: `${(warn / (rows.length || 1)) * 100}%` }} />
      <span className="bg-health-bad" style={{ width: `${(bad / (rows.length || 1)) * 100}%` }} />
    </div>
  );
}
