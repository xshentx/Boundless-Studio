import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const pagePath = resolve(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx");
const source = readFileSync(pagePath, "utf8");

assert.match(source, /CanvasNodeSeedance2FaceEditDialog/);
assert.match(source, /seedance2FaceEditNodeId/);
assert.match(source, /seedance2FaceEditNode/);
assert.match(source, /setSeedance2FaceEditNodeId\(node\.id\)/);
assert.match(source, /Seedance2 人脸迁移/);
assert.match(source, /saveSeedance2FaceEditImageNode/);
assert.match(source, /restoreSeedance2FaceEditOriginalImageNode/);
assert.match(source, /onConfirm=\{\(payload\) =>\s*saveSeedance2FaceEditImageNode\(/);
assert.doesNotMatch(source, /void\s+saveSeedance2FaceEditImageNode\(/);
assert.match(source, /createSeedance2FaceEditOriginalBackup/);
assert.match(source, /restoreSeedance2FaceEditOriginalNode/);
assert.match(source, /imageSequenceNumber:\s*\r?\n\s*node\.metadata\?\.imageSequenceNumber \?\?\s*\r?\n\s*nextImageSequenceNumber\(nodesRef\.current\)/);
assert.match(source, /imageSequenceNumber:\s*\r?\n\s*item\.metadata\?\.imageSequenceNumber \?\?\s*\r?\n\s*nextImageSequenceNumber\(nodesRef\.current\)/);
assert.doesNotMatch(source, /imageSequenceNumber:\s*\r?\n\s*[^\r\n]+\|\|\s*\r?\n\s*nextImageSequenceNumber\(nodesRef\.current\)/);
assert.doesNotMatch(source, /seedance2-face-edit-child/);

const copyImageMenuIndex = source.indexOf('"copy-image"');
const seedance2FaceEditMenuIndex = source.indexOf('"seedance2-face-edit"');
const imageEditSubmenuIndex = source.indexOf('"image-edit"');
const seedance2RestoreOriginalMenuIndex = source.indexOf('"seedance2-face-restore-original"');
const imageGenerateSubmenuIndex = source.indexOf('"image-generate"', imageEditSubmenuIndex);
assert.ok(copyImageMenuIndex >= 0, "copy-image menu item should exist");
assert.ok(seedance2FaceEditMenuIndex >= 0, "seedance2 face edit menu item should exist");
assert.ok(imageEditSubmenuIndex >= 0, "image-edit submenu should exist");
assert.ok(seedance2RestoreOriginalMenuIndex >= 0, "restore Seedance2 original menu item should exist");
assert.ok(imageGenerateSubmenuIndex >= 0, "image-generate submenu should exist after image-edit");
assert.ok(
  seedance2FaceEditMenuIndex > copyImageMenuIndex &&
    seedance2FaceEditMenuIndex < imageEditSubmenuIndex,
  "Seedance2 face migration should be merged into the top-level image context menu before the Edit Image submenu",
);
assert.ok(
  seedance2RestoreOriginalMenuIndex > imageEditSubmenuIndex &&
    seedance2RestoreOriginalMenuIndex < imageGenerateSubmenuIndex,
  "restore Seedance2 original should be inside the Edit Image submenu",
);

const saveCallbackMatch = source.match(
  /const saveSeedance2FaceEditImageNode = useCallback\([\s\S]*?\n  \);/,
);
assert.ok(saveCallbackMatch, "saveSeedance2FaceEditImageNode callback should exist");
const saveCallbackSource = saveCallbackMatch[0];
assert.match(saveCallbackSource, /createSeedance2FaceEditOriginalBackup\(item,/);
assert.doesNotMatch(saveCallbackSource, /if \(!node\.metadata\?\.content\) return/);
assert.match(saveCallbackSource, /if \(!payload\.dataUrl\)/);
assert.match(saveCallbackSource, /message\.error\(error\.message\);\s*throw error;/);
assert.match(saveCallbackSource, /node\.metadata\?\.seedance2FaceEditOriginal\?\.storageKey/);
assert.match(saveCallbackSource, /node\.metadata\?\.storageKey/);
assert.doesNotMatch(saveCallbackSource, /setConnections/);
assert.doesNotMatch(saveCallbackSource, /seedance2-face-edit-child/);
assert.match(saveCallbackSource, /catch \(error\) \{[\s\S]*?message\.error\([\s\S]*?throw \(error instanceof Error \? error : new Error\(/);

const restoreCallbackMatch = source.match(
  /const restoreSeedance2FaceEditOriginalImageNode = useCallback\([\s\S]*?\n  \);/,
);
assert.ok(restoreCallbackMatch, "restoreSeedance2FaceEditOriginalImageNode callback should exist");
const restoreCallbackSource = restoreCallbackMatch[0];
assert.match(restoreCallbackSource, /await\s+setStoredImagesRetained\(/);
assert.match(restoreCallbackSource, /await\s+resolveImageUrl\(/);
assert.match(restoreCallbackSource, /restoreSeedance2FaceEditOriginalNode\(item,/);

console.log("seedance2 face editor canvas integration tests passed");
