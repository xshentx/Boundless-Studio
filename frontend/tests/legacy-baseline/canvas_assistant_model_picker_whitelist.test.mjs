import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const assistantSource = readFileSync(
  join(repoRoot, "src/app/canvas/components/canvas-assistant-panel.tsx"),
  "utf8",
);
const modelPickerSource = readFileSync(
  join(repoRoot, "src/components/model-picker.tsx"),
  "utf8",
);
const imageApiSource = readFileSync(
  join(repoRoot, "src/services/api/image.ts"),
  "utf8",
);

assert.match(
  modelPickerSource,
  /allowedModels\?:\s*readonly\s+string\[\]/,
  "ModelPicker should accept an explicit allowedModels whitelist for scoped pickers",
);

assert.match(
  assistantSource,
  /CANVAS_ASSISTANT_TEXT_MODELS[\s\S]*gpt-5\.5[\s\S]*gpt-5\.6[\s\S]*gpt-5\.6-luna[\s\S]*gpt-5\.6-sol[\s\S]*gpt-5\.6-terra[\s\S]*gemini-3\.5-flash[\s\S]*gemini-3\.1-pro/,
  "Canvas assistant text picker should keep only approved GPT 5.5/5.6 and Gemini workbench models",
);
assert.match(
  assistantSource,
  /const storedConfig = useConfigStore\(\(state\) => state\.config\)/,
  "Canvas assistant should read the persisted config so local workbench selections are not filtered back to gpt-5.5 by platform effectiveConfig",
);
assert.match(
  assistantSource,
  /textModel:\s*pickAssistantModel\(storedConfig\.textModel\s*\|\|\s*effectiveConfig\.textModel\s*\|\|\s*effectiveConfig\.model,\s*CANVAS_ASSISTANT_TEXT_MODELS\)/,
  "Canvas assistant selected text model should prefer the raw stored textModel before effectiveConfig fallback",
);
assert.match(
  assistantSource,
  /CANVAS_ASSISTANT_IMAGE_MODELS[\s\S]*gpt-image-2[\s\S]*seedream-5\.0-lite[\s\S]*seedream-4\.5[\s\S]*seedream-4\.0[\s\S]*gemini-3\.0-pro-image-four-three[\s\S]*gemini-3\.0-pro-image-landscape[\s\S]*gemini-3\.0-pro-image-portrait[\s\S]*gemini-3\.0-pro-image-square/,
  "Canvas assistant image picker should keep only approved workbench image models",
);

assert.match(
  assistantSource,
  /capability="image"[\s\S]*allowedModels=\{CANVAS_ASSISTANT_IMAGE_MODELS\}/,
  "Canvas assistant image mode should pass its image whitelist to ModelPicker",
);
assert.match(
  assistantSource,
  /capability="text"[\s\S]*allowedModels=\{CANVAS_ASSISTANT_TEXT_MODELS\}/,
  "Canvas assistant chat mode should pass its text whitelist to ModelPicker",
);
assert.match(
  imageApiSource,
  /resolveApiRequestRoute\(config,\s*"text",\s*config\.textModel\s*\|\|\s*config\.model,\s*options\.boardRouteKey\)/,
  "Canvas assistant chat requests should keep the selected textModel when boardRouteKey is present",
);

assert.doesNotMatch(
  assistantSource,
  /CANVAS_ASSISTANT_TEXT_MODELS[\s\S]*codex-auto-review/,
  "Canvas assistant text whitelist should not include codex-auto-review",
);
assert.doesNotMatch(
  assistantSource,
  /CANVAS_ASSISTANT_TEXT_MODELS[\s\S]*gpt-5\.2/,
  "Canvas assistant text whitelist should not include GPT 5.2 variants",
);
assert.doesNotMatch(
  assistantSource,
  /CANVAS_ASSISTANT_IMAGE_MODELS[\s\S]*gpt-image-1/,
  "Canvas assistant image whitelist should not include legacy GPT image 1 variants",
);

console.log("canvas assistant model picker whitelist tests passed");
