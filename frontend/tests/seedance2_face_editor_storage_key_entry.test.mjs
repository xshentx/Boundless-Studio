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
const faceEditSectionStart = source.indexOf("const [seedance2FaceEditNodeId");
const faceEditSectionEnd = source.indexOf("{splitNode?.metadata?.content ? (");
assert.ok(faceEditSectionStart >= 0, "Seedance2 face edit state should exist");
assert.ok(faceEditSectionEnd > faceEditSectionStart, "Seedance2 face edit dialog block should exist");
const faceEditSection = source.slice(faceEditSectionStart, faceEditSectionEnd);

assert.match(
  faceEditSection,
  /const storageKey = seedance2FaceEditNode\.metadata\?\.storageKey;[\s\S]*resolveImageUrl\(storageKey, directSource\)/,
  "Seedance2 face migration should resolve stored images before opening the dialog and only fall back to direct URLs",
);
assert.doesNotMatch(
  faceEditSection,
  /seedance2FaceEditNode\?\.metadata\?\.content \? \(/,
  "Seedance2 face migration should not depend on metadata.content alone",
);
assert.match(
  faceEditSection,
  /seedance2FaceEditDataUrl/,
  "Seedance2 face migration should cache the resolved source data URL in state",
);
assert.match(
  faceEditSection,
  /CanvasNodeSeedance2FaceEditDialog[\s\S]*dataUrl=\{seedance2FaceEditDataUrl \|\| ""\}/,
  "Seedance2 face migration should pass the resolved data URL into the dialog",
);

console.log("seedance2 face editor storage-key entry tests passed");
