import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(repoRoot, path), "utf8");

const service = read("src/services/desktop-updater.ts");
assert.match(service, /CheckForUpdates[\s\S]*GetClientConfig[\s\S]*GetUpdateState[\s\S]*SetAutoCheckUpdates[\s\S]*StartUpdate/u);
assert.match(service, /boundless:update-state/u, "the frontend must subscribe to backend progress events");
assert.match(service, /autoCheckUpdates/u, "the persisted startup check setting must be loaded");
assert.match(service, /autoCheckUpdates:\s*true/u, "automatic update checks must default to enabled outside the desktop bridge too");

const panel = read("src/components/update-settings-panel.tsx");
assert.match(panel, /启动时自动检测更新/u);
assert.match(panel, /每次启动客户端都会检查最新 Release/u);
assert.match(panel, /useState\(true\)/u, "the switch must render enabled before persisted settings finish loading");
assert.match(
    panel,
    /inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0\.5/u,
    "the switch thumb must be laid out from a stable flex origin",
);
assert.match(panel, /autoCheck \? "translate-x-5" : "translate-x-0"/u, "the thumb must stay inside the 44px track in both states");
assert.doesNotMatch(panel, /absolute top-0\.5/u, "the switch thumb must not depend on an unspecified absolute left position");
assert.match(panel, /立即检查/u);
assert.match(panel, /下载并安装/u);
assert.match(panel, /state\.progress[\s\S]*width:\s*`\$\{state\.progress\}%`/u, "download progress must be visible");
assert.match(panel, /downloadedBytes[\s\S]*totalBytes/u, "downloaded and total byte counts must be shown");
assert.match(panel, /xshentx\/Boundless-Studio/u);

const settingsDialogService = read("src/services/settings-dialog.ts");
assert.match(settingsDialogService, /OPEN_API_SETTINGS_EVENT[\s\S]*openApiSettings/u, "home and notifications must open a requested settings tab through one shared event");

const dialog = read("src/components/api-access-settings-dialog.tsx");
assert.match(dialog, /OPEN_API_SETTINGS_EVENT[\s\S]*requestedTab === "routing"[\s\S]*requestedTab === "update"/u);
assert.match(dialog, /<UpdateSettingsPanel\s*\/>/u);

const providers = read("src/app/canvas/canvas-providers.tsx");
assert.match(providers, /<UpdateNotificationBridge\s*\/>/u, "automatic checks must surface available releases globally");

const notificationBridge = read("src/components/update-notification-bridge.tsx");
assert.match(
    notificationBridge,
    /subscribeDesktopUpdateState\(showAvailableUpdate\)[\s\S]*autoCheckUpdates[\s\S]*checkDesktopUpdate\(\)/u,
    "the startup check must begin only after the global update listener is registered",
);

const app = read("../app.go");
assert.doesNotMatch(app, /startAutomaticUpdateCheck\(ctx\)/u, "OnStartup must not race the frontend update listener");

console.log("desktop GitHub Releases updater UI contract tests passed");