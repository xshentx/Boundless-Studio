import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const promptPanelSource = readFileSync(
  join(frontendRoot, "src/app/canvas/components/canvas-node-prompt-panel.tsx"),
  "utf8",
);
const infiniteCanvasSource = readFileSync(
  join(frontendRoot, "src/app/canvas/components/infinite-canvas.tsx"),
  "utf8",
);
const wheelHelperSource = readFileSync(
  join(frontendRoot, "src/app/canvas/components/canvas-wheel-scroll.ts"),
  "utf8",
);

const panelOpening = promptPanelSource.slice(
  promptPanelSource.indexOf('className="rounded-2xl border p-3 shadow-2xl backdrop-blur"'),
  promptPanelSource.indexOf("<CanvasResourceMentionTextarea"),
);
assert.doesNotMatch(
  panelOpening,
  /onWheel=.*stopPropagation/,
  "the prompt panel must not swallow every wheel event before InfiniteCanvas can zoom",
);
assert.match(
  promptPanelSource,
  /data-canvas-wheel-scroll="true"/,
  "the prompt textarea must opt into native wheel scrolling inside the canvas",
);
assert.match(
  promptPanelSource,
  /className="[^"]*overflow-y-auto[^"]*overscroll-contain/,
  "overflowing prompt text must expose a contained vertical scrollbar",
);
assert.match(
  promptPanelSource,
  /onWheel=\{\(event\) => \{\s*if \(canScrollCanvasWheelTarget\(event\.currentTarget, event\.deltaY\)\) event\.stopPropagation\(\);\s*\}\}/,
  "only a prompt textarea that can still scroll should consume the React wheel event",
);
assert.match(
  infiniteCanvasSource,
  /closest<HTMLElement>\("\[data-canvas-wheel-scroll\]"\)[\s\S]*if \(scrollTarget && canScrollCanvasWheelTarget\(scrollTarget, event\.deltaY\)\) return;[\s\S]*event\.preventDefault\(\)/,
  "the native canvas wheel guard must allow the browser to scroll an overflowing prompt before cancelling the event",
);

const helperMatch = wheelHelperSource.match(
  /export function canScrollCanvasWheelTarget\([^)]*\) \{([\s\S]*?)\n\}/,
);
assert.ok(helperMatch, "the prompt wheel boundary helper must remain available");
const canScrollCanvasWheelTarget = new Function(
  "target",
  "deltaY",
  helperMatch[1],
);
const scrollbox = (scrollTop, scrollHeight = 300, clientHeight = 100) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});
assert.equal(canScrollCanvasWheelTarget(scrollbox(50), -10), true, "wheel-up should scroll inside the textarea away from the top");
assert.equal(canScrollCanvasWheelTarget(scrollbox(0), -10), false, "wheel-up at the top should pass through to canvas zoom");
assert.equal(canScrollCanvasWheelTarget(scrollbox(50), 10), true, "wheel-down should scroll inside the textarea away from the bottom");
assert.equal(canScrollCanvasWheelTarget(scrollbox(200), 10), false, "wheel-down at the bottom should pass through to canvas zoom");
assert.equal(canScrollCanvasWheelTarget(scrollbox(0, 100, 100), 10), false, "a non-scrollable textarea should always pass wheel events through");

console.log("canvas prompt panel wheel passthrough contract tests passed");
