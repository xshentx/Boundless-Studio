import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = repoRoot;
process.chdir(webRoot);
register(pathToFileURL(join(webRoot, "scripts/ts-path-alias-loader.mjs")), pathToFileURL(`${webRoot}/`));

const {
  createApiRelayProvider,
  ensureApiRelaySettings,
  fillMissingCapabilityRoutes,
  filterModelsByCapability,
  resolveBoardCapabilityRoute,
  resolveCapabilityRoute,
} = await import(pathToFileURL(join(webRoot, "src/stores/api-relay-config.ts")).href);

assert.deepEqual(
  filterModelsByCapability(["seedance-2.0", "seedance-2.0-flash", "gpt-5.5"], "video"),
  ["seedance-2.0", "seedance-2.0-flash"],
  "seedance 手填模型必须被识别为视频模型",
);

const textImageRelay = createApiRelayProvider({
  id: "birdsun",
  name: "birdsun",
  baseUrl: "https://birdsun.click",
  apiKey: "sk-bird",
  capabilities: ["text", "image", "video", "audio"],
  models: ["gpt-5.5", "gpt-image-2", "grok-imagine-video", "gpt-4o-mini-tts"],
});
const blue22VideoRelay = createApiRelayProvider({
  id: "blue22",
  name: "blue22 视频中转",
  baseUrl: "https://api.blue22.click",
  apiKey: "sk-blue",
  capabilities: ["video"],
  models: ["seedance-2.0", "seedance-2.0-flash"],
});

const normalized = ensureApiRelaySettings({
  channelMode: "local",
  videoModel: "grok-imagine-video",
  apiRelays: [textImageRelay, blue22VideoRelay],
  apiRouting: {
    video: { providerId: "", model: "grok-imagine-video" },
  },
});

assert.deepEqual(
  normalized.apiRouting.video,
  { source: "relay", providerId: "", model: "" },
  "显式空视频路由必须保留画布默认流程",
);
const inferredVideoRoute = resolveCapabilityRoute(normalized, "video", "seedance-2.0");
assert.equal(inferredVideoRoute.provider.id, "blue22", "空视频路由应根据工作流选择的模型自动匹配中转");
assert.equal(inferredVideoRoute.model, "seedance-2.0", "自动匹配中转后必须保留工作流选择的模型");

const inheritedBoardVideoRoute = resolveBoardCapabilityRoute(normalized, "videoGeneration", "seedance-2.0");
assert.equal(inheritedBoardVideoRoute.provider.id, "blue22", "继承模式的视频生成板块应根据工作流模型自动匹配中转");
assert.equal(inheritedBoardVideoRoute.model, "seedance-2.0");

assert.throws(
  () => resolveCapabilityRoute(normalized, "video", ""),
  /未配置视频中转 API/,
  "没有选择模型且没有配置视频路由时仍应提示配置中转",
);

const videoServiceSource = readFileSync(join(webRoot, "src/services/api/video.ts"), "utf8");
assert.match(
  videoServiceSource,
  /resolveApiRequestRoute\(config, "video", config\.model \|\| config\.videoModel, boardRouteKey\)/,
  "视频工作流调用板块路由时必须传递节点选择的模型",
);
assert.doesNotMatch(videoServiceSource, /boardRouteKey \? "" : config\.model \|\| config\.videoModel/);

const filled = fillMissingCapabilityRoutes(
  { video: { providerId: "", model: "grok-imagine-video" } },
  blue22VideoRelay,
);
assert.equal(filled.video.providerId, "blue22");
assert.equal(
  filled.video.model,
  "seedance-2.0",
  "补全视频路由时，provider 自带 seedance 模型应优先于旧的空 provider 模型",
);

const filledWhenRouteAlreadyUsesBlue22 = fillMissingCapabilityRoutes(
  { video: { providerId: "blue22", model: "" } },
  blue22VideoRelay,
);
assert.equal(filledWhenRouteAlreadyUsesBlue22.video.providerId, "blue22");
assert.equal(
  filledWhenRouteAlreadyUsesBlue22.video.model,
  "seedance-2.0",
  "先添加空中转、再填写 blue22 地址时，已指向该中转的视频路由也必须自动补上 seedance 模型",
);

const refreshedStaleBlue22Model = fillMissingCapabilityRoutes(
  { video: { providerId: "blue22", model: "grok-imagine-video" } },
  blue22VideoRelay,
);
assert.equal(refreshedStaleBlue22Model.video.providerId, "blue22");
assert.equal(
  refreshedStaleBlue22Model.video.model,
  "seedance-2.0",
  "blue22 视频路由已经选中该中转时，不能继续固化旧的 grok 视频模型",
);

console.log("api relay seedance video routing tests passed");
