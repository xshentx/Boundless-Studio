import type {
  CanvasConnection,
  CanvasNodeData,
  CanvasNodeMetadata,
  StoryCharacter,
  StoryDirectorInputKind,
  StoryShot,
} from "../types";
import { CanvasNodeType } from "../types";
import {
  LOCAL_SEEDANCE2_API_ENDPOINT,
  createSeedance2VideoPlaceholderMetadata,
  normalizeSeedance2Duration,
  normalizeSeedance2Resolution,
  resolveSeedance2WorkflowRatio,
  resolveSeedance2WorkflowRatioSelection,
  seedance2PlaceholderSize,
} from "./seedance2-workflow";
import type {
  Seedance2PromptRewriteInput,
  Seedance2RewrittenShot,
} from "./seedance2-prompt-rewrite";

export const STORY_SLICE_REFERENCE_ORDER = ["当前分镜图", "角色图", "场景图", "其它参考图"] as const;

export type StorySliceBuildResult = {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  storyDirector?: CanvasNodeData;
  missingCurrentShotIndexes: number[];
};

export type VersionedStorySliceBuildResult = StorySliceBuildResult & {
  createdNodes: CanvasNodeData[];
  createdConnections: CanvasConnection[];
  setVersion: number;
};

export type Seedance2StoryPromptContext = {
  storyTitle?: string;
  storySummary?: string;
  characters?: string[];
  plotPosition?: string;
  characterState?: string;
};

export function findSeedance2StoryDirectorSource(
  workflowNode: CanvasNodeData,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
): CanvasNodeData | undefined {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const connection of connections) {
    if (connection.toNodeId !== workflowNode.id) continue;
    const source = nodeById.get(connection.fromNodeId);
    if (source?.type === CanvasNodeType.StoryDirector) return source;
  }

  const metadataSourceId = workflowNode.metadata?.seedanceStoryDirectorNodeId;
  const metadataSource = metadataSourceId ? nodeById.get(metadataSourceId) : undefined;
  if (metadataSource?.type === CanvasNodeType.StoryDirector) return metadataSource;

  const storyDirectors = nodes.filter((node) => node.type === CanvasNodeType.StoryDirector);
  return storyDirectors.length === 1 ? storyDirectors[0] : undefined;
}

export function buildSeedance2StoryShotPrompt(
  shot: StoryShot,
  context: Seedance2StoryPromptContext = {},
): string {
  const storyTitle = stringValue(context.storyTitle) || "当前故事";
  const shotContent = stringValue(shot.visualContent) || stringValue(shot.imagePrompt) || stringValue(shot.title) || `第${shot.index}镜`;
  const storySummary = stringValue(context.storySummary) || shotContent;
  const action = stringValue(shot.action);
  const camera = stringValue(shot.camera) || "电影感中景";
  const emotion = stringValue(shot.emotion);
  const voiceover = stringValue(shot.voiceover) || "无";
  const characters = (context.characters || []).map(stringValue).filter(Boolean).join("、") || "无明确角色";
  const plotPosition = stringValue(context.plotPosition) || `第 ${shot.index} 镜`;
  const characterState = stringValue(context.characterState) || emotion || "按当前分镜状态";

  return `【故事背景】
这是《${storyTitle}》中的第 ${shot.index} 镜。
故事讲述：${storySummary}

【本镜头内容】
本镜头讲述：${shotContent}
当前剧情进展：${plotPosition}

【首帧画面】
以当前分镜图作为首帧，画面中包含：${shotContent}
若无分镜图，则以场景图作为首帧。

【出场角色】
本镜头出场角色：${characters}
角色当前状态：${characterState}

【画面动作】
${action}

【镜头运动】
${camera}

【情绪氛围】
${emotion}

【对白/表演】
${voiceover}

画面无字幕`;
}

export function seedance2UserPromptPatch(
  prompt: string,
): Pick<CanvasNodeMetadata, "prompt" | "seedancePromptEditedByUser"> {
  return {
    prompt,
    seedancePromptEditedByUser: true,
  };
}

export function seedance2RegeneratePromptPatch(
  metadata: CanvasNodeMetadata | undefined,
): Pick<CanvasNodeMetadata, "prompt" | "seedancePromptEditedByUser"> {
  return {
    prompt: stringValue(metadata?.seedanceAutoPrompt) || stringValue(metadata?.prompt),
    seedancePromptEditedByUser: false,
  };
}

export function buildStoryDirectorSlicePlaceholders(options: {
  workflowNode: CanvasNodeData;
  storyDirector?: CanvasNodeData;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  now?: number;
}): StorySliceBuildResult {
  const { workflowNode, nodes, connections } = options;
  const storyDirector =
    options.storyDirector?.type === CanvasNodeType.StoryDirector
      ? options.storyDirector
      : findSeedance2StoryDirectorSource(workflowNode, nodes, connections);

  if (!storyDirector) {
    return { nodes, connections, storyDirector: undefined, missingCurrentShotIndexes: [] };
  }

  const shots = [...(storyDirector.metadata?.storyShots || [])].sort((left, right) => left.index - right.index);
  if (!shots.length) {
    return { nodes, connections, storyDirector, missingCurrentShotIndexes: [] };
  }

  const now = options.now ?? Date.now();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const existingPlaceholderByShotIndex = existingSeedancePlaceholdersByShotIndex(workflowNode, nodes);
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const workflowMetadata = workflowNode.metadata || {};
  const ratio = resolveSeedance2WorkflowRatio({
    storedRatio: workflowMetadata.seedanceRatio || workflowMetadata.size,
    selection: resolveSeedance2WorkflowRatioSelection({
      selection: workflowMetadata.seedanceRatioSelection,
      inheritSourceRatio: workflowMetadata.seedanceInheritSourceRatio,
      ratioTouched: workflowMetadata.seedanceRatioTouched,
    }),
    upstreamRatio: storyDirector.metadata?.storyAspectRatio,
  });
  const duration = normalizeSeedance2Duration(workflowMetadata.seedanceDuration || workflowMetadata.seconds);
  const resolution = normalizeSeedance2Resolution(workflowMetadata.seedanceResolution || workflowMetadata.vquality);
  const model = workflowMetadata.seedanceModel || workflowMetadata.model || "";
  const apiEndpoint = workflowMetadata.seedanceApiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT;
  const generateCount = 1;
  const videoSize = seedance2PlaceholderSize(ratio);
  const nextNodes: CanvasNodeData[] = [];
  const placeholderConnections: CanvasConnection[] = [];
  const missingCurrentShotIndexes: number[] = [];
  const updatedNodesById = new Map<string, CanvasNodeData>();

  shots.forEach((shot, orderIndex) => {
    const shotTitle = storyShotTitle(shot);
    const currentShotCandidate = findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections);
    const currentShot = currentShotCandidate && imageReferenceValue(currentShotCandidate) ? currentShotCandidate : undefined;
    if (!currentShot) missingCurrentShotIndexes.push(shot.index);

    const existingPlaceholder = existingPlaceholderByShotIndex.get(shot.index);
    const placeholderId =
      existingPlaceholder?.id ||
      uniqueId(
        `video-seedance2-story-${safeIdPart(workflowNode.id)}-${safeIdPart(shot.id || String(shot.index))}-${now}`,
        existingNodeIds,
      );
    existingNodeIds.add(placeholderId);

    const storyMetadata = buildStoryPlaceholderMetadata({
      workflowNode,
      storyDirector,
      shot,
      shotTitle,
      currentShot,
      generatedPrompt: buildSeedance2StoryShotPrompt(shot, storyPromptContext(shot, storyDirector)),
    });
    const baseMetadata = createSeedance2VideoPlaceholderMetadata({
      mode: "slice",
      model,
      ratio,
      duration,
      resolution,
      generateCount,
      apiProvider: "local",
      apiEndpoint,
      workflowNodeId: workflowNode.id,
      shotIndex: shot.index,
      shotTitle,
      prompt: storyMetadata.seedanceAutoPrompt || buildSeedance2StoryShotPrompt(shot),
      referenceOrder: [...STORY_SLICE_REFERENCE_ORDER],
    });
    const metadata = mergePlaceholderMetadata(existingPlaceholder?.metadata, baseMetadata, storyMetadata);
    const placeholder: CanvasNodeData = existingPlaceholder
      ? {
          ...existingPlaceholder,
          type: CanvasNodeType.Video,
          title: existingPlaceholder.title || `${shotTitle} Seedance2 视频`,
          width: existingPlaceholder.width,
          height: existingPlaceholder.height,
          metadata,
        }
      : {
          id: placeholderId,
          type: CanvasNodeType.Video,
          title: `${shotTitle} Seedance2 视频`,
          position: placeholderPosition(workflowNode, videoSize, orderIndex),
          width: videoSize.width,
          height: videoSize.height,
          metadata,
        };

    updatedNodesById.set(placeholder.id, placeholder);

    const referenceNodes = referenceNodesForShot(nodeById, connections, currentShot);
    placeholderConnections.push({
      id: storyControllerConnectionId(workflowNode.id, placeholder.id),
      fromNodeId: workflowNode.id,
      toNodeId: placeholder.id,
    });
    referenceNodes.forEach((sourceNode) => {
      placeholderConnections.push({
        id: storyReferenceConnectionId(workflowNode.id, placeholder.id, sourceNode.id),
        fromNodeId: sourceNode.id,
        toNodeId: placeholder.id,
      });
    });
  });

  nodes.forEach((node) => {
    nextNodes.push(updatedNodesById.get(node.id) || node);
  });
  updatedNodesById.forEach((node) => {
    if (!nodeById.has(node.id)) nextNodes.push(node);
  });

  const candidateConnections = [...connections];
  const connectionKeys = new Set(connections.map(connectionEndpointKey));
  placeholderConnections.forEach((connection) => {
    const key = connectionEndpointKey(connection);
    if (connectionKeys.has(key)) return;
    candidateConnections.push(connection);
    connectionKeys.add(key);
  });
  const nextConnections = reconcileSeedance2StoryPlaceholderReferences({
    nodes: nextNodes,
    connections: candidateConnections,
  });

  return {
    nodes: nextNodes,
    connections: nextConnections,
    storyDirector,
    missingCurrentShotIndexes,
  };
}

export function collectSeedance2StoryRewriteInput(options: {
  storyDirector: CanvasNodeData;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  template: string;
}): Seedance2PromptRewriteInput {
  const { storyDirector, nodes, connections } = options;
  const storyValue = storyDirector.metadata?.storyText ?? storyDirector.metadata?.content ?? "";
  const story = typeof storyValue === "string" ? storyValue : "";
  if (!story.trim()) throw new Error("Seedance2 整批改写缺少完整故事内容");
  const storyShots = [...(storyDirector.metadata?.storyShots || [])].sort((left, right) => left.index - right.index);
  if (!storyShots.length) throw new Error("Seedance2 整批改写没有可用分镜");
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const shots = storyShots.map((shot) => {
    const currentShot = findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections);
    if (!currentShot) throw new Error(`Seedance2 第 ${shot.index} 镜缺少当前分镜图`);
    const currentPrompt = typeof currentShot.metadata?.prompt === "string" ? currentShot.metadata.prompt : "";
    return {
      shotId: shot.id,
      shotIndex: shot.index,
      title: storyShotTitle(shot),
      sourceImageNodeId: currentShot.id,
      sourceImage: imageReferenceValue(currentShot),
      currentPrompt,
    };
  });
  return { story, shots, template: options.template };
}

export function createSeedance2SequentialPlaceholderRun(options: {
  rewrittenShots: Seedance2RewrittenShot[];
  startShotIndex?: number;
  appendShot: (shot: Seedance2RewrittenShot) => unknown;
}) {
  const ordered = [...options.rewrittenShots].sort((left, right) => left.shotIndex - right.shotIndex);
  const startShotIndex = options.startShotIndex ?? ordered[0]?.shotIndex ?? 1;
  const createdShotIndexes: number[] = [];

  for (const shot of ordered) {
    if (shot.shotIndex < startShotIndex) continue;
    try {
      options.appendShot(shot);
      createdShotIndexes.push(shot.shotIndex);
    } catch (error) {
      return {
        createdShotIndexes,
        nextShotIndex: shot.shotIndex,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  return {
    createdShotIndexes,
    nextShotIndex: null,
    error: null,
  };
}

export function buildVersionedStoryDirectorSlicePlaceholders(options: {
  workflowNode: CanvasNodeData;
  storyDirector: CanvasNodeData;
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  rewrittenShots: Seedance2RewrittenShot[];
  rewriteModel: string;
  rewriteTemplate: string;
  now?: number;
}): VersionedStorySliceBuildResult {
  const { workflowNode, storyDirector, nodes, connections } = options;
  if (storyDirector.type !== CanvasNodeType.StoryDirector) {
    throw new Error("Seedance2 整批改写缺少故事导演来源");
  }

  const shots = [...(storyDirector.metadata?.storyShots || [])].sort((left, right) => left.index - right.index);
  if (!shots.length) throw new Error("Seedance2 整批改写没有可用分镜");

  const rewrittenByShot = new Map<string, Seedance2RewrittenShot>();
  options.rewrittenShots.forEach((shot) => {
    rewrittenByShot.set(shot.shotId || `index:${shot.shotIndex}`, shot);
    rewrittenByShot.set(`index:${shot.shotIndex}`, shot);
  });
  const rewrittenInOrder = shots.map((shot) => {
    const rewritten = rewrittenByShot.get(shot.id) || rewrittenByShot.get(`index:${shot.index}`);
    if (!rewritten) throw new Error(`Seedance2 整批提示词缺少 ${shot.id || `第 ${shot.index} 镜`}`);
    const prompt = stringValue(rewritten.prompt);
    if (!prompt) throw new Error(`Seedance2 整批提示词中 ${shot.id || `第 ${shot.index} 镜`} 的 prompt 为空`);
    return { shot, prompt };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
  const currentShots = rewrittenInOrder.map(({ shot }) => {
    const currentShot = findCurrentShotImageForStoryShot(shot, storyDirector, imageNodes, connections);
    if (!currentShot) throw new Error(`Seedance2 第 ${shot.index} 镜缺少当前分镜图`);
    return currentShot;
  });

  const rewriteModel = stringValue(options.rewriteModel);
  if (!rewriteModel) throw new Error("Seedance2 整批改写缺少文本模型");
  const now = options.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  const setVersion = nextSeedancePlaceholderSetVersion(workflowNode.id, nodes);
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const workflowMetadata = workflowNode.metadata || {};
  const ratio = resolveSeedance2WorkflowRatio({
    storedRatio: workflowMetadata.seedanceRatio || workflowMetadata.size,
    selection: resolveSeedance2WorkflowRatioSelection({
      selection: workflowMetadata.seedanceRatioSelection,
      inheritSourceRatio: workflowMetadata.seedanceInheritSourceRatio,
      ratioTouched: workflowMetadata.seedanceRatioTouched,
    }),
    upstreamRatio: storyDirector.metadata?.storyAspectRatio,
  });
  const duration = normalizeSeedance2Duration(workflowMetadata.seedanceDuration || workflowMetadata.seconds);
  const resolution = normalizeSeedance2Resolution(workflowMetadata.seedanceResolution || workflowMetadata.vquality);
  const model = workflowMetadata.seedanceModel || workflowMetadata.model || "";
  const apiEndpoint = workflowMetadata.seedanceApiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT;
  const generateCount = 1;
  const videoSize = seedance2PlaceholderSize(ratio);
  const groupStartY = nextSeedancePlaceholderGroupY(workflowNode, nodes);
  const createdNodes: CanvasNodeData[] = [];
  const createdConnections: CanvasConnection[] = [];

  rewrittenInOrder.forEach(({ shot, prompt }, orderIndex) => {
    const currentShot = currentShots[orderIndex];
    const shotTitle = storyShotTitle(shot);
    const placeholderId = uniqueId(
      `video-seedance2-story-${safeIdPart(workflowNode.id)}-v${setVersion}-${safeIdPart(shot.id || String(shot.index))}-${now}`,
      existingNodeIds,
    );
    const storyMetadata = buildStoryPlaceholderMetadata({
      workflowNode,
      storyDirector,
      shot,
      shotTitle,
      currentShot,
      generatedPrompt: prompt,
    });
    const baseMetadata = createSeedance2VideoPlaceholderMetadata({
      mode: "slice",
      model,
      ratio,
      duration,
      resolution,
      generateCount,
      apiProvider: "local",
      apiEndpoint,
      workflowNodeId: workflowNode.id,
      shotIndex: shot.index,
      shotTitle,
      prompt,
      referenceOrder: [...STORY_SLICE_REFERENCE_ORDER],
    });
    const placeholder: CanvasNodeData = {
      id: placeholderId,
      type: CanvasNodeType.Video,
      title: `${shotTitle} Seedance2 视频 V${setVersion}`,
      position: versionedPlaceholderPosition(workflowNode, videoSize, orderIndex, groupStartY),
      width: videoSize.width,
      height: videoSize.height,
      metadata: {
        ...baseMetadata,
        ...storyMetadata,
        prompt,
        seedanceAutoPrompt: prompt,
        seedancePromptEditedByUser: false,
        seedancePlaceholderSetVersion: setVersion,
        seedancePromptRewriteModel: rewriteModel,
        seedancePromptRewriteTemplate: options.rewriteTemplate,
        seedancePromptRewriteCreatedAt: createdAt,
      },
    };
    createdNodes.push(placeholder);

    createdConnections.push({
      id: storyControllerConnectionId(workflowNode.id, placeholder.id),
      fromNodeId: workflowNode.id,
      toNodeId: placeholder.id,
    });
    const references = referenceNodesForShot(nodeById, connections, currentShot);
    references.forEach((sourceNode) => {
      createdConnections.push({
        id: storyReferenceConnectionId(workflowNode.id, placeholder.id, sourceNode.id),
        fromNodeId: sourceNode.id,
        toNodeId: placeholder.id,
      });
    });
  });

  const nextNodes = [...nodes, ...createdNodes];
  const nextConnections = reconcileSeedance2StoryPlaceholderReferences({
    nodes: nextNodes,
    connections: [...connections, ...createdConnections],
  });
  const createdNodeIds = new Set(createdNodes.map((node) => node.id));
  const nextCreatedConnections = nextConnections.filter((connection) => createdNodeIds.has(connection.toNodeId));

  return {
    nodes: nextNodes,
    connections: nextConnections,
    storyDirector,
    missingCurrentShotIndexes: [],
    createdNodes,
    createdConnections: nextCreatedConnections,
    setVersion,
  };
}

export function findCurrentShotImageForStoryShot(
  shot: StoryShot,
  storyDirector: CanvasNodeData,
  imageNodes: CanvasNodeData[],
  connections: CanvasConnection[],
): CanvasNodeData | undefined {
  const directOutputIds = new Set(
    connections
      .filter((connection) => connection.fromNodeId === storyDirector.id)
      .map((connection) => connection.toNodeId),
  );
  const isCurrentShotMatch = (node: CanvasNodeData) =>
    isUsableImageReference(node) && storyShotIndexesFromImageNode(node).includes(shot.index);
  const bestCurrentShotMatch = (candidates: CanvasNodeData[]) => {
    const matches = candidates.filter(isCurrentShotMatch);
    return (
      matches.find((node) => {
        const indexes = storyShotIndexesFromImageNode(node);
        return indexes.length === 1 && indexes[0] === shot.index;
      }) || matches[0]
    );
  };
  const resultNodeIds = new Set(shot.resultNodeIds || []);
  const resultMatch = bestCurrentShotMatch(imageNodes.filter((node) => resultNodeIds.has(node.id)));
  if (resultMatch) return resultMatch;
  const directMatch = bestCurrentShotMatch(imageNodes.filter((node) => directOutputIds.has(node.id)));
  if (directMatch) return directMatch;
  return bestCurrentShotMatch(storyDirectorConnectedInputImageNodes(
    storyDirector,
    "story:reference",
    new Map(imageNodes.map((node) => [node.id, node])),
    connections,
  ));
}

export function storyShotIndexesFromImageNode(node: CanvasNodeData): number[] {
  const metadata = node.metadata || {};
  const rangeStart = positiveInteger(metadata.storyGrid9ShotStart);
  const rangeEnd = positiveInteger(metadata.storyGrid9ShotEnd);
  if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
    return Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => rangeStart + offset);
  }

  const parsedIndex = parseStoryShotIndex(metadata.storyLabel) || parseStoryShotIndex(node.title);
  return parsedIndex ? [parsedIndex] : [];
}

function existingSeedancePlaceholdersByShotIndex(
  workflowNode: CanvasNodeData,
  nodes: CanvasNodeData[],
) {
  const byShotIndex = new Map<number, CanvasNodeData>();
  nodes
    .filter((node) => isStoryPlaceholderForWorkflow(node, workflowNode.id))
    .forEach((node) => {
      const shotIndex = seedancePlaceholderShotIndex(node);
      if (!shotIndex) return;
      if (!byShotIndex.has(shotIndex)) byShotIndex.set(shotIndex, node);
    });
  return byShotIndex;
}

function isStoryPlaceholderForWorkflow(node: CanvasNodeData, workflowNodeId: string) {
  return (
    node.metadata?.seedanceWorkflowNodeId === workflowNodeId &&
    node.metadata?.seedanceWorkflowRole === "placeholder"
  );
}

function seedancePlaceholderShotIndex(node: CanvasNodeData) {
  return positiveInteger(node.metadata?.seedanceStoryShotIndex) || positiveInteger(node.metadata?.seedanceShotIndex);
}

function buildStoryPlaceholderMetadata(options: {
  workflowNode: CanvasNodeData;
  storyDirector: CanvasNodeData;
  shot: StoryShot;
  shotTitle: string;
  currentShot?: CanvasNodeData;
  generatedPrompt: string;
}): CanvasNodeMetadata {
  return {
    seedanceWorkflowNodeId: options.workflowNode.id,
    seedanceWorkflowMode: "slice",
    seedanceWorkflowRole: "placeholder",
    seedanceShotIndex: options.shot.index,
    seedanceShotTitle: options.shotTitle,
    seedanceStoryDirectorNodeId: options.storyDirector.id,
    seedanceStoryShotId: options.shot.id,
    seedanceStoryShotIndex: options.shot.index,
    seedanceStorySourceImageNodeId: options.currentShot?.id,
    seedanceReferenceOrder: [...STORY_SLICE_REFERENCE_ORDER],
    seedanceRequiredReferences: ["当前分镜图"],
    seedanceAutoPrompt: options.generatedPrompt,
    seedancePromptEditedByUser: false,
    seedancePromptPanelMode: "compact",
    prompt: options.generatedPrompt,
  };
}

function mergePlaceholderMetadata(
  existingMetadata: CanvasNodeMetadata | undefined,
  baseMetadata: CanvasNodeMetadata,
  storyMetadata: CanvasNodeMetadata,
): CanvasNodeMetadata {
  if (!existingMetadata) return { ...baseMetadata, ...storyMetadata };
  const next: CanvasNodeMetadata = { ...baseMetadata, ...storyMetadata, ...existingMetadata };
  assignDefinedMetadata(next, {
    seedanceWorkflowNodeId: storyMetadata.seedanceWorkflowNodeId,
    seedanceWorkflowMode: storyMetadata.seedanceWorkflowMode,
    seedanceWorkflowRole: storyMetadata.seedanceWorkflowRole,
    seedanceShotIndex: storyMetadata.seedanceShotIndex,
    seedanceShotTitle: storyMetadata.seedanceShotTitle,
    seedanceStoryDirectorNodeId: storyMetadata.seedanceStoryDirectorNodeId,
    seedanceStoryShotId: storyMetadata.seedanceStoryShotId,
    seedanceStoryShotIndex: storyMetadata.seedanceStoryShotIndex,
    seedanceStorySourceImageNodeId: storyMetadata.seedanceStorySourceImageNodeId,
    seedanceReferenceOrder: storyMetadata.seedanceReferenceOrder,
    seedanceRequiredReferences: storyMetadata.seedanceRequiredReferences,
    seedanceAutoPrompt: storyMetadata.seedanceAutoPrompt,
  });
  next.seedanceReferenceSlotBindings = mergeProtectedReferenceSlotBindings(
    existingMetadata.seedanceReferenceSlotBindings,
    existingMetadata.seedanceStorySourceImageNodeId,
    storyMetadata.seedanceStorySourceImageNodeId,
  );
  next.seedancePromptPanelMode =
    existingMetadata.seedancePromptPanelMode === "inline" || existingMetadata.seedancePromptEditedByUser === true
      ? "inline"
      : "compact";
  return next;
}

function assignDefinedMetadata(target: CanvasNodeMetadata, source: CanvasNodeMetadata) {
  Object.entries(source).forEach(([key, value]) => {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  });
}

function mergeProtectedReferenceSlotBindings(
  existing: CanvasNodeMetadata["seedanceReferenceSlotBindings"],
  previousStorySourceImageNodeId: string | undefined,
  nextStorySourceImageNodeId: string | undefined,
) {
  const next = { ...(existing || {}) };
  const legacyCurrentShotNodeId = next.current_shot?.nodeId;
  if (
    legacyCurrentShotNodeId &&
    (legacyCurrentShotNodeId === previousStorySourceImageNodeId || legacyCurrentShotNodeId === nextStorySourceImageNodeId)
  ) {
    delete next.current_shot;
  }
  return next;
}

function storyPromptContext(shot: StoryShot, storyDirector: CanvasNodeData): Seedance2StoryPromptContext {
  const characterById = new Map(
    (storyDirector.metadata?.storyCharacters || []).map((character) => [character.id, character.name]),
  );
  const directorTitle = stringValue(storyDirector.title);
  return {
    storyTitle: directorTitle === "故事导演" ? undefined : directorTitle,
    storySummary: stringValue(storyDirector.metadata?.storyText) || stringValue(storyDirector.metadata?.content),
    characters: (shot.appearingCharacterIds || []).map((id) => stringValue(characterById.get(id))).filter(Boolean),
    plotPosition: `第 ${shot.index} 镜`,
    characterState: stringValue(shot.characterState) || stringValue(shot.emotion),
  };
}

function connectionEndpointKey(connection: Pick<CanvasConnection, "fromNodeId" | "toNodeId">) {
  return `${connection.fromNodeId}->${connection.toNodeId}`;
}

function nextSeedancePlaceholderSetVersion(workflowNodeId: string, nodes: CanvasNodeData[]) {
  let maximumVersion = 0;
  nodes
    .filter((node) => isStoryPlaceholderForWorkflow(node, workflowNodeId))
    .forEach((node) => {
      const savedVersion = positiveInteger(node.metadata?.seedancePlaceholderSetVersion);
      maximumVersion = Math.max(maximumVersion, savedVersion || 1);
    });
  return maximumVersion + 1;
}

function nextSeedancePlaceholderGroupY(workflowNode: CanvasNodeData, nodes: CanvasNodeData[]) {
  const existingPlaceholders = nodes.filter((node) => isStoryPlaceholderForWorkflow(node, workflowNode.id));
  if (!existingPlaceholders.length) return workflowNode.position.y;
  return Math.max(...existingPlaceholders.map((node) => node.position.y + node.height)) + 60;
}

function versionedPlaceholderPosition(
  workflowNode: CanvasNodeData,
  size: { width: number; height: number },
  index: number,
  groupStartY: number,
) {
  return {
    x: workflowNode.position.x + workflowNode.width + 140 + (index % 3) * (size.width + 40),
    y: groupStartY + Math.floor(index / 3) * (size.height + 60),
  };
}

function referenceNodesForShot(
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
  currentShot?: CanvasNodeData,
) {
  const references: CanvasNodeData[] = [];
  const pushImageReference = (node: CanvasNodeData | undefined) => {
    if (!isUsableImageReference(node)) return;
    if (references.some((item) => item.id === node.id)) return;
    references.push(node);
  };

  pushImageReference(currentShot);
  if (currentShot) {
    orderedImageInputConnections(currentShot.id, nodeById, connections)
      .forEach(({ node }) => pushImageReference(node));
  }

  return references;
}

export function reconcileSeedance2StoryPlaceholderReferences(options: {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
}): CanvasConnection[] {
  const { nodes, connections } = options;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const placeholders = nodes.filter((node) => {
    const currentShotId = node.metadata?.seedanceStorySourceImageNodeId;
    return (
      node.type === CanvasNodeType.Video &&
      node.metadata?.seedanceWorkflowRole === "placeholder" &&
      typeof currentShotId === "string" &&
      nodeById.get(currentShotId)?.type === CanvasNodeType.Image
    );
  });
  if (!placeholders.length) return connections;

  const placeholderIds = new Set(placeholders.map((placeholder) => placeholder.id));
  const retainedByPlaceholderId = new Map<string, Map<string, CanvasConnection>>();
  const addedConnections: CanvasConnection[] = [];
  placeholders.forEach((placeholder) => {
    const currentShotId = placeholder.metadata?.seedanceStorySourceImageNodeId;
    const currentShot = typeof currentShotId === "string" ? nodeById.get(currentShotId) : undefined;
    if (!currentShot || currentShot.type !== CanvasNodeType.Image) return;
    const inheritedNodes = uniqueImageNodes([
      currentShot,
      ...orderedImageInputConnections(currentShot.id, nodeById, connections).map(({ node }) => node),
    ]);
    const directConnections = orderedImageInputConnections(placeholder.id, nodeById, connections);
    const manualConnections = directConnections.filter(({ connection }) => !isStoryReferenceConnection(connection));
    const targetNodeIds = uniqueNodeIds([
      ...inheritedNodes.map((node) => node.id),
      ...manualConnections.map(({ node }) => node.id),
    ]);
    const retainedByConnectionId = new Map<string, CanvasConnection>();
    targetNodeIds.forEach((sourceNodeId, index) => {
      const candidates = directConnections.filter(({ node }) => node.id === sourceNodeId);
      const existing =
        candidates.find(({ connection }) => !isStoryReferenceConnection(connection)) ||
        candidates[0];
      if (existing) {
        retainedByConnectionId.set(existing.connection.id, {
          ...existing.connection,
          referenceSequence: index + 1,
        });
        return;
      }
      addedConnections.push({
        id: storyReferenceConnectionId(
          String(placeholder.metadata?.seedanceWorkflowNodeId || "story"),
          placeholder.id,
          sourceNodeId,
        ),
        fromNodeId: sourceNodeId,
        toNodeId: placeholder.id,
        referenceSequence: index + 1,
      });
    });
    retainedByPlaceholderId.set(placeholder.id, retainedByConnectionId);
  });

  const nextConnections = connections.flatMap((connection) => {
    if (!placeholderIds.has(connection.toNodeId)) return [connection];
    if (nodeById.get(connection.fromNodeId)?.type !== CanvasNodeType.Image) return [connection];
    const retained = retainedByPlaceholderId.get(connection.toNodeId)?.get(connection.id);
    return retained ? [retained] : [];
  });
  nextConnections.push(...addedConnections);
  return sameConnections(nextConnections, connections) ? connections : nextConnections;
}

type OrderedImageInputConnection = {
  connection: CanvasConnection;
  node: CanvasNodeData;
  originalIndex: number;
};

function orderedImageInputConnections(
  targetNodeId: string,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
): OrderedImageInputConnection[] {
  return connections
    .map((connection, originalIndex) => ({
      connection,
      node: nodeById.get(connection.fromNodeId),
      originalIndex,
    }))
    .filter(
      (entry): entry is OrderedImageInputConnection =>
        entry.connection.toNodeId === targetNodeId &&
        entry.node?.type === CanvasNodeType.Image,
    )
    .sort((left, right) => {
      const leftSequence = validReferenceSequence(left.connection.referenceSequence) ?? left.originalIndex + 1;
      const rightSequence = validReferenceSequence(right.connection.referenceSequence) ?? right.originalIndex + 1;
      return leftSequence - rightSequence || left.originalIndex - right.originalIndex;
    });
}

function uniqueImageNodes(nodes: Array<CanvasNodeData | undefined>): CanvasNodeData[] {
  const seen = new Set<string>();
  return nodes.filter((node): node is CanvasNodeData => {
    if (node?.type !== CanvasNodeType.Image || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function uniqueNodeIds(nodeIds: string[]) {
  return nodeIds.filter((nodeId, index) => nodeIds.indexOf(nodeId) === index);
}

function isStoryReferenceConnection(connection: CanvasConnection) {
  return String(connection.id || "").startsWith("conn-seedance2-story-ref-");
}

function validReferenceSequence(value: unknown) {
  const sequence = Number(value);
  return Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : undefined;
}

function sameConnections(left: CanvasConnection[], right: CanvasConnection[]) {
  return left.length === right.length && left.every((connection, index) => {
    const other = right[index];
    if (!other) return false;
    const connectionValues = connection as unknown as Record<string, unknown>;
    const otherValues = other as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(connectionValues), ...Object.keys(otherValues)]);
    return [...keys].every((key) => connectionValues[key] === otherValues[key]);
  });
}

function appearingCharacterReferenceNodes(
  shot: StoryShot,
  storyDirector: CanvasNodeData,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
) {
  const characterById = new Map<string, StoryCharacter>(
    (storyDirector.metadata?.storyCharacters || []).map((character) => [character.id, character]),
  );
  const connectedCharacterNodes = storyDirectorConnectedInputImageNodes(
    storyDirector,
    "story:character",
    nodeById,
    connections,
  );
  if (connectedCharacterNodes.length) return connectedCharacterNodes;
  const savedCharacterNodes = storyDirectorSourceImageNodes(storyDirector, "character", nodeById);
  if (savedCharacterNodes.length) return savedCharacterNodes;
  const explicitlyBoundNodes = (shot.appearingCharacterIds || [])
    .map((characterId) => characterById.get(characterId)?.referenceNodeId)
    .flatMap((nodeId) => imageNodeById(nodeById, nodeId));
  if (explicitlyBoundNodes.length) {
    return explicitlyBoundNodes.filter(
      (node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index,
    );
  }

  const genericReferenceNodes = storyDirectorConnectedInputImageNodes(
    storyDirector,
    "story:reference",
    nodeById,
    connections,
  );
  const genericReferenceNodeIds = genericReferenceNodes.map((node) => node.id);
  return (shot.appearingCharacterIds || [])
    .map((characterId) => characterById.get(characterId))
    .flatMap((character) => {
      if (!character) return [];
      const matchedNodeId = findCharacterReferenceCandidate(
        character,
        genericReferenceNodeIds,
        nodeById,
      );
      return imageNodeById(nodeById, matchedNodeId);
    })
    .filter(
    (node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index,
  );
}

function storyDirectorConnectedInputImageNodes(
  storyDirector: CanvasNodeData,
  toHandleId: string,
  nodeById: Map<string, CanvasNodeData>,
  connections: CanvasConnection[],
) {
  return connections
    .filter((connection) => connection.toNodeId === storyDirector.id && connection.toHandleId === toHandleId)
    .flatMap((connection) => imageNodeById(nodeById, connection.fromNodeId))
    .filter((node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index);
}

function findCharacterReferenceCandidate(
  character: StoryCharacter,
  candidateIds: string[],
  nodeById: Map<string, CanvasNodeData>,
) {
  const names = [character.name, ...(character.aliases || [])]
    .map((value) => stringValue(value).toLowerCase())
    .filter(Boolean);
  if (!names.length) return undefined;
  return (
    candidateIds.find((id) => {
      const node = nodeById.get(id);
      const haystack = `${node?.title || ""}\n${node?.metadata?.prompt || ""}`.toLowerCase();
      return names.some((name) => haystack.includes(name));
    }) || undefined
  );
}

function sceneReferenceNodes(
  shot: StoryShot,
  storyDirector: CanvasNodeData,
  nodeById: Map<string, CanvasNodeData>,
) {
  const sceneReferenceNodeId = storyDirector.metadata?.storyScenes?.find((scene) => scene.id === shot.sceneId)?.referenceNodeId;
  if (sceneReferenceNodeId) {
    const sceneReferenceNode = imageNodeById(nodeById, sceneReferenceNodeId);
    if (sceneReferenceNode.length) return sceneReferenceNode;
  }
  return storyDirectorSourceImageNodes(storyDirector, "scene", nodeById);
}

function storyDirectorSourceImageNodes(
  storyDirector: CanvasNodeData,
  kind: StoryDirectorInputKind,
  nodeById: Map<string, CanvasNodeData>,
) {
  return storyDirectorSourceIdsForKind(storyDirector, kind).flatMap((nodeId) => imageNodeById(nodeById, nodeId));
}

function storyDirectorSourceIdsForKind(storyDirector: CanvasNodeData, kind: StoryDirectorInputKind) {
  if (kind === "scene") return storyDirector.metadata?.storySceneSourceImageNodeIds || [];
  if (kind === "prop") return storyDirector.metadata?.storyPropSourceImageNodeIds || [];
  if (kind === "character") return storyDirector.metadata?.storyCharacterSourceImageNodeIds || [];
  return storyDirector.metadata?.storySourceImageNodeIds?.length
    ? storyDirector.metadata.storySourceImageNodeIds
    : storyDirector.metadata?.storySourceImageNodeId
      ? [storyDirector.metadata.storySourceImageNodeId]
      : [];
}

function imageNodeById(nodeById: Map<string, CanvasNodeData>, nodeId?: string) {
  const node = nodeId ? nodeById.get(nodeId) : undefined;
  return isUsableImageReference(node) ? [node] : [];
}

function storyControllerConnectionId(workflowId: string, placeholderId: string) {
  return `conn-seedance2-story-controller-${workflowId}-${placeholderId}`;
}

function storyReferenceConnectionId(workflowId: string, placeholderId: string, sourceId: string) {
  return `conn-seedance2-story-ref-${workflowId}-${placeholderId}-${sourceId}`;
}

function placeholderPosition(
  workflowNode: CanvasNodeData,
  size: { width: number; height: number },
  index: number,
) {
  return {
    x: workflowNode.position.x + workflowNode.width + 140 + (index % 3) * (size.width + 40),
    y: workflowNode.position.y + Math.floor(index / 3) * (size.height + 60),
  };
}

function storyShotTitle(shot: StoryShot) {
  return stringValue(shot.title) || `第${shot.index}镜`;
}

function parseStoryShotIndex(value: unknown) {
  const text = stringValue(value);
  if (!text) return 0;
  const match = text.match(/第\s*(\d+)\s*镜/) || text.match(/镜头\s*(\d+)/);
  return positiveInteger(match?.[1]);
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isUsableImageReference(node: CanvasNodeData | undefined): node is CanvasNodeData {
  return Boolean(node && node.type === CanvasNodeType.Image && imageReferenceValue(node));
}

function imageReferenceValue(node: CanvasNodeData) {
  const metadata = node.metadata || {};
  return [metadata.backendUrl, metadata.content, metadata.backendRel, metadata.storageKey]
    .map((value) => stringValue(value))
    .find((value) => value && !value.startsWith("blob:"));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueId(baseId: string, usedIds: Set<string>) {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function safeIdPart(value: string) {
  return String(value || "node")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";
}
