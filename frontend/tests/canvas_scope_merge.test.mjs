import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const mergePath = join(
  repoRoot,
  "src/app/canvas/stores/canvas-project-merge.ts",
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

const { mergeCanvasProjectsByScope } = loadModule(mergePath);

const adminProject = {
  id: "gqtgAPRgMApfbQ0Ar0iJq",
  title: "无限画布 1",
  updatedAt: "2026-07-17T04:08:18.921Z",
  nodes: Array.from({ length: 77 }, (_, index) => ({ id: `admin-node-${index}`, content: index === 0 ? "小军和老师" : "" })),
  connections: Array.from({ length: 123 }, (_, index) => ({ id: `admin-conn-${index}` })),
};
const anonymousProject = {
  id: "gqtgAPRgMApfbQ0Ar0iJq",
  title: "无限画布 1",
  updatedAt: "2026-07-17T04:58:53.336Z",
  nodes: Array.from({ length: 63 }, (_, index) => ({ id: `anon-node-${index}`, content: "狼抓羊" })),
  connections: Array.from({ length: 43 }, (_, index) => ({ id: `anon-conn-${index}` })),
  cachedImagePayload: "x".repeat(500_000),
};
const anonymousOnly = {
  id: "anonymous-only",
  title: "匿名独有画布",
  updatedAt: "2026-07-16T08:10:45.626Z",
  nodes: [],
  connections: [],
};

const merged = mergeCanvasProjectsByScope([
  { scope: "anonymous", projects: [anonymousProject, anonymousOnly] },
  { scope: "admin", projects: [adminProject] },
]);

assert.equal(merged.projects.find((project) => project.id === "gqtgAPRgMApfbQ0Ar0iJq")?.nodes.length, 77, "same-id conflicts should keep the richer project under the original id so direct links open the full canvas");
assert.equal(merged.projects.find((project) => project.id === "anonymous-only")?.title, "匿名独有画布", "unique projects from either scope should be kept");
assert.ok(
  merged.projects.some((project) => project.id !== "gqtgAPRgMApfbQ0Ar0iJq" && project.title.includes("合并备份") && project.nodes.length === 63),
  "the losing same-id project should be preserved as a deterministic merged backup instead of being discarded",
);
assert.ok(
  merged.projects.findIndex((project) => project.id === "gqtgAPRgMApfbQ0Ar0iJq") <
    merged.projects.findIndex((project) => String(project.title).includes("合并备份")),
  "merged backups should be listed after the primary project even if their timestamps are newer",
);
const mergedIds = Array.from(merged.projects, (project) => project.id);
assert.equal(new Set(mergedIds).size, mergedIds.length, "merged project ids must be unique");

console.log("canvas scope merge tests passed");
