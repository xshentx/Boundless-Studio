import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";

const frontendRoot = resolve(process.cwd());
const sourceRoot = resolve(process.argv[2] || "../../chatgpt2api-backend/web");
if (!existsSync(sourceRoot)) throw new Error(`source web project not found: ${sourceRoot}`);

function filesUnder(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (!entry.name.includes(".bak")) files.push(relative(root, path).replaceAll("\\", "/"));
    }
  };
  walk(root);
  return files.sort();
}
function hash(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }

const exactFiles = ["src/app/globals.css", "public/recovery/xiaojun-teacher-project.json"];
const intentionalCanvasAdapters = new Set([
  "src/app/canvas/constants.ts",
  "src/app/canvas/canvas-providers.tsx",
  "src/app/canvas/home/page.tsx",
  "src/app/canvas/components/canvas-project-card.tsx",
  "src/app/canvas/components/canvas-node.tsx",
  "src/app/canvas/components/canvas-node-prompt-panel.tsx",
  "src/app/canvas/components/canvas-node-hover-toolbar.tsx",
  "src/app/canvas/components/canvas-assistant-panel.tsx",
  "src/app/canvas/components/canvas-node-seedance2-face-edit-dialog.tsx",
  "src/app/canvas/components/canvas-story-director-panel.tsx",
  "src/app/canvas/utils/canvas-image-placeholder-model.mjs",
  "src/app/canvas/utils/canvas-image-placeholder-model.ts",
  "src/app/canvas/utils/seedance2-story-integration.mjs",
  "src/app/canvas/utils/seedance2-story-integration.ts",
  "src/app/canvas/utils/seedance2-text-model.mjs",
  "src/app/canvas/utils/seedance2-text-model.ts",
  "src/app/canvas/utils/seedance2-workflow.mjs",
  "src/app/canvas/utils/seedance2-workflow.ts",
  "src/app/canvas/utils/story-director-text-model.mjs",
  "src/app/canvas/utils/story-director-text-model.ts",
  "src/app/canvas/workspace/canvas-client-page.tsx",
]);
for (const rel of filesUnder(join(sourceRoot, "src/app/canvas"))) {
  const targetRel = `src/app/canvas/${rel}`;
  if (!intentionalCanvasAdapters.has(targetRel)) exactFiles.push(targetRel);
}
const mismatches = [], missing = [];
let compared = 0;
for (const rel of [...new Set(exactFiles)]) {
  const source = join(sourceRoot, rel), target = join(frontendRoot, rel);
  if (!existsSync(target) || !statSync(target).isFile()) { missing.push(rel); continue; }
  compared++;
  if (hash(source) !== hash(target)) mismatches.push(rel);
}

const visualHostIssues = [];
const sourceMedia = join(sourceRoot, "out/_next/static/media");
const targetFonts = join(frontendRoot, "public/fonts");
const sourceFontFiles = filesUnder(sourceMedia).filter((name) => name.endsWith(".woff2"));
let fontsCompared = 0;
for (const name of sourceFontFiles) {
  const source = join(sourceMedia, name), target = join(targetFonts, name);
  if (!existsSync(target)) visualHostIssues.push(`missing font: ${name}`);
  else { fontsCompared++; if (hash(source) !== hash(target)) visualHostIssues.push(`font mismatch: ${name}`); }
}
const sourceCssDir = join(sourceRoot, "out/_next/static/chunks");
const fontCssFile = filesUnder(sourceCssDir).filter((name) => name.endsWith(".css")).map((name) => join(sourceCssDir, name)).find((path) => {
  const css = readFileSync(path, "utf8");
  return css.includes("@font-face{font-family:Inter") && css.includes("@font-face{font-family:JetBrains Mono");
});
const hostCss = readFileSync(join(frontendRoot, "src/host.css"), "utf8");
if (!fontCssFile) visualHostIssues.push("source generated font CSS not found");
else {
  const [interLine, monoLine] = readFileSync(fontCssFile, "utf8").split(/\r?\n/);
  const expectedPrefix = `${interLine}\n${monoLine}`.replaceAll("../media/", "/fonts/");
  if (!hostCss.replaceAll("\r\n", "\n").startsWith(expectedPrefix)) visualHostIssues.push("font-face CSS differs from source build");
}
const mainSource = readFileSync(join(frontendRoot, "src/main.tsx"), "utf8");
if (!mainSource.includes('import "antd/dist/reset.css";')) visualHostIssues.push("Ant Design reset CSS is not imported");
if (!mainSource.includes('import "./host.css";')) visualHostIssues.push("host font parity CSS is not imported");
const appSource = readFileSync(join(frontendRoot, "src/App.tsx"), "utf8");
for (const className of ["h-screen overflow-hidden text-foreground", "contents", "animate-page-enter"]) {
  if (!appSource.includes(className)) visualHostIssues.push(`missing original canvas shell class: ${className}`);
}
const result = {
  sourceRoot,
  frontendRoot,
  exactSource: { compared, missing, mismatches },
  visualHostParity: { fontsCompared, issues: visualHostIssues },
  adapterChanges: [
    "src/constants/common-env.ts",
    "src/services/api/ai-routing.ts: desktop relay-only request routing",
    "src/components/api-access-settings-dialog.tsx: relay-only settings and typed model selects",
    "src/services/settings-dialog.ts: home toolbar event bridge for relay and update tabs",
    "src/components/model-icon.tsx and src/components/model-picker.tsx: configured-only model lists with provider icons",
    "src/stores/api-relay-config.ts: legacy platform/local-pool route migration",
    "src/stores/use-config-store.ts: desktop relay-only defaults plus SQLite-backed persistence",
    "src/lib/localforage-storage.ts and src/services/desktop-storage.ts: SQLite state adapter with legacy browser migration",
    "src/services/image-storage.ts and src/services/file-storage.ts: data/media filesystem persistence with IndexedDB migration",
    "src/store/auth.ts, src/store/image-conversations.ts, and src/services/app-sync.ts: SQLite-backed structured application data",
    "src/stores/use-theme-store.ts and src/stores/use-user-store.ts: SQLite-backed Zustand persistence",
    "src/app/canvas-repair/page.tsx: clear SQLite canvas state and media together with legacy browser caches",
    "Next.js navigation/image compatibility replaced by src/compat/*",
    "src/app/canvas/canvas-providers.tsx: global desktop update notification bridge",
    "src/app/canvas/home/page.tsx: desktop list/card view preference plus ordered home-only settings toolbar",
    "src/app/canvas/components/canvas-project-card.tsx: list row and compact card layouts",
    "src/app/canvas/components/canvas-node-hover-toolbar.tsx: SQLite-backed quick-tool preference",
    "src/app/canvas/components/canvas-node.tsx: retry restored image thumbnails after stale source failures",
    "src/app/canvas/components/canvas-node-prompt-panel.tsx: preserve canvas wheel zoom outside genuinely scrollable prompt content",
    "src/app/canvas/components/canvas-assistant-panel.tsx: wrap narrow composer controls and remove the moved manual settings entry",
    "src/app/canvas/components/canvas-node-seedance2-face-edit-dialog.tsx: fit-to-view, wheel zoom, and hand-tool viewport panning",
    "src/app/canvas/components/canvas-story-director-panel.tsx: settings-driven story text model select",
    "src/app/canvas/utils/canvas-image-placeholder-model.* and seedance2-*.{ts,mjs}: configured-only model validation with no built-in fallbacks",
    "src/app/canvas/utils/story-director-text-model.*: dynamic model validation and presentation",
    "src/app/canvas/workspace/canvas-client-page.tsx: dynamic story routing, selected-node wheel zoom, and home-only manual settings access",
  ],
};
console.log(JSON.stringify(result, null, 2));
if (missing.length || mismatches.length || visualHostIssues.length) process.exitCode = 1;