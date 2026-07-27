import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot);
register(pathToFileURL(join(repoRoot, "scripts/ts-path-alias-loader.mjs")), pathToFileURL(`${repoRoot}/`));

const { createApiRelayProvider, ensureApiRelaySettings, providerModelsForCapability } = await import(
  pathToFileURL(join(repoRoot, "src/stores/api-relay-config.ts")).href
);

const provider = createApiRelayProvider({
  id: "relay-test",
  name: "Relay Test",
  baseUrl: "https://relay.example.com",
  apiKey: "sk-test",
  capabilities: ["text", "image", "video", "audio"],
  models: ["gpt-5.5", "gpt-image-2", "seedance-2.0", "gpt-4o-mini-tts"],
});
assert.deepEqual(providerModelsForCapability(provider, "text"), ["gpt-5.5"]);
assert.deepEqual(providerModelsForCapability(provider, "image"), ["gpt-image-2"]);
assert.deepEqual(providerModelsForCapability(provider, "video"), ["seedance-2.0"]);
assert.deepEqual(providerModelsForCapability(provider, "audio"), ["gpt-4o-mini-tts"]);

const migrated = ensureApiRelaySettings({
  channelMode: "remote",
  apiRelays: [provider],
  apiRelayAdvanced: { allowCustomModel: true },
  apiRouting: {
    text: { source: "platform", providerId: "", model: "" },
    image: { source: "localPool", providerId: "", model: "gpt-image-2" },
    video: { source: "platform", providerId: "", model: "" },
    audio: { source: "platform", providerId: "", model: "" },
  },
});
assert.equal(migrated.apiRelayAdvanced.allowCustomModel, false, "relay-only dropdown routing must reject custom model names");
for (const capability of ["text", "image", "video", "audio"]) {
  assert.equal(migrated.apiRouting[capability].source, "relay", `${capability} must migrate to relay-only routing`);
  assert.equal(migrated.apiRouting[capability].providerId, "", `${capability} must require an explicit relay selection after migration`);
}

const dialogSource = readFileSync(join(repoRoot, "src/components/api-access-settings-dialog.tsx"), "utf8");
assert.doesNotMatch(dialogSource, /title="\u5e73\u53f0\u901a\u9053"|<option value="platform">|<option value="localPool">/u);
assert.doesNotMatch(dialogSource, /<datalist|list=\{`api-(?:board-)?route-/u, "route models must use native select controls");
assert.match(dialogSource, /useState<ApiSettingsTab>\("relay"\)/u, "settings must default to the relay tab");
assert.match(dialogSource, /role="tablist"[\s\S]*setSettingsTab\("relay"\)[\s\S]*中转设置[\s\S]*setSettingsTab\("routing"\)[\s\S]*模型路由设置[\s\S]*setSettingsTab\("update"\)[\s\S]*软件更新/u, "settings must expose relay, routing, and update tabs at the top");
assert.match(dialogSource, /relative flex h-\[min\(760px,calc\(100vh-3rem\)\)\][^"]*w-\[min\(94vw,880px\)\][^"]*flex-col overflow-hidden/u, "all settings tabs must share one stable dialog frame");
assert.match(dialogSource, /flex min-h-0 flex-1 flex-col[^"]*[\s\S]*inline-flex shrink-0 self-start[^"]*[\s\S]*mt-5 min-h-0 flex-1 overflow-y-auto pr-1[\s\S]*mt-5 flex shrink-0 justify-end/u, "only the settings content area may scroll while tabs and footer remain fixed");
assert.match(dialogSource, /settingsTab === "relay" \?[\s\S]*中转地址[\s\S]*settingsTab === "routing" \?[\s\S]*模型路由[\s\S]*板块模型路由（可选）[\s\S]*高级[\s\S]*<UpdateSettingsPanel/u, "routing, board routing, advanced, and updater settings must live in their expected tabs");
assert.match(dialogSource, /function RouteRow[\s\S]*providerModelsForCapability\(provider, capability\)[\s\S]*<ModelSelectControl[\s\S]*onChange=\{\(model\) => onRouteChange\(capability, \{ model \}\)\}/u);
assert.match(dialogSource, /function BoardRouteRow[\s\S]*providerModelsForCapability\(provider, definition\.capability\)[\s\S]*<ModelSelectControl[\s\S]*onChange=\{\(model\) => onRouteChange\(definition\.key, \{ model \}\)\}/u);

const routingSource = readFileSync(join(repoRoot, "src/services/api/ai-routing.ts"), "utf8");
const routeResolverSource = routingSource.slice(
  routingSource.indexOf("export function resolveApiRequestRoute"),
  routingSource.indexOf("export function routedLocalApiUrl"),
);
assert.match(routeResolverSource, /mode:\s*"local"/u);
assert.doesNotMatch(routeResolverSource, /mode:\s*"remote"|mode:\s*"localPool"|shouldUsePlatformAccountPool|resolveApiRouteSource/u);

const configStoreSource = readFileSync(join(repoRoot, "src/stores/use-config-store.ts"), "utf8");
assert.match(configStoreSource, /export const defaultConfig[\s\S]*channelMode:\s*"local"/u);
assert.match(configStoreSource, /merge:\s*\([\s\S]*channelMode:\s*"local"/u);
const readinessSource = configStoreSource.slice(
  configStoreSource.indexOf("function isAiConfigReady"),
  configStoreSource.indexOf("export const useConfigStore"),
);
assert.match(readinessSource, /if \(!normalized\.apiRouting\[capability\]\.providerId\) return false/u);
assert.doesNotMatch(readinessSource, /shouldUsePlatformAccountPool|channelMode !== "local"/u);

console.log("relay-only API settings and typed model dropdown tests passed");
