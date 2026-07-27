import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const imageSource = readFileSync(
  join(repoRoot, "src/services/api/image.ts"),
  "utf8",
);

assert.match(
  imageSource,
  /chunk\.split\(\/\\r\?\\n\\r\?\\n\//,
  "SSE event blocks must support CRLF and LF separators",
);
assert.match(
  imageSource,
  /eventBlock\s*\.split\(\/\\r\?\\n\//,
  "SSE data lines must support CRLF and LF separators",
);
assert.match(
  imageSource,
  /const chunks = buffer\.split\(\/\\r\?\\n\\r\?\\n\//,
  "stream progress buffering must support CRLF and LF separators",
);
assert.match(
  imageSource,
  /stream && !answer\.trim\(\)/,
  "streaming requests must recover a complete non-SSE JSON response",
);
assert.match(
  imageSource,
  /const fullAnswer = parseTextResponsePayload\(response\.data\)/,
  "streaming requests must parse the final complete response after progress callbacks",
);
assert.match(
  imageSource,
  /fullAnswer && fullAnswer !== answer/,
  "the final complete response must replace a partial streaming answer",
);

console.log("story director SSE parser tests passed");
