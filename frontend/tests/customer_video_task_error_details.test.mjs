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
const canvasNodePath = join(repoRoot, "src/app/canvas/components/canvas-node.tsx");

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
  const sandbox = { exports: {}, module: { exports: {} }, require, URL };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: path });
  return sandbox.module.exports;
}

const { customerVideoTaskError } = loadModule(helperPath);

assert.equal(
  customerVideoTaskError({
    status: "failed",
    failure_reason_short: "生成失败",
    postprocess_last_error: "protocol_only direct adapter failed: 您所在的国家/地区不可用。",
  }),
  "视频生成失败：当前视频供应商在所在国家/地区不可用，请切换可用的视频供应商或线路。",
  "a generic short failure must not hide the provider's actionable failure detail",
);

assert.equal(
  customerVideoTaskError({ status: "failed", failure_reason_short: "生成失败" }),
  "视频生成失败",
  "generic-only responses should keep a concise fallback",
);

assert.equal(
  customerVideoTaskError({ status: "failed", error: { message: "额度不足" } }),
  "视频生成失败：额度不足",
  "specific provider errors should retain their diagnostic detail",
);

const canvasNodeSource = readFileSync(canvasNodePath, "utf8");
assert.match(
  canvasNodeSource,
  /data-seedance2-generation-error/,
  "Seedance2 placeholders should expose persistent generation error details",
);
assert.ok(
  (canvasNodeSource.match(/<Seedance2PlaceholderErrorDetails/g) || []).length >= 4,
  "all Seedance2 placeholder layouts should render detailed generation errors",
);

console.log("customer video task error detail tests passed");
