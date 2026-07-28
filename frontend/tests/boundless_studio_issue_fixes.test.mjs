import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function loadTsModule(path, mocks = {}) {
  const source = readFileSync(path, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const localRequire = (id) => (Object.hasOwn(mocks, id) ? mocks[id] : require(id));
  const sandbox = { exports: {}, module: { exports: {} }, require: localRequire };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: path });
  return sandbox.module.exports;
}
const read = (path) => readFileSync(join(frontendRoot, path), "utf8");
const storage = read("src/services/image-storage.ts");
const workspace = read("src/app/canvas/workspace/canvas-client-page.tsx");
const settings = read("src/components/image-settings-panel.tsx");
const config = read("src/stores/use-config-store.ts");
const imageApi = read("src/services/api/image.ts");
const assistant = read("src/app/canvas/components/canvas-assistant-panel.tsx");
const modelPicker = read("src/components/model-picker.tsx");
const apiSettings = read("src/components/api-access-settings-dialog.tsx");
const home = read("src/app/canvas/home/page.tsx");
const assistantRequestConfigPath = join(frontendRoot, "src/app/canvas/utils/canvas-assistant-request-config.ts");
const relayConfigPath = join(frontendRoot, "src/stores/api-relay-config.ts");
const imageSizeSelectionPath = join(frontendRoot, "src/lib/image-size-selection.ts");

assert.match(storage, /if \(blob\?\.size\)/, "zero-byte desktop image blobs must not be treated as valid cache hits");
assert.match(storage, /if \(!legacy\?\.blob\.size\) return null;/, "zero-byte legacy blobs must not hide the backend URL fallback");
assert.match(storage, /assertNonEmptyImageBlob\(blob\)/, "empty fetched or uploaded images must be rejected before request assembly");

const keydownStart = workspace.indexOf("const handleKeyDown = (event: KeyboardEvent)");
const keyboardHandler = workspace.slice(keydownStart, workspace.indexOf("window.addEventListener(\"keydown\"", keydownStart));
assert.ok(keyboardHandler.indexOf('event.key === "Delete"') < keyboardHandler.indexOf('target?.closest("[data-canvas-no-zoom]")'), "delete handling must run before video controls opt out of canvas shortcuts");
assert.match(keyboardHandler, /isEditableTarget[\s\S]*contenteditable/, "editable fields must retain normal Backspace behavior");
assert.match(workspace, /CanvasNodeType\.Video && node\.metadata\?\.content\) return false;/, "completed video connections must target the visible node handle");

const qualityOptions = settings.slice(settings.indexOf("const qualityOptions"), settings.indexOf("const DIMENSION_STEP"));
for (const tier of ["1k", "2k", "4k"]) assert.match(qualityOptions, new RegExp(`\\{ value: "${tier}", label: "${tier}" \\}`));
assert.match(settings, />\u56fe\u7247\u89c4\u683c</u, "image settings must use resolution terminology");
assert.doesNotMatch(qualityOptions, /\{ value: "(?:auto|low|medium|high)", label:/, "legacy quality choices must not remain visible");
assert.match(settings, /const aspectRatio = explicitImageSizeToAspectRatio\(activeSize\);[\s\S]*onConfigChange\("size", aspectRatio\)/, "choosing a resolution tier must release stale explicit dimensions");

const { explicitImageSizeToAspectRatio } = loadTsModule(imageSizeSelectionPath);
assert.equal(explicitImageSizeToAspectRatio("3840x3840"), "1:1", "square explicit dimensions should become a square ratio before applying 1k/2k/4k");
assert.equal(explicitImageSizeToAspectRatio("1536x1024"), "3:2", "explicit dimensions should retain their reduced aspect ratio");
assert.equal(explicitImageSizeToAspectRatio("16:9"), "16:9", "existing ratios must remain unchanged");
assert.match(config, /quality: "1k"/);
assert.match(config, /canvasImageCount: "1"/);
assert.match(config, /auto: "1k", low: "1k", medium: "2k", high: "4k"/, "persisted legacy quality values must migrate to resolution tiers");
assert.match(imageApi, /auto: "low"[\s\S]*"1k": "low"/, "old nodes saved with auto quality must generate at 1k");
assert.match(imageApi, /shortSide = basePixels \|\| DEFAULT_IMAGE_SHORT_SIDE;/, "ratio dimensions must derive from the tier short side");
assert.doesNotMatch(imageApi, /targetPixels = basePixels \* basePixels/, "1k ratios must not use square-root total-pixel sizing");
const generationRequest = imageApi.slice(imageApi.indexOf("export async function requestGeneration"), imageApi.indexOf("export async function requestEdit"));
const editRequest = imageApi.slice(imageApi.indexOf("export async function requestEdit"), imageApi.indexOf("export async function requestImageQuestion"));
assert.match(generationRequest, /\.\.\.\(outputSize \? \{ output_size: outputSize \} : \{\}\)/, "local and remote generation requests must both send output_size");
assert.doesNotMatch(generationRequest, /channelMode === "remote"[\s\S]{0,80}outputSize/, "generation output_size must not be remote-only");
assert.match(editRequest, /if \(outputSize\) \{[\s\S]*formData\.set\("output_size", outputSize\)/, "local and remote edit requests must both send output_size");
assert.doesNotMatch(editRequest, /channelMode === "remote"[\s\S]{0,80}outputSize/, "edit output_size must not be remote-only");

assert.match(assistant, /"\u753b\u5e03\u52a9\u624b"/u);
assert.doesNotMatch(assistant, /\u753b\u5e03\u52a9\u624b\(\u672a\u5f00\u53d1\)/u);
assert.match(assistant, /allowedModels=\{CANVAS_ASSISTANT_TEXT_MODELS\}/, "assistant text picker must expose the supported configured models");
assert.match(assistant, /allowedModels=\{CANVAS_ASSISTANT_IMAGE_MODELS\}/, "assistant image picker must expose the supported configured models");
assert.match(assistant, /onChange=\{\(model\) => onConfigChange\("textModel", model\)\}/, "assistant model changes must persist to the selected model state");
assert.match(assistant, /buildCanvasAssistantRequestConfig\(assistantConfig, nextMode\)/, "assistant requests must be rebuilt from the picker-backed config");
assert.match(assistant, /boardRouteKey: request\.boardRouteKey/, "assistant text calls must use the temporary selected-model board route");
assert.match(assistant, /requestGeneration\(requestConfig, text, request\.boardRouteKey\)/, "assistant image calls must use the temporary selected-model board route");
assert.match(assistant, /resolveConfiguredModel\(candidate, configuredModels\)/, "assistant must resolve persisted aliases to the provider's configured model ID");
assert.match(assistant, /effectiveConfig\.textModels, CANVAS_ASSISTANT_TEXT_MODELS/, "assistant text selection must resolve against configured text model IDs");
assert.match(assistant, /effectiveConfig\.imageModels, CANVAS_ASSISTANT_IMAGE_MODELS/, "assistant image selection must resolve against configured image model IDs");
assert.match(modelPicker, /configuredModels\.filter\(\(model\) => modelMatchesAllowedModel\(model, allowedModels\)\)/, "scoped model pickers must match configured model aliases instead of dropping them");
assert.match(modelPicker, /aliasMigrationRef\.current = migrationKey;\s*onChange\(current\);/, "resolved aliases must be written back to the parent configuration");
const routePickerOverlays = apiSettings.match(/contentClassName="z-\[1400\]/g) || [];
assert.equal(routePickerOverlays.length, 2, "global and board route model menus must render above the z-1300 settings dialog");

const relayConfig = loadTsModule(relayConfigPath);
assert.equal(relayConfig.resolveConfiguredModel("gpt-5.5", ["gpt-5-5"]), "gpt-5-5", "persisted dotted aliases must resolve to the provider's real model ID");
assert.equal(relayConfig.resolveConfiguredModel("gpt-5-5", ["gpt-5.5", "gpt-5-5"]), "gpt-5-5", "an exact configured model ID must win over an earlier alias");
assert.equal(relayConfig.resolveConfiguredModel("removed-model", ["gpt-5-5"]), "", "removed models must still resolve to an empty selection");
assert.equal(relayConfig.modelMatchesAllowedModel("gpt-5-5", ["gpt-5.5"]), true, "hyphenated GPT model IDs from relays must match the approved dotted alias");
assert.equal(relayConfig.modelMatchesAllowedModel("gemini-3-1-pro", ["gemini-3.1-pro"]), true, "Gemini relay aliases must remain selectable");
assert.equal(relayConfig.modelMatchesAllowedModel("gpt-5.2", ["gpt-5.5"]), false, "alias matching must not admit a different model version");
const { buildCanvasAssistantRequestConfig } = loadTsModule(assistantRequestConfigPath, {
  "@/stores/api-relay-config": relayConfig,
});
const relay = (id, capability, models) => ({
  id,
  name: id,
  baseUrl: `https://${id}.example.com`,
  apiKey: "key",
  enabled: true,
  capabilities: [capability],
  models,
  textModels: capability === "text" ? models : [],
  imageModels: capability === "image" ? models : [],
  videoModels: [],
  audioModels: [],
  timeoutMs: 360000,
  remark: "",
  createdAt: "",
  updatedAt: "",
});
const textDefault = relay("text-default", "text", ["gpt-5.5"]);
const textBoard = relay("text-board", "text", ["gpt-5.5"]);
const imageDefault = relay("image-default", "image", ["gpt-image-2"]);
const baseAssistantConfig = {
  model: "",
  textModel: "gpt-5.5",
  imageModel: "gpt-image-2",
  apiRelays: [textDefault, textBoard, imageDefault],
  apiRouting: {
    text: { source: "relay", providerId: textDefault.id, model: "gpt-5.5" },
    image: { source: "relay", providerId: imageDefault.id, model: "gpt-image-2" },
  },
  apiBoardRouting: {
    imagePrompt: { mode: "custom", providerId: textBoard.id, model: "old-model" },
    imageGeneration: { mode: "inherit", providerId: "", model: "" },
  },
};
const textRequest = buildCanvasAssistantRequestConfig(baseAssistantConfig, "ask");
assert.equal(textRequest?.boardRouteKey, "imagePrompt");
assert.equal(textRequest?.config.model, "gpt-5.5", "text picker selection must become the request model");
assert.equal(textRequest?.config.apiBoardRouting.imagePrompt.providerId, textBoard.id, "the configured board provider should be preferred when it supports the picker model");
assert.equal(textRequest?.config.apiBoardRouting.imagePrompt.model, "gpt-5.5", "the temporary board route must override a stale board model");
const imageRequest = buildCanvasAssistantRequestConfig(baseAssistantConfig, "image");
assert.equal(imageRequest?.boardRouteKey, "imageGeneration");
assert.equal(imageRequest?.config.model, "gpt-image-2", "image picker selection must become the request model");
assert.equal(imageRequest?.config.apiBoardRouting.imageGeneration.providerId, imageDefault.id, "image requests should use the capability provider that owns the selected model");
assert.equal(imageRequest?.config.apiBoardRouting.imageGeneration.model, "gpt-image-2");

assert.match(home, />\s*\u4e0b\u8f7d\u753b\u5e03\s*</u, "canvas home must expose a visible download action");
assert.match(home, /selectedIds\.length \? projects\.filter[\s\S]*: projects;/, "home download must export selected canvases or all canvases");
assert.match(home, /exportCanvasProjects\(downloadProjects/, "home download must use the asset-aware canvas exporter");

console.log("Boundless Studio issue-fix contract tests passed");
