import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = join(repoRoot, "src/services/api/text-response-errors.ts");

function loadModule(path) {
  const source = readFileSync(path, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: path });
  return sandbox.module.exports;
}

const { detectTextApiResponseError } = loadModule(helperPath);

const peckaboPage = `<!DOCTYPE html>
<html><head><title>Bad Gateway</title></head><body>
<h1>BAD_GATEWAY</h1><h2>502</h2>
<p>upstream server error, unable to complete the request</p>
<footer>Protected By peckabo.io</footer>
</body></html>`;
const peckaboError = detectTextApiResponseError(peckaboPage);
assert.match(peckaboError, /文本生成失败/);
assert.match(peckaboError, /上游网关异常（502）/);
assert.doesNotMatch(peckaboError, /<html|peckabo|upstream server error/i);

const nginxError = detectTextApiResponseError(
  "<html><head><title>502 Bad Gateway</title></head><body>nginx</body></html>",
  { status: 502, contentType: "text/html; charset=utf-8" },
);
assert.equal(
  nginxError,
  "文本生成失败：上游网关异常（502），请稍后重试或检查中转 API",
);

const genericHtmlError = detectTextApiResponseError(
  "<!doctype html><html><head><title>Error</title></head><body>Request failed</body></html>",
  { contentType: "text/html", operation: "图片生成失败" },
);
assert.equal(
  genericHtmlError,
  "图片生成失败：中转返回了异常网页内容，请检查中转 API 或稍后重试",
);

assert.equal(
  detectTextApiResponseError("BAD_GATEWAY 503 upstream server error, unable to complete the request"),
  "文本生成失败：上游网关异常（503），请稍后重试或检查中转 API",
);
assert.equal(
  detectTextApiResponseError('{"choices":[{"message":{"content":"正常回答"}}]}', {
    contentType: "application/json",
  }),
  null,
);
assert.equal(
  detectTextApiResponseError('{"choices":[{"message":{"content":"<html><body>模型生成的网页</body></html>"}}]}', {
    contentType: "text/html",
  }),
  null,
  "HTML inside a valid JSON envelope must remain ordinary model output even when a relay mislabels the content type",
);
assert.equal(
  detectTextApiResponseError('data: {"choices":[{"delta":{"content":"正常流式回答"}}]}\n\ndata: [DONE]', {
    contentType: "text/html",
  }),
  null,
  "a valid SSE payload must not be rejected solely because a relay mislabels the content type",
);

assert.equal(
  detectTextApiResponseError("下面解释 HTML 和 502 Bad Gateway 的常见排查方法。"),
  null,
  "ordinary model text discussing a gateway error must not be rejected",
);

const imageSource = readFileSync(join(repoRoot, "src/services/api/image.ts"), "utf8");
const responseGuardIndex = imageSource.indexOf("const responseError = detectTextApiResponseError(response.data");
const finalParseIndex = imageSource.indexOf("const fullAnswer = parseTextResponsePayload(response.data)");
assert.ok(responseGuardIndex >= 0 && responseGuardIndex < finalParseIndex, "raw HTML must be rejected before final text parsing and onDelta");
assert.match(imageSource, /detectTextApiResponseError\(responseData,[\s\S]*?operation: fallback/, "Axios HTML errors must also be sanitized");

const canvasSource = readFileSync(
  join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);
const rawGuardIndex = canvasSource.indexOf("const initialResponseError = detectTextApiResponseError(raw)");
const repairIndex = canvasSource.indexOf("buildStoryAnalysisRepairPrompt(", rawGuardIndex);
assert.ok(rawGuardIndex >= 0 && rawGuardIndex < repairIndex, "gateway pages must be rejected before JSON repair starts another request");
assert.match(canvasSource, /storyAnalysisStatus: NODE_STATUS_ERROR,[\s\S]*?storyGenerationStatus:[\s\S]*?NODE_STATUS_LOADING[\s\S]*?\? "idle"[\s\S]*?storyAnalysisRaw: previousStoryAnalysisRaw/, "failed analysis must leave loading state and remove invalid raw HTML");
assert.match(canvasSource, /finally \{\s*setRunningNodeId\(null\);/, "failed analysis must release the running node lock");

console.log("text API HTML error guard tests passed");
