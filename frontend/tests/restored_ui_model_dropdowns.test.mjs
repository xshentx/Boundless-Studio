import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const configSource = readFileSync(join(repoRoot, "src/stores/use-config-store.ts"), "utf8");
const modelPickerSource = readFileSync(join(repoRoot, "src/components/model-picker.tsx"), "utf8");

assert.doesNotMatch(configSource, /CHAT_MODEL_OPTIONS|CHAT_TEXT_MODEL_OPTIONS|CANVAS_IMAGE_MODEL_VALUES/u, "the config store must not inject a built-in model list");
assert.match(configSource, /model:\s*""[\s\S]*imageModel:\s*""[\s\S]*videoModel:\s*""[\s\S]*textModel:\s*""[\s\S]*audioModel:\s*""/u, "unconfigured model defaults must stay empty");
assert.match(configSource, /relayTextModels = enabledRelayModelsForCapability[\s\S]*relayImageModels = enabledRelayModelsForCapability[\s\S]*relayVideoModels = enabledRelayModelsForCapability[\s\S]*relayAudioModels = enabledRelayModelsForCapability/u, "selectable models must be collected from enabled relay configuration");
assert.match(modelPickerSource, /selectableModelsByCapability\(config, capability\)/u, "ModelPicker must read the dynamically configured capability list");
assert.match(modelPickerSource, /const current = options\.includes\(requested\) \? requested : ""/u, "a removed saved model must render as an empty selection");
assert.match(modelPickerSource, /placeholder = "\u9009\u62e9\u6a21\u578b"/u, "empty pickers must display the choose-model placeholder");
assert.doesNotMatch(modelPickerSource, /return \[value, \.\.\.models\]|allowedModels\s*:\s*options/u, "saved values and allowlists must never become model sources");

console.log("dynamic UI model dropdown tests passed");
