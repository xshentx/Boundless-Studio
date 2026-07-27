import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const apiPath = resolve(repoRoot, "src/lib/api.ts");
const source = readFileSync(apiPath, "utf8");

const protectCanvasImagesSource = source.slice(
  source.indexOf("export async function protectCanvasImages"),
  source.indexOf("export async function downloadSingleImage"),
);

assert.match(
  protectCanvasImagesSource,
  /redirectOnUnauthorized:\s*false/,
  "protectCanvasImages is a non-blocking retention call and must not redirect to /login on 401",
);

console.log("canvas image protect no-auth redirect test passed");
