import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasNodePath = join(
  repoRoot,
  "src/app/canvas/components/canvas-node.tsx",
);
const canvasNodeSource = readFileSync(canvasNodePath, "utf8");
const emptyImageContent = canvasNodeSource.slice(
  canvasNodeSource.indexOf("function EmptyImageContent"),
  canvasNodeSource.indexOf("function VideoNodeContent"),
);
const imageContent = canvasNodeSource.slice(
  canvasNodeSource.indexOf("function ImageContent"),
  canvasNodeSource.indexOf("function numericImageLabel"),
);

assert.match(emptyImageContent, />\u56fe\u7247\u5360\u4f4d\u6846<\/div>/u, "empty image nodes should show the correct title");
assert.match(emptyImageContent, />\u7b49\u5f85\u8f93\u5165\u63d0\u793a\u8bcd<\/div>/u, "empty image nodes should show the correct hint");
assert.doesNotMatch(
  emptyImageContent,
  /\u9365\u5267\u5896|\u95b8\u30e5\u58bd\u6fa7|\u7edb\u592f\u7d27|\u7f01\u6d98\u5af9|\u9391\u64ae\u51b2/u,
  "empty image node copy should not contain mojibake",
);
assert.match(
  imageContent,
  /`\u56fe\u7247\$\{node\.metadata\?\.imageSequenceNumber \|\| numericImageLabel\(node\.id\)\}`/u,
  "image badge should use readable Chinese label",
);
assert.match(imageContent, /\u56fe\u7247\u5df2\u8fc7\u671f\uff0c\u9700\u91cd\u65b0\u4e0a\u4f20/u, "expired image placeholder should be readable");
assert.match(imageContent, /\u56fe\u7247\u9884\u89c8/u, "image preview placeholder should be readable");
assert.match(
  imageContent,
  /\{imageSource \? \(\s*<img/u,
  "failed thumbnails should keep the image element mounted so a restored source can load",
);
assert.doesNotMatch(
  imageContent,
  /\{!showImagePlaceholder \? \(\s*<img/u,
  "the expired placeholder must not unmount the image element and block source recovery",
);
assert.match(
  imageContent,
  /onLoad=\{\(\) => setImageLoadFailed\(false\)\}/u,
  "a successfully restored thumbnail should clear its stale failure state",
);
assert.doesNotMatch(
  imageContent,
  /\u9365\u5267\u5896|\u95b8\u30e5\u58bd\u6fa7|\u9435\u5287\u58bb|\u9435\u5287\u5896/u,
  "image node labels should not contain mojibake",
);

console.log("canvas empty image placeholder text tests passed");
