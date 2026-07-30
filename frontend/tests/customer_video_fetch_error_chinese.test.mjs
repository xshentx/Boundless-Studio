import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const helperPath = join(
  repoRoot,
  "src/app/canvas/utils/customer-video-errors.ts",
);

function loadModule(path) {
  const source = readFileSync(path, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const sandbox = { exports: {}, module: { exports: {} }, require };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: path });
  return sandbox.module.exports;
}

const { formatCustomerVideoRequestError } = loadModule(helperPath);

const formatted = formatCustomerVideoRequestError(new TypeError("Failed to fetch"), {
  action: "submit",
  baseUrl: "http://127.0.0.1:8006",
});

assert.match(formatted, /视频接口连接失败/, "network fetch failures should be shown in Chinese");
assert.match(formatted, /127\.0\.0\.1:8006/, "the Chinese error should include the target base URL for troubleshooting");
assert.doesNotMatch(formatted, /Failed to fetch/, "raw browser English fetch errors should not leak to the UI");

const serverMessage = formatCustomerVideoRequestError(new Error("Video task submit failed (401)"), {
  action: "submit",
  baseUrl: "https://birdsun.click",
});
assert.match(serverMessage, /视频任务提交失败/, "known English submit errors should be localized");
assert.match(serverMessage, /401/, "status code should be preserved");
assert.doesNotMatch(serverMessage, /Video task submit failed/, "known English submit errors should not leak to the UI");

const upstreamMessage = formatCustomerVideoRequestError(new Error("上游模型不可用"), {
  action: "poll",
});
assert.equal(
  upstreamMessage,
  "视频任务查询失败：上游模型不可用",
  "specific upstream errors should be preserved and labeled with the failed video action",
);

console.log("customer video Chinese error tests passed");
