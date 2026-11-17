import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type BoardRow, type BoardColumn, type BoardProps } from "./types";
import { getDeliveryStatus } from "./board-helpers";
import { CellValue, Summary } from "./cells";

export function TableView({
  rows,
  columns,
  groups,
  groupBy,
  collapsed,
  setCollapsed,
  selected,
  setSelected,
  update,
  setOpenItem,
  setColumns,
  renderTitle,
  titleAdornment,
  rowEditable,
}: {
  rows: BoardRow[];
  columns: BoardColumn[];
  groups: string[];
  groupBy: string;
  collapsed: string[];
  setCollapsed: (v: string[]) => void;
  selected: string[];
  setSelected: (v: string[]) => void;
  update: (id: string, key: string, value: unknown) => void;
  setOpenItem: (row: BoardRow) => void;
  setColumns: (v: BoardColumn[]) => void;
  renderTitle?: BoardProps["renderTitle"];
  titleAdornment?: BoardProps["titleAdornment"];
  rowEditable?: BoardProps["rowEditable"];
}) {
  const cellColumn = (row: BoardRow, column: BoardColumn) =>
    column.editable && rowEditable && !rowEditable(row) ? { ...column, editable: false } : column;
  const [dragRow, setDragRow] = useState<string | null>(null),
    [dragCol, setDragCol] = useState<string | null>(null);
  return (
    <div className="overflow-auto rounded-lg border border-border/70 bg-card shadow-sm">
      <table className="w-full min-w-[1000px] border-collapse text-left">
        <thead className="sticky top-0 z-20 bg-table-head">
          <tr>
            <th className="sticky left-0 z-30 w-10 border-b bg-table-head px-3">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={selected.length === rows.length && rows.length > 0}
                onChange={(event) => setSelected(event.target.checked ? rows.map((r) => r.id) : [])}
              />
            </th>
            {columns.map((column, index) => (
              <th
                key={column.key}
                draggable
                onDragStart={() => setDragCol(column.key)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!dragCol || dragCol === column.key) return;
                  const next = [...columns],
                    from = next.findIndex((c) => c.key === dragCol),
                    to = next.findIndex((c) => c.key === column.key);
                  const [moved] = next.splice(from, 1);
                  if (moved) next.splice(to, 0, moved);
                  setColumns(next);
                }}
                className={cn(
                  "relative h-11 border-b border-l px-3 text-xs font-semibold text-muted-foreground",
                  index === 0 && "sticky left-10 z-20 bg-table-head",
                )}
                style={{ width: column.width ?? 160, minWidth: column.width ?? 160 }}
              >
                <span className="flex items-center gap-1">
                  <GripVertical className="size-3" />
                  {column.label}
                </span>
                <span
                  role="separator"
                  aria-label={`Resize ${column.label}`}
                  onMouseDown={(event) => {
                    const start = event.clientX,
                      width = column.width ?? 160;
                    const move = (e: MouseEvent) =>
                      setColumns(
                        columns.map((c) =>
                          c.key === column.key
                            ? { ...c, width: Math.max(90, width + e.clientX - start) }
                            : c,
                        ),
                      );
                    const up = () => {
                      window.removeEventListener("mousemove", move);
                      window.removeEventListener("mouseup", up);
                    };
                    window.addEventListener("mousemove", move);
                    window.addEventListener("mouseup", up);
                  }}
                  className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-primary"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group) => {
            const groupRows = groupBy
              ? rows.filter((row) => String(row[groupBy] ?? "Unassigned") === group)
              : rows;
            const isCollapsed = collapsed.includes(group);
            return [
              <tr key={`group-${group}`} className="bg-accent/35">
                <td colSpan={columns.length + 1} className="border-b px-3 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setCollapsed(
                        isCollapsed
                          ? collapsed.filter((item) => item !== group)
                          : [...collapsed, group],
                      )
                    }
                  >
                    {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                    <span className="size-2 rounded-full bg-primary" />
                    {group} <span className="text-muted-foreground">{groupRows.length}</span>
                  </Button>
                </td>
              </tr>,
              ...(!isCollapsed
                ? groupRows.map((row) => {
                    const overdue = getDeliveryStatus(row) === "Overdue";
                    return (
                      <tr
                        key={row.id}
                        draggable
                        onDragStart={() => setDragRow(row.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => setDragRow(null)}
                        className={cn(
                          "border-b border-border/60 last:border-0 hover:bg-accent/30",
                          overdue && "bg-health-bad/10",
                          dragRow === row.id && "opacity-40",
                        )}
                      >
                        <td className="sticky left-0 z-10 bg-card px-3">
                          <div className="flex items-center gap-2">
                            <GripVertical className="size-3 text-muted-foreground" />
                            <input
                              type="checkbox"
                              aria-label={`Select ${row.title}`}
                              checked={selected.includes(row.id)}
                              onChange={(event) =>
                                setSelected(
                                  event.target.checked
                                    ? [...selected, row.id]
                                    : selected.filter((id) => id !== row.id),
                                )
                              }
                            />
                          </div>
                        </td>
                        {columns.map((column, index) => (
                          <td
                            key={column.key}
                            onClick={() =>
                              cellColumn(row, column).editable ? undefined : setOpenItem(row)
                            }
                            className={cn(
                              "h-12 border-l px-2",
                              index === 0 && "sticky left-10 z-10 bg-card font-medium",
                            )}
                            style={{ width: column.width ?? 160, minWidth: column.width ?? 160 }}
                          >
                            {index === 0 ? (
                              <div className="flex items-center gap-1">
                                <div className="min-w-0 flex-1">
                                  {column.key === "title" && renderTitle ? (
                                    renderTitle(row)
                                  ) : (
                                    <CellValue
                                      row={row}
                                      column={cellColumn(row, column)}
                                      edit={(value) => update(row.id, column.key, value)}
                                    />
                                  )}
                                </div>
                                {column.key === "title" && titleAdornment?.(row)}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 shrink-0"
                                  aria-label={`Open ${row.title}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenItem(row);
                                  }}
                                >
                                  <ChevronRight className="size-4" />
                                </Button>
                              </div>
                            ) : column.key === "title" && renderTitle ? (
                              renderTitle(row)
                            ) : (
                              <CellValue
                                row={row}
                                column={cellColumn(row, column)}
                                edit={(value) => update(row.id, column.key, value)}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                : []),
              ...(!isCollapsed
                ? [
                    <tr
                      key={`summary-${group}`}
                      className="bg-muted/35 text-xs text-muted-foreground"
                    >
                      <td className="sticky left-0 bg-muted/35 px-3 py-2" />
                      <>
                        {columns.map((column, index) => (
                          <td
                            key={column.key}
                            className={cn(
                              "border-l px-3 py-2",
                              index === 0 && "sticky left-10 bg-muted/35",
                            )}
                          >
                            <Summary rows={groupRows} column={column} />
                          </td>
                        ))}
                      </>
                    </tr>,
                  ]
                : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
