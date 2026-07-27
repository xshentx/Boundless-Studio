import assert from "node:assert/strict";

import {
  buildStoryDirectorSlicePlaceholders,
  buildVersionedStoryDirectorSlicePlaceholders,
} from "../src/app/canvas/utils/seedance2-story-integration.mjs";

const workflowNode = {
  id: "workflow-story-references",
  type: "seedance2_workflow",
  title: "Seedance2 workflow",
  position: { x: 900, y: 0 },
  width: 640,
  height: 760,
  metadata: { seedanceWorkflowMode: "slice", seedanceRatio: "9:16" },
};

const storyDirector = {
  id: "director-story-references",
  type: "story_director",
  title: "Story director",
  position: { x: 0, y: 0 },
  width: 640,
  height: 760,
  metadata: {
    storyShots: [
      {
        id: "shot-1",
        index: 1,
        title: "Shot 1",
        visualContent: "Character A enters the room.",
        appearingCharacterIds: ["character-a", "character-b", "character-c"],
        resultNodeIds: ["storyboard-1"],
      },
      {
        id: "shot-2",
        index: 2,
        title: "Shot 2",
        visualContent: "Character A meets character B.",
        appearingCharacterIds: ["character-a", "character-b", "character-c"],
        resultNodeIds: ["storyboard-2"],
      },
    ],
    storyCharacters: [
      { id: "character-a", name: "Character A", importance: "main" },
      { id: "character-b", name: "Character B", importance: "main" },
      { id: "character-c", name: "Character C", importance: "main" },
    ],
  },
};

const imageNodes = [
  {
    id: "character-a-image",
    type: "image",
    title: "Character A",
    position: { x: -720, y: 0 },
    width: 340,
    height: 226,
    metadata: { content: "data:image/png;base64,character-a", status: "success" },
  },
  {
    id: "character-b-image",
    type: "image",
    title: "Character B",
    position: { x: -720, y: 280 },
    width: 340,
    height: 226,
    metadata: { content: "data:image/png;base64,character-b", status: "success" },
  },
  {
    id: "character-c-image",
    type: "image",
    title: "Character C",
    position: { x: -720, y: 560 },
    width: 340,
    height: 226,
    metadata: { content: "data:image/png;base64,character-c", status: "success" },
  },
  {
    id: "storyboard-1",
    type: "image",
    title: "Storyboard 1",
    position: { x: 0, y: 900 },
    width: 340,
    height: 226,
    metadata: {
      content: "data:image/png;base64,storyboard-1",
      storyGrid9ShotStart: 1,
      storyGrid9ShotEnd: 1,
      status: "success",
    },
  },
  {
    id: "storyboard-2",
    type: "image",
    title: "Storyboard 2",
    position: { x: 400, y: 900 },
    width: 340,
    height: 226,
    metadata: {
      content: "data:image/png;base64,storyboard-2",
      storyGrid9ShotStart: 2,
      storyGrid9ShotEnd: 2,
      status: "success",
    },
  },
];

const connections = [
  {
    id: "character-a-to-director",
    fromNodeId: "character-a-image",
    toNodeId: storyDirector.id,
    toHandleId: "story:reference",
  },
  {
    id: "character-b-to-director",
    fromNodeId: "character-b-image",
    toNodeId: storyDirector.id,
    toHandleId: "story:reference",
  },
  {
    id: "character-c-to-director",
    fromNodeId: "character-c-image",
    toNodeId: storyDirector.id,
    toHandleId: "story:reference",
  },
  {
    id: "storyboard-1-to-director",
    fromNodeId: "storyboard-1",
    toNodeId: storyDirector.id,
    toHandleId: "story:reference",
  },
  {
    id: "storyboard-2-to-director",
    fromNodeId: "storyboard-2",
    toNodeId: storyDirector.id,
    toHandleId: "story:reference",
  },
  {
    id: "character-a-to-storyboard-1",
    fromNodeId: "character-a-image",
    toNodeId: "storyboard-1",
  },
  {
    id: "character-a-to-storyboard-2",
    fromNodeId: "character-a-image",
    toNodeId: "storyboard-2",
  },
  {
    id: "character-b-to-storyboard-2",
    fromNodeId: "character-b-image",
    toNodeId: "storyboard-2",
  },
  {
    id: "director-to-workflow",
    fromNodeId: storyDirector.id,
    toNodeId: workflowNode.id,
  },
];

const referenceIdsFor = (result, placeholder) =>
  result.connections
    .filter((connection) => connection.toNodeId === placeholder.id)
    .filter((connection) => connection.fromNodeId !== workflowNode.id)
    .sort((left, right) => left.referenceSequence - right.referenceSequence)
    .map((connection) => connection.fromNodeId);

const result = buildStoryDirectorSlicePlaceholders({
  workflowNode,
  storyDirector,
  nodes: [workflowNode, storyDirector, ...imageNodes],
  connections,
  now: 12345,
});

const firstPlaceholder = result.nodes.find(
  (node) => node.metadata?.seedanceStoryShotIndex === 1,
);
const secondPlaceholder = result.nodes.find(
  (node) => node.metadata?.seedanceStoryShotIndex === 2,
);
assert.ok(firstPlaceholder, "the first story placeholder should be created");
assert.ok(secondPlaceholder, "the second story placeholder should be created");
assert.deepEqual(
  referenceIdsFor(result, firstPlaceholder),
  ["storyboard-1", "character-a-image"],
  "the first video reference list should include only its storyboard and directly connected image",
);
assert.deepEqual(
  referenceIdsFor(result, secondPlaceholder),
  ["storyboard-2", "character-a-image", "character-b-image"],
  "the second video reference list should follow direct storyboard input order",
);
assert.equal(
  referenceIdsFor(result, firstPlaceholder).includes("character-c-image"),
  false,
  "an image only connected to the story director must not be inherited",
);

const versioned = buildVersionedStoryDirectorSlicePlaceholders({
  workflowNode,
  storyDirector,
  nodes: [workflowNode, storyDirector, ...imageNodes],
  connections,
  rewrittenShots: [
    { shotId: "shot-1", shotIndex: 1, prompt: "Animate shot 1." },
    { shotId: "shot-2", shotIndex: 2, prompt: "Animate shot 2." },
  ],
  rewriteModel: "gpt-5.5",
  rewriteTemplate: "",
  now: 12346,
});
const firstVersioned = versioned.createdNodes.find(
  (node) => node.metadata?.seedanceStoryShotIndex === 1,
);
const secondVersioned = versioned.createdNodes.find(
  (node) => node.metadata?.seedanceStoryShotIndex === 2,
);
assert.ok(firstVersioned, "the first versioned placeholder should be created");
assert.ok(secondVersioned, "the second versioned placeholder should be created");
assert.deepEqual(referenceIdsFor(versioned, firstVersioned), ["storyboard-1", "character-a-image"]);
assert.deepEqual(referenceIdsFor(versioned, secondVersioned), ["storyboard-2", "character-a-image", "character-b-image"]);

console.log("seedance2 storyboard inherited reference tests passed");
