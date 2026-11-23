// NHS-2: a measure's unit (presets from Settings › Lists › Measure units, free text allowed) and
// its optional notional £ value per unit, always labelled notional and non-cash.
import { useId, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Fact } from "@/components/pmo-ui";
import { useBenefitMutations } from "@/hooks/use-benefits";
import { useOrgWritable } from "@/hooks/use-org-access";
import { notionalValue } from "@/lib/benefit-classification";
import { displayUnit, formatCurrency } from "@/lib/format";
import { useSettings } from "@/services/settings";
import type { MeasureView } from "@/services/benefits";

/** The latest validated actual, for the notional value shown beside the factor. */
const latestValidated = (measure: MeasureView) =>
  [...measure.records].reverse().find((record) => record.status === "Validated");

export function MeasureUnitFacts({ measure, canEdit }: { measure: MeasureView; canEdit: boolean }) {
  // GL-5: no edits while the organisation is read-only.
  const writable = useOrgWritable();
  const latest = latestValidated(measure);
  const notional = latest ? notionalValue(latest.actualValue, measure.notionalUnitValue) : null;
  return (
    <>
      <div className="flex items-start gap-2">
        <Fact label="Unit" value={displayUnit(measure.unit) || "Not set"} />
        {canEdit && writable && <MeasureUnitEditor measure={measure} />}
      </div>
      <Fact
        label="Notional value per unit (non-cash)"
        value={
          measure.notionalUnitValue === null
            ? "Not set"
            : `${formatCurrency(measure.notionalUnitValue)}${notional !== null ? ` · latest actual ${formatCurrency(notional)} notional` : ""}`
        }
      />
    </>
  );
}

function MeasureUnitEditor({ measure }: { measure: MeasureView }) {
  const presets = useSettings().lists.measureUnits;
  const { updateMeasureUnit } = useBenefitMutations();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState(measure.unit);
  const [value, setValue] = useState(
    measure.notionalUnitValue === null ? "" : String(measure.notionalUnitValue),
  );
  const id = useId();
  const save = () => {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && !(Number.isFinite(parsed) && parsed >= 0)) {
      toast.error("Enter the notional value as zero or more, or leave it blank.");
      return;
    }
    updateMeasureUnit.mutate(
      { id: measure.id, input: { unit, notionalUnitValue: parsed }, lastSeen: measure.updatedAt },
      {
        onSuccess: () => {
          toast.success("Measure saved");
          setOpen(false);
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUnit(measure.unit);
          setValue(measure.notionalUnitValue === null ? "" : String(measure.notionalUnitValue));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit the unit of ${measure.name}`}>
          <Pencil />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-unit`}>Unit</Label>
          <Input
            id={`${id}-unit`}
            list={`${id}-presets`}
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="For example, bed days"
          />
          <datalist id={`${id}-presets`}>
            {presets.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-notional`}>Notional value per unit (£)</Label>
          <Input
            id={`${id}-notional`}
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Optional"
          />
          <p className="text-xs text-muted-foreground">
            Notional and non-cash: shown beside the measure, never added to cash-releasing savings.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={updateMeasureUnit.isPending}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
