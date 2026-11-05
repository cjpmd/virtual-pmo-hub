// A small form generator over a block's zod config schema (spec §9.1): enum, number,
// boolean, multi-select (array of enum) and short text. Unknown field types are skipped.
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type FieldSpec =
  | { kind: "boolean"; key: string }
  | { kind: "number"; key: string; min?: number; max?: number }
  | { kind: "enum"; key: string; options: string[] }
  | { kind: "multi"; key: string; options: string[] }
  | { kind: "text"; key: string; max?: number };

type AnyZod = z.ZodTypeAny;

function unwrap(schema: AnyZod): AnyZod {
  let current = schema;
  for (;;) {
    if (current instanceof z.ZodDefault) current = current._def.innerType as AnyZod;
    else if (current instanceof z.ZodOptional || current instanceof z.ZodNullable)
      current = current._def.innerType as AnyZod;
    else if (current instanceof z.ZodEffects) current = current._def.schema as AnyZod;
    else return current;
  }
}

/** Field specs from a zod object schema (in declaration order). */
export function fieldsOf(schema: AnyZod): FieldSpec[] {
  const root = unwrap(schema);
  if (!(root instanceof z.ZodObject)) return [];
  const shape = root.shape as Record<string, AnyZod>;
  const fields: FieldSpec[] = [];
  for (const [key, raw] of Object.entries(shape)) {
    const field = unwrap(raw);
    if (field instanceof z.ZodBoolean) fields.push({ kind: "boolean", key });
    else if (field instanceof z.ZodNumber) {
      const spec: FieldSpec = { kind: "number", key };
      for (const check of field._def.checks) {
        if (check.kind === "min") spec.min = check.value;
        if (check.kind === "max") spec.max = check.value;
      }
      fields.push(spec);
    } else if (field instanceof z.ZodEnum)
      fields.push({ kind: "enum", key, options: [...field.options] as string[] });
    else if (field instanceof z.ZodArray) {
      const element = unwrap(field.element as AnyZod);
      if (element instanceof z.ZodEnum)
        fields.push({ kind: "multi", key, options: [...element.options] as string[] });
    } else if (field instanceof z.ZodString) {
      const spec: FieldSpec = { kind: "text", key };
      for (const check of field._def.checks) if (check.kind === "max") spec.max = check.value;
      fields.push(spec);
    }
  }
  return fields;
}

export const fieldLabel = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bpct\b/i, "%");
const optionLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function ConfigForm({
  schema,
  value,
  onChange,
  idPrefix,
}: {
  schema: AnyZod;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  idPrefix: string;
}) {
  const fields = fieldsOf(schema);
  if (!fields.length)
    return <p className="text-sm text-muted-foreground">This block has no settings.</p>;
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const current = value[field.key];
        switch (field.kind) {
          case "boolean":
            return (
              <div key={field.key} className="flex items-center justify-between gap-2">
                <Label htmlFor={id}>{fieldLabel(field.key)}</Label>
                <Switch
                  id={id}
                  checked={current === true}
                  onCheckedChange={(checked) => set(field.key, checked)}
                />
              </div>
            );
          case "number":
            return (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={id}>{fieldLabel(field.key)}</Label>
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={typeof current === "number" ? current : ""}
                  {...(field.min !== undefined && { min: field.min })}
                  {...(field.max !== undefined && { max: field.max })}
                  onChange={(event) => {
                    const n = Number(event.target.value);
                    if (event.target.value === "" || Number.isNaN(n)) return;
                    set(field.key, Math.min(field.max ?? n, Math.max(field.min ?? n, n)));
                  }}
                />
              </div>
            );
          case "enum":
            return (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={id}>{fieldLabel(field.key)}</Label>
                <select
                  id={id}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={typeof current === "string" ? current : field.options[0]}
                  onChange={(event) => set(field.key, event.target.value)}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {optionLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            );
          case "multi": {
            const selected = Array.isArray(current) ? (current as string[]) : [];
            return (
              <fieldset key={field.key} className="space-y-1">
                <legend className="text-sm font-medium">{fieldLabel(field.key)}</legend>
                {field.options.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selected.includes(option)}
                      onCheckedChange={(checked) =>
                        set(
                          field.key,
                          checked
                            ? [...selected, option]
                            : selected.filter((item) => item !== option),
                        )
                      }
                    />
                    {optionLabel(option)}
                  </label>
                ))}
              </fieldset>
            );
          }
          case "text":
            return (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={id}>{fieldLabel(field.key)}</Label>
                <Input
                  id={id}
                  value={typeof current === "string" ? current : ""}
                  {...(field.max !== undefined && { maxLength: field.max })}
                  onChange={(event) => set(field.key, event.target.value)}
                />
              </div>
            );
        }
      })}
    </div>
  );
}
