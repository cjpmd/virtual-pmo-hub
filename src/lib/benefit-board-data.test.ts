import { describe, expect, it } from "vitest";
import { benefitColumnsFor, benefitInputFromBoard } from "./benefit-board-data";

const categories = [
  { id: "c1", label: "Cash-releasing efficiency", value: "cash_releasing_efficiency" },
  { id: "c2", label: "Beds freed", value: "bed_days_saved" },
  { id: "c3", label: "Research", value: "research" },
];
const settings = {
  categoryClassification: {
    cash_releasing_efficiency: "cash_releasing" as const,
    bed_days_saved: "non_cash_releasing" as const,
  },
};

describe("benefitColumnsFor (NHS-2)", () => {
  it("adds an editable Category column after Classification", () => {
    const columns = benefitColumnsFor(categories);
    const keys = columns.map((column) => column.key);
    expect(keys.indexOf("category")).toBe(keys.indexOf("classification") + 1);
    const category = columns.find((column) => column.key === "category");
    expect(category?.editable).toBe(true);
    expect(category?.options).toEqual(["Cash-releasing efficiency", "Beds freed", "Research"]);
  });
  it("is read-only without categories", () => {
    expect(benefitColumnsFor([]).find((column) => column.key === "category")?.editable).toBe(false);
  });
});

describe("benefitInputFromBoard category", () => {
  it("sets the category and its default classification", () => {
    expect(benefitInputFromBoard({ category: "Beds freed" }, [], categories, settings)).toEqual({
      categoryId: "c2",
      classification: "Non-cash-releasing",
    });
  });
  it("keeps a classification chosen in the same edit", () => {
    expect(
      benefitInputFromBoard(
        { category: "Cash-releasing efficiency", classification: "Societal" },
        [],
        categories,
        settings,
      ),
    ).toEqual({ categoryId: "c1", classification: "Societal" });
  });
  it("leaves the classification alone for an unmapped category", () => {
    expect(benefitInputFromBoard({ category: "Research" }, [], categories, settings)).toEqual({
      categoryId: "c3",
    });
  });
  it("refuses an unknown category", () => {
    expect(benefitInputFromBoard({ category: "Nope" }, [], categories, settings)).toBeUndefined();
  });
});
