import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCanvasImagePlaceholderModel } from "../src/app/canvas/utils/canvas-image-placeholder-model.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const promptPanelSource = readFileSync(join(repoRoot, "src/app/canvas/components/canvas-node-prompt-panel.tsx"), "utf8");
const canvasClientSource = readFileSync(join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"), "utf8");
const utilitySource = readFileSync(join(repoRoot, "src/app/canvas/utils/canvas-image-placeholder-model.ts"), "utf8");

const configuredModels = ["relay-image-a", "relay-image-b"];
assert.equal(resolveCanvasImagePlaceholderModel(undefined, []), "", "unconfigured image pickers must remain empty");
assert.equal(resolveCanvasImagePlaceholderModel(undefined, configuredModels), "relay-image-a", "a new placeholder may use the first dynamically configured image model");
assert.equal(resolveCanvasImagePlaceholderModel("removed-model", configuredModels), "relay-image-a", "a removed saved model must not be injected into the dropdown");
assert.equal(resolveCanvasImagePlaceholderModel("relay-image-b", configuredModels), "relay-image-b", "a saved configured model should be preserved");

assert.match(promptPanelSource, /<ModelPicker[\s\S]{0,400}?capability="image"/u, "image placeholders must use the shared typed dynamic picker");
assert.doesNotMatch(promptPanelSource, /allowedModels=|CANVAS_IMAGE_PLACEHOLDER_MODELS/u, "image placeholders must not use a fixed whitelist as their option source");
assert.match(canvasClientSource, /type === CanvasNodeType\.Config[\s\S]*model:\s*effectiveConfig\.imageModel \|\| ""/u, "new image placeholders must use the configured image route model or stay empty");
assert.doesNotMatch(utilitySource, /gpt-image|seedream|CANVAS_IMAGE_PLACEHOLDER_DEFAULT_MODEL/u, "the image model resolver must not contain built-in model names");

console.log("canvas image placeholder dynamic model picker tests passed");
