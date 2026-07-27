import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const hookPath = join(
  repoRoot,
  "src/app/canvas/components/use-auto-resize-textarea.ts",
);
const canvasNodePath = join(
  repoRoot,
  "src/app/canvas/components/canvas-node.tsx",
);
const canvasClientPath = join(
  repoRoot,
  "src/app/canvas/workspace/canvas-client-page.tsx",
);

assert.equal(existsSync(hookPath), true, "shared textarea auto-resize hook should exist");

const hookSource = readFileSync(hookPath, "utf8");
const canvasNodeSource = readFileSync(canvasNodePath, "utf8");
const canvasClientSource = readFileSync(canvasClientPath, "utf8");

assert.match(hookSource, /export function useAutoResizeTextarea/, "hook should export useAutoResizeTextarea");
assert.match(
  hookSource,
  /textarea\.style\.height\s*=\s*["']0px["'][\s\S]*textarea\.scrollHeight/,
  "hook should collapse before reading scrollHeight so content can shrink",
);
assert.match(
  hookSource,
  /manualHeightRef[\s\S]*new ResizeObserver/,
  "hook should track native/manual textarea resize separately from content resize",
);

assert.match(canvasClientSource, /useAutoResizeTextarea/, "Seedance2 workflow panel textareas should use shared auto-resize logic");
assert.match(canvasClientSource, /promptTemplateTextareaRef/, "prompt template textarea should have an auto-resize ref");
assert.match(canvasClientSource, /data-seedance2-workflow-panel/, "embedded Seedance2 workflow should expose a stable panel target for outer-height observation");
assert.match(
  canvasNodeSource,
  /const SEEDANCE2_WORKFLOW_MIN_HEIGHT = NODE_DEFAULT_SIZE\[CanvasNodeType\.Seedance2Workflow\]\.height/,
  "Seedance2 workflow should retain its vertical default frame as the outer-height minimum",
);
assert.match(
  canvasNodeSource,
  /const autoHeightPanel = isStoryDirector[\s\S]*selector: "\[data-story-director-panel\]"[\s\S]*minHeight: STORY_DIRECTOR_MIN_HEIGHT[\s\S]*isSeedance2Workflow[\s\S]*selector: "\[data-seedance2-workflow-panel\]"[\s\S]*minHeight: SEEDANCE2_WORKFLOW_MIN_HEIGHT/,
  "CanvasNode should select Story Director and Seedance2 workflow panels with their own minimum heights",
);
assert.match(
  canvasNodeSource,
  /querySelector\(autoHeightPanel\.selector\)[\s\S]*Math\.max\(\s*autoHeightPanel\.minHeight,\s*Math\.ceil\(measuredHeight \+ 4\),\s*\)/,
  "the shared observer should measure its selected panel and resize only above that panel's minimum height",
);
assert.doesNotMatch(
  canvasClientSource,
  /max-h-\[78vh\]/,
  "Seedance2 workflow should grow its canvas node instead of capping the panel with internal scrolling",
);

assert.doesNotMatch(
  canvasNodeSource,
  /\? `flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto p-2/,
  "portrait Seedance2 prompt root should not scroll internally; the prompt textarea/red box should expand first",
);
assert.doesNotMatch(
  canvasNodeSource,
  /max-h-\[116px\]/,
  "portrait Seedance2 prompt should not keep the old 116px cap that forces early internal scrolling",
);
assert.match(
  canvasNodeSource,
  /const slotLayoutHeight = Number\(props\.node\.metadata\?\.seedanceManualMinHeight \|\| 0\) \|\| props\.node\.height;[\s\S]*height: slotLayoutHeight/,
  "portrait visible reference slots should be based on manual node resize height, not prompt auto-growth node height",
);

console.log("canvas auto-resize textarea tests passed");
