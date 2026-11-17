/** A list fixed by the database schema (an enum), shown for reference. */
export function FixedList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs">
            {value}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Fixed: reports and health rules depend on these values.
      </p>
    </div>
  );
}
