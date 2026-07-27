import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceSource = readFileSync(
  join(frontendRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);

assert.match(
  workspaceSource,
  /zoomOnWheel=\{!selectedConnectionId\}/,
  "selecting an image/node and opening its prompt editor must keep ordinary wheel zoom enabled",
);
assert.doesNotMatch(
  workspaceSource,
  /zoomOnWheel=\{!selectedNodeIds\.size && !selectedConnectionId\}/,
  "node selection must no longer turn vertical wheel gestures into horizontal canvas panning",
);

console.log("canvas selected-node wheel zoom contract tests passed");
