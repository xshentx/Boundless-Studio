import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const configStoreSource = readFileSync(join(frontendRoot, "src/stores/use-config-store.ts"), "utf8");
const recoveryStorageSource = readFileSync(join(frontendRoot, "src/lib/config-state-storage.ts"), "utf8");
const localForageSource = readFileSync(join(frontendRoot, "src/lib/localforage-storage.ts"), "utf8");
const updatePanelSource = readFileSync(join(frontendRoot, "src/components/update-settings-panel.tsx"), "utf8");
const providersSource = readFileSync(join(frontendRoot, "src/app/canvas/canvas-providers.tsx"), "utf8");

assert.match(
  configStoreSource,
  /hydrated: false,[\s\S]*loadPublicSettings: async \(\) => \{[\s\S]*if \(!get\(\)\.hydrated \|\| get\(\)\.isPublicSettingsLoading\) return;/,
  "public-settings loading must not mutate the persisted store before config hydration",
);
assert.match(
  configStoreSource,
  /storage: createJSONStorage\(\(\) => recoverableConfigStorage\)/,
  "the config store must use primary-plus-recovery persistence",
);

const hydrationErrorStart = configStoreSource.indexOf("if (error) {");
const hydrationErrorEnd = configStoreSource.indexOf("clearConfigRehydrateRetry();", hydrationErrorStart);
assert.ok(hydrationErrorStart >= 0 && hydrationErrorEnd > hydrationErrorStart, "the hydration error branch must exist");
const hydrationErrorBranch = configStoreSource.slice(hydrationErrorStart, hydrationErrorEnd);
assert.match(hydrationErrorBranch, /scheduleConfigRehydrate\(\);[\s\S]*return;/, "failed reads must retry hydration");
assert.doesNotMatch(hydrationErrorBranch, /setHydrated\(true\)/, "failed reads must never persist empty defaults");
assert.match(
  configStoreSource.slice(hydrationErrorEnd),
  /clearConfigRehydrateRetry\(\);\s*\(state \|\| initialState\)\.setHydrated\(true\);/,
  "hydration may unlock the UI only after a successful restore",
);
assert.match(
  configStoreSource,
  /partialize: \(state\) => \(\{ config: state\.config, webdav: state\.webdav \}\)/,
  "the hydration flag must remain runtime-only",
);

assert.match(
  localForageSource,
  /getItem: \(name\) => readStateItem\(name, false\)/,
  "shared stores must retain the standalone browser fallback",
);
assert.match(
  localForageSource,
  /getStrictLocalForageItem[\s\S]*isDesktopStateStorageRequired\(\)[\s\S]*readStateItem\(name, desktopRequired\)/,
  "the config adapter must have a strict desktop-read path",
);
assert.match(
  localForageSource,
  /const protocol = window\.location\.protocol[\s\S]*const hostname = window\.location\.hostname[\s\S]*protocol === "wails:" \|\| hostname === "wails\.localhost"/,
  "strict config reads must cover both custom-scheme Wails and the Windows http://wails.localhost host",
);
assert.match(
  recoveryStorageSource,
  /const primary = await getStrictLocalForageItem\(name\)/,
  "config hydration must distinguish an unavailable desktop store from an empty browser store",
);
assert.match(
  recoveryStorageSource,
  /const recovered = await readRecoveryValue\(name\);[\s\S]*if \(isPersistedConfigEnvelope\(recovered\)\)/,
  "config hydration must restore a validated recovery copy",
);
assert.match(
  recoveryStorageSource,
  /return enqueueConfigWrite\(async \(\) => \{[\s\S]*await setDesktopState\(name, value\);[\s\S]*await setDesktopState\(recoveryKey\(name\), value\);/,
  "update flushing must queue and write both native config copies",
);

const installStart = updatePanelSource.indexOf("const install = async () => {");
const flushIndex = updatePanelSource.indexOf("await flushConfigStore();", installStart);
const updateIndex = updatePanelSource.indexOf("await startDesktopUpdate();", installStart);
assert.ok(
  installStart >= 0 && flushIndex > installStart && updateIndex > flushIndex,
  "the updater must flush the latest config before installation can restart the app",
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
