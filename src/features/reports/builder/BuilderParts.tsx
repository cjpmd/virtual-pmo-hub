// Builder pieces (spec §9.1): block library, the two-zone canvas (report-level and project
// deep-dives) with drag and drop (@dnd-kit), and the inspector.
import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import "../blocks/catalogue";
import {
  CATEGORY_LABEL,
  getBlock,
  listBlocks,
  newInstance,
  resolveConfig,
} from "../blocks/registry";
import type { AnyBlockDefinition, BlockCategory, BlockInstance, ScopeLevel } from "../blocks/types";
import {
  BlockFrame,
  UnavailableBlock,
  blockTitle,
  type DocumentProps,
} from "../viewer/ReportDocument";
import { ConfigForm } from "./ConfigForm";

const LIB_PREFIX = "lib:";
const ZONES = { report: "zone:report", deep_dive: "zone:deep_dive" } as const;

const supports = (definition: AnyBlockDefinition, scope: ScopeLevel | "any") =>
  scope === "any" || definition.supportedScopes.includes(scope);

// ---------------------------------------------------------------- library
function LibraryItem({ definition, onAdd }: { definition: AnyBlockDefinition; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${LIB_PREFIX}${definition.key}`,
  });
  return (
    <li
      ref={setNodeRef}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-muted",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 text-left"
        title={definition.description}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{definition.name}</span>
        {definition.perEntity && (
          <span
            className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
            title="Can repeat per deep-dive project"
          >
            DD
          </span>
        )}
      </button>
      <Button
        size="icon"
        variant="ghost"
        className="size-6 shrink-0"
        aria-label={`Add ${definition.name}`}
        onClick={onAdd}
      >
        <Plus className="size-3.5" />
      </Button>
    </li>
  );
}

export function BlockLibrary({
  scope,
  onAdd,
}: {
  scope: ScopeLevel | "any";
  onAdd: (definition: AnyBlockDefinition) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byCategory = new Map<BlockCategory, AnyBlockDefinition[]>();
    for (const definition of listBlocks()) {
      if (!supports(definition, scope)) continue;
      if (q && !`${definition.name} ${definition.description}`.toLowerCase().includes(q)) continue;
      byCategory.set(definition.category, [
        ...(byCategory.get(definition.category) ?? []),
        definition,
      ]);
    }
    return [...byCategory.entries()].sort((a, b) =>
      CATEGORY_LABEL[a[0]].localeCompare(CATEGORY_LABEL[b[0]]),
    );
  }, [query, scope]);
  return (
    <div className="space-y-3">
      <Input
        placeholder="Search blocks"
        aria-label="Search blocks"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {groups.map(([category, definitions]) => (
        <details key={category} open className="space-y-1">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABEL[category]}
          </summary>
          <ul className="space-y-0.5">
            {definitions.map((definition) => (
              <LibraryItem
                key={definition.key}
                definition={definition}
                onAdd={() => onAdd(definition)}
              />
            ))}
          </ul>
        </details>
      ))}
      {!groups.length && <p className="text-sm text-muted-foreground">No blocks match.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- canvas
function SortableBlock({
  instance,
  selected,
  onSelect,
  onMove,
  onRemove,
  children,
}: {
  instance: BlockInstance;
  selected: boolean;
  onSelect: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-background",
        selected && "ring-2 ring-primary",
        isDragging && "z-10 opacity-70 shadow-lg",
      )}
      data-instance={instance.id}
    >
      <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
        <button
          type="button"
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={`Drag ${blockTitle(instance)}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
          onClick={onSelect}
        >
          {blockTitle(instance)}
          {instance.pageBreakBefore && (
            <span className="ml-2 text-[10px] text-muted-foreground">page break</span>
          )}
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Move up"
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Move down"
          onClick={() => onMove(1)}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={`Remove ${blockTitle(instance)}`}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="max-h-[28rem] overflow-auto p-2" onClick={onSelect}>
        {children}
      </div>
    </li>
  );
}

function Zone({
  id,
  title,
  hint,
  children,
  empty,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
  empty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={cn(
        "rounded-xl border-2 border-dashed p-3",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <ul className="space-y-3">{children}</ul>
      {empty && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Drag blocks here, or use + in the library.
        </p>
      )}
    </section>
  );
}

export interface CanvasProps {
  blocks: BlockInstance[];
  onChange: (blocks: BlockInstance[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Preview rendering (live input, scheme …); null = no data preview (no sample scope). */
  preview: Omit<DocumentProps, "blocks" | "deepDives"> | null;
  /** Project used to preview deep-dive blocks. */
  sampleProjectId: string | null;
  library: ReactNode;
  libraryScope: ScopeLevel | "any";
}

/** Library + canvas share one DndContext so blocks can be dragged from the library. */
export function BuilderCanvas({
  blocks,
  onChange,
  selectedId,
  onSelect,
  preview,
  sampleProjectId,
  library,
}: CanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const zoneOf = (id: string): BlockInstance["placement"] | null => {
    if (id === ZONES.report) return "report";
    if (id === ZONES.deep_dive) return "deep_dive";
    return blocks.find((b) => b.id === id)?.placement ?? null;
  };
  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;
    const zone = zoneOf(overId);
    if (!zone) return;
    if (activeId.startsWith(LIB_PREFIX)) {
      const definition = getBlock(activeId.slice(LIB_PREFIX.length));
      if (!definition) return;
      const placement = zone === "deep_dive" && definition.perEntity ? "deep_dive" : "report";
      const instance = newInstance(
        definition,
        placement,
        blocks.map((b) => b.id),
      );
      const index = blocks.findIndex((b) => b.id === overId);
      const next = [...blocks];
      next.splice(index === -1 ? next.length : index, 0, instance);
      onChange(next);
      onSelect(instance.id);
      return;
    }
    const from = blocks.findIndex((b) => b.id === activeId);
    if (from === -1) return;
    const moving = blocks[from]!;
    const definition = getBlock(moving.blockKey);
    const placement = zone === "deep_dive" && !definition?.perEntity ? moving.placement : zone;
    let next = blocks.map((b) => (b.id === activeId ? { ...b, placement } : b));
    const to = blocks.findIndex((b) => b.id === overId);
    if (to !== -1 && to !== from) next = arrayMove(next, from, to);
    onChange(next);
  };
  const move = (id: string, delta: -1 | 1) => {
    const index = blocks.findIndex((b) => b.id === id);
    const zone = blocks[index]?.placement;
    let target = index + delta;
    while (target >= 0 && target < blocks.length && blocks[target]?.placement !== zone)
      target += delta;
    if (target < 0 || target >= blocks.length) return;
    onChange(arrayMove(blocks, index, target));
  };
  const remove = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
    if (selectedId === id) onSelect(null);
  };
  const renderZone = (placement: BlockInstance["placement"]) => {
    const items = blocks.filter((b) => b.placement === placement);
    return (
      <SortableContext items={items.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {items.map((instance) => (
          <SortableBlock
            key={instance.id}
            instance={instance}
            selected={selectedId === instance.id}
            onSelect={() => onSelect(instance.id)}
            onMove={(delta) => move(instance.id, delta)}
            onRemove={() => remove(instance.id)}
          >
            {!getBlock(instance.blockKey) ? (
              <UnavailableBlock blockKey={instance.blockKey} />
            ) : preview && (placement === "report" || sampleProjectId) ? (
              <BlockFrame
                instance={instance}
                entityId={placement === "deep_dive" ? sampleProjectId : null}
                props={{ ...preview, blocks, deepDives: [] }}
              />
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                {placement === "deep_dive"
                  ? "Repeats for each deep-dive project. Pick a sample scope to preview."
                  : getBlock(instance.blockKey)?.description}
              </p>
            )}
          </SortableBlock>
        ))}
      </SortableContext>
    );
  };
  const reportItems = blocks.filter((b) => b.placement === "report");
  const deepItems = blocks.filter((b) => b.placement === "deep_dive");
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          aria-label="Block library"
          className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-auto"
        >
          {library}
        </aside>
        <div className="min-w-0 space-y-4">
          <Zone
            id={ZONES.report}
            title="Report-level blocks"
            hint="Shown once, in this order."
            empty={!reportItems.length}
          >
            {renderZone("report")}
          </Zone>
          <Zone
            id={ZONES.deep_dive}
            title="Project deep-dives"
            hint="Repeated for each project selected by the rules or pinned (blocks marked DD)."
            empty={!deepItems.length}
          >
            {renderZone("deep_dive")}
          </Zone>
        </div>
      </div>
    </DndContext>
  );
}

// ---------------------------------------------------------------- inspector
export function BlockInspector({
  instance,
  onChange,
  onRemove,
}: {
  instance: BlockInstance;
  onChange: (next: BlockInstance) => void;
  onRemove: () => void;
}) {
  const definition = getBlock(instance.blockKey);
  if (!definition)
    return (
      <div className="space-y-2">
        <UnavailableBlock blockKey={instance.blockKey} />
        <Button variant="outline" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
    );
  const config = resolveConfig(definition, instance) as Record<string, unknown>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {definition.name}
        </p>
        <p className="text-xs text-muted-foreground">{definition.description}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`title-${instance.id}`}>Title</Label>
        <Input
          id={`title-${instance.id}`}
          placeholder={definition.name}
          value={instance.title ?? ""}
          maxLength={120}
          onChange={(event) => {
            const { title: _old, ...rest } = instance;
            onChange(event.target.value ? { ...rest, title: event.target.value } : rest);
          }}
        />
      </div>
      <ConfigForm
        schema={definition.configSchema}
        value={config}
        idPrefix={instance.id}
        onChange={(next) =>
          onChange({ ...instance, config: next, blockVersion: definition.version })
        }
      />
      {definition.perEntity && (
        <div className="space-y-1">
          <Label htmlFor={`placement-${instance.id}`}>Placement</Label>
          <select
            id={`placement-${instance.id}`}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={instance.placement}
            onChange={(event) =>
              onChange({ ...instance, placement: event.target.value as BlockInstance["placement"] })
            }
          >
            <option value="report">Report-level (once)</option>
            <option value="deep_dive">Per deep-dive project</option>
          </select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={!!instance.pageBreakBefore}
          onCheckedChange={(checked) =>
            onChange({ ...instance, pageBreakBefore: checked === true })
          }
        />
        Page break before
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={!!instance.hideFromPartners || !definition.partnerSafe}
          disabled={!definition.partnerSafe}
          onCheckedChange={(checked) =>
            onChange({ ...instance, hideFromPartners: checked === true })
          }
        />
        Hide from partners
        {!definition.partnerSafe && " (always, this block names people or data quality)"}
      </label>
      <Button variant="outline" size="sm" onClick={onRemove}>
        <Trash2 className="mr-1 size-3.5" /> Remove block
      </Button>
    </div>
  );
}
