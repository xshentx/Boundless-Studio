import assert from "node:assert/strict";

import { resolvePromptTextareaHeight } from "../src/app/canvas/components/canvas-prompt-panel-height.ts";

const baseInput = {
  minimumHeight: 96,
  maximumHeight: 640,
  contentHeight: 640,
};

assert.equal(
  resolvePromptTextareaHeight({ ...baseInput, manualHeight: null }),
  640,
  "auto mode should follow the bounded content height",
);

assert.equal(
  resolvePromptTextareaHeight({ ...baseInput, manualHeight: 260 }),
  260,
  "manual resize should win over a larger content height",
);

assert.equal(
  resolvePromptTextareaHeight({ ...baseInput, manualHeight: 40 }),
  96,
  "manual resize should retain the minimum height",
);

assert.equal(
  resolvePromptTextareaHeight({ ...baseInput, manualHeight: 900 }),
  640,
  "manual resize should retain the viewport maximum height",
);

console.log("canvas prompt panel height tests passed");
