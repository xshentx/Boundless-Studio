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

const pollUrlSource = source.slice(
  source.indexOf("function customerVideoPollUrl"),
  source.indexOf("function firstCustomerVideoString"),
);
const fetchTaskSource = source.slice(
  source.indexOf("async function fetchCustomerVideoTask"),
  source.indexOf("function isCustomerVideoTaskReady"),
);

assert.match(
  pollUrlSource,
  /function customerVideoTaskListUrl\(taskId: string, apiConfig: CustomerVideoApiConfig\)/,
  "blue22 轮询需要任务列表 URL 辅助函数，走 /v1/tasks 后按 task_id 查找",
);
assert.match(
  pollUrlSource,
  /routedLocalApiUrl\([\s\S]*"\/tasks"[\s\S]*\)/,
  "本地中转模式下 blue22 任务列表必须走 /local-relay-proxy/tasks -> /v1/tasks",
);
assert.match(
  pollUrlSource,
  /`\$\{apiBase\}\/v1\/tasks`/,
  "非本地中转模式下 blue22 任务列表必须走 /v1/tasks",
);
assert.match(
  fetchTaskSource,
  /customerVideoTaskListUrl\(taskId, apiConfig\)/,
  "单任务查询 404 时必须回退到 blue22 的 /v1/tasks 任务列表",
);
assert.match(
  fetchTaskSource,
  /findCustomerVideoTaskById\((?:listData|data), taskId\)/,
  "从 /v1/tasks 返回结果里按 task_id/id 找当前任务",
);

console.log("customer video blue22 task list fallback tests passed");

