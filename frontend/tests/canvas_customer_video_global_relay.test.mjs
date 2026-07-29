import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasPagePath = join(
  repoRoot,
  "src/app/canvas/workspace/canvas-client-page.tsx",
);
const source = readFileSync(canvasPagePath, "utf8");

const importBlock = source.slice(0, source.indexOf("const DEFAULT_CUSTOMER_VIDEO_API_BASE"));
const configSource = source.slice(
  source.indexOf("function customerVideoGlobalRelayConfig"),
  source.indexOf("function buildSeedance2CustomerVideoPayload"),
);
const payloadSource = source.slice(
  source.indexOf("function buildSeedance2CustomerVideoPayload"),
  source.indexOf("async function requestCustomerVideoTask"),
);
const requestSource = source.slice(
  source.indexOf("async function requestCustomerVideoTask"),
  source.indexOf("async function fetchCustomerVideoTask"),
);
const pollSource = source.slice(
  source.indexOf("async function fetchCustomerVideoTask"),
  source.indexOf("function isCustomerVideoTaskReady"),
);
const seedanceSubmitSource = source.slice(
  source.indexOf("const videoApiConfig = buildCustomerVideoApiConfig"),
  source.indexOf("const created = await requestCustomerVideoTask"),
);
const seedanceReferencePrepareSource = source.slice(
  source.indexOf("const resolvedSlots = resolveSeedance2ReferenceSlots"),
  source.indexOf("const missingRequiredReferences = findMissingSeedance2RequiredReferences"),
);

assert.match(
  importBlock,
  /resolveApiRequestRoute[\s\S]*routedLocalApiUrl[\s\S]*routedLocalHeaders[\s\S]*ApiRequestRoute/,
  "Seedance2 customer video should reuse the same global relay routing utilities as canvas video generation",
);

assert.match(
  configSource,
  /resolveApiRequestRoute\([\s\S]*"video"[\s\S]*"videoGeneration"[\s\S]*\)/,
  "Seedance2 customer video config must resolve the global videoGeneration board route first",
);
assert.match(
  configSource,
  /route\.mode === "local"/,
  "Seedance2 customer video should only switch to relay proxy when a local/global relay route is active",
);
assert.doesNotMatch(
  configSource,
  /seedanceApiKey/,
  "Seedance2 customer video must not read API keys from node metadata; keys belong in global settings",
);

assert.match(
  payloadSource,
  /model = ""/,
  "Customer video payload builder should accept only a routed or explicitly selected dynamic model",
);
assert.doesNotMatch(payloadSource, /CUSTOMER_VIDEO_MODEL|seedance-2\.0-flash/);
assert.match(
  payloadSource,
  /model,/,
  "Customer video payload should send the routed video model",
);

assert.match(
  requestSource,
  /customerVideoCreateUrl\(apiConfig\)/,
  "Customer video submit must go through a URL helper that can choose the global relay proxy",
);
assert.doesNotMatch(
  requestSource,
  /`\$\{apiBase\}\/v1\/videos\/generations`/,
  "Customer video submit must not directly hardcode the legacy /v1 URL in the request function",
);

assert.match(
  pollSource,
  /customerVideoPollUrl\(taskId, apiConfig\)/,
  "Customer video polling must go through a URL helper that can choose the global relay proxy task endpoint",
);
assert.doesNotMatch(
  pollSource,
  /`\$\{apiBase\}\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}`/,
  "Customer video polling must not directly hardcode the legacy /api/tasks URL in the request function",
);

assert.match(
  pollSource,
  /nativePath:\s*customerVideoNativePollPath\(taskId, apiConfig\)/,
  "native video polling must use the route-aware endpoint helper",
);
assert.match(
  source,
  /function customerVideoNativePollPath[\s\S]*route\?\.mode === "local"[\s\S]*videos\/generations\/tasks\/[\s\S]*api\/tasks\//,
  "native video polling must preserve both global relay and legacy direct API paths",
);

assert.match(
  seedanceSubmitSource,
  /const videoApiConfig = buildCustomerVideoApiConfig\(latest, config, effectiveConfig\);[\s\S]*const payload = buildSeedance2CustomerVideoPayload\(latest, references, videoApiConfig\.model\);/,
  "Seedance2 workflow should build payload with the model selected by the global videoGeneration route",
);

assert.match(
  seedanceReferencePrepareSource,
  /references\s*=\s*await hydrateSeedance2CustomerReferencesForTransport\(\s*seedance2ResolvedSlotsToCustomerReferences\(resolvedSlots\),\s*imageToDataUrl\s*,?\s*\)/,
  "Seedance2 workflow must convert local storage/blob/backend-relative reference handles into upstream-loadable image data before building the video payload",
);

console.log("canvas customer video global relay tests passed");
