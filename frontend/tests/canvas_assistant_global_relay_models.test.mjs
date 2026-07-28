import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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

const assistantPath = join(frontendRoot, "src/app/canvas/components/canvas-assistant-panel.tsx");
const requestConfigPath = join(frontendRoot, "src/app/canvas/utils/canvas-assistant-request-config.ts");
const relayConfigPath = join(frontendRoot, "src/stores/api-relay-config.ts");
const configStorePath = join(frontendRoot, "src/stores/use-config-store.ts");
const assistantSource = readFileSync(assistantPath, "utf8");
const configStoreSource = readFileSync(configStorePath, "utf8");

assert.doesNotMatch(
  assistantSource,
  /CANVAS_ASSISTANT_(?:TEXT|IMAGE)_MODELS|allowedModels=/,
  "canvas assistant must not keep a hard-coded text or image model whitelist",
);
assert.match(
  assistantSource,
  /pickAssistantModel\([^\n]+effectiveConfig\.textModels\)/,
  "canvas assistant text selection must use the global effective text model list",
);
assert.match(
  assistantSource,
  /pickAssistantModel\([^\n]+effectiveConfig\.imageModels\)/,
  "canvas assistant image selection must use the global effective image model list",
);
assert.match(
  configStoreSource,
  /relayTextModels = enabledRelayModelsForCapability\(config\.apiRelays, "text"\)[\s\S]*relayImageModels = enabledRelayModelsForCapability\(config\.apiRelays, "image"\)/,
  "effective config must aggregate text and image models from enabled relays",
);

const relayConfig = loadTsModule(relayConfigPath);
const { buildCanvasAssistantRequestConfig } = loadTsModule(requestConfigPath, {
  "@/stores/api-relay-config": relayConfig,
});

const provider = (id, capabilities, { text = [], image = [] }, enabled = true) => ({
  id,
  name: id,
  baseUrl: `https://${id}.example.com`,
  apiKey: "key",
  enabled,
  capabilities,
  models: [...text, ...image],
  textModels: text,
  imageModels: image,
  videoModels: [],
  audioModels: [],
  timeoutMs: 360000,
  remark: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const textPrimary = provider("text-primary", ["text"], { text: ["text-a"] });
const textSecondary = provider("text-secondary", ["text"], { text: ["text-b", "text-c"] });
const imagePrimary = provider("image-primary", ["image"], { image: ["image-a"] });
const imageSecondary = provider("image-secondary", ["image"], { image: ["image-b"] });
const disabled = provider("disabled", ["text", "image"], { text: ["text-disabled"], image: ["image-disabled"] }, false);
const relays = [textPrimary, textSecondary, imagePrimary, imageSecondary, disabled];

assert.deepEqual(
  relayConfig.providersForCapability(relays, "text").flatMap((item) => relayConfig.providerModelsForCapability(item, "text")),
  ["text-a", "text-b", "text-c"],
  "all enabled relay text models must be globally selectable",
);
assert.deepEqual(
  relayConfig.providersForCapability(relays, "image").flatMap((item) => relayConfig.providerModelsForCapability(item, "image")),
  ["image-a", "image-b"],
  "all enabled relay image models must be globally selectable",
);

const baseConfig = {
  model: "",
  textModel: "text-b",
  imageModel: "image-b",
  apiRelays: relays,
  apiRouting: {
    text: { source: "relay", providerId: textPrimary.id, model: "text-a" },
    image: { source: "relay", providerId: imagePrimary.id, model: "image-a" },
    video: { source: "relay", providerId: "", model: "" },
    audio: { source: "relay", providerId: "", model: "" },
  },
  apiBoardRouting: {
    storyDirector: { mode: "inherit", providerId: "", model: "" },
    videoWorkflowText: { mode: "inherit", providerId: "", model: "" },
    imagePrompt: { mode: "inherit", providerId: "", model: "" },
    videoPrompt: { mode: "inherit", providerId: "", model: "" },
    imageGeneration: { mode: "inherit", providerId: "", model: "" },
    videoGeneration: { mode: "inherit", providerId: "", model: "" },
  },
};

const textRequest = buildCanvasAssistantRequestConfig(baseConfig, "ask");
assert.ok(textRequest);
assert.equal(textRequest.config.apiBoardRouting.imagePrompt.providerId, textSecondary.id);
assert.equal(textRequest.config.apiBoardRouting.imagePrompt.model, "text-b");
const resolvedText = relayConfig.resolveBoardCapabilityRoute(textRequest.config, textRequest.boardRouteKey);
assert.equal(resolvedText.provider.id, textSecondary.id, "selected text model must route to the relay that owns it");
assert.equal(resolvedText.model, "text-b");

const imageRequest = buildCanvasAssistantRequestConfig(baseConfig, "image");
assert.ok(imageRequest);
assert.equal(imageRequest.config.apiBoardRouting.imageGeneration.providerId, imageSecondary.id);
assert.equal(imageRequest.config.apiBoardRouting.imageGeneration.model, "image-b");
const resolvedImage = relayConfig.resolveBoardCapabilityRoute(imageRequest.config, imageRequest.boardRouteKey);
assert.equal(resolvedImage.provider.id, imageSecondary.id, "selected image model must route to the relay that owns it");
assert.equal(resolvedImage.model, "image-b");

console.log("canvas assistant global relay model tests passed");
