import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasNodePath = join(
  repoRoot,
  "src/app/canvas/components/canvas-node.tsx",
);
const promptPanelPath = join(
  repoRoot,
  "src/app/canvas/components/canvas-node-prompt-panel.tsx",
);
const legacySelectionFrameUtilPath = join(
  repoRoot,
  "src/app/canvas/utils/canvas-node-selection-frame.ts",
);

const canvasNodeSource = readFileSync(canvasNodePath, "utf8");
const promptPanelSource = readFileSync(promptPanelPath, "utf8");

assert.match(
  canvasNodeSource,
  /className="relative h-full w-full overflow-visible rounded-3xl border-2"/,
  "the original node body selection frame should remain around the real node body",
);
assert.match(
  canvasNodeSource,
  /showPanel && renderPanel \? <div className="absolute left-1\/2 top-full z-\[70\] w-\[500px\] -translate-x-1\/2 pt-4">\{renderPanel\(data\)\}<\/div>/,
  "the prompt panel should remain a floating panel below the node",
);
assert.doesNotMatch(
  canvasNodeSource,
  /data-canvas-prompt-panel-selection-frame/,
  "CanvasNode should not render the extended blue prompt-panel selection frame; the blue frame should keep its original node-only shape",
);
assert.doesNotMatch(
  canvasNodeSource,
  /floatingPromptSelectionFrame|floatingPanelFrameHeight|floatingPanelFrameWidth|canvas-node-selection-frame/,
  "CanvasNode should not measure prompt panel size for an extended blue selection frame",
);
assert.equal(
  existsSync(legacySelectionFrameUtilPath),
  false,
  "the unused extended prompt-panel selection frame helper should not remain in source",
);

assert.match(
  promptPanelSource,
  /manualPromptTextareaHeightRef\s*=\s*useRef<number \| null>\(null\)/,
  "CanvasNodePromptPanel should track whether the user has selected a manual height",
);
assert.match(
  promptPanelSource,
  /resolvePromptTextareaHeight\(\{[\s\S]*contentHeight,[\s\S]*manualHeight:\s*manualPromptTextareaHeightRef\.current/,
  "CanvasNodePromptPanel should resolve auto and manual heights through the manual-priority rule",
);
assert.match(
  promptPanelSource,
  /function syncPromptTextareaResizeHeight|const syncPromptTextareaResizeHeight[\s\S]*readInlinePromptTextareaHeight\(textarea\.style\.height\)[\s\S]*manualPromptTextareaHeightRef\.current\s*=[\s\S]*setPromptTextareaHeight/,
  "native textarea resizing should update both the manual height and the controlled wrapper height",
);
assert.match(
  promptPanelSource,
  /resetPromptTextareaManualHeight[\s\S]*manualPromptTextareaHeightRef\.current\s*=\s*null[\s\S]*textarea\.style\.height\s*=\s*["']["']/,
  "resetting the prompt height should clear both manual state and the native inline height",
);
assert.match(
  promptPanelSource,
  /useEffect\(\(\) => \{[\s\S]*resetPromptTextareaManualHeight\(\)[\s\S]*\}, \[node\.id, resetPromptTextareaManualHeight\]\);/,
  "changing nodes should reset prompt panel height state",
);
assert.match(
  promptPanelSource,
  /onDoubleClick=[\s\S]*resetPromptTextareaManualHeight\(\)[\s\S]*setIsPromptExpanded/,
  "double-clicking should reset manual mode before toggling expanded state",
);
assert.match(
  promptPanelSource,
  /className="[^"]*resize-y[^"]*overflow-y-auto/,
  "the prompt textarea should expose vertical-only native resizing and internal overflow scrolling",
);
assert.match(
  promptPanelSource,
  /new ResizeObserver[\s\S]*observer\.observe\(textarea\)/,
  "CanvasNodePromptPanel should observe textarea resize changes that do not immediately resize the panel container",
);
assert.doesNotMatch(
  promptPanelSource,
  /Math\.max\(minimumHeight, contentHeight, manualResizeHeight\)/,
  "a larger content height must not override a smaller manual textarea height",
);
assert.doesNotMatch(
  promptPanelSource,
  /transition-\[height\]|duration-200/,
  "prompt panel height should update immediately with native textarea resizing instead of animating behind it",
);
assert.match(
  promptPanelSource,
  /transition:\s*"none"/,
  "prompt panel textarea and wrapper should opt out of global height transitions so the outer panel follows immediately",
);
assert.match(
  promptPanelSource,
  /minHeight:\s*PROMPT_TEXTAREA_COLLAPSED_HEIGHT/,
  "the prompt textarea should use the panel's default open height as its minimum manual resize height",
);
assert.doesNotMatch(
  promptPanelSource,
  /if \(!isPromptExpanded\) \{\s*setPromptTextareaHeight\(PROMPT_TEXTAREA_COLLAPSED_HEIGHT\);\s*return;/,
  "typing beyond the default prompt height should still use the prompt measurement flow instead of forcing the box back to the default height",
);
assert.match(
  promptPanelSource,
  /textarea\.scrollHeight[\s\S]*PROMPT_TEXTAREA_COLLAPSED_HEIGHT/,
  "prompt panel height measurement should grow from the default minimum using the textarea content height",
);
assert.match(
  promptPanelSource,
  /function measurePromptTextareaContentHeight[\s\S]*textarea\.style\.height\s*=\s*["']0px["'][\s\S]*textarea\.scrollHeight[\s\S]*finally[\s\S]*textarea\.style\.height\s*=\s*restoreHeight/,
  "prompt panel measurement should temporarily collapse the textarea before reading scrollHeight so the panel shrinks when content gets shorter",
);

console.log("canvas prompt panel selection frame tests passed");
