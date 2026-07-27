import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  reconcileSeedance2StoryPlaceholderReferences,
} from "../src/app/canvas/utils/seedance2-story-integration.mjs";

const workflowId = "workflow-story-sync";
const placeholderId = "video-story-sync";
const nodes = [
  { id: workflowId, type: "seedance2_workflow", metadata: {} },
  { id: "storyboard", type: "image", metadata: { content: "storyboard.png" } },
  { id: "character-a", type: "image", metadata: { content: "character-a.png" } },
  { id: "character-b", type: "image", metadata: { content: "character-b.png" } },
  { id: "character-c", type: "image", metadata: { content: "character-c.png" } },
  { id: "manual", type: "image", metadata: { content: "manual.png" } },
  {
    id: placeholderId,
    type: "video",
    metadata: {
      seedanceWorkflowRole: "placeholder",
      seedanceWorkflowNodeId: workflowId,
      seedanceStorySourceImageNodeId: "storyboard",
    },
  },
];

const initialConnections = [
  { id: "workflow-to-video", fromNodeId: workflowId, toNodeId: placeholderId },
  { id: "character-a-to-storyboard", fromNodeId: "character-a", toNodeId: "storyboard" },
  { id: "character-b-to-storyboard", fromNodeId: "character-b", toNodeId: "storyboard" },
  {
    id: "conn-seedance2-story-ref-workflow-story-sync-video-story-sync-character-c",
    fromNodeId: "character-c",
    toNodeId: placeholderId,
    referenceSequence: 3,
  },
  { id: "manual-to-video", fromNodeId: "manual", toNodeId: placeholderId, referenceSequence: 1 },
];

const referenceConnections = (connections) =>
  connections
    .filter((connection) => connection.toNodeId === placeholderId)
    .filter((connection) => connection.fromNodeId !== workflowId)
    .sort((left, right) => left.referenceSequence - right.referenceSequence);
const referenceIds = (connections) => referenceConnections(connections).map((connection) => connection.fromNodeId);
const referenceSequences = (connections) => referenceConnections(connections).map((connection) => connection.referenceSequence);

const synchronized = reconcileSeedance2StoryPlaceholderReferences({
  nodes,
  connections: initialConnections,
});
assert.deepEqual(referenceIds(synchronized), ["storyboard", "character-a", "character-b", "manual"]);
assert.deepEqual(referenceSequences(synchronized), [1, 2, 3, 4]);
assert.equal(
  synchronized.find((connection) => connection.id === "manual-to-video")?.id,
  "manual-to-video",
  "manual direct connections should be retained",
);
assert.equal(
  referenceIds(synchronized).includes("character-c"),
  false,
  "an obsolete automatic reference must be removed",
);

const afterRemoval = reconcileSeedance2StoryPlaceholderReferences({
  nodes,
  connections: synchronized.filter((connection) => connection.id !== "character-a-to-storyboard"),
});
assert.deepEqual(referenceIds(afterRemoval), ["storyboard", "character-b", "manual"]);

const afterReconnect = reconcileSeedance2StoryPlaceholderReferences({
  nodes,
  connections: [
    ...afterRemoval,
    { id: "character-a-reconnected", fromNodeId: "character-a", toNodeId: "storyboard" },
  ],
});
assert.deepEqual(referenceIds(afterReconnect), ["storyboard", "character-b", "character-a", "manual"]);

const afterDuplicateManual = reconcileSeedance2StoryPlaceholderReferences({
  nodes,
  connections: [
    ...afterReconnect,
    { id: "manual-character-b", fromNodeId: "character-b", toNodeId: placeholderId },
  ],
});
assert.equal(referenceIds(afterDuplicateManual).filter((id) => id === "character-b").length, 1);
assert.equal(
  reconcileSeedance2StoryPlaceholderReferences({ nodes, connections: afterDuplicateManual }),
  afterDuplicateManual,
  "a second synchronization should preserve the original connection array",
);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasClientSource = readFileSync(
  join(
    repoRoot,
    "src/app/canvas/workspace/canvas-client-page.tsx",
  ),
  "utf8",
);
assert.match(
  canvasClientSource,
  /reconcileSeedance2StoryPlaceholderReferences/,
  "the canvas client must synchronize existing story placeholders when graph inputs change",
);

console.log("seedance2 storyboard inherited reference sync tests passed");
