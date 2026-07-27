import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as seedance2Workflow from "../src/app/canvas/utils/seedance2-workflow.mjs";

const {
  buildSeedance2WorkflowNodes,
  compactBulkSeedance2PlaceholderPanels,
  createSeedance2VideoPlaceholderMetadata,
} = seedance2Workflow;

const built = buildSeedance2WorkflowNodes({
  origin: { x: 0, y: 0 },
  shotCount: 12,
  ratio: "9:16",
});

const placeholders = built.nodes.filter(
  (node) => node.type === "video" && node.metadata?.seedanceWorkflowRole === "placeholder",
);

assert.equal(placeholders.length, 12, "bulk workflow should create twelve video placeholders");
assert.deepEqual(
  placeholders.map((node) => node.metadata.seedancePromptPanelMode),
  Array.from({ length: 12 }, () => "compact"),
  "bulk Seedance2 workflow-created placeholders should default to compact panels so twelve cards do not render full editors at once",
);

assert.equal(
  createSeedance2VideoPlaceholderMetadata().seedancePromptPanelMode,
  "inline",
  "single ad-hoc video placeholder metadata should still default to inline editing",
);

const legacyBulkPlaceholders = Array.from({ length: 12 }, (_, index) => ({
  id: `legacy-placeholder-${index + 1}`,
  type: "video",
  title: `legacy ${index + 1}`,
  position: { x: index * 10, y: 0 },
  width: 420,
  height: 746,
  metadata: {
    content: "",
    seedanceWorkflowRole: "placeholder",
    seedanceWorkflowNodeId: "legacy-workflow",
    seedanceShotIndex: index + 1,
    seedancePromptPanelMode: "inline",
  },
}));

assert.equal(
  typeof compactBulkSeedance2PlaceholderPanels,
  "function",
  "Seedance2 workflow utils should export a loader-safe bulk placeholder compaction helper",
);

const compactedLegacy = compactBulkSeedance2PlaceholderPanels([
  ...legacyBulkPlaceholders,
  {
    ...legacyBulkPlaceholders[0],
    id: "legacy-edited-placeholder",
    metadata: {
      ...legacyBulkPlaceholders[0].metadata,
      seedancePromptEditedByUser: true,
    },
  },
  {
    ...legacyBulkPlaceholders[0],
    id: "legacy-expanded-placeholder",
    metadata: {
      ...legacyBulkPlaceholders[0].metadata,
      seedancePromptExpandedByUser: true,
    },
  },
  {
    id: "single-placeholder",
    type: "video",
    title: "single",
    position: { x: 0, y: 0 },
    width: 420,
    height: 746,
    metadata: {
      content: "",
      seedanceWorkflowRole: "placeholder",
      seedanceWorkflowNodeId: "single-workflow",
      seedancePromptPanelMode: "inline",
    },
  },
]);

assert.deepEqual(
  compactedLegacy.slice(0, 12).map((node) => node.metadata.seedancePromptPanelMode),
  Array.from({ length: 12 }, () => "compact"),
  "old saved bulk placeholders should be compacted on load even if they were created before the compact default existed",
);
assert.equal(
  compactedLegacy.find((node) => node.id === "legacy-edited-placeholder")?.metadata.seedancePromptPanelMode,
  "inline",
  "user-edited placeholders should stay inline when compacting old bulk placeholders",
);
assert.equal(
  compactedLegacy.find((node) => node.id === "legacy-expanded-placeholder")?.metadata.seedancePromptPanelMode,
  "inline",
  "user-expanded placeholders should stay inline when compacting old bulk placeholders",
);
assert.equal(
  compactedLegacy.find((node) => node.id === "single-placeholder")?.metadata.seedancePromptPanelMode,
  "inline",
  "single placeholders should not be auto-compacted",
);

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasClientSource = readFileSync(
  join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);
const sanitizeCanvasNodesSource = canvasClientSource.slice(
  canvasClientSource.indexOf("function sanitizeCanvasNodes"),
  canvasClientSource.indexOf("function normalizeEmptyVideoNodeToSeedance2Placeholder"),
);
assert.match(
  canvasClientSource,
  /compactBulkSeedance2PlaceholderPanels/,
  "canvas client should import the bulk compaction helper",
);
assert.match(
  sanitizeCanvasNodesSource,
  /compactBulkSeedance2PlaceholderPanels\(/,
  "canvas load sanitization should compact legacy bulk placeholders before rendering them",
);

console.log("seedance2 workflow bulk placeholder compact render tests passed");
