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

const pollRelayVideoTaskSource = source.slice(
  source.indexOf("async function pollRelayVideoTask"),
  source.indexOf("async function buildRelayVideoPayload"),
);

assert.match(
  pollRelayVideoTaskSource,
  /relayVideoTaskListUrl\(config, route\)/,
  "普通视频轮询遇到 blue22 时必须能回退到 /v1/tasks 任务列表",
);
assert.match(
  source,
  /function relayVideoTaskListUrl\(config: AiConfig, route: ApiRequestRoute\)/,
  "需要统一的 blue22 任务列表 URL helper",
);
assert.match(
  source,
  /aiApiUrl\(config, route, "\/tasks"\)/,
  "本地中转下 /tasks 应通过 local relay proxy 转成上游 /v1/tasks",
);
assert.match(
  source,
  /function findRelayVideoTaskById\(data: RelayVideoResponse, taskId: string\)/,
  "需要从 /v1/tasks 结果里按 task_id/id 找当前视频任务",
);

console.log("relay video blue22 task list fallback tests passed");
