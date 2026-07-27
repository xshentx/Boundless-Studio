import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const canvasPagePath = resolve(
  repoRoot,
  "src/app/canvas/page.tsx",
);
const canvasHomePagePath = resolve(
  repoRoot,
  "src/app/canvas/home/page.tsx",
);
const sideNavPath = resolve(
  repoRoot,
  "src/components/side-nav.tsx",
);
const topNavPath = resolve(
  repoRoot,
  "src/components/top-nav.tsx",
);

const canvasPageSource = readFileSync(canvasPagePath, "utf8");
const canvasHomePageSource = readFileSync(canvasHomePagePath, "utf8");
const sideNavSource = readFileSync(sideNavPath, "utf8");
const topNavSource = readFileSync(topNavPath, "utf8");

assert.match(
  canvasPageSource,
  /export\s*\{\s*default\s*\}\s*from\s*["']\.\/home\/page["']/,
  "/canvas should use the canvas library page, not skip directly to the workspace",
);
assert.match(
  canvasHomePageSource,
  /createProject/,
  "/canvas should keep the New Canvas action on the library page",
);
assert.match(
  canvasHomePageSource,
  /CanvasProjectCard/,
  "/canvas should render the canvas library project cards",
);
assert.doesNotMatch(
  canvasPageSource,
  /redirect\(["']\/canvas\/workspace\//,
  "/canvas must not immediately redirect to /canvas/workspace without letting the user choose a canvas",
);
assert.match(
  sideNavSource,
  /href:\s*["']\/canvas["'],\s*label:\s*["']无限画布["']/,
  "desktop side navigation should open the canvas library first",
);
assert.match(
  topNavSource,
  /href:\s*["']\/canvas["'],\s*label:\s*["']无限画布["']/,
  "top navigation should open the canvas library first",
);

console.log("canvas library route contract test passed");
