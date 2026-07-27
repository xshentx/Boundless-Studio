import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const desktopStorage = read("src/services/desktop-storage.ts");
const stateStorage = read("src/lib/localforage-storage.ts");
const imageStorage = read("src/services/image-storage.ts");
const fileStorage = read("src/services/file-storage.ts");
const configStore = read("src/stores/use-config-store.ts");
const themeStore = read("src/stores/use-theme-store.ts");
const userStore = read("src/stores/use-user-store.ts");
const canvasStore = read("src/app/canvas/stores/use-canvas-store.ts");
const imageConversations = read("src/store/image-conversations.ts");

assert.match(desktopStorage, /\/client-api\/state/);
assert.match(desktopStorage, /\/client-api\/media/);
assert.match(desktopStorage, /\/client-api\/media-index/);
assert.match(desktopStorage, /createDesktopObjectStorage/);
assert.match(stateStorage, /getDesktopState\(name\)/);
assert.match(stateStorage, /setDesktopState\(name, value\)/);
assert.match(stateStorage, /readLegacyValue/);
assert.match(imageStorage, /uploadDesktopMedia/);
assert.match(imageStorage, /getDesktopMediaBlob/);
assert.match(imageStorage, /listDesktopMedia\("images"\)/);
assert.match(fileStorage, /uploadDesktopMedia/);
assert.match(fileStorage, /listDesktopMedia\(\)/);
for (const [name, source] of [["config", configStore], ["theme", themeStore], ["user", userStore]]) {
  assert.match(source, /createJSONStorage\(\(\) => localForageStorage\)/, `${name} store must use SQLite-backed adapter`);
}
assert.match(canvasStore, /localForageStorage\.getItem/);
assert.match(imageConversations, /createDesktopObjectStorage\("chatgpt2api\/image_conversations"/);
assert.doesNotMatch(configStore, /storage:\s*createJSONStorage\(\(\) => localStorage\)/);

console.log("desktop SQLite storage contract tests passed");
