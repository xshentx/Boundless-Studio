import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = join(frontendRoot, "..");
const requiredFiles = [
  "src/app/canvas/home/page.tsx",
  "src/app/canvas/workspace/canvas-client-page.tsx",
  "src/app/canvas/components/infinite-canvas.tsx",
  "src/app/canvas/components/canvas-node.tsx",
  "src/app/canvas/components/canvas-connections.tsx",
  "src/app/canvas/components/canvas-toolbar.tsx",
  "src/app/canvas/components/canvas-mini-map.tsx",
  "src/app/canvas/components/canvas-zoom-controls.tsx",
  "src/app/canvas/components/canvas-context-menu.tsx",
  "src/app/canvas/components/canvas-assistant-panel.tsx",
  "src/app/canvas/components/canvas-story-director-panel.tsx",
  "src/app/canvas/components/canvas-node-seedance2-face-edit-dialog.tsx",
  "src/app/canvas/components/canvas-node-mask-edit-dialog.tsx",
  "src/app/canvas/components/canvas-node-layer-edit-dialog.tsx",
  "src/app/canvas/components/canvas-node-crop-dialog.tsx",
  "src/app/canvas/components/canvas-node-split-dialog.tsx",
  "src/app/canvas/components/canvas-node-upscale-dialog.tsx",
  "src/app/canvas/stores/use-canvas-store.ts",
  "src/app/canvas/utils/canvas-export.ts",
  "src/app/canvas/utils/seedance2-workflow.ts",
  "src/app/canvas/utils/seedance2-story-integration.ts",
  "src/app/canvas/utils/story-director-staged-workflow.ts",
  "src/app/canvas-repair/page.tsx",
  "src/services/api/image.ts",
  "src/services/api/video.ts",
  "src/services/api/audio.ts",
  "src/services/image-storage.ts",
  "src/services/file-storage.ts",
  "public/recovery/xiaojun-teacher-project.json",
];
for (const file of requiredFiles) assert.equal(existsSync(join(frontendRoot, file)), true, `missing extracted feature file: ${file}`);

const appSource = readFileSync(join(frontendRoot, "src/App.tsx"), "utf8");
assert.match(appSource, /CanvasHomePage/);
assert.match(appSource, /CanvasWorkspacePage/);
assert.match(appSource, /CanvasRepairPage/);
assert.match(appSource, /h-screen overflow-hidden text-foreground/);
assert.match(appSource, /animate-page-enter/);

const viteSource = readFileSync(join(frontendRoot, "vite.config.ts"), "utf8");
for (const route of ["/local-relay-proxy", "/webdav-proxy", "/api", "/v1", "/images"]) assert.match(viteSource, new RegExp(route.replaceAll("/", "\\/")));

const goRelay = readFileSync(join(projectRoot, "relay.go"), "utf8");
assert.match(goRelay, /handleLocalRelayProxy/);
assert.match(goRelay, /handleWebDAVProxy/);
assert.match(goRelay, /handleConfiguredUpstream/);
assert.match(goRelay, /FlushInterval:\s+-1/);
assert.match(goRelay, /isSPAPath/);

const globalCss = readFileSync(join(frontendRoot, "src/app/globals.css"), "utf8");
assert.match(globalCss, /@import "tailwindcss"/);
assert.match(globalCss, /html,\s*body\s*\{[\s\S]*overflow:\s*hidden/);

console.log("standalone extraction contract tests passed");
