// The database withholds partner-unsafe blocks from partners (private.partner_unsafe_blocks, last
// defined in the NHS-1 part 2 migration); the registry marks them partnerSafe: false. They must agree.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import "./catalogue";
import { listBlocks } from "./registry";

describe("partner safety", () => {
  it("SQL and the block registry list the same partner-unsafe blocks", () => {
    // The latest migration that (re)defines the function is the live list.
    const file = readdirSync("supabase/migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) =>
        /function private\.partner_unsafe_blocks\(\)/.test(
          readFileSync(`supabase/migrations/${name}`, "utf8"),
        ),
      )
      .at(-1);
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
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
