import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const videoServicePath = join(
  repoRoot,
  "src/services/api/video.ts",
);
const source = readFileSync(videoServicePath, "utf8");

const createRelayVideoTaskSource = source.slice(
  source.indexOf("async function createRelayVideoTask"),
  source.indexOf("async function pollRelayVideoTask"),
);
const pollRelayVideoTaskSource = source.slice(
  source.indexOf("async function pollRelayVideoTask"),
  source.indexOf("async function buildRelayVideoPayload"),
);

assert.match(
  createRelayVideoTaskSource,
  /aiApiUrl\(config, route, "\/videos\/generations"\)/,
  "relay video creation must use aiApiUrl so local canvas video generation goes through the configured relay proxy",
);
assert.doesNotMatch(
  createRelayVideoTaskSource,
  /axios\.post<RelayVideoResponse>\("\/v1\/videos\/generations"/,
  "relay video creation must not hardcode /v1 because it bypasses the local relay proxy",
);

assert.match(
  pollRelayVideoTaskSource,
  /aiApiUrl\(config, route, `\/videos\/generations\/tasks\/\$\{encodeURIComponent\(task\.id\)\}`\)/,
  "relay video polling must use aiApiUrl so local canvas video polling goes through the configured relay proxy",
);
assert.doesNotMatch(
  pollRelayVideoTaskSource,
  /axios\.get<RelayVideoResponse>\(`\/v1\/videos\/generations\/tasks\/\$\{encodeURIComponent\(task\.id\)\}`/,
  "relay video polling must not hardcode /v1 because it bypasses the local relay proxy",
);

console.log("canvas video relay routing tests passed");
