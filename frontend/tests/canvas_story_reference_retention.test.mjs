import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasClientPath = join(
  repoRoot,
  "src/app/canvas/workspace/canvas-client-page.tsx",
);
const canvasClientSource = readFileSync(canvasClientPath, "utf8");

function loadStoryReferenceHelpers() {
  const start = canvasClientSource.indexOf("function syncStoryDirectorInputMetadata");
  const end = canvasClientSource.indexOf("function buildStoryCharacterImagePrompt");
  assert.notEqual(start, -1, "syncStoryDirectorInputMetadata should exist");
  assert.notEqual(end, -1, "buildStoryCharacterImagePrompt should exist after the sync helpers");
  const source = `${canvasClientSource.slice(start, end)}
module.exports = { syncStoryDirectorInputMetadata };`;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const sandbox = {
    exports: {},
    module: { exports: {} },
    CanvasNodeType: { StoryDirector: "story_director", Image: "image" },
    STORY_DIRECTOR_INPUT_HANDLES: [
      { id: "story:reference", kind: "reference" },
      { id: "story:character", kind: "character" },
      { id: "story:scene", kind: "scene" },
      { id: "story:prop", kind: "prop" },
    ],
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: "story-reference-helpers.js" });
  return sandbox.module.exports;
}

const { syncStoryDirectorInputMetadata } = loadStoryReferenceHelpers();

const nodesWithMissingBlobReference = [
  {
    id: "director-1",
    type: "story_director",
    title: "故事导演",
    position: { x: 0, y: 0 },
    width: 640,
    height: 760,
    metadata: {
      storyCharacters: [
        {
          id: "char-1",
          name: "小军",
          importance: "main",
          referenceNodeId: "character-ref-1",
          referenceImageUrl: "blob:http://127.0.0.1:3001/lost",
          assetSource: "upstream",
          assetLocked: true,
          status: "locked",
        },
      ],
    },
  },
  {
    id: "character-ref-1",
    type: "image",
    title: "小军人物参考图",
    position: { x: 0, y: 0 },
    width: 340,
    height: 226,
    metadata: {
      content: "",
      storageKey: "image:missing-local-blob",
      status: "error",
      errorDetails: "图片缓存已过期或丢失，请重新上传。",
    },
  },
];

const syncedNodes = syncStoryDirectorInputMetadata(nodesWithMissingBlobReference, [
  {
    id: "conn-character-ref",
    fromNodeId: "character-ref-1",
    toNodeId: "director-1",
    toHandleId: "story:character",
  },
]);
const syncedDirector = syncedNodes.find((node) => node.id === "director-1");

assert.deepEqual(
  Array.from(syncedDirector.metadata.storyCharacterSourceImageNodeIds),
  ["character-ref-1"],
  "Story Director should keep character reference IDs when the image node still has a storageKey but its blob URL failed to restore",
);
assert.equal(
  syncedDirector.metadata.storyCharacters[0].referenceNodeId,
  "character-ref-1",
  "A restore error must not clear an already locked upstream character binding",
);
assert.equal(
  syncedDirector.metadata.storyCharacters[0].status,
  "locked",
  "A restore error must not downgrade an upstream character to draft",
);

const createImageFileNodeSource = canvasClientSource.slice(
  canvasClientSource.indexOf("const createImageFileNode = useCallback"),
  canvasClientSource.indexOf("const createImageNodeFromVideoFrame"),
);
assert.match(
  createImageFileNodeSource,
  /uploadImage\(file,\s*CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS\)/,
  "manual canvas image uploads should be stored as retained local images",
);
assert.match(
  createImageFileNodeSource,
  /retained:\s*true/,
  "manual canvas image nodes should persist their retained marker in metadata",
);

const connectNodesSource = canvasClientSource.slice(
  canvasClientSource.indexOf("const connectNodes = useCallback"),
  canvasClientSource.indexOf("const createConnectedNode = useCallback"),
);
assert.match(
  connectNodesSource,
  /retainCanvasImageNodesById\(\[fromNodeId\]\)/,
  "connecting an image into a Story Director input should retain that referenced image",
);

console.log("canvas story reference retention tests passed");
