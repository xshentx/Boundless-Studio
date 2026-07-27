import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const helperPath = join(repoRoot, "src/services/api/relay-errors.ts");

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

const { formatRelayModelsError } = loadModule(helperPath);

const html404 = "<html> <head><title>404 Not Found</title></head> <body> <center><h1>404 Not Found</h1></center> <hr><center>openresty</center> </body> </html>";
const formatted404 = formatRelayModelsError({ response: { status: 404, data: html404 } }, "https://api.blue22.click");
assert.match(formatted404, /读取模型失败/, "models read failures should be in Chinese");
assert.match(formatted404, /404/, "status code should be kept");
assert.match(formatted404, /\/models|模型列表接口/, "message should explain the /models endpoint problem");
assert.match(formatted404, /api\.blue22\.click/, "message should include the relay base URL");
assert.doesNotMatch(formatted404, /<html>|openresty|Not Found/i, "raw HTML server pages should not be shown to users");

const formatted401 = formatRelayModelsError({ response: { status: 401, data: { error: { message: "Unauthorized" } } } }, "https://birdsun.click");
assert.match(formatted401, /鉴权失败|API Key|权限/, "401 errors should guide the user to check API key/permissions");
assert.doesNotMatch(formatted401, /Unauthorized/, "known auth errors should be localized");

console.log("relay models Chinese error tests passed");
