import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, "../src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const menu = between("function ConnectionCreateMenu({", "function ConnectionCreateOption({");
assert.match(menu, /showVideoWorkflow: boolean/);
assert.match(menu, /onCreateVideoWorkflow: \(\) => void/);
assert.match(menu, /\{showVideoWorkflow \? \(/);
assert.match(menu, /title="\u89c6\u9891\u5de5\u4f5c\u6d41"/u);
assert.match(menu, /onClick=\{onCreateVideoWorkflow\}/);

const workflowCreator = between(
  "  const createSeedance2Workflow = useCallback(",
  "  const rebuildSeedance2Placeholders = useCallback(",
);
assert.match(workflowCreator, /pending\?: PendingConnectionCreate/);
assert.match(workflowCreator, /normalizeConnection\(/);
assert.match(workflowCreator, /pending.connection.nodeId/);
assert.match(workflowCreator, /controller.id/);
assert.match(workflowCreator, /nextConnections = \[\.\.\.nextConnections, \{ id: nanoid\(\), \.\.\.connection \}\]/);
assert.match(workflowCreator, /persistCanvasSnapshot\(nextNodes, nextConnections\)/);
assert.match(workflowCreator, /setPendingConnectionCreate\(null\)/);

const menuUsage = between(
  "          {pendingConnectionCreate ? (",
  "        </InfiniteCanvas>",
);
assert.match(menuUsage, /pendingConnectionCreate.connection.handleType === "source"/);
assert.match(menuUsage, /node.type === CanvasNodeType.StoryDirector/);
assert.match(menuUsage, /createSeedance2Workflow\(\s*pendingConnectionCreate.position,\s*pendingConnectionCreate,/);

console.log("story director video workflow connection menu source tests passed");
