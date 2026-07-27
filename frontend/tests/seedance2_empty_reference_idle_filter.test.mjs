import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSeedance2ReferenceSlots } from "../src/app/canvas/utils/seedance2-reference-slots.mjs";

const placeholder = {
  id: "video-placeholder",
  type: "video",
  title: "Seedance2 placeholder",
  position: { x: 0, y: 0 },
  width: 420,
  height: 746,
  metadata: {
    content: "",
    seedanceWorkflowRole: "placeholder",
    seedanceWorkflowNodeId: "workflow-1",
    seedanceReferenceOrder: ["当前分镜图", "角色图", "场景图", "其它参考图"],
  },
};

const idleEmptyImage = {
  id: "idle-empty-image",
  type: "image",
  title: "空图片占位",
  position: { x: -300, y: 0 },
  width: 320,
  height: 180,
  metadata: { content: "", status: "idle" },
};

const loadingEmptyImage = {
  id: "loading-empty-image",
  type: "image",
  title: "生成中的图片",
  position: { x: -300, y: 220 },
  width: 320,
  height: 180,
  metadata: { content: "", status: "loading" },
};

const idleSlots = resolveSeedance2ReferenceSlots({
  placeholder,
  nodes: [placeholder, idleEmptyImage],
  connections: [{ id: "idle-empty-reference", fromNodeId: idleEmptyImage.id, toNodeId: placeholder.id, referenceSequence: 1 }],
  visibleSlotCount: 4,
});

assert.equal(
  idleSlots[0].source,
  "empty",
  "an idle empty image placeholder should not occupy a Seedance2 reference slot as a pending reference",
);
assert.equal(idleSlots[0].nodeId, undefined, "idle empty image placeholders should not be bound into reference slots");

const loadingSlots = resolveSeedance2ReferenceSlots({
  placeholder,
  nodes: [placeholder, loadingEmptyImage],
  connections: [{ id: "loading-reference", fromNodeId: loadingEmptyImage.id, toNodeId: placeholder.id, referenceSequence: 1 }],
  visibleSlotCount: 4,
});

assert.equal(
  loadingSlots[0].source,
  "pending",
  "a loading image node should still show as pending so generated references can appear when ready",
);
assert.equal(loadingSlots[0].nodeId, loadingEmptyImage.id);

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasClientSource = readFileSync(
  join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);
const connectionRenderSource = canvasClientSource.slice(
  canvasClientSource.indexOf("{connections"),
  canvasClientSource.indexOf("{connectingParams", canvasClientSource.indexOf("{connections")),
);

assert.match(
  canvasClientSource,
  /function shouldRenderCanvasConnection/,
  "canvas client should centralize connection visibility checks",
);
assert.match(
  connectionRenderSource,
  /shouldRenderCanvasConnection\(/,
  "connection SVG rendering should skip non-renderable Seedance2 reference/control connections",
);
assert.match(
  canvasClientSource,
  /isSeedance2WorkflowControlConnection/,
  "Seedance2 workflow controller edges should be treated as structural, not rendered as reference lines",
);

console.log("seedance2 empty reference idle filter tests passed");
