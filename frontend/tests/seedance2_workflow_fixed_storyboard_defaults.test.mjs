import assert from "node:assert/strict";

import * as workflow from "../src/app/canvas/utils/seedance2-workflow.mjs";

assert.equal(workflow.normalizeSeedance2Duration(), "10");
assert.equal(workflow.normalizeSeedance2Duration("invalid"), "10");

const built = workflow.buildSeedance2WorkflowNodes({
  origin: { x: 0, y: 0 },
  shotCount: 3,
  mode: "continuous",
  generateCount: 8,
});
const controller = built.nodes[0];
const placeholders = built.nodes.filter(
  (node) => node.metadata?.seedanceWorkflowRole === "placeholder",
);

assert.equal(controller.metadata.seedanceWorkflowMode, "slice");
assert.equal(controller.metadata.seedanceContinuous, false);
assert.equal(controller.metadata.seedanceDuration, "10");
assert.equal(controller.metadata.seedanceGenerateCount, 1);
assert.equal(placeholders.length, 3);
assert.ok(
  placeholders.every((node) => node.metadata.seedanceWorkflowMode === "slice"),
);
assert.ok(
  placeholders.every((node) => node.metadata.seedanceGenerateCount === 1),
);
assert.ok(placeholders.every((node) => node.metadata.count === 1));
assert.ok(
  placeholders.every((node) => node.metadata.seedanceDuration === "10"),
);

assert.equal(
  workflow.resolveSeedance2WorkflowRatio({
    storedRatio: "9:16",
    selection: "upstream",
    upstreamRatio: "16:9",
  }),
  "16:9",
);
assert.equal(
  workflow.resolveSeedance2WorkflowRatio({
    storedRatio: "9:16",
    selection: "manual",
    upstreamRatio: "16:9",
  }),
  "9:16",
);
assert.equal(
  workflow.resolveSeedance2WorkflowRatio({
    storedRatio: "bad",
    selection: "upstream",
    upstreamRatio: undefined,
  }),
  "9:16",
);

console.log("seedance2 fixed storyboard defaults tests passed");
