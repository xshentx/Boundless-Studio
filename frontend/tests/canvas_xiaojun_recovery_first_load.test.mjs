import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const pagePath = resolve(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx");
const source = readFileSync(pagePath, "utf8");

const recoveryBranchStart = source.indexOf("if (shouldLoadXiaojunTeacherRecovery(projectId, project))");
assert.ok(recoveryBranchStart >= 0, "xiaojun/teacher recovery branch should exist");
const recoveryBranchEnd = source.indexOf("if (!project)", recoveryBranchStart);
assert.ok(recoveryBranchEnd > recoveryBranchStart, "recovery branch should be before the missing-project fallback");
const recoveryBranch = source.slice(recoveryBranchStart, recoveryBranchEnd);

assert.match(
  source,
  /const\s+restoreProjectState\s*=\s*async\s*\(\s*targetProject:\s*CanvasProject\s*\)/,
  "workspace should expose one restoreProjectState helper for normal and recovered projects",
);
assert.match(
  recoveryBranch,
  /then\(async\s*\(recoveredProject\)\s*=>/,
  "recovery load should use an async callback so it can restore immediately after storage replacement",
);
assert.match(
  recoveryBranch,
  /replaceProjects\([\s\S]*?\);[\s\S]*?await\s+restoreProjectState\(recoveredProject\);/,
  "first-load recovery should restore the recovered project into the live canvas before returning",
);
assert.match(
  source,
  /void\s+restoreProjectState\(project\);/,
  "normal project loading should use the same restoreProjectState helper",
);

console.log("xiaojun teacher first-load recovery test passed");
