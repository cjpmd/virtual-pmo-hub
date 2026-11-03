// The database withholds partner-unsafe blocks from partners (private.partner_unsafe_blocks in
// the Phase 3 migration); the registry marks them partnerSafe: false. They must agree.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import "./catalogue";
import { listBlocks } from "./registry";

describe("partner safety", () => {
  it("SQL and the block registry list the same partner-unsafe blocks", () => {
    const sql = readFileSync(
      "supabase/migrations/20261103160000_rb3_governance_snapshots.sql",
      "utf8",
    );
    const match = /partner_unsafe_blocks\(\)[\s\S]*?select array\[([^\]]*)\]/.exec(sql);
    const fromSql = (match?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .filter(Boolean)
      .sort();
    const fromTs = listBlocks()
      .filter((b) => !b.partnerSafe && !b.key.startsWith("test_"))
      .map((b) => b.key)
      .sort();
    expect(fromSql).toEqual(fromTs);
  });
});
