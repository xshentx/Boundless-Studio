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

const helperStart = source.indexOf("function seedance2FaceEditFallbackSource");
const helperEnd = source.indexOf("function isLocalCanvasImageSource", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "Seedance2 face edit fallback helper should exist");

const helperSource = source.slice(helperStart, helperEnd);
const normalizedContentIndex = helperSource.indexOf("normalizeCanvasBackendImageSource(content)");
const backendRelIndex = helperSource.indexOf("const backendRel =");

assert.ok(
  normalizedContentIndex >= 0,
  "Seedance2 face edit should normalize metadata.content so signed /images URLs keep their token",
);
assert.ok(
  backendRelIndex >= 0,
  "Seedance2 face edit should still fall back to backendRel when no signed URL is available",
);
assert.ok(
  normalizedContentIndex < backendRelIndex,
  "Seedance2 face edit should prefer signed content/backendUrl before backendRel because backendRel alone drops ?token",
);
assert.match(
  helperSource,
  /return\s*\(?\s*normalizedContent\s*\|\|\s*normalizedBackendUrl\s*\|\|\s*\(backendRel\s*\?\s*`\/images\/\$\{backendRel\}`\s*:\s*""\)\s*\)?;/,
  "Seedance2 face edit fallback should preserve tokenized same-origin URLs before using bare backendRel",
);

console.log("seedance2 face editor preserve-token source tests passed");
