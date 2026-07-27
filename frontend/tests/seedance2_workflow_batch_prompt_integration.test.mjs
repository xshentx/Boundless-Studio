import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasRoot = join(repoRoot, "src/app/canvas");
const canvasClientSource = readFileSync(join(canvasRoot, "workspace/canvas-client-page.tsx"), "utf8");
const typesSource = readFileSync(join(canvasRoot, "types.ts"), "utf8");

const panelStart = canvasClientSource.indexOf("function Seedance2WorkflowPanel");
const pageStart = canvasClientSource.indexOf("function InfiniteCanvasPage", panelStart);
assert.ok(panelStart >= 0 && pageStart > panelStart);
const panelSource = canvasClientSource.slice(panelStart, pageStart);

const handlerStart = canvasClientSource.indexOf("const rebuildSeedance2Placeholders");
const handlerEnd = canvasClientSource.indexOf("const deleteNodes", handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
const handlerSource = canvasClientSource.slice(handlerStart, handlerEnd);
const fallbackStart = handlerSource.indexOf("const existingPlaceholderIds");
assert.ok(fallbackStart > 0, "the non-story placeholder fallback should remain available");
const storyBranchSource = handlerSource.slice(0, fallbackStart);

assert.doesNotMatch(
  handlerSource.slice(0, fallbackStart),
  /meta\.seedanceWorkflowMode\s*===\s*"slice"/,
  "Story Director rewrite should not depend on legacy workflow mode metadata",
);

assert.match(
  canvasClientSource,
  /rewriteSeedance2BatchPrompts/,
  "canvas should import the single-request Seedance2 rewrite orchestrator",
);
assert.match(
  canvasClientSource,
  /collectSeedance2StoryRewriteInput/,
  "canvas should collect the current full story, storyboard prompts and template",
);
assert.match(
  canvasClientSource,
  /buildVersionedStoryDirectorSlicePlaceholders/,
  "canvas should import the append-only version builder",
);
assert.match(handlerSource, /useCallback\(\s*async\s*\(workflowNode/);
assert.match(
  panelSource,
  /resolveSeedance2PromptTextModel\(node,\s*effectiveConfig\)/,
  "the picker should display the shared resolved Seedance2 text model",
);
assert.match(
  handlerSource,
  /resolveSeedance2PromptTextModel\(workflowNode,\s*effectiveConfig\)/,
  "the rewrite request should use the same model resolution as the picker",
);
assert.match(
  storyBranchSource,
  /rewriteModel:\s*promptTextModel/,
  "the selected video-workflow text model must be attached to the rewrite input",
);
assert.match(
  storyBranchSource,
  /textModel:\s*promptTextModel[\s\S]*model:\s*promptTextModel/,
  "the selected Seedance2 text model should be sent as both textModel and model",
);
assert.equal(
  (storyBranchSource.match(/rewriteSeedance2BatchPrompts\(/g) || []).length,
  1,
  "one story click should invoke exactly one batch rewrite orchestrator",
);
assert.match(
  storyBranchSource,
  /rewriteSeedance2BatchPrompts\([\s\S]*requestImageQuestion\([\s\S]*stream:\s*false/,
  "the batch rewrite should issue one non-streaming structured text request",
);
assert.match(
  storyBranchSource,
  /image_url[\s\S]*sourceImage|sourceImage[\s\S]*image_url/,
  "the batch rewrite request must include each upstream storyboard image",
);
assert.match(
  storyBranchSource,
  /createSeedance2SequentialPlaceholderRun/,
  "validated rewritten shots must be appended in story order",
);
assert.doesNotMatch(
  storyBranchSource,
  /repairPrompt|clipForPrompt|第二次|retry/i,
  "Seedance2 batch rewrite must not repair, retry or clip the complete input",
);
assert.doesNotMatch(
  storyBranchSource,
  /buildStoryDirectorSlicePlaceholders\(/,
  "the story button should not call the legacy in-place refresh builder",
);

const awaitRewriteIndex = storyBranchSource.indexOf("await rewriteSeedance2BatchPrompts");
const buildVersionIndex = storyBranchSource.indexOf("buildVersionedStoryDirectorSlicePlaceholders", awaitRewriteIndex);
const setNodesIndex = storyBranchSource.indexOf("setNodes(", awaitRewriteIndex);
const setConnectionsIndex = storyBranchSource.indexOf("setConnections(", awaitRewriteIndex);
const persistIndex = storyBranchSource.indexOf("persistCanvasSnapshot(", awaitRewriteIndex);
assert.ok(awaitRewriteIndex >= 0);
assert.ok(buildVersionIndex > awaitRewriteIndex);
assert.ok(setNodesIndex > buildVersionIndex);
assert.ok(setConnectionsIndex > buildVersionIndex);
assert.ok(persistIndex > buildVersionIndex);
assert.doesNotMatch(
  storyBranchSource.slice(0, awaitRewriteIndex),
  /setNodes\(|setConnections\(|persistCanvasSnapshot\(/,
  "nodes and connections must remain unchanged until the complete rewrite succeeds",
);
assert.match(
  storyBranchSource,
  /catch\s*\(error\)[\s\S]*message\.error/,
  "request and parse failures should report an error without falling into partial creation",
);
assert.match(
  storyBranchSource,
  /seedanceRewriteRunCache|nextShotIndex/,
  "a partial creation must retain a current-shot checkpoint for resume",
);
assert.match(
  panelSource,
  /disabled=\{isCreatingPlaceholders\}/,
  "the UI button should prevent duplicate human clicks while a batch rewrite is running",
);

for (const field of [
  "seedancePlaceholderSetVersion",
  "seedancePromptRewriteModel",
  "seedancePromptRewriteTemplate",
  "seedancePromptRewriteCreatedAt",
]) {
  assert.match(typesSource, new RegExp(`${field}\\?:`), `CanvasNodeMetadata should declare ${field}`);
}

console.log("seedance2 workflow batch prompt integration tests passed");
