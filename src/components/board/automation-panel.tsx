import { useState } from "react";
import { BellRing, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  benefitAutomationRecipes,
  dependencyAutomationRecipes,
  governanceAutomationRecipes,
} from "./automation-recipes";

interface Automation {
  id: string;
  sentence: string;
  enabled: boolean;
}
export function AutomationPanel({
  close,
  seeded,
}: {
  close: () => void;
  seeded?: string[] | undefined;
}) {
  const recipes = Array.from(
    new Set([
      "When status changes to Off Track, notify programme manager",
      "When a task is overdue by 3 days, notify assignee and project manager",
      "Every Monday at 9am, remind project managers to submit a status report",
      ...benefitAutomationRecipes,
      ...dependencyAutomationRecipes,
      ...governanceAutomationRecipes,
    ]),
  );
  const [items, setItems] = useState<Automation[]>(() => {
      const base = [
        "When status changes to Off Track, notify programme manager",
        "When a task is overdue by 3 days, notify assignee and project manager",
        "Every Monday at 9am, remind project managers to submit a status report",
      ].map((sentence, index) => ({ id: String(index), sentence, enabled: index < 2 }));
      return [
        ...base,
        ...(seeded ?? []).map((sentence, index) => ({
          id: `seeded-${index}`,
          sentence,
          enabled: true,
        })),
      ];
    }),
    [choice, setChoice] = useState(recipes[0] ?? "");
  return (
    <>
      <button className="fixed inset-0 z-40 bg-overlay" onClick={close} />
      <aside
        role="dialog"
        aria-label="Board automations"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Workflow centre</p>
            <h2 className="mt-2 text-2xl font-semibold">Automations</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={close}>
            <X />
          </Button>
        </div>
        <div className="mt-6 rounded-md border bg-accent/30 p-4">
          <p className="text-sm font-semibold">Build a recipe</p>
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="mt-3 h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {recipes.map((recipe) => (
              <option key={recipe}>{recipe}</option>
            ))}
          </select>
          <Button
            className="mt-3"
            onClick={() =>
              setItems((current) => [
                ...current,
                { id: String(Date.now()), sentence: choice, enabled: true },
              ])
            }
          >
            <Plus />
            Add automation
          </Button>
        </div>
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-md border p-4">
              <BellRing className="size-5 text-primary" />
              <p className="flex-1 text-sm">{item.sentence}</p>
              <Switch
                checked={item.enabled}
                onCheckedChange={(enabled) =>
                  setItems((current) =>
                    current.map((entry) => (entry.id === item.id ? { ...entry, enabled } : entry)),
                  )
                }
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  setItems((current) => current.filter((entry) => entry.id !== item.id))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
