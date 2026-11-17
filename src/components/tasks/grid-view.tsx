import { cn } from "@/lib/utils";
import type { Task } from "@/data/types";
import { type Row } from "./task-helpers";
import { type Actions } from "./task-actions";
import { TitleCell, Avatars, RowMenu, DotsMenu, Tick } from "./task-row-parts";

export function GridView({
  rows,
  tasks,
  a,
  selected,
  setSelected,
}: {
  rows: Row[];
  tasks: Task[];
  a: Actions;
  selected: string | null;
  setSelected: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70 bg-card shadow-sm">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {[
              "#",
              "",
              "Task",
              "Assignees",
              "Bucket",
              "Start",
              "Finish",
              "% Complete",
              "Depends on",
              "",
            ].map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const t = row.task;
            return (
              <RowMenu key={t.id} task={t} tasks={tasks} a={a}>
                <tr
                  tabIndex={0}
                  onClick={() => setSelected(t.id)}
                  onDoubleClick={() => a.open(t.id)}
                  className={cn(
                    "cursor-pointer border-t outline-none hover:bg-accent/30",
                    row.kids > 0 && "bg-muted/30",
                    selected === t.id && "bg-accent/50",
                  )}
                >
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-1">
                    <Tick task={t} a={a} />
                  </td>
                  <td className="max-w-[360px] px-3 py-2">
                    <TitleCell row={row} a={a} />
                  </td>
                  <td className="px-3">
                    <Avatars names={t.assignees} />
                  </td>
                  <td className="px-3 text-xs">{t.bucket}</td>
                  <td className="px-3 text-xs">{t.start}</td>
                  <td className="px-3 text-xs">{t.finish}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${t.percentComplete}%` }}
                        />
                      </div>
                      <span className="text-xs">{t.percentComplete}%</span>
                    </div>
                  </td>
                  <td className="px-3 text-xs text-muted-foreground">
                    {t.dependencies
                      .map((d) => rows.findIndex((x) => x.task.id === d) + 1)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-2">
                    <DotsMenu task={t} tasks={tasks} a={a} />
                  </td>
                </tr>
              </RowMenu>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="p-8 text-center text-sm text-muted-foreground">No tasks.</p>}
    </div>
  );
}
