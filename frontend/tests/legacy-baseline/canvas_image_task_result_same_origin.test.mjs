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
  assert.notEqual(start, -1, `canvas image tasks should define ${name}`);
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

const functionNames = [
  "imageTaskToGeneratedImage",
  "extractBackendImageRel",
  "normalizeCanvasBackendImageSource",
  "isLocalCanvasImageSource",
  "normalizeCanvasImageUrl",
];
const helperSource = functionNames.map((name) => extractFunction(source, name)).join("\n");
const { outputText } = ts.transpileModule(
  `${helperSource}\nexports.imageTaskToGeneratedImage = imageTaskToGeneratedImage;`,
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  },
);
const sandbox = {
  exports: {},
  module: { exports: {} },
  URL,
  window: {
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      origin: "http://127.0.0.1:3001",
    },
  },
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(outputText, sandbox, { filename: canvasClientPath });
const { imageTaskToGeneratedImage } = sandbox.module.exports;

const task = {
  id: "canvas-result-task",
  status: "success",
  mode: "generate",
  created_at: "2026-07-20 18:21:24",
  updated_at: "2026-07-20 18:23:34",
  data: [
    {
      url: "http://192.168.21.11:3001/images/2026/07/20/result.png?token=signed-result-token",
    },
  ],
};

const generated = imageTaskToGeneratedImage(task);

assert.equal(
  generated?.dataUrl,
  "/images/2026/07/20/result.png?token=signed-result-token",
  "canvas should fetch backend result images through the current page origin",
);
assert.equal(
  generated?.backendUrl,
  "/images/2026/07/20/result.png?token=signed-result-token",
  "persisted backend URLs should not retain an unreachable LAN host",
);
assert.equal(generated?.backendRel, "2026/07/20/result.png");

console.log("canvas image task result same-origin tests passed");
