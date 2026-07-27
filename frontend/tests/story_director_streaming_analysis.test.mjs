import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const workspaceSource = readFileSync(
  join(
    repoRoot,
    "src/app/canvas/workspace/canvas-client-page.tsx",
  ),
  "utf8",
);

const analyzeStart = workspaceSource.indexOf("const analyzeStoryDirector");
const analyzeEnd = workspaceSource.indexOf(
  "const generateStoryCharacters",
  analyzeStart,
);
assert.ok(
  analyzeStart >= 0 && analyzeEnd > analyzeStart,
  "story director analysis function should be extractable",
);

const analyzeSource = workspaceSource.slice(analyzeStart, analyzeEnd);
assert.equal(
  (analyzeSource.match(/stream:\s*true/g) || []).length,
  2,
  "both JSON-capable and fallback story analysis routes should use the working streaming text path",
);
assert.doesNotMatch(
  analyzeSource,
  /stream:\s*false/,
  "story analysis must not use the local account pool's hanging non-streaming path",
);
assert.match(
  analyzeSource,
  /raw\s*=\s*\(await requestStoryJson\(repairPrompt\)\)/,
  "JSON repair should reuse the same streaming request helper",
);

console.log("story director streaming analysis tests passed");
