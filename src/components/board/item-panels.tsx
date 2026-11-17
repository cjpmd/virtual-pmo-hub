import { useState } from "react";
import { Settings2, Trash2, RotateCcw, Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type BoardRow, type BoardColumn } from "./types";
import { editableField } from "./board-helpers";

export function FieldInput({
  column,
  value,
  onChange,
}: {
  column: BoardColumn;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  if (column.options?.length)
    return (
      <select
        aria-label={column.label}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={cls}
      >
        <option value="">—</option>
        {column.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  if (column.type === "people" || column.type === "tags" || column.type === "dependency")
    return (
      <input
        aria-label={column.label}
        value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          )
        }
        placeholder="Comma separated"
        className={cls}
      />
    );
  if (column.type === "number" || column.type === "progress")
    return (
      <input
        aria-label={column.label}
        type="number"
        value={Number(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cls}
      />
    );
  return (
    <input
      aria-label={column.label}
      value={String(value ?? "")}
      placeholder={column.type === "date" ? "DD/MM/YYYY" : undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cls}
    />
  );
}
export function CreatePanel({
  columns,
  itemLabel,
  onCancel,
  onCreate,
}: {
  columns: BoardColumn[];
  itemLabel: string;
  onCancel: () => void;
  onCreate: (row: BoardRow) => void;
}) {
  const fields = columns.filter(editableField);
  const [values, setValues] = useState<BoardRow>(() => ({
    id: "",
    title: "",
    ...Object.fromEntries(
      fields.filter((c) => c.options?.length).map((c) => [c.key, c.options![0]]),
    ),
  }));
  const titleKey = fields.find((c) => c.key === "title") ? "title" : (fields[0]?.key ?? "title");
  const valid = String(values[titleKey] ?? "").trim().length > 0;
  return (
    <>
      <button
        aria-label="Close new item overlay"
        className="fixed inset-0 z-40 bg-overlay"
        onClick={onCancel}
      />
      <aside
        role="dialog"
        aria-label={`New ${itemLabel}`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Add</p>
            <h2 className="mt-2 text-2xl font-semibold capitalize">New {itemLabel}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onCancel} aria-label="Cancel">
            <X />
          </Button>
        </div>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid)
              onCreate({ ...values, title: String(values.title || values[titleKey] || "") });
          }}
        >
          {fields.map((column) => (
            <label key={column.key} className="block space-y-1 text-sm">
              <span className="font-medium">
                {column.label}
                {column.key === titleKey && " *"}
              </span>
              <FieldInput
                column={column}
                value={values[column.key]}
                onChange={(v) => setValues((current) => ({ ...current, [column.key]: v }))}
              />
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Add {itemLabel}
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}
export function ItemPanel({
  item,
  columns,
  tab,
  setTab,
  close,
  manage,
  edit,
  onDelete,
  closed,
  onToggleClosed,
}: {
  item: BoardRow;
  columns: BoardColumn[];
  tab: string;
  setTab: (v: string) => void;
  close: () => void;
  manage: boolean;
  edit: (field: string, value: unknown) => void;
  onDelete?: () => void;
  closed: boolean;
  onToggleClosed: () => void;
}) {
  // Details only: comments, files and activity aren't stored for board items yet.
  const panelTabs = [{ name: "details", Icon: Settings2 }];
  return (
    <>
      <button
        aria-label="Close item overlay"
        className="fixed inset-0 z-40 bg-overlay"
        onClick={close}
      />
      <aside
        role="dialog"
        aria-label={`${item.title} details`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Item</p>
            <h2 className="mt-2 text-2xl font-semibold">{item.title}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={close}>
            <X />
          </Button>
        </div>
        {manage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onToggleClosed}>
              {closed ? (
                <>
                  <RotateCcw className="size-4" />
                  Reopen
                </>
              ) : (
                <>
                  <Archive className="size-4" />
                  Close
                </>
              )}
            </Button>
            {onDelete && (
              <Button
                size="sm"
                variant="outline"
                className="text-health-bad-foreground"
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
          </div>
        )}
        {typeof item["closedNote"] === "string" && item["closedNote"] && (
          <p className="mt-3 rounded-md bg-muted p-3 text-sm">
            <strong>Closing note:</strong> {String(item["closedNote"])}
          </p>
        )}
        <div className="mt-6 flex border-b">
          {panelTabs.map(({ name, Icon }) => (
            <Button
              key={name}
              variant="ghost"
              onClick={() => setTab(name)}
              className={cn(
                "rounded-none capitalize",
                tab === name && "border-b-2 border-primary text-primary",
              )}
            >
              <Icon className="size-4" />
              {name}
            </Button>
          ))}
        </div>
        {tab === "details" && (
          <div className="mt-5 divide-y rounded-md border">
            {columns.map((column) => {
              const value = item[column.key];
              return (
                <div key={column.key} className="grid grid-cols-[130px_1fr] gap-3 p-3 text-sm">
                  <span className="text-muted-foreground">{column.label}</span>
                  {manage && editableField(column) ? (
                    <FieldInput
                      column={column}
                      value={value}
                      onChange={(v) => edit(column.key, v)}
                    />
                  ) : (
                    <span>
                      {Array.isArray(value)
                        ? value.map(String).join(", ")
                        : column.type === "number" && column.unit === "currency"
                          ? formatCurrency(Number(value ?? 0))
                          : String(value ?? "—")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}
