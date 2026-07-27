import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = pathToFileURL(
  join(
    repoRoot,
    "src/app/canvas/utils/canvas-workspace-entry.ts",
  ),
).href;

const { pickCanvasWorkspaceProjectId } = await import(helperPath);

const richProject = {
  id: "gqtgAPRgMApfbQ0Ar0iJq",
  updatedAt: "2026-07-17T04:08:18.921Z",
  nodes: Array.from({ length: 77 }, (_, index) => ({ id: `node-${index}` })),
  connections: Array.from({ length: 123 }, (_, index) => ({ id: `conn-${index}` })),
  chatSessions: [],
};
const blankPreferredProject = {
  id: "nKFZZ4P7L2qPTuoQsRDQi",
  updatedAt: "2026-07-18T11:44:47.815Z",
  nodes: [],
  connections: [],
  chatSessions: [],
};
const newerEmptyProject = {
  id: "new-empty",
  updatedAt: "2026-07-19T11:44:47.815Z",
  nodes: [],
  connections: [],
  chatSessions: [],
};

assert.equal(
  pickCanvasWorkspaceProjectId([blankPreferredProject, richProject], blankPreferredProject.id),
  richProject.id,
  "a blank preferred project should fall back to the richer populated project",
);
assert.equal(
  pickCanvasWorkspaceProjectId([blankPreferredProject, richProject], richProject.id),
  richProject.id,
  "a populated preferred project should still win",
);
assert.equal(
  pickCanvasWorkspaceProjectId([newerEmptyProject, richProject], null),
  richProject.id,
  "without a preferred id the workspace should open the richest populated project",
);

console.log("canvas workspace default project selection test passed");
