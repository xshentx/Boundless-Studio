import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasClientSource = readFileSync(
  join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);

const storyCommitStart = canvasClientSource.indexOf("const orderedCreatedNodes");
const storyCommitEnd = canvasClientSource.indexOf("seedance2RewriteRunCache.delete", storyCommitStart);
assert.ok(storyCommitStart >= 0 && storyCommitEnd > storyCommitStart, "story placeholder commit block should be extractable");

const storyCommitSource = canvasClientSource.slice(storyCommitStart, storyCommitEnd);

assert.doesNotMatch(
  storyCommitSource,
  /createSeedance2SequentialPlaceholderRun/,
  "story placeholders must not commit one React update per shot",
);
assert.match(
  storyCommitSource,
  /const nodesToAppend = orderedCreatedNodes\.filter\(/,
  "the story branch should collect all new placeholders before committing",
);
assert.match(
  storyCommitSource,
  /const connectionsToAppend = run\.built\.createdConnections\.filter\(/,
  "the story branch should collect all matching connections before committing",
);
assert.equal(
  (storyCommitSource.match(/setNodes\(nextNodes\)/g) || []).length,
  1,
  "a bulk placeholder run should commit nodes once",
);
assert.equal(
  (storyCommitSource.match(/setConnections\(nextConnections\)/g) || []).length,
  1,
  "a bulk placeholder run should commit connections once",
);
assert.equal(
  (storyCommitSource.match(/persistCanvasSnapshot\(nextNodes, nextConnections\)/g) || []).length,
  1,
  "a bulk placeholder run should persist one snapshot",
);

console.log("seedance2 placeholder batch commit tests passed");
