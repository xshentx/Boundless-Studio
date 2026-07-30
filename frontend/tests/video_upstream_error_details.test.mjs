import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const helperPath = join(repoRoot, "src/app/canvas/utils/customer-video-task.ts");
const videoApiPath = join(repoRoot, "src/services/api/video.ts");
const canvasPagePath = join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx");
const nativeRelayVideoPath = join(repoRoot, "src/services/api/native-relay-video.ts");

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
  const sandbox = { exports: {}, module: { exports: {} }, require, URL, WeakSet, JSON };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: path });
  return sandbox.module.exports;
}

const {
  extractUpstreamError,
  customerVideoTaskError,
  isCustomerVideoTaskFailed,
  customerVideoResponseFailure,
} = loadModule(helperPath);

assert.equal(
  extractUpstreamError({
    message: "生成失败",
    detail: { error: { error_message: "上游内容审核拒绝：请修改提示词" } },
  }),
  "上游内容审核拒绝：请修改提示词",
  "a generic top-level message must not hide a nested provider error",
);

assert.equal(
  extractUpstreamError({ errors: [{ message: "模型暂不可用" }] }),
  "模型暂不可用",
  "errors arrays should retain their actionable message",
);

assert.equal(
  extractUpstreamError('{"data":{"error":{"failure_reason":"上游余额不足"}}}'),
  "上游余额不足",
  "JSON-encoded provider responses should be inspected recursively",
);

assert.equal(isCustomerVideoTaskFailed({ status: "cancelled" }), true);
assert.equal(isCustomerVideoTaskFailed({ status: "ERROR" }), true);
assert.equal(isCustomerVideoTaskFailed({ status: " expired " }), true);
assert.equal(isCustomerVideoTaskFailed({ status: "running" }), false);

assert.equal(
  customerVideoResponseFailure({
    code: 400,
    detail: { error_message: "\u4e0a\u6e38\u4f59\u989d\u4e0d\u8db3" },
  }),
  "\u4e0a\u6e38\u4f59\u989d\u4e0d\u8db3",
  "HTTP 200 error envelopes should surface the nested provider error",
);
assert.equal(customerVideoResponseFailure({ code: 0 }), "");
assert.equal(customerVideoResponseFailure({ code: 200 }), "");
assert.equal(customerVideoResponseFailure({ code: 201 }), "");
assert.equal(customerVideoResponseFailure({ code: "202" }), "");
assert.equal(customerVideoResponseFailure({ code: 299 }), "");
assert.equal(customerVideoResponseFailure({ success: true, code: "success" }), "");
assert.equal(customerVideoResponseFailure({ code: 300 }), "300");
assert.equal(customerVideoResponseFailure({ code: "400" }), "400");

assert.equal(
  customerVideoResponseFailure({
    success: false,
    data: { code: 500 },
    message: "\u4e0a\u6e38\u5185\u5bb9\u5ba1\u6838\u670d\u52a1\u6682\u4e0d\u53ef\u7528",
  }),
  "\u4e0a\u6e38\u5185\u5bb9\u5ba1\u6838\u670d\u52a1\u6682\u4e0d\u53ef\u7528",
  "a nested status code must not hide a concrete top-level provider message",
);

assert.equal(
  customerVideoTaskError({
    status: "failed",
    message: "视频生成失败",
    result: "https://cdn.example.com/result.mp4",
    detail: { errorMessage: "Provider rejected the reference image" },
  }),
  "视频生成失败：Provider rejected the reference image",
  "failed tasks should show provider details and never mistake a media URL for an error",
);

const videoApiSource = readFileSync(videoApiPath, "utf8");
assert.match(
  videoApiSource,
  /return extractUpstreamError\(value\)/,
  "the regular video API should use the recursive upstream error extractor",
);
assert.match(
  videoApiSource,
  /readErrorValue\(video\) \|\| "视频生成失败"/,
  "OpenAI-compatible failed tasks should retain their full upstream error shape",
);
assert.match(
  videoApiSource,
  /readErrorValue\(state\) \|\| `Seedance 视频生成/,
  "Seedance failed tasks should retain provider-specific errors",
);

assert.match(
  videoApiSource,
  /const upstreamError = extractUpstreamError\(errorPayload\)/,
  "JSON video responses should preserve their upstream error detail",
);
assert.match(
  videoApiSource,
  /catch \{\s*throw new Error\("\u89c6\u9891\u4e0b\u8f7d\u63a5\u53e3\u8fd4\u56de\u4e86\u65e0\u6548 JSON/,
  "invalid JSON download bodies must not be accepted as video files",
);
const resultUrlLoader = videoApiSource.slice(
  videoApiSource.indexOf("async function videoResultFromUrl("),
  videoApiSource.indexOf("function assertVideoConfig("),
);
assert.match(resultUrlLoader, /await assertVideoBlob\(blob\);\s*return \{ blob \};/);
assert.match(
  resultUrlLoader,
  /if \(!axios\.isAxiosError\(error\) \|\| error\.response\)/,
  "HTTP download failures must be surfaced instead of falling back to a broken video URL",
);
assert.match(
  resultUrlLoader,
  /response\?\.data instanceof Blob[\s\S]*await assertVideoBlob\(responseBlob\)/,
  "JSON error blobs from non-2xx download responses must preserve their upstream detail",
);
assert.doesNotMatch(
  resultUrlLoader,
  /try \{[\s\S]*assertVideoBlob[\s\S]*\} catch/,
  "a JSON upstream failure must not be swallowed by the URL fallback",
);

const canvasPageSource = readFileSync(canvasPagePath, "utf8");
assert.ok(
  (canvasPageSource.match(/extractUpstreamError\((?:listData|data)\)/g) || []).length >= 3,
  "customer video submit and polling failures should extract concrete response details",
);
assert.match(
  canvasPageSource,
  /const responseText = await response\.text\(\)/,
  "plain-text upstream error bodies should not be discarded when JSON parsing fails",
);

const nativeRelayVideoSource = readFileSync(nativeRelayVideoPath, "utf8");
assert.match(
  nativeRelayVideoSource,
  /data = \{ detail: response\.body \} as T/,
  "desktop native relay must preserve plain-text upstream error bodies",
);

console.log("video upstream error detail tests passed");