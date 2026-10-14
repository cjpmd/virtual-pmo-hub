// Lints only the files changed on this branch, so new problems are not buried under old ones.
// Changed = committed since the merge base with the base branch, plus staged, unstaged and
// untracked files. Base: LINT_BASE (CI passes the pull request's base), else origin/main.
// `npm run lint:all` still lints everything.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const lines = (text) => text.split("\n").filter(Boolean);

const baseRef = process.env.LINT_BASE || "origin/main";
let base;
try {
  base = git("merge-base", "HEAD", baseRef);
} catch {
  console.error(`lint-changed: cannot find ${baseRef}; fetch it or set LINT_BASE.`);
  process.exit(2);
}

const files = new Set([
  ...lines(git("diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`)),
  ...lines(git("diff", "--name-only", "--diff-filter=ACMR", "HEAD")),
  ...lines(git("ls-files", "--others", "--exclude-standard")),
]);
const targets = [...files].filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f) && existsSync(f));

if (!targets.length) {
  console.log(`lint-changed: no changed source files since ${baseRef}.`);
  process.exit(0);
}
console.log(`lint-changed: ${targets.length} file(s) changed since ${baseRef}.`);
const result = spawnSync("npx", ["eslint", "--no-warn-ignored", ...targets], { stdio: "inherit" });
process.exit(result.status ?? 1);
