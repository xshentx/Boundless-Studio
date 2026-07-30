import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectSeedance2StoryRewriteInput } from "../src/app/canvas/utils/seedance2-story-integration.mjs";
import { rewriteSeedance2BatchPrompts } from "../src/app/canvas/utils/seedance2-prompt-rewrite.mjs";

const storyDirector = {
  id: "director-template-rewrite",
  type: "story_director",
  title: "Template rewrite story",
  position: { x: 0, y: 0 },
  width: 640,
  height: 760,
  metadata: {
    storyText: "A detective pursues a suspect through a rainy city.",
    storyShots: [
      {
        id: "shot-1",
        index: 1,
        title: "First shot",
        resultNodeIds: ["image-shot-1"],
      },
      {
        id: "shot-2",
        index: 2,
        title: "Second shot",
        appearingCharacterIds: ["detective", "suspect"],
        excludedCharacterIds: [],
        action: "The suspect turns into a narrow alley while the detective follows.",
        camera: "Handheld tracking shot",
        emotion: "urgent",
        imagePrompt: "Rainy alley chase storyboard",
        resultNodeIds: ["image-shot-2"],
      },
    ],
  },
};

const image1 = {
  id: "image-shot-1",
  type: "image",
  title: "\u7b2c 1 \u955c",
  position: { x: 0, y: 800 },
  width: 640,
  height: 360,
  metadata: {
    content: "https://example.test/shot-1.png",
    prompt: "current image prompt one",
  },
};

const image2 = {
  id: "image-shot-2",
  type: "image",
  title: "\u7b2c 2 \u955c",
  position: { x: 680, y: 800 },
  width: 640,
  height: 360,
  metadata: {
    content: "blob:http://wails.localhost/restored-shot-2",
    backendUrl: "http://127.0.0.1:3001/images/shot-2.png",
    storageKey: "image:restored-shot-2",
    prompt: "current image prompt two",
  },
};

const customTemplate = "CUSTOM_WORKFLOW_VIDEO_PROMPT_TEMPLATE";
const input = collectSeedance2StoryRewriteInput({
  storyDirector,
  nodes: [storyDirector, image1, image2],
  connections: [],
  template: customTemplate,
  shotId: "shot-2",
  shotIndex: 2,
});

assert.equal(input.template, customTemplate, "regeneration must use the video workflow template");
assert.equal(input.shots.length, 1, "single-node regeneration must rewrite only the requested shot");
assert.equal(input.shots[0].shotId, "shot-2");
assert.equal(input.shots[0].shotIndex, 2);
assert.equal(input.shots[0].sourceImageNodeId, image2.id);
assert.equal(input.shots[0].sourceImage, image2.metadata.storageKey, "local storage must take precedence over blob and localhost image URLs");
assert.equal(input.shots[0].currentPrompt, image2.metadata.prompt);
assert.equal(
  input.shots[0].storyContext.action,
  storyDirector.metadata.storyShots[1].action,
  "the selected Story Director shot context must be included",
);
assert.equal(input.shots[0].storyContext.camera, storyDirector.metadata.storyShots[1].camera);

let requestPayload;
const rewritten = await rewriteSeedance2BatchPrompts(
  { ...input, rewriteModel: "text-model" },
  async (payload) => {
    requestPayload = payload;
    return JSON.stringify({
      shots: [
        {
          shotId: "shot-2",
          shotIndex: 2,
          prompt: "template-generated video prompt",
        },
      ],
    });
  },
);

assert.equal(requestPayload.model, "text-model");
assert.equal(requestPayload.shots.length, 1);
assert.equal(requestPayload.shots[0].shotId, "shot-2");
assert.ok(
  requestPayload.contentText.includes(customTemplate),
  "the AI rewrite request must contain the workflow's current video prompt template",
);
assert.ok(
  requestPayload.contentText.includes(storyDirector.metadata.storyText) &&
    requestPayload.contentText.includes(storyDirector.metadata.storyShots[1].action),
  "the AI rewrite request must combine the full Story Director story and selected shot context",
);
assert.deepEqual(rewritten, [
  {
    shotId: "shot-2",
    shotIndex: 2,
    prompt: "template-generated video prompt",
  },
]);

const testDir = dirname(fileURLToPath(import.meta.url));
const canvasRoot = join(testDir, "..", "src", "app", "canvas");
const workspaceSource = readFileSync(join(canvasRoot, "workspace/canvas-client-page.tsx"), "utf8");
const nodeSource = readFileSync(join(canvasRoot, "components/canvas-node.tsx"), "utf8");

assert.match(
  workspaceSource,
  /workflowNode\.metadata\?\.seedancePromptTemplate/,
  "node regeneration must read the linked video workflow template",
);
assert.match(
  workspaceSource,
  /storyDirectorId = String\([\s\S]*?placeholder\.metadata\?\.seedanceStoryDirectorNodeId/,
  "node regeneration must use its linked story director as generation context",
);
assert.match(
  workspaceSource,
  /configuredTemplate \|\| defaultSeedancePromptTemplate\(\)/,
  "node regeneration must retain the workflow default-template fallback",
);
assert.match(
  workspaceSource,
  /collectSeedance2StoryRewriteInput\(\{[\s\S]*?template: rewriteTemplate,[\s\S]*?shotId: placeholder\.metadata\?\.seedanceStoryShotId,[\s\S]*?shotIndex:/,
  "node regeneration must collect only the selected story shot with the workflow template",
);
assert.match(
  workspaceSource,
  /rewriteSeedance2BatchPrompts\([\s\S]*?rewriteModel: promptTextModel/,
  "node regeneration must invoke the AI prompt rewriter",
);
assert.match(
  workspaceSource,
  /resolveSeedance2ReferenceSlots\(\s*\{[\s\S]*?placeholder,[\s\S]*?promptReferences\s*=\s*await hydrateSeedance2CustomerReferencesForTransport/,
  "node regeneration must include the video node's storyboard, character, scene, and manual references",
);
assert.match(
  workspaceSource,
  /request\.contentText[\s\S]*?promptReferences\.flatMap/,
  "the workflow template request and all video-node reference images must be sent in one multimodal request",
);
assert.match(
  workspaceSource,
  /seedancePromptRewriteTemplate: rewriteTemplate/,
  "the generated node must record the template used for the rewrite",
);
assert.match(
  workspaceSource,
  /requestsStoryPromptRegeneration[\s\S]*?regenerateSeedance2StoryPrompt\(nodeId\)/,
  "the video-node refresh action must launch template-based AI regeneration",
);
assert.equal(
  (nodeSource.match(/data-seedance2-regenerate-prompt/g) || []).length,
  2,
  "both video placeholder layouts must expose the refresh action",
);
const guardedRefreshButtons = nodeSource.match(
  /disabled=\{\s*isRunning \|\|\s*!node\.metadata\?\.seedanceStoryDirectorNodeId \|\|\s*!node\.metadata\?\.seedanceWorkflowNodeId\s*\}\s*data-seedance2-regenerate-prompt/g,
) || [];
assert.equal(
  guardedRefreshButtons.length,
  2,
  "both refresh actions must require story/workflow links and stay disabled while regenerating",
);

console.log("Seedance2 workflow-template prompt regeneration tests passed");
