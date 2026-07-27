import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const guardPath = resolve(repoRoot, "src/app/canvas/canvas-auth-guard.tsx");
const layoutPath = resolve(repoRoot, "src/app/canvas/layout.tsx");
const guardSource = readFileSync(guardPath, "utf8");
const layoutSource = readFileSync(layoutPath, "utf8");

assert.match(guardSource, /useAuthGuard\(\)/, "canvas guard should require a validated auth session for any canvas route");
assert.match(guardSource, /isCheckingAuth\s*\|\|\s*!session/, "canvas guard should block rendering while unauthenticated");
assert.match(layoutSource, /<CanvasAuthGuard>/, "canvas layout should wrap canvas routes in CanvasAuthGuard");
assert.match(layoutSource, /<CanvasProviders>\{children\}<\/CanvasProviders>/, "canvas providers should only render inside the auth guard");

console.log("canvas auth guard test passed");
