import {
  ArrowLeftToLine,
  ArrowRightToLine,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Circle,
  ClipboardPaste,
  Copy,
  Diamond,
  Link2,
  ListPlus,
  MoreHorizontal,
  PanelRightOpen,
  Scissors,
  Trash2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Task } from "@/data/types";
import { initials, wouldLoop, type Row } from "./task-helpers";
import { type Actions } from "./task-actions";

export function TitleCell({ row, a, className }: { row: Row; a: Actions; className?: string }) {
  const t = row.task,
    done = t.percentComplete === 100;
  return (
    <div
      className={cn("flex min-w-0 items-center gap-1", className)}
      style={{ paddingLeft: row.depth * 20 }}
    >
      {row.kids ? (
        <button
          aria-label={a.collapsed.has(t.id) ? "Expand subtasks" : "Collapse subtasks"}
          onClick={(e) => {
            e.stopPropagation();
            a.toggleCollapse(t.id);
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          {a.collapsed.has(t.id) ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
      ) : row.depth ? (
        <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/60" />
      ) : (
        <span className="w-4" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          a.open(t.id);
        }}
        className={cn(
          "flex min-w-0 items-center gap-1.5 truncate text-left hover:text-primary",
          row.kids ? "font-semibold" : "font-medium",
          done && "text-muted-foreground line-through",
        )}
      >
        {t.isMilestone && <Diamond className="size-3.5 shrink-0 fill-primary text-primary" />}
        <span className="truncate">{t.title}</span>
        {row.kids > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({row.kids})</span>
        )}
      </button>
    </div>
  );
}

export function Avatars({ names }: { names: string[] }) {
  return (
    <div className="flex -space-x-1.5">
      {names.slice(0, 2).map((n) => (
        <span
          key={n}
          title={n}
          className="grid size-6 place-items-center rounded-full border-2 border-card bg-primary/15 text-[9px] font-semibold text-primary"
        >
          {initials(n)}
        </span>
      ))}
      {names.length > 2 && (
        <span className="grid size-6 place-items-center rounded-full border-2 border-card bg-muted text-[9px]">
          +{names.length - 2}
        </span>
      )}
    </div>
  );
}

export function MenuItems({
  task,
  tasks,
  a,
  kind,
}: {
  task: Task;
  tasks: Task[];
  a: Actions;
  kind: "context" | "dropdown";
}) {
  const I = kind === "context" ? ContextMenuItem : DropdownMenuItem,
    S = kind === "context" ? ContextMenuSeparator : DropdownMenuSeparator,
    Sub = kind === "context" ? ContextMenuSub : DropdownMenuSub,
    ST = kind === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger,
    SC = kind === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const candidates = tasks.filter(
    (t) =>
      t.id !== task.id && !task.dependencies.includes(t.id) && !wouldLoop(tasks, task.id, t.id),
  );
  return (
    <>
      <I onSelect={() => a.open(task.id)}>
        <PanelRightOpen />
        Open details
      </I>
      <S />
      <I onSelect={() => a.cut(task.id)}>
        <Scissors />
        Cut task
      </I>
      <I onSelect={() => a.copy(task.id)}>
        <Copy />
        Copy task
      </I>
      <I disabled={!a.canPaste} onSelect={() => a.paste(task.id)}>
        <ClipboardPaste />
        Paste task
      </I>
      <I onSelect={() => a.insertAbove(task.id)}>
        <ListPlus />
        Insert task above
      </I>
      <I onSelect={() => a.addSub(task.id)} disabled={!!task.parentId}>
        <CornerDownRight />
        Add subtask
      </I>
      {task.parentId ? (
        <I onSelect={() => a.promote(task.id)}>
          <ArrowLeftToLine />
          Promote to main task
        </I>
      ) : (
        <I disabled={!a.canDemote(task.id)} onSelect={() => a.demote(task.id)}>
          <ArrowRightToLine />
          Make subtask
        </I>
      )}
      <I onSelect={() => a.remove(task.id)} className="text-destructive">
        <Trash2 />
        Delete task
      </I>
      <S />
      <I onSelect={() => a.link(task.id)}>
        <Link2 />
        Copy link to task
      </I>
      <Sub>
        <ST>
          <Link2 className="mr-2 size-4" />
          Add dependency
        </ST>
        <SC className="max-h-72 overflow-y-auto">
          {candidates.map((t) => (
            <I key={t.id} onSelect={() => a.addDep(task.id, t.id)}>
              {t.title}
            </I>
          ))}
          {!candidates.length && <I disabled>No tasks available</I>}
        </SC>
      </Sub>
      <Sub>
        <ST>
          <Unlink className="mr-2 size-4" />
          Remove dependency
        </ST>
        <SC>
          {task.dependencies.map((d) => (
            <I key={d} onSelect={() => a.removeDep(task.id, d)}>
              {tasks.find((t) => t.id === d)?.title ?? d}
            </I>
          ))}
          {!task.dependencies.length && <I disabled>No dependencies</I>}
        </SC>
      </Sub>
      <S />
      <I onSelect={() => a.toggle(task.id)}>
        <CheckCircle2 />
        {task.percentComplete === 100 ? "Mark as incomplete" : "Mark as complete"}
      </I>
    </>
  );
}

export function RowMenu({
  task,
  tasks,
  a,
  children,
}: {
  task: Task;
  tasks: Task[];
  a: Actions;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <MenuItems task={task} tasks={tasks} a={a} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}
export function DotsMenu({ task, tasks, a }: { task: Task; tasks: Task[]; a: Actions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={`Actions for ${task.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <MenuItems task={task} tasks={tasks} a={a} kind="dropdown" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function Tick({ task, a }: { task: Task; a: Actions }) {
  const done = task.percentComplete === 100;
  return (
    <button
      aria-label={done ? "Mark as incomplete" : "Mark as complete"}
      onClick={(e) => {
        e.stopPropagation();
        a.toggle(task.id);
      }}
      className="text-primary"
    >
      {done ? (
        <CheckCircle2 className="size-5 fill-primary text-primary-foreground" />
      ) : (
        <Circle className="size-5 text-muted-foreground" />
      )}
    </button>
  );
}
