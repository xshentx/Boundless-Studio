import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = join(
  repoRoot,
  "src/app/canvas/workspace/canvas-client-page.tsx",
);
const source = readFileSync(pagePath, "utf8");
const effectStart = source.indexOf("const seedance2FaceEditNode = seedance2FaceEditNodeId");
const effectEnd = source.indexOf("const splitNode = splitNodeId ?", effectStart);
assert.ok(effectStart >= 0 && effectEnd > effectStart, "Seedance2 face edit effect should exist");
const effectSource = source.slice(effectStart, effectEnd);

const storageKeyCheck = effectSource.indexOf("const storageKey = seedance2FaceEditNode.metadata?.storageKey;");
const directSourceCheck = effectSource.indexOf("const directSource =");
assert.ok(storageKeyCheck >= 0, "Seedance2 face edit effect should read storageKey");
assert.ok(directSourceCheck >= 0, "Seedance2 face edit effect should read directSource");
assert.ok(
  storageKeyCheck < directSourceCheck,
  "Seedance2 face edit should prefer storageKey over content/backendUrl so canvas export can use a local object URL",
);

console.log("seedance2 face editor source priority tests passed");
