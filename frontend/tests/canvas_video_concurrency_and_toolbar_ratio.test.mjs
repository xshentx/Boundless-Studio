import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, "../src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const runningState = between(
  "  const [runningNodeId, setRunningNodeId]",
  "  const [isMiniMapOpen, setIsMiniMapOpen]",
);
assert.match(runningState, /runningVideoNodeIds/);
assert.match(runningState, /useState<Set<string>>/);
assert.match(runningState, /runningVideoNodeCountsRef/);
assert.match(runningState, /useRef<Map<string, number>>\(new Map\(\)\)/);
assert.match(runningState, /const nextCount = Math\.max\(/);
assert.match(
  runningState,
  /\(counts\.get\(nodeId\) \|\| 0\) \+ \(running \? 1 : -1\)/,
);
assert.match(runningState, /if \(nextCount > 0\) counts\.set\(nodeId, nextCount\)/);
assert.match(runningState, /else counts\.delete\(nodeId\)/);
assert.match(runningState, /setRunningVideoNodeIds\(\(current\) =>/);
assert.match(runningState, /const next = new Set\(current\)/);
assert.match(runningState, /if \(nextCount > 0\) next\.add\(nodeId\)/);
assert.match(runningState, /else next\.delete\(nodeId\)/);

const seedanceGeneration = between(
  "  const generateSeedance2VideoFromPlaceholder = useCallback(",
  "  const handleGenerateNode = useCallback(",
);
assert.match(seedanceGeneration, /setVideoNodeRunning\(latest\.id, true\)/);
assert.match(seedanceGeneration, /resumedVideoTaskIdsRef\.current\.add\(taskId\)/);
assert.match(
  seedanceGeneration,
  /if \(currentTaskId\) resumedVideoTaskIdsRef\.current\.delete\(currentTaskId\)/,
);
assert.match(seedanceGeneration, /setVideoNodeRunning\(latest\.id, false\)/);

const regularVideoGeneration = between(
  "  const handleGenerateNode = useCallback(",
  "  const handleRetryNode = useCallback(",
);
assert.match(
  regularVideoGeneration,
  /if \(mode === "video"\) setVideoNodeRunning\(nodeId, true\)/,
);
const hydrationIndex = regularVideoGeneration.indexOf("await hydrateNodeGenerationContext(");
const sourceVideoLockIndex = regularVideoGeneration.indexOf(
  'if (mode === "video") setVideoNodeRunning(nodeId, true)',
);
assert.ok(hydrationIndex >= 0 && sourceVideoLockIndex > hydrationIndex, "video locks must only be acquired after reference hydration succeeds");
assert.match(regularVideoGeneration, /setVideoNodeRunning\(videoId, true\)/);
assert.match(regularVideoGeneration, /let videoSubmissionId: string \| undefined/);
assert.match(regularVideoGeneration, /let videoTaskId: string \| undefined/);
assert.match(regularVideoGeneration, /videoTaskId = task\.id/);
assert.match(
  regularVideoGeneration,
  /!isCurrentCanvasVideoGeneration\([\s\S]*videoSubmissionId,[\s\S]*videoTaskId/,
);
assert.match(regularVideoGeneration, /setVideoNodeRunning\(nodeId, false\)/);
assert.match(
  regularVideoGeneration,
  /pendingChildIds\.forEach\(\(id\) => setVideoNodeRunning\(id, false\)\)/,
);

const retryGeneration = between(
  "  const handleRetryNode = useCallback(",
  "  useEffect(() => {\n    handleRetryNodeRef.current",
);
assert.match(
  retryGeneration,
  /node\.type === CanvasNodeType\.Video[\s\S]*setVideoNodeRunning\(node\.id, true\)/,
);
assert.match(
  retryGeneration,
  /node\.type === CanvasNodeType\.Video[\s\S]*setVideoNodeRunning\(node\.id, false\)/,
);
assert.match(retryGeneration, /let videoTaskId: string \| undefined/);
assert.match(retryGeneration, /videoTaskId = task\.id/);
assert.match(
  retryGeneration,
  /!isCurrentCanvasVideoGeneration\([\s\S]*videoSubmissionId,[\s\S]*videoTaskId/,
);

assert.match(
  source,
  /function isCurrentCanvasVideoGeneration\([\s\S]*videoGenerationTask\?\.id === taskId[\s\S]*videoGenerationSubmissionId === submissionId/,
);

const renderedNodes = between(
  "          {visibleNodes.map((node) => (",
  "        {!nodes.length ? (",
);
assert.match(renderedNodes, /runningVideoNodeIds\.has\(node\.id\)/);
assert.match(
  renderedNodes,
  /node\.type === CanvasNodeType\.Video &&\s*node\.metadata\?\.status === NODE_STATUS_LOADING/,
);
assert.match(renderedNodes, /runningVideoNodeIds\.has\(panelNode\.id\)/);

const toolbarNodeCreator = between(
  "  const createNode = useCallback(",
  "  const createSeedance2Workflow = useCallback(",
);
assert.match(
  toolbarNodeCreator,
  /createSeedance2VideoPlaceholderNode\(targetPosition, \{\s*ratio: SEEDANCE2_CREATION_FALLBACK_RATIO,/,
);
assert.doesNotMatch(
  toolbarNodeCreator,
  /ratio: resolveSeedance2CreationRatio\(effectiveConfig\.size\)/,
);
assert.match(source, /const SEEDANCE2_CREATION_FALLBACK_RATIO = "9:16"/);
assert.match(source, /onAddVideo=\{\(\) => createNode\(CanvasNodeType\.Video\)\}/);

console.log("canvas video concurrency and toolbar ratio source tests passed");
