import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const workspaceSource = readFileSync(
  resolve(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);
const typesSource = readFileSync(
  resolve(repoRoot, "src/app/canvas/types.ts"),
  "utf8",
);
const videoApiSource = readFileSync(
  resolve(repoRoot, "src/services/api/video.ts"),
  "utf8",
);
const nativeVideoSource = readFileSync(
  resolve(repoRoot, "src/services/api/native-relay-video.ts"),
  "utf8",
);

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertOrdered(source, markers, message) {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert.notEqual(next, -1, `${message}: missing ${marker}`);
    assert.ok(next > cursor, message);
    cursor = next;
  }
}

assert.match(
  typesSource,
  /videoGenerationTask\?:\s*\{\s*id: string;\s*provider: "openai" \| "seedance";\s*model: string;/,
  "video task identity must be serializable in canvas metadata",
);
assert.match(
  typesSource,
  /boardRouteKey\?: "videoGeneration";\s*routeProviderId\?: string;/,
  "restored video tasks must retain a safe route identity without persisting API keys",
);
assert.match(videoApiSource, /if \(task\.routeProviderId\) \{/);
assert.match(videoApiSource, /item\.id === task\.routeProviderId/);
assert.match(
  videoApiSource,
  /resolveApiRequestRoute\(config, "video", task\.model, task\.boardRouteKey\)/,
  "legacy stored tasks should fall back to their board route",
);
assert.match(
  videoApiSource,
  /export async function waitForVideoGenerationTask\(/,
);
assert.match(
  between(
    videoApiSource,
    "export async function requestVideoGeneration(",
    "export async function createVideoGenerationTask(",
  ),
  /return waitForVideoGenerationTask\(config, task\)/,
  "legacy callers should use the same resumable polling implementation",
);

const completeVideoTask = between(
  workspaceSource,
  "  const completeCanvasVideoTask = useCallback(",
  "  const resumeCanvasVideoTask = useCallback(",
);
assert.match(
  completeVideoTask,
  /waitForVideoGenerationTask\(\s*generationConfig,\s*task,?\s*\)/,
);
assert.match(completeVideoTask, /storeGeneratedVideo\(generated\)/);
assert.match(completeVideoTask, /videoGenerationTask: undefined/);
assert.match(completeVideoTask, /persistCanvasSnapshot\(nextNodes\)/);

const resumeVideoTask = between(
  workspaceSource,
  "  const resumeCanvasVideoTask = useCallback(",
  "  const resumeSeedance2CustomerVideoTask = useCallback(",
);
assert.match(
  resumeVideoTask,
  /completeCanvasVideoTask\(nodeId, task, generationConfig, prompt\)/,
);
assert.match(resumeVideoTask, /status: NODE_STATUS_ERROR/);
assert.match(resumeVideoTask, /videoGenerationTask: undefined/);
assert.match(
  resumeVideoTask,
  /catch \(error\) \{\s*if \(!canvasPageActiveRef\.current\) return;/,
  "a restored video task must not write an error after the canvas page unmounts",
);
assert.match(
  resumeVideoTask,
  /if \(canvasPageActiveRef\.current\) setVideoNodeRunning\(nodeId, false\)/,
  "restored video task cleanup must not update an unmounted component",
);

const resumeVideoSubmission = between(
  workspaceSource,
  "  const resumeCanvasVideoSubmission = useCallback(",
  "  const resumeSeedance2CustomerVideoTask = useCallback(",
);
assert.match(resumeVideoSubmission, /let resumedTaskId: string \| undefined/);
assert.match(resumeVideoSubmission, /resumedTaskId = task\.id/);
assert.match(
  resumeVideoSubmission,
  /item\.metadata\?\.videoGenerationTask\?\.id === resumedTaskId/,
  "a resumed submission failure must still identify the persisted polling task",
);
assert.match(
  resumeVideoSubmission,
  /isCurrentSubmission \|\| isCurrentTask/,
  "submission and polling failures must both leave the video node in an error state",
);

const resumeSeedanceVideoTask = between(
  workspaceSource,
  "  const resumeSeedance2CustomerVideoTask = useCallback(",
  "  const resumeSeedance2CustomerVideoSubmission = useCallback(",
);
assert.match(
  resumeSeedanceVideoTask,
  /catch \(error\) \{\s*if \(!canvasPageActiveRef\.current\) return;/,
  "a restored Seedance task must not write an error after the canvas page unmounts",
);
assert.match(
  resumeSeedanceVideoTask,
  /if \(canvasPageActiveRef\.current\) setVideoNodeRunning\(nodeId, false\)/,
  "restored Seedance cleanup must not update an unmounted component",
);

const mediaResumeEffect = between(
  workspaceSource,
  "    nodes.forEach((node) => {",
  "    if (viewportSaveTimerRef.current)",
);
assert.match(mediaResumeEffect, /resumeCanvasVideoTask\(node.id, storedTask\)/);
assert.match(mediaResumeEffect, /seedanceGenerationTaskState/);
assert.match(mediaResumeEffect, /seedanceTask\?\.status === "generating"/);
assert.match(
  mediaResumeEffect,
  /resumeSeedance2CustomerVideoTask\(node.id, seedanceTask.taskId\)/,
);

const interruptedRecovery = between(
  workspaceSource,
  "function recoverInterruptedGeneration(",
  "function recoverInterruptedStoryDirector(",
);
assert.match(
  interruptedRecovery,
  /CanvasNodeType.Image && node.metadata.sourceImageTaskId/,
);
assert.match(
  interruptedRecovery,
  /node\.metadata\.videoGenerationTask \|\|\s*node\.metadata\.videoGenerationSubmissionId/,
);
assert.match(
  interruptedRecovery,
  /seedanceGenerationTaskState\?\.status === "generating"/,
);
assert.match(interruptedRecovery, /seedanceGenerationTaskState.taskId/);

const firstVideoGeneration = between(
  workspaceSource,
  '        if (mode === "video") {',
  '        if (mode === "audio") {',
);
assert.match(firstVideoGeneration, /createVideoGenerationTask\(/);
assert.match(firstVideoGeneration, /videoGenerationTask: storedTask/);
assert.match(firstVideoGeneration, /boardRouteKey: "videoGeneration" as const/);
assert.match(firstVideoGeneration, /routeProviderId: task\.routeProviderId/);
assert.match(firstVideoGeneration, /persistCanvasSnapshot\(taskNodes\)/);
assert.match(firstVideoGeneration, /completeCanvasVideoTask\(/);

assert.ok(
  (workspaceSource.match(/routeProviderId: task\.routeProviderId/g) || [])
    .length >= 2,
  "both initial generation and retry must persist the original video route provider",
);

assert.match(workspaceSource, /const resumeCanvasImageTask = useCallback\(/);
assert.match(workspaceSource, /pollCanvasImageTask\(taskId\)/);
assert.match(workspaceSource, /void resumeCanvasImageTask\(node.id, taskId\)/);

assert.match(typesSource, /videoGenerationSubmissionId\?: string/);
assert.match(typesSource, /submissionId\?: string/);
assert.match(videoApiSource, /"Idempotency-Key": idempotencyKey/);
assert.match(nativeVideoSource, /idempotencyKey\?: string/);
assert.match(nativeVideoSource, /data = \{ detail: response\.body \} as T/);

const snapshotPersistence = between(
  workspaceSource,
  "  const persistCanvasSnapshot = useCallback(",
  "  const applyPersistedNodes = useCallback(",
);
assert.match(
  snapshotPersistence,
  /if \(!canvasPageActiveRef\.current\) return;/,
  "unmounted canvas instances must not persist stale snapshots",
);
assert.match(
  completeVideoTask,
  /waitForVideoGenerationTask[\s\S]*if \(!canvasPageActiveRef\.current\) return;[\s\S]*storeGeneratedVideo/,
  "an unmounted video poller must stop before storing or persisting its result",
);
assert.match(
  workspaceSource,
  /const resumeCanvasVideoSubmission = useCallback\(/,
);
assert.match(workspaceSource, /videoGenerationSubmissionId === submissionId/);
assert.match(
  workspaceSource,
  /resumeCanvasVideoSubmission\(node\.id, submissionId\)/,
);
assert.match(
  workspaceSource,
  /const resumeSeedance2CustomerVideoSubmission = useCallback\(/,
);
assert.match(
  workspaceSource,
  /resumeSeedance2CustomerVideoSubmission\([\s\S]*seedanceTask\.submissionId/,
);
assert.match(
  workspaceSource,
  /requestCustomerVideoTask\([\s\S]*submissionId/,
  "customer video resubmission must reuse the persisted idempotency key",
);

const resumeImageTask = between(
  workspaceSource,
  "  const resumeCanvasImageTask = useCallback(",
  "  useEffect(() => {\n    if (!projectLoaded) return;\n    nodes",
);
assert.match(
  resumeImageTask,
  /pollCanvasImageTask\(taskId\)[\s\S]*if \(!canvasPageActiveRef\.current\) return;[\s\S]*uploadImage/,
  "image recovery must stop before uploading after the canvas unmounts",
);
assert.match(
  resumeImageTask,
  /finally \{\s*resumedImageTaskIdsRef\.current\.delete\(taskId\);/,
  "image recovery reservations must be released on success and failure",
);

const storyCharacters = between(
  workspaceSource,
  "  const generateStoryCharacters = useCallback(",
  "  const generateStoryShots = useCallback(",
);
assert.match(
  storyCharacters,
  /const taskId = `canvas-story-character-[^;]+;\s*resumedImageTaskIdsRef\.current\.add\(taskId\);[\s\S]*sourceImageTaskId: taskId/,
  "story character tasks must be reserved before their loading nodes are persisted",
);
assert.match(
  storyCharacters,
  /finally \{\s*resumedImageTaskIdsRef\.current\.delete\(taskId\);/,
);

const storyShots = between(
  workspaceSource,
  "  const generateStoryShots = useCallback(",
  "  const runStoryDirectorAll = useCallback(",
);
assert.ok(
  (storyShots.match(/resumedImageTaskIdsRef\.current\.add\(taskId\)/g) || [])
    .length >= 2,
  "grid and individual story-shot tasks must both reserve their task ids",
);
assert.ok(
  (
    storyShots.match(
      /finally \{\s*resumedImageTaskIdsRef\.current\.delete\(taskId\);/g,
    ) || []
  ).length >= 2,
  "grid and individual story-shot tasks must both release their task ids",
);

const handleGenerate = between(
  workspaceSource,
  "  const handleGenerateNode = useCallback(",
  "  const handleRetryNode = useCallback(",
);
assert.match(
  handleGenerate,
  /const taskId = `canvas-\$\{resultId\}`;\s*resumedImageTaskIdsRef\.current\.add\(taskId\);/,
  "image edit batch tasks must be reserved before persisting sourceImageTaskId",
);
assert.match(
  handleGenerate,
  /const taskId = `canvas-\$\{targetId\}`;\s*resumedImageTaskIdsRef\.current\.add\(taskId\);/,
  "image generation batch tasks must be reserved before persisting sourceImageTaskId",
);
assert.ok(
  (
    handleGenerate.match(
      /finally \{\s*resumedImageTaskIdsRef\.current\.delete\(taskId\);/g,
    ) || []
  ).length >= 3,
  "direct regeneration, image editing, and image generation must release each task reservation",
);

const seedanceGeneration = between(
  workspaceSource,
  "  const generateSeedance2VideoFromPlaceholder = useCallback(",
  "  const handleGenerateNode = useCallback(",
);
assertOrdered(
  seedanceGeneration,
  [
    "const submissionId = nanoid();",
    "resumedVideoSubmissionIdsRef.current.add(submissionId);",
    "seedanceGenerationTaskState:",
    "persistCanvasSnapshot(pendingNodes);",
  ],
  "Seedance submission ids must be reserved before the loading state is persisted",
);
assert.match(
  seedanceGeneration,
  /finally \{\s*resumedVideoSubmissionIdsRef\.current\.delete\(submissionId\);/,
);

assertOrdered(
  firstVideoGeneration,
  [
    "videoSubmissionId = nanoid();",
    "resumedVideoSubmissionIdsRef.current.add(videoSubmissionId);",
    "videoGenerationSubmissionId: videoSubmissionId",
    "persistCanvasSnapshot(pendingVideoNodes, pendingVideoConnections);",
  ],
  "ordinary video submission ids must be reserved before the loading state is persisted",
);
assert.match(
  handleGenerate,
  /finally \{[\s\S]*resumedVideoSubmissionIdsRef\.current\.delete\(videoSubmissionId\);/,
);

const retryGeneration = between(
  workspaceSource,
  "  const handleRetryNode = useCallback(",
  "  useEffect(() => {\n    handleRetryNodeRef.current",
);
assertOrdered(
  retryGeneration,
  [
    "const videoSubmissionId =",
    "resumedVideoSubmissionIdsRef.current.add(videoSubmissionId);",
    "videoGenerationSubmissionId: videoSubmissionId",
    "persistCanvasSnapshot(retryPendingNodes);",
  ],
  "video retry submission ids must be reserved before the retry state is persisted",
);
assert.match(
  retryGeneration,
  /finally \{[\s\S]*resumedImageTaskIdsRef\.current\.delete\(retryImageTaskId\);[\s\S]*resumedVideoSubmissionIdsRef\.current\.delete\(videoSubmissionId\);/,
  "retry reservations must be released on every exit",
);

const adoptImagePollingTask = between(
  workspaceSource,
  "  const adoptCanvasImagePollingTask = useCallback(",
  "  const completeCanvasVideoTask = useCallback(",
);
assertOrdered(
  adoptImagePollingTask,
  [
    "resumedImageTaskIdsRef.current.add(pollingTaskId);",
    "sourceImageTaskId: pollingTaskId",
    "persistCanvasSnapshot(nextNodes);",
    "resumedImageTaskIdsRef.current.delete(submissionTaskId);",
  ],
  "the actual image polling id must be protected and persisted before releasing the submission id",
);
assert.match(
  adoptImagePollingTask,
  /if \(!canvasPageActiveRef\.current\) return false;/,
  "an image submission finishing after unmount must not adopt or persist a task",
);
assert.ok(
  (workspaceSource.match(/adoptCanvasImagePollingTask\(/g) || []).length >= 7,
  "all persisted image generation paths must adopt a server-provided polling id",
);
assert.ok(
  (handleGenerate.match(/sourceImageTaskId !== pollTaskId/g) || []).length >= 3,
  "image completions must compare against the adopted server polling id",
);
assert.ok(
  (handleGenerate.match(/sourceImageTaskId === pollTaskId/g) || []).length >= 3,
  "image failures must compare against the adopted server polling id",
);
assert.match(
  handleGenerate,
  /finally \{\s*resumedImageTaskIdsRef\.current\.delete\(taskId\);\s*resumedImageTaskIdsRef\.current\.delete\(pollTaskId\);/,
  "image batch callbacks must release both client and server task ids",
);
assert.match(
  retryGeneration,
  /isCurrentCanvasImageGeneration\([\s\S]*retryImagePollingTaskId/,
  "an obsolete image retry must not overwrite a newer task",
);

console.log("canvas media generation resume source tests passed");
