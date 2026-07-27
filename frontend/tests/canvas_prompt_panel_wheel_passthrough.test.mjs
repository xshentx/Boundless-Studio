import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const promptPanelSource = readFileSync(
  join(frontendRoot, "src/app/canvas/components/canvas-node-prompt-panel.tsx"),
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
  /onWheel=\{\(event\) => \{\s*if \(canScrollPromptTextarea\(event\.currentTarget, event\.deltaY\)\) event\.stopPropagation\(\);\s*\}\}/,
  "only a prompt textarea that can still scroll should consume the wheel event",
);

const helperMatch = promptPanelSource.match(
  /export function canScrollPromptTextarea\([^)]*\) \{([\s\S]*?)\n\}/,
);
assert.ok(helperMatch, "the prompt wheel boundary helper must remain available");
const canScrollPromptTextarea = new Function(
  "textarea",
  "deltaY",
  helperMatch[1],
);
const scrollbox = (scrollTop, scrollHeight = 300, clientHeight = 100) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});
assert.equal(canScrollPromptTextarea(scrollbox(50), -10), true, "wheel-up should scroll inside the textarea away from the top");
assert.equal(canScrollPromptTextarea(scrollbox(0), -10), false, "wheel-up at the top should pass through to canvas zoom");
assert.equal(canScrollPromptTextarea(scrollbox(50), 10), true, "wheel-down should scroll inside the textarea away from the bottom");
assert.equal(canScrollPromptTextarea(scrollbox(200), 10), false, "wheel-down at the bottom should pass through to canvas zoom");
assert.equal(canScrollPromptTextarea(scrollbox(0, 100, 100), 10), false, "a non-scrollable textarea should always pass wheel events through");

console.log("canvas prompt panel wheel passthrough contract tests passed");
