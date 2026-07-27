import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assistantSource = readFileSync(
  join(frontendRoot, "src/app/canvas/components/canvas-assistant-panel.tsx"),
  "utf8",
);

const toolsClass = assistantSource.match(/className="([^"]*canvas-composer-tools[^"]*)"/)?.[1] || "";
assert.match(toolsClass, /\bflex-wrap\b/, "composer tools should wrap in narrow assistant panels");
assert.doesNotMatch(toolsClass, /\boverflow-x-auto\b/, "composer tools should not create a horizontal scrollbar");
assert.doesNotMatch(toolsClass, /\bthin-scrollbar\b/, "the removed horizontal overflow should not leave a visible scrollbar style");

const modeButtonClass = assistantSource.match(/className="([^"]*canvas-composer-mode-button[^"]*)"/)?.[1] || "";
for (const token of ["shrink-0", "whitespace-nowrap", "px-2"]) {
  assert.ok(modeButtonClass.split(/\s+/).includes(token), `mode choices must keep the ${token} sizing rule`);
}
assert.match(
  assistantSource,
  /canvas-composer-tools[\s\S]*<CanvasPromptLibrary[\s\S]*<AssistantModeSwitch[\s\S]*<ModelPicker/,
  "wrapping must retain the prompt library, mode switch, and dynamic model picker",
);
assert.match(assistantSource, /aria-label="发送"/, "the send action must remain available after reflow");

console.log("canvas assistant composer layout contract tests passed");
