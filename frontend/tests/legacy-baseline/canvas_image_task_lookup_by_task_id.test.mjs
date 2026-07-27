import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "../node_modules/typescript/lib/typescript.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasClientPath = join(
  repoRoot,
  "src/app/canvas/workspace/canvas-client-page.tsx",
);
const source = readFileSync(canvasClientPath, "utf8");

function extractFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}`);
  assert.notEqual(
    start,
    -1,
    `canvas image polling should define ${name} instead of matching only item.id`,
  );
  const braceStart = sourceText.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return sourceText.slice(start, index + 1);
    }
  }
  throw new Error(`could not extract ${name}`);
}

const helperSource = extractFunction(source, "findCanvasImageTaskById");
const { outputText } = ts.transpileModule(
  `${helperSource}\nexports.findCanvasImageTaskById = findCanvasImageTaskById;`,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  },
);
const sandbox = { exports: {}, module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(outputText, sandbox, { filename: canvasClientPath });
const { findCanvasImageTaskById } = sandbox.module.exports;

const canonicalTask = {
  id: "internal-row-id",
  task_id: "upstream-task-id",
  status: "succeeded",
  data: [{ url: "http://127.0.0.1:3001/images/generated.png" }],
};
const clientTask = {
  id: "another-row-id",
  client_task_id: "canvas-image-node-task",
  status: "success",
  data: [{ url: "http://127.0.0.1:3001/images/generated-2.png" }],
};

assert.equal(
  findCanvasImageTaskById([canonicalTask], "upstream-task-id"),
  canonicalTask,
  "polling must accept task_id returned by upstream task APIs",
);
assert.equal(
  findCanvasImageTaskById([clientTask], "canvas-image-node-task"),
  clientTask,
  "recovery polling must accept the persisted client_task_id",
);
assert.equal(
  findCanvasImageTaskById([canonicalTask], "internal-row-id"),
  canonicalTask,
  "existing id-based polling should keep working",
);

assert.match(
  source,
  /findCanvasImageTaskById\(taskList\.items,\s*taskId\)/,
  "pollCanvasImageTask should use the task_id-compatible lookup helper",
);

console.log("canvas image task lookup by task_id tests passed");
