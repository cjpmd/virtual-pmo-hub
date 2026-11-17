import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppSettings } from "@/data/settings-types";
import { useSettings } from "@/services/settings";
import { ListEditor, NumberField, SettingsCard } from "@/components/settings/settings-shell";
import { patch } from "./settings-helpers";
import { bandForScore, resizedLabels } from "./settings-logic";
import { FixedList } from "./fixed-list";

export function RiskSettings() {
  const settings = useSettings();
  const risk = settings.risk;
  const set = (value: Partial<AppSettings["risk"]>) => patch("risk", value);
  const lists = settings.lists;
  const resize = (size: 3 | 4 | 5) =>
    set({
      matrixSize: size,
      probabilityLabels: resizedLabels(risk.probabilityLabels, size),
      impactLabels: resizedLabels(risk.impactLabels, size),
    });
  const bandFor = (score: number) => bandForScore(risk.bands, score);
  return (
    <>
      <SettingsCard
        title="Risk matrix"
        description="Matrix size, axis labels and the score bands used on every heat map and register."
      >
        <div className="flex flex-wrap gap-2">
          {([3, 4, 5] as const).map((size) => (
            <Button
              key={size}
              size="sm"
              variant={risk.matrixSize === size ? "default" : "outline"}
              onClick={() => resize(size)}
            >
              {size} × {size}
            </Button>
          ))}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Probability labels</p>
              <div className="mt-2 space-y-2">
                {risk.probabilityLabels.map((label, index) => (
                  <Input
                    key={index}
                    value={label}
                    aria-label={`Probability ${index + 1}`}
                    onChange={(event) =>
                      set({
                        probabilityLabels: risk.probabilityLabels.map((item, position) =>
                          position === index ? event.target.value : item,
                        ),
                      })
                    }
                    className="h-9"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Impact labels</p>
              <div className="mt-2 space-y-2">
                {risk.impactLabels.map((label, index) => (
                  <Input
                    key={index}
                    value={label}
                    aria-label={`Impact ${index + 1}`}
                    onChange={(event) =>
                      set({
                        impactLabels: risk.impactLabels.map((item, position) =>
                          position === index ? event.target.value : item,
                        ),
                      })
                    }
                    className="h-9"
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Preview</p>
            <div
              className="mt-2 grid gap-1"
              style={{ gridTemplateColumns: `28px repeat(${risk.matrixSize}, minmax(0,1fr))` }}
            >
              {Array.from({ length: risk.matrixSize }, (_, row) => risk.matrixSize - row).map(
                (probability) => (
                  <div key={probability} className="contents">
                    <span className="grid place-items-center text-[10px] text-muted-foreground">
                      {probability}
                    </span>
                    {Array.from({ length: risk.matrixSize }, (_, column) => column + 1).map(
                      (impact) => {
                        const score = probability * impact;
                        return (
                          <span
                            key={impact}
                            title={`${risk.probabilityLabels[probability - 1]} × ${risk.impactLabels[impact - 1]} = ${score}`}
                            className="grid aspect-square place-items-center rounded text-[10px] font-bold text-white"
                            style={{ background: bandFor(score)?.colour ?? "var(--muted)" }}
                          >
                            {score}
                          </span>
                        );
                      },
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Score bands and appetite"
        description="Bands colour the heat map; anything at or above the appetite threshold is reported as outside appetite."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({
                bands: [
                  ...risk.bands,
                  { id: `band-${Date.now()}`, label: "New band", minScore: 1, colour: "#64748b" },
                ],
              })
            }
          >
            <Plus />
            Add band
          </Button>
        }
      >
        <div className="space-y-3">
          {risk.bands.map((band) => (
            <div key={band.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <input
                type="color"
                aria-label={`${band.label} colour`}
                value={band.colour}
                onChange={(event) =>
                  set({
                    bands: risk.bands.map((item) =>
                      item.id === band.id ? { ...item, colour: event.target.value } : item,
                    ),
                  })
                }
                className="h-8 w-12 cursor-pointer rounded border border-input"
              />
              <Input
                value={band.label}
                onChange={(event) =>
                  set({
                    bands: risk.bands.map((item) =>
                      item.id === band.id ? { ...item, label: event.target.value } : item,
                    ),
                  })
                }
                className="h-9 max-w-40"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Score from
                <Input
                  type="number"
                  value={band.minScore}
                  onChange={(event) =>
                    set({
                      bands: risk.bands.map((item) =>
                        item.id === band.id
                          ? { ...item, minScore: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                  className="h-9 w-20"
                />
              </label>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto"
                aria-label={`Remove ${band.label}`}
                onClick={() => set({ bands: risk.bands.filter((item) => item.id !== band.id) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 max-w-xs">
          <NumberField
            label="Risk appetite threshold"
            value={risk.appetiteThreshold}
            onChange={(value) => set({ appetiteThreshold: value })}
            hint="Risks scoring at or above this are reported to the board."
          />
        </div>
      </SettingsCard>

      <SettingsCard
        requires="pmo"
        title="RAIDD option lists"
        description="The controlled values offered on issues, decisions, dependencies and changes."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <FixedList label="Issue severity" values={lists.issueSeverities} />
          <div className="space-y-2">
            <p className="text-sm font-semibold">Decision forums</p>
            <Button asChild variant="outline">
              <Link to="/governance/forum" search={{}}>
                Governance › Boards
              </Link>
            </Button>
          </div>
          <FixedList label="Dependency types" values={lists.dependencyTypes} />
          <ListEditor
            label="Change types"
            values={lists.changeTypes}
            onChange={(values) => patch("lists", { changeTypes: values })}
          />
        </div>
      </SettingsCard>
    </>
  );
}
