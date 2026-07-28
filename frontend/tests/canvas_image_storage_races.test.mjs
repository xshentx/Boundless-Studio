import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const imageStorageSource = readFileSync(join(frontendRoot, "src/services/image-storage.ts"), "utf8");
const canvasStoreSource = readFileSync(join(frontendRoot, "src/app/canvas/stores/use-canvas-store.ts"), "utf8");
const assetStoreSource = readFileSync(join(frontendRoot, "src/stores/use-asset-store.ts"), "utf8");
const providersSource = readFileSync(join(frontendRoot, "src/app/canvas/canvas-providers.tsx"), "utf8");
const workspaceSource = readFileSync(join(frontendRoot, "src/app/canvas/workspace/canvas-client-page.tsx"), "utf8");
const homeSource = readFileSync(join(frontendRoot, "src/app/canvas/home/page.tsx"), "utf8");

assert.match(imageStorageSource, /pendingObjectUrls\.get\(storageKey\)/, "same-key image restores must share an in-flight load");
assert.match(imageStorageSource, /objectUrls\.get\(storageKey\) \|\| replaceObjectURL\(storageKey, blob\)/, "a concurrent completion must reuse the published object URL instead of revoking it");
assert.match(imageStorageSource, /protectedSet\.has\(record\.storageKey\)/, "desktop cleanup must protect image keys referenced by persisted data");
assert.match(imageStorageSource, /protectedSet\.has\(key\)/, "legacy IndexedDB cleanup must protect image keys referenced by persisted data");

assert.doesNotMatch(canvasStoreSource, /cleanupExpiredStoredImages/, "canvas hydration must not start an independent age-based cleanup");
assert.doesNotMatch(assetStoreSource, /cleanupExpiredStoredImages/, "asset hydration must not start an independent age-based cleanup");
assert.match(canvasStoreSource, /collectImageStorageKeys\(parsed\.state\.projects\)[\s\S]*await setStoredImagesRetained\(referencedImageKeys, true\)/, "canvas references must be retained before canvas hydration completes");
assert.match(assetStoreSource, /await setStoredImagesRetained\(assetImageKeys, true\)/, "asset references must be retained before asset hydration completes");
assert.match(providersSource, /if \(!canvasHydrated \|\| !assetHydrated\)[\s\S]*return;/, "the shared cleanup must wait for both persisted stores");
assert.match(
  providersSource,
  /collectImageStorageKeys\(\{ projects, assets \}\)[\s\S]*await setStoredImagesRetained\(protectedImageKeys, true\);[\s\S]*await cleanupExpiredStoredImages\(undefined, protectedImageKeys\);/,
  "the shared cleanup must retain the cross-store reference union before deleting expired images",
);

assert.doesNotMatch(workspaceSource, /setTimeout\([\s\S]{0,120}cleanupExpiredStoredImages/, "workspace mount must not race project hydration with an unprotected cleanup timer");
assert.doesNotMatch(homeSource, /setTimeout\([\s\S]{0,120}cleanupExpiredStoredImages/, "home mount must not start an unprotected cleanup timer");

console.log("canvas image storage race tests passed");
