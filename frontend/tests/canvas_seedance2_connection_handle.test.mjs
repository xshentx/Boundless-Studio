import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasNodeSource = readFileSync(
  join(repoRoot, "src/app/canvas/components/canvas-node.tsx"),
  "utf8",
);

assert.doesNotMatch(
  canvasNodeSource,
  /data-seedance2-reference-input/,
  "Seedance2 video placeholders should not render a second decorative reference-input dot next to the functional canvas connection handle",
);
assert.match(
  canvasNodeSource,
  /<ConnectionHandleDot nodeType=\{data\.type\} side="left"[\s\S]*onConnectStart\(event, data\.id, "target"\)/,
  "video placeholders should continue to use the shared, interactive target connection handle",
);

console.log("canvas Seedance2 connection handle tests passed");
