import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "../node_modules/typescript/lib/typescript.js";

const stageRoot = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(
  stageRoot,
  "../src/app/canvas/utils/canvas-errors.ts",
);
const source = readFileSync(sourcePath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const sandbox = { Error, exports: {}, module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(outputText, sandbox, { filename: sourcePath });
const { formatCanvasGenerationError } = sandbox.module.exports;

assert.equal(
  formatCanvasGenerationError(new Error("上游返回了文字回复，未生成图片：图片生成失败")),
  "上游图片生成失败，请重试",
);
assert.equal(
  formatCanvasGenerationError(new Error("上游拒绝生成图片：图片生成失败")),
  "上游图片生成失败，请重试",
);
assert.equal(
  formatCanvasGenerationError(new Error("图片任务超时未返回结果，已自动结束（超过 300 秒）")),
  "图片任务超时未返回结果，已自动结束（超过 300 秒）",
);

console.log("canvas upstream image failure mapping tests passed");
