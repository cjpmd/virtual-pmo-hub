import { describe, expect, it } from "vitest";
import { decisionActionsFor, recordArgs } from "./decisions";

const base = {
  id: "d1",
  optionId: "o1",
  rationale: " Cheapest ",
  decisionDate: "2026-10-15",
  lastSeen: "t",
};

describe("decision lifecycle actions", () => {
  it("Pending allows record, defer, withdraw and edit only", () => {
    expect(decisionActionsFor({ status: "Pending" })).toEqual({
      edit: true,
      record: true,
      defer: true,
      withdraw: true,
      supersede: false,
      reverse: false,
    });
  });
  it("Made allows supersede and reverse", () => {
    const actions = decisionActionsFor({ status: "Made" });
    expect([actions.supersede, actions.reverse, actions.edit]).toEqual([true, true, false]);
  });
  it("Made with a proposed replacement hides supersede", () => {
    expect(decisionActionsFor({ status: "Made", pendingSuccessorRef: "DEC-020" }).supersede).toBe(
      false,
    );
  });
  it.each(["Superseded", "Reversed", "Withdrawn"] as const)("%s is read-only", (status) => {
    expect(Object.values(decisionActionsFor({ status })).some(Boolean)).toBe(false);
  });
});

describe("record_decision arguments", () => {
  it("requires a rationale", () => {
    expect(() => recordArgs({ ...base, rationale: "  " })).toThrow();
  });
  it("refuses both a person and a forum as decider", () => {
    expect(() =>
      recordArgs({ ...base, decidedByResourceId: "r", decidedByForumId: "f" }),
    ).toThrow();
  });
  it("sends the forum decider and drops blank actions", () => {
    const args = recordArgs({
      ...base,
      decidedByForumId: "f1",
      actions: [{ description: "Tell suppliers", ownerId: "r1" }, { description: " " }],
    });
    expect(args.p_decided_by_forum_id).toBe("f1");
    expect("p_decided_by_resource_id" in args).toBe(false);
    expect(args.p_rationale).toBe("Cheapest");
    expect(args.p_actions).toEqual([{ description: "Tell suppliers", owner_id: "r1" }]);
  });
});
