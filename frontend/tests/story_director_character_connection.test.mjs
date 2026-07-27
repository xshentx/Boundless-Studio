import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("..", import.meta.url);
const workspaceSource = readFileSync(
  new URL(
    "src/app/canvas/workspace/canvas-client-page.tsx",
    repoRoot,
  ),
  "utf8",
);

const generateStart = workspaceSource.indexOf(
  "const generateStoryCharacters = useCallback",
);
const generateEnd = workspaceSource.indexOf(
  "const generateStoryShots = useCallback",
  generateStart,
);
assert.ok(
  generateStart >= 0 && generateEnd > generateStart,
  "story character generation function should be extractable",
);

const generateSource = workspaceSource.slice(generateStart, generateEnd);
assert.match(
  generateSource,
  /fromNodeId:\s*nodeId,\s*toNodeId:\s*current\.id,\s*toHandleId:\s*"story:character"/s,
  "generated character image nodes should connect into the Story Director character input",
);
assert.doesNotMatch(
  generateSource,
  /fromNodeId:\s*current\.id,\s*toNodeId:\s*nodeId/,
  "generated character image nodes must not connect outward from the Story Director",
);

console.log("story director character connection tests passed");
