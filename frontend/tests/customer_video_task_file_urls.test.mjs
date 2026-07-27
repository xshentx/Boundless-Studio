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
  "src/app/canvas/utils/customer-video-task.ts",
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
  const sandbox = { exports: {}, module: { exports: {} }, require, URL };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: path });
  return sandbox.module.exports;
}

const { customerVideoTaskFileUrls, isCustomerVideoTaskReady } = loadModule(helperPath);

assert.deepEqual(
  Array.from(customerVideoTaskFileUrls({ file_urls: ["https://cdn.example/video-a.mp4"] })),
  ["https://cdn.example/video-a.mp4"],
  "existing file_urls responses should still be accepted",
);

assert.deepEqual(
  Array.from(customerVideoTaskFileUrls({ files: ["https://cdn.example/video-b.mp4"] })),
  ["https://cdn.example/video-b.mp4"],
  "Blue22/compatible task responses that only return files should be accepted as ready",
);

assert.deepEqual(
  Array.from(customerVideoTaskFileUrls({ result: "https://cdn.example/video-c.mp4" })),
  ["https://cdn.example/video-c.mp4"],
  "task responses that put the video URL in result should be accepted as ready",
);

assert.deepEqual(
  Array.from(customerVideoTaskFileUrls({ content: { video_url: "http://0.0.0.0:8006/files/video-d.mp4" } }, "http://127.0.0.1:8006")),
  ["http://127.0.0.1:8006/files/video-d.mp4"],
  "0.0.0.0 result URLs should be rewritten to the configured local host",
);

assert.equal(isCustomerVideoTaskReady({ files: ["https://cdn.example/video-b.mp4"] }), true);
assert.equal(isCustomerVideoTaskReady({ status: "succeeded" }), false);

console.log("customer video task file URL tests passed");
