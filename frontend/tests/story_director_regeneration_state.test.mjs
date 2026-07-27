import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `unable to extract ${startMarker}`);
  return source.slice(start, end);
}

const analyzeSource = sourceBetween(
  "const analyzeStoryDirector = useCallback(",
  "const generateStoryCharacters = useCallback(",
);
assert.equal(
  (analyzeSource.match(/applyPersistedNodes\(\(prev\) =>/g) || []).length,
  3,
  "analysis loading, success, and failure transitions must update nodesRef synchronously",
);
assert.equal(
  (analyzeSource.match(/setNodes\(\(prev\) =>/g) || []).length,
  1,
  "only transient streaming text should use a non-persisted React state update",
);
assert.match(
  analyzeSource,
  /storyAnalysisStatus: NODE_STATUS_SUCCESS,[\s\S]*?return analysis;/,
  "successful analysis must settle before the one-click flow starts image generation",
);

for (const [startMarker, endMarker, label] of [
  ["const generateStoryCharacters = useCallback(", "const generateStoryShots = useCallback(", "character regeneration"],
  ["const generateStoryShots = useCallback(", "const runStoryDirectorAll = useCallback(", "shot regeneration"],
]) {
  const generationSource = sourceBetween(startMarker, endMarker);
  assert.match(
    generationSource,
    /storyAnalysisStatus: NODE_STATUS_SUCCESS,\s*storyGenerationStatus: NODE_STATUS_LOADING/,
    `${label} must repair a stale analysis loading flag before starting`,
  );
  assert.match(
    generationSource,
    /storyGenerationStatus: NODE_STATUS_ERROR,[\s\S]*?finally \{\s*setRunningNodeId\(null\);/,
    `${label} failure must settle the generation state and release the running lock`,
  );
}

const recoverySource = sourceBetween(
  "function recoverInterruptedStoryDirector(",
  "function clearCanvasGenerationTrace(",
);
assert.match(
  recoverySource,
  /metadata\.storyAnalysisStatus === NODE_STATUS_LOADING\s*\? "idle"/,
  "restoring a project must clear an interrupted analysis status",
);
assert.match(
  recoverySource,
  /metadata\.storyGenerationStatus === NODE_STATUS_LOADING\s*\? "idle"/,
  "restoring a project must clear an interrupted generation status",
);

console.log("story director regeneration state recovery tests passed");
