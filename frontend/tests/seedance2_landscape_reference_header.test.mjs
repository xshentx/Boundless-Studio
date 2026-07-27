import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const nodeSource = readFileSync(join(repoRoot, "src/app/canvas/components/canvas-node.tsx"), "utf8");

const panelStart = nodeSource.indexOf("function Seedance2LandscapeHtmlReferencePanel");
const panelEnd = nodeSource.indexOf("function ", panelStart + 1);
assert.ok(panelStart >= 0 && panelEnd > panelStart, "landscape reference panel source should be extractable");
const panelSource = nodeSource.slice(panelStart, panelEnd);

assert.match(panelSource, /图片排序 · 参考图上传/, "reference upload panel should keep its title");
assert.match(
  panelSource,
  /left-\[15px\] right-\[72px\][^\"]*overflow-hidden[^\"]*whitespace-nowrap/,
  "the title should reserve a non-overlapping area for the count",
);
assert.match(
  panelSource,
  /right-\[16px\] top-\[13px\][^\"]*whitespace-nowrap[^>]*>\s*共 \{slots\.length\} 张/s,
  "the slot count should be a single-line Chinese label aligned at the top right",
);
assert.doesNotMatch(panelSource, /<br \/>slots/, "the clipped two-line English slots label must not be rendered");

console.log("seedance2 landscape reference header tests passed");