import { type ReactNode } from "react";
import { Columns3, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedViewRecord } from "@/services/saved-views";
import type { BoardColumn } from "./types";

function ViewMenuItem({
  onClick,
  destructive = false,
  children,
}: {
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
      className={cn(
        "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
        destructive && "text-health-bad-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The saved-view menu: update, rename, share and delete the active saved view. */
export function SavedViewMenu({
  record,
  editable,
  me,
  onUpdate,
  onRename,
  onToggleShare,
  onDelete,
}: {
  /** The active saved view; undefined for a built-in (seeded) view. */
  record: SavedViewRecord | undefined;
  editable: boolean;
  me: string | null | undefined;
  onUpdate: () => void;
  onRename: () => void;
  onToggleShare: () => void;
  onDelete: () => void;
}) {
  return (
    <details className="relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded px-2 text-xs hover:bg-accent">
        <Settings2 className="size-4" />
        View
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-60 rounded-md border bg-popover p-1 shadow-lg">
        {!record ? (
          <p className="p-2 text-xs text-muted-foreground">
            A built-in view. Save view keeps your own copy.
          </p>
        ) : (
          <>
            {editable && (
              <ViewMenuItem onClick={onUpdate}>Update with current settings</ViewMenuItem>
            )}
            {editable && <ViewMenuItem onClick={onRename}>Rename</ViewMenuItem>}
            {record.ownerId === me && !(record.isShared && record.isDefault) && (
              <ViewMenuItem onClick={onToggleShare}>
                {record.isShared ? "Stop sharing" : "Share with organisation"}
              </ViewMenuItem>
            )}
            {editable && (
              <ViewMenuItem destructive onClick={onDelete}>
                Delete view
              </ViewMenuItem>
            )}
            {!editable && (
              <p className="p-2 text-xs text-muted-foreground">
                {record.isShared && record.isDefault
                  ? "The default for everyone: only PMO and admins can change it."
                  : "Shared by someone else. Save view keeps your own copy."}
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}

/** The Columns menu: show or hide each column in the active view. */
export function ColumnsMenu({
  columns,
  isVisible,
  onToggle,
}: {
  columns: BoardColumn[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <details className="relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded px-2 text-xs hover:bg-accent">
        <Columns3 className="size-4" />
        Columns
      </summary>
      <div className="absolute right-0 z-30 mt-1 max-h-80 w-52 overflow-y-auto rounded-md border bg-popover p-2 shadow-lg">
        {columns.map((column) => (
          <label key={column.key} className="flex items-center gap-2 p-2 text-xs">
            <input
              type="checkbox"
              checked={isVisible(column.key)}
              onChange={() => onToggle(column.key)}
            />
            {column.label}
          </label>
        ))}
      </div>
    </details>
  );
}
