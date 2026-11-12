// The board's Chart view (GL-18: split out of board-workspace.tsx so recharts loads only when a
// board switches to Chart). Counts the shown rows per value of the group-by field.
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BoardRow } from "./board-workspace";

export function BoardChartView({ rows, groupBy }: { rows: BoardRow[]; groupBy: string }) {
  const data = Array.from(new Set(rows.map((row) => String(row[groupBy] ?? "Unassigned")))).map(
    (name) => ({
      name,
      value: rows.filter((row) => String(row[groupBy] ?? "Unassigned") === name).length,
    }),
  );
  return (
    <div className="grid gap-5 rounded-lg border border-border/70 bg-card p-5 lg:grid-cols-2">
      <div className="h-80">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <ChartTooltip />
            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="h-80">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={65} outerRadius={105}>
              {data.map((_, index) => (
                <Cell key={index} fill={`var(--chart-${(index % 5) + 1})`} />
              ))}
            </Pie>
            <ChartTooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
