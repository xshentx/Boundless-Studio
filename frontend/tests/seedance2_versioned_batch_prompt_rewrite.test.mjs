import assert from "node:assert/strict";

import {
  buildSeedance2BatchRewriteRequest,
  buildSeedance2BatchRewritePrompt,
  parseSeedance2BatchRewriteResponse,
  rewriteSeedance2BatchPrompts,
} from "../src/app/canvas/utils/seedance2-prompt-rewrite.mjs";
import {
  buildVersionedStoryDirectorSlicePlaceholders,
  collectSeedance2StoryRewriteInput,
} from "../src/app/canvas/utils/seedance2-story-integration.mjs";

const rewriteInput = {
  story: `狼在山谷里追逐羊。\n${"完整故事中段。".repeat(3000)}\n完整故事末尾标记`,
  template: `保持角色一致，逐镜描述动作和镜头。\n${"模板规则中段。".repeat(1200)}\n完整模板末尾标记`,
  rewriteModel: "gpt-5.6",
  shots: [
    {
      shotId: "shot-1",
      shotIndex: 1,
      title: "狼发现羊",
      sourceImageNodeId: "image-shot-1",
      sourceImage: "data:image/png;base64,shot-image-1",
      currentPrompt: "黄昏山谷，狼从岩石后观察白羊",
    },
    {
      shotId: "shot-2",
      shotIndex: 2,
      title: "草地追逐",
      sourceImageNodeId: "image-shot-2",
      sourceImage: "data:image/png;base64,shot-image-2",
      currentPrompt: "狼冲出岩石，羊沿草地向森林奔跑",
    },
    {
      shotId: "shot-3",
      shotIndex: 3,
      title: "羊跃过溪流",
      sourceImageNodeId: "image-shot-3",
      sourceImage: "data:image/png;base64,shot-image-3",
      currentPrompt: "白羊跃过溪流，狼在后方急停",
    },
  ],
};

const builtPrompt = buildSeedance2BatchRewritePrompt(rewriteInput);
assert.match(builtPrompt, /完整故事末尾标记/, "the full story tail must not be clipped or summarized");
assert.match(builtPrompt, /完整模板末尾标记/, "the full template tail must not be clipped or summarized");
for (const shot of rewriteInput.shots) {
  assert.match(builtPrompt, new RegExp(shot.shotId));
  assert.match(builtPrompt, new RegExp(shot.sourceImageNodeId));
  assert.match(builtPrompt, new RegExp(shot.currentPrompt));
  assert.doesNotMatch(
    builtPrompt,
    new RegExp(shot.sourceImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "binary image content must travel as an image input, not be duplicated into text",
  );
}

const builtRequest = buildSeedance2BatchRewriteRequest(rewriteInput);
assert.equal(builtRequest.model, rewriteInput.rewriteModel);
assert.equal(builtRequest.contentText, builtPrompt);
assert.deepEqual(
  builtRequest.shots.map((shot) => shot.sourceImage),
  rewriteInput.shots.map((shot) => shot.sourceImage),
  "the batch request must carry each upstream storyboard image",
);

const rewrittenPayload = {
  shots: rewriteInput.shots.map((shot) => ({
    shotId: shot.shotId,
    shotIndex: shot.shotIndex,
    prompt: `${shot.title}的视频改写提示词`,
  })),
};

let successCalls = 0;
const rewritten = await rewriteSeedance2BatchPrompts(rewriteInput, async (request) => {
  successCalls += 1;
  assert.equal(request.model, rewriteInput.rewriteModel);
  assert.equal(request.contentText, builtPrompt, "the orchestrator should send the complete prompt unchanged");
  assert.deepEqual(
    request.shots.map((shot) => shot.sourceImage),
    rewriteInput.shots.map((shot) => shot.sourceImage),
  );
  return `\`\`\`json\n${JSON.stringify(rewrittenPayload)}\n\`\`\``;
});
assert.equal(successCalls, 1, "one batch rewrite must issue exactly one text-model request");
assert.deepEqual(rewritten, rewrittenPayload.shots);

assert.deepEqual(
  parseSeedance2BatchRewriteResponse(JSON.stringify(rewrittenPayload), rewriteInput.shots),
  rewrittenPayload.shots,
  "plain JSON responses should parse without a repair request",
);

let invalidCalls = 0;
await assert.rejects(
  () => rewriteSeedance2BatchPrompts(rewriteInput, async () => {
    invalidCalls += 1;
    return "{invalid json";
  }),
  /无法解析|JSON/i,
);
assert.equal(invalidCalls, 1, "invalid JSON must not trigger an automatic repair request");

await assert.rejects(
  () => rewriteSeedance2BatchPrompts(rewriteInput, async () => JSON.stringify({ shots: rewrittenPayload.shots.slice(0, 2) })),
  /shot-3|第 3 镜|缺少/i,
  "a missing shot must fail the entire batch",
);

await assert.rejects(
  () => rewriteSeedance2BatchPrompts(rewriteInput, async () => JSON.stringify({
    shots: rewrittenPayload.shots.map((shot) => shot.shotId === "shot-2" ? { ...shot, prompt: "   " } : shot),
  })),
  /shot-2|第 2 镜|空/i,
  "an empty prompt must fail the entire batch",
);

await assert.rejects(
  () => rewriteSeedance2BatchPrompts({
    ...rewriteInput,
    shots: [rewriteInput.shots[0], { ...rewriteInput.shots[1], shotId: "shot-4", shotIndex: 4 }],
  }, async () => JSON.stringify({
    shots: [rewrittenPayload.shots[0]],
  })),
  /shot-4|第 4 镜|缺少/i,
  "a missing shot must fail the entire batch",
);

const workflowNode = {
  id: "workflow-versioned",
  type: "seedance2_workflow",
  title: "Seedance2 workflow",
  position: { x: 100, y: 200 },
  width: 640,
  height: 760,
  metadata: {
    seedanceWorkflowMode: "slice",
    seedanceRatio: "9:16",
    seedanceDuration: "5",
    seedanceResolution: "720p",
    seedanceModel: "doubao-seedance-2-0-pro-260215",
  },
};
const storyDirector = {
  id: "director-versioned",
  type: "story_director",
  title: "狼追羊",
  position: { x: -700, y: 200 },
  width: 640,
  height: 760,
  metadata: {
    storyText: rewriteInput.story,
    storyShots: rewriteInput.shots.map((shot) => ({
      id: shot.shotId,
      index: shot.shotIndex,
      title: shot.title,
      resultNodeIds: [shot.sourceImageNodeId],
    })),
  },
};
const imageNodes = rewriteInput.shots.map((shot) => ({
  id: shot.sourceImageNodeId,
  type: "image",
  title: `第${shot.shotIndex}镜 ${shot.title}`,
  position: { x: -20, y: 200 + (shot.shotIndex - 1) * 300 },
  width: 320,
  height: 180,
  metadata: {
    content: shot.sourceImage,
    prompt: shot.currentPrompt,
    storyLabel: `第${shot.shotIndex}镜`,
  },
}));
const originalNodes = [workflowNode, storyDirector, ...imageNodes];
const originalConnections = [
  { id: "director-to-workflow", fromNodeId: storyDirector.id, toNodeId: workflowNode.id },
];

const collectedInput = collectSeedance2StoryRewriteInput({
  storyDirector,
  nodes: originalNodes,
  connections: originalConnections,
  template: rewriteInput.template,
});
assert.equal(collectedInput.story, rewriteInput.story);
assert.equal(collectedInput.template, rewriteInput.template);
assert.deepEqual(collectedInput.shots, rewriteInput.shots);
assert.notEqual(
  collectedInput.shots[0].currentPrompt,
  storyDirector.metadata.storyShots[0].imagePrompt,
  "the rewrite input must use the current image-node prompt instead of an old story-shot field",
);

const broadGridNode = {
  id: "image-grid-1-2",
  type: "image",
  title: "1-2 镜九宫格",
  position: { x: -400, y: 100 },
  width: 320,
  height: 180,
  metadata: {
    content: "data:image/png;base64,grid-1-2",
    prompt: "第1-2镜合并九宫格提示词",
    storyLabel: "第1-2镜",
    storyGrid9ShotStart: 1,
    storyGrid9ShotEnd: 2,
  },
};
const exactShotNodes = [
  {
    id: "image-exact-shot-1",
    type: "image",
    title: "第1镜精确分镜图",
    position: { x: -20, y: 100 },
    width: 320,
    height: 180,
    metadata: {
      content: "data:image/png;base64,exact-shot-1",
      prompt: "第1镜精确提示词",
      storyLabel: "第1镜",
    },
  },
  {
    id: "image-exact-shot-2",
    type: "image",
    title: "第2镜精确分镜图",
    position: { x: -20, y: 400 },
    width: 320,
    height: 180,
    metadata: {
      content: "data:image/png;base64,exact-shot-2",
      prompt: "第2镜精确提示词",
      storyLabel: "第2镜",
    },
  },
];
const exactStoryDirector = {
  ...storyDirector,
  metadata: {
    ...storyDirector.metadata,
    storyShots: [
      {
        id: "shot-1",
        index: 1,
        title: "第一镜",
        resultNodeIds: ["image-exact-shot-1"],
      },
      {
        id: "shot-2",
        index: 2,
        title: "第二镜",
        resultNodeIds: ["image-exact-shot-2"],
      },
    ],
  },
};
const exactInput = collectSeedance2StoryRewriteInput({
  storyDirector: exactStoryDirector,
  nodes: [workflowNode, exactStoryDirector, broadGridNode, ...exactShotNodes],
  connections: [
    { id: "director-to-workflow-exact", fromNodeId: exactStoryDirector.id, toNodeId: workflowNode.id },
    { id: "director-to-grid", fromNodeId: exactStoryDirector.id, toNodeId: broadGridNode.id },
    { id: "director-to-exact-1", fromNodeId: exactStoryDirector.id, toNodeId: exactShotNodes[0].id },
    { id: "director-to-exact-2", fromNodeId: exactStoryDirector.id, toNodeId: exactShotNodes[1].id },
  ],
  template: rewriteInput.template,
});
assert.deepEqual(
  exactInput.shots.map((shot) => [shot.shotIndex, shot.sourceImageNodeId, shot.currentPrompt]),
  [
    [1, "image-exact-shot-1", "第1镜精确提示词"],
    [2, "image-exact-shot-2", "第2镜精确提示词"],
  ],
  "exact per-shot storyboard images must win over a broad 1-2/grid image so prompts do not duplicate",
);

const v1 = buildVersionedStoryDirectorSlicePlaceholders({
  workflowNode,
  storyDirector,
  nodes: originalNodes,
  connections: originalConnections,
  rewrittenShots: rewrittenPayload.shots,
  rewriteModel: "gpt-5.6",
  rewriteTemplate: rewriteInput.template,
  now: Date.parse("2026-07-20T10:00:00.000Z"),
});
assert.equal(v1.setVersion, 1);
assert.equal(v1.createdNodes.length, 3);
assert.equal(v1.createdConnections.filter((connection) => connection.fromNodeId === workflowNode.id).length, 3);
assert.deepEqual(
  v1.createdNodes.map((node) => node.metadata.seedancePlaceholderSetVersion),
  [1, 1, 1],
);
assert.deepEqual(
  v1.createdNodes.map((node) => node.metadata.prompt),
  rewrittenPayload.shots.map((shot) => shot.prompt),
);
for (const [index, node] of v1.createdNodes.entries()) {
  const expectedShot = rewriteInput.shots[index];
  assert.equal(node.metadata.seedanceAutoPrompt, node.metadata.prompt);
  assert.equal(node.metadata.seedancePromptEditedByUser, false);
  assert.equal(node.metadata.seedancePromptRewriteModel, "gpt-5.6");
  assert.equal(node.metadata.seedancePromptRewriteTemplate, rewriteInput.template);
  assert.equal(node.metadata.seedancePromptRewriteCreatedAt, "2026-07-20T10:00:00.000Z");
  assert.equal(node.metadata.seedanceStorySourceImageNodeId, expectedShot.sourceImageNodeId);
  assert.equal(node.metadata.seedanceStoryShotId, expectedShot.shotId);
  assert.equal(node.metadata.seedanceStoryShotIndex, expectedShot.shotIndex);
  assert.ok(
    v1.createdConnections.some((connection) =>
      connection.fromNodeId === expectedShot.sourceImageNodeId && connection.toNodeId === node.id,
    ),
    `V1 shot ${expectedShot.shotIndex} should connect its current storyboard image`,
  );
}

const v1Snapshot = structuredClone(v1);
const v2Prompts = rewrittenPayload.shots.map((shot) => ({ ...shot, prompt: `${shot.prompt} V2` }));
const v2 = buildVersionedStoryDirectorSlicePlaceholders({
  workflowNode,
  storyDirector,
  nodes: v1.nodes,
  connections: v1.connections,
  rewrittenShots: v2Prompts,
  rewriteModel: "dola-chat",
  rewriteTemplate: `${rewriteInput.template}\nV2 规则`,
  now: Date.parse("2026-07-20T10:01:00.000Z"),
});
assert.equal(v2.setVersion, 2);
assert.equal(v2.createdNodes.length, 3);
assert.deepEqual(v2.nodes.slice(0, v1.nodes.length), v1Snapshot.nodes);
assert.deepEqual(v2.connections.slice(0, v1.connections.length), v1Snapshot.connections);
assert.ok(
  Math.min(...v2.createdNodes.map((node) => node.position.y)) >
    Math.max(...v1.createdNodes.map((node) => node.position.y + node.height)),
  "V2 should be laid out below the complete V1 group",
);

const legacyPlaceholder = {
  ...v1.createdNodes[0],
  id: "legacy-placeholder-without-set-version",
  metadata: {
    ...v1.createdNodes[0].metadata,
    seedancePlaceholderSetVersion: undefined,
  },
};
const afterLegacy = buildVersionedStoryDirectorSlicePlaceholders({
  workflowNode,
  storyDirector,
  nodes: [...originalNodes, legacyPlaceholder],
  connections: originalConnections,
  rewrittenShots: rewrittenPayload.shots,
  rewriteModel: "gpt-5.5",
  rewriteTemplate: rewriteInput.template,
  now: Date.parse("2026-07-20T10:02:00.000Z"),
});
assert.equal(afterLegacy.setVersion, 2, "legacy placeholders without a set version should count as V1");
assert.equal(legacyPlaceholder.metadata.seedancePlaceholderSetVersion, undefined, "legacy nodes must not be relabeled");

const beforeFailureNodes = structuredClone(originalNodes);
const beforeFailureConnections = structuredClone(originalConnections);
assert.throws(
  () => buildVersionedStoryDirectorSlicePlaceholders({
    workflowNode,
    storyDirector,
    nodes: originalNodes,
    connections: originalConnections,
    rewrittenShots: rewrittenPayload.shots.slice(0, 2),
    rewriteModel: "gpt-5.6",
    rewriteTemplate: rewriteInput.template,
    now: Date.parse("2026-07-20T10:03:00.000Z"),
  }),
  /shot-3|第 3 镜|缺少/i,
);
assert.deepEqual(originalNodes, beforeFailureNodes);
assert.deepEqual(originalConnections, beforeFailureConnections);

console.log("seedance2 versioned batch prompt rewrite tests passed");
