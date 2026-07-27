import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const homeSource = readFileSync(join(frontendRoot, "src/app/canvas/home/page.tsx"), "utf8");
const cardSource = readFileSync(join(frontendRoot, "src/app/canvas/components/canvas-project-card.tsx"), "utf8");
const workspaceSource = readFileSync(join(frontendRoot, "src/app/canvas/workspace/canvas-client-page.tsx"), "utf8");
const assistantSource = readFileSync(join(frontendRoot, "src/app/canvas/components/canvas-assistant-panel.tsx"), "utf8");

assert.ok(homeSource.includes('useState<CanvasHomeViewMode>("list")'), "the canvas library must default to list view");
assert.ok(homeSource.includes('infinite-canvas-home-view'), "the view preference must use a stable storage key");
assert.ok(homeSource.includes('getDesktopSetting(CANVAS_HOME_VIEW_STORAGE_KEY)'), "the saved view preference must be restored from SQLite-backed settings");
assert.ok(homeSource.includes('setDesktopSetting(CANVAS_HOME_VIEW_STORAGE_KEY, nextViewMode)'), "view changes must be persisted to SQLite-backed settings");
assert.ok(homeSource.includes('aria-label="列表显示"'));
assert.ok(homeSource.includes('aria-label="卡片显示"'));
assert.ok(homeSource.includes('viewMode === "list" ? "flex flex-col gap-2"'));
assert.ok(homeSource.includes('sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'), "card view must use a compact responsive grid");
assert.ok(homeSource.includes('viewMode={viewMode}'), "each project item must receive the active display mode");
assert.ok(homeSource.includes('openApiSettings("relay")'), "the home toolbar must open relay settings directly");
assert.ok(!homeSource.includes('openApiSettings("update")'), "the home toolbar must expose one settings button instead of a separate updater button");
assert.match(homeSource, /Settings2[\s\S]*设置/u, "the unified settings button must remain visually identifiable");
assert.doesNotMatch(homeSource, /RefreshCw|软件更新/u, "the home toolbar must not retain a separate software update button");
const orderedHomeActions = ["新建画布", "导入画布", "设置", "修复加载", "删除全部"];
for (let index = 1; index < orderedHomeActions.length; index += 1) {
  assert.ok(homeSource.indexOf(orderedHomeActions[index - 1]) < homeSource.indexOf(orderedHomeActions[index]), "home actions must keep the requested primary-to-maintenance-to-destructive order");
}
assert.match(workspaceSource, /<UserStatusActions[\s\S]*showConfig=\{false\}/u, "the workspace top bar must not expose the moved settings entry");
assert.doesNotMatch(assistantSource, /openConfigDialog\(false\)/u, "the canvas assistant must not retain a manual settings entry");

assert.ok(cardSource.includes('data-project-view="list"'), "the project component must render a list row");
assert.ok(cardSource.includes('data-project-view="grid"'), "the project component must render a card");
assert.ok(cardSource.includes('relative aspect-video'), "cards must use a compact widescreen preview instead of the old tall card");
for (const action of ["toggleSelectedProjectId", "exportCanvasProjects", "startEditing", "setDeleteIds", "router.push"]) {
  assert.ok(cardSource.includes(action), "both views must preserve project capability: " + action);
}

console.log("canvas home list/card view contract tests passed");
