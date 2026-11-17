import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChartPie,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { boardAutomations } from "@/lib/features";
import { useSavedViews } from "@/hooks/use-saved-views";
import {
  canEditView,
  resolveDefaultView,
  type SavedViewRecord,
  type ViewConfig,
} from "@/services/saved-views";
import { errorMessage } from "@/services/service-error";
import { compareBoardRows, formatSortKey, parseSortKey } from "@/lib/board-sort";
import { type BoardViewType, type BoardRow, type SavedView, type BoardProps } from "./board/types";
import {
  closedStatusFor,
  isClosedRow as isClosed,
  matchesFilter,
  reopenStatusFor,
  toggleViewColumn,
} from "./board/board-helpers";
import { ColumnsMenu, SavedViewMenu } from "./board/view-menu";
import { TableView } from "./board/table-view";
import { Kanban } from "./board/kanban-view";
import { Timeline } from "./board/timeline-view";
import { CalendarView } from "./board/calendar-view";
import { CreatePanel, ItemPanel } from "./board/item-panels";
import { AutomationPanel } from "./board/automation-panel";
// GL-20a: the board's types, cells, views and panels live in ./board; these re-exports keep
// existing imports of "@/components/board-workspace" working.
export type {
  BoardViewType,
  BoardColumnType,
  BoardRow,
  BoardColumn,
  BoardFilter,
  SavedView,
  BoardRecordChange,
} from "./board/types";
export { DeliveryStatusIcon } from "./board/cells";
export {
  benefitAutomationRecipes,
  dependencyAutomationRecipes,
  governanceAutomationRecipes,
} from "./board/automation-recipes";
// GL-18: the Chart view is the only part of the board that uses recharts, so it loads on demand
// instead of putting recharts on every page with a board.
const ChartView = lazy(() =>
  import("./board-chart-view").then((module) => ({ default: module.BoardChartView })),
);
/** The status a board uses for "closed", from the options it offers. */

/** One record-level change, reported when the board is backed by a server (onRecordChange) instead of browser-local deltas. */
const views: [BoardViewType, typeof List][] = [
  ["table", List],
  ["kanban", LayoutGrid],
  ["timeline", Activity],
  ["calendar", CalendarDays],
  ["chart", ChartPie],
];

export function BoardWorkspace({
  title,
  rows: initialRows,
  columns: initialColumns,
  groupOptions = [],
  initialView = "table",
  planner = false,
  onRowsChange,
  onEdit,
  renderTitle,
  titleAdornment,
  seededViews,
  actions,
  seededAutomations,
  storageKey,
  boardKey,
  itemLabel = "item",
  manage: manageProp = true,
  onRecordChange,
  canDelete = true,
  canCreate = true,
  onOpenRow,
  rowEditable,
  lockedGroups,
}: BoardProps) {
  const openRow = (row: BoardRow | null) => (row && onOpenRow ? onOpenRow(row) : setOpenItem(row));
  const server = Boolean(onRecordChange);
  // Editing needs a server (onRecordChange): a board without one is read-only, so nothing is
  // ever "saved" only in this browser.
  const manage = manageProp && server;
  const defaults = seededViews?.length
    ? seededViews
    : [
        {
          id: "default",
          name: "Main table",
          type: initialView,
          groupBy: groupOptions[0] ?? "",
          sortKey: "",
          filter: "",
          visible: initialColumns.map((c) => c.key),
          isDefault: true,
        },
      ];
  const defaultView = defaults.find((item) => item.isDefault) ?? defaults[0];
  const [rows, setRows] = useState(initialRows),
    [columns, setColumns] = useState(initialColumns),
    [view, setView] = useState<BoardViewType>(defaultView?.type ?? initialView),
    [selected, setSelected] = useState<string[]>([]),
    [openItem, setOpenItem] = useState<BoardRow | null>(null),
    [collapsed, setCollapsed] = useState<string[]>([]),
    [groupBy, setGroupBy] = useState(defaultView?.groupBy ?? groupOptions[0] ?? ""),
    [filter, setFilter] = useState(defaultView?.filter ?? ""),
    [sortKey, setSortKey] = useState(defaultView?.sortKey ?? ""),
    [saved, setSaved] = useState<SavedView[]>(defaults),
    [activeView, setActiveView] = useState(defaultView?.id ?? "default"),
    [defaultResolved, setDefaultResolved] = useState(false),
    [automationOpen, setAutomationOpen] = useState(false),
    [panelTab, setPanelTab] = useState("details"),
    [dragged, setDragged] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [creating, setCreating] = useState(false),
    [undo, setUndo] = useState<{ label: string; rows: BoardRow[] } | null>(null);
  // Saved views (work package 1.3): seeded views stay as read-only defaults; saved ones come
  // from saved_views for this board. The board opens on my default, else the shared default,
  // else the seeded default.
  const stored = useSavedViews(boardKey, {
    type: defaultView?.type ?? initialView,
    groupBy: defaultView?.groupBy ?? groupOptions[0] ?? "",
    sortKey: "",
    filter: "",
    visible: initialColumns.map((c) => c.key),
  });
  const records = stored.query.data;
  const effectiveDefault = records
    ? resolveDefaultView(records, stored.me, defaultView?.id ?? null)
    : (defaultView?.id ?? null);
  const fromRecord = (record: SavedViewRecord): SavedView => ({
    id: record.id,
    name: record.name,
    ...record.config,
    isDefault: false,
    source: "saved",
    record,
  });
  const applyView = (item: SavedView) => {
    setActiveView(item.id);
    setView(item.type);
    setGroupBy(item.groupBy);
    setSortKey(item.sortKey);
    setFilter(item.filter);
  };
  useEffect(() => {
    if (!records) return;
    setSaved([
      ...defaults.map((item) => ({ ...item, source: "seeded" as const })),
      ...records.map(fromRecord),
    ]);
    if (!defaultResolved) {
      setDefaultResolved(true);
      const record = records.find((item) => item.id === effectiveDefault);
      if (record) applyView(fromRecord(record));
    }
    // Rebuilt only when the saved views change; defaults come from props that don't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);
  const statusOptions = initialColumns.find((c) => c.key === "status")?.options;
  const commit = (next: BoardRow[]) => {
    setRows(next);
    onRowsChange?.(next);
  };
  const recordEdit = (id: string, patch: Partial<BoardRow>) => {
    onRecordChange?.({ kind: "update", id, patch });
  };
  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? "" : current)), 4000);
  };
  const createItem = (values: BoardRow) => {
    onRecordChange?.({ kind: "create", values });
    setCreating(false);
  };
  const deleteItems = (ids: string[]) => {
    if (
      !onRecordChange ||
      !ids.length ||
      !window.confirm(
        `Delete ${ids.length === 1 ? `"${rows.find((r) => r.id === ids[0])?.title}"` : `${ids.length} items`}? This can't be undone.`,
      )
    )
      return;
    onRecordChange({ kind: "delete", ids });
    setSelected([]);
    setOpenItem(null);
  };
  const undoDelete = () => {
    if (!undo) return;
    setRows(undo.rows);
    onRowsChange?.(undo.rows);
    setUndo(null);
  };
  const setClosed = (row: BoardRow, closed: boolean) => {
    let note = "";
    if (closed) {
      const answer = window.prompt(`Closing note for "${row.title}"`, "");
      if (answer === null) return;
      note = answer;
    }
    const status = closed ? closedStatusFor(statusOptions) : reopenStatusFor(statusOptions);
    const patch: Partial<BoardRow> = {
      status,
      closedNote: closed ? note : undefined,
      ...(closed ? { previousStatus: row.status } : {}),
    };
    if (!closed && row["previousStatus"]) patch.status = String(row["previousStatus"]);
    const next = rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r));
    setRows(next);
    onRowsChange?.(next);
    recordEdit(row.id, patch);
    setOpenItem({ ...row, ...patch });
    flash(closed ? `${row.title} closed` : `${row.title} reopened`);
  };
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);
  const activeSaved = saved.find((item) => item.id === activeView);
  const visibleColumns = columns.filter(
    (column) => activeSaved?.visible.includes(column.key) ?? true,
  );
  const update = (id: string, field: string, value: unknown) => {
    setRows((current) => {
      const next = current.map((row) => (row.id === id ? { ...row, [field]: value } : row));
      onRowsChange?.(next);
      return next;
    });
    setOpenItem((current) => (current?.id === id ? { ...current, [field]: value } : current));
    recordEdit(id, { [field]: value } as Partial<BoardRow>);
    onEdit?.();
  };
  const sortCompare = useMemo(() => {
    const { key, direction } = parseSortKey(sortKey);
    if (!key) return null;
    return compareBoardRows(key, columns.find((column) => column.key === key)?.type, direction);
  }, [sortKey, columns]);
  const shown = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            row.title.toLowerCase().includes(filter.toLowerCase()) &&
            (activeSaved?.filters ?? []).every((item) => matchesFilter(row, item)),
        )
        .sort((a, b) => (sortCompare ? sortCompare(a, b) : 0)),
    [rows, filter, sortCompare, activeSaved],
  );
  const groups = groupBy
    ? Array.from(new Set(shown.map((row) => String(row[groupBy] ?? "Unassigned"))))
    : ["All items"];
  const activeRecord = saved.find((item) => item.id === activeView)?.record;
  const editable = activeRecord
    ? canEditView(activeRecord, stored.me, stored.canManageShared)
    : false;
  /** The board's current settings, to save as a view. */
  const currentConfig = (): ViewConfig => {
    const active = saved.find((item) => item.id === activeView);
    return {
      type: view,
      groupBy,
      sortKey,
      filter,
      ...(active?.filters?.length ? { filters: active.filters } : {}),
      visible: active?.visible ?? columns.map((c) => c.key),
    };
  };
  const failed = (error: Error) => flash(errorMessage(error));
  const updateActive = (
    patch: Parameters<typeof stored.update.mutate>[0]["patch"],
    done: string,
  ) => {
    if (!activeRecord) return;
    stored.update.mutate(
      { id: activeRecord.id, patch, lastSeen: activeRecord.updatedAt },
      { onSuccess: () => flash(done), onError: failed },
    );
  };
  const renameView = () => {
    if (!activeRecord) return;
    const name = window.prompt("Rename the view", activeRecord.name)?.trim();
    if (name && name !== activeRecord.name) updateActive({ name }, `Renamed to ${name}`);
  };
  const deleteView = () => {
    if (!activeRecord || !window.confirm(`Delete the view "${activeRecord.name}"?`)) return;
    stored.remove.mutate(activeRecord.id, {
      onSuccess: () => {
        if (defaultView) applyView(defaultView);
        flash(`${activeRecord.name} deleted`);
      },
      onError: failed,
    });
  };
  // A private view becomes my default; a shared one becomes the board default (PMO / admin).
  const canMakeDefault = boardKey
    ? Boolean(
        activeRecord &&
        activeRecord.id !== effectiveDefault &&
        (activeRecord.isShared ? stored.canManageShared : activeRecord.ownerId === stored.me),
      )
    : true;
  const makeDefault = () => {
    if (!boardKey) {
      setSaved((current) =>
        current.map((item) => ({ ...item, isDefault: item.id === activeView })),
      );
      return;
    }
    if (!activeRecord || !canMakeDefault) return;
    updateActive(
      { isDefault: true },
      activeRecord.isShared
        ? `${activeRecord.name} is now the default for everyone`
        : `${activeRecord.name} is now your default`,
    );
  };
  const isStarred = (item: SavedView) => (boardKey ? item.id === effectiveDefault : item.isDefault);
  const saveView = () => {
    if (boardKey) {
      const name = window.prompt("Name this view", `My view ${saved.length + 1}`)?.trim();
      if (!name) return;
      stored.create.mutate(
        { name, config: currentConfig() },
        {
          onSuccess: (written) => {
            setActiveView(written.id);
            flash(`${name} saved`);
          },
          onError: failed,
        },
      );
      return;
    }
    const name = `My view ${saved.length + 1}`;
    const id = `view-${Date.now()}`;
    setSaved((current) => [
      ...current,
      {
        id,
        name,
        type: view,
        groupBy,
        sortKey,
        filter,
        visible: columns.map((c) => c.key),
        isDefault: false,
      },
    ]);
    setActiveView(id);
    setNotice(`${name} saved`);
  };
  const applySaved = (id: string) => {
    const item = saved.find((entry) => entry.id === id);
    if (item) applyView(item);
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto" aria-label={`${title} views`}>
            {views.map(([name, Icon]) => (
              <Button
                key={name}
                size="sm"
                variant={view === name ? "secondary" : "ghost"}
                onClick={() => setView(name)}
                className="capitalize"
              >
                <Icon className="size-4" />
                {name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={saveView}>
              <Plus className="size-4" />
              Save view
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            {manage && canCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                New {itemLabel}
              </Button>
            )}
            {boardAutomations && (
              <Button size="sm" variant="outline" onClick={() => setAutomationOpen(true)}>
                <Sparkles className="size-4" />
                Automations
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card p-2 shadow-sm">
          <select
            aria-label="Saved views"
            value={activeView}
            onChange={(event) => applySaved(event.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            {saved.map((item) => (
              <option key={item.id} value={item.id}>
                {isStarred(item) ? "★ " : ""}
                {item.name}
                {item.record?.isShared ? " · shared" : ""}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            onClick={makeDefault}
            disabled={!canMakeDefault}
            title={
              boardKey && !activeRecord
                ? "Built-in views can't be a default: save a copy first"
                : undefined
            }
          >
            <Star
              className={cn(
                "size-4",
                saved.some((item) => item.id === activeView && isStarred(item)) &&
                  "fill-primary text-primary",
              )}
            />
            Default
          </Button>
          {boardKey && (
            <SavedViewMenu
              record={activeRecord}
              editable={editable}
              me={stored.me}
              onUpdate={() =>
                activeRecord &&
                updateActive({ config: currentConfig() }, `${activeRecord.name} updated`)
              }
              onRename={renameView}
              onToggleShare={() =>
                activeRecord &&
                updateActive(
                  // Sharing or unsharing drops a default: each scope has its own.
                  { isShared: !activeRecord.isShared, isDefault: false },
                  activeRecord.isShared
                    ? `${activeRecord.name} is private`
                    : `${activeRecord.name} is shared with the organisation`,
                )
              }
              onDelete={deleteView}
            />
          )}
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter items"
              className="h-8 w-40 pl-7 text-xs"
            />
          </div>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Group
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value)}
              className="h-8 rounded border bg-background px-2"
            >
              <option value="">None</option>
              {groupOptions.map((key) => (
                <option key={key} value={key}>
                  {columns.find((c) => c.key === key)?.label ?? key}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Sort
            <select
              value={parseSortKey(sortKey).key}
              onChange={(event) =>
                setSortKey(formatSortKey(event.target.value, parseSortKey(sortKey).direction))
              }
              className="h-8 rounded border bg-background px-2"
            >
              <option value="">None</option>
              {columns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
          {sortKey && (
            <button
              type="button"
              onClick={() => {
                const { key, direction } = parseSortKey(sortKey);
                setSortKey(formatSortKey(key, direction === "asc" ? "desc" : "asc"));
              }}
              className="h-8 rounded border bg-background px-2 text-xs"
              aria-label={
                parseSortKey(sortKey).direction === "asc"
                  ? "Ascending order: switch to descending"
                  : "Descending order: switch to ascending"
              }
              data-testid="board-sort-direction"
            >
              {parseSortKey(sortKey).direction === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>
          )}
          <ColumnsMenu
            columns={columns}
            isVisible={(key) =>
              saved.find((item) => item.id === activeView)?.visible.includes(key) ?? true
            }
            onToggle={(key) => setSaved((current) => toggleViewColumn(current, activeView, key))}
          />
          {notice && (
            <span className="text-xs font-semibold text-health-good-foreground">{notice}</span>
          )}
          {undo && (
            <span className="flex items-center gap-2 text-xs font-semibold">
              {undo.label}
              <Button size="sm" variant="outline" className="h-7" onClick={undoDelete}>
                <Undo2 className="size-3.5" />
                Undo
              </Button>
            </span>
          )}
        </div>
      </div>
      {selected.length > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-md bg-primary px-3 py-2 text-primary-foreground shadow-lg">
          <strong className="text-sm">{selected.length} selected</strong>
          {canDelete && (
            <Button size="sm" variant="secondary" onClick={() => deleteItems(selected)}>
              <Trash2 />
              Delete
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSelected([])}
            aria-label="Clear selection"
          >
            <X />
          </Button>
        </div>
      )}
      {view === "table" && (
        <TableView
          rows={shown}
          columns={visibleColumns}
          groups={groups}
          groupBy={groupBy}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          selected={selected}
          setSelected={setSelected}
          update={update}
          setOpenItem={openRow}
          setColumns={setColumns}
          renderTitle={renderTitle}
          titleAdornment={titleAdornment}
          rowEditable={rowEditable}
        />
      )}{" "}
      {view === "kanban" && (
        <Kanban
          rows={shown}
          groupBy={groupBy || "status"}
          locked={lockedGroups?.includes(groupBy || "status") ?? false}
          groups={groups}
          dragged={dragged}
          setDragged={setDragged}
          update={update}
          setOpenItem={openRow}
        />
      )}{" "}
      {view === "timeline" && <Timeline rows={shown} setOpenItem={openRow} />}{" "}
      {view === "calendar" && <CalendarView rows={shown} setOpenItem={openRow} />}{" "}
      {view === "chart" && (
        <Suspense
          fallback={
            <div
              className="h-[22rem] rounded-lg border border-border/70 bg-card"
              aria-busy="true"
              aria-label="Loading chart"
            />
          }
        >
          <ChartView rows={shown} groupBy={groupBy || "status"} />
        </Suspense>
      )}{" "}
      {planner && <p className="text-right text-xs text-muted-foreground">Synced with Planner</p>}
      {openItem && (
        <ItemPanel
          item={openItem}
          columns={columns}
          tab={panelTab}
          setTab={setPanelTab}
          close={() => setOpenItem(null)}
          manage={manage}
          edit={(field, value) => update(openItem.id, field, value)}
          {...(canDelete ? { onDelete: () => deleteItems([openItem.id]) } : {})}
          closed={isClosed(openItem)}
          onToggleClosed={() => setClosed(openItem, !isClosed(openItem))}
        />
      )}{" "}
      {creating && (
        <CreatePanel
          columns={columns}
          itemLabel={itemLabel}
          onCancel={() => setCreating(false)}
          onCreate={createItem}
        />
      )}{" "}
      {boardAutomations && automationOpen && (
        <AutomationPanel seeded={seededAutomations} close={() => setAutomationOpen(false)} />
      )}
    </section>
  );
}
/** Items shown in a day before "+N more". */
