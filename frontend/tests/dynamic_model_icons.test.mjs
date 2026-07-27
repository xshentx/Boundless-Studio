import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(join(frontendRoot, relativePath), "utf8");

const iconSource = readSource("src/components/model-icon.tsx");
const pickerSource = readSource("src/components/model-picker.tsx");
const configSource = readSource("src/stores/use-config-store.ts");
const relaySource = readSource("src/stores/api-relay-config.ts");
const settingsSource = readSource("src/components/api-access-settings-dialog.tsx");
const canvasNodeSource = readSource("src/app/canvas/components/canvas-node.tsx");
const canvasClientSource = readSource("src/app/canvas/workspace/canvas-client-page.tsx");
const storyDirectorSource = readSource("src/app/canvas/components/canvas-story-director-panel.tsx");

for (const token of [
  "openai.svg",
  "claude-color.svg",
  "gemini-color.svg",
  "grok.svg",
  "deepseek-color.svg",
  "qwen-color.svg",
  "zhipu-color.svg",
  "doubao-color.svg",
]) {
  assert.match(iconSource, new RegExp(token.replace(".", "\\."), "u"), `${token} must have a model-name mapping`);
  assert.equal(existsSync(join(frontendRoot, "public/model-icons", token)), true, `${token} must exist as a bundled asset`);
}

for (const modelToken of ["gpt", "claude", "gemini", "grok", "deepseek", "qwen", "glm-", "seedance", "seedream"]) {
  assert.match(iconSource.toLowerCase(), new RegExp(modelToken, "u"), `${modelToken} must resolve to a provider icon`);
}
assert.match(iconSource, /failedIcon[\s\S]*<Cpu/u, "unknown or failed model icons must use a safe generic fallback");
assert.match(pickerSource, /current \? <ModelIcon model=\{current\}/u, "the selected value must render a real model icon");
assert.match(pickerSource, /<ModelLabel model=\{model\}/u, "dropdown options must render real model icons");
assert.match(pickerSource, /const current = options\.includes\(requested\) \? requested : ""/u, "removed or unconfigured values must show the placeholder");
assert.match(pickerSource, /placeholder = "\u9009\u62e9\u6a21\u578b"/u, "an empty selector must display the choose-model placeholder");

assert.match(configSource, /enabledRelayModelsForCapability\(config\.apiRelays, "text"\)[\s\S]*enabledRelayModelsForCapability\(config\.apiRelays, "image"\)[\s\S]*enabledRelayModelsForCapability\(config\.apiRelays, "video"\)[\s\S]*enabledRelayModelsForCapability\(config\.apiRelays, "audio"\)/u, "all selectable capability lists must come from enabled relay configuration");
assert.match(relaySource, /filterModelsByCapability\(allModels, "text"\)[\s\S]*filterModelsByCapability\(allModels, "image"\)[\s\S]*filterModelsByCapability\(allModels, "video"\)[\s\S]*filterModelsByCapability\(allModels, "audio"\)/u, "configured relay models must be classified by capability");
assert.doesNotMatch(configSource, /CHAT_MODEL_OPTIONS|CHAT_TEXT_MODEL_OPTIONS|CANVAS_IMAGE_MODEL_VALUES/u, "the config store must not contain built-in picker options");
assert.doesNotMatch(relaySource, /models\.push\([^)]*seedance|seedance-2\.0-flash[\s\S]{0,80}models/u, "relay normalization must not inject a built-in video model");

assert.match(settingsSource, /<ModelSelectControl[\s\S]{0,180}models=\{models\}/u, "model routing settings must use the shared dynamic icon picker");
assert.match(canvasNodeSource, /function Seedance2VideoModelSelect[\s\S]{0,700}<ModelSelectControl/u, "Seedance video model selectors must use the shared dynamic icon picker");
assert.match(canvasClientSource, /<Seedance2ModelOptionPicker[\s\S]{0,160}label="\u89c6\u9891\u6a21\u578b"[\s\S]{0,160}models=\{videoModels\}/u, "the workflow video picker must use configured video models");
assert.match(canvasClientSource, /<Seedance2ModelOptionPicker[\s\S]{0,160}label="\u6587\u672c\u6a21\u578b"[\s\S]{0,160}models=\{textModelOptions\}/u, "the workflow text picker must use configured text models");
assert.match(storyDirectorSource, /<ModelLabel model=\{option\.model\}/u, "the story director model selector must render provider icons");
assert.doesNotMatch(canvasNodeSource, /<option\s+value=\{LOCAL_SEEDANCE2_MODEL\}/u, "canvas model selectors must not hard-code the Seedance compatibility model");

const allPickerSources = [configSource, relaySource, settingsSource, canvasNodeSource, canvasClientSource, pickerSource].join("\n");
assert.doesNotMatch(allPickerSources, /SEEDANCE2_MODEL_OPTIONS|CHAT_MODEL_OPTIONS|CHAT_TEXT_MODEL_OPTIONS|CANVAS_IMAGE_MODEL_VALUES/u, "no model picker may use a built-in model option constant");

console.log("dynamic model icon and configured-model picker tests passed");