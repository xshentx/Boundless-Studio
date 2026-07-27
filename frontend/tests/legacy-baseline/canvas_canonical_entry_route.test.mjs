import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const canvasPage = readFileSync(
  join(repoRoot, "src/app/canvas/page.tsx"),
  "utf8",
);
const canvasHomePage = readFileSync(
  join(repoRoot, "src/app/canvas/home/page.tsx"),
  "utf8",
);
const legacyRoutePage = readFileSync(
  join(repoRoot, "src/app/maiyi-canvas/page.tsx"),
  "utf8",
);
const legacyEntry = join(
  repoRoot,
  "public/maiyi-canvas/index.html",
);

assert.match(
  canvasPage,
  /export\s*\{\s*default\s*\}\s*from\s*["']\.\/home\/page["']/,
  "the canvas entry should open the canvas library",
);
assert.match(
  canvasHomePage,
  /CanvasProjectCard/,
  "the canvas library should render selectable project cards",
);
assert.match(
  legacyRoutePage,
  /redirect\(["']\/canvas\/workspace\//,
  "the legacy route should redirect to the fixed workspace UI",
);
assert.equal(
  existsSync(legacyEntry),
  false,
  "the legacy maiyi-canvas UI should not remain as a second entry",
);

console.log("canvas canonical entry route test passed");
