import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = repoRoot;
process.chdir(webRoot);
register(pathToFileURL(join(webRoot, "scripts/ts-path-alias-loader.mjs")), pathToFileURL(`${webRoot}/`));

const { createApiRelayProvider, ensureApiRelaySettings } = await import(pathToFileURL(join(webRoot, "src/stores/api-relay-config.ts")).href);
const { resolveApiRequestRoute } = await import(pathToFileURL(join(webRoot, "src/services/api/ai-routing.ts")).href);
const { useConfigStore } = await import(pathToFileURL(join(webRoot, "src/stores/use-config-store.ts")).href);

const relay = createApiRelayProvider({
  id: "relay-1",
  name: "Relay 1",
  baseUrl: "https://relay.example.com",
  apiKey: "sk-test",
  capabilities: ["text", "image", "video", "audio"],
  models: ["gpt-5.5", "gpt-image-2", "relay-image-model", "seedance-2.0", "gpt-4o-mini-tts"],
});

const normalized = ensureApiRelaySettings({
  channelMode: "local",
  apiRelays: [relay],
  apiRouting: { image: { providerId: "", model: "" } },
});

assert.deepEqual(normalized.apiRouting.image, { providerId: "", model: "" });
assert.equal(normalized.apiRouting.text.providerId, "relay-1");

const defaultRouteConfig = ensureApiRelaySettings({
  channelMode: "local",
  model: "canvas-image-model",
  imageModel: "canvas-image-model",
  apiRelays: [relay],
  apiRouting: { image: { providerId: "", model: "" } },
  apiBoardRouting: { imageGeneration: { mode: "inherit", providerId: "", model: "" } },
});

const defaultImageRoute = resolveApiRequestRoute(defaultRouteConfig, "image", "canvas-image-model");
assert.equal(defaultImageRoute.mode, "remote");
assert.equal(defaultImageRoute.model, "canvas-image-model");
assert.equal(useConfigStore.getState().isAiConfigReady(defaultRouteConfig, "canvas-image-model"), true);

const relayRouteConfig = ensureApiRelaySettings({
  channelMode: "local",
  model: "relay-image-model",
  imageModel: "relay-image-model",
  apiRelays: [relay],
  apiRouting: { image: { providerId: "relay-1", model: "relay-image-model" } },
});

const relayImageRoute = resolveApiRequestRoute(relayRouteConfig, "image", "relay-image-model");
assert.equal(relayImageRoute.mode, "local");
assert.equal(relayImageRoute.provider.id, "relay-1");

const inheritedBoardRoute = resolveApiRequestRoute(defaultRouteConfig, "image", "canvas-image-model", "imageGeneration");
assert.equal(inheritedBoardRoute.mode, "remote");

const customBoardConfig = ensureApiRelaySettings({
  ...defaultRouteConfig,
  apiBoardRouting: {
    imageGeneration: { mode: "custom", providerId: "relay-1", model: "relay-image-model" },
  },
});
const customBoardRoute = resolveApiRequestRoute(customBoardConfig, "image", "", "imageGeneration");
assert.equal(customBoardRoute.mode, "local");
assert.equal(customBoardRoute.provider.id, "relay-1");

console.log("api relay default model routing tests passed");
