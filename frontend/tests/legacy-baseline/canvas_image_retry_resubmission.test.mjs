import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve(
  process.cwd(),
  "src/app/canvas/workspace/canvas-client-page.tsx",
);
const source = readFileSync(sourcePath, "utf8");
const retryStart = source.indexOf("  const handleRetryNode = useCallback(");
const retryEnd = source.indexOf("  useEffect(() => {\n    handleRetryNodeRef.current", retryStart);

assert.ok(retryStart >= 0 && retryEnd > retryStart, "image retry handler must be present");

const retrySource = source.slice(retryStart, retryEnd);

assert.match(
  retrySource,
  /const retryModel =/,
  "image retry must snapshot the failed node model before rebuilding config",
);
assert.match(
  retrySource,
  /model:\s*retryModel,\s*\n\s*imageModel:\s*retryModel,/,
  "image retry must restore both model fields so routing uses the saved model",
);
assert.match(
  retrySource,
  /size:\s*typeof savedImageMetadata\.size === "string"/,
  "image retry must preserve an explicit saved size, including the empty auto value",
);
assert.match(
  retrySource,
  /`canvas-\$\{node\.id\}-\$\{Date\.now\(\)\}-\$\{nanoid\(8\)\}`/,
  "every retry click must create a fresh client task id",
);
assert.match(
  retrySource,
  /savedImageMetadata\?\.prompt\s*\|\|\s*context\?\.prompt/,
  "image retry must prefer the failed node's saved prompt",
);
assert.doesNotMatch(
  retrySource,
  /model:\s*["']gpt-image-2["']/,
  "retry must not force a different model",
);

console.log("canvas image retry resubmission tests passed");
