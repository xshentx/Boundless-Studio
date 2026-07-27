import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasClientPath = join(
  repoRoot,
  "src/app/canvas/workspace/canvas-client-page.tsx",
);
const source = readFileSync(canvasClientPath, "utf8");

assert.match(
  source,
  /const CANVAS_IMAGE_TASK_MISSING_GRACE_MS = 300_000;/,
  "canvas image task polling should allow 300 seconds for missing task synchronization",
);

console.log("canvas image polling timeout config test passed");
