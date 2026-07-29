import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasNodeSource = readFileSync(
  join(frontendRoot, "src/app/canvas/components/canvas-node.tsx"),
  "utf8",
);
const canvasClientSource = readFileSync(
  join(frontendRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);

assert.match(
  canvasNodeSource,
  /function useDismissSeedance2PromptEditor[\s\S]*document\.addEventListener\("pointerdown", handlePointerDown, true\)/,
  "video prompt editors should listen in capture phase so canvas panning cannot suppress dismissal",
);
assert.match(
  canvasNodeSource,
  /rootRef\.current\?\.contains\(target\)/,
  "interactions inside the active video prompt editor must keep editing active",
);
assert.match(
  canvasNodeSource,
  /data-canvas-resource-mention-menu/,
  "selecting a resource mention must not dismiss the video prompt editor",
);
assert.equal(
  (canvasNodeSource.match(/useDismissSeedance2PromptEditor\(isEditingPrompt/g) || []).length,
  2,
  "both landscape and responsive video prompt editors should dismiss on outside canvas clicks",
);
assert.ok(
  (canvasNodeSource.match(/data-seedance2-inline-prompt-textarea[\s\S]{0,100}data-canvas-wheel-scroll/g) || []).length >= 2,
  "both video prompt textareas should opt into native wheel scrolling",
);
assert.ok(
  (canvasNodeSource.match(/data-seedance2-inline-prompt-preview[\s\S]{0,140}data-canvas-wheel-scroll/g) || []).length >= 2,
  "both read-only video prompt previews should be wheel-scrollable",
);
assert.match(
  canvasClientSource,
  /const rewriteTemplate = configuredTemplate \|\| defaultSeedancePromptTemplate\(\)/,
  "an empty workflow template should fall back to the standard video prompt template",
);

console.log("Seedance2 prompt interaction contract tests passed");
