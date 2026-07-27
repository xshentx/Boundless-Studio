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
  /function\s+FaceLayerPreview/,
  "Seedance2 face editor should render a visible PSD-style preview for each face layer",
);
assert.match(
  source,
  /<FaceLayerPreview\s+sourceDataUrl=\{dataUrl\}\s+layer=\{layer\}\s+scale=\{scale\}/,
  "Face layer overlay should include the copied source image patch, not only a border",
);
assert.match(
  source,
  /clipPath:\s*"ellipse\(50% 50% at 50% 50%\)"/,
  "Face layer preview should be clipped to a circular or elliptical mask",
);
assert.match(
  source,
  /transform:\s*`translate\(\$\{-layer\.sourceSelection\.x \* scale\}px, \$\{-layer\.sourceSelection\.y \* scale\}px\)`/,
  "Face layer preview should offset the original image so the selected face region appears inside the moved layer",
);
assert.match(
  source,
  /zIndex:\s*1/,
  "Face layer image preview should sit below handles/label but above the base image",
);

console.log("seedance2 visible face layer preview tests passed");
