import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(webRoot);
register(pathToFileURL(join(webRoot, "scripts/ts-path-alias-loader.mjs")), pathToFileURL(`${webRoot}/`));

const {
  createApiRelayProvider,
  filterModelsByCapability,
  normalizeApiRelayProvider,
  providerModelsForCapability,
} = await import(pathToFileURL(join(webRoot, "src/stores/api-relay-config.ts")).href);

assert.deepEqual(
  filterModelsByCapability(["grok-4.5"], "text"),
  ["grok-4.5"],
  "Grok 对话模型必须被识别为文本模型",
);
assert.deepEqual(
  filterModelsByCapability(["grok-4.5"], "video"),
  [],
  "不能仅因模型名包含 grok 就将文本模型识别为视频模型",
);

const firstTextRelay = createApiRelayProvider({
  id: "first-text-relay",
  name: "OpenAI",
  capabilities: ["text"],
  models: ["gpt-5.5"],
});
const laterTextRelay = createApiRelayProvider({
  id: "later-text-relay",
  name: "Grok",
  capabilities: ["text"],
  models: ["grok-4.5"],
});

assert.deepEqual(providerModelsForCapability(firstTextRelay, "text"), ["gpt-5.5"]);
assert.deepEqual(
  providerModelsForCapability(laterTextRelay, "text"),
  ["grok-4.5"],
  "后添加的文本中转必须在模型路由中提供自己配置的 Grok 模型",
);

const migratedMixedRelay = normalizeApiRelayProvider({
  ...createApiRelayProvider({
    id: "persisted-mixed-relay",
    capabilities: ["text", "video"],
    models: ["gpt-5.5", "grok-4.5"],
  }),
  textModels: ["gpt-5.5"],
  videoModels: ["grok-4.5"],
});
assert.deepEqual(
  providerModelsForCapability(migratedMixedRelay, "text"),
  ["gpt-5.5", "grok-4.5"],
  "升级后必须按新规则重新计算旧供应商的非空文本模型缓存",
);
assert.deepEqual(
  providerModelsForCapability(migratedMixedRelay, "video"),
  [],
  "升级后必须从旧供应商的视频模型缓存中移除误分类的 Grok 文本模型",
);

assert.deepEqual(
  filterModelsByCapability(["grok-imagine-video"], "video"),
  ["grok-imagine-video"],
  "带明确视频标识的 Grok 模型仍应归类为视频模型",
);

const explicitlyCategorizedVideoRelay = normalizeApiRelayProvider({
  ...createApiRelayProvider({
    id: "explicit-video-relay",
    capabilities: ["video"],
    models: ["vendor-custom-v1"],
  }),
  textModels: [],
  videoModels: ["vendor-custom-v1"],
});
assert.deepEqual(
  providerModelsForCapability(explicitlyCategorizedVideoRelay, "video"),
  ["vendor-custom-v1"],
  "迁移 Grok 误分类时不能覆盖供应商显式配置的未知模型分类",
);

console.log("api relay Grok text routing tests passed");
