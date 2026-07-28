import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `unable to extract ${startMarker}`);
  return source.slice(start, end);
}

const analyzeSource = sourceBetween(
  "const analyzeStoryDirector = useCallback(",
  "const generateStoryCharacters = useCallback(",
);
assert.equal(
  (analyzeSource.match(/applyPersistedNodes\(\(prev\) =>/g) || []).length,
  3,
  "analysis loading, success, and failure transitions must update nodesRef synchronously",
);
assert.equal(
  (analyzeSource.match(/setNodes\(\(prev\) =>/g) || []).length,
  1,
  "only transient streaming text should use a non-persisted React state update",
);
assert.match(
  analyzeSource,
  /storyAnalysisStatus: NODE_STATUS_SUCCESS,[\s\S]*?return analysis;/,
  "successful analysis must settle before the one-click flow starts image generation",
);

for (const [startMarker, endMarker, label] of [
  [
    "const generateStoryCharacters = useCallback(",
    "const generateStoryShots = useCallback(",
    "character regeneration",
  ],
  [
    "const generateStoryShots = useCallback(",
    "const runStoryDirectorAll = useCallback(",
    "shot regeneration",
  ],
]) {
  const generationSource = sourceBetween(startMarker, endMarker);
  assert.match(
    generationSource,
    /storyAnalysisStatus: NODE_STATUS_SUCCESS,\s*storyGenerationStatus: NODE_STATUS_LOADING/,
    `${label} must repair a stale analysis loading flag before starting`,
  );
  assert.match(
    generationSource,
    /storyGenerationStatus: NODE_STATUS_ERROR,[\s\S]*?finally \{\s*setRunningNodeId\(null\);/,
    `${label} failure must settle the generation state and release the running lock`,
  );
  assert.match(
    generationSource,
    /storyGenerationStatus: NODE_STATUS_SUCCESS,\s*status: NODE_STATUS_SUCCESS,\s*errorDetails: undefined/,
    `${label} success must explicitly clear the previous generation error`,
  );
}

const retrySource = sourceBetween(
  "const handleRetryNode = useCallback(",
  "handleRetryNodeRef.current = (node)",
);
assert.equal(
  (retrySource.match(/reconcileStoryDirectorImageResults\(/g) || []).length,
  4,
  "story image retry loading, task submission, success, and failure must reconcile the director state",
);

const reconciliationSource = sourceBetween(
  "function reconcileStoryDirectorImageResults(",
  "function storyDirectorOutputImages(",
);
assert.match(
  reconciliationSource,
  /syncStoryDirectorInputMetadata\(nodes, connections\)/,
  "reconciliation must bind successful character inputs before settling the director",
);
assert.match(
  reconciliationSource,
  /storyDirectorCharacterInputImages\([\s\S]*?connection\.toHandleId !== "story:character"/,
  "incoming story:character image nodes must participate in reconciliation",
);
assert.doesNotMatch(
  reconciliationSource,
  /if \(!shots\.length\) return node/,
  "character-only retries must settle even when the director has no shots",
);
assert.match(
  reconciliationSource,
  /isActiveStoryImageTask\(imageNode\)[\s\S]*?status: "generating" as const/,
  "an active character image retry must move the character back to generating",
);
assert.match(
  reconciliationSource,
  /imageNode\.metadata\?\.status === NODE_STATUS_ERROR[\s\S]*?status: "error" as const/,
  "a failed character image retry must propagate its error to the character",
);
assert.match(
  reconciliationSource,
  /allRequiredCharactersReady[\s\S]*?generationCompleted =\s*allShotsDone \|\| allRequiredCharactersReady/,
  "ready required characters must allow a character-only workflow to recover",
);
assert.match(
  reconciliationSource,
  /if \(\s*metadata\.sourceImageTaskId &&\s*metadata\.status === NODE_STATUS_LOADING[\s\S]*?if \(metadata\.status === NODE_STATUS_ERROR\)[\s\S]*?if \(metadata\.content\)/,
  "current loading/error state must take precedence over retained image content",
);
assert.match(
  reconciliationSource,
  /activeIndexes\.has\(shot\.index\)[\s\S]*?status: "generating" as const/,
  "regenerating an existing completed shot must return it to generating",
);
assert.match(
  reconciliationSource,
  /shouldRecoverCompletedStory[\s\S]*?!hasGenerationError[\s\S]*?!analysisFailed/,
  "completed generation may recover stale errors but must preserve analysis failures",
);
assert.match(
  reconciliationSource,
  /shouldSettleStoryGeneration[\s\S]*?status: hasGenerationError[\s\S]*?storyGenerationStatus: hasGenerationError[\s\S]*?errorDetails: hasGenerationError[\s\S]*?: undefined/,
  "successful reconciliation must clear both the failure status and stale error details",
);

const directRegenerationSource = sourceBetween(
  "const directImageRegeneration =",
  "const sourceTextContent =",
);
assert.equal(
  (
    directRegenerationSource.match(/reconcileStoryDirectorImageResults\(/g) ||
    []
  ).length,
  4,
  "direct regeneration validation, pending, success, and failure snapshots must reconcile the director",
);
assert.match(
  directRegenerationSource,
  /targetIds\.has\(node\.id\) &&\s*node\.metadata\?\.status === NODE_STATUS_LOADING &&\s*Boolean\(node\.metadata\?\.sourceImageTaskId\)/,
  "direct regeneration failure must identify active tasks instead of checking for empty content",
);
assert.doesNotMatch(
  directRegenerationSource,
  /targetIds\.has\(node\.id\) && !node\.metadata\?\.content/,
  "retained old content must not hide a failed direct regeneration",
);
assert.match(
  directRegenerationSource,
  /taskIdByTargetId\.forEach[\s\S]*?resumedImageTaskIdsRef\.current\.add\(taskId\)[\s\S]*?setNodes\(reconciledPendingNodes\)/,
  "direct regeneration must register active tasks before rendering pending nodes",
);
assert.match(
  directRegenerationSource,
  /directPendingTaskIds\.forEach[\s\S]*?resumedImageTaskIdsRef\.current\.delete\(taskId\)/,
  "failed direct regeneration must release its task recovery guards",
);

const resumeImageTaskSource = sourceBetween(
  "const resumeCanvasImageTask = useCallback(",
  "  useEffect(() => {\n    if (!projectLoaded) return;\n    nodes",
);
assert.doesNotMatch(
  resumeImageTaskSource,
  /sourceImageTaskId === taskId &&\s*!node\.metadata\?\.content/,
  "a resumed in-place regeneration failure must not be hidden by retained content",
);
const resumeImageEffectSource = sourceBetween(
  "  useEffect(() => {\n    if (!projectLoaded) return;\n    nodes",
  "  useEffect(() => {\n    if (!projectLoaded) return;\n    if (viewportSaveTimerRef.current)",
);
assert.match(
  resumeImageEffectSource,
  /sourceImageTaskId[\s\S]*?status === NODE_STATUS_LOADING/,
  "loading image tasks with retained content must resume after project restore",
);
assert.doesNotMatch(
  resumeImageEffectSource,
  /!node\.metadata\?\.content/,
  "project restore must not skip an in-place regeneration just because old content remains",
);

const imageMetadataSource = sourceBetween(
  "function imageMetadata(",
  "function videoMetadata(",
);
assert.match(
  imageMetadataSource,
  /errorDetails: undefined,[\s\S]*?sourceImageTaskId: undefined/,
  "successful image application must clear stale errors and the completed task id",
);

function loadReconciliationHelpers() {
  const helperStart = source.indexOf(
    "function reconcileStoryDirectorImageResults(",
  );
  const helperEnd = source.indexOf("function buildStoryCharacterImagePrompt(");
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helperSource = `${source.slice(helperStart, helperEnd)}
module.exports = { reconcileStoryDirectorImageResults };`;
  const { outputText } = ts.transpileModule(helperSource, {
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
    NODE_STATUS_LOADING: "loading",
    NODE_STATUS_SUCCESS: "success",
    NODE_STATUS_ERROR: "error",
    STORY_DIRECTOR_INPUT_HANDLES: [
      { id: "story:reference", kind: "reference" },
      { id: "story:character", kind: "character" },
      { id: "story:scene", kind: "scene" },
      { id: "story:prop", kind: "prop" },
    ],
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, {
    filename: "story-director-reconciliation.js",
  });
  return sandbox.module.exports;
}

const { reconcileStoryDirectorImageResults } = loadReconciliationHelpers();
const characterConnection = {
  id: "character-connection",
  fromNodeId: "character-image",
  toNodeId: "director-character",
  toHandleId: "story:character",
};
const characterRetryNodes = [
  {
    id: "director-character",
    type: "story_director",
    metadata: {
      status: "error",
      storyAnalysisStatus: "success",
      storyGenerationStatus: "error",
      errorDetails: "old character failure",
      storyShots: [],
      storyCharacters: [
        {
          id: "character-1",
          name: "Hero",
          aliases: ["Lead"],
          importance: "main",
          appearance: "",
          visualPrompt: "",
          status: "error",
          errorDetails: "old character failure",
        },
      ],
    },
  },
  {
    id: "character-image",
    type: "image",
    title: "Character-Hero",
    metadata: {
      storyLabel: "Hero",
      prompt: "Hero character sheet",
      status: "loading",
      sourceImageTaskId: "character-task",
    },
  },
];
const characterPending = reconcileStoryDirectorImageResults(
  characterRetryNodes,
  [characterConnection],
);
const pendingDirector = characterPending.find(
  (node) => node.id === "director-character",
);
assert.equal(pendingDirector.metadata.storyCharacters[0].status, "generating");
assert.equal(pendingDirector.metadata.status, "loading");
assert.equal(pendingDirector.metadata.storyGenerationStatus, "loading");
assert.equal(pendingDirector.metadata.errorDetails, undefined);

const characterSuccess = reconcileStoryDirectorImageResults(
  characterPending.map((node) =>
    node.id === "character-image"
      ? {
          ...node,
          metadata: {
            ...node.metadata,
            content: "stored-character.png",
            status: "success",
            sourceImageTaskId: undefined,
            errorDetails: undefined,
          },
        }
      : node,
  ),
  [characterConnection],
);
const successfulCharacterDirector = characterSuccess.find(
  (node) => node.id === "director-character",
);
assert.equal(
  successfulCharacterDirector.metadata.storyCharacters[0].status,
  "locked",
);
assert.equal(successfulCharacterDirector.metadata.status, "success");
assert.equal(
  successfulCharacterDirector.metadata.storyGenerationStatus,
  "success",
);
assert.equal(successfulCharacterDirector.metadata.errorDetails, undefined);

const characterFailure = reconcileStoryDirectorImageResults(
  characterPending.map((node) =>
    node.id === "character-image"
      ? {
          ...node,
          metadata: {
            ...node.metadata,
            status: "error",
            sourceImageTaskId: undefined,
            errorDetails: "new character failure",
          },
        }
      : node,
  ),
  [characterConnection],
);
const failedCharacterDirector = characterFailure.find(
  (node) => node.id === "director-character",
);
assert.equal(
  failedCharacterDirector.metadata.storyCharacters[0].status,
  "error",
);
assert.equal(failedCharacterDirector.metadata.status, "error");
assert.equal(
  failedCharacterDirector.metadata.errorDetails,
  "new character failure",
);

const shotConnection = {
  id: "shot-connection",
  fromNodeId: "director-shot",
  toNodeId: "shot-image",
};
const directShotNodes = [
  {
    id: "director-shot",
    type: "story_director",
    metadata: {
      status: "success",
      storyAnalysisStatus: "success",
      storyGenerationStatus: "success",
      storyCharacters: [],
      storyShots: [
        {
          id: "shot-1",
          index: 1,
          status: "done",
          resultNodeIds: ["shot-image"],
        },
      ],
    },
  },
  {
    id: "shot-image",
    type: "image",
    title: "Shot 1",
    metadata: {
      storyLabel: "1",
      storyGrid9ShotStart: 1,
      storyGrid9ShotEnd: 1,
      content: "old-shot.png",
      status: "loading",
      sourceImageTaskId: "shot-task",
    },
  },
];
const directShotPending = reconcileStoryDirectorImageResults(directShotNodes, [
  shotConnection,
]);
const pendingShotDirector = directShotPending.find(
  (node) => node.id === "director-shot",
);
assert.equal(pendingShotDirector.metadata.storyShots[0].status, "generating");
assert.equal(pendingShotDirector.metadata.status, "loading");

const directShotFailure = reconcileStoryDirectorImageResults(
  directShotPending.map((node) =>
    node.id === "shot-image"
      ? {
          ...node,
          metadata: {
            ...node.metadata,
            status: "error",
            sourceImageTaskId: undefined,
            errorDetails: "new shot failure",
          },
        }
      : node,
  ),
  [shotConnection],
);
const failedShotDirector = directShotFailure.find(
  (node) => node.id === "director-shot",
);
assert.equal(failedShotDirector.metadata.storyShots[0].status, "error");
assert.equal(failedShotDirector.metadata.status, "error");
assert.equal(failedShotDirector.metadata.errorDetails, "new shot failure");

const directShotSuccess = reconcileStoryDirectorImageResults(
  directShotPending.map((node) =>
    node.id === "shot-image"
      ? {
          ...node,
          metadata: {
            ...node.metadata,
            content: "new-shot.png",
            status: "success",
            sourceImageTaskId: undefined,
            errorDetails: undefined,
          },
        }
      : node,
  ),
  [shotConnection],
);
const successfulShotDirector = directShotSuccess.find(
  (node) => node.id === "director-shot",
);
assert.equal(successfulShotDirector.metadata.storyShots[0].status, "done");
assert.equal(successfulShotDirector.metadata.status, "success");
assert.equal(successfulShotDirector.metadata.errorDetails, undefined);

const recoverySource = sourceBetween(
  "function recoverInterruptedStoryDirector(",
  "function clearCanvasGenerationTrace(",
);
assert.match(
  recoverySource,
  /metadata\.storyAnalysisStatus === NODE_STATUS_LOADING\s*\? "idle"/,
  "restoring a project must clear an interrupted analysis status",
);
assert.match(
  recoverySource,
  /metadata\.storyGenerationStatus === NODE_STATUS_LOADING\s*\? "idle"/,
  "restoring a project must clear an interrupted generation status",
);

console.log("story director regeneration state recovery tests passed");
