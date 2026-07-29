import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const configStoreSource = readFileSync(join(frontendRoot, "src/stores/use-config-store.ts"), "utf8");
const providersSource = readFileSync(join(frontendRoot, "src/app/canvas/canvas-providers.tsx"), "utf8");

assert.match(
  configStoreSource,
  /hydrated: false,[\s\S]*loadPublicSettings: async \(\) => \{[\s\S]*if \(!get\(\)\.hydrated \|\| get\(\)\.isPublicSettingsLoading\) return;/,
  "public-settings loading must not mutate the persisted store before config hydration",
);
assert.match(
  configStoreSource,
  /onRehydrateStorage: \(initialState\) => \(state, error\) => \{[\s\S]*\(state \|\| initialState\)\.setHydrated\(true\);[\s\S]*\}/,
  "the config store must finish hydration with persisted state or in-memory defaults after a restore error",
);
assert.match(
  configStoreSource,
  /partialize: \(state\) => \(\{ config: state\.config, webdav: state\.webdav \}\)/,
  "the hydration flag must remain runtime-only",
);
assert.match(
  providersSource,
  /const configHydrated = useConfigStore\(\(state\) => state\.hydrated\);[\s\S]*useEffect\(\(\) => \{\s*if \(!configHydrated\) return;\s*void loadPublicSettings\(\);\s*\}, \[configHydrated, loadPublicSettings\]\);/,
  "CanvasProviders must wait for SQLite hydration before starting a store-mutating public-settings request",
);
assert.match(
  providersSource,
  /if \(!configHydrated\) \{\s*return <div[^>]*aria-label="[^"]+"[^>]*\/>;\s*\}/u,
  "interactive canvas children must not mount while persisted configuration is still hydrating",
);

console.log("config store hydration persistence guard tests passed");
