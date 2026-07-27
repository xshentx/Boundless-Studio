import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasClientPath = join(
  repoRoot,
  "src/app/canvas/workspace/canvas-client-page.tsx",
);
const canvasClientSource = readFileSync(canvasClientPath, "utf8");
const hydrateCanvasNodeSource = canvasClientSource.slice(
  canvasClientSource.indexOf("async function hydrateCanvasNode"),
  canvasClientSource.indexOf("function markCanvasNodeRestoreError"),
);

assert.doesNotMatch(
  hydrateCanvasNodeSource,
  /node\.type !== CanvasNodeType\.Image \|\| !content/,
  "image nodes with only a storageKey must still resolve their stored image URL",
);
assert.match(
  hydrateCanvasNodeSource,
  /resolveImageUrl\(node\.metadata\.storageKey/,
  "stored image nodes should hydrate through resolveImageUrl",
);

console.log("canvas storage-key image hydration tests passed");
