import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dialogPath = resolve(repoRoot, "src/app/canvas/components/canvas-node-seedance2-face-edit-dialog.tsx");
const source = readFileSync(dialogPath, "utf8");

assert.match(
  source,
  /function\s+FaceLayerSourceCutoutFill/,
  "Seedance2 face editor should render a white source cutout fill for copied face layers",
);
assert.match(
  source,
  /<FaceLayerSourceCutoutFill\s+key=\{`source-\$\{layer\.id\}`\}\s+box=\{layer\.sourceSelection\}\s+scale=\{scale\}/,
  "Workspace should draw a white fill at every face layer source selection before layer overlays",
);
assert.match(
  source,
  /backgroundColor:\s*"#fff"/,
  "Source cutout preview should use white fill",
);
assert.match(
  source,
  /borderRadius:\s*"999px"/,
  "Source cutout preview should stay circular or elliptical",
);
assert.match(
  source,
  /transform:\s*`rotate\(\$\{box\.rotation\}deg\)`/,
  "Source cutout preview should respect the source ellipse rotation",
);

console.log("seedance2 source cutout white fill preview tests passed");
