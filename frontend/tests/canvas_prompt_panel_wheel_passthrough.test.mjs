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
  /onWheel=\{\(event\) => event\.stopPropagation\(\)\}/,
  "the prompt textarea must consume every React wheel event, including at its scroll boundaries",
);
assert.match(
  infiniteCanvasSource,
  /handleWheel[\s\S]*closest\("[^"\n]*\[data-canvas-wheel-scroll\][^"\n]*textarea[^"\n]*input[^"\n]*select[^"\n]*\[contenteditable='true'\][^"\n]*"\)\) return;/,
  "the canvas wheel router must ignore marked editors and native form controls",
);
assert.match(
  infiniteCanvasSource,
  /preventWheelScroll[\s\S]*if \(target\?\.closest\("[^"\n]*\[data-canvas-wheel-scroll\][^"\n]*textarea[^"\n]*input[^"\n]*select[^"\n]*\[contenteditable='true'\][^"\n]*"\)\) return;[\s\S]*event\.preventDefault\(\)/,
  "the native wheel guard must preserve native input scrolling even at the top or bottom",
);
assert.doesNotMatch(
  infiniteCanvasSource,
  /canScrollCanvasWheelTarget/,
  "canvas wheel isolation must not depend on whether an input can scroll farther",
);

console.log("canvas prompt panel wheel isolation contract tests passed");
