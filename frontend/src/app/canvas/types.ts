export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    StoryDirector = "story_director",
    Seedance2Workflow = "seedance2_workflow",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";
export type StoryDirectorInputKind = "reference" | "character" | "scene" | "prop";
export type StoryGenerationMode = "quick" | "staged";
export type StoryDraftStatus = "idle" | "running" | "awaiting_review" | "paused" | "completed" | "failed";
export type StoryStageId = "requirements" | "characters" | "scenes" | "props" | "images" | "storyboard" | "videos";
export type StoryStageStatus = "pending" | "running" | "awaiting_review" | "confirmed" | "retrying" | "paused" | "failed" | "needs_regeneration" | "skipped";
export type StoryReferenceRole = "story" | "character" | "scene" | "prop";
export type StoryVersionRole = "director" | "reference" | "character" | "scene" | "prop" | "shot" | "video";

export type StoryReferenceSnapshot = {
    snapshotId: string;
    sourceNodeId: string;
    role: StoryReferenceRole;
    name: string;
    mimeType: string;
    width?: number;
    height?: number;
    content?: string;
    storageKey?: string;
    sha256: string;
    stableOrder: number;
    createdAt: string;
};

export type StoryStageError = {
    code: string;
    message: string;
    retryable: boolean;
    taskId?: string;
    taskIds?: string[];
    attempt?: number;
    occurredAt?: string;
};

export type StoryStageRecord = {
    id: StoryStageId;
    status: StoryStageStatus;
    revision: number;
    attempt: number;
    taskIds: string[];
    draftNodeIds: string[];
    inputRevision?: number;
    output?: unknown;
    rawOutput?: string;
    prompt?: string;
    error?: StoryStageError;
    confirmedAt?: string;
    updatedAt: string;
};

export type StoryDraftInputSnapshot = {
    storyText: string;
    style?: string;
    aspectRatio?: string;
    shotCount?: number;
    durationSeconds?: number;
    audioRules?: string;
    imageQuality?: string;
    storyboardMode?: string;
    sourceNodeIds: string[];
};

export type StoryStagedDraft = {
    draftId: string;
    sourceDirectorNodeId: string;
    baseNodeRevision: string;
    status: StoryDraftStatus;
    currentStageId: StoryStageId;
    inputSnapshot: StoryDraftInputSnapshot;
    referenceSnapshots: StoryReferenceSnapshot[];
    stages: StoryStageRecord[];
    versionNumber?: number;
    committedVersionId?: string;
    createdAt: string;
    updatedAt: string;
};

export const STORY_DIRECTOR_INPUT_HANDLES = [
    { id: "story:reference", kind: "reference", label: "故事参考", shortLabel: "参考" },
    { id: "story:character", kind: "character", label: "角色参考", shortLabel: "角色" },
    { id: "story:scene", kind: "scene", label: "场景参考", shortLabel: "场景" },
    { id: "story:prop", kind: "prop", label: "其它参考", shortLabel: "其它" },
] as const satisfies ReadonlyArray<{ id: string; kind: StoryDirectorInputKind; label: string; shortLabel: string }>;

export type StoryCharacter = {
    id: string;
    name: string;
    aliases?: string[];
    roleType?: string;
    importance: "main" | "supporting" | "minor" | "background";
    appearance: string;
    personality?: string;
    relationshipSummary?: string;
    visualPrompt: string;
    negativePrompt?: string;
    referenceNodeId?: string;
    referenceImageUrl?: string;
    assetSource?: "upstream" | "generated" | "manual";
    assetLocked?: boolean;
    status: "draft" | "generating" | "ready" | "locked" | "error";
    errorDetails?: string;
};

export type StoryScene = {
    id: string;
    name: string;
    description: string;
    mood?: string;
    visualStyle?: string;
    referenceNodeId?: string;
    referenceImageUrl?: string;
};

export type StoryShot = {
    id: string;
    index: number;
    title: string;
    sceneId?: string;
    appearingCharacterIds: string[];
    excludedCharacterIds: string[];
    action: string;
    camera: string;
    emotion?: string;
    continuityNote?: string;
    characterState?: string;
    visualContent?: string;
    voiceover?: string;
    imagePrompt: string;
    finalPrompt?: string;
    resultNodeIds: string[];
    status: "pending" | "generating" | "done" | "error";
    errorDetails?: string;
};

export type Seedance2ReferenceSlotKey =
    | "upstream_hd_frame"
    | "current_shot"
    | "character"
    | "scene";

export type Seedance2ExtraReferenceSlotKey =
    | "reference_5"
    | "reference_6"
    | "reference_7"
    | "reference_8"
    | "reference_9"
    | "reference_10"
    | "reference_11"
    | "reference_12";

export type Seedance2ReferenceSlotUseAs = "first_frame" | "reference_image";

export type Seedance2ReferenceSlotBinding = {
    nodeId?: string;
    value?: string;
    label: string;
    required?: boolean;
    useAs?: Seedance2ReferenceSlotUseAs;
};

export type SeedanceGenerationTaskState = {
    status: "idle" | "generating" | "success" | "failed" | "timeout";
    taskId?: string;
    startedAt?: string;
    timedOutAt?: string;
    errorMessage?: string;
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    negativePrompt?: string;
    imageSequenceNumber?: number;
    storyLabel?: string;
    storyGrid9GroupIndex?: number;
    storyGrid9ShotStart?: number;
    storyGrid9ShotEnd?: number;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    storageKey?: string;
    retained?: boolean;
    backendUrl?: string;
    backendRel?: string;
    mimeType?: string;
    bytes?: number;
    seedance2FaceEditOriginal?: {
        content?: string;
        backendUrl?: string;
        backendRel?: string;
        storageKey?: string;
        naturalWidth?: number;
        naturalHeight?: number;
        bytes?: number;
        mimeType?: string;
    };
    durationMs?: number;
    source?: string;
    sourceImageTaskId?: string;
    imageTaskId?: string;
    storyText?: string;
    storyDirectorTextModel?: string;
    storyDirectorTextModelMode?: "inherit" | "custom";
    storyOriginalText?: string;
    storyStyleMode?: "preset" | "custom";
    storyCustomStyle?: string;
    storyStyle?: string;
    storyShotCount?: number;
    storyAspectRatio?: string;
    storyStoryboardMode?: "single" | "grid9";
    storyGenerationMode?: StoryGenerationMode;
    storyStagedDraftId?: string;
    storyStagedDraft?: StoryStagedDraft;
    storyStageId?: StoryStageId;
    storyDraftNode?: boolean;
    storyAssetRole?: "character" | "scene" | "prop" | "shot" | "video";
    storyDraftAssetId?: string;
    storyTaskId?: string;
    storyVersionId?: string;
    storyVersionNumber?: number;
    storyVersionParentId?: string;
    storyVersionSourceNodeId?: string;
    storyVersionRole?: StoryVersionRole;
    storyReferenceSnapshotIds?: string[];
    storyReferenceSnapshotId?: string;
    storyVersionCreatedAt?: string;
    storyCommittedDraftId?: string;
    storyImageQuality?: "low" | "medium" | "high" | "1k" | "2k" | "4k";
    storyWorkflow?: "idle" | "analysis" | "character" | "shot";
    storySourceImageNodeId?: string;
    storySourceImageNodeIds?: string[];
    storyCharacterSourceImageNodeIds?: string[];
    storySceneSourceImageNodeIds?: string[];
    storyPropSourceImageNodeIds?: string[];
    storyAnalysisStatus?: CanvasNodeStatus;
    storyGenerationStatus?: CanvasNodeStatus;
    storyAnalysisRaw?: string;
    storyCharacters?: StoryCharacter[];
    storyScenes?: StoryScene[];
    storyShots?: StoryShot[];
    seedanceApiProvider?: "local";
    seedanceApiEndpoint?: string;
    seedanceWorkflowMode?: "continuous" | "slice";
    seedanceShotCount?: number;
    seedanceGenerateCount?: number;
    seedanceContinuous?: boolean;
    seedanceModel?: string;
    seedanceResolution?: string;
    seedanceRatio?: string;
    seedanceRatioSelection?: "upstream" | "manual";
    seedanceDuration?: string;
    seedanceSourceAspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";
    seedanceInheritSourceRatio?: boolean;
    seedanceRatioTouched?: boolean;
    seedanceReferenceSlotBindings?: Partial<Record<Seedance2ReferenceSlotKey, Seedance2ReferenceSlotBinding>>;
    seedanceReferenceExtraSlotBindings?: Partial<Record<Seedance2ExtraReferenceSlotKey, Seedance2ReferenceSlotBinding>>;
    seedancePromptPanelMode?: "compact" | "inline";
    seedancePromptExpandedByUser?: boolean;
    seedanceManualMinHeight?: number;
    seedanceReferenceSlotsExpanded?: boolean;
    seedancePromptTemplate?: string;
    seedancePromptTextModel?: string;
    seedanceAutoPrompt?: string;
    seedancePromptEditedByUser?: boolean;
    seedanceReferenceOrder?: string[];
    seedanceRequiredReferences?: string[];
    seedanceVersionStatus?: "adopted" | "candidate" | "discarded";
    seedanceWorkflowNodeId?: string;
    seedanceStoryDirectorNodeId?: string;
    seedanceStoryShotId?: string;
    seedanceStoryShotIndex?: number;
    seedanceStorySourceImageNodeId?: string;
    seedancePlaceholderSetVersion?: number;
    seedancePromptRewriteModel?: string;
    seedancePromptRewriteTemplate?: string;
    seedancePromptRewriteCreatedAt?: string;
    seedanceTaskId?: string;
    seedanceFileUrls?: string[];
    seedanceFiles?: string[];
    seedanceGenerationTaskState?: SeedanceGenerationTaskState;
    watermarkRemoved?: boolean;
    seedanceShotIndex?: number;
    seedanceShotTitle?: string;
    seedanceWorkflowRole?: "controller" | "placeholder" | "reference_frame" | "result" | "extracted-frame";
    seedanceSourcePlaceholderId?: string;
    seedanceVersion?: number;
    seedanceGeneratedVersions?: Array<{
        nodeId?: string;
        version: number;
        url: string;
        ratio?: string;
        duration?: string;
        taskId?: string;
        createdAt?: string;
    }>;
    seedanceResultNodeIds?: string[];
    seedanceLatestResultNodeId?: string;
    seedanceParamsSnapshot?: Record<string, unknown>;
    seedancePromptSnapshot?: string;
    seedanceCreatedAt?: string;
    seedanceSourceResultNodeId?: string;
    seedanceFrameTimeSeconds?: number;
    seedanceFrameIndex?: number;
    seedanceConnectsToNextPlaceholderId?: string;
    seedanceReferenceSlot?: Seedance2ReferenceSlotKey;
    pavoTestWorkspace?: boolean;
    pavoTestRunId?: string;
    pavoTestSourceNodeId?: string;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromHandleId?: string;
    toHandleId?: string;
    referenceSequence?: number;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant";
    mode: "ask" | "image";
    text: string;
    isLoading?: boolean;
    references?: CanvasAssistantReference[];
    images?: CanvasAssistantImage[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
    handleId?: string;
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "selection";
          x: number;
          y: number;
          nodeIds: string[];
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
