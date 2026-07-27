import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStoryDirectorSlicePlaceholders,
  buildVersionedStoryDirectorSlicePlaceholders,
} from "../src/app/canvas/utils/seedance2-story-integration.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasRoot = join(repoRoot, "src/app/canvas");
const nodeSource = readFileSync(join(canvasRoot, "components/canvas-node.tsx"), "utf8");
const typesSource = readFileSync(join(canvasRoot, "types.ts"), "utf8");
const storySource = readFileSync(join(canvasRoot, "utils/seedance2-story-integration.ts"), "utf8");

const workflowNode = {
  id: "workflow-compact",
  type: "seedance2_workflow",
  title: "Seedance2 workflow",
  position: { x: 100, y: 200 },
  width: 640,
  height: 760,
  metadata: {
    seedanceRatio: "9:16",
    seedanceRatioSelection: "upstream",
  },
};

const storyDirector = {
  id: "director-compact",
  type: "story_director",
  title: "Story Director",
  position: { x: 0, y: 0 },
  width: 640,
  height: 760,
  metadata: {
    storyAspectRatio: "16:9",
    storyShots: [
      { id: "shot-1", index: 1, title: "shot 1", visualContent: "opening shot", action: "walks in" },
      { id: "shot-2", index: 2, title: "shot 2", visualContent: "reaction shot", action: "looks back" },
    ],
  },
};

function build(nodes = [workflowNode, storyDirector], workflow = workflowNode) {
  return buildStoryDirectorSlicePlaceholders({
    workflowNode: workflow,
    storyDirector,
    nodes,
    connections: [{ id: "director-to-workflow", fromNodeId: storyDirector.id, toNodeId: workflowNode.id }],
    now: 12345,
  });
}

const created = build();
const createdPlaceholders = created.nodes.filter((node) => node.type === "video" && node.metadata?.seedanceWorkflowRole === "placeholder");
assert.equal(createdPlaceholders.length, 2, "two story shots should build two video placeholders");
assert.ok(
  createdPlaceholders.every((node) => node.metadata?.seedanceRatio === "16:9"),
  "an upstream-selected workflow ratio should follow the Story Director aspect ratio",
);

const legacyRatioWorkflow = {
  ...workflowNode,
  id: "workflow-legacy-ratio",
  metadata: {
    seedanceRatio: "9:16",
  },
};
const legacyRatioCreated = build([legacyRatioWorkflow, storyDirector], legacyRatioWorkflow);
const legacyRatioPlaceholders = legacyRatioCreated.nodes.filter(
  (node) => node.type === "video" && node.metadata?.seedanceWorkflowNodeId === legacyRatioWorkflow.id,
);
assert.ok(
  legacyRatioPlaceholders.every((node) => node.metadata?.seedanceRatio === "16:9"),
  "a legacy workflow without an explicit ratio selection should inherit the Story Director aspect ratio",
);

for (const [legacyManualMarker, legacyManualValue] of [
  ["seedanceInheritSourceRatio", false],
  ["seedanceRatioTouched", true],
]) {
  const legacyManualRatioWorkflow = {
    ...workflowNode,
    id: `workflow-legacy-manual-${legacyManualMarker}`,
    metadata: {
      seedanceRatio: "9:16",
      [legacyManualMarker]: legacyManualValue,
    },
  };
  const legacyManualRatioCreated = build(
    [legacyManualRatioWorkflow, storyDirector],
    legacyManualRatioWorkflow,
  );
  const legacyManualRatioPlaceholders = legacyManualRatioCreated.nodes.filter(
    (node) => node.type === "video" && node.metadata?.seedanceWorkflowNodeId === legacyManualRatioWorkflow.id,
  );
  assert.ok(
    legacyManualRatioPlaceholders.every((node) => node.metadata?.seedanceRatio === "9:16"),
    `${legacyManualMarker} should preserve a legacy manually selected ratio`,
  );
}

const manualRatioWorkflow = {
  ...workflowNode,
  id: "workflow-manual-ratio",
  metadata: {
    ...workflowNode.metadata,
    seedanceRatio: "9:16",
    seedanceRatioSelection: "manual",
  },
};
const manualRatioCreated = build([manualRatioWorkflow, storyDirector], manualRatioWorkflow);
const manualRatioPlaceholders = manualRatioCreated.nodes.filter(
  (node) => node.type === "video" && node.metadata?.seedanceWorkflowNodeId === manualRatioWorkflow.id,
);
assert.ok(
  manualRatioPlaceholders.every((node) => node.metadata?.seedanceRatio === "9:16"),
  "a manually selected workflow ratio should not be overwritten by the Story Director aspect ratio",
);

for (const [legacyManualMarker, legacyManualValue] of [
  ["seedanceInheritSourceRatio", false],
  ["seedanceRatioTouched", true],
]) {
  const versionedWorkflow = {
    ...workflowNode,
    id: `workflow-versioned-${legacyManualMarker}`,
    metadata: {
      seedanceRatio: "9:16",
      [legacyManualMarker]: legacyManualValue,
    },
  };
  const versionedStoryDirector = {
    ...storyDirector,
    id: `director-versioned-${legacyManualMarker}`,
    metadata: {
      storyAspectRatio: "16:9",
      storyShots: [{ id: "shot-versioned", index: 1, resultNodeIds: ["image-versioned"] }],
    },
  };
  const currentShotImage = {
    id: "image-versioned",
    type: "image",
    title: "Current shot",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: {
      content: "data:image/png;base64,x",
      storyGrid9ShotStart: 1,
      storyGrid9ShotEnd: 1,
    },
  };
  const versioned = buildVersionedStoryDirectorSlicePlaceholders({
    workflowNode: versionedWorkflow,
    storyDirector: versionedStoryDirector,
    nodes: [versionedWorkflow, versionedStoryDirector, currentShotImage],
    connections: [],
    rewrittenShots: [{ shotId: "shot-versioned", shotIndex: 1, prompt: "rewritten prompt" }],
    rewriteModel: "test-model",
    rewriteTemplate: "",
    now: 0,
  });
  assert.equal(
    versioned.createdNodes[0].metadata?.seedanceRatio,
    "9:16",
    `${legacyManualMarker} should preserve the ratio in versioned story placeholder creation`,
  );
}
assert.ok(
  createdPlaceholders.every(
    (node) => node.metadata?.seedanceGenerateCount === 1 && node.metadata?.count === 1,
  ),
  "story-created placeholders should keep one generation per shot",
);
assert.deepEqual(
  createdPlaceholders.map((node) => node.metadata.seedancePromptPanelMode),
  ["compact", "compact"],
  "story-created Seedance2 video placeholders should default to compact prompt panels to avoid heavy batch rendering",
);

const expandedExistingPlaceholder = {
  ...createdPlaceholders[0],
  metadata: {
    ...createdPlaceholders[0].metadata,
    seedancePromptPanelMode: "inline",
  },
};
const expandedRefresh = build([workflowNode, storyDirector, expandedExistingPlaceholder]);
assert.equal(
  expandedRefresh.nodes.find((node) => node.id === expandedExistingPlaceholder.id)?.metadata.seedancePromptPanelMode,
  "inline",
  "refresh should not collapse a placeholder the user already expanded",
);

const editedLegacyPlaceholder = {
  ...createdPlaceholders[1],
  metadata: {
    ...createdPlaceholders[1].metadata,
    seedancePromptPanelMode: undefined,
    seedancePromptEditedByUser: true,
    prompt: "user edited prompt",
  },
};
const editedRefresh = build([workflowNode, storyDirector, editedLegacyPlaceholder]);
assert.equal(
  editedRefresh.nodes.find((node) => node.id === editedLegacyPlaceholder.id)?.metadata.seedancePromptPanelMode,
  "inline",
  "refresh should keep user-edited legacy placeholders inline instead of forcing compact",
);

assert.match(
  typesSource,
  /seedancePromptPanelMode\?:\s*"compact"\s*\|\s*"inline"/,
  "CanvasNodeMetadata should allow compact and inline prompt panel modes",
);
assert.match(
  storySource,
  /seedancePromptPanelMode:\s*"compact"/,
  "story integration should stamp new story placeholders as compact",
);
assert.match(
  nodeSource,
  /node\.metadata\?\.seedancePromptPanelMode\s*===\s*"compact"/,
  "canvas node renderer should branch on compact prompt panel mode",
);
assert.match(
  nodeSource,
  /function\s+Seedance2CompactPromptSummary/,
  "canvas node renderer should include a lightweight compact prompt summary component",
);

const compactStart = nodeSource.indexOf("function Seedance2CompactPromptSummary");
const compactEnd = nodeSource.indexOf("function ", compactStart + 1);
assert.ok(compactStart >= 0 && compactEnd > compactStart, "compact prompt summary source should be extractable");
const compactSource = nodeSource.slice(compactStart, compactEnd);
assert.doesNotMatch(
  compactSource,
  /CanvasResourceMentionTextarea|Seedance2LandscapeHtmlPromptArea|Seedance2InlinePromptEditor/,
  "compact prompt summary must not render the heavy full prompt editor or textarea",
);
assert.match(
  compactSource,
  /seedancePromptPanelMode:\s*"inline"/,
  "compact prompt summary should provide an expand action that switches the node back to inline editing",
);
assert.match(
  compactSource,
  /onGenerateVideo\?\.\(node\)|onGenerateVideo\(\)/,
  "compact prompt summary should keep a generate-video action available",
);

console.log("seedance2 story placeholder compact render tests passed");
