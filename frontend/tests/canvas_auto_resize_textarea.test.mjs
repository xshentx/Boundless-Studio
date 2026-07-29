import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const hookPath = join(repoRoot, "src/app/canvas/components/use-auto-resize-textarea.ts");
const canvasNodePath = join(repoRoot, "src/app/canvas/components/canvas-node.tsx");
const canvasClientPath = join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx");

assert.equal(existsSync(hookPath), true, "shared textarea auto-resize hook should remain available for other editors");

const hookSource = readFileSync(hookPath, "utf8");
const canvasNodeSource = readFileSync(canvasNodePath, "utf8");
const canvasClientSource = readFileSync(canvasClientPath, "utf8");

assert.match(hookSource, /export function useAutoResizeTextarea/, "hook should export useAutoResizeTextarea");
assert.match(
  hookSource,
  /textarea\.style\.height\s*=\s*["']0px["'][\s\S]*textarea\.scrollHeight/,
  "hook should still support content-aware sizing where explicitly used",
);

const panelStart = canvasClientSource.indexOf("function Seedance2WorkflowPanel");
const panelEnd = canvasClientSource.indexOf("function InfiniteCanvasPage", panelStart);
assert.ok(panelStart >= 0 && panelEnd > panelStart);
const panelSource = canvasClientSource.slice(panelStart, panelEnd);

assert.doesNotMatch(
  panelSource,
  /useAutoResizeTextarea|promptTemplateTextareaRef/,
  "the workflow prompt template must not auto-grow with unbounded content",
);
assert.match(
  panelSource,
  /h-\[220px\][^"\n]*max-h-\[220px\][^"\n]*resize-none[^"\n]*overflow-y-auto/,
  "the workflow prompt template should keep a bounded height and scroll internally",
);
assert.match(
  panelSource,
  /data-canvas-wheel-scroll/,
  "the workflow prompt template should opt into native wheel scrolling inside the canvas",
);
assert.match(
  panelSource,
  /onWheel=\{\(event\) => event\.stopPropagation\(\)\}/,
  "the workflow prompt template wheel should not zoom the canvas",
);
assert.doesNotMatch(
  canvasNodeSource,
  /isSeedance2Workflow[\s\S]{0,180}selector:s*"\[data-seedance2-workflow-panel\]"/,
  "Seedance2 workflow content changes must no longer auto-grow the canvas node",
);
assert.match(
  canvasNodeSource,
  /const autoHeightPanel = isStoryDirector[\s\S]*selector: "\[data-story-director-panel\]"/,
  "Story Director should retain its independent auto-height behavior",
);

console.log("canvas bounded Seedance2 textarea tests passed");
