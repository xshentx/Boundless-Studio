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

assert.match(
  source,
  /function\s+seedance2FaceEditFallbackSource/,
  "Seedance2 face edit should centralize fallback source selection",
);
assert.match(
  source,
  /const backendRel = normalizeCanvasBackendRel\(metadata\?\.backendRel\)/,
  "Seedance2 face edit must reject backendRel route traversal before creating a same-origin URL",
);
assert.match(
  source,
  /metadata\?\.backendRel[\s\S]*`\/images\/\$\{backendRel\}`/,
  "Seedance2 face edit should turn backendRel into a same-origin /images/<rel> URL to avoid CORS image load failures",
);
assert.match(
  source,
  /const directSource = seedance2FaceEditFallbackSource\(seedance2FaceEditNode\.metadata\)/,
  "Seedance2 face edit should use the fallback source helper before opening the editor",
);

console.log("seedance2 face editor backendRel source tests passed");
