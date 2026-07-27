"use client";

import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlignCenter,
  AlignEndHorizontal,
  AlignStartHorizontal,
  Brush,
  Check,
  Clapperboard,
  Clipboard,
  Columns2,
  Copy,
  Download,
  FileText,
  Film,
  FolderPlus,
  Grid2x2,
  Home,
  ImageIcon,
  Images,
  Layers3,
  LayoutGrid,
  List,
  Maximize2,
  Menu,
  MessageSquare,
  Minus,
  Music2,
  PanelRightOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Redo2,
  Scissors,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Video,
  WandSparkles,
  ZoomIn,
} from "lucide-react";
import { saveAs } from "file-saver";

import {
  requestEdit,
  requestGeneration,
  requestImageQuestion,
  type ChatCompletionMessage,
  type GeneratedImageResult,
} from "@/services/api/image";
import { detectTextApiResponseError } from "@/services/api/text-response-errors";
import {
  requestAudioGeneration,
  storeGeneratedAudio,
} from "@/services/api/audio";
import {
  requestVideoGeneration,
  storeGeneratedVideo,
} from "@/services/api/video";
import {
  resolveApiRequestRoute,
  routedLocalApiUrl,
  routedLocalHeaders,
  type ApiRequestRoute,
} from "@/services/api/ai-routing";
import {
  createImageEditTask,
  createImageGenerationTask,
  fetchImageTasks,
  protectCanvasImages,
  type ImageTask,
} from "@/lib/api";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import {
  defaultConfig,
  modelMatchesCapability,
  selectableModelsByCapability,
  type AiConfig,
  useConfigStore,
  useEffectiveConfig,
} from "@/stores/use-config-store";
import {
  mergeModelLists,
  providerModelsForCapability,
  type ApiBoardRouteKey,
} from "@/stores/api-relay-config";
import {
  cleanupExpiredStoredImages,
  imageToDataUrl,
  resolveImageUrl,
  setStoredImagesRetained,
  touchStoredImages,
  uploadImage,
  type UploadedImage,
} from "@/services/image-storage";
import {
  resolveMediaUrl,
  uploadMediaFile,
  type UploadedFile,
} from "@/services/file-storage";
import { nanoid } from "nanoid";
import {
  dataUrlToFile,
  getDataUrlByteSize,
  readImageMeta,
} from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { ModelSelectControl } from "@/components/model-picker";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl } from "../utils/canvas-image-data";
import {
  createSeedance2FaceEditOriginalBackup,
  restoreSeedance2FaceEditOriginalNode,
} from "../utils/seedance2-face-editor";
import {
  fitNodeSize,
  imageNodeSize,
  nodeSizeFromRatio,
} from "../utils/canvas-node-size";
import { App, Button, Dropdown, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import {
  ActiveConnectionPath,
  CanvasConnectionDefs,
  ConnectionPath,
} from "../components/canvas-connections";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import { CanvasConfigNodePanel } from "../components/canvas-config-node-panel";
import { CanvasAssistantPanel } from "../components/canvas-assistant-panel";
import {
  CanvasNodeContextMenu,
  type CanvasContextMenuGroup,
  type CanvasContextMenuItem,
} from "../components/canvas-context-menu";
import { CanvasGenerationHistoryPanel } from "../components/canvas-generation-history-panel";
import { CanvasImageCompareDialog } from "../components/canvas-image-compare-dialog";
import {
  CanvasNodeAngleDialog,
  type CanvasImageAngleParams,
} from "../components/canvas-node-angle-dialog";
import {
  CanvasNodeCropDialog,
  type CanvasImageCropRect,
} from "../components/canvas-node-crop-dialog";
import {
  CanvasNodeLayerEditDialog,
  type CanvasImageLayerEditPayload,
} from "../components/canvas-node-layer-edit-dialog";
import {
  CanvasNodeMaskEditDialog,
  type CanvasImageMaskEditPayload,
} from "../components/canvas-node-mask-edit-dialog";
import {
  CanvasNodeSeedance2FaceEditDialog,
  type CanvasSeedance2FaceEditPayload,
} from "../components/canvas-node-seedance2-face-edit-dialog";
import {
  CanvasNodeSplitDialog,
  type CanvasImageSplitParams,
} from "../components/canvas-node-split-dialog";
import {
  CanvasNodeUpscaleDialog,
  type CanvasImageUpscaleParams,
} from "../components/canvas-node-upscale-dialog";
import {
  buildNodeChatMessages,
  buildNodeGenerationContext,
  buildNodeGenerationInputs,
  hydrateNodeGenerationContext,
  type NodeGenerationInput,
} from "../components/canvas-node-generation";
import { CanvasNodeInfoModal } from "../components/canvas-node-hover-toolbar";
import { buildImageToolbarTools } from "../components/canvas-image-toolbar-tools";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { Minimap } from "../components/canvas-mini-map";
import { CanvasNode } from "../components/canvas-node";
import {
  CanvasNodePromptPanel,
  type CanvasNodeGenerationMode,
} from "../components/canvas-node-prompt-panel";
import { CanvasStoryDirectorPanel } from "../components/canvas-story-director-panel";
import { useAutoResizeTextarea } from "../components/use-auto-resize-textarea";
import { CanvasToolbar } from "../components/canvas-toolbar";
import {
  AssetPickerModal,
  type AssetPickerTab,
  type InsertAssetPayload,
} from "../components/asset-picker-modal";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import {
  buildSeedance2WorkflowNodes,
  compactBulkSeedance2PlaceholderPanels,
  createSeedance2ResultMetadata,
  createSeedance2VideoPlaceholderMetadata,
  nextSeedance2ResultPosition,
  LOCAL_SEEDANCE2_API_ENDPOINT,
  normalizeSeedance2AspectRatio,
  normalizeSeedance2CreationAspectRatio,
  normalizeSeedance2Duration,
  normalizeSeedance2Resolution,
  normalizeSeedance2ResultRatio,
  removeLegacySeedance2TextNodes,
  resolveSeedance2WorkflowRatio,
  resolveSeedance2WorkflowRatioSelection,
  seedance2LayoutRatioFromImageNode,
  seedance2PlaceholderSize,
  seedance2ResultSizeFromSourceHeight,
  SEEDANCE2_ACTIVE_RESOLUTION,
  SEEDANCE2_DURATION_OPTIONS,
  SEEDANCE2_RESOLUTION_OPTIONS,
} from "../utils/seedance2-workflow";
import {
  seedance2RatioFromNaturalSize,
  seedance2SourceRatioFromNaturalSize,
  seedance2VisibleReferenceSlotCount,
} from "../utils/seedance2-responsive-layout";
import {
  buildSeedance2CustomerVideoPayload as buildSharedSeedance2CustomerVideoPayload,
} from "../utils/customer-video-adapter";
import { formatCustomerVideoRequestError } from "../utils/customer-video-errors";
import {
  customerVideoTaskError,
  customerVideoTaskFileUrls,
  isCustomerVideoTaskReady,
  type CustomerVideoTask,
} from "../utils/customer-video-task";
import {
  planSeedance2ReferenceConnection,
  resolveSeedance2ReferenceSlots,
  seedance2CanOccupyReferenceSlot,
  seedance2ManualReferenceHighestSlotIndex,
  seedance2ResolvedSlotsToCustomerReferences,
  type Seedance2ResolvedReferenceSlot,
} from "../utils/seedance2-reference-slots";
import { hydrateSeedance2CustomerReferencesForTransport } from "../utils/seedance2-reference-transport";
import {
  buildVersionedStoryDirectorSlicePlaceholders,
  collectSeedance2StoryRewriteInput,
  createSeedance2SequentialPlaceholderRun,
  findSeedance2StoryDirectorSource,
  reconcileSeedance2StoryPlaceholderReferences,
  seedance2UserPromptPatch,
} from "../utils/seedance2-story-integration";
import {
  rewriteSeedance2BatchPrompts,
  type Seedance2RewrittenShot,
} from "../utils/seedance2-prompt-rewrite";
import {
  buildCanvasResourceReferences,
  buildNodeMentionReferences,
} from "../utils/canvas-resource-references";
import { formatCanvasGenerationError } from "../utils/canvas-errors";
import {
  buildSeedance2PromptTextModelValues,
  resolveSeedance2PromptTextModel as resolveSeedance2PromptTextModelValue,
  type Seedance2PromptTextModelInput,
} from "../utils/seedance2-text-model";
import {
  hasCustomStoryDirectorTextModel,
  resolveStoryDirectorTextModel,
} from "../utils/story-director-text-model";
import {
  CanvasNodeType,
  STORY_DIRECTOR_INPUT_HANDLES,
  type CanvasAssistantImage,
  type CanvasAssistantSession,
  type CanvasConnection,
  type CanvasImageGenerationType,
  type CanvasNodeData,
  type CanvasNodeMetadata,
  type StoryCharacter,
  type StoryDirectorInputKind,
  type StoryScene,
  type StoryShot,
  type ConnectionHandle,
  type ContextMenuState,
  type Position,
  type Seedance2ReferenceSlotUseAs,
  type SelectionBox,
  type ViewportTransform,
} from "../types";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";

type CanvasClipboard = {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
};

type PendingConnectionCreate = {
  connection: ConnectionHandle;
  position: Position;
};

type ConnectionDropTarget = {
  nodeId: string | null;
  handleId?: string | null;
  isNearNode: boolean;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
  chatSessions: CanvasAssistantSession[];
  activeChatId: string | null;
  backgroundMode: CanvasBackgroundMode;
  showImageInfo: boolean;
};

type CanvasReferenceGenerationPreset = {
  title?: string;
  prompt?: string;
  size?: string;
  quality?: AiConfig["quality"];
  count?: number;
  successMessage?: string;
};

type StoryDirectorConfigKind = "analysis" | "character" | "shot";
type StoryAnalysisResult = {
  characters: StoryCharacter[];
  scenes: StoryScene[];
  shots: StoryShot[];
};

function outpaintPreset(size: string): CanvasReferenceGenerationPreset {
  const sizeLabel = size === "auto" ? "自定义比例" : size;
  const ratioInstruction =
    size === "auto"
      ? "目标画幅比例使用右侧图片参数中的尺寸设置；如需自定义，请在生成配置里输入比例后再生成。"
      : `目标画幅比例为 ${size}。`;
  return {
    title: `画面扩展 ${sizeLabel}`,
    size,
    quality: "high",
    count: 1,
    prompt: `以参考图片为基础进行 AI 画面扩展。${ratioInstruction}
保持原图主体、主体比例、镜头视角、光线方向、色彩、材质和整体风格一致；只补全画布外延区域，让新增区域自然延续原有环境、背景和纹理。不要裁切主体，不要改变核心物体形状，不要新增无关元素。`,
    successMessage: "已创建画面扩展配置",
  };
}

function enhancePreset(
  title: string,
  detail: string,
  quality: AiConfig["quality"] = "high",
): CanvasReferenceGenerationPreset {
  return {
    title,
    size: "auto",
    quality,
    count: 1,
    prompt: `以参考图片为准进行 ${title}。${detail}
保持原图主体、构图、姿态、颜色关系、画面风格和比例一致，不要新增无关元素，不要改变人物身份或物体形状。输出自然、干净、细节更好的版本。`,
    successMessage: `已创建${title}配置`,
  };
}

function styleTransferPreset(
  title: string,
  style: string,
): CanvasReferenceGenerationPreset {
  return {
    title,
    size: "auto",
    quality: "high",
    count: 1,
    prompt: `参考图片中的主体、构图、空间关系和关键内容保持一致，将画面转换为${style}。保留主体身份、姿态、物体结构和画面重心，统一光影、色彩、材质和氛围，让结果像完整的新作品而不是滤镜。`,
    successMessage: `已创建${title}配置`,
  };
}

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;
const CANVAS_IMAGE_MAX_COUNT = 20;
const CANVAS_IMAGE_TASK_POLL_INTERVAL_MS = 2_000;
const CANVAS_IMAGE_TASK_POLL_RETRY_LIMIT = 15;
const CANVAS_IMAGE_TASK_MISSING_GRACE_MS = 360_000;
const localCanvasImageTasks = new Map<string, Promise<GeneratedImageResult>>();
const STORY_DIRECTOR_IMAGE_CONCURRENCY = 5;
const STORY_DIRECTOR_SHOT_COLUMNS = 5;
const STORY_DIRECTOR_SHOT_NODE_WIDTH = 340;
const STORY_DIRECTOR_SHOT_NODE_HEIGHT = 604;
const STORY_DIRECTOR_SHOT_COLUMN_GAP = 96;
const STORY_DIRECTOR_SHOT_ROW_GAP = 112;
const STORY_DIRECTOR_DEFAULT_IMAGE_RATIO = "16:9";
const DEFAULT_VIEWPORT: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_SHORTCUT_EVENT = "canvas:open-shortcuts";
const CANVAS_FILE_GRID_GAP_X = 420;
const CANVAS_FILE_GRID_GAP_Y = 320;
const CANVAS_RESTORE_TIMEOUT_MS = 4_000;
const CANVAS_RESTORE_ITEM_TIMEOUT_MS = 800;
const CANVAS_RESTORE_CHUNK_SIZE = 6;
const XIAOJUN_TEACHER_RECOVERY_PROJECT_ID = "gqtgAPRgMApfbQ0Ar0iJq__merged_admin";
const XIAOJUN_TEACHER_RECOVERY_ALIASES = new Set([
  XIAOJUN_TEACHER_RECOVERY_PROJECT_ID,
  "LbX3osypY358Ls3Fo6nRu",
  "tolznormmht5E4hmRGeol",
  "LIlrXgC-CX-o_2zPKlT0e",
]);
const DEFAULT_CUSTOMER_VIDEO_API_BASE = "http://127.0.0.1:8006";
const CUSTOMER_VIDEO_TASK_POLL_INTERVAL_MS = 5_000;
const CUSTOMER_VIDEO_TASK_POLL_RETRY_LIMIT = 120;
const SEEDANCE2_CREATION_FALLBACK_RATIO = "9:16";
const SEEDANCE2_CREATION_RATIO_VALUES = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"] as const;
const CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS = { retained: true } as const;
const HIDE_CANVAS_NODE_HOVER_TOOLBAR = true;
const seedance2RewriteRunCache = new Map<
  string,
  {
    fingerprint: string;
    rewrittenShots: Seedance2RewrittenShot[];
    built: ReturnType<typeof buildVersionedStoryDirectorSlicePlaceholders>;
    nextShotIndex: number;
  }
>();

function shouldLoadXiaojunTeacherRecovery(
  projectId: string,
  project?: CanvasProject | null,
) {
  if (!XIAOJUN_TEACHER_RECOVERY_ALIASES.has(projectId)) return false;
  return !project || project.nodes.length === 0;
}

async function loadXiaojunTeacherRecoveryProject(
  projectId: string,
): Promise<CanvasProject | null> {
  try {
    const response = await fetch("/recovery/xiaojun-teacher-project.json", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { project?: Partial<CanvasProject> };
    const project = payload.project;
    if (!project || !Array.isArray(project.nodes)) return null;
    const now = new Date().toISOString();
    return {
      id: projectId,
      title:
        projectId === XIAOJUN_TEACHER_RECOVERY_PROJECT_ID
          ? "小军老师恢复画布"
          : "恢复的画布项目",
      createdAt: project.createdAt || now,
      updatedAt: now,
      nodes: project.nodes,
      connections: Array.isArray(project.connections) ? project.connections : [],
      chatSessions: Array.isArray(project.chatSessions) ? project.chatSessions : [],
      activeChatId: project.activeChatId || null,
      backgroundMode: project.backgroundMode || "lines",
      showImageInfo: Boolean(project.showImageInfo),
      viewport: project.viewport || DEFAULT_VIEWPORT,
    };
  } catch {
    return null;
  }
}

const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

const STORY_DIRECTOR_PLACEHOLDER = `在这里粘贴小说、章节或剧情梗概。

建议包含：人物、场景、关键事件、对白、画风要求。`;

function createCanvasNode(
  type: CanvasNodeType,
  position: Position,
  metadata?: CanvasNodeMetadata,
): CanvasNodeData {
  const spec = getNodeSpec(type);
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    type,
    title: spec.title,
    position: {
      x: position.x - spec.width / 2,
      y: position.y - spec.height / 2,
    },
    width: spec.width,
    height: spec.height,
    metadata: { ...spec.metadata, ...metadata },
  };
}

function createSeedance2VideoPlaceholderNode(
  position: Position,
  options: {
    sourceImageNode?: CanvasNodeData;
    ratio?: string;
    duration?: string;
    prompt?: string;
    shotIndex?: number;
  } = {},
): CanvasNodeData {
  const sourceRatio = options.sourceImageNode
    ? seedance2LayoutRatioFromImageNode(options.sourceImageNode)
    : "";
  const ratio = normalizeSeedance2AspectRatio(
    options.ratio || sourceRatio || "9:16",
  );
  const metadata = createSeedance2VideoPlaceholderMetadata({
    ratio,
    duration: options.duration || "5",
    sourceImageNode: options.sourceImageNode,
    shotIndex: options.shotIndex || 1,
    prompt:
      options.prompt ||
      (options.sourceImageNode
        ? "基于上游图片生成视频，保持主体、构图、场景和光线一致，增加自然运动和镜头变化。"
        : "描述当前镜头的视频内容。"),
  });
  const size = seedance2PlaceholderSize(ratio);
  const node = createCanvasNode(CanvasNodeType.Video, position, metadata);
  return {
    ...node,
    title: options.sourceImageNode
      ? "Seedance2 图片转视频"
      : "Seedance2 视频占位框",
    width: size.width,
    height: size.height,
    metadata,
  };
}

function seedance2ReferenceSlotOrientation(node: CanvasNodeData): "9:16" | "16:9" {
  const followsSource =
    node.metadata?.seedanceInheritSourceRatio !== false &&
    !node.metadata?.seedanceRatioTouched;
  const ratio = normalizeSeedance2AspectRatio(
    followsSource
      ? node.metadata?.seedanceSourceAspectRatio || node.metadata?.seedanceRatio || node.metadata?.size || "9:16"
      : node.metadata?.seedanceRatio || node.metadata?.size || "9:16",
  );
  return ratio === "9:16" ? "9:16" : "16:9";
}

function resolveSeedance2CreationRatio(configuredSize?: string | null) {
  const normalized = String(configuredSize || "").trim();
  return SEEDANCE2_CREATION_RATIO_VALUES.includes(
    normalized as (typeof SEEDANCE2_CREATION_RATIO_VALUES)[number],
  )
    ? normalized
    : SEEDANCE2_CREATION_FALLBACK_RATIO;
}

type Seedance2CustomerVideoReference = {
  label: string;
  value: string;
  nodeId: string;
  useAs: Seedance2ReferenceSlotUseAs;
};

type Seedance2CustomerVideoPayload = {
  mode: "text_to_video" | "image_to_video" | "first_last_frame";
  prompt: string;
  model: string;
  provider: "auto";
  ratio: string;
  duration: number;
  negative_prompt?: string;
  reference_image?: string;
  reference_images?: string[];
  first_frame?: string;
  last_frame?: string;
};

type CustomerVideoTaskResponse = {
  success?: boolean;
  task_id?: string;
  id?: string;
  message?: string;
  code?: string;
  task?: CustomerVideoTask;
  tasks?: CustomerVideoTask[];
};

type Seedance2ResultInsertOptions = {
  url: string;
  taskId?: string;
  files?: string[];
  fileUrls?: string[];
  watermarkRemoved?: boolean;
  paramsSnapshot?: Record<string, unknown>;
};

function seedance2ResultsForPlaceholder(
  placeholderId: string,
  nodes: CanvasNodeData[],
) {
  return nodes.filter(
    (node) =>
      node.metadata?.seedanceWorkflowRole === "result" &&
      node.metadata?.seedanceSourcePlaceholderId === placeholderId,
  );
}

function nextSeedance2ResultVersion(
  placeholder: CanvasNodeData,
  nodes: CanvasNodeData[],
) {
  const resultVersions = seedance2ResultsForPlaceholder(placeholder.id, nodes)
    .map((node) => Number(node.metadata?.seedanceVersion || 0))
    .filter((version) => Number.isFinite(version) && version > 0);
  const metadataVersions = (placeholder.metadata?.seedanceGeneratedVersions || [])
    .map((entry) => Number(entry.version || 0))
    .filter((version) => Number.isFinite(version) && version > 0);
  return Math.max(0, ...resultVersions, ...metadataVersions) + 1;
}

function createSeedance2ResultVideoNode(
  sourcePlaceholder: CanvasNodeData,
  existingResults: CanvasNodeData[],
  options: Seedance2ResultInsertOptions & { version: number },
): CanvasNodeData {
  const ratio = normalizeSeedance2ResultRatio(
    String(
      options.paramsSnapshot?.ratio ||
        sourcePlaceholder.metadata?.seedanceRatio ||
        sourcePlaceholder.metadata?.size ||
        "16:9",
    ),
  );
  const size = seedance2ResultSizeFromSourceHeight(sourcePlaceholder.height, ratio);
  const metadata = createSeedance2ResultMetadata({
    sourcePlaceholder,
    version: options.version,
    url: options.url,
    taskId: options.taskId,
    files: options.files || [],
    fileUrls: options.fileUrls?.length ? options.fileUrls : [options.url],
    paramsSnapshot: { ...(options.paramsSnapshot || {}), ratio },
  });
  return {
    id: `video-seedance2-result-${sourcePlaceholder.id}-${options.version}-${nanoid()}`,
    type: CanvasNodeType.Video,
    title: `生成结果 V${options.version}`,
    position: nextSeedance2ResultPosition(sourcePlaceholder, existingResults, ratio),
    width: size.width,
    height: size.height,
    metadata: {
      ...metadata,
      seedanceWorkflowRole: "result",
      seedanceSourcePlaceholderId: sourcePlaceholder.id,
      backendUrl: options.url,
      mimeType: "video/mp4",
      source: "customer-video-api",
      watermarkRemoved: options.watermarkRemoved,
    },
  };
}

function insertSeedance2ResultNode(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
  placeholder: CanvasNodeData,
  resultOptions: Seedance2ResultInsertOptions,
) {
  const currentPlaceholder = nodes.find((node) => node.id === placeholder.id) || placeholder;
  const existingResults = seedance2ResultsForPlaceholder(currentPlaceholder.id, nodes);
  const version = nextSeedance2ResultVersion(currentPlaceholder, nodes);
  const resultNode = createSeedance2ResultVideoNode(
    currentPlaceholder,
    existingResults,
    { ...resultOptions, version },
  );
  const fileUrls = resultOptions.fileUrls?.length
    ? resultOptions.fileUrls
    : [resultOptions.url];
  const generatedVersions = [
    ...(currentPlaceholder.metadata?.seedanceGeneratedVersions || []),
    {
      nodeId: resultNode.id,
      version,
      url: resultOptions.url,
      ratio: resultNode.metadata?.seedanceRatio || "16:9",
      duration: String(resultNode.metadata?.seedanceDuration || "15"),
      taskId: resultOptions.taskId,
      createdAt: String(resultNode.metadata?.seedanceCreatedAt || new Date().toISOString()),
    },
  ];
  const nextNodes = nodes.map((node) =>
    node.id === currentPlaceholder.id
      ? {
          ...node,
          metadata: {
            ...node.metadata,
            status: NODE_STATUS_SUCCESS,
            content: "",
            errorDetails: undefined,
            seedanceTaskId: resultOptions.taskId,
            seedanceFileUrls: fileUrls,
            seedanceFiles: resultOptions.files || [],
            seedanceGenerationTaskState: {
              status: "success" as const,
              taskId: resultOptions.taskId,
            },
            seedanceResultNodeIds: [
              ...(node.metadata?.seedanceResultNodeIds || []),
              resultNode.id,
            ],
            seedanceLatestResultNodeId: resultNode.id,
            seedanceGeneratedVersions: generatedVersions,
            watermarkRemoved: resultOptions.watermarkRemoved,
            source: "customer-video-api",
          },
        }
      : node,
  );
  return {
    nodes: [...nextNodes, resultNode],
    connections: [
      ...connections,
      {
        id: nanoid(),
        fromNodeId: currentPlaceholder.id,
        toNodeId: resultNode.id,
      },
    ],
    resultNode,
  };
}

type CustomerVideoApiConfig = {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  route?: ApiRequestRoute;
};

function normalizeCustomerVideoApiBase(value?: string) {
  const raw = String(value || "").trim() || DEFAULT_CUSTOMER_VIDEO_API_BASE;
  return (
    raw
      .replace(/\/+$/, "")
      .replace(/\/v1\/videos\/generations$/i, "")
      .replace(/\/v1$/i, "") || DEFAULT_CUSTOMER_VIDEO_API_BASE
  );
}

function customerVideoApiHeaders(apiConfig: CustomerVideoApiConfig) {
  if (apiConfig.route?.mode === "local") {
    return routedLocalHeaders(apiConfig.route, "application/json");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = String(apiConfig.apiKey || "").trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function customerVideoPollHeaders(apiConfig: CustomerVideoApiConfig) {
  if (apiConfig.route?.mode === "local") {
    return routedLocalHeaders(apiConfig.route);
  }
  const headers = customerVideoApiHeaders(apiConfig);
  delete headers["Content-Type"];
  return headers;
}

function customerVideoCreateUrl(apiConfig: CustomerVideoApiConfig) {
  if (apiConfig.route?.mode === "local") {
    return routedLocalApiUrl(apiConfig.route, "/videos/generations");
  }
  const apiBase = normalizeCustomerVideoApiBase(apiConfig.baseUrl);
  return `${apiBase}/v1/videos/generations`;
}

function customerVideoPollUrl(taskId: string, apiConfig: CustomerVideoApiConfig) {
  if (apiConfig.route?.mode === "local") {
    return routedLocalApiUrl(
      apiConfig.route,
      `/videos/generations/tasks/${encodeURIComponent(taskId)}`,
    );
  }
  const apiBase = normalizeCustomerVideoApiBase(apiConfig.baseUrl);
  return `${apiBase}/api/tasks/${encodeURIComponent(taskId)}`;
}

function customerVideoTaskListUrl(taskId: string, apiConfig: CustomerVideoApiConfig) {
  void taskId;
  if (apiConfig.route?.mode === "local") {
    return routedLocalApiUrl(apiConfig.route, "/tasks");
  }
  const apiBase = normalizeCustomerVideoApiBase(apiConfig.baseUrl);
  return `${apiBase}/v1/tasks`;
}

function customerVideoTaskFromResponse(data: CustomerVideoTaskResponse, taskId: string) {
  return findCustomerVideoTaskById(data, taskId) || data.task || data;
}

function findCustomerVideoTaskById(data: CustomerVideoTaskResponse, taskId: string) {
  const cleanTaskId = String(taskId || "").trim();
  if (!cleanTaskId) return undefined;
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  return tasks.find((task) => task.task_id === cleanTaskId || task.id === cleanTaskId);
}

function isCustomerVideoTaskEndpointMissing(response: Response, data: CustomerVideoTaskResponse) {
  const message = String(data.message || data.code || "").toLowerCase();
  return response.status === 404 || message.includes("not found") || message.includes("page not found");
}

function firstCustomerVideoString(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function collectCustomerVideoRelayObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCustomerVideoRelayObjects(item, depth + 1));
  }
  const record = value as Record<string, unknown>;
  const haystack = [record.name, record.title, record.label, record.type, record.provider, record.kind]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");
  const hasApiFields = ["baseUrl", "baseURL", "apiBaseUrl", "apiBaseURL", "relayBaseUrl", "endpoint", "url"].some(
    (key) => typeof record[key] === "string",
  );
  const isRelayLike = /relay|openai|compatible|api/.test(haystack) || hasApiFields;
  const children = Object.values(record).flatMap((item) => collectCustomerVideoRelayObjects(item, depth + 1));
  return isRelayLike ? [record, ...children] : children;
}

function pickCustomerVideoRelayField(objects: Record<string, unknown>[], keys: string[]) {
  for (const object of objects) {
    for (const key of keys) {
      const text = firstCustomerVideoString(object[key]);
      if (text) return text;
    }
  }
  return "";
}

function customerVideoGlobalRelayConfig(
  config?: unknown,
  effectiveConfig?: unknown,
  requestedModel = "",
): CustomerVideoApiConfig | null {
  for (const candidate of [effectiveConfig, config]) {
    const record = objectRecord(candidate);
    if (record.channelMode !== "local") continue;
    const route = resolveApiRequestRoute(
      candidate as AiConfig,
      "video",
      requestedModel,
      "videoGeneration",
    );
    if (route.mode === "local") {
      return {
        baseUrl: route.provider.baseUrl,
        apiKey: route.provider.apiKey,
        model: route.model,
        route,
      };
    }
  }
  return null;
}

function buildCustomerVideoApiConfig(
  node: CanvasNodeData,
  config?: unknown,
  effectiveConfig?: unknown,
): CustomerVideoApiConfig {
  const meta = objectRecord(node.metadata);
  const requestedModel = firstCustomerVideoString(meta.seedanceModel, meta.model);
  const globalRelayConfig = customerVideoGlobalRelayConfig(config, effectiveConfig, requestedModel);
  if (globalRelayConfig) return globalRelayConfig;
  const configRecord = objectRecord(config);
  const effectiveRecord = objectRecord(effectiveConfig);
  const relayObjects = [
    ...collectCustomerVideoRelayObjects(config),
    ...collectCustomerVideoRelayObjects(effectiveConfig),
  ];
  const configuredBase = firstCustomerVideoString(
    effectiveRecord.videoApiBaseUrl,
    effectiveRecord.videoBaseUrl,
    effectiveRecord.relayBaseUrl,
    effectiveRecord.relayApiBaseUrl,
    effectiveRecord.apiBaseUrl,
    effectiveRecord.baseUrl,
    effectiveRecord.baseURL,
    configRecord.videoApiBaseUrl,
    configRecord.videoBaseUrl,
    configRecord.relayBaseUrl,
    configRecord.relayApiBaseUrl,
    configRecord.apiBaseUrl,
    configRecord.baseUrl,
    configRecord.baseURL,
    pickCustomerVideoRelayField(relayObjects, [
      "videoApiBaseUrl",
      "videoBaseUrl",
      "relayBaseUrl",
      "relayApiBaseUrl",
      "apiBaseUrl",
      "apiBaseURL",
      "baseUrl",
      "baseURL",
      "endpoint",
      "url",
    ]),
  );
  const nodeEndpoint = firstCustomerVideoString(meta.seedanceApiEndpoint);
  const apiKey = firstCustomerVideoString(
    effectiveRecord.videoApiKey,
    effectiveRecord.relayApiKey,
    effectiveRecord.apiKey,
    configRecord.videoApiKey,
    configRecord.relayApiKey,
    configRecord.apiKey,
    pickCustomerVideoRelayField(relayObjects, ["videoApiKey", "relayApiKey", "apiKey", "key", "token"]),
  );
  return {
    baseUrl: normalizeCustomerVideoApiBase(configuredBase || nodeEndpoint),
    apiKey,
    model: requestedModel,
  };
}

function buildSeedance2CustomerVideoPayload(
  node: CanvasNodeData,
  references: Seedance2CustomerVideoReference[] = [],
  model = "",
): Seedance2CustomerVideoPayload {
  return {
    ...buildSharedSeedance2CustomerVideoPayload(node, references),
    model,
    provider: "auto",
  };
}

async function requestCustomerVideoTask(
  payload: Seedance2CustomerVideoPayload,
  apiConfig: CustomerVideoApiConfig,
) {
  try {
    const response = await fetch(customerVideoCreateUrl(apiConfig), {
      method: "POST",
      headers: customerVideoApiHeaders(apiConfig),
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as CustomerVideoTaskResponse;
    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.code || `Video task submit failed (${response.status})`);
    }
    return data;
  } catch (error) {
    throw new Error(formatCustomerVideoRequestError(error, { action: "submit", baseUrl: apiConfig.baseUrl }));
  }
}

async function fetchCustomerVideoTask(
  taskId: string,
  apiConfig: CustomerVideoApiConfig,
) {
  try {
    const response = await fetch(customerVideoPollUrl(taskId, apiConfig), {
      headers: customerVideoPollHeaders(apiConfig),
    });
    const data = (await response.json().catch(() => ({}))) as CustomerVideoTaskResponse;
    if (!response.ok || data.success === false) {
      if (isCustomerVideoTaskEndpointMissing(response, data)) {
        const listResponse = await fetch(customerVideoTaskListUrl(taskId, apiConfig), {
          headers: customerVideoPollHeaders(apiConfig),
        });
        const listData = (await listResponse.json().catch(() => ({}))) as CustomerVideoTaskResponse;
        if (!listResponse.ok || listData.success === false) {
          throw new Error(listData.message || listData.code || `Video task query failed (${listResponse.status})`);
        }
        return findCustomerVideoTaskById(listData, taskId) || { task_id: taskId, id: taskId, status: "queued" };
      }
      throw new Error(data.message || data.code || `Video task query failed (${response.status})`);
    }
    return customerVideoTaskFromResponse(data, taskId);
  } catch (error) {
    throw new Error(formatCustomerVideoRequestError(error, { action: "poll", baseUrl: apiConfig.baseUrl }));
  }
}

function waitCustomerVideoPoll(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeViewport(
  viewport: ViewportTransform | undefined,
): ViewportTransform {
  const x = Number.isFinite(viewport?.x) ? viewport!.x : DEFAULT_VIEWPORT.x;
  const y = Number.isFinite(viewport?.y) ? viewport!.y : DEFAULT_VIEWPORT.y;
  const k = Number.isFinite(viewport?.k)
    ? Math.min(Math.max(viewport!.k, 0.05), 5)
    : DEFAULT_VIEWPORT.k;
  return { x, y, k };
}

function isDefaultViewport(viewport: ViewportTransform) {
  return (
    viewport.x === DEFAULT_VIEWPORT.x &&
    viewport.y === DEFAULT_VIEWPORT.y &&
    viewport.k === DEFAULT_VIEWPORT.k
  );
}

export default function CanvasPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? (
    <CanvasWorkspaceErrorBoundary>
      <InfiniteCanvasPage />
    </CanvasWorkspaceErrorBoundary>
  ) : (
    <CanvasRefreshShell />
  );
}

class CanvasWorkspaceErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Canvas workspace crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <CanvasRestoreErrorShell
        message="画布运行时加载失败，可能是浏览器里保存的画布数据异常。请先返回画布库新建画布，或清理本机画布缓存。"
        onBack={() => (window.location.href = "/canvas/home")}
        onRepair={() => (window.location.href = "/canvas-repair")}
      />
    );
  }
}

function CanvasRefreshShell() {
  return (
    <main className="fixed inset-0 z-[999] h-screen w-screen overflow-hidden bg-background text-foreground">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div
        className="absolute bottom-5 left-1/2 z-50 flex h-14 -translate-x-1/2 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
        }}
        aria-hidden="true"
      >
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="size-8 rounded-md bg-current opacity-10"
          />
        ))}
      </div>

      <div
        className="absolute bottom-24 left-6 z-50 h-40 w-[240px] rounded-lg border shadow-2xl backdrop-blur-sm"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
        }}
        aria-hidden="true"
      >
        <div className="absolute left-7 top-7 h-5 w-12 rounded-sm bg-current opacity-10" />
        <div className="absolute left-28 top-16 h-6 w-16 rounded-sm bg-current opacity-10" />
        <div className="absolute bottom-7 left-16 h-8 w-20 rounded-sm bg-current opacity-10" />
        <div className="absolute inset-5 rounded border border-current opacity-15" />
      </div>

      <div
        className="absolute bottom-5 left-5 z-50 flex h-14 w-[260px] items-center gap-2 rounded-xl border px-2 shadow-lg backdrop-blur"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
        }}
        aria-hidden="true"
      >
        <div className="size-8 rounded-md bg-current opacity-10" />
        <div className="size-8 rounded-md bg-current opacity-10" />
        <div className="h-1 flex-1 rounded-full bg-current opacity-10" />
        <div className="h-4 w-10 rounded bg-current opacity-10" />
        <div className="size-8 rounded-md bg-current opacity-10" />
      </div>
    </main>
  );
}

function CanvasRestoreErrorShell({
  message,
  onBack,
  onRepair,
}: {
  message: string;
  onBack: () => void;
  onRepair: () => void;
}) {
  return (
    <main className="fixed inset-0 z-[999] grid h-screen w-screen place-items-center bg-stone-950 px-5 text-stone-100">
      <section className="w-full max-w-md rounded-lg border border-stone-800 bg-stone-900 p-6 shadow-2xl">
        <p className="text-xs text-stone-400">画布加载异常</p>
        <h1 className="mt-3 text-xl font-semibold">这个画布的数据需要修复</h1>
        <p className="mt-3 text-sm leading-6 text-stone-300">
          {message ||
            "启动时读取本地画布数据失败，请先返回画布库或执行加载修复。"}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="primary" onClick={onBack}>
            返回画布库
          </Button>
          <Button onClick={onRepair}>修复加载</Button>
        </div>
      </section>
    </main>
  );
}

function ConnectionCreateMenu({
  pending,
  onCreate,
  onClose,
}: {
  pending: PendingConnectionCreate;
  onCreate: (
    type:
      | CanvasNodeType.Image
      | CanvasNodeType.Text
      | CanvasNodeType.Config
      | CanvasNodeType.Video
      | CanvasNodeType.Audio,
  ) => void;
  onClose: () => void;
}) {
  const themeName = useThemeStore((state) => state.theme);
  const theme = canvasThemes[themeName] || canvasThemes.dark;
  return (
    <div
      className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
      data-connection-create-menu
      style={{
        left: pending.position.x,
        top: pending.position.y,
        background: theme.node.panel,
        borderColor: theme.node.stroke,
        color: theme.node.text,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span
          className="text-sm font-medium"
          style={{ color: theme.node.muted }}
        >
          引用该节点生成
        </span>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
      <div className="grid gap-1">
        <ConnectionCreateOption
          theme={theme}
          icon={<List className="size-5" />}
          title="文本生成"
          description="脚本、广告词、品牌文案"
          onClick={() => onCreate(CanvasNodeType.Text)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<ImageIcon className="size-5" />}
          title="图片生成"
          description="引用该节点生成图片"
          onClick={() => onCreate(CanvasNodeType.Image)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<Settings2 className="size-5" />}
          title="生成配置"
          description="连接素材后直接配置生图参数"
          onClick={() => onCreate(CanvasNodeType.Config)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<Video className="size-5" />}
          title="视频生成"
          onClick={() => onCreate(CanvasNodeType.Video)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<Music2 className="size-5" />}
          title="音频参考"
          onClick={() => onCreate(CanvasNodeType.Audio)}
        />
      </div>
    </div>
  );
}

function ConnectionCreateOption({
  theme,
  icon,
  title,
  description,
  onClick,
}: {
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition"
      style={{ color: theme.node.text }}
      onClick={onClick}
      onMouseEnter={(event) =>
        (event.currentTarget.style.background = theme.node.fill)
      }
      onMouseLeave={(event) =>
        (event.currentTarget.style.background = "transparent")
      }
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl"
        style={{ background: theme.node.fill, color: theme.node.muted }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-base font-semibold leading-5">
          {title}
        </span>
        {description ? (
          <span
            className="mt-1 block truncate text-sm"
            style={{ color: theme.node.muted }}
          >
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function CanvasEmptyStarter({
  theme,
  onUpload,
  onTextToImage,
  onOpenAssets,
  onSeedance2Workflow,
}: {
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  onUpload: () => void;
  onTextToImage: () => void;
  onOpenAssets: () => void;
  onSeedance2Workflow: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-4 top-1/2 z-30 flex -translate-y-1/2 justify-center sm:left-[300px] sm:right-4">
      <div
        className="pointer-events-auto w-[min(520px,calc(100vw-32px))] rounded-lg border p-4 shadow-xl backdrop-blur"
        style={{
          background: theme.node.panel,
          borderColor: theme.node.stroke,
          color: theme.node.text,
        }}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg"
            style={{ background: theme.node.fill, color: theme.node.muted }}
          >
            <Sparkles className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-5">开始创作</div>
            <div
              className="mt-0.5 text-xs leading-5"
              style={{ color: theme.node.muted }}
            >
              拖入图片、视频或音频，或从下面开始。
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <CanvasStarterAction
            theme={theme}
            icon={<Upload className="size-4" />}
            label="上传素材"
            onClick={onUpload}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<ImageIcon className="size-4" />}
            label="文生图"
            onClick={onTextToImage}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<Film className="size-4" />}
            label="Seedance2 工作流"
            onClick={onSeedance2Workflow}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<Images className="size-4" />}
            label="我的素材"
            onClick={onOpenAssets}
          />
        </div>
      </div>
    </div>
  );
}

function CanvasStarterAction({
  theme,
  icon,
  label,
  onClick,
}: {
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition hover:scale-[1.01]"
      style={{
        background: theme.node.fill,
        borderColor: theme.node.stroke,
        color: theme.node.text,
      }}
      onClick={onClick}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}



function seedance2PromptTextModelInput(
  node: CanvasNodeData,
  config: AiConfig,
  configuredTextModels = selectableModelsByCapability(config, "text"),
): Seedance2PromptTextModelInput {
  return {
    savedModel: node.metadata?.seedancePromptTextModel,
    currentTextModel: config.textModel,
    configuredTextModels,
    defaultTextModel: defaultConfig.textModel,
  };
}

function seedance2PromptTextModelValues(
  node: CanvasNodeData,
  config: AiConfig,
  configuredTextModels?: string[],
) {
  return buildSeedance2PromptTextModelValues(
    seedance2PromptTextModelInput(node, config, configuredTextModels),
    (model) => modelMatchesCapability(model, "text"),
  );
}

function resolveSeedance2PromptTextModel(node: CanvasNodeData, config: AiConfig) {
  return (
    resolveSeedance2PromptTextModelValue(
      seedance2PromptTextModelInput(node, config),
      (model) => modelMatchesCapability(model, "text"),
    ) || defaultConfig.textModel
  );
}

const SEEDANCE2_PROMPT_TEMPLATE_TEXTAREA_MIN_HEIGHT = 196;

const SEEDANCE2_API_RATIO_OPTIONS = [
  { value: "16:9", label: "横屏" },
  { value: "9:16", label: "竖屏" },
  { value: "1:1", label: "方形" },
  { value: "4:3", label: "标准横屏" },
  { value: "3:4", label: "标准竖屏" },
  { value: "21:9", label: "宽银幕" },
] as const;

const SEEDANCE2_SHOT_COUNT_OPTIONS = Array.from(
  { length: 60 },
  (_, index) => ({ value: String(index + 1), label: String(index + 1) }),
);

type Seedance2PickerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function Seedance2OptionPicker({
  label,
  value,
  options,
  onChange,
  theme,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly Seedance2PickerOption[];
  onChange: (value: string) => void;
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];
  const stop = (event: ReactMouseEvent | ReactPointerEvent) => event.stopPropagation();
  return (
    <div className="relative grid gap-1 text-xs" onMouseDown={stop} onPointerDown={stop} data-canvas-no-drag data-canvas-no-zoom>
      <span style={{ color: theme.node.muted }}>{label}</span>
      <button
        type="button"
        disabled={disabled}
        className="flex h-9 items-center justify-between rounded-lg border px-2 text-left text-sm outline-none transition hover:border-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) setOpen((currentOpen) => !currentOpen);
        }}
      >
        <span className="truncate">{current?.label || value}</span>
        <span className="ml-2 text-[10px]" style={{ color: theme.node.muted }}>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-[90] mt-1 overflow-hidden rounded-lg border p-1 shadow-lg" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background: selected ? "rgba(249,115,22,.18)" : "transparent",
                  color: option.disabled ? theme.node.muted : theme.node.text,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <span className="text-orange-300">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Seedance2ModelOptionPicker({
  label, value, models, onChange, theme,
}: {
  label: string; value: string; models: readonly string[];
  onChange: (value: string) => void;
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
}) {
  return (
    <div className="relative grid gap-1 text-xs" data-canvas-no-drag data-canvas-no-zoom>
      <span style={{ color: theme.node.muted }}>{label}</span>
      <ModelSelectControl
        models={models}
        value={value}
        onChange={onChange}
        placeholder="选择模型"
        emptyLabel={`暂无已配置${label}`}
        title={label}
        triggerClassName="h-9 w-full rounded-lg border px-2 text-sm shadow-none hover:border-orange-400"
        triggerStyle={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
        contentClassName="z-[1300]"
      />
    </div>
  );
}

function Seedance2WorkflowPanel({
  node,
  onConfigChange,
  onCreatePlaceholders,
  storyDirectorSource,
  isCreatingPlaceholders = false,
  onClose,
  embedded = false,
}: {
  node: CanvasNodeData;
  onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
  onCreatePlaceholders: (node: CanvasNodeData) => void;
  storyDirectorSource?: CanvasNodeData;
  isCreatingPlaceholders?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const theme = canvasThemes[useThemeStore((state) => state.theme)];
  const effectiveConfig = useEffectiveConfig();
  const meta = node.metadata || {};
  const fieldStyle = { borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill };
  const patch = (value: Partial<CanvasNodeData["metadata"]>) =>
    onConfigChange(node.id, {
      seedanceWorkflowMode: "slice",
      seedanceContinuous: false,
      seedanceGenerateCount: 1,
      seedanceApiProvider: "local",
      seedanceApiEndpoint: LOCAL_SEEDANCE2_API_ENDPOINT,
      seedanceModel: videoModel,
      seedanceResolution: SEEDANCE2_ACTIVE_RESOLUTION,
      ...value,
    });
  const ratioSelection = resolveSeedance2WorkflowRatioSelection({
    selection: meta.seedanceRatioSelection,
    inheritSourceRatio: meta.seedanceInheritSourceRatio,
    ratioTouched: meta.seedanceRatioTouched,
  });
  const upstreamRatio = storyDirectorSource?.metadata?.storyAspectRatio;
  const ratio = resolveSeedance2WorkflowRatio({
    storedRatio: meta.seedanceRatio || meta.size,
    selection: ratioSelection,
    upstreamRatio,
  });
  const usesUpstreamRatio =
    ratioSelection === "upstream" &&
    SEEDANCE2_API_RATIO_OPTIONS.some((option) => option.value === upstreamRatio);
  const duration = normalizeSeedance2Duration(meta.seedanceDuration || meta.seconds);
  const resolution = normalizeSeedance2Resolution(meta.seedanceResolution || meta.vquality);
  const videoModels = selectableModelsByCapability(effectiveConfig, "video");
  const requestedVideoModel = String(meta.seedanceModel || meta.model || effectiveConfig.videoModel || "").trim();
  const videoModel = videoModels.includes(requestedVideoModel) ? requestedVideoModel : "";
  const promptTextModel = resolveSeedance2PromptTextModel(node, effectiveConfig);
  const textModelOptions = seedance2PromptTextModelValues(
    node, effectiveConfig, selectableModelsByCapability(effectiveConfig, "text"),
  );
  const { textareaRef: promptTemplateTextareaRef } = useAutoResizeTextarea({
    value: meta.seedancePromptTemplate || "",
    minHeight: SEEDANCE2_PROMPT_TEMPLATE_TEXTAREA_MIN_HEIGHT,
  });
  const panelClass = embedded
    ? "flex min-h-full w-full flex-col overflow-visible rounded-[26px] border p-4"
    : "w-[560px] rounded-2xl border p-4 shadow-xl backdrop-blur";
  const sourceHint = storyDirectorSource
    ? "已找到故事导演来源：将按故事导演分镜顺序创建视频占位框，并自动带入分镜图作为当前分镜参考。"
    : "未连接故事导演：将按手动分镜数量创建空视频占位框。";

  return (
    <div
      data-seedance2-workflow-panel
      className={panelClass}
      style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
      data-canvas-no-zoom
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className="truncate">Seedance2 视频工作流</span>
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-300">分镜式</span>
          </div>
          <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
            选择视频参数和文本模型，按分镜数量创建下游视频占位框。
          </div>
        </div>
        {!embedded && onClose ? (
          <button type="button" className="rounded-lg px-2 py-1 text-xs" style={{ background: theme.node.fill, color: theme.node.text }} onClick={onClose}>关闭</button>
        ) : null}
      </div>

      <div className="mb-3 rounded-xl border px-3 py-2 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
        {sourceHint}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Seedance2OptionPicker
          label="分镜数量"
          value={String(meta.seedanceShotCount || 4)}
          options={SEEDANCE2_SHOT_COUNT_OPTIONS}
          theme={theme}
          onChange={(value) => patch({ seedanceShotCount: Number(value) })}
        />
        <Seedance2OptionPicker
          label="时长"
          value={duration}
          options={SEEDANCE2_DURATION_OPTIONS}
          theme={theme}
          onChange={(value) => {
            const nextDuration = normalizeSeedance2Duration(value);
            patch({ seedanceDuration: nextDuration, seconds: nextDuration });
          }}
        />
        <Seedance2ModelOptionPicker
          label="视频模型"
          value={videoModel}
          models={videoModels}
          theme={theme}
          onChange={(value) => patch({ seedanceModel: value, model: value })}
        />
        <Seedance2ModelOptionPicker
          label="文本模型"
          value={promptTextModel}
          models={textModelOptions}
          theme={theme}
          onChange={(value) => patch({ seedancePromptTextModel: value })}
        />
        <div className="grid gap-1">
          <Seedance2OptionPicker
            label="视频画面比例"
            value={ratio}
            options={SEEDANCE2_API_RATIO_OPTIONS}
            theme={theme}
            onChange={(value) => patch({ seedanceRatio: value, size: value, seedanceRatioSelection: "manual" })}
          />
          {usesUpstreamRatio ? (
            <span className="text-[10px]" style={{ color: theme.node.muted }}>上游默认</span>
          ) : null}
        </div>
        <Seedance2OptionPicker
          label="清晰度"
          value={resolution}
          options={SEEDANCE2_RESOLUTION_OPTIONS}
          theme={theme}
          onChange={(value) => {
            const nextResolution = normalizeSeedance2Resolution(value);
            patch({ seedanceResolution: nextResolution, vquality: nextResolution });
          }}
        />
      </div>

      <label className="mt-3 grid gap-1 text-xs" data-canvas-no-drag data-canvas-no-zoom>
        <span style={{ color: theme.node.muted }}>视频提示词模板</span>
        <textarea
          ref={promptTemplateTextareaRef}
          className="thin-scrollbar resize-y rounded-lg border px-2 py-2 text-sm leading-5 outline-none"
          style={{ ...fieldStyle, minHeight: SEEDANCE2_PROMPT_TEMPLATE_TEXTAREA_MIN_HEIGHT }}
          value={meta.seedancePromptTemplate || ""}
          onChange={(event) => patch({ seedancePromptTemplate: event.target.value })}
        />
      </label>
      <div className="mt-4 flex gap-2" data-canvas-no-drag data-canvas-no-zoom>
        <button type="button" disabled={isCreatingPlaceholders} className="h-10 flex-1 rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60" onClick={() => onCreatePlaceholders(node)}>
          {isCreatingPlaceholders ? "正在整批改写..." : "创建 / 刷新视频占位框"}
        </button>
      </div>
    </div>
  );
}

function InfiniteCanvasPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id") || "";
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{
    nodeId?: string;
    position?: Position;
  } | null>(null);
  const clipboardRef = useRef<CanvasClipboard | null>(null);
  const historyRef = useRef<{
    past: CanvasHistoryEntry[];
    future: CanvasHistoryEntry[];
  }>({ past: [], future: [] });
  const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
  const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const applyingHistoryRef = useRef(false);
  const historyPausedRef = useRef(false);
  const didInitialCenterRef = useRef(false);
  const shouldCenterInitialViewportRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const nodeDraggingRef = useRef(false);
  const dragRef = useRef<{
    isDraggingNode: boolean;
    hasMoved: boolean;
    startX: number;
    startY: number;
    initialSelectedNodes: { id: string; x: number; y: number }[];
  }>({
    isDraggingNode: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    initialSelectedNodes: [],
  });

  const config = useConfigStore((state) => state.config);
  const effectiveConfig = useEffectiveConfig();
  const storyDirectorTextModels = useMemo(() => {
    const enabledTextProviders = config.apiRelays.filter(
      (provider) => provider.enabled && provider.capabilities.includes("text"),
    );
    const routeProvider = enabledTextProviders.find(
      (provider) => provider.id === config.apiRouting.text.providerId,
    );
    const otherProviders = enabledTextProviders.filter(
      (provider) => provider.id !== routeProvider?.id,
    );
    return mergeModelLists(
      config.apiRouting.text.model ? [config.apiRouting.text.model] : [],
      routeProvider ? providerModelsForCapability(routeProvider, "text") : [],
      ...otherProviders.map((provider) =>
        providerModelsForCapability(provider, "text"),
      ),
      config.textModels,
    );
  }, [config.apiRelays, config.apiRouting.text, config.textModels]);
  const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
  const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
  const addAsset = useAssetStore((state) => state.addAsset);
  const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
  const hydrated = useCanvasStore((state) => state.hydrated);
  const createProject = useCanvasStore((state) => state.createProject);
  const openProject = useCanvasStore((state) => state.openProject);
  const updateProject = useCanvasStore((state) => state.updateProject);
  const renameProject = useCanvasStore((state) => state.renameProject);
  const deleteProjects = useCanvasStore((state) => state.deleteProjects);
  const replaceProjects = useCanvasStore((state) => state.replaceProjects);
  const currentProject = useCanvasStore((state) =>
    state.projects.find((project) => project.id === projectId),
  );
  const theme = canvasThemes[useThemeStore((state) => state.theme)];
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>(
    [],
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportTransform>({
    x: 0,
    y: 0,
    k: 1,
  });
  const [size, setSize] = useState({ width: 1200, height: 720 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectingParams, setConnectingParams] =
    useState<ConnectionHandle | null>(null);
  const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<
    string | null
  >(null);
  const [connectionTargetHandleId, setConnectionTargetHandleId] = useState<
    string | null
  >(null);
  const [pendingConnectionCreate, setPendingConnectionCreate] =
    useState<PendingConnectionCreate | null>(null);
  const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
  const [backgroundMode, setBackgroundMode] =
    useState<CanvasBackgroundMode>("lines");
  const [showImageInfo, setShowImageInfo] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerTab, setAssetPickerTab] =
    useState<AssetPickerTab>("my-assets");
  const [replacePickerNodeId, setReplacePickerNodeId] = useState<string | null>(
    null,
  );
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
  const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
  const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editRequestNonce, setEditRequestNonce] = useState(0);
  const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
  const [cropNodeId, setCropNodeId] = useState<string | null>(null);
  const [layerEditNodeId, setLayerEditNodeId] = useState<string | null>(null);
  const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
  const [seedance2FaceEditNodeId, setSeedance2FaceEditNodeId] = useState<
    string | null
  >(null);
  const [seedance2FaceEditDataUrl, setSeedance2FaceEditDataUrl] = useState("");
  const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
  const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
  const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(
    null,
  );
  const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [compareNodeIds, setCompareNodeIds] = useState<string[]>([]);
  const [comparePrimaryNodeId, setComparePrimaryNodeId] = useState<
    string | null
  >(null);
  const [generationHistoryOpen, setGenerationHistoryOpen] = useState(false);
  const [assistantCollapsed, setAssistantCollapsed] = useState(true);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [isNodeDragging, setIsNodeDragging] = useState(false);

  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const selectedConnectionIdRef = useRef(selectedConnectionId);
  const dialogNodeIdRef = useRef(dialogNodeId);
  const previewNodeIdRef = useRef(previewNodeId);
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  const toolbarNodeIdRef = useRef(toolbarNodeId);
  const viewportRef = useRef(viewport);
  const connectingParamsRef = useRef(connectingParams);
  const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
  const connectionTargetHandleIdRef = useRef(connectionTargetHandleId);
  const selectionBoxRef = useRef(selectionBox);
  const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
  const resumedImageTaskIdsRef = useRef<Set<string>>(new Set());

  const createHistoryEntry = useCallback(
    (): CanvasHistoryEntry => ({
      nodes: nodesRef.current,
      connections: connectionsRef.current,
      chatSessions,
      activeChatId,
      backgroundMode,
      showImageInfo,
    }),
    [activeChatId, backgroundMode, chatSessions, showImageInfo],
  );

  const cleanupCanvasFiles = useCallback(
    (extra?: unknown) => {
      cleanupAssetImages({
        extra,
        history: historyRef.current,
        lastHistory: lastHistoryRef.current,
      });
    },
    [cleanupAssetImages],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => void cleanupExpiredStoredImages(),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setProjectLoaded(false);
    setRestoreError(null);
    if (!hydrated) return;
    let cancelled = false;

    const restoreProjectState = async (targetProject: CanvasProject) => {
      try {
        const sourceNodes = withImageSequenceNumbers(
          sanitizeCanvasNodes(targetProject.nodes),
        );
        const sourceConnections = sanitizeCanvasConnections(
          targetProject.connections,
          sourceNodes,
        );
        const sourceSessions = Array.isArray(targetProject.chatSessions)
          ? targetProject.chatSessions
          : [];
        const recoveredNodes = withImageSequenceNumbers(
          sanitizeCanvasNodes(
            normalizeConfigNodeSize(recoverInterruptedGeneration(sourceNodes)),
          ),
        );
        const initialNodes = reconcileStoryDirectorImageResults(
          recoveredNodes,
          sourceConnections,
        );
        const initialConnections = sanitizeCanvasConnections(
          sourceConnections,
          initialNodes,
        );
        if (cancelled) return;
        setNodes(initialNodes);
        setConnections(initialConnections);
        setChatSessions(sourceSessions);
        setActiveChatId(targetProject.activeChatId || null);
        setBackgroundMode(targetProject.backgroundMode);
        setShowImageInfo(targetProject.showImageInfo || false);
        const restoredCanvasViewport = normalizeViewport(targetProject.viewport);
        setViewport(restoredCanvasViewport);
        didInitialCenterRef.current = false;
        shouldCenterInitialViewportRef.current = isDefaultViewport(
          restoredCanvasViewport,
        );
        historyRef.current = { past: [], future: [] };
        if (historyCommitTimerRef.current) {
          clearTimeout(historyCommitTimerRef.current);
          historyCommitTimerRef.current = null;
        }
        lastHistoryRef.current = {
          nodes: initialNodes,
          connections: initialConnections,
          chatSessions: sourceSessions,
          activeChatId: targetProject.activeChatId || null,
          backgroundMode: targetProject.backgroundMode,
          showImageInfo: targetProject.showImageInfo || false,
        };
        setHistoryState({ canUndo: false, canRedo: false });
        setProjectLoaded(true);

        window.setTimeout(() => {
          void (async () => {
            try {
              const hydratedNodes = withImageSequenceNumbers(
                sanitizeCanvasNodes(
                  normalizeConfigNodeSize(
                    await withCanvasRestoreTimeout(
                      hydrateCanvasImages(initialNodes),
                      initialNodes,
                    ),
                  ),
                ),
              );
              const restoredConnections = sanitizeCanvasConnections(
                sourceConnections,
                hydratedNodes,
              );
              const restoredNodes = reconcileStoryDirectorImageResults(
                hydratedNodes,
                restoredConnections,
              );
              const restoredSessions = await withCanvasRestoreTimeout(
                hydrateAssistantImages(sourceSessions),
                sourceSessions,
              );
              if (cancelled) return;
              setNodes(restoredNodes);
              setConnections(restoredConnections);
              setChatSessions(restoredSessions);
              historyRef.current = { past: [], future: [] };
              if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
              }
              lastHistoryRef.current = {
                nodes: restoredNodes,
                connections: restoredConnections,
                chatSessions: restoredSessions,
                activeChatId: targetProject.activeChatId || null,
                backgroundMode: targetProject.backgroundMode,
                showImageInfo: targetProject.showImageInfo || false,
              };
              setHistoryState({ canUndo: false, canRedo: false });
            } catch (error) {
              console.warn("Canvas media restore skipped", error);
            }
          })();
        }, 0);
      } catch (error) {
        if (cancelled) return;
        setRestoreError(
          error instanceof Error ? error.message : "画布数据恢复失败",
        );
      }
    };

    if (!projectId) {
      const id = createProject(
        `无限画布 ${useCanvasStore.getState().projects.length + 1}`,
      );
      router.replace(`/canvas/workspace?id=${encodeURIComponent(id)}`);
      return;
    }
    const project = openProject(projectId);
    if (shouldLoadXiaojunTeacherRecovery(projectId, project)) {
      void loadXiaojunTeacherRecoveryProject(projectId).then(async (recoveredProject) => {
        if (cancelled || !recoveredProject) return;
        const existingProjects = useCanvasStore.getState().projects;
        replaceProjects([
          recoveredProject,
          ...existingProjects.filter((item) => item.id !== recoveredProject.id),
        ]);
        await restoreProjectState(recoveredProject);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!project) {
      const id = createProject(
        `无限画布 ${useCanvasStore.getState().projects.length + 1}`,
      );
      router.replace(`/canvas/workspace?id=${encodeURIComponent(id)}`);
      return;
    }

    void restoreProjectState(project);
    return () => {
      cancelled = true;
    };
  }, [createProject, hydrated, openProject, projectId, replaceProjects, router]);

  useEffect(() => {
    if (
      !projectLoaded ||
      applyingHistoryRef.current ||
      historyPausedRef.current
    )
      return;
    const next = createHistoryEntry();
    const previous = lastHistoryRef.current;
    if (
      previous?.nodes === next.nodes &&
      previous.connections === next.connections &&
      previous.chatSessions === next.chatSessions &&
      previous.activeChatId === next.activeChatId &&
      previous.backgroundMode === next.backgroundMode &&
      previous.showImageInfo === next.showImageInfo
    )
      return;

    if (historyCommitTimerRef.current)
      clearTimeout(historyCommitTimerRef.current);
    historyCommitTimerRef.current = setTimeout(() => {
      const current = createHistoryEntry();
      const last = lastHistoryRef.current;
      if (!last) return;
      historyRef.current.past = [...historyRef.current.past.slice(-49), last];
      historyRef.current.future = [];
      setHistoryState({ canUndo: true, canRedo: false });
      lastHistoryRef.current = current;
      historyCommitTimerRef.current = null;
    }, 180);

    return () => {
      if (historyCommitTimerRef.current) {
        clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = null;
      }
    };
  }, [
    activeChatId,
    backgroundMode,
    chatSessions,
    connections,
    createHistoryEntry,
    nodes,
    projectLoaded,
    showImageInfo,
  ]);

  useEffect(() => {
    if (!projectLoaded || historyPausedRef.current) return;
    updateProject(projectId, {
      nodes,
      connections,
      chatSessions,
      activeChatId,
      backgroundMode,
      showImageInfo,
    });
    protectBackendImagesForCanvas(nodes, projectId);
  }, [
    activeChatId,
    backgroundMode,
    chatSessions,
    connections,
    nodes,
    projectId,
    projectLoaded,
    showImageInfo,
    updateProject,
  ]);

  useEffect(() => {
    if (!projectLoaded) return;
    setNodes((prev) =>
      syncStoryDirectorInputMetadata(prev, connectionsRef.current),
    );
  }, [connections, projectLoaded]);

  useEffect(() => {
    if (!projectLoaded) return;
    setConnections((previous) =>
      reconcileSeedance2StoryPlaceholderReferences({
        nodes: nodesRef.current,
        connections: previous,
      }),
    );
  }, [connections, nodes, projectLoaded]);

  useEffect(() => {
    if (!dialogNodeId) setNodeImageSettingsOpen(false);
  }, [dialogNodeId]);

  const persistCanvasSnapshot = useCallback(
    (nextNodes: CanvasNodeData[], nextConnections = connectionsRef.current) => {
      nodesRef.current = nextNodes;
      connectionsRef.current = nextConnections;
      updateProject(projectId, {
        nodes: nextNodes,
        connections: nextConnections,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
      });
    },
    [
      activeChatId,
      backgroundMode,
      chatSessions,
      projectId,
      showImageInfo,
      updateProject,
    ],
  );

  const applyPersistedNodes = useCallback(
    (updater: (nodes: CanvasNodeData[]) => CanvasNodeData[]) => {
      const nextNodes = updater(nodesRef.current);
      setNodes(nextNodes);
      persistCanvasSnapshot(nextNodes);
      return nextNodes;
    },
    [persistCanvasSnapshot],
  );

  const applyPersistedGraph = useCallback(
    (
      nodeUpdater: (nodes: CanvasNodeData[]) => CanvasNodeData[],
      connectionUpdater: (
        connections: CanvasConnection[],
      ) => CanvasConnection[],
    ) => {
      const nextNodes = nodeUpdater(nodesRef.current);
      const nextConnections = connectionUpdater(connectionsRef.current);
      setNodes(nextNodes);
      setConnections(nextConnections);
      persistCanvasSnapshot(nextNodes, nextConnections);
      return { nodes: nextNodes, connections: nextConnections };
    },
    [persistCanvasSnapshot],
  );

  const resumeCanvasImageTask = useCallback(
    async (nodeId: string, taskId: string) => {
      try {
        const generated = await pollCanvasImageTask(taskId);
        const uploaded = await uploadImage(generated.dataUrl);
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((node) =>
            node.id === nodeId &&
            node.metadata?.sourceImageTaskId === taskId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    ...imageMetadata(uploaded, generated),
                  },
                }
              : node,
          ),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "图片任务恢复失败",
        );
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((node) =>
            node.id === nodeId &&
            node.metadata?.sourceImageTaskId === taskId &&
            !node.metadata?.content
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    sourceImageTaskId: undefined,
                  },
                }
              : node,
          ),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
        resumedImageTaskIdsRef.current.delete(taskId);
      }
    },
    [persistCanvasSnapshot],
  );

  useEffect(() => {
    if (!projectLoaded) return;
    nodes
      .filter((node) => {
        return (
          node.type === CanvasNodeType.Image &&
          Boolean(node.metadata?.sourceImageTaskId) &&
          !node.metadata?.content
        );
      })
      .forEach((node) => {
        const taskId = node.metadata!.sourceImageTaskId!;
        if (resumedImageTaskIdsRef.current.has(taskId)) return;
        resumedImageTaskIdsRef.current.add(taskId);
        void resumeCanvasImageTask(node.id, taskId);
      });
  }, [nodes, projectLoaded, resumeCanvasImageTask]);

  useEffect(() => {
    if (!projectLoaded) return;
    if (viewportSaveTimerRef.current)
      clearTimeout(viewportSaveTimerRef.current);
    viewportSaveTimerRef.current = setTimeout(() => {
      updateProject(projectId, { viewport: viewportRef.current });
      viewportSaveTimerRef.current = null;
    }, 500);
  }, [projectId, projectLoaded, updateProject, viewport]);

  useEffect(() => {
    if (!projectLoaded) return;
    return () => {
      if (!viewportSaveTimerRef.current) return;
      clearTimeout(viewportSaveTimerRef.current);
      viewportSaveTimerRef.current = null;
      updateProject(projectId, { viewport: viewportRef.current });
    };
  }, [projectId, projectLoaded, updateProject]);

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    connectionsRef.current = connections;
    selectedNodeIdsRef.current = selectedNodeIds;
    selectedConnectionIdRef.current = selectedConnectionId;
    dialogNodeIdRef.current = dialogNodeId;
    previewNodeIdRef.current = previewNodeId;
    hoveredNodeIdRef.current = hoveredNodeId;
    toolbarNodeIdRef.current = toolbarNodeId;
    viewportRef.current = viewport;
    connectingParamsRef.current = connectingParams;
    connectionTargetNodeIdRef.current = connectionTargetNodeId;
    connectionTargetHandleIdRef.current = connectionTargetHandleId;
    pendingConnectionCreateRef.current = pendingConnectionCreate;
  }, [
    nodes,
    connections,
    selectedNodeIds,
    selectedConnectionId,
    dialogNodeId,
    previewNodeId,
    hoveredNodeId,
    toolbarNodeId,
    viewport,
    connectingParams,
    connectionTargetNodeId,
    connectionTargetHandleId,
    pendingConnectionCreate,
  ]);

  useLayoutEffect(() => {
    selectionBoxRef.current = selectionBox;
  }, [selectionBox]);

  useLayoutEffect(() => {
    if (!projectLoaded) return;
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
      if (
        !didInitialCenterRef.current &&
        shouldCenterInitialViewportRef.current
      ) {
        setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
      }
      didInitialCenterRef.current = true;
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [projectId, projectLoaded]);

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const currentViewport = viewportRef.current;
    const localX = clientX - (rect?.left || 0);
    const localY = clientY - (rect?.top || 0);

    return {
      x: (localX - currentViewport.x) / currentViewport.k,
      y: (localY - currentViewport.y) / currentViewport.k,
    };
  }, []);

  const getCanvasCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    return screenToCanvas(
      (rect?.left || 0) + (rect?.width || size.width) / 2,
      (rect?.top || 0) + (rect?.height || size.height) / 2,
    );
  }, [screenToCanvas, size.height, size.width]);

  const setConnecting = useCallback((next: ConnectionHandle | null) => {
    connectingParamsRef.current = next;
    setConnectingParams(next);
    if (!next) {
      connectionTargetNodeIdRef.current = null;
      connectionTargetHandleIdRef.current = null;
      setConnectionTargetNodeId(null);
      setConnectionTargetHandleId(null);
    }
  }, []);

  const keepNodeToolbar = useCallback(
    (nodeId: string) => {
      if (HIDE_CANVAS_NODE_HOVER_TOOLBAR) return;
      if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
      if (toolbarHideTimerRef.current) {
        clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = null;
      }
      setToolbarNodeId(nodeId);
    },
    [nodeImageSettingsOpen],
  );

  const hideNodeToolbar = useCallback(() => {
    if (HIDE_CANVAS_NODE_HOVER_TOOLBAR) {
      setToolbarNodeId(null);
      return;
    }
    if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
    toolbarHideTimerRef.current = setTimeout(() => {
      setToolbarNodeId(null);
      toolbarHideTimerRef.current = null;
    }, 120);
  }, []);

  const retainCanvasImageNodesById = useCallback((nodeIds: string[]) => {
    const targetIds = new Set(nodeIds);
    const storageKeys = nodesRef.current
      .filter(
        (node) =>
          targetIds.has(node.id) &&
          node.type === CanvasNodeType.Image &&
          Boolean(node.metadata?.storageKey),
      )
      .map((node) => node.metadata?.storageKey)
      .filter((key): key is string => Boolean(key));
    if (storageKeys.length) void setStoredImagesRetained(storageKeys, true);
    if (!storageKeys.length) return;
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (
          !targetIds.has(node.id) ||
          node.type !== CanvasNodeType.Image ||
          !node.metadata?.storageKey ||
          node.metadata.retained
        )
          return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, retained: true } };
      });
      return changed ? next : prev;
    });
  }, []);

  const connectNodes = useCallback(
    (
      current: ConnectionHandle,
      targetNodeId: string,
      targetHandleId?: string | null,
    ) => {
      if (current.nodeId === targetNodeId) return;

      const connection = normalizeConnection(
        current.nodeId,
        targetNodeId,
        nodesRef.current,
        current.handleType,
        current.handleId,
        targetHandleId || undefined,
      );
      if (!connection) {
        message.warning("配置节点之间不能连接");
        return;
      }
      const { fromNodeId, toNodeId, fromHandleId, toHandleId } = connection;
      const exists = connectionsRef.current.some(
        (conn) =>
          conn.fromNodeId === fromNodeId &&
          conn.toNodeId === toNodeId &&
          (conn.fromHandleId || "") === (fromHandleId || "") &&
          (conn.toHandleId || "") === (toHandleId || ""),
      );
      if (!exists) {
        const source = nodesRef.current.find((node) => node.id === fromNodeId);
        const target = nodesRef.current.find((node) => node.id === toNodeId);
        const referencePlan =
          source?.type === CanvasNodeType.Image &&
          target?.type === CanvasNodeType.Video &&
          target.metadata?.seedanceWorkflowRole === "placeholder"
            ? planSeedance2ReferenceConnection({
                connection,
                placeholderId: target.id,
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                visibleSlotCount: seedance2VisibleReferenceSlotCount({
                  width: target.width,
                  height: target.height,
                  boundSlotCount: seedance2ManualReferenceHighestSlotIndex(target),
                  isExpanded: target.metadata?.seedanceReferenceSlotsExpanded === true,
                  orientation: seedance2ReferenceSlotOrientation(target),
                }),
              })
            : null;
        if (referencePlan && !referencePlan.accepted) {
          message.warning("参考图槽位已满");
          return;
        }
        const nextConnection: CanvasConnection = {
          id: nanoid(),
          fromNodeId,
          toNodeId,
          fromHandleId,
          toHandleId,
        };
        if (referencePlan?.accepted) {
          nextConnection.referenceSequence = referencePlan.referenceSequence;
        }
        if (
          source?.type === CanvasNodeType.Image &&
          target?.type === CanvasNodeType.StoryDirector &&
          String(toHandleId || "").startsWith("story:")
        ) {
          retainCanvasImageNodesById([fromNodeId]);
        }
        setConnections((prev) => [
          ...prev,
          nextConnection,
        ]);
      }
      setContextMenu(null);
    },
    [message, retainCanvasImageNodesById],
  );

  const createConnectedNode = useCallback(
    (
      type:
        | CanvasNodeType.Image
        | CanvasNodeType.Text
        | CanvasNodeType.Config
        | CanvasNodeType.Video
        | CanvasNodeType.Audio,
      pending: PendingConnectionCreate,
    ) => {
      const sourceNode = nodesRef.current.find(
        (node) => node.id === pending.connection.nodeId,
      );
      const metadata =
        type === CanvasNodeType.Config
          ? {
              model: effectiveConfig.imageModel || "",
              size: effectiveConfig.size,
              quality: effectiveConfig.quality,
              count: getGenerationCount(
                effectiveConfig.canvasImageCount || effectiveConfig.count,
              ),
            }
          : undefined;
      const seedance2SourceImageRatio =
        sourceNode?.type === CanvasNodeType.Image
          ? (() => {
              const width = Number(
                sourceNode.metadata?.naturalWidth || sourceNode.width,
              );
              const height = Number(
                sourceNode.metadata?.naturalHeight || sourceNode.height,
              );
              return seedance2RatioFromNaturalSize(width, height, "9:16");
            })()
          : undefined;
      const newNode =
        type === CanvasNodeType.Video
          ? createSeedance2VideoPlaceholderNode(pending.position, {
              sourceImageNode:
                sourceNode?.type === CanvasNodeType.Image
                  ? sourceNode
                  : undefined,
              ratio:
                seedance2SourceImageRatio ||
                resolveSeedance2CreationRatio(effectiveConfig.size),
              duration: effectiveConfig.videoSeconds || "5",
            })
          : createCanvasNode(type, pending.position, metadata);
      const connection = normalizeConnection(
        pending.connection.nodeId,
        newNode.id,
        [...nodesRef.current, newNode],
        pending.connection.handleType,
        pending.connection.handleId,
      );
      if (!connection) {
        message.warning("配置节点之间不能连接");
        return;
      }
      setNodes((prev) => [...prev, newNode]);
      setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
      setSelectedNodeIds(new Set([newNode.id]));
      setSelectedConnectionId(null);
      if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio)
        setDialogNodeId(newNode.id);
      setPendingConnectionCreate(null);
      setConnecting(null);
    },
    [
      effectiveConfig.canvasImageCount,
      effectiveConfig.count,
      effectiveConfig.quality,
      effectiveConfig.size,
      effectiveConfig.videoSeconds,
      message,
      setConnecting,
    ],
  );

  const cancelPendingConnectionCreate = useCallback(() => {
    setPendingConnectionCreate(null);
    setConnecting(null);
  }, [setConnecting]);

  const getConnectionDropTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      current: ConnectionHandle,
    ): ConnectionDropTarget => {
      const world = screenToCanvas(clientX, clientY);
      const scale = Math.max(viewportRef.current.k, 0.05);
      const padding = CONNECTION_NODE_HIT_PADDING / scale;
      const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
      let isNearNode = false;
      let bestNodeId: string | null = null;
      let bestHandleId: string | null = null;
      let bestPriority = Number.POSITIVE_INFINITY;

      [...nodesRef.current]
        .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
        .reverse()
        .forEach((node) => {
          const anchor = getConnectionTargetAnchor(
            node,
            current,
            world.x,
            world.y,
          );
          const dx = world.x - anchor.x;
          const dy = world.y - anchor.y;
          const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
          const hitsInside =
            world.x >= node.position.x &&
            world.x <= node.position.x + node.width &&
            world.y >= node.position.y &&
            world.y <= node.position.y + node.height;
          const hitsExpanded =
            world.x >= node.position.x - padding &&
            world.x <= node.position.x + node.width + padding &&
            world.y >= node.position.y - padding &&
            world.y <= node.position.y + node.height + padding;

          if (!hitsHandle && !hitsInside && !hitsExpanded) return;
          isNearNode = true;
          if (
            node.id === current.nodeId ||
            !normalizeConnection(
              current.nodeId,
              node.id,
              nodesRef.current,
              current.handleType,
              current.handleId,
              anchor.handleId,
            )
          )
            return;

          const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
          if (priority < bestPriority) {
            bestNodeId = node.id;
            bestHandleId = anchor.handleId ?? null;
            bestPriority = priority;
          }
        });

      return { nodeId: bestNodeId, handleId: bestHandleId, isNearNode };
    },
    [screenToCanvas],
  );

  const visibleNodes = useMemo(() => {
    const padding = 280;
    const rect = containerRef.current?.getBoundingClientRect();
    const width = rect?.width || size.width;
    const height = rect?.height || size.height;
    const viewLeft = -viewport.x / viewport.k - padding;
    const viewTop = -viewport.y / viewport.k - padding;
    const viewRight = viewLeft + width / viewport.k + padding * 2;
    const viewBottom = viewTop + height / viewport.k + padding * 2;

    return nodes.filter(
      (node) =>
        !isHiddenBatchChild(node, nodes, collapsingBatchIds) &&
        node.position.x + node.width > viewLeft &&
        node.position.x < viewRight &&
        node.position.y + node.height > viewTop &&
        node.position.y < viewBottom,
    );
  }, [
    collapsingBatchIds,
    nodes,
    size.height,
    size.width,
    viewport.k,
    viewport.x,
    viewport.y,
  ]);

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const seedance2StoryDirectorSourceByNodeId = useMemo(() => {
    const map = new Map<string, CanvasNodeData | undefined>();
    nodes.forEach((node) => {
      if (node.type === CanvasNodeType.Seedance2Workflow) {
        map.set(
          node.id,
          findSeedance2StoryDirectorSource(node, nodes, connections),
        );
      }
    });
    return map;
  }, [nodes, connections]);
  const connectionTargetNode = connectionTargetNodeId
    ? nodeById.get(connectionTargetNodeId)
    : undefined;
  const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
  const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
  const layerEditNode = layerEditNodeId
    ? nodeById.get(layerEditNodeId) || null
    : null;
  const maskEditNode = maskEditNodeId
    ? nodeById.get(maskEditNodeId) || null
    : null;
  const seedance2FaceEditNode = seedance2FaceEditNodeId
    ? nodeById.get(seedance2FaceEditNodeId) || null
    : null;
  useEffect(() => {
    let cancelled = false;
    if (!seedance2FaceEditNode) {
      setSeedance2FaceEditDataUrl("");
      return;
    }

    const storageKey = seedance2FaceEditNode.metadata?.storageKey;
    const directSource = seedance2FaceEditFallbackSource(seedance2FaceEditNode.metadata);
    if (!storageKey && !directSource) {
      setSeedance2FaceEditDataUrl("");
      return;
    }

    void resolveImageUrl(storageKey, directSource).then((resolved) => {
      if (cancelled) return;
      setSeedance2FaceEditDataUrl(resolved || "");
    });

    return () => {
      cancelled = true;
    };
  }, [
    seedance2FaceEditNode?.id,
    seedance2FaceEditNode?.metadata?.backendRel,
    seedance2FaceEditNode?.metadata?.backendUrl,
    seedance2FaceEditNode?.metadata?.content,
    seedance2FaceEditNode?.metadata?.storageKey,
  ]);
  const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
  const upscaleNode = upscaleNodeId
    ? nodeById.get(upscaleNodeId) || null
    : null;
  const superResolveNode = superResolveNodeId
    ? nodeById.get(superResolveNodeId) || null
    : null;
  const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
  const previewNode = previewNodeId
    ? nodeById.get(previewNodeId) || null
    : null;
  const selectedImageNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          selectedNodeIds.has(node.id) &&
          node.type === CanvasNodeType.Image &&
          Boolean(node.metadata?.content),
      ),
    [nodes, selectedNodeIds],
  );
  const replacePickerNode = replacePickerNodeId
    ? nodeById.get(replacePickerNodeId) || null
    : null;
  const replacePickerImages = useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.type === CanvasNodeType.Image &&
          node.id !== replacePickerNodeId &&
          Boolean(node.metadata?.content),
      ),
    [nodes, replacePickerNodeId],
  );
  const compareNodes = useMemo(
    () =>
      compareNodeIds
        .map((id) => nodeById.get(id))
        .filter((node): node is CanvasNodeData =>
          Boolean(node?.metadata?.content),
        ),
    [compareNodeIds, nodeById],
  );
  const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
  const activeNodeId = hasMultipleSelectedNodes
    ? null
    : hoveredNodeId ||
      (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
  const batchChildCountById = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((node) => {
      if (node.metadata?.isBatchRoot)
        map.set(
          node.id,
          Math.max(
            node.metadata.count || 0,
            (node.metadata.batchChildIds?.length || 0) + 1,
          ),
        );
    });
    return map;
  }, [nodes]);
  const batchMotionById = useMemo(() => {
    const map = new Map<string, { x: number; y: number; index: number }>();
    nodes.forEach((node) => {
      const rootId = node.metadata?.batchRootId;
      if (!rootId) return;
      const root = nodeById.get(rootId);
      const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
      const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
      const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
      map.set(node.id, {
        x: stackX - node.position.x,
        y: stackY - node.position.y,
        index: Math.max(index, 0),
      });
    });
    return map;
  }, [nodeById, nodes]);
  const relatedHighlight = useMemo(() => {
    const nodeIds = new Set<string>();
    const connectionIds = new Set<string>();

    if (!activeNodeId) return { nodeIds, connectionIds };

    nodeIds.add(activeNodeId);
    connections.forEach((connection) => {
      if (
        connection.fromNodeId !== activeNodeId &&
        connection.toNodeId !== activeNodeId
      )
        return;
      connectionIds.add(connection.id);
      nodeIds.add(connection.fromNodeId);
      nodeIds.add(connection.toNodeId);
    });

    return { nodeIds, connectionIds };
  }, [activeNodeId, connections]);

  const configInputsById = useMemo(() => {
    const map = new Map<string, NodeGenerationInput[]>();
    nodes.forEach((node) => {
      if (node.type !== CanvasNodeType.Config) return;
      map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
    });
    return map;
  }, [connections, nodes]);
  const resourceContextNodeId = dialogNodeId || activeNodeId;
  const canvasResourceReferences = useMemo(
    () =>
      buildCanvasResourceReferences(nodes, connections, resourceContextNodeId),
    [connections, nodes, resourceContextNodeId],
  );
  const resourceReferenceByNodeId = useMemo(
    () =>
      new Map(
        canvasResourceReferences.map((reference) => [
          reference.nodeId,
          reference,
        ]),
      ),
    [canvasResourceReferences],
  );
  const mentionReferencesByNodeId = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof buildNodeMentionReferences>
    >();
    nodes.forEach((node) =>
      map.set(node.id, buildNodeMentionReferences(node, nodes, connections)),
    );
    return map;
  }, [connections, nodes]);
  const seedance2AspectRatioSourcesByNodeId = useMemo(
    () => buildSeedance2AspectRatioSources(nodes, connections),
    [connections, nodes],
  );
  const seedance2ReferenceSlotsByNodeId = useMemo(() => {
    const slotsByNodeId = new Map<string, Seedance2ResolvedReferenceSlot[]>();
    nodes.forEach((node) => {
      if (
        node.type !== CanvasNodeType.Video ||
        node.metadata?.seedanceWorkflowRole !== "placeholder"
      ) {
        return;
      }
      slotsByNodeId.set(
        node.id,
        resolveSeedance2ReferenceSlots({
          placeholder: node,
          nodes,
          connections,
          visibleSlotCount: seedance2VisibleReferenceSlotCount({
            width: node.width,
            height: node.height,
            boundSlotCount: seedance2ManualReferenceHighestSlotIndex(node),
            isExpanded: node.metadata?.seedanceReferenceSlotsExpanded === true,
            orientation: seedance2ReferenceSlotOrientation(node),
          }),
        }),
      );
    });
    return slotsByNodeId;
  }, [connections, nodes]);
  useEffect(() => {
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (
          node.type !== CanvasNodeType.Video ||
          node.metadata?.content ||
          node.metadata?.seedanceWorkflowRole !== "placeholder" ||
          node.metadata?.seedanceInheritSourceRatio === false ||
          node.metadata?.seedanceRatioTouched
        )
          return node;
        const sources = seedance2AspectRatioSourcesByNodeId.get(node.id);
        const previousSourceAspectRatio = node.metadata?.seedanceSourceAspectRatio;
        const sourceRatio = sources?.currentShotRatio || sources?.upstreamNaturalRatio;
        const hasExpandedManualFrame = node.metadata?.seedanceReferenceSlotsExpanded === true;
        const manualMinimumHeight = hasExpandedManualFrame
          ? Number(node.metadata?.seedanceManualMinHeight || 0)
          : 0;
        if (!sourceRatio) {
          if (previousSourceAspectRatio === undefined) return node;
          const defaultRatio = normalizeSeedance2AspectRatio(SEEDANCE2_CREATION_FALLBACK_RATIO);
          const defaultSize = seedance2PlaceholderSize(defaultRatio);
          changed = true;
          return {
            ...node,
            width: hasExpandedManualFrame
              ? Math.max(defaultSize.width, node.width)
              : defaultSize.width,
            height: Math.max(defaultSize.height, manualMinimumHeight),
            metadata: {
              ...node.metadata,
              seedanceSourceAspectRatio: undefined,
              seedanceRatio: node.metadata?.seedanceRatio === previousSourceAspectRatio ? defaultRatio : node.metadata?.seedanceRatio,
              size: node.metadata?.size === previousSourceAspectRatio ? defaultRatio : node.metadata?.size,
            },
          };
        }
        const ratio = normalizeSeedance2AspectRatio(sourceRatio);
        const size = seedance2PlaceholderSize(ratio);
        if (
          node.metadata?.seedanceRatio === ratio &&
          node.metadata?.seedanceSourceAspectRatio === ratio &&
          node.metadata?.size === ratio &&
          node.width >= size.width &&
          node.height >= size.height
        )
          return node;
        changed = true;
        return {
          ...node,
          width: hasExpandedManualFrame
            ? Math.max(size.width, node.width)
            : size.width,
          height: Math.max(size.height, manualMinimumHeight),
          metadata: {
            ...node.metadata,
            seedanceRatio: ratio,
            seedanceSourceAspectRatio: ratio,
            size: ratio,
          },
        };
      });
      return changed ? next : prev;
    });
  }, [seedance2AspectRatioSourcesByNodeId]);
  const createNode = useCallback(
    (type: CanvasNodeType, position?: Position) => {
      const targetPosition = position || getCanvasCenter();
      const configMetadata =
        type === CanvasNodeType.Config
          ? {
              model: effectiveConfig.imageModel || effectiveConfig.model,
              size: effectiveConfig.size,
              quality: effectiveConfig.quality,
              count: getGenerationCount(
                effectiveConfig.canvasImageCount || effectiveConfig.count,
              ),
            }
          : undefined;
      const newNode =
        type === CanvasNodeType.Video
          ? createSeedance2VideoPlaceholderNode(targetPosition, {
              ratio: resolveSeedance2CreationRatio(effectiveConfig.size),
              duration: effectiveConfig.videoSeconds || "5",
            })
          : createCanvasNode(type, targetPosition, configMetadata);

      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeIds(new Set([newNode.id]));
      setSelectedConnectionId(null);
      if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio)
        setDialogNodeId(newNode.id);
    },
    [
      effectiveConfig.canvasImageCount,
      effectiveConfig.count,
      effectiveConfig.imageModel,
      effectiveConfig.model,
      effectiveConfig.quality,
      effectiveConfig.size,
      effectiveConfig.videoSeconds,
      getCanvasCenter,
    ],
  );


  const createSeedance2Workflow = useCallback(
    (position?: Position) => {
      const center = position || getCanvasCenter();
      const origin = { x: center.x - NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow].width / 2, y: center.y - NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow].height / 2 };
      const built = buildSeedance2WorkflowNodes({
        origin,
        shotCount: 4,
        mode: "slice",
        model: selectableModelsByCapability(effectiveConfig, "video").includes(effectiveConfig.videoModel)
          ? effectiveConfig.videoModel
          : "",
        ratio: resolveSeedance2CreationRatio(effectiveConfig.size),
        duration: "10",
        resolution: normalizeSeedance2Resolution(effectiveConfig.vquality),
        generateCount: 1,
        apiProvider: "local",
        apiEndpoint: LOCAL_SEEDANCE2_API_ENDPOINT,
      });
      const controller = built.nodes[0];
      setNodes((prev) => [...prev, controller]);
      setConnections((prev) => prev);
      setSelectedNodeIds(new Set([controller.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(controller.id);
    },
    [effectiveConfig.size, effectiveConfig.vquality, getCanvasCenter],
  );

  const rebuildSeedance2Placeholders = useCallback(async (workflowNode: CanvasNodeData) => {
    const meta = workflowNode.metadata || {};
    const storyDirector = findSeedance2StoryDirectorSource(
      workflowNode,
      nodesRef.current,
      connectionsRef.current,
    );
    const creationRatio = resolveSeedance2WorkflowRatio({
      storedRatio: meta.seedanceRatio || meta.size,
      selection: resolveSeedance2WorkflowRatioSelection({
        selection: meta.seedanceRatioSelection,
        inheritSourceRatio: meta.seedanceInheritSourceRatio,
        ratioTouched: meta.seedanceRatioTouched,
      }),
      upstreamRatio: storyDirector?.metadata?.storyAspectRatio,
    });
    const storyShotCount = storyDirector?.metadata?.storyShots?.length || 0;
    if (storyDirector && storyShotCount > 0) {
        const promptTextModel = resolveSeedance2PromptTextModel(workflowNode, effectiveConfig);
        const textConfig = {
          ...buildGenerationConfig(effectiveConfig, workflowNode, "text"),
          textModel: promptTextModel,
          model: promptTextModel,
        };
        if (!isAiConfigReady(textConfig, promptTextModel)) {
          openConfigDialog(true);
          return;
        }

        setRunningNodeId(workflowNode.id);
        try {
          const rewriteTemplate = typeof meta.seedancePromptTemplate === "string" ? meta.seedancePromptTemplate : "";
          const rewriteInput = collectSeedance2StoryRewriteInput({
            storyDirector,
            nodes: nodesRef.current,
            connections: connectionsRef.current,
            template: rewriteTemplate,
          });
          const rewriteInputWithModel = {
            ...rewriteInput,
            rewriteModel: promptTextModel,
          };
          const fingerprint = JSON.stringify({
            story: rewriteInputWithModel.story,
            template: rewriteInputWithModel.template,
            rewriteModel: rewriteInputWithModel.rewriteModel,
            shots: rewriteInputWithModel.shots.map((shot) => ({
              shotId: shot.shotId,
              shotIndex: shot.shotIndex,
              sourceImageNodeId: shot.sourceImageNodeId,
              sourceImage: shot.sourceImage,
              currentPrompt: shot.currentPrompt,
            })),
          });
          let run = seedance2RewriteRunCache.get(workflowNode.id);
          if (!run || run.fingerprint !== fingerprint) {
            const rewrittenShots = await rewriteSeedance2BatchPrompts(
              rewriteInputWithModel,
              async (request) => {
                const content: ChatCompletionMessage["content"] = [
                  { type: "text", text: request.contentText },
                  ...request.shots.flatMap((shot) => {
                    const imageParts: Array<
                      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
                    > = [
                      {
                        type: "text",
                        text: `上游分镜图片 ${shot.shotId}（第 ${shot.shotIndex} 镜，${shot.title}）`,
                      },
                    ];
                    if (shot.sourceImage) {
                      imageParts.push({
                        type: "image_url",
                        image_url: { url: shot.sourceImage },
                      });
                    }
                    return imageParts;
                  }),
                ];
                return (
                  (await requestImageQuestion(
                    {
                      ...textConfig,
                      textModel: request.model,
                      model: request.model,
                    },
                    [{ role: "user", content }],
                    undefined,
                    { stream: false },
                  )) || ""
                );
              },
            );
            const built = buildVersionedStoryDirectorSlicePlaceholders({
              workflowNode,
              storyDirector,
              nodes: nodesRef.current,
              connections: connectionsRef.current,
              rewrittenShots,
              rewriteModel: promptTextModel,
              rewriteTemplate,
            });
            run = {
              fingerprint,
              rewrittenShots,
              built,
              nextShotIndex: Math.min(...rewrittenShots.map((shot) => shot.shotIndex)),
            };
            seedance2RewriteRunCache.set(workflowNode.id, run);
          }

          const orderedCreatedNodes = [...run.built.createdNodes].sort(
            (left, right) =>
              Number(left.metadata?.seedanceStoryShotIndex || 0) -
              Number(right.metadata?.seedanceStoryShotIndex || 0),
          );
          const sequential = createSeedance2SequentialPlaceholderRun({
            rewrittenShots: orderedCreatedNodes.map((node) => ({
              shotId: String(node.metadata?.seedanceStoryShotId || node.id),
              shotIndex: Number(node.metadata?.seedanceStoryShotIndex || 0),
              prompt: String(node.metadata?.prompt || ""),
            })),
            startShotIndex: run.nextShotIndex,
            appendShot: (shot) => {
              const node = orderedCreatedNodes.find(
                (candidate) =>
                  Number(candidate.metadata?.seedanceStoryShotIndex || 0) === shot.shotIndex,
              );
              if (!node) throw new Error(`Seedance2 第 ${shot.shotIndex} 镜占位框不存在`);
              if (nodesRef.current.some((candidate) => candidate.id === node.id)) return;
              const nextNodes = [...nodesRef.current, node];
              const nextConnections = [
                ...connectionsRef.current,
                ...run.built.createdConnections.filter((connection) => connection.toNodeId === node.id),
              ];
              nodesRef.current = nextNodes;
              connectionsRef.current = nextConnections;
              setNodes(nextNodes);
              setConnections(nextConnections);
              persistCanvasSnapshot(nextNodes, nextConnections);
              run.nextShotIndex = shot.shotIndex + 1;
            },
          });
          if (sequential.error) throw sequential.error;
          seedance2RewriteRunCache.delete(workflowNode.id);
          setSelectedNodeIds(new Set([workflowNode.id]));
          setSelectedConnectionId(null);
          message.success(`已创建 Seedance2 视频占位框 V${run.built.setVersion}`);
        } catch (error) {
          const errorDetails = error instanceof Error ? error.message : "Seedance2 整批提示词改写失败";
          message.error(errorDetails);
        } finally {
          setRunningNodeId(null);
        }
        return;
    }
    const existingPlaceholderIds = new Set(nodesRef.current.filter((node) => node.metadata?.seedanceWorkflowNodeId === workflowNode.id).map((node) => node.id));
    const built = buildSeedance2WorkflowNodes({
      origin: workflowNode.position,
      shotCount: meta.seedanceShotCount || 4,
      mode: "slice",
      model: selectableModelsByCapability(effectiveConfig, "video").includes(String(meta.seedanceModel || meta.model || "").trim())
        ? String(meta.seedanceModel || meta.model || "").trim()
        : "",
      ratio: creationRatio,
      duration: meta.seedanceDuration || meta.seconds || "10",
      resolution: normalizeSeedance2Resolution(meta.seedanceResolution || meta.vquality),
      generateCount: 1,
      apiProvider: "local",
      apiEndpoint: meta.seedanceApiEndpoint || LOCAL_SEEDANCE2_API_ENDPOINT,
      referenceOrder: Array.isArray(meta.seedanceReferenceOrder)
        ? meta.seedanceReferenceOrder
        : undefined,
    });
    const placeholders = built.nodes.slice(1).map((node) => {
      const size = seedance2PlaceholderSize(
        node.metadata?.seedanceRatio || node.metadata?.size || SEEDANCE2_CREATION_FALLBACK_RATIO,
      );
      return {
        ...node,
        width: size.width,
        height: size.height,
        metadata: { ...node.metadata, seedanceWorkflowNodeId: workflowNode.id },
      };
    });
    const nextConnections = placeholders.map((node, index) => ({
      id: `conn-seedance2-${workflowNode.id}-${index + 1}-${Date.now()}`,
      fromNodeId: workflowNode.id,
      toNodeId: node.id,
    }));
    setNodes((prev) => [...prev.filter((node) => node.metadata?.seedanceWorkflowNodeId !== workflowNode.id), ...placeholders]);
    setConnections((prev) => [...prev.filter((connection) => connection.fromNodeId !== workflowNode.id && !existingPlaceholderIds.has(connection.fromNodeId) && !existingPlaceholderIds.has(connection.toNodeId)), ...nextConnections]);
    setSelectedNodeIds(new Set([workflowNode.id]));
    setSelectedConnectionId(null);
  }, [effectiveConfig, message, openConfigDialog, persistCanvasSnapshot]);

  const deleteNodes = useCallback(
    (ids: Set<string>) => {
      if (!ids.size) return;
      const allIds = new Set(ids);
      nodesRef.current.forEach((node) => {
        if (ids.has(node.id))
          node.metadata?.batchChildIds?.forEach((childId) =>
            allIds.add(childId),
          );
      });
      setNodes((prev) => {
        const next = prev.filter((node) => !allIds.has(node.id));
        return next.map((node) => {
          const childIds = node.metadata?.batchChildIds?.filter(
            (childId) => !allIds.has(childId),
          );
          if (
            !node.metadata?.isBatchRoot ||
            childIds?.length === node.metadata.batchChildIds?.length
          )
            return node;
          const primaryImageId = childIds?.includes(
            node.metadata.primaryImageId || "",
          )
            ? node.metadata.primaryImageId
            : childIds?.[0];
          const primaryNode = next.find((item) => item.id === primaryImageId);
          return {
            ...node,
            metadata: {
              ...node.metadata,
              batchChildIds: childIds,
              primaryImageId,
              content: primaryNode?.metadata?.content || node.metadata.content,
              naturalWidth:
                primaryNode?.metadata?.naturalWidth ||
                node.metadata.naturalWidth,
              naturalHeight:
                primaryNode?.metadata?.naturalHeight ||
                node.metadata.naturalHeight,
            },
          };
        });
      });
      setConnections((prev) =>
        prev.filter(
          (conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId),
        ),
      );
      setSelectedNodeIds(new Set());
      setSelectedConnectionId(null);
      setHoveredNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setToolbarNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setDialogNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setEditingNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setInfoNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setCropNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setMaskEditNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setAngleNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setPreviewNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setRunningNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setContextMenu((current) =>
        current?.type === "node" && allIds.has(current.nodeId) ? null : current,
      );
      cleanupCanvasFiles({
        projectId,
        nodes: nodesRef.current.filter((node) => !allIds.has(node.id)),
        chatSessions,
      });
    },
    [chatSessions, cleanupCanvasFiles, projectId],
  );

  const deleteConnection = useCallback((connectionId: string) => {
    setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
    setSelectedConnectionId((current) =>
      current === connectionId ? null : current,
    );
    setContextMenu((current) =>
      current?.type === "connection" && current.connectionId === connectionId
        ? null
        : current,
    );
  }, []);

  const deleteActiveCanvasSelection = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;
    if (selectedIds.size) {
      deleteNodes(new Set(selectedIds));
      return true;
    }

    const activeNodeId =
      dialogNodeIdRef.current ||
      toolbarNodeIdRef.current ||
      hoveredNodeIdRef.current;
    if (
      activeNodeId &&
      nodesRef.current.some((node) => node.id === activeNodeId)
    ) {
      deleteNodes(new Set([activeNodeId]));
      return true;
    }

    const connectionId = selectedConnectionIdRef.current;
    if (connectionId) {
      deleteConnection(connectionId);
      return true;
    }

    return false;
  }, [deleteConnection, deleteNodes]);

  const deselectCanvas = useCallback(() => {
    cancelPendingConnectionCreate();
    setSelectedNodeIds(new Set());
    setSelectedConnectionId(null);
    setContextMenu(null);
    setSelectionBox(null);
    setHoveredNodeId(null);
    setToolbarNodeId(null);
    setDialogNodeId(null);
    setEditingNodeId(null);
  }, [cancelPendingConnectionCreate]);

  const clearCanvas = useCallback(() => {
    setNodes([]);
    setConnections([]);
    setInfoNodeId(null);
    setCropNodeId(null);
    setMaskEditNodeId(null);
    setAngleNodeId(null);
    setPreviewNodeId(null);
    setRunningNodeId(null);
    deselectCanvas();
    setClearConfirmOpen(false);
    cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
  }, [cleanupCanvasFiles, deselectCanvas, projectId]);

  const duplicateNode = useCallback((nodeId: string) => {
    const source = nodesRef.current.find((node) => node.id === nodeId);
    if (!source) return;

    const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: CanvasNodeData = {
      ...source,
      id,
      title: `${source.title} Copy`,
      position: { x: source.position.x + 36, y: source.position.y + 36 },
    };

    setNodes((prev) => [...prev, next]);
    setSelectedNodeIds(new Set([id]));
    setSelectedConnectionId(null);
    setDialogNodeId(id);
  }, []);

  const copySelectedNodes = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;
    if (!selectedIds.size) return;

    const copiedNodes = nodesRef.current
      .filter((node) => selectedIds.has(node.id))
      .map((node) => ({
        ...node,
        position: { ...node.position },
        metadata: node.metadata ? { ...node.metadata } : undefined,
      }));

    if (!copiedNodes.length) return;

    clipboardRef.current = {
      nodes: copiedNodes,
      connections: connectionsRef.current
        .filter(
          (connection) =>
            selectedIds.has(connection.fromNodeId) &&
            selectedIds.has(connection.toNodeId),
        )
        .map((connection) => ({ ...connection })),
    };
  }, []);

  const pasteCopiedNodes = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard?.nodes.length) return false;

    const center = getCanvasCenter();
    const bounds = clipboard.nodes.reduce(
      (acc, node) => ({
        left: Math.min(acc.left, node.position.x),
        top: Math.min(acc.top, node.position.y),
        right: Math.max(acc.right, node.position.x + node.width),
        bottom: Math.max(acc.bottom, node.position.y + node.height),
      }),
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const dx = center.x - (bounds.left + bounds.right) / 2;
    const dy = center.y - (bounds.top + bounds.bottom) / 2;
    const idMap = new Map<string, string>();
    const nextNodes = clipboard.nodes.map((node, index) => {
      const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
        position: {
          x: node.position.x + dx,
          y: node.position.y + dy,
        },
        metadata: node.metadata ? { ...node.metadata } : undefined,
      };
    });

    const nextConnections = clipboard.connections.flatMap(
      (connection, index) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        if (!fromNodeId || !toNodeId) return [];
        return [
          {
            ...connection,
            id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            fromNodeId,
            toNodeId,
          },
        ];
      },
    );

    setNodes((prev) => [...prev, ...nextNodes]);
    setConnections((prev) => [...prev, ...nextConnections]);
    setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
    setSelectedConnectionId(null);
    setContextMenu(null);
    setDialogNodeId(nextNodes[0]?.id || null);
    return true;
  }, [getCanvasCenter]);

  const duplicateSelectedNodes = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;
    if (!selectedIds.size) return false;

    const copiedNodes = nodesRef.current
      .filter((node) => selectedIds.has(node.id))
      .map((node) => ({
        ...node,
        position: { ...node.position },
        metadata: node.metadata ? { ...node.metadata } : undefined,
      }));
    if (!copiedNodes.length) return false;

    const idMap = new Map<string, string>();
    const nextNodes = copiedNodes.map((node, index) => {
      const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
        position: { x: node.position.x + 36, y: node.position.y + 36 },
      };
    });

    const nextConnections = connectionsRef.current.flatMap(
      (connection, index) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        if (!fromNodeId || !toNodeId) return [];
        return [
          {
            ...connection,
            id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            fromNodeId,
            toNodeId,
          },
        ];
      },
    );

    setNodes((prev) => [...prev, ...nextNodes]);
    setConnections((prev) => [...prev, ...nextConnections]);
    setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
    setSelectedConnectionId(null);
    setContextMenu(null);
    setDialogNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
    return true;
  }, []);

  const resetViewport = useCallback(() => {
    setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
    setContextMenu(null);
  }, [size.height, size.width]);

  const setZoomScale = useCallback(
    (scale: number) => {
      const nextScale = Math.min(Math.max(scale, 0.05), 5);
      setViewport((prev) => ({
        x: size.width / 2 - ((size.width / 2 - prev.x) / prev.k) * nextScale,
        y: size.height / 2 - ((size.height / 2 - prev.y) / prev.k) * nextScale,
        k: nextScale,
      }));
      setContextMenu(null);
    },
    [size.height, size.width],
  );

  const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
    if (historyCommitTimerRef.current) {
      clearTimeout(historyCommitTimerRef.current);
      historyCommitTimerRef.current = null;
    }
    applyingHistoryRef.current = true;
    setNodes(entry.nodes);
    setConnections(entry.connections);
    setChatSessions(entry.chatSessions);
    setActiveChatId(entry.activeChatId);
    setBackgroundMode(entry.backgroundMode);
    setShowImageInfo(entry.showImageInfo);
    setSelectedNodeIds(new Set());
    setSelectedConnectionId(null);
    setContextMenu(null);
    setTimeout(() => {
      lastHistoryRef.current = entry;
      applyingHistoryRef.current = false;
      setHistoryState({
        canUndo: historyRef.current.past.length > 0,
        canRedo: historyRef.current.future.length > 0,
      });
    });
  }, []);

  const undoCanvas = useCallback(() => {
    const previous = historyRef.current.past.pop();
    const current = lastHistoryRef.current;
    if (!previous || !current) return;
    historyRef.current.future.push(current);
    applyHistory(previous);
  }, [applyHistory]);

  const redoCanvas = useCallback(() => {
    const next = historyRef.current.future.pop();
    const current = lastHistoryRef.current;
    if (!next || !current) return;
    historyRef.current.past.push(current);
    applyHistory(next);
  }, [applyHistory]);

  const createAndOpenProject = useCallback(() => {
    const id = createProject(
      `无限画布 ${useCanvasStore.getState().projects.length + 1}`,
    );
    router.push(`/canvas/workspace?id=${encodeURIComponent(id)}`);
  }, [createProject, router]);

  const deleteCurrentProject = useCallback(() => {
    deleteProjects([projectId]);
    cleanupAssetImages();
    router.push("/canvas/home");
  }, [cleanupAssetImages, deleteProjects, projectId, router]);

  const handleCanvasMouseDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      setContextMenu(null);
      if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
      if (event.button !== 0) return;

      if (!event.ctrlKey && !event.metaKey) {
        setSelectionBox(null);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        return;
      }

      const world = screenToCanvas(event.clientX, event.clientY);
      const nextSelectionBox = {
        startWorldX: world.x,
        startWorldY: world.y,
        currentWorldX: world.x,
        currentWorldY: world.y,
        additive: event.shiftKey,
        initialSelectedNodeIds: event.shiftKey
          ? Array.from(selectedNodeIdsRef.current)
          : [],
      };
      selectionBoxRef.current = nextSelectionBox;
      setSelectionBox(nextSelectionBox);
      if (!event.shiftKey) {
        setSelectedNodeIds(new Set());
      }

      setSelectedConnectionId(null);
    },
    [cancelPendingConnectionCreate, screenToCanvas],
  );

  const handleNodeMouseDown = useCallback(
    (event: ReactMouseEvent, nodeId: string) => {
      event.stopPropagation();
      setContextMenu(null);
      setHoveredNodeId(null);
      setToolbarNodeId(null);
      setSelectedConnectionId(null);

      const currentSelected = selectedNodeIdsRef.current;
      const currentNodes = nodesRef.current;
      const nextSelected = new Set(currentSelected);

      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        if (nextSelected.has(nodeId)) {
          nextSelected.delete(nodeId);
        } else {
          nextSelected.add(nodeId);
        }
      } else if (!nextSelected.has(nodeId)) {
        nextSelected.clear();
        nextSelected.add(nodeId);
      }

      setSelectedNodeIds(nextSelected);
      const dragIds = new Set(nextSelected);
      currentNodes.forEach((node) => {
        if (
          nextSelected.has(node.id) &&
          node.type === CanvasNodeType.Image &&
          node.metadata?.isBatchRoot
        ) {
          node.metadata?.batchChildIds?.forEach((childId) =>
            dragIds.add(childId),
          );
        }
      });
      dragRef.current = {
        isDraggingNode: true,
        hasMoved: false,
        startX: event.clientX,
        startY: event.clientY,
        initialSelectedNodes: currentNodes
          .filter((node) => dragIds.has(node.id))
          .map((node) => ({
            id: node.id,
            x: node.position.x,
            y: node.position.y,
          })),
      };
      historyPausedRef.current = true;
      nodeDraggingRef.current = true;
      setIsNodeDragging(true);
    },
    [],
  );

  const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!dragRef.current.isDraggingNode) return;

    const wasClick =
      !dragRef.current.hasMoved &&
      dragRef.current.initialSelectedNodes.length === 1;
    const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
    const currentViewport = viewportRef.current;
    const dx =
      clientX == null
        ? 0
        : (clientX - dragRef.current.startX) / currentViewport.k;
    const dy =
      clientY == null
        ? 0
        : (clientY - dragRef.current.startY) / currentViewport.k;
    const initialPositions = dragRef.current.initialSelectedNodes;

    historyPausedRef.current = false;
    nodeDraggingRef.current = false;
    setIsNodeDragging(false);
    if (dragRef.current.hasMoved && clientX != null && clientY != null) {
      setNodes((prev) =>
        prev.map((node) => {
          const initial = initialPositions.find((item) => item.id === node.id);
          if (!initial) return node;
          return {
            ...node,
            position: { x: initial.x + dx, y: initial.y + dy },
          };
        }),
      );
    }

    dragRef.current.isDraggingNode = false;
    dragRef.current.hasMoved = false;
    dragRef.current.initialSelectedNodes = [];
    if (wasClick && clickedNodeId) {
      const clickedNode = nodesRef.current.find(
        (node) => node.id === clickedNodeId,
      );
      if (clickedNode?.type === CanvasNodeType.Text) {
        setDialogNodeId((current) =>
          current === clickedNodeId ? current : null,
        );
      } else {
        setDialogNodeId(clickedNodeId);
      }
    }
  }, []);

  const handleGlobalMouseMove = useCallback(
    (event: MouseEvent) => {
      const currentViewport = viewportRef.current;

      if (dragRef.current.isDraggingNode) {
        const dx = (event.clientX - dragRef.current.startX) / currentViewport.k;
        const dy = (event.clientY - dragRef.current.startY) / currentViewport.k;
        const initialPositions = dragRef.current.initialSelectedNodes;
        if (
          Math.abs(event.clientX - dragRef.current.startX) > 3 ||
          Math.abs(event.clientY - dragRef.current.startY) > 3
        ) {
          dragRef.current.hasMoved = true;
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setNodes((prev) =>
            prev.map((node) => {
              const initial = initialPositions.find(
                (item) => item.id === node.id,
              );
              return initial
                ? {
                    ...node,
                    position: { x: initial.x + dx, y: initial.y + dy },
                  }
                : node;
            }),
          );
          rafRef.current = null;
        });
        return;
      }

      if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
        const dropTarget = getConnectionDropTarget(
          event.clientX,
          event.clientY,
          connectingParamsRef.current,
        );
        connectionTargetNodeIdRef.current = dropTarget.nodeId;
        connectionTargetHandleIdRef.current = dropTarget.handleId || null;
        setConnectionTargetNodeId(dropTarget.nodeId);
        setConnectionTargetHandleId(dropTarget.handleId || null);
        setMouseWorld(screenToCanvas(event.clientX, event.clientY));
      }
    },
    [finishNodeDrag, getConnectionDropTarget, screenToCanvas],
  );

  const handleGlobalPointerMove = useCallback(
    (event: PointerEvent) => {
      const currentSelection = selectionBoxRef.current;
      if (!currentSelection) return;

      if (event.buttons === 0) {
        selectionBoxRef.current = null;
        setSelectionBox(null);
        return;
      }

      const world = screenToCanvas(event.clientX, event.clientY);
      const rectX = Math.min(currentSelection.startWorldX, world.x);
      const rectY = Math.min(currentSelection.startWorldY, world.y);
      const rectW = Math.abs(world.x - currentSelection.startWorldX);
      const rectH = Math.abs(world.y - currentSelection.startWorldY);
      const nextSelected = new Set<string>(
        currentSelection.additive
          ? currentSelection.initialSelectedNodeIds
          : [],
      );

      nodesRef.current
        .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
        .forEach((node) => {
          const intersects =
            rectX < node.position.x + node.width &&
            rectX + rectW > node.position.x &&
            rectY < node.position.y + node.height &&
            rectY + rectH > node.position.y;

          if (intersects) nextSelected.add(node.id);
        });

      const nextSelectionBox = {
        ...currentSelection,
        currentWorldX: world.x,
        currentWorldY: world.y,
      };
      selectionBoxRef.current = nextSelectionBox;
      setSelectionBox(nextSelectionBox);
      setSelectedNodeIds(nextSelected);
    },
    [screenToCanvas],
  );

  const handleGlobalMouseUp = useCallback(
    (event: MouseEvent) => {
      finishNodeDrag(event.clientX, event.clientY);

      selectionBoxRef.current = null;
      setSelectionBox(null);

      if (pendingConnectionCreateRef.current) return;

      const currentConnection = connectingParamsRef.current;
      if (currentConnection) {
        const dropTarget = getConnectionDropTarget(
          event.clientX,
          event.clientY,
          currentConnection,
        );
        if (dropTarget.nodeId) {
          connectNodes(
            currentConnection,
            dropTarget.nodeId,
            dropTarget.handleId,
          );
          setConnecting(null);
        } else if (dropTarget.isNearNode) {
          setConnecting(null);
        } else {
          setMouseWorld(screenToCanvas(event.clientX, event.clientY));
          setPendingConnectionCreate({
            connection: currentConnection,
            position: screenToCanvas(event.clientX, event.clientY),
          });
        }
      }
    },
    [
      connectNodes,
      finishNodeDrag,
      getConnectionDropTarget,
      screenToCanvas,
      setConnecting,
    ],
  );

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) =>
      finishNodeDrag(event.clientX, event.clientY);
    const cancelNodeDrag = () => finishNodeDrag();
    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cancelNodeDrag);
    window.addEventListener("blur", cancelNodeDrag);
    window.addEventListener("pointermove", handleGlobalPointerMove);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", cancelNodeDrag);
      window.removeEventListener("blur", cancelNodeDrag);
      window.removeEventListener("pointermove", handleGlobalPointerMove);
    };
  }, [
    finishNodeDrag,
    handleGlobalMouseMove,
    handleGlobalMouseUp,
    handleGlobalPointerMove,
  ]);

  const createImageFileNode = useCallback(
    async (file: File, position: Position) => {
      const image = await uploadImage(file, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
      const size = imageNodeSize(image.width, image.height);
      const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newNode: CanvasNodeData = {
        id,
        type: CanvasNodeType.Image,
        title: file.name,
        position: {
          x: position.x - size.width / 2,
          y: position.y - size.height / 2,
        },
        width: size.width,
        height: size.height,
        metadata: {
          ...imageMetadata(image),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          retained: true,
        },
      };

      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(id);
      return id;
    },
    [],
  );


  const createImageNodeFromVideoFrame = useCallback(
    async (
      sourceNode: CanvasNodeData,
      frame: { dataUrl: string; width: number; height: number; currentTime: number },
    ) => {
      try {
        const uploaded = await uploadImage(frame.dataUrl);
        const naturalWidth = frame.width || uploaded.width || sourceNode.width;
        const naturalHeight = frame.height || uploaded.height || sourceNode.height;
        const aspectRatio = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
        const frameHeight = Math.max(1, Math.round(sourceNode.height));
        const frameWidth = Math.max(1, Math.round(frameHeight * aspectRatio));
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
          id,
          type: CanvasNodeType.Image,
          title: `\u9009\u5e27 ${formatVideoFrameTime(frame.currentTime)}`,
          position: {
            x: sourceNode.position.x + sourceNode.width + 48,
            y: sourceNode.position.y,
          },
          width: frameWidth,
          height: frameHeight,
          metadata: {
            ...imageMetadata(uploaded),
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            source: "seedance2-frame-extraction",
            prompt: sourceNode.metadata?.prompt,
            naturalWidth,
            naturalHeight,
            seedanceWorkflowRole: "extracted-frame",
            seedanceSourceResultNodeId: sourceNode.id,
            seedanceFrameTimeSeconds: frame.currentTime,
            seedanceFrameIndex: Math.max(0, Math.round((frame.currentTime || 0) * 24)),
            freeResize: false,
            isBatchRoot: undefined,
            batchRootId: undefined,
            batchChildIds: undefined,
            batchUsesReferenceImages: undefined,
            primaryImageId: undefined,
            imageBatchExpanded: undefined,
          },
        };

        setNodes((prev) => [...prev, newNode]);
        setConnections((prev) => [
          ...prev,
          { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: id },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        message.success("\u5df2\u9009\u53d6\u5f53\u524d\u5e27");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "\u9009\u5e27\u5931\u8d25");
      }
    },
    [message],
  );

  const createVideoFileNode = useCallback(
    async (file: File, position: Position) => {
      const video = await uploadMediaFile(file, "video");
      const size = fitNodeSize(
        video.width || 1280,
        video.height || 720,
        VIDEO_NODE_MAX_WIDTH,
        VIDEO_NODE_MAX_HEIGHT,
      );
      const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setNodes((prev) => [
        ...prev,
        {
          id,
          type: CanvasNodeType.Video,
          title: file.name,
          position: {
            x: position.x - size.width / 2,
            y: position.y - size.height / 2,
          },
          width: size.width,
          height: size.height,
          metadata: videoMetadata(video),
        },
      ]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(id);
      return id;
    },
    [],
  );

  const createAudioFileNode = useCallback(
    async (file: File, position: Position) => {
      const audio = await uploadMediaFile(file, "audio");
      const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
      const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setNodes((prev) => [
        ...prev,
        {
          id,
          type: CanvasNodeType.Audio,
          title: file.name,
          position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
          },
          width: spec.width,
          height: spec.height,
          metadata: audioMetadata(audio),
        },
      ]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(null);
      return id;
    },
    [],
  );

  const createCanvasFileNode = useCallback(
    (file: File, position: Position) => {
      if (isAudioFile(file)) return createAudioFileNode(file, position);
      if (file.type.startsWith("video/"))
        return createVideoFileNode(file, position);
      return createImageFileNode(file, position);
    },
    [createAudioFileNode, createImageFileNode, createVideoFileNode],
  );

  const createCanvasFileNodes = useCallback(
    async (files: File[], anchorPosition: Position) => {
      const supportedFiles = files.filter(isSupportedCanvasFile);
      if (!supportedFiles.length) return;

      const createdIds: string[] = [];
      for (let index = 0; index < supportedFiles.length; index += 1) {
        const file = supportedFiles[index];
        try {
          const id = await createCanvasFileNode(
            file,
            getGridPosition(anchorPosition, index, supportedFiles.length),
          );
          createdIds.push(id);
        } catch (error) {
          message.error(
            `${file.name} 添加失败：${error instanceof Error ? error.message : "请重试"}`,
          );
        }
      }

      if (createdIds.length > 1) {
        setSelectedNodeIds(new Set(createdIds));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        message.success(`已添加 ${createdIds.length} 个素材`);
      }
    },
    [createCanvasFileNode, message],
  );

  const replaceNodeWithImage = useCallback(
    (
      nodeId: string,
      title: string,
      uploaded: UploadedImage,
      extraMetadata: Partial<CanvasNodeMetadata> = {},
    ) => {
      const nextSize = imageNodeSize(uploaded.width, uploaded.height);
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const center = {
            x: node.position.x + node.width / 2,
            y: node.position.y + node.height / 2,
          };
          return {
            ...node,
            type: CanvasNodeType.Image,
            title,
            position: {
              x: center.x - nextSize.width / 2,
              y: center.y - nextSize.height / 2,
            },
            width: nextSize.width,
            height: nextSize.height,
            metadata: {
              ...node.metadata,
              ...imageMetadata(uploaded),
              ...extraMetadata,
              imageSequenceNumber:
                node.metadata?.imageSequenceNumber ??
                nextImageSequenceNumber(nodesRef.current),
              errorDetails: undefined,
              freeResize: false,
              isBatchRoot: undefined,
              batchRootId: undefined,
              batchChildIds: undefined,
              batchUsesReferenceImages: undefined,
              generationType: undefined,
              model: undefined,
              size: undefined,
              quality: undefined,
              count: undefined,
              references: undefined,
              primaryImageId: undefined,
              imageBatchExpanded: undefined,
            },
          };
        }),
      );
      setSelectedNodeIds(new Set([nodeId]));
      setSelectedConnectionId(null);
      setDialogNodeId(nodeId);
    },
    [],
  );

  const replaceNodeFromCanvasImage = useCallback(
    async (targetNode: CanvasNodeData, sourceNode: CanvasNodeData) => {
      if (!sourceNode.metadata?.content)
        return message.warning("这张图片暂无可用内容");
      try {
        const dataUrl = await imageToDataUrl({
          url: sourceNode.metadata.content,
          storageKey: sourceNode.metadata.storageKey,
        });
        if (!dataUrl) return message.error("读取画布图片失败");
        const uploaded = await uploadImage(dataUrl);
        replaceNodeWithImage(
          targetNode.id,
          sourceNode.title || "画布图片",
          uploaded,
          {
            prompt: sourceNode.metadata.prompt,
            source: "canvas-image",
          },
        );
        setReplacePickerNodeId(null);
        message.success("已用画布图片替换");
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "替换失败，请重试",
        );
      }
    },
    [message, replaceNodeWithImage],
  );

  const copyNodeImageToSystemClipboard = useCallback(
    async (
      node: CanvasNodeData,
      successMessage = "已复制图片，可粘贴到微信等应用",
    ) => {
      try {
        if (node.type !== CanvasNodeType.Image || !node.metadata?.content)
          throw new Error("图片内容为空");
        const dataUrl = await imageToDataUrl({
          url: node.metadata.content,
          storageKey: node.metadata.storageKey,
        });
        if (!dataUrl) throw new Error("读取图片失败");
        if (
          navigator.clipboard?.write &&
          typeof ClipboardItem !== "undefined"
        ) {
          const blob = await clipboardImageBlob(dataUrl);
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type || "image/png"]: blob }),
          ]);
          message.success(successMessage);
          return true;
        }
        if (copyImageWithLegacySelection(dataUrl)) {
          message.success("已用兼容模式复制图片，可尝试粘贴到微信");
          return true;
        }
        throw new Error(
          window.isSecureContext
            ? "当前浏览器不支持复制图片"
            : "当前地址不是 HTTPS，浏览器限制复制图片",
        );
      } catch (error) {
        const fallbackText = window.isSecureContext
          ? ""
          : "；请用 HTTPS 打开，或先下载图片再发送";
        message.error(
          `${error instanceof Error ? error.message : "复制图片失败"}${fallbackText}`,
        );
        return true;
      }
    },
    [message],
  );

  const createTextNodeFromClipboard = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const node = {
        ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), {
          content: trimmed,
          status: NODE_STATUS_SUCCESS,
        }),
        title: trimmed.slice(0, 32) || "剪切板文本",
      };

      setNodes((prev) => [...prev, node]);
      setSelectedNodeIds(new Set([node.id]));
      setSelectedConnectionId(null);
      setContextMenu(null);
      setDialogNodeId(node.id);
      return true;
    },
    [getCanvasCenter],
  );

  const pasteSystemClipboard = useCallback(async () => {
    if (!navigator.clipboard) return;

    const items = await navigator.clipboard.read();
    const imageItem = items.find((item) =>
      item.types.some((type) => type.startsWith("image/")),
    );
    if (imageItem) {
      const imageType = imageItem.types.find((type) =>
        type.startsWith("image/"),
      );
      if (!imageType) return;
      const blob = await imageItem.getType(imageType);
      const file = new File([blob], "clipboard-image.png", { type: imageType });
      void createImageFileNode(file, getCanvasCenter());
      message.success("已从剪切板添加图片");
      return;
    }

    const text = await navigator.clipboard.readText();
    if (createTextNodeFromClipboard(text))
      message.success("已从剪切板添加文本");
  }, [
    createImageFileNode,
    createTextNodeFromClipboard,
    getCanvasCenter,
    message,
  ]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")
      )
        return;
      const file = Array.from(event.clipboardData?.files || []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        void createImageFileNode(file, getCanvasCenter()).then(() =>
          message.success("已从剪切板添加图片"),
        );
        return;
      }
      const text = event.clipboardData?.getData("text/plain") || "";
      if (createTextNodeFromClipboard(text)) {
        event.preventDefault();
        message.success("已从剪切板添加文本");
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    createImageFileNode,
    createTextNodeFromClipboard,
    getCanvasCenter,
    message,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target instanceof Element ? event.target : null;
      const isEditableTarget =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        Boolean(target?.closest("[contenteditable='true']"));
      if (isEditableTarget) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteActiveCanvasSelection();
        return;
      }

      if (target?.closest("[data-canvas-no-zoom]")) return;

      const key = event.key.toLowerCase();
      const isModifierShortcut = event.metaKey || event.ctrlKey;

      if (isModifierShortcut && !event.altKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvas();
        else undoCanvas();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "y") {
        event.preventDefault();
        redoCanvas();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "a") {
        event.preventDefault();
        setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "c") {
        if (event.repeat) return;
        event.preventDefault();
        const selectedId =
          selectedNodeIdsRef.current.size === 1
            ? Array.from(selectedNodeIdsRef.current)[0]
            : null;
        const selectedNode = selectedId
          ? nodesRef.current.find((node) => node.id === selectedId)
          : null;
        if (
          selectedNode?.type === CanvasNodeType.Image &&
          selectedNode.metadata?.content
        ) {
          copySelectedNodes();
          void copyNodeImageToSystemClipboard(selectedNode);
          return;
        }
        copySelectedNodes();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "v") {
        if (pasteCopiedNodes()) event.preventDefault();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "d") {
        event.preventDefault();
        duplicateSelectedNodes();
        return;
      }

      if (isModifierShortcut && !event.altKey && (key === "=" || key === "+")) {
        event.preventDefault();
        setZoomScale(viewportRef.current.k * 1.15);
        return;
      }

      if (isModifierShortcut && !event.altKey && (key === "-" || key === "_")) {
        event.preventDefault();
        setZoomScale(viewportRef.current.k / 1.15);
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "0") {
        event.preventDefault();
        resetViewport();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "n") {
        event.preventDefault();
        createAndOpenProject();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "o") {
        event.preventDefault();
        uploadTargetRef.current = null;
        imageInputRef.current?.click();
        return;
      }

      if (
        !event.repeat &&
        event.code === "Space" &&
        !event.altKey &&
        !isModifierShortcut &&
        !event.shiftKey
      ) {
        if (previewNodeIdRef.current) {
          event.preventDefault();
          setPreviewNodeId(null);
          return;
        }
        const selectedId =
          selectedNodeIdsRef.current.size === 1
            ? Array.from(selectedNodeIdsRef.current)[0]
            : null;
        const selectedNode = selectedId
          ? nodesRef.current.find((node) => node.id === selectedId)
          : null;
        if (
          selectedNode?.type === CanvasNodeType.Image &&
          selectedNode.metadata?.content
        ) {
          event.preventDefault();
          setPreviewNodeId(selectedNode.id);
          return;
        }
      }

      if (
        (key === "?" || (key === "/" && event.shiftKey)) &&
        !event.altKey &&
        !isModifierShortcut
      ) {
        event.preventDefault();
        window.dispatchEvent(new Event(CANVAS_SHORTCUT_EVENT));
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setConnecting(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setPendingConnectionCreate(null);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;

      if (key === "i") {
        event.preventDefault();
        createNode(CanvasNodeType.Image);
        return;
      }

      if (key === "t") {
        event.preventDefault();
        createNode(CanvasNodeType.Text);
        return;
      }

      if (key === "g") {
        event.preventDefault();
        createNode(CanvasNodeType.Config);
        return;
      }

      if (key === "v") {
        event.preventDefault();
        createNode(CanvasNodeType.Video);
        return;
      }

      if (key === "a") {
        event.preventDefault();
        createNode(CanvasNodeType.Audio);
        return;
      }

      if (key === "u") {
        event.preventDefault();
        uploadTargetRef.current = null;
        imageInputRef.current?.click();
        return;
      }

      if (key === "l") {
        event.preventDefault();
        setAssetPickerTab("library");
        setAssetPickerOpen(true);
        return;
      }

      if (key === "b") {
        event.preventDefault();
        setAssetPickerTab("my-assets");
        setAssetPickerOpen(true);
        return;
      }

      if (key === "m") {
        event.preventDefault();
        setIsMiniMapOpen((value) => !value);
        return;
      }

      if (key === "h") {
        event.preventDefault();
        setAssistantMounted(true);
        setAssistantCollapsed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    copySelectedNodes,
    createAndOpenProject,
    createNode,
    deleteActiveCanvasSelection,
    duplicateSelectedNodes,
    pasteCopiedNodes,
    pasteSystemClipboard,
    redoCanvas,
    resetViewport,
    setConnecting,
    setZoomScale,
    undoCanvas,
  ]);

  const handleConnectStart = useCallback(
    (
      event: ReactMouseEvent,
      nodeId: string,
      handleType: "source" | "target",
      handleId?: string,
    ) => {
      event.stopPropagation();
      setMouseWorld(screenToCanvas(event.clientX, event.clientY));
      setConnecting({ nodeId, handleType, handleId });
      connectionTargetNodeIdRef.current = null;
      connectionTargetHandleIdRef.current = null;
      setConnectionTargetNodeId(null);
      setConnectionTargetHandleId(null);
      setSelectedConnectionId(null);
    },
    [screenToCanvas, setConnecting],
  );

  const handleNodeResize = useCallback(
    (
      nodeId: string,
      width: number,
      height: number,
      position?: Position,
      options: { persistSeedanceManualMinHeight?: boolean; seedanceRatio?: "9:16" | "16:9" } = {},
    ) => {
      const updateNodes =
        options.persistSeedanceManualMinHeight === false
          ? applyPersistedNodes
          : setNodes;
      updateNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder") {
            const nextRatio = normalizeSeedance2AspectRatio(
              options.seedanceRatio ||
                node.metadata?.seedanceRatio ||
                node.metadata?.seedanceSourceAspectRatio ||
                node.metadata?.size ||
                "9:16",
            );
            const stableSize = seedance2PlaceholderSize(nextRatio);
            const currentRatio = normalizeSeedance2AspectRatio(
              node.metadata?.seedanceRatio || node.metadata?.size || "9:16",
            );
            const ratioChanged = Boolean(options.seedanceRatio) && nextRatio !== currentRatio;
            const baseMetadata =
              options.persistSeedanceManualMinHeight === false
                ? node.metadata?.seedanceReferenceSlotsExpanded === true
                  ? node.metadata
                  : {
                      ...node.metadata,
                      seedanceManualMinHeight: undefined,
                    }
                : {
                    ...node.metadata,
                    seedanceManualMinHeight: Math.max(stableSize.height, height),
                    seedanceReferenceSlotsExpanded:
                      width > stableSize.width || height > stableSize.height,
                  };
            const nextMetadata = options.seedanceRatio
              ? {
                  ...baseMetadata,
                  seedanceRatio: nextRatio,
                  size: nextRatio,
                  ...(ratioChanged
                    ? {
                        seedanceRatioTouched: true,
                        seedanceInheritSourceRatio: false,
                      }
                    : {}),
                }
              : baseMetadata;
            return {
              ...node,
              width: Math.max(stableSize.width, width),
              height: Math.max(stableSize.height, height),
              position: position || node.position,
              metadata: nextMetadata,
            };
          }
          return { ...node, width, height, position: position || node.position };
        }),
      );
    },
    [applyPersistedNodes],
  );

  useEffect(() => {
    const handleImageWheelResize = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          nodeId?: unknown;
          width?: unknown;
          height?: unknown;
          position?: unknown;
        }>
      ).detail;
      if (
        !detail ||
        typeof detail.nodeId !== "string" ||
        typeof detail.width !== "number" ||
        typeof detail.height !== "number"
      )
        return;
      const position = detail.position as Position | undefined;
      handleNodeResize(detail.nodeId, detail.width, detail.height, position);
    };
    window.addEventListener(
      "canvas:image-wheel-resize",
      handleImageWheelResize,
    );
    return () =>
      window.removeEventListener(
        "canvas:image-wheel-resize",
        handleImageWheelResize,
      );
  }, [handleNodeResize]);

  const toggleNodeFreeResize = useCallback((nodeId: string) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        const freeResize = !node.metadata?.freeResize;
        if (freeResize || node.type !== CanvasNodeType.Image)
          return { ...node, metadata: { ...node.metadata, freeResize } };
        const ratio =
          (node.metadata?.naturalWidth || node.width) /
          (node.metadata?.naturalHeight || node.height || 1);
        const height = node.width / ratio;
        return {
          ...node,
          height,
          position: {
            x: node.position.x,
            y: node.position.y + node.height / 2 - height / 2,
          },
          metadata: { ...node.metadata, freeResize },
        };
      }),
    );
  }, []);

  const handleNodeContentChange = useCallback(
    (nodeId: string, content: string) => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder") {
            return { ...node, metadata: { ...node.metadata, ...seedance2UserPromptPatch(content) } };
          }
          return { ...node, metadata: { ...node.metadata, content } };
        }),
      );
    },
    [],
  );

  const handleNodeMetadataChange = useCallback(
    (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const nextMetadata = { ...node.metadata, ...patch };
          if (patch.seedanceReferenceSlotBindings) {
            nextMetadata.seedanceReferenceSlotBindings = {
              ...(node.metadata?.seedanceReferenceSlotBindings || {}),
              ...(patch.seedanceReferenceSlotBindings || {}),
            };
          }
          if (patch.seedanceReferenceExtraSlotBindings) {
            nextMetadata.seedanceReferenceExtraSlotBindings = {
              ...(node.metadata?.seedanceReferenceExtraSlotBindings || {}),
              ...(patch.seedanceReferenceExtraSlotBindings || {}),
            };
          }
          const changesPlaceholderRatio =
            node.type === CanvasNodeType.Video &&
            !nextMetadata.content &&
            nextMetadata.seedanceWorkflowRole === "placeholder" &&
            (typeof patch.seedanceRatio === "string" ||
              typeof patch.size === "string");
          if (!changesPlaceholderRatio) {
            return { ...node, metadata: nextMetadata };
          }
          const ratio = normalizeSeedance2AspectRatio(
            nextMetadata.seedanceRatio || nextMetadata.size || "16:9",
          );
          const size = seedance2PlaceholderSize(ratio);
          const hasExpandedManualFrame = nextMetadata.seedanceReferenceSlotsExpanded === true;
          const manualMinimumHeight = hasExpandedManualFrame
            ? Number(nextMetadata.seedanceManualMinHeight || 0)
            : 0;
          const nextWidth = hasExpandedManualFrame
            ? Math.max(size.width, node.width)
            : size.width;
          const nextHeight = Math.max(size.height, manualMinimumHeight);
          return {
            ...node,
            position: {
              x: node.position.x + node.width / 2 - nextWidth / 2,
              y: node.position.y + node.height / 2 - nextHeight / 2,
            },
            width: nextWidth,
            height: nextHeight,
            metadata: {
              ...nextMetadata,
              seedanceRatio: ratio,
              size: ratio,
            },
          };
        }),
      );
    },
    [],
  );

  const toggleBatchExpanded = useCallback((nodeId: string) => {
    const isExpanded = Boolean(
      nodesRef.current.find((node) => node.id === nodeId)?.metadata
        ?.imageBatchExpanded,
    );
    if (isExpanded) {
      setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
      window.setTimeout(() => {
        setCollapsingBatchIds((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }, 320);
    } else {
      setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
      window.setTimeout(() => {
        setOpeningBatchIds((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }, 260);
    }
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          metadata: {
            ...node.metadata,
            imageBatchExpanded: !node.metadata?.imageBatchExpanded,
          },
        };
      }),
    );
  }, []);

  const setBatchPrimary = useCallback((child: CanvasNodeData) => {
    const rootId = child.metadata?.batchRootId;
    if (!rootId || !child.metadata?.content) return;
    setNodes((prev) =>
      prev.map((node) =>
        node.id === rootId
          ? {
              ...node,
              width: child.width,
              height: child.height,
              metadata: {
                ...node.metadata,
                content: child.metadata?.content,
                primaryImageId: child.id,
                naturalWidth: child.metadata?.naturalWidth,
                naturalHeight: child.metadata?.naturalHeight,
                freeResize: child.metadata?.freeResize,
              },
            }
          : node,
      ),
    );
  }, []);

  const openTextEditor = useCallback((node: CanvasNodeData) => {
    if (node.type !== CanvasNodeType.Text) return;
    setSelectedNodeIds(new Set([node.id]));
    setSelectedConnectionId(null);
    setDialogNodeId(node.id);
    setEditingNodeId(node.id);
    setEditRequestNonce((value) => value + 1);
  }, []);

  const handleNodePromptChange = useCallback(
    (nodeId: string, prompt: string) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? { ...node, metadata: { ...node.metadata, prompt } }
            : node,
        ),
      );
    },
    [],
  );

  const createPromptNodeForGeneration = useCallback(
    (prompt: string, position: Position): CanvasNodeData => {
      const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
      return {
        ...createCanvasNode(
          CanvasNodeType.Text,
          {
            x: position.x + textConfig.width / 2,
            y: position.y + textConfig.height / 2,
          },
          {
            content: prompt,
            prompt,
            status: NODE_STATUS_SUCCESS,
            fontSize: 14,
          },
        ),
        title: "提示词",
      };
    },
    [],
  );

  const handleConfigNodeChange = useCallback(
    (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId ? applyNodeConfigPatch(node, patch) : node,
        ),
      );
    },
    [],
  );

  const downloadNodeImage = useCallback((node: CanvasNodeData) => {
    if (
      (node.type !== CanvasNodeType.Image &&
        node.type !== CanvasNodeType.Video &&
        node.type !== CanvasNodeType.Audio) ||
      !node.metadata?.content
    )
      return;
    if (node.type === CanvasNodeType.Image && node.metadata.storageKey)
      void touchStoredImages([node.metadata.storageKey]);
    saveAs(
      node.metadata.content,
      `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(node.metadata.content)}`,
    );
  }, []);

  const touchNodeImage = useCallback((node: CanvasNodeData) => {
    if (node.type === CanvasNodeType.Image && node.metadata?.storageKey) {
      void touchStoredImages([node.metadata.storageKey]);
    }
  }, []);

  const previewNodeImage = useCallback(
    (node: CanvasNodeData) => {
      touchNodeImage(node);
      setPreviewNodeId(node.id);
    },
    [touchNodeImage],
  );

  const toggleRetainNodeImage = useCallback(
    async (node: CanvasNodeData) => {
      if (node.type !== CanvasNodeType.Image || !node.metadata?.storageKey)
        return;
      const retained = !node.metadata.retained;
      await setStoredImagesRetained([node.metadata.storageKey], retained);
      setNodes((prev) =>
        prev.map((item) =>
          item.id === node.id
            ? { ...item, metadata: { ...item.metadata, retained } }
            : item,
        ),
      );
      message.success(
        retained
          ? "已长期保留这张图片"
          : "已取消长期保留，之后按 7 天未使用自动删除",
      );
    },
    [message],
  );

  const saveNodeAsset = useCallback(
    async (node: CanvasNodeData) => {
      if (node.type === CanvasNodeType.Text) {
        const content = node.metadata?.content?.trim();
        if (!content) return message.error("没有可保存的文本");
        addAsset({
          kind: "text",
          title: node.metadata?.prompt?.slice(0, 24) || "画布文本",
          coverUrl: "",
          tags: [],
          source: "Canvas",
          data: { content },
          metadata: { source: "canvas", nodeId: node.id },
        });
        message.success("已加入我的素材");
        return;
      }
      if (node.type === CanvasNodeType.Video) {
        if (!node.metadata?.content) return message.error("没有可保存的视频");
        addAsset({
          kind: "video",
          title: node.metadata?.prompt?.slice(0, 24) || "画布视频",
          coverUrl: "",
          tags: [],
          source: "Canvas",
          data: {
            url: node.metadata.content,
            storageKey: node.metadata.storageKey,
            width: node.width,
            height: node.height,
            bytes: node.metadata.bytes || 0,
            mimeType: node.metadata.mimeType || "video/mp4",
          },
          metadata: {
            source: "canvas",
            nodeId: node.id,
            prompt: node.metadata?.prompt,
          },
        });
        message.success("已加入我的素材");
        return;
      }
      if (!node.metadata?.content) return message.error("没有可保存的图片");
      if (node.metadata.storageKey) {
        await setStoredImagesRetained([node.metadata.storageKey], true);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? { ...item, metadata: { ...item.metadata, retained: true } }
              : item,
          ),
        );
      }
      const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
      addAsset({
        kind: "image",
        title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
        coverUrl: node.metadata.content,
        tags: [],
        source: "Canvas",
        data: {
          dataUrl,
          storageKey: node.metadata.storageKey,
          width: node.metadata.naturalWidth || node.width,
          height: node.metadata.naturalHeight || node.height,
          bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
          mimeType: node.metadata.mimeType || "image/png",
        },
        metadata: {
          source: "canvas",
          nodeId: node.id,
          prompt: node.metadata?.prompt,
        },
      });
      message.success("已加入我的素材");
    },
    [addAsset, message],
  );

  const downloadSelectedImages = useCallback(
    (targetNodes = selectedImageNodes) => {
      if (!targetNodes.length) return message.warning("请先选择图片");
      targetNodes.forEach((node, index) => {
        if (!node.metadata?.content) return;
        window.setTimeout(() => downloadNodeImage(node), index * 120);
      });
      message.success(`已开始下载 ${targetNodes.length} 张图片`);
    },
    [downloadNodeImage, message, selectedImageNodes],
  );

  const saveSelectedImages = useCallback(
    async (targetNodes = selectedImageNodes) => {
      if (!targetNodes.length) return message.warning("请先选择图片");
      for (const node of targetNodes) {
        await saveNodeAsset(node);
      }
      message.success(`已处理 ${targetNodes.length} 张图片`);
    },
    [message, saveNodeAsset, selectedImageNodes],
  );

  const retainSelectedImages = useCallback(
    async (targetNodes = selectedImageNodes) => {
      const keys = targetNodes
        .map((node) => node.metadata?.storageKey)
        .filter((key): key is string => Boolean(key));
      if (!keys.length) return message.warning("选中图片没有可保留的本地文件");
      await setStoredImagesRetained(keys, true);
      const ids = new Set(targetNodes.map((node) => node.id));
      setNodes((prev) =>
        prev.map((node) =>
          ids.has(node.id)
            ? { ...node, metadata: { ...node.metadata, retained: true } }
            : node,
        ),
      );
      message.success(`已保留 ${keys.length} 张图片`);
    },
    [message, selectedImageNodes],
  );

  const openImageCompare = useCallback(
    (targetNodes = selectedImageNodes) => {
      if (targetNodes.length < 2) {
        message.warning("请至少选择 2 张图片进行对比");
        return;
      }
      setCompareNodeIds(targetNodes.map((node) => node.id));
      setComparePrimaryNodeId(targetNodes[0]?.id || null);
      setContextMenu(null);
    },
    [message, selectedImageNodes],
  );

  const alignSelectedImages = useCallback(
    (mode: "left" | "center" | "right") => {
      const targets = selectedImageNodes;
      if (targets.length < 2) return message.warning("请至少选择 2 张图片");
      const value =
        mode === "left"
          ? Math.min(...targets.map((node) => node.position.x))
          : mode === "right"
            ? Math.max(...targets.map((node) => node.position.x + node.width))
            : targets.reduce(
                (sum, node) => sum + node.position.x + node.width / 2,
                0,
              ) / targets.length;
      const ids = new Set(targets.map((node) => node.id));
      setNodes((prev) =>
        prev.map((node) => {
          if (!ids.has(node.id)) return node;
          const x =
            mode === "left"
              ? value
              : mode === "right"
                ? value - node.width
                : value - node.width / 2;
          return { ...node, position: { ...node.position, x } };
        }),
      );
    },
    [message, selectedImageNodes],
  );

  const distributeSelectedImages = useCallback(
    (axis: "x" | "y") => {
      const targets = selectedImageNodes
        .slice()
        .sort((a, b) =>
          axis === "x"
            ? a.position.x - b.position.x
            : a.position.y - b.position.y,
        );
      if (targets.length < 3)
        return message.warning("请至少选择 3 张图片进行均分");
      const first = targets[0];
      const last = targets[targets.length - 1];
      const firstCenter =
        axis === "x"
          ? first.position.x + first.width / 2
          : first.position.y + first.height / 2;
      const lastCenter =
        axis === "x"
          ? last.position.x + last.width / 2
          : last.position.y + last.height / 2;
      const gap = (lastCenter - firstCenter) / (targets.length - 1);
      const ids = new Map(
        targets.map((node, index) => [node.id, firstCenter + gap * index]),
      );
      setNodes((prev) =>
        prev.map((node) => {
          const center = ids.get(node.id);
          if (center == null) return node;
          return {
            ...node,
            position:
              axis === "x"
                ? { ...node.position, x: center - node.width / 2 }
                : { ...node.position, y: center - node.height / 2 },
          };
        }),
      );
    },
    [message, selectedImageNodes],
  );

  const autoArrangeSelectedImages = useCallback(() => {
    const targets = selectedImageNodes;
    if (targets.length < 2) return message.warning("请至少选择 2 张图片");
    const sorted = targets
      .slice()
      .sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      );
    const minX = Math.min(...sorted.map((node) => node.position.x));
    const minY = Math.min(...sorted.map((node) => node.position.y));
    const maxWidth = Math.max(...sorted.map((node) => node.width));
    const maxHeight = Math.max(...sorted.map((node) => node.height));
    const columns = Math.ceil(Math.sqrt(sorted.length));
    const ids = new Map(
      sorted.map((node, index) => [
        node.id,
        {
          x: minX + (index % columns) * (maxWidth + 36),
          y: minY + Math.floor(index / columns) * (maxHeight + 36),
        },
      ]),
    );
    setNodes((prev) =>
      prev.map((node) =>
        ids.has(node.id) ? { ...node, position: ids.get(node.id)! } : node,
      ),
    );
  }, [message, selectedImageNodes]);

  const createReferenceGenerationFromImages = useCallback(
    (
      targetNodes = selectedImageNodes,
      preset: CanvasReferenceGenerationPreset = {},
    ) => {
      if (!targetNodes.length) return message.warning("请先选择图片");
      const bounds = targetNodes.reduce(
        (acc, node) => ({
          right: Math.max(acc.right, node.position.x + node.width),
          centerY: acc.centerY + node.position.y + node.height / 2,
        }),
        { right: -Infinity, centerY: 0 },
      );
      const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
      const references = targetNodes
        .map((node) => `@[node:${node.id}]`)
        .join(" ");
      const composerContent = [preset.prompt?.trim(), `参考图片：${references}`]
        .filter(Boolean)
        .join("\n\n");
      const configNode = createCanvasNode(
        CanvasNodeType.Config,
        {
          x: bounds.right + 96 + configSpec.width / 2,
          y: bounds.centerY / targetNodes.length,
        },
        {
          generationMode: "image",
          model: effectiveConfig.imageModel || effectiveConfig.model,
          size: preset.size || effectiveConfig.size,
          quality: preset.quality || effectiveConfig.quality,
          count:
            preset.count ||
            getGenerationCount(
              effectiveConfig.canvasImageCount || effectiveConfig.count,
            ),
          composerContent,
        },
      );
      if (preset.title) configNode.title = preset.title;
      setNodes((prev) => [...prev, configNode]);
      setConnections((prev) => [
        ...prev,
        ...targetNodes.map((node) => ({
          id: nanoid(),
          fromNodeId: node.id,
          toNodeId: configNode.id,
        })),
      ]);
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
      setContextMenu(null);
      if (preset.successMessage) message.success(preset.successMessage);
    },
    [
      effectiveConfig.canvasImageCount,
      effectiveConfig.count,
      effectiveConfig.imageModel,
      effectiveConfig.model,
      effectiveConfig.quality,
      effectiveConfig.size,
      message,
      selectedImageNodes,
    ],
  );

  const createStoryDirectorFromImages = useCallback(
    (targetNodes: CanvasNodeData[]) => {
      const primaryImage = targetNodes.find(
        (item) =>
          item.type === CanvasNodeType.Image && Boolean(item.metadata?.content),
      );
      const sourceImageIds = targetNodes
        .filter(
          (item) =>
            item.type === CanvasNodeType.Image &&
            Boolean(item.metadata?.content),
        )
        .map((item) => item.id);
      const sourceText =
        targetNodes.find(
          (item) =>
            item.type === CanvasNodeType.Text ||
            item.type === CanvasNodeType.StoryDirector,
        )?.metadata?.storyText ||
        targetNodes.find(
          (item) =>
            item.type === CanvasNodeType.Text ||
            item.type === CanvasNodeType.StoryDirector,
        )?.metadata?.content ||
        "";
      const sourceBounds = targetNodes.length
        ? targetNodes.reduce(
            (acc, node) => ({
              right: Math.max(acc.right, node.position.x + node.width),
              centerY: acc.centerY + node.position.y + node.height / 2,
            }),
            { right: -Infinity, centerY: 0 },
          )
        : null;
      const spec = NODE_DEFAULT_SIZE[CanvasNodeType.StoryDirector];
      const position = sourceBounds
        ? {
            x: sourceBounds.right + 96 + spec.width / 2,
            y: sourceBounds.centerY / targetNodes.length,
          }
        : getCanvasCenter();
      const node = createCanvasNode(CanvasNodeType.StoryDirector, position, {
        storyText: sourceText,
        content: sourceText,
        storyStyle: "电影感写实",
        storyShotCount: 12,
        storyAspectRatio: "16:9",
        storyWorkflow: "idle",
        storySourceImageNodeId: primaryImage?.id,
        storySourceImageNodeIds: sourceImageIds,
        storyCharacterSourceImageNodeIds: [],
        storySceneSourceImageNodeIds: [],
        storyPropSourceImageNodeIds: [],
        status: NODE_STATUS_SUCCESS,
        storyAnalysisStatus: "idle",
        storyGenerationStatus: "idle",
      });
      setNodes((prev) => [...prev, node]);
      setConnections((prev) => [
        ...prev,
        ...targetNodes.map((target) => ({
          id: nanoid(),
          fromNodeId: target.id,
          toNodeId: node.id,
          toHandleId:
            target.type === CanvasNodeType.Image
              ? "story:reference"
              : undefined,
        })),
      ]);
      setSelectedNodeIds(new Set([node.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(node.id);
      setContextMenu(null);
      message.success(
        sourceText
          ? "已创建故事导演节点，并带入文本"
          : primaryImage
            ? "已创建故事导演节点，并连接参考图"
            : "已创建空白故事导演节点",
      );
    },
    [getCanvasCenter, message],
  );

  const createStoryDirectorConfig = useCallback(
    (node: CanvasNodeData, kind: StoryDirectorConfigKind) => {
      const storyText = (
        node.metadata?.storyText ||
        node.metadata?.content ||
        ""
      ).trim();
      if (!storyText || storyText === STORY_DIRECTOR_PLACEHOLDER.trim()) {
        message.warning("请先在故事导演节点中粘贴小说或剧情文本");
        return;
      }

      const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
      const position = {
        x: node.position.x + node.width + 96 + configSpec.width / 2,
        y: node.position.y + node.height / 2,
      };
      const prompt = buildStoryDirectorPrompt(node, kind);
      const mode = kind === "analysis" ? "text" : "image";
      const configNode = createCanvasNode(CanvasNodeType.Config, position, {
        generationMode: mode,
        model:
          mode === "text"
            ? effectiveConfig.textModel || effectiveConfig.model
            : effectiveConfig.imageModel || effectiveConfig.model,
        size:
          kind === "character"
            ? "16:9"
            : node.metadata?.storyAspectRatio || effectiveConfig.size,
        quality: effectiveConfig.quality,
        count:
          kind === "shot"
            ? getGenerationCount(String(node.metadata?.storyShotCount || 1))
            : 1,
        composerContent: `故事导演：@[node:${node.id}]\n\n${prompt}`,
        storyWorkflow: kind,
      });
      configNode.title =
        kind === "analysis"
          ? "故事分析配置"
          : kind === "character"
            ? "角色图配置"
            : "分镜图配置";
      setNodes((prev) => [
        ...prev.map((item) =>
          item.id === node.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyWorkflow: kind,
                  status: NODE_STATUS_SUCCESS,
                  storyAnalysisStatus:
                    item.metadata?.storyAnalysisStatus === NODE_STATUS_LOADING
                      ? "idle"
                      : item.metadata?.storyAnalysisStatus,
                  storyGenerationStatus:
                    item.metadata?.storyGenerationStatus === NODE_STATUS_LOADING
                      ? "idle"
                      : item.metadata?.storyGenerationStatus,
                },
              }
            : item,
        ),
        configNode,
      ]);
      setConnections((prev) => {
        const next = [
          ...prev,
          { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
        ];
        const sourceIds =
          kind === "analysis"
            ? []
            : ["reference", "character", "scene", "prop"].flatMap((inputKind) =>
                storyDirectorSourceIdsForKind(
                  node,
                  inputKind as StoryDirectorInputKind,
                ),
              );
        const sourceConnections = sourceIds
          .filter(
            (sourceId) =>
              !next.some(
                (connection) =>
                  connection.fromNodeId === sourceId &&
                  connection.toNodeId === configNode.id,
              ),
          )
          .map((sourceId) => ({
            id: nanoid(),
            fromNodeId: sourceId,
            toNodeId: configNode.id,
          }));
        return sourceConnections.length
          ? [...next, ...sourceConnections]
          : next;
      });
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
      setContextMenu(null);
    },
    [
      effectiveConfig.imageModel,
      effectiveConfig.model,
      effectiveConfig.quality,
      effectiveConfig.size,
      effectiveConfig.textModel,
      message,
    ],
  );

  const analyzeStoryDirector = useCallback(
    async (node: CanvasNodeData) => {
      const storyText = (
        node.metadata?.storyText ||
        node.metadata?.content ||
        ""
      ).trim();
      if (!storyText || storyText === STORY_DIRECTOR_PLACEHOLDER.trim()) {
        message.warning("请先粘贴小说或剧情文本");
        return null;
      }
      const inheritedStoryDirectorTextModel =
        effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel;
      const storyDirectorTextModel = resolveStoryDirectorTextModel(
        node.metadata,
        inheritedStoryDirectorTextModel,
        storyDirectorTextModels,
      );
      const hasCustomStoryDirectorModel = hasCustomStoryDirectorTextModel(
        node.metadata,
        storyDirectorTextModels,
      );
      const storyDirectorBoardRouteKey: ApiBoardRouteKey | undefined =
        hasCustomStoryDirectorModel ? undefined : "storyDirector";
      const baseTextConfig = buildGenerationConfig(
        effectiveConfig,
        node,
        "text",
      );
      const currentTextProvider = effectiveConfig.apiRelays.find(
        (provider) => provider.id === effectiveConfig.apiRouting.text.providerId,
      );
      const customTextProvider = hasCustomStoryDirectorModel
        ? [
            currentTextProvider,
            ...effectiveConfig.apiRelays.filter(
              (provider) => provider.id !== currentTextProvider?.id,
            ),
          ].find(
            (provider) =>
              provider?.enabled &&
              provider.capabilities.includes("text") &&
              providerModelsForCapability(provider, "text").includes(
                storyDirectorTextModel,
              ),
          )
        : undefined;
      const textConfig = {
        ...baseTextConfig,
        textModel: storyDirectorTextModel,
        model: storyDirectorTextModel,
        apiRouting:
          hasCustomStoryDirectorModel && customTextProvider
            ? {
                ...baseTextConfig.apiRouting,
                text: {
                  source: "relay" as const,
                  providerId: customTextProvider.id,
                  model: storyDirectorTextModel,
                },
              }
            : baseTextConfig.apiRouting,
      };
      if (!isAiConfigReady(textConfig, textConfig.model)) {
        openConfigDialog(true);
        return;
      }

      const previousStoryAnalysisRaw =
        node.metadata?.storyAnalysisRaw &&
        !detectTextApiResponseError(node.metadata.storyAnalysisRaw)
          ? node.metadata.storyAnalysisRaw
          : undefined;
      setRunningNodeId(node.id);
      applyPersistedNodes((prev) =>
        prev.map((item) =>
          item.id === node.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyAnalysisStatus: NODE_STATUS_LOADING,
                  storyAnalysisRaw: undefined,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                },
              }
            : item,
        ),
      );
      try {
        let streamed = "";
        const prompt = `${buildStoryDirectorPrompt(node, "analysis")}\n\n故事文本：\n${storyText}`;
        const storyDirectorJsonOptions = supportsStoryDirectorJsonResponseFormat(storyDirectorTextModel)
          ? {
              stream: true,
              responseFormat: "json_object" as const,
              disableFileGeneration: true,
              boardRouteKey: storyDirectorBoardRouteKey,
            }
          : {
              stream: true,
              responseFormat: undefined,
              disableFileGeneration: undefined,
              boardRouteKey: storyDirectorBoardRouteKey,
            };
        const handleAnalysisDelta = (text: string) => {
          if (detectTextApiResponseError(text)) return;
          streamed = text;
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: { ...item.metadata, storyAnalysisRaw: text },
                  }
                : item,
            ),
          );
        };
        const requestStoryJson = async (content: string) => {
          try {
            return await requestImageQuestion(
              textConfig,
              [{ role: "user", content }],
              handleAnalysisDelta,
              storyDirectorJsonOptions,
            );
          } catch (error) {
            const reason = error instanceof Error ? error.message : "";
            if (!/response_format|json_object|unsupported|不支持/i.test(reason))
              throw error;
            return requestImageQuestion(
              textConfig,
              [{ role: "user", content }],
              handleAnalysisDelta,
              { ...storyDirectorJsonOptions, responseFormat: undefined },
            );
          }
        };
        let raw = (await requestStoryJson(prompt)) || streamed;
        const initialResponseError = detectTextApiResponseError(raw);
        if (initialResponseError) throw new Error(initialResponseError);
        let analysis: StoryAnalysisResult;
        try {
          analysis = parseStoryAnalysis(raw);
        } catch (parseError) {
          message.info("故事分析 JSON 格式异常，正在自动修复");
          const repairPrompt = buildStoryAnalysisRepairPrompt(
            node,
            storyText,
            raw,
            parseError,
          );
          raw = (await requestStoryJson(repairPrompt)) || streamed || raw;
          const repairedResponseError = detectTextApiResponseError(raw);
          if (repairedResponseError) throw new Error(repairedResponseError);
          analysis = parseStoryAnalysis(raw);
        }
        const storyDevelopmentText = buildStoryDevelopmentText(analysis, node, storyText);
        applyPersistedNodes((prev) =>
          syncStoryDirectorInputMetadata(
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      storyAnalysisStatus: NODE_STATUS_SUCCESS,
                      storyGenerationStatus: "idle",
                      storyAnalysisRaw: raw,
                      storyOriginalText: item.metadata?.storyOriginalText || storyText,
                      storyText: storyDevelopmentText,
                      content: storyDevelopmentText,
                      storyCharacters: analysis.characters,
                      storyScenes: analysis.scenes,
                      storyShots: analysis.shots,
                      status: NODE_STATUS_SUCCESS,
                      errorDetails: undefined,
                    },
                  }
                : item,
            ),
            connectionsRef.current,
          ),
        );
        message.success(
          `故事分析完成：${analysis.characters.length} 个角色，${analysis.shots.length} 个镜头`,
        );
        return analysis;
      } catch (error) {
        const errorDetails =
          error instanceof Error ? error.message : "故事分析失败";
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyAnalysisStatus: NODE_STATUS_ERROR,
                    storyGenerationStatus:
                      item.metadata?.storyGenerationStatus === NODE_STATUS_LOADING
                        ? "idle"
                        : item.metadata?.storyGenerationStatus,
                    storyAnalysisRaw: previousStoryAnalysisRaw,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return null;
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      applyPersistedNodes,
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      storyDirectorTextModels,
    ],
  );

  const generateStoryCharacters = useCallback(
    async (node: CanvasNodeData, analysis?: StoryAnalysisResult | null) => {
      const base = nodesRef.current.find((item) => item.id === node.id) || node;
      const baseCharacters =
        analysis?.characters || base.metadata?.storyCharacters || [];
      const syncedNodes = syncStoryDirectorInputMetadata(
        nodesRef.current.map((item) =>
          item.id === base.id
            ? {
                ...base,
                metadata: { ...base.metadata, storyCharacters: baseCharacters },
              }
            : item,
        ),
        connectionsRef.current,
      );
      if (syncedNodes !== nodesRef.current) {
        setNodes(syncedNodes);
        persistCanvasSnapshot(syncedNodes);
      }
      const current = syncedNodes.find((item) => item.id === base.id) || base;
      const eligibleCharacters = (
        current.metadata?.storyCharacters || []
      ).filter(
        (character) =>
          character.importance === "main" ||
          character.importance === "supporting",
      );
      const characters = eligibleCharacters.filter(
        (character) => !character.referenceNodeId && !character.assetLocked,
      );
      if (!eligibleCharacters.length) {
        message.warning("请先分析故事，或确保存在主角/重要配角");
        return;
      }
      if (!characters.length) {
        message.success("角色参考图已齐全，无需重复生成");
        return;
      }
      const imageConfig = {
        ...buildGenerationConfig(effectiveConfig, current, "image"),
        model:
          effectiveConfig.imageModel ||
          effectiveConfig.model ||
          defaultConfig.imageModel,
        count: "1",
        size: "16:9",
        quality: normalizeStoryImageQuality(
          current.metadata?.storyImageQuality,
        ),
      };
      if (!isAiConfigReady(imageConfig, imageConfig.model)) {
        openConfigDialog(true);
        return;
      }

      setRunningNodeId(current.id);
      applyPersistedNodes((prev) =>
        prev.map((item) =>
          item.id === current.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyAnalysisStatus: NODE_STATUS_SUCCESS,
                  storyGenerationStatus: NODE_STATUS_LOADING,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                },
              }
            : item,
        ),
      );
      const imageSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
      const baseX = current.position.x - imageSpec.width - 140;
      const baseY = current.position.y;
      const sourceReferences = sourceReferenceImagesForStoryDirector(
        current,
        syncedNodes,
        ["reference"],
      );
      const firstSequenceNumber = nextImageSequenceNumber(nodesRef.current);

      try {
        await runWithConcurrency(
          characters,
          STORY_DIRECTOR_IMAGE_CONCURRENCY,
          async (character, index) => {
            applyPersistedNodes((prev) =>
              prev.map((item) =>
                item.id === current.id
                  ? updateStoryCharacterStatus(item, character.id, {
                      status: "generating",
                      errorDetails: undefined,
                    })
                  : item,
              ),
            );
            const references = sourceReferences;
            const prompt = buildStoryCharacterImagePrompt(
              character,
              current,
              references.length,
            );
            const characterLabel = storyCharacterDisplayName(character, index);
            const nodeId = nanoid();
            const taskId = `canvas-story-character-${nodeId}-${Date.now()}`;
            const pendingNode: CanvasNodeData = {
              id: nodeId,
              type: CanvasNodeType.Image,
              title: `角色-${characterLabel}`,
              position: {
                x: baseX,
                y: baseY + index * (imageSpec.height + 72),
              },
              width: imageSpec.width,
              height: imageSpec.height,
              metadata: {
                prompt,
                storyLabel: characterLabel,
                imageSequenceNumber: firstSequenceNumber + index,
                status: NODE_STATUS_LOADING,
                sourceImageTaskId: taskId,
                ...buildImageGenerationMetadata(
                  references.length ? "edit" : "generation",
                  imageConfig,
                  1,
                  references,
                ),
              },
            };
            applyPersistedGraph(
              (prev) => [...prev, pendingNode],
              (prev) => [
                ...prev,
                {
                  id: nanoid(),
                  fromNodeId: nodeId,
                  toNodeId: current.id,
                  toHandleId: "story:character",
                },
                ...references.map((reference) => ({
                  id: nanoid(),
                  fromNodeId: reference.id,
                  toNodeId: nodeId,
                })),
              ],
            );
            try {
              const pollTaskId = await submitCanvasImageTask(
                taskId,
                imageConfig,
                prompt,
                references,
                { useReferenceLabels: true },
              );
              const generated = await pollCanvasImageTask(pollTaskId);
              const uploaded = await uploadImage(generated.dataUrl);
              const size = imageNodeSize(
                uploaded.width,
                uploaded.height,
                imageSpec.width,
              );
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        width: size.width,
                        height: size.height,
                        metadata: {
                          ...item.metadata,
                          ...imageMetadata(uploaded, generated),
                          prompt,
                          ...buildImageGenerationMetadata(
                            references.length ? "edit" : "generation",
                            imageConfig,
                            1,
                            references,
                          ),
                        },
                      }
                    : item.id === current.id
                      ? updateStoryCharacterStatus(item, character.id, {
                          status: "ready",
                          referenceNodeId: nodeId,
                          referenceImageUrl: uploaded.url,
                          assetSource: "generated",
                          assetLocked: true,
                        })
                      : item,
                ),
              );
            } catch (error) {
              const errorDetails = formatCanvasGenerationError(
                error,
                "角色图生成失败",
              );
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        metadata: {
                          ...item.metadata,
                          status: NODE_STATUS_ERROR,
                          errorDetails,
                        },
                      }
                    : item.id === current.id
                      ? updateStoryCharacterStatus(item, character.id, {
                          status: "error",
                          errorDetails,
                        })
                      : item,
                ),
              );
              throw new Error(errorDetails);
            }
          },
        );
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_SUCCESS,
                    status: NODE_STATUS_SUCCESS,
                  },
                }
              : item,
          ),
        );
        message.success(`已补齐 ${characters.length} 张角色图`);
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "角色图生成失败",
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      applyPersistedGraph,
      applyPersistedNodes,
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      persistCanvasSnapshot,
    ],
  );

  const generateStoryShots = useCallback(
    async (node: CanvasNodeData) => {
      const base = nodesRef.current.find((item) => item.id === node.id) || node;
      const syncedNodes = syncStoryDirectorInputMetadata(
        nodesRef.current,
        connectionsRef.current,
      );
      if (syncedNodes !== nodesRef.current) {
        setNodes(syncedNodes);
        persistCanvasSnapshot(syncedNodes);
      }
      const current = syncedNodes.find((item) => item.id === base.id) || base;
      const shots = current.metadata?.storyShots || [];
      if (!shots.length) {
        message.warning("请先分析故事生成分镜");
        return;
      }
      const storyboardMode = current.metadata?.storyStoryboardMode || "single";
      if (storyboardMode === "grid9" && shots.length % 9 !== 0) {
        message.warning("9宫格分镜模式下，镜头数必须是 9 的倍数");
        return;
      }
      const imageConfig = {
        ...buildGenerationConfig(effectiveConfig, current, "image"),
        model:
          effectiveConfig.imageModel ||
          effectiveConfig.model ||
          defaultConfig.imageModel,
        count: "1",
        size:
          current.metadata?.storyAspectRatio ||
          effectiveConfig.size ||
          STORY_DIRECTOR_DEFAULT_IMAGE_RATIO,
        quality: normalizeStoryImageQuality(
          current.metadata?.storyImageQuality,
        ),
      };
      if (!isAiConfigReady(imageConfig, imageConfig.model)) {
        openConfigDialog(true);
        return;
      }

      setRunningNodeId(current.id);
      applyPersistedNodes((prev) =>
        prev.map((item) =>
          item.id === current.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyAnalysisStatus: NODE_STATUS_SUCCESS,
                  storyGenerationStatus: NODE_STATUS_LOADING,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                },
              }
            : item,
        ),
      );
      const characterById = new Map(
        (current.metadata?.storyCharacters || []).map((character) => [
          character.id,
          character,
        ]),
      );
      const baseX = current.position.x + current.width + 560;
      const baseY = current.position.y;
      const shotNodeSize = storyDirectorShotNodeSize(imageConfig.size);
      const firstSequenceNumber = nextImageSequenceNumber(nodesRef.current);

      try {
        if (storyboardMode === "grid9") {
          const gridGroups = [];
          for (let chunkStart = 0; chunkStart < shots.length; chunkStart += 9) {
            gridGroups.push({
              chunkStart,
              chunk: shots.slice(chunkStart, chunkStart + 9),
              groupIndex: Math.floor(chunkStart / 9),
            });
          }
          await runWithConcurrency(
            gridGroups,
            STORY_DIRECTOR_IMAGE_CONCURRENCY,
            async ({ chunkStart, chunk, groupIndex }) => {
              const references = mergeReferenceImages([
                ...sourceReferenceImagesForStoryDirector(current, syncedNodes, [
                  "reference",
                  "scene",
                  "prop",
                ]),
                ...chunk.flatMap((shot) =>
                  sourceImagesForStoryShot(shot, syncedNodes, characterById),
                ),
              ]);
              const prompt = buildStoryGrid9ImagePrompt(
                chunk,
                current,
                characterById,
                references,
              );
              const nodeId = nanoid();
              const taskId = `canvas-story-grid9-${nodeId}-${Date.now()}`;
              const shotStart = chunk[0]?.index || chunkStart + 1;
              const shotEnd =
                chunk[chunk.length - 1]?.index || chunkStart + chunk.length;
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === current.id
                    ? updateStoryShotsStatus(
                        item,
                        chunk.map((shot) => shot.id),
                        { status: "generating", errorDetails: undefined },
                      )
                    : item,
                ),
              );
              const pendingNode: CanvasNodeData = {
                id: nodeId,
                type: CanvasNodeType.Image,
                title: `九宫格分镜${groupIndex + 1}`.slice(0, 48),
                position: storyDirectorGridPosition(
                  baseX,
                  baseY,
                  groupIndex,
                  shotNodeSize,
                ),
                width: shotNodeSize.width,
                height: shotNodeSize.height,
                metadata: {
                  prompt,
                  storyLabel:
                    shotStart === shotEnd
                      ? `第${shotStart}镜`
                      : `第${shotStart}-${shotEnd}镜`,
                  imageSequenceNumber: firstSequenceNumber + groupIndex,
                  storyGrid9GroupIndex: groupIndex + 1,
                  storyGrid9ShotStart: shotStart,
                  storyGrid9ShotEnd: shotEnd,
                  status: NODE_STATUS_LOADING,
                  sourceImageTaskId: taskId,
                  ...buildImageGenerationMetadata(
                    references.length ? "edit" : "generation",
                    imageConfig,
                    1,
                    references,
                  ),
                },
              };
              applyPersistedGraph(
                (prev) => [...prev, pendingNode],
                (prev) => [
                  ...prev,
                  { id: nanoid(), fromNodeId: current.id, toNodeId: nodeId },
                  ...references.map((reference) => ({
                    id: nanoid(),
                    fromNodeId: reference.id,
                    toNodeId: nodeId,
                  })),
                ],
              );
              try {
                const pollTaskId = await submitCanvasImageTask(
                  taskId,
                  imageConfig,
                  prompt,
                  references,
                  { useReferenceLabels: true },
                );
                const generated = await pollCanvasImageTask(pollTaskId);
                const uploaded = await uploadImage(generated.dataUrl);
                applyPersistedNodes((prev) =>
                  prev.map((item) =>
                    item.id === nodeId
                      ? {
                          ...item,
                          width: shotNodeSize.width,
                          height: shotNodeSize.height,
                          metadata: {
                            ...item.metadata,
                            ...imageMetadata(uploaded, generated),
                            prompt,
                            ...buildImageGenerationMetadata(
                              references.length ? "edit" : "generation",
                              imageConfig,
                              1,
                              references,
                            ),
                          },
                        }
                      : item.id === current.id
                        ? updateStoryShotsStatus(
                            item,
                            chunk.map((shot) => shot.id),
                            {
                              status: "done",
                              resultNodeIds: [nodeId],
                              finalPrompt: prompt,
                            },
                          )
                        : item,
                  ),
                );
              } catch (error) {
                const errorDetails = formatCanvasGenerationError(
                  error,
                  "九宫格分镜生成失败",
                );
                applyPersistedNodes((prev) =>
                  prev.map((item) =>
                    item.id === nodeId
                      ? {
                          ...item,
                          metadata: {
                            ...item.metadata,
                            status: NODE_STATUS_ERROR,
                            errorDetails,
                          },
                        }
                      : item.id === current.id
                        ? updateStoryShotsStatus(
                            item,
                            chunk.map((shot) => shot.id),
                            { status: "error", errorDetails },
                          )
                        : item,
                  ),
                );
                throw new Error(errorDetails);
              }
            },
          );
          applyPersistedNodes((prev) =>
            prev.map((item) =>
              item.id === current.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      storyGenerationStatus: NODE_STATUS_SUCCESS,
                      status: NODE_STATUS_SUCCESS,
                    },
                  }
                : item,
            ),
          );
          message.success(`已生成 ${shots.length / 9} 张九宫格分镜图`);
          return;
        }

        await runWithConcurrency(
          shots,
          STORY_DIRECTOR_IMAGE_CONCURRENCY,
          async (shot, index) => {
            const references = mergeReferenceImages([
              ...sourceReferenceImagesForStoryDirector(current, syncedNodes, [
                "reference",
                "scene",
                "prop",
              ]),
              ...sourceImagesForStoryShot(shot, syncedNodes, characterById),
            ]);
            const prompt = buildStoryShotImagePrompt(
              shot,
              current,
              characterById,
              references,
            );
            const nodeId = nanoid();
            const taskId = `canvas-story-shot-${nodeId}-${Date.now()}`;
            applyPersistedNodes((prev) =>
              prev.map((item) =>
                item.id === current.id
                  ? updateStoryShotStatus(item, shot.id, {
                      status: "generating",
                      errorDetails: undefined,
                    })
                  : item,
              ),
            );
            const pendingNode: CanvasNodeData = {
              id: nodeId,
              type: CanvasNodeType.Image,
              title: `镜头${shot.index}-${shot.title}`.slice(0, 48),
              position: storyDirectorGridPosition(
                baseX,
                baseY,
                index,
                shotNodeSize,
              ),
              width: shotNodeSize.width,
              height: shotNodeSize.height,
              metadata: {
                prompt,
                storyLabel: `第${shot.index}镜`,
                imageSequenceNumber: firstSequenceNumber + index,
                status: NODE_STATUS_LOADING,
                sourceImageTaskId: taskId,
                ...buildImageGenerationMetadata(
                  references.length ? "edit" : "generation",
                  imageConfig,
                  1,
                  references,
                ),
              },
            };
            applyPersistedGraph(
              (prev) => [...prev, pendingNode],
              (prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: current.id, toNodeId: nodeId },
                ...references.map((reference) => ({
                  id: nanoid(),
                  fromNodeId: reference.id,
                  toNodeId: nodeId,
                })),
              ],
            );
            try {
              const pollTaskId = await submitCanvasImageTask(
                taskId,
                imageConfig,
                prompt,
                references,
                { useReferenceLabels: true },
              );
              const generated = await pollCanvasImageTask(pollTaskId);
              const uploaded = await uploadImage(generated.dataUrl);
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        width: shotNodeSize.width,
                        height: shotNodeSize.height,
                        metadata: {
                          ...item.metadata,
                          ...imageMetadata(uploaded, generated),
                          prompt,
                          ...buildImageGenerationMetadata(
                            references.length ? "edit" : "generation",
                            imageConfig,
                            1,
                            references,
                          ),
                        },
                      }
                    : item.id === current.id
                      ? updateStoryShotStatus(item, shot.id, {
                          status: "done",
                          resultNodeIds: [
                            ...(shot.resultNodeIds || []),
                            nodeId,
                          ],
                          finalPrompt: prompt,
                        })
                      : item,
                ),
              );
            } catch (error) {
              const errorDetails = formatCanvasGenerationError(
                error,
                "分镜图生成失败",
              );
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        metadata: {
                          ...item.metadata,
                          status: NODE_STATUS_ERROR,
                          errorDetails,
                        },
                      }
                    : item.id === current.id
                      ? updateStoryShotStatus(item, shot.id, {
                          status: "error",
                          errorDetails,
                        })
                      : item,
                ),
              );
              throw new Error(errorDetails);
            }
          },
        );
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_SUCCESS,
                    status: NODE_STATUS_SUCCESS,
                  },
                }
              : item,
          ),
        );
        message.success(`已生成 ${shots.length} 张分镜图`);
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "分镜图生成失败",
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      applyPersistedGraph,
      applyPersistedNodes,
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      persistCanvasSnapshot,
    ],
  );

  const runStoryDirectorAll = useCallback(
    async (node: CanvasNodeData) => {
      const analysis = await analyzeStoryDirector(node);
      if (!analysis) return;
      const latest =
        nodesRef.current.find((item) => item.id === node.id) || node;
      await generateStoryCharacters(latest, analysis);
      const afterCharacters =
        nodesRef.current.find((item) => item.id === node.id) || latest;
      await generateStoryShots(afterCharacters);
    },
    [analyzeStoryDirector, generateStoryCharacters, generateStoryShots],
  );

  const createImageReversePromptNodes = useCallback(
    (node: CanvasNodeData) => {
      if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
        message.warning("图片节点为空，无法反推提示词");
        return;
      }

      const gap = 96;
      const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
      const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
      const centerY = node.position.y + node.height / 2;
      const textNode = {
        ...createCanvasNode(
          CanvasNodeType.Text,
          {
            x: node.position.x + node.width + gap + textSpec.width / 2,
            y: centerY,
          },
          {
            content: IMAGE_PROMPT_REVERSE_PRESET,
            prompt: IMAGE_PROMPT_REVERSE_PRESET,
            status: NODE_STATUS_SUCCESS,
            fontSize: 14,
          },
        ),
        title: "反推提示词",
      };
      const configNode = {
        ...createCanvasNode(
          CanvasNodeType.Config,
          {
            x:
              textNode.position.x + textNode.width + gap + configSpec.width / 2,
            y: centerY,
          },
          {
            generationMode: "text",
            model:
              effectiveConfig.textModel ||
              effectiveConfig.model ||
              defaultConfig.textModel,
            count: 1,
            composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
          },
        ),
        title: "反推提示词配置",
      };

      setNodes((prev) => [...prev, textNode, configNode]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
        { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id },
      ]);
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
      setContextMenu(null);
    },
    [effectiveConfig.model, effectiveConfig.textModel, message],
  );

  const cropImageNode = useCallback(
    async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const cropped = await cropDataUrl(node.metadata.content, crop);
      const image = await uploadImage(cropped);
      const width = Math.min(node.width, Math.max(220, image.width));
      const childId = nanoid();
      const child: CanvasNodeData = {
        id: childId,
        type: CanvasNodeType.Image,
        title: "Cropped Image",
        position: { x: node.position.x + node.width + 96, y: node.position.y },
        width,
        height: width * (image.height / image.width),
        metadata: {
          ...imageMetadata(image),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          prompt: node.metadata?.prompt,
        },
      };
      setNodes((prev) => [...prev, child]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setDialogNodeId(childId);
      setCropNodeId(null);
    },
    [touchNodeImage],
  );

  const layerEditImageNode = useCallback(
    async (node: CanvasNodeData, payload: CanvasImageLayerEditPayload) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const image = await uploadImage(payload.dataUrl);
      const size = imageNodeSize(image.width, image.height, node.width);
      const childId = nanoid();
      const child: CanvasNodeData = {
        id: childId,
        type: CanvasNodeType.Image,
        title: "图层合成",
        position: { x: node.position.x + node.width + 96, y: node.position.y },
        width: size.width,
        height: size.height,
        metadata: {
          ...imageMetadata(image),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          prompt: node.metadata?.prompt,
        },
      };
      setNodes((prev) => [...prev, child]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setSelectedConnectionId(null);
      setDialogNodeId(childId);
      setLayerEditNodeId(null);
      message.success("已生成图层合成图");
    },
    [message, touchNodeImage],
  );

  const saveSeedance2FaceEditImageNode = useCallback(
    async (
      node: CanvasNodeData,
      payload: CanvasSeedance2FaceEditPayload,
    ): Promise<void> => {
      if (!payload.dataUrl) {
        const error = new Error("人脸迁移结果为空，无法保存");
        message.error(error.message);
        throw error;
      }
      try {
        touchNodeImage(node);
        const originalStorageKey =
          node.metadata?.seedance2FaceEditOriginal?.storageKey ||
          node.metadata?.storageKey;
        if (originalStorageKey) {
          await setStoredImagesRetained([originalStorageKey], true);
        }
        const uploaded = await uploadImage(payload.dataUrl);
        const metadata = imageMetadata(uploaded);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? createSeedance2FaceEditOriginalBackup(item, {
                  ...metadata,
                  prompt: item.metadata?.prompt,
                  imageSequenceNumber:
                    item.metadata?.imageSequenceNumber ??
                    nextImageSequenceNumber(nodesRef.current),
                })
              : item,
          ),
        );
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setSeedance2FaceEditNodeId(null);
        message.success("已合并并替换原图");
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Seedance2 人脸迁移保存失败";
        message.error(errorMessage);
        throw (error instanceof Error ? error : new Error(errorMessage));
      }
    },
    [message, touchNodeImage],
  );

  const restoreSeedance2FaceEditOriginalImageNode = useCallback(
    async (node: CanvasNodeData) => {
      const originalMetadata = node.metadata?.seedance2FaceEditOriginal;
      if (!originalMetadata) {
        message.warning("未找到 Seedance2 原图记录");
        return;
      }
      try {
        const restoreOverrides: Parameters<typeof restoreSeedance2FaceEditOriginalNode>[1] = {};
        if (originalMetadata.storageKey) {
          await setStoredImagesRetained([originalMetadata.storageKey], true);
          const resolvedContent = await resolveImageUrl(
            originalMetadata.storageKey,
            originalMetadata.content || "",
          );
          if (resolvedContent) restoreOverrides.content = resolvedContent;
        }
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? restoreSeedance2FaceEditOriginalNode(item, restoreOverrides)
              : item,
          ),
        );
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        message.success("已还原 Seedance2 原图");
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Seedance2 原图还原失败";
        message.error(errorMessage);
      }
    },
    [message],
  );

  const splitImageNode = useCallback(
    async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      setSplitNodeId(null);
      const pieces = await splitDataUrl(node.metadata.content, params);
      const sourceWidth = pieces[0]?.sourceWidth || 1;
      const sourceHeight = pieces[0]?.sourceHeight || 1;
      const scale = Math.min(
        node.width / sourceWidth,
        node.height / sourceHeight,
      );
      const startX = node.position.x + node.width + 96;
      const startY = node.position.y;
      let nextSequenceNumber = nextImageSequenceNumber(nodesRef.current);
      const childNodes = await Promise.all(
        pieces.map(async (piece) => {
          const image = await uploadImage(piece.dataUrl);
          const id = nanoid();
          return {
            id,
            type: CanvasNodeType.Image,
            title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
            position: {
              x: startX + Math.round(piece.x * scale),
              y: startY + Math.round(piece.y * scale),
            },
            width: Math.max(1, Math.round(piece.width * scale)),
            height: Math.max(1, Math.round(piece.height * scale)),
            metadata: {
              ...imageMetadata(image),
              imageSequenceNumber: nextSequenceNumber++,
              prompt: node.metadata?.prompt,
            },
          } satisfies CanvasNodeData;
        }),
      );
      setNodes((prev) => [...prev, ...childNodes]);
      setConnections((prev) => [
        ...prev,
        ...childNodes.map((child) => ({
          id: nanoid(),
          fromNodeId: node.id,
          toNodeId: child.id,
        })),
      ]);
      setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
      setSelectedConnectionId(null);
      setDialogNodeId(null);
      message.success(`已切分为 ${childNodes.length} 个子节点`);
    },
    [message, touchNodeImage],
  );

  const maskEditImageNode = useCallback(
    async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const generationConfig = {
        ...buildGenerationConfig(effectiveConfig, node, "image"),
        count: "1",
        size: node.metadata?.size || "auto",
      };
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }
      const userPrompt = payload.prompt.trim();
      const prompt = `只修改蒙版透明区域，其他区域保持不变。${userPrompt}`;
      const childId = nanoid();
      const source = {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
      };
      const generationMetadata = buildImageGenerationMetadata(
        "edit",
        generationConfig,
        1,
        [source],
      );
      setMaskEditNodeId(null);
      setRunningNodeId(childId);
      setNodes((prev) => [
        ...prev,
        {
          id: childId,
          type: CanvasNodeType.Image,
          title: userPrompt.slice(0, 32) || "局部编辑结果",
          position: {
            x: node.position.x + node.width + 96,
            y: node.position.y,
          },
          width: node.width,
          height: node.height,
          metadata: {
            prompt,
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            status: NODE_STATUS_LOADING,
            ...generationMetadata,
          },
        },
      ]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setSelectedConnectionId(null);
      setDialogNodeId(childId);
      try {
        const taskId = `canvas-${childId}`;
        const pollTaskId = await submitCanvasImageTask(taskId, generationConfig, prompt, [source]);
        const image = await pollCanvasImageTask(pollTaskId);
        const uploaded = await uploadImage(image.dataUrl);
        const size = imageNodeSize(uploaded.width, uploaded.height, node.width);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  width: size.width,
                  height: size.height,
                  metadata: {
                    ...item.metadata,
                    ...imageMetadata(uploaded, image),
                    prompt,
                    ...generationMetadata,
                  },
                }
              : item,
          ),
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error, "局部修改失败");
        message.error(errorDetails);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      touchNodeImage,
    ],
  );

  const aiUpscaleImageNode = useCallback(
    async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      setUpscaleNodeId(null);
      const generationConfig = {
        ...buildGenerationConfig(effectiveConfig, node, "image"),
        count: "1",
        quality: params.quality,
        size: params.size || "auto",
      };
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }

      const childId = nanoid();
      const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
      const source = {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
      };
      const prompt =
        "以参考图为准进行 AI 高清放大和超分修复。保持原图主体、构图、姿态、颜色关系、画面风格和比例一致，不要新增无关元素，不要改变人物身份或物体形状。提升清晰度、边缘细节、材质纹理和整体画质，修复模糊、噪点、压缩痕迹和低分辨率问题，输出自然真实的高清版本。";
      const generationMetadata = buildImageGenerationMetadata(
        "edit",
        generationConfig,
        1,
        [source],
      );

      setRunningNodeId(childId);
      setNodes((prev) => [
        ...prev,
        {
          id: childId,
          type: CanvasNodeType.Image,
          title: "AI 高清放大",
          position: {
            x: node.position.x + node.width + 96,
            y: node.position.y,
          },
          width: imageConfig.width,
          height: imageConfig.height,
          metadata: {
            prompt,
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            status: NODE_STATUS_LOADING,
            ...generationMetadata,
          },
        },
      ]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setSelectedConnectionId(null);
      setDialogNodeId(childId);

      try {
        const taskId = `canvas-${childId}`;
        const pollTaskId = await submitCanvasImageTask(taskId, generationConfig, prompt, [source]);
        const image = await pollCanvasImageTask(pollTaskId);
        const uploaded = await uploadImage(image.dataUrl);
        const size = imageNodeSize(
          uploaded.width,
          uploaded.height,
          imageConfig.width,
        );
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  width: size.width,
                  height: size.height,
                  metadata: {
                    ...item.metadata,
                    ...imageMetadata(uploaded, image),
                    prompt,
                    ...generationMetadata,
                  },
                }
              : item,
          ),
        );
        message.success("已生成 AI 高清放大图");
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "AI 高清放大失败",
        );
        message.error(errorDetails);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      touchNodeImage,
    ],
  );

  const generateAngleNode = useCallback(
    async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const generationConfig = {
        ...buildGenerationConfig(effectiveConfig, node, "image"),
        count: "1",
      };
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }
      const childId = nanoid();
      const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
      const title = buildAngleLabel(params);
      const prompt = buildAnglePrompt(params);
      const source = {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
      };
      const generationMetadata = buildImageGenerationMetadata(
        "edit",
        generationConfig,
        1,
        [source],
      );
      setAngleNodeId(null);
      setRunningNodeId(childId);
      setNodes((prev) => [
        ...prev,
        {
          id: childId,
          type: CanvasNodeType.Image,
          title,
          position: {
            x: node.position.x + node.width + 96,
            y: node.position.y,
          },
          width: imageConfig.width,
          height: imageConfig.height,
          metadata: {
            prompt,
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            status: NODE_STATUS_LOADING,
            ...generationMetadata,
          },
        },
      ]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setDialogNodeId(childId);
      try {
        const taskId = `canvas-${childId}`;
        const pollTaskId = await submitCanvasImageTask(taskId, generationConfig, prompt, [source]);
        const image = await pollCanvasImageTask(pollTaskId);
        const uploaded = await uploadImage(image.dataUrl);
        const size = imageNodeSize(
          uploaded.width,
          uploaded.height,
          imageConfig.width,
        );
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  width: size.width,
                  height: size.height,
                  metadata: {
                    ...item.metadata,
                    ...imageMetadata(uploaded, image),
                    prompt,
                    ...generationMetadata,
                  },
                }
              : item,
          ),
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      touchNodeImage,
    ],
  );

  const copyNodePrompt = useCallback(
    (node: CanvasNodeData) => {
      const prompt = node.metadata?.prompt?.trim();
      if (!prompt) {
        message.warning("暂无可复制的提示词");
        return;
      }
      void navigator.clipboard
        ?.writeText(prompt)
        .then(() => message.success("提示词已复制"))
        .catch(() => message.error("复制失败，请手动复制"));
    },
    [message],
  );

  const generateImageFromTextNodeRef = useRef<(node: CanvasNodeData) => void>(
    () => {},
  );
  const handleUploadRequestRef = useRef<
    (nodeId?: string, position?: Position) => void
  >(() => {});
  const handleFontSizeChangeRef = useRef<
    (nodeId: string, fontSize: number) => void
  >(() => {});
  const handleRetryNodeRef = useRef<(node: CanvasNodeData) => void>(() => {});

  const buildContextMenuGroups = useCallback(
    (menu: ContextMenuState): CanvasContextMenuGroup[] => {
      if (menu.type === "connection") {
        return [
          {
            items: [
              {
                id: "delete-connection",
                label: "删除连线",
                icon: <Trash2 className="size-4" />,
                danger: true,
                onClick: () => deleteConnection(menu.connectionId),
              },
            ],
          },
        ];
      }

      if (menu.type === "selection") {
        const selectedImages = nodesRef.current.filter(
          (item) =>
            menu.nodeIds.includes(item.id) &&
            item.type === CanvasNodeType.Image &&
            Boolean(item.metadata?.content),
        );
        const compactMenuItems = (
          entries: Array<CanvasContextMenuItem | null>,
        ) =>
          entries.filter((entry): entry is CanvasContextMenuItem =>
            Boolean(entry),
          );
        const closeSelectionMenu = () => {
          setContextMenu(null);
          setSelectedNodeIds(new Set(selectedImages.map((item) => item.id)));
          setSelectedConnectionId(null);
        };
        const action = (run: () => void) => () => {
          closeSelectionMenu();
          run();
        };
        const item = (
          id: string,
          label: string,
          icon: React.ReactNode | undefined,
          run: () => void,
          options?: Pick<
            CanvasContextMenuItem,
            "danger" | "disabled" | "shortcut" | "submenu" | "children"
          >,
        ): CanvasContextMenuItem => ({
          id,
          label,
          icon,
          onClick: action(run),
          ...options,
        });
        const submenu = (
          id: string,
          label: string,
          children: Array<CanvasContextMenuItem | null>,
          icon?: React.ReactNode,
        ): CanvasContextMenuItem | null => {
          const compactChildren = compactMenuItems(children);
          if (!compactChildren.length) return null;
          return {
            id,
            label,
            icon,
            onClick: () => undefined,
            children: compactChildren,
          };
        };
        if (selectedImages.length < 2) return [];
        return [
          {
            items: compactMenuItems([
              submenu(
                "compare",
                "对比查看",
                [
                  item(
                    "compare-side",
                    "左右对比",
                    <Columns2 className="size-4" />,
                    () => openImageCompare(selectedImages.slice(0, 2)),
                    { disabled: selectedImages.length < 2 },
                  ),
                  item(
                    "compare-grid",
                    "宫格对比",
                    <Grid2x2 className="size-4" />,
                    () => openImageCompare(selectedImages),
                  ),
                  item(
                    "compare-zoom",
                    "同步放大查看",
                    <ZoomIn className="size-4" />,
                    () => openImageCompare(selectedImages),
                  ),
                ],
                <Columns2 className="size-4" />,
              ),
              submenu(
                "batch",
                "批量操作",
                [
                  item(
                    "batch-download",
                    "批量下载",
                    <Download className="size-4" />,
                    () => downloadSelectedImages(selectedImages),
                  ),
                  item(
                    "batch-save",
                    "批量存素材",
                    <FolderPlus className="size-4" />,
                    () => void saveSelectedImages(selectedImages),
                  ),
                  item(
                    "batch-retain",
                    "批量保留",
                    <Pin className="size-4" />,
                    () => void retainSelectedImages(selectedImages),
                  ),
                  item(
                    "batch-delete",
                    "批量删除",
                    <Trash2 className="size-4" />,
                    () =>
                      deleteNodes(
                        new Set(selectedImages.map((image) => image.id)),
                      ),
                    { danger: true },
                  ),
                ],
                <FolderPlus className="size-4" />,
              ),
              submenu(
                "ai-create",
                "AI 创作",
                [
                  item(
                    "create-reference",
                    "作为参考图新建生成",
                    <ImageIcon className="size-4" />,
                    () => createReferenceGenerationFromImages(selectedImages),
                  ),
                  item(
                    "story-director",
                    "故事导演节点",
                    <Clapperboard className="size-4" />,
                    () => createStoryDirectorFromImages(selectedImages),
                  ),
                  item(
                    "regen-style",
                    "保持风格重绘",
                    <Sparkles className="size-4" />,
                    () => createReferenceGenerationFromImages(selectedImages),
                  ),
                  item(
                    "regen-composition",
                    "保持构图重绘",
                    <LayoutGrid className="size-4" />,
                    () => createReferenceGenerationFromImages(selectedImages),
                  ),
                  item(
                    "regen-prompt",
                    "指定 Prompt 生成",
                    <MessageSquare className="size-4" />,
                    () => createReferenceGenerationFromImages(selectedImages),
                  ),
                ],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "image-enhance",
                "图片增强",
                [
                  item(
                    "upscale-2x",
                    "AI 高清放大",
                    <ZoomIn className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        enhancePreset(
                          "AI 高清放大",
                          "提升清晰度、边缘细节、材质纹理和整体画质，修复轻微模糊与压缩痕迹。",
                          "medium",
                        ),
                      ),
                  ),
                  item(
                    "upscale-4x",
                    "AI 4K 修复",
                    <ZoomIn className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        enhancePreset(
                          "AI 4K 修复",
                          "大幅提升细节密度、边缘锐度、材质纹理和高频细节，修复低分辨率、模糊、压缩噪点和细节断裂。",
                          "high",
                        ),
                      ),
                  ),
                  item(
                    "denoise",
                    "AI 去噪增强",
                    <WandSparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        enhancePreset(
                          "AI 去噪增强",
                          "去除噪点、脏污、压缩块和不自然颗粒，同时保留真实纹理、边缘结构和自然光影。",
                          "high",
                        ),
                      ),
                  ),
                ],
                <ZoomIn className="size-4" />,
              ),
              submenu(
                "image-outpaint",
                "画面扩展",
                [
                  item(
                    "outpaint-1-1",
                    "扩展为 1:1",
                    <Maximize2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("1:1"),
                      ),
                  ),
                  item(
                    "outpaint-16-9",
                    "扩展为 16:9",
                    <Maximize2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("16:9"),
                      ),
                  ),
                  item(
                    "outpaint-9-16",
                    "扩展为 9:16",
                    <Maximize2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("9:16"),
                      ),
                  ),
                  item(
                    "outpaint-custom",
                    "自定义比例",
                    <Settings2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("auto"),
                      ),
                  ),
                ],
                <Maximize2 className="size-4" />,
              ),
              submenu(
                "style-transfer",
                "风格迁移",
                [
                  item(
                    "style-real",
                    "写实风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "写实风格",
                          "高质量写实摄影风格，真实自然的材质、光影、景深和色彩",
                        ),
                      ),
                  ),
                  item(
                    "style-anime",
                    "动漫风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "动漫风格",
                          "精致动漫插画风格，清晰线条、干净色块、柔和光影和角色化表现",
                        ),
                      ),
                  ),
                  item(
                    "style-cinematic",
                    "电影风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "电影风格",
                          "电影剧照风格，富有层次的布光、镜头感、色彩分级和叙事氛围",
                        ),
                      ),
                  ),
                  item(
                    "style-illustration",
                    "插画风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "插画风格",
                          "精致商业插画风格，统一笔触、清晰形体、设计感构图和丰富细节",
                        ),
                      ),
                  ),
                  item(
                    "style-watercolor",
                    "水彩风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "水彩风格",
                          "透明水彩绘画风格，柔和边缘、纸张肌理、自然晕染和轻盈色彩",
                        ),
                      ),
                  ),
                  item(
                    "style-cyberpunk",
                    "赛博朋克",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "赛博朋克",
                          "赛博朋克视觉风格，霓虹光、强烈冷暖对比、未来城市质感和高反差氛围",
                        ),
                      ),
                  ),
                  item(
                    "style-custom",
                    "自定义参考图",
                    <Upload className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(selectedImages, {
                        title: "自定义风格参考",
                        size: "auto",
                        quality: "high",
                        count: 1,
                        prompt:
                          "根据已连接的参考图片进行风格迁移。请在组装提示词中补充你想迁移的风格来源、风格关键词或再连接一张风格参考图。保持主体内容和构图稳定，只改变视觉风格、材质、光影、色彩和表现手法。",
                        successMessage: "已创建自定义风格配置",
                      }),
                  ),
                ],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "continue",
                "继续创作",
                [
                  item(
                    "continue-variant",
                    "复制为变体",
                    <Copy className="size-4" />,
                    () => duplicateSelectedNodes(),
                  ),
                  item(
                    "continue-generate",
                    "基于选中图继续生成",
                    <Sparkles className="size-4" />,
                    () => createReferenceGenerationFromImages(selectedImages),
                  ),
                  item(
                    "continue-config",
                    "作为参考图创建配置",
                    <Settings2 className="size-4" />,
                    () => createReferenceGenerationFromImages(selectedImages),
                  ),
                ],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "assets-export",
                "素材与导出",
                [
                  item(
                    "asset-save",
                    "存入素材库",
                    <FolderPlus className="size-4" />,
                    () => void saveSelectedImages(selectedImages),
                  ),
                  item(
                    "asset-download",
                    "下载图片",
                    <Download className="size-4" />,
                    () => downloadSelectedImages(selectedImages),
                  ),
                  item(
                    "asset-retain",
                    "保留选中",
                    <Pin className="size-4" />,
                    () => void retainSelectedImages(selectedImages),
                  ),
                ],
                <FolderPlus className="size-4" />,
              ),
              submenu(
                "arrange",
                "画布整理",
                [
                  item(
                    "align-left",
                    "左对齐",
                    <AlignStartHorizontal className="size-4" />,
                    () => alignSelectedImages("left"),
                  ),
                  item(
                    "align-center",
                    "居中对齐",
                    <AlignCenter className="size-4" />,
                    () => alignSelectedImages("center"),
                  ),
                  item(
                    "align-right",
                    "右对齐",
                    <AlignEndHorizontal className="size-4" />,
                    () => alignSelectedImages("right"),
                  ),
                  item(
                    "distribute-x",
                    "横向均分",
                    <Columns2 className="size-4" />,
                    () => distributeSelectedImages("x"),
                    { disabled: selectedImages.length < 3 },
                  ),
                  item(
                    "distribute-y",
                    "纵向均分",
                    <List className="size-4" />,
                    () => distributeSelectedImages("y"),
                    { disabled: selectedImages.length < 3 },
                  ),
                  item(
                    "auto-arrange",
                    "自动整理",
                    <LayoutGrid className="size-4" />,
                    autoArrangeSelectedImages,
                  ),
                ],
                <LayoutGrid className="size-4" />,
              ),
              submenu(
                "selection-node",
                "节点操作",
                [
                  item(
                    "selection-duplicate",
                    "复制节点",
                    <Copy className="size-4" />,
                    () => duplicateSelectedNodes(),
                  ),
                  item(
                    "selection-delete",
                    "删除选中",
                    <Trash2 className="size-4" />,
                    () =>
                      deleteNodes(
                        new Set(selectedImages.map((image) => image.id)),
                      ),
                    { danger: true },
                  ),
                ],
                <List className="size-4" />,
              ),
            ]),
          },
        ];
      }

      const node = nodesRef.current.find((item) => item.id === menu.nodeId);
      if (!node) return [];
      const isImage = node.type === CanvasNodeType.Image;
      const isText = node.type === CanvasNodeType.Text;
      const isConfig = node.type === CanvasNodeType.Config;
      const isVideo = node.type === CanvasNodeType.Video;
      const isAudio = node.type === CanvasNodeType.Audio;
      const hasContent = Boolean(node.metadata?.content);
      const hasImage = isImage && hasContent;
      const hasVideo = isVideo && hasContent;
      const hasAudio = isAudio && hasContent;
      const closePanels = () => {
        setContextMenu(null);
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
      };
      const action = (run: () => void) => () => {
        closePanels();
        run();
      };
      const item = (
        id: string,
        label: string,
        icon: React.ReactNode | undefined,
        run: () => void,
        options?: Pick<
          CanvasContextMenuItem,
          "danger" | "disabled" | "shortcut" | "submenu" | "children"
        >,
      ): CanvasContextMenuItem => ({
        id,
        label,
        icon,
        onClick: action(run),
        ...options,
      });
      const imageTools = hasImage
        ? buildImageToolbarTools(node, {
            onUpload: (target) => handleUploadRequestRef.current(target.id),
            onToggleFreeResize: (target) => toggleNodeFreeResize(target.id),
            onLayerEdit: (target) => setLayerEditNodeId(target.id),
            onMaskEdit: (target) => setMaskEditNodeId(target.id),
            onCrop: (target) => setCropNodeId(target.id),
            onSplit: (target) => setSplitNodeId(target.id),
            onUpscale: (target) => setUpscaleNodeId(target.id),
            onSuperResolve: (target) => setSuperResolveNodeId(target.id),
            onAngle: (target) => setAngleNodeId(target.id),
            onViewImage: previewNodeImage,
            onCopyPrompt: copyNodePrompt,
            onReversePrompt: createImageReversePromptNodes,
          }).filter((tool) => tool.id !== "superResolve")
        : [];
      const imageToolItem = (id: string) => {
        const tool = imageTools.find((entry) => entry.id === id);
        if (!tool) return null;
        return item(tool.id, tool.label, tool.icon, tool.onClick);
      };
      const imageMenuItem = (id: string, label: string, shortcut?: string) => {
        const tool = imageTools.find((entry) => entry.id === id);
        if (!tool) return null;
        return item(
          tool.id,
          label,
          undefined,
          tool.onClick,
          shortcut ? { shortcut } : undefined,
        );
      };
      const compactMenuItems = (entries: Array<CanvasContextMenuItem | null>) =>
        entries.filter((entry): entry is CanvasContextMenuItem =>
          Boolean(entry),
        );
      const submenu = (
        id: string,
        label: string,
        children: Array<CanvasContextMenuItem | null>,
        icon?: React.ReactNode,
      ): CanvasContextMenuItem | null => {
        const compactChildren = compactMenuItems(children);
        if (!compactChildren.length) return null;
        return {
          id,
          label,
          icon,
          onClick: () => undefined,
          children: compactChildren,
        };
      };

      if (hasImage) {
        return [
          {
            items: compactMenuItems([
              item(
                "download",
                "下载图片",
                <Download className="size-4" />,
                () => downloadNodeImage(node),
                { shortcut: "⌘D" },
              ),
              item(
                "regenerate-image",
                "重新生成图片",
                <Redo2 className="size-4" />,
                () => handleRetryNodeRef.current(node),
                { disabled: node.metadata?.status === NODE_STATUS_LOADING },
              ),
              item(
                "replace",
                "上传替换图片",
                <Upload className="size-4" />,
                () => handleUploadRequestRef.current(node.id),
              ),
              item(
                "replace-from-canvas",
                "从画布选图替换",
                <Images className="size-4" />,
                () => setReplacePickerNodeId(node.id),
              ),
              item(
                "copy-image",
                "复制图片",
                <Clipboard className="size-4" />,
                () => void copyNodeImageToSystemClipboard(node),
                { shortcut: "⌘C" },
              ),
              item(
                "seedance2-face-edit",
                "Seedance2 人脸迁移",
                <Layers3 className="size-4" />,
                () => setSeedance2FaceEditNodeId(node.id),
              ),
              submenu(
                "image-edit",
                "编辑图片",
                [
                  item(
                    "edit",
                    "打开编辑面板",
                    <MessageSquare className="size-4" />,
                    () =>
                      setDialogNodeId((current) =>
                        current === node.id ? null : node.id,
                      ),
                    { shortcut: "⌘E" },
                  ),
                  item(
                    "seedance2-face-restore-original",
                    "还原 Seedance2 原图",
                    <Undo2 className="size-4" />,
                    () => restoreSeedance2FaceEditOriginalImageNode(node),
                    { disabled: !node.metadata?.seedance2FaceEditOriginal },
                  ),
                  imageToolItem("maskEdit") ||
                    item(
                      "maskEdit",
                      "局部编辑",
                      <Brush className="size-4" />,
                      () => setMaskEditNodeId(node.id),
                      { shortcut: "⌘L" },
                    ),
                  imageToolItem("layerEdit"),
                  imageToolItem("crop"),
                  imageToolItem("split"),
                  imageToolItem("resize"),
                ],
                <Pencil className="size-4" />,
              ),
              submenu(
                "image-generate",
                "生成增强",
                [
                  item(
                    "story-director",
                    "故事导演节点",
                    <Clapperboard className="size-4" />,
                    () => createStoryDirectorFromImages([node]),
                  ),
                  imageToolItem("reversePrompt"),
                  imageToolItem("angle"),
                  imageToolItem("upscale"),
                ],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "image-actions",
                "图片操作",
                [
                  imageToolItem("replace") ||
                    item(
                      "replace",
                      "替换图片",
                      <Upload className="size-4" />,
                      () => handleUploadRequestRef.current(node.id),
                    ),
                  imageToolItem("view"),
                  imageMenuItem("copyPrompt", "复制提示词", "⌘C") ||
                    item(
                      "copyPrompt",
                      "复制提示词",
                      <Copy className="size-4" />,
                      () => copyNodePrompt(node),
                      { shortcut: "⌘C" },
                    ),
                ],
                <ImageIcon className="size-4" />,
              ),
              submenu(
                "image-assets",
                "素材与导出",
                [
                  item(
                    "saveAsset",
                    "存素材",
                    <FolderPlus className="size-4" />,
                    () => void saveNodeAsset(node),
                  ),
                  item(
                    "download-sub",
                    "下载图片",
                    <Download className="size-4" />,
                    () => downloadNodeImage(node),
                    { shortcut: "⌘D" },
                  ),
                  item(
                    "retain",
                    node.metadata?.retained ? "取消保留" : "保留",
                    node.metadata?.retained ? (
                      <PinOff className="size-4" />
                    ) : (
                      <Pin className="size-4" />
                    ),
                    () => void toggleRetainNodeImage(node),
                  ),
                ],
                <FolderPlus className="size-4" />,
              ),
            ]),
          },
          {
            items: compactMenuItems([
              submenu(
                "node-actions",
                "节点操作",
                [
                  item("info", "信息", <List className="size-4" />, () =>
                    setInfoNodeId(node.id),
                  ),
                  item(
                    "duplicate",
                    "复制节点",
                    <Copy className="size-4" />,
                    () => duplicateNode(node.id),
                  ),
                  item(
                    "delete",
                    "删除",
                    <Trash2 className="size-4" />,
                    () => deleteNodes(new Set([node.id])),
                    { danger: true },
                  ),
                ],
                <List className="size-4" />,
              ),
            ]),
          },
        ];
      }

      if (isText) {
        return [
          {
            items: [
              item("info", "信息", <List className="size-4" />, () =>
                setInfoNodeId(node.id),
              ),
              item("editText", "编辑文字", <Pencil className="size-4" />, () =>
                openTextEditor(node),
              ),
              item(
                "generateImage",
                "用文本生图",
                <ImageIcon className="size-4" />,
                () => generateImageFromTextNodeRef.current(node),
              ),
              item(
                "story-director",
                "故事导演节点",
                <Clapperboard className="size-4" />,
                () => createStoryDirectorFromImages([node]),
              ),
              item(
                "saveAsset",
                "存素材",
                <FolderPlus className="size-4" />,
                () => void saveNodeAsset(node),
              ),
              item(
                "decreaseFont",
                "减小字号",
                <Minus className="size-4" />,
                () =>
                  handleFontSizeChangeRef.current(
                    node.id,
                    Math.max(10, (node.metadata?.fontSize || 14) - 2),
                  ),
              ),
              item(
                "increaseFont",
                "增大字号",
                <Plus className="size-4" />,
                () =>
                  handleFontSizeChangeRef.current(
                    node.id,
                    Math.min(32, (node.metadata?.fontSize || 14) + 2),
                  ),
              ),
            ],
          },
          {
            title: "节点操作",
            items: [
              item("duplicate", "复制节点", <Copy className="size-4" />, () =>
                duplicateNode(node.id),
              ),
              item(
                "delete",
                "删除",
                <Trash2 className="size-4" />,
                () => deleteNodes(new Set([node.id])),
                { danger: true },
              ),
            ],
          },
        ];
      }

      if (isConfig) {
        return [
          {
            items: [
              item("info", "信息", <List className="size-4" />, () =>
                setInfoNodeId(node.id),
              ),
              item(
                "config",
                "打开生成配置",
                <Settings2 className="size-4" />,
                () =>
                  setDialogNodeId((current) =>
                    current === node.id ? null : node.id,
                  ),
              ),
            ],
          },
          {
            title: "节点操作",
            items: [
              item("duplicate", "复制节点", <Copy className="size-4" />, () =>
                duplicateNode(node.id),
              ),
              item(
                "delete",
                "删除",
                <Trash2 className="size-4" />,
                () => deleteNodes(new Set([node.id])),
                { danger: true },
              ),
            ],
          },
        ];
      }

      return [
        {
          items: [
            item("info", "信息", <List className="size-4" />, () =>
              setInfoNodeId(node.id),
            ),
            ...(hasVideo || hasAudio
              ? [
                  item(
                    "download",
                    hasAudio ? "下载音频" : "下载视频",
                    <Download className="size-4" />,
                    () => downloadNodeImage(node),
                  ),
                ]
              : []),
            ...(isVideo || isAudio
              ? [
                  item(
                    "replace-media",
                    hasContent
                      ? isAudio
                        ? "替换音频"
                        : "替换视频"
                      : isAudio
                        ? "上传音频"
                        : "上传视频",
                    <Upload className="size-4" />,
                    () => handleUploadRequestRef.current(node.id),
                  ),
                ]
              : []),
          ],
        },
        {
          title: "节点操作",
          items: [
            item("duplicate", "复制节点", <Copy className="size-4" />, () =>
              duplicateNode(node.id),
            ),
            item(
              "delete",
              "删除",
              <Trash2 className="size-4" />,
              () => deleteNodes(new Set([node.id])),
              { danger: true },
            ),
          ],
        },
      ];
    },
    [
      alignSelectedImages,
      autoArrangeSelectedImages,
      copyNodePrompt,
      copyNodeImageToSystemClipboard,
      createReferenceGenerationFromImages,
      createStoryDirectorFromImages,
      createImageReversePromptNodes,
      deleteConnection,
      deleteNodes,
      distributeSelectedImages,
      downloadSelectedImages,
      downloadNodeImage,
      duplicateNode,
      duplicateSelectedNodes,
      message,
      openTextEditor,
      openImageCompare,
      retainSelectedImages,
      restoreSeedance2FaceEditOriginalImageNode,
      saveNodeAsset,
      saveSelectedImages,
      toggleNodeFreeResize,
      toggleRetainNodeImage,
    ],
  );

  const handleFontSizeChange = useCallback(
    (nodeId: string, fontSize: number) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? { ...node, metadata: { ...node.metadata, fontSize } }
            : node,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    handleFontSizeChangeRef.current = handleFontSizeChange;
  }, [handleFontSizeChange]);

  const handleUploadRequest = useCallback(
    (nodeId?: string, position?: Position) => {
      uploadTargetRef.current = { nodeId, position };
      imageInputRef.current?.click();
    },
    [],
  );

  useEffect(() => {
    handleUploadRequestRef.current = handleUploadRequest;
  }, [handleUploadRequest]);

  const handleImageInputChange = useCallback(
    async (event: ReactChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []).filter(
        isSupportedCanvasFile,
      );
      const file = files[0];
      const target = uploadTargetRef.current;
      if (!file) return;

      if (target?.nodeId) {
        if (isAudioFile(file)) {
          const audio = await uploadMediaFile(file, "audio");
          const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
          setNodes((prev) =>
            prev.map((node) =>
              node.id === target.nodeId
                ? {
                    ...node,
                    type: CanvasNodeType.Audio,
                    title: file.name,
                    position: {
                      x: node.position.x + node.width / 2 - spec.width / 2,
                      y: node.position.y + node.height / 2 - spec.height / 2,
                    },
                    width: spec.width,
                    height: spec.height,
                    metadata: {
                      ...node.metadata,
                      ...audioMetadata(audio),
                      errorDetails: undefined,
                    },
                  }
                : node,
            ),
          );
          setSelectedNodeIds(new Set([target.nodeId]));
          setSelectedConnectionId(null);
          uploadTargetRef.current = null;
          event.target.value = "";
          return;
        }
        if (file.type.startsWith("video/")) {
          const video = await uploadMediaFile(file, "video");
          const nextSize = fitNodeSize(
            video.width || 1280,
            video.height || 720,
            VIDEO_NODE_MAX_WIDTH,
            VIDEO_NODE_MAX_HEIGHT,
          );
          setNodes((prev) =>
            prev.map((node) =>
              node.id === target.nodeId
                ? {
                    ...node,
                    type: CanvasNodeType.Video,
                    title: file.name,
                    position: {
                      x: node.position.x + node.width / 2 - nextSize.width / 2,
                      y:
                        node.position.y + node.height / 2 - nextSize.height / 2,
                    },
                    width: nextSize.width,
                    height: nextSize.height,
                    metadata: {
                      ...node.metadata,
                      ...videoMetadata(video),
                      errorDetails: undefined,
                    },
                  }
                : node,
            ),
          );
          setSelectedNodeIds(new Set([target.nodeId]));
          setSelectedConnectionId(null);
          setDialogNodeId(target.nodeId);
          uploadTargetRef.current = null;
          event.target.value = "";
          return;
        }
        const image = await uploadImage(file, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        replaceNodeWithImage(target.nodeId, file.name, image, { retained: true });
      } else {
        const position =
          target?.position ||
          screenToCanvas(
            (containerRef.current?.getBoundingClientRect().left || 0) +
              size.width / 2,
            (containerRef.current?.getBoundingClientRect().top || 0) +
              size.height / 2,
          );
        void createCanvasFileNodes(files, position);
      }

      uploadTargetRef.current = null;
      event.target.value = "";
    },
    [
      createCanvasFileNodes,
      replaceNodeWithImage,
      screenToCanvas,
      size.height,
      size.width,
    ],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer.files).filter(
        isSupportedCanvasFile,
      );
      if (!files.length) return;

      const pos = screenToCanvas(event.clientX, event.clientY);
      void createCanvasFileNodes(files, pos);
    },
    [createCanvasFileNodes, screenToCanvas],
  );

  useEffect(() => {
    const preventFileOpen = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileOpen);
    window.addEventListener("drop", preventFileOpen);
    return () => {
      window.removeEventListener("dragover", preventFileOpen);
      window.removeEventListener("drop", preventFileOpen);
    };
  }, []);

  const pasteAssistantImage = useCallback(
    (file: File) => {
      const position = screenToCanvas(
        (containerRef.current?.getBoundingClientRect().left || 0) +
          size.width / 2,
        (containerRef.current?.getBoundingClientRect().top || 0) +
          size.height / 2,
      );
      void createImageFileNode(file, position);
      message.success("已从剪切板添加图片");
    },
    [createImageFileNode, message, screenToCanvas, size.height, size.width],
  );

  const handleAssistantSessionsChange = useCallback(
    (sessions: CanvasAssistantSession[], activeId: string | null) => {
      setChatSessions(sessions);
      setActiveChatId(activeId);
    },
    [],
  );

  const startTitleEditing = useCallback(() => {
    setTitleDraft(currentProject?.title || "未命名画布");
    setTitleEditing(true);
  }, [currentProject?.title]);

  const finishTitleEditing = useCallback(() => {
    const nextTitle = titleDraft.trim();
    if (nextTitle) renameProject(projectId, nextTitle);
    setTitleEditing(false);
  }, [projectId, renameProject, titleDraft]);

  const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest("[data-node-id]")) return;
    event.preventDefault();
    const selectedImages = nodesRef.current.filter(
      (node) =>
        selectedNodeIdsRef.current.has(node.id) &&
        node.type === CanvasNodeType.Image &&
        Boolean(node.metadata?.content),
    );
    setContextMenu(
      selectedImages.length > 1
        ? {
            type: "selection",
            x: event.clientX,
            y: event.clientY,
            nodeIds: selectedImages.map((node) => node.id),
          }
        : null,
    );
  }, []);

  const generateSeedance2VideoFromPlaceholder = useCallback(
    async (node: CanvasNodeData) => {
      const latest = nodesRef.current.find((item) => item.id === node.id) || node;
      if (
        latest.type !== CanvasNodeType.Video ||
        latest.metadata?.seedanceWorkflowRole !== "placeholder"
      )
        return;

      const prompt = String(
        latest.metadata?.prompt || latest.metadata?.content || "",
      ).trim();
      if (!prompt) {
        message.warning("请先填写视频提示词");
        return;
      }

      const resolvedSlots = resolveSeedance2ReferenceSlots({
        placeholder: latest,
        nodes: nodesRef.current,
        connections: connectionsRef.current,
        visibleSlotCount: seedance2VisibleReferenceSlotCount({
          width: latest.width,
          height: latest.height,
          boundSlotCount: seedance2ManualReferenceHighestSlotIndex(latest),
          isExpanded: latest.metadata?.seedanceReferenceSlotsExpanded === true,
          orientation: seedance2ReferenceSlotOrientation(latest),
        }),
      });
      let references: ReturnType<typeof seedance2ResolvedSlotsToCustomerReferences>;
      try {
        references = await hydrateSeedance2CustomerReferencesForTransport(
          seedance2ResolvedSlotsToCustomerReferences(resolvedSlots),
          imageToDataUrl,
        );
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "参考图读取失败"));
        return;
      }
      const missingRequiredReferences = findMissingSeedance2RequiredReferences(
        latest,
        references,
      );
      if (missingRequiredReferences.length) {
        message.warning(
          `缺少必需参考图：${missingRequiredReferences.join("、")}`,
        );
        return;
      }

      setRunningNodeId(latest.id);
      setToolbarNodeId(null);
      setHoveredNodeId(null);
      const startedAt = new Date().toISOString();
      let currentTaskId: string | undefined;
      let generationErrorStatus: "failed" | "timeout" = "failed";
      const pendingNodes = nodesRef.current.map((item) =>
        item.id === latest.id
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                status: NODE_STATUS_LOADING,
                errorDetails: undefined,
                seedanceGenerationTaskState: {
                  status: "generating" as const,
                  startedAt,
                },
              },
            }
          : item,
      );
      setNodes(pendingNodes);
      persistCanvasSnapshot(pendingNodes);

      try {
        const videoApiConfig = buildCustomerVideoApiConfig(latest, config, effectiveConfig);
        const payload = buildSeedance2CustomerVideoPayload(latest, references, videoApiConfig.model);
        const created = await requestCustomerVideoTask(payload, videoApiConfig);
        const taskId = created.task_id || created.task?.task_id || created.task?.id || created.id;
        if (!taskId) throw new Error("视频接口没有返回 task_id");
        currentTaskId = taskId;

        let task: CustomerVideoTask | undefined = created.task;
        const paramsSnapshot = {
          ratio: payload.ratio,
          duration: String(payload.duration),
          model: payload.model,
        };
        const taskNodes = nodesRef.current.map((item) =>
          item.id === latest.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  seedanceTaskId: taskId,
                  size: payload.ratio,
                  seedanceRatio: payload.ratio,
                  seconds: String(payload.duration),
                  seedanceDuration: String(payload.duration),
                  references: references.map((reference) => reference.value),
                  seedanceGenerationTaskState: {
                    status: "generating" as const,
                    taskId,
                    startedAt,
                  },
                },
              }
            : item,
        );
        setNodes(taskNodes);
        persistCanvasSnapshot(taskNodes);

        for (let attempt = 0; attempt < CUSTOMER_VIDEO_TASK_POLL_RETRY_LIMIT; attempt += 1) {
          task = await fetchCustomerVideoTask(taskId, videoApiConfig);
          if (customerVideoTaskFileUrls(task, videoApiConfig.baseUrl).length > 0) break;
          if (task.status === "failed" || task.status === "canceled") {
            throw new Error(customerVideoTaskError(task));
          }
          await waitCustomerVideoPoll(CUSTOMER_VIDEO_TASK_POLL_INTERVAL_MS);
        }

        if (!isCustomerVideoTaskReady(task, videoApiConfig.baseUrl)) {
          generationErrorStatus = "timeout";
          throw new Error("视频生成超时或未获得视频文件");
        }

        const fileUrls = customerVideoTaskFileUrls(task, videoApiConfig.baseUrl);
        const inserted = insertSeedance2ResultNode(
          nodesRef.current,
          connectionsRef.current,
          latest,
          {
            url: fileUrls[0],
            taskId,
            files: Array.isArray(task.files) ? task.files : [],
            fileUrls,
            watermarkRemoved: task.watermark_removed,
            paramsSnapshot,
          },
        );
        setNodes(inserted.nodes);
        setConnections(inserted.connections);
        persistCanvasSnapshot(inserted.nodes, inserted.connections);
        message.success("视频生成完成");
      } catch (error) {
        const errorDetails = error instanceof Error ? error.message : "视频生成失败";
        const errorNodes = nodesRef.current.map((item) =>
          item.id === latest.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  status: NODE_STATUS_ERROR,
                  errorDetails,
                  seedanceGenerationTaskState: {
                    status: generationErrorStatus,
                    taskId: currentTaskId,
                    errorMessage: errorDetails,
                    ...(generationErrorStatus === "timeout"
                      ? { timedOutAt: new Date().toISOString() }
                      : {}),
                  },
                },
              }
            : item,
        );
        setNodes(errorNodes);
        persistCanvasSnapshot(errorNodes);
        message.error(errorDetails);
      } finally {
        setRunningNodeId(null);
      }
    },
    [config, effectiveConfig, message, persistCanvasSnapshot],
  );

  const handleGenerateNode = useCallback(
    async (
      nodeId: string,
      mode: CanvasNodeGenerationMode,
      prompt: string,
      options?: { referenceImages?: ReferenceImage[] },
    ) => {
      const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
      const generationConfig = buildGenerationConfig(
        effectiveConfig,
        sourceNode,
        mode,
      );
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }

      const directImageRegeneration =
        mode === "image" &&
        sourceNode?.type === CanvasNodeType.Image &&
        Boolean(sourceNode.metadata?.content) &&
        isStoryDirectorGeneratedImage(
          sourceNode,
          nodesRef.current,
          connectionsRef.current,
        );
      if (directImageRegeneration && sourceNode) {
        const selectedStoryTargets = selectedNodeIdsRef.current.has(
          sourceNode.id,
        )
          ? nodesRef.current.filter(
              (node) =>
                selectedNodeIdsRef.current.has(node.id) &&
                node.type === CanvasNodeType.Image &&
                Boolean(node.metadata?.content) &&
                isStoryDirectorGeneratedImage(
                  node,
                  nodesRef.current,
                  connectionsRef.current,
                ),
            )
          : [];
        const regenerationTargets =
          selectedStoryTargets.length > 1 ? selectedStoryTargets : [sourceNode];

        setRunningNodeId(nodeId);
        setToolbarNodeId(null);
        setHoveredNodeId(null);
        setContextMenu(null);
        setDialogNodeId(null);

        let directPendingIds: string[] = [];
        try {
          const directCount = getGenerationCount(generationConfig.count);
          for (const targetNode of regenerationTargets) {
            const directPrompt = upgradeStoryCharacterPromptForRegeneration(
              prompt.trim(),
              targetNode,
            );
            if (!directPrompt) continue;
            const savedReferences = await resolveImageNodeSavedReferences(
              targetNode.metadata || {},
            );
            if (!savedReferences) {
              message.error("参考图片已丢失，无法基于本镜头重新生成");
              const nextNodes = nodesRef.current.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        status: NODE_STATUS_ERROR,
                        errorDetails: "参考图片已丢失，无法基于本镜头重新生成",
                      },
                    }
                  : node,
              );
              setNodes(nextNodes);
              persistCanvasSnapshot(nextNodes);
              continue;
            }
            if (!savedReferences.length && referencesImageLabel(directPrompt)) {
              message.warning(
                "提示词提到了图片编号，但当前节点没有保存可用参考图",
              );
              continue;
            }

            const generationMetadata = buildImageGenerationMetadata(
              savedReferences.length ? "edit" : "generation",
              generationConfig,
              directCount,
              savedReferences,
            );
            const targetIds = Array.from({ length: directCount }, (_, index) =>
              index === 0 ? targetNode.id : nanoid(),
            );
            directPendingIds = [...directPendingIds, ...targetIds];
            const taskIdByTargetId = new Map(
              targetIds.map((id) => [id, `canvas-${id}-${Date.now()}`]),
            );
            const extraNodes: CanvasNodeData[] = targetIds
              .slice(1)
              .map((id, index) => ({
                ...targetNode,
                id,
                position: {
                  x:
                    targetNode.position.x +
                    (index + 1) * (targetNode.width + 36),
                  y: targetNode.position.y,
                },
                metadata: {
                  ...targetNode.metadata,
                  prompt: directPrompt,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                  content: undefined,
                  sourceImageTaskId: taskIdByTargetId.get(id),
                  ...generationMetadata,
                },
              }));
            const pendingNodes = [
              ...nodesRef.current.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        prompt: directPrompt,
                        status: NODE_STATUS_LOADING,
                        errorDetails: undefined,
                        sourceImageTaskId: taskIdByTargetId.get(targetNode.id),
                        ...generationMetadata,
                      },
                    }
                  : node,
              ),
              ...extraNodes,
            ];
            setNodes(pendingNodes);
            persistCanvasSnapshot(pendingNodes);

            await Promise.all(
              targetIds.map(async (targetId) => {
                const taskId =
                  taskIdByTargetId.get(targetId) ||
                  `canvas-${targetId}-${Date.now()}`;
                const pollTaskId = await submitCanvasImageTask(
                  taskId,
                  generationConfig,
                  directPrompt,
                  savedReferences,
                  { useReferenceLabels: true },
                );
                const image = await pollCanvasImageTask(pollTaskId);
                const uploaded = await uploadImage(image.dataUrl);
                const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                const imageSize = imageNodeSize(
                  uploaded.width,
                  uploaded.height,
                  imageConfig.width,
                );
                const nextNodes = nodesRef.current.map((node) => {
                  if (node.id !== targetId) return node;
                  if (node.metadata?.sourceImageTaskId !== taskId) return node;
                  const center = {
                    x: node.position.x + node.width / 2,
                    y: node.position.y + node.height / 2,
                  };
                  return {
                    ...node,
                    width: imageSize.width,
                    height: imageSize.height,
                    position: {
                      x: center.x - imageSize.width / 2,
                      y: center.y - imageSize.height / 2,
                    },
                    metadata: {
                      ...node.metadata,
                      ...imageMetadata(uploaded, image),
                      prompt: directPrompt,
                      ...generationMetadata,
                    },
                  };
                });
                setNodes(nextNodes);
                persistCanvasSnapshot(nextNodes);
              }),
            );
          }
        } catch (error) {
          const errorDetails = formatCanvasGenerationError(error);
          message.error(errorDetails);
          const targetIds = new Set(
            directPendingIds.length
              ? directPendingIds
              : regenerationTargets.map((node) => node.id),
          );
          const nextNodes = nodesRef.current.map((node) =>
            targetIds.has(node.id) && !node.metadata?.content
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : node,
          );
          setNodes(nextNodes);
          persistCanvasSnapshot(nextNodes);
        } finally {
          setRunningNodeId(null);
        }
        return;
      }

      setRunningNodeId(nodeId);
      const sourceTextContent =
        sourceNode?.type === CanvasNodeType.Text
          ? sourceNode.metadata?.content?.trim() || ""
          : "";
      const editingTextNode = mode === "text" && Boolean(sourceTextContent);
      const generationContext = await hydrateNodeGenerationContext(
        buildNodeGenerationContext(
          nodeId,
          nodesRef.current,
          connectionsRef.current,
          editingTextNode
            ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}`
            : prompt,
        ),
      );
      const effectivePrompt = generationContext.prompt.trim();
      const markSourceStatus =
        sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
      const statusPrompt =
        sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
      if (!effectivePrompt && (mode === "text" || mode === "audio")) {
        setRunningNodeId(null);
        return;
      }
      let pendingChildIds: string[] = [];
      if (markSourceStatus)
        setNodes((prev) =>
          prev.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    prompt: statusPrompt,
                    status: NODE_STATUS_LOADING,
                    errorDetails: undefined,
                  },
                }
              : node,
          ),
        );

      try {
        if (mode === "image") {
          const count = getGenerationCount(generationConfig.count);
          const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
          const isImageNode = sourceNode?.type === CanvasNodeType.Image;
          const isEmptyImageNode =
            isImageNode && !sourceNode?.metadata?.content;
          const sourceReference: ReferenceImage[] =
            !options?.referenceImages?.length &&
            isImageNode &&
            sourceNode?.metadata?.content
              ? [
                  {
                    id: sourceNode.id,
                    name: `${sourceNode.title || sourceNode.id}.png`,
                    type: sourceNode.metadata.mimeType || "image/png",
                    dataUrl: sourceNode.metadata.content,
                    storageKey: sourceNode.metadata.storageKey,
                  },
                ]
              : [];
          const referenceImages: ReferenceImage[] = options?.referenceImages?.length
            ? options.referenceImages
            : sourceReference.length
              ? sourceReference
              : generationContext.referenceImages;
          const selectedEditTargets =
            isImageNode &&
            sourceNode?.metadata?.content &&
            selectedNodeIdsRef.current.has(sourceNode.id)
              ? nodesRef.current.filter(
                  (node) =>
                    selectedNodeIdsRef.current.has(node.id) &&
                    node.type === CanvasNodeType.Image &&
                    Boolean(node.metadata?.content) &&
                    !isStoryDirectorGeneratedImage(
                      node,
                      nodesRef.current,
                      connectionsRef.current,
                    ),
                )
              : [];
          const editTargetNodes = selectedEditTargets.length ? selectedEditTargets : isImageNode && sourceNode?.metadata?.content && !isStoryDirectorGeneratedImage(sourceNode, nodesRef.current, connectionsRef.current) ? [sourceNode] : [];
          if (editTargetNodes.length) {
            const editSourceNode = sourceNode || editTargetNodes[0];
            const editCount = Math.max(1, count);
            const parentPosition = editSourceNode.position;
            const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const promptNode = createPromptNodeForGeneration(effectivePrompt, {
              x: parentPosition.x + editSourceNode.width + 96,
              y:
                parentPosition.y +
                editSourceNode.height / 2 -
                textConfig.height / 2,
            });
            const editReferences = editTargetNodes.flatMap((targetNode) =>
              canvasImageReferenceFromNode(
                targetNode,
                `${targetNode.title || targetNode.id}.png`,
              ),
            );
            if (!editReferences.length) {
              setRunningNodeId(null);
              return;
            }
            const resultIds = Array.from({ length: editCount }, () => nanoid());
            let nextSequenceNumber = nextImageSequenceNumber(nodesRef.current);
            pendingChildIds = [promptNode.id, ...resultIds];
            const generationMetadata = buildImageGenerationMetadata(
              "edit",
              generationConfig,
              editCount,
              editReferences,
            );
            const resultNodes: CanvasNodeData[] = resultIds.map((id, index) => {
              const column = Math.floor(index / 3);
              const row = index % 3;
              const rowsInColumn = Math.min(3, resultIds.length - column * 3);
              const columnHeight =
                rowsInColumn * imageConfig.height +
                Math.max(rowsInColumn - 1, 0) * 36;
              return {
                id,
                type: CanvasNodeType.Image,
                title: effectivePrompt.slice(0, 32) || "Edited Image",
                position: {
                  x:
                    promptNode.position.x +
                    promptNode.width +
                    96 +
                    column * (imageConfig.width + 120),
                  y:
                    promptNode.position.y +
                    promptNode.height / 2 -
                    columnHeight / 2 +
                    row * (imageConfig.height + 36),
                },
                width: imageConfig.width,
                height: imageConfig.height,
                metadata: {
                  prompt: effectivePrompt,
                  imageSequenceNumber: nextSequenceNumber++,
                  status: NODE_STATUS_LOADING,
                  ...generationMetadata,
                },
              };
            });
            const pendingNodes = [
              ...nodesRef.current.map((node) =>
                node.id === editSourceNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        prompt,
                        status: NODE_STATUS_SUCCESS,
                        errorDetails: undefined,
                      },
                    }
                  : node,
              ),
              promptNode,
              ...resultNodes,
            ];
            const pendingConnections = [
              ...connectionsRef.current,
              ...editTargetNodes.map((targetNode) => ({
                id: nanoid(),
                fromNodeId: targetNode.id,
                toNodeId: promptNode.id,
              })),
              ...resultNodes.map((resultNode) => ({
                id: nanoid(),
                fromNodeId: promptNode.id,
                toNodeId: resultNode.id,
              })),
            ];
            setNodes(pendingNodes);
            setConnections(pendingConnections);
            persistCanvasSnapshot(pendingNodes, pendingConnections);
            setSelectedNodeIds(new Set([resultNodes[0].id]));
            setSelectedConnectionId(null);
            setDialogNodeId(resultNodes[0].id);

            let hasSuccess = false;
            let hasFailure = false;
            await Promise.all(
              resultIds.map(async (resultId) => {
                const taskId = `canvas-${resultId}`;
                try {
                  const taskNodes = nodesRef.current.map((node) =>
                    node.id === resultId
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            sourceImageTaskId: taskId,
                          },
                        }
                      : node,
                  );
                  setNodes(taskNodes);
                  persistCanvasSnapshot(taskNodes);
                  const pollTaskId = await submitCanvasImageTask(
                    taskId,
                    generationConfig,
                    effectivePrompt,
                    editReferences,
                  );
                  const image = await pollCanvasImageTask(pollTaskId);
                  const uploaded = await uploadImage(image.dataUrl);
                  hasSuccess = true;
                  const imageSize = imageNodeSize(
                    uploaded.width,
                    uploaded.height,
                    imageConfig.width,
                  );
                  const nextNodes = nodesRef.current.map((node) => {
                    if (node.id !== resultId) return node;
                    if (node.metadata?.sourceImageTaskId !== taskId)
                      return node;
                    const center = {
                      x: node.position.x + node.width / 2,
                      y: node.position.y + node.height / 2,
                    };
                    return {
                      ...node,
                      position: {
                        x: center.x - imageSize.width / 2,
                        y: center.y - imageSize.height / 2,
                      },
                      width: imageSize.width,
                      height: imageSize.height,
                      metadata: {
                        ...node.metadata,
                        ...imageMetadata(uploaded, image),
                      },
                    };
                  });
                  setNodes(nextNodes);
                  persistCanvasSnapshot(nextNodes);
                } catch (error) {
                  hasFailure = true;
                  const errorDetails =
                    error instanceof Error ? error.message : "图片保存失败";
                  const nextNodes = nodesRef.current.map((node) =>
                    node.id === resultId &&
                    node.metadata?.sourceImageTaskId === taskId &&
                    !node.metadata?.content
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            status: NODE_STATUS_ERROR,
                            errorDetails,
                          },
                        }
                      : node,
                  );
                  setNodes(nextNodes);
                  persistCanvasSnapshot(nextNodes);
                }
              }),
            );
            if (hasFailure)
              message.error(
                hasSuccess ? "部分图片生成失败" : "全部图片生成失败",
              );
            return;
          }
          if (
            shouldUseStoryDirectorGenerationRules(
              sourceNode,
              nodesRef.current,
              connectionsRef.current,
            ) &&
            !referenceImages.length &&
            referencesImageLabel(effectivePrompt)
          ) {
            message.warning(
              "提示词提到了图片编号，但没有收集到参考图，请检查连线",
            );
            setRunningNodeId(null);
            return;
          }
          const generationType = referenceImages.length
            ? ("edit" as const)
            : ("generation" as const);
          const generationMetadata = buildImageGenerationMetadata(
            generationType,
            generationConfig,
            count,
            referenceImages,
          );
          const parentConfig =
            NODE_DEFAULT_SIZE[
              isConfigNode
                ? CanvasNodeType.Config
                : isImageNode
                  ? CanvasNodeType.Image
                  : CanvasNodeType.Text
            ];
          const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
          const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
          const parentPosition = sourceNode?.position || { x: 0, y: 0 };
          const gap = 96;
          const rowGap = 36;
          const resultGap = 120;
          const shouldUseCurrentNodeAsPrompt =
            isEmptyImageNode || (!isConfigNode && !isImageNode);
          const shouldCreatePromptNode = isImageNode && !isEmptyImageNode;
          const promptNodePosition = {
            x: parentPosition.x + parentConfig.width + gap,
            y:
              parentPosition.y +
              parentConfig.height / 2 -
              textConfig.height / 2,
          };
          const promptNode = shouldCreatePromptNode
            ? createPromptNodeForGeneration(effectivePrompt, promptNodePosition)
            : null;
          const shouldReplaceCurrentImageNode = isEmptyImageNode && count === 1;
          const targetIds = Array.from({ length: count }, (_, index) =>
            shouldReplaceCurrentImageNode && index === 0 ? nodeId : nanoid(),
          );
          const newTargetIds = shouldReplaceCurrentImageNode
            ? targetIds.slice(1)
            : targetIds;
          const rootId = targetIds[0];
          let nextSequenceNumber = nextImageSequenceNumber(nodesRef.current);
          pendingChildIds = [
            ...newTargetIds,
            ...(promptNode ? [promptNode.id] : []),
          ];
          const resultAnchor = promptNode || sourceNode;
          const resultAnchorPosition = resultAnchor?.position || parentPosition;
          const resultAnchorWidth = resultAnchor?.width || parentConfig.width;
          const resultAnchorHeight =
            resultAnchor?.height || parentConfig.height;
          const resultColumnSize = 3;
          const resultBaseX = resultAnchorPosition.x + resultAnchorWidth + gap;
          const resultCenterY = resultAnchorPosition.y + resultAnchorHeight / 2;
          const resultNodes: CanvasNodeData[] = targetIds.map((id, index) => {
            const column = Math.floor(index / resultColumnSize);
            const row = index % resultColumnSize;
            const rowsInColumn = Math.min(
              resultColumnSize,
              count - column * resultColumnSize,
            );
            const columnHeight =
              rowsInColumn * imageConfig.height +
              Math.max(rowsInColumn - 1, 0) * rowGap;
            return {
              id,
              type: CanvasNodeType.Image,
              title: effectivePrompt.slice(0, 32) || "Generated Image",
              position: {
                x: resultBaseX + column * (imageConfig.width + resultGap),
                y:
                  resultCenterY -
                  columnHeight / 2 +
                  row * (imageConfig.height + rowGap),
              },
              width: imageConfig.width,
              height: imageConfig.height,
              metadata: {
                prompt: effectivePrompt,
                imageSequenceNumber:
                  shouldReplaceCurrentImageNode &&
                  index === 0 &&
                  sourceNode?.metadata?.imageSequenceNumber
                    ? sourceNode.metadata.imageSequenceNumber
                    : nextSequenceNumber++,
                status: NODE_STATUS_LOADING,
                ...generationMetadata,
              },
            };
          });
          const newResultNodes = shouldReplaceCurrentImageNode
            ? resultNodes.slice(1)
            : resultNodes;
          const batchConnections = promptNode
            ? [
                { id: nanoid(), fromNodeId: nodeId, toNodeId: promptNode.id },
                ...targetIds.map((targetId) => ({
                  id: nanoid(),
                  fromNodeId: promptNode.id,
                  toNodeId: targetId,
                })),
              ]
            : newTargetIds.map((targetId) => ({
                id: nanoid(),
                fromNodeId: nodeId,
                toNodeId: targetId,
              }));

          const pendingNodes = [
            ...nodesRef.current.map((node) =>
              node.id === nodeId
                ? isConfigNode
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        prompt: effectivePrompt,
                        status: NODE_STATUS_LOADING,
                        errorDetails: undefined,
                      },
                    }
                  : shouldReplaceCurrentImageNode
                    ? {
                        ...node,
                        ...resultNodes[0],
                        position: node.position,
                        metadata: {
                          ...node.metadata,
                          ...resultNodes[0].metadata,
                        },
                      }
                    : shouldUseCurrentNodeAsPrompt
                      ? {
                          ...node,
                          type: CanvasNodeType.Text,
                          title: "提示词",
                          width: textConfig.width,
                          height: textConfig.height,
                          metadata: {
                            ...node.metadata,
                            content: effectivePrompt,
                            prompt: effectivePrompt,
                            status: NODE_STATUS_SUCCESS,
                            fontSize: 14,
                            errorDetails: undefined,
                          },
                        }
                      : isImageNode
                        ? {
                            ...node,
                            metadata: {
                              ...node.metadata,
                              prompt,
                              status: NODE_STATUS_SUCCESS,
                              errorDetails: undefined,
                            },
                          }
                        : {
                            ...node,
                            type: CanvasNodeType.Text,
                            title: prompt.slice(0, 32) || "Prompt",
                            width: parentConfig.width,
                            height: parentConfig.height,
                            metadata: {
                              ...node.metadata,
                              content: prompt,
                              prompt,
                              status: NODE_STATUS_SUCCESS,
                              fontSize: 14,
                              errorDetails: undefined,
                            },
                          }
                : node,
            ),
            ...(promptNode ? [promptNode] : []),
            ...newResultNodes,
          ];
          const pendingConnections = [
            ...connectionsRef.current,
            ...batchConnections,
          ];
          setNodes(pendingNodes);
          setConnections(pendingConnections);
          persistCanvasSnapshot(pendingNodes, pendingConnections);
          setSelectedNodeIds(new Set([rootId]));
          setSelectedConnectionId(null);
          setDialogNodeId(rootId);

          let hasSuccess = false;
          let hasFailure = false;
          await Promise.all(
            targetIds.map(async (targetId) => {
              const taskId = `canvas-${targetId}`;
              try {
                const taskNodes = nodesRef.current.map((node) =>
                  node.id === targetId
                    ? {
                        ...node,
                        metadata: {
                          ...node.metadata,
                          sourceImageTaskId: taskId,
                        },
                      }
                    : node,
                );
                setNodes(taskNodes);
                persistCanvasSnapshot(taskNodes);
                const pollTaskId = await submitCanvasImageTask(
                  taskId,
                  generationConfig,
                  effectivePrompt,
                  referenceImages,
                  {
                    useReferenceLabels: shouldUseStoryDirectorGenerationRules(
                      sourceNode,
                      nodesRef.current,
                      connectionsRef.current,
                    ),
                  },
                );
                const image = await pollCanvasImageTask(pollTaskId);
                const uploaded = await uploadImage(image.dataUrl);
                hasSuccess = true;
                const imageSize = imageNodeSize(
                  uploaded.width,
                  uploaded.height,
                  imageConfig.width,
                );
                const nextNodes = nodesRef.current.map((node) => {
                  if (node.id !== targetId) return node;
                  if (node.metadata?.sourceImageTaskId !== taskId) return node;
                  const center = {
                    x: node.position.x + node.width / 2,
                    y: node.position.y + node.height / 2,
                  };
                  return {
                    ...node,
                    position: {
                      x: center.x - imageSize.width / 2,
                      y: center.y - imageSize.height / 2,
                    },
                    width: imageSize.width,
                    height: imageSize.height,
                    metadata: {
                      ...node.metadata,
                      ...imageMetadata(uploaded, image),
                    },
                  };
                });
                setNodes(nextNodes);
                persistCanvasSnapshot(nextNodes);
                if (isConfigNode) {
                  const configDoneNodes = nodesRef.current.map((node) =>
                    node.id === nodeId
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            status: NODE_STATUS_SUCCESS,
                            errorDetails: undefined,
                          },
                        }
                      : node,
                  );
                  setNodes(configDoneNodes);
                  persistCanvasSnapshot(configDoneNodes);
                }
              } catch (error) {
                hasFailure = true;
                const errorDetails =
                  error instanceof Error ? error.message : "图片保存失败";
                const nextNodes = nodesRef.current.map((node) =>
                  node.id === targetId &&
                  node.metadata?.sourceImageTaskId === taskId &&
                  !node.metadata?.content
                    ? {
                        ...node,
                        metadata: {
                          ...node.metadata,
                          status: NODE_STATUS_ERROR,
                          errorDetails,
                        },
                      }
                    : node,
                );
                setNodes(nextNodes);
                persistCanvasSnapshot(nextNodes);
              }
            }),
          );
          if (hasFailure)
            message.error(hasSuccess ? "部分图片生成失败" : "全部图片生成失败");
          const finalNodes = nodesRef.current.map((node) =>
            node.id === nodeId && isConfigNode
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: hasSuccess
                      ? NODE_STATUS_SUCCESS
                      : NODE_STATUS_ERROR,
                    errorDetails: hasSuccess ? undefined : "全部图片生成失败",
                  },
                }
              : node.id === rootId && !hasSuccess
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      status: NODE_STATUS_ERROR,
                      errorDetails: "全部图片生成失败",
                    },
                  }
                : node,
          );
          setNodes(finalNodes);
          persistCanvasSnapshot(finalNodes);
          return;
        }

        if (mode === "video") {
          const spec =
            nodeSizeFromRatio(
              generationConfig.size,
              NODE_DEFAULT_SIZE[CanvasNodeType.Video].width,
              NODE_DEFAULT_SIZE[CanvasNodeType.Video].height,
            ) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
          const isEmptyVideoNode =
            sourceNode?.type === CanvasNodeType.Video &&
            !sourceNode.metadata?.content;
          const videoId = isEmptyVideoNode ? nodeId : nanoid();
          const parent = sourceNode?.position || { x: 0, y: 0 };
          const videoNode: CanvasNodeData = {
            id: videoId,
            type: CanvasNodeType.Video,
            title: effectivePrompt.slice(0, 32) || "Generated Video",
            position: isEmptyVideoNode
              ? sourceNode.position
              : {
                  x: parent.x + (sourceNode?.width || spec.width) + 96,
                  y: parent.y,
                },
            width: isEmptyVideoNode ? sourceNode.width : spec.width,
            height: isEmptyVideoNode ? sourceNode.height : spec.height,
            metadata: {
              prompt: effectivePrompt,
              status: NODE_STATUS_LOADING,
              model: generationConfig.model,
              size: generationConfig.size,
              seconds: generationConfig.videoSeconds,
              vquality: generationConfig.vquality,
              generateAudio: generationConfig.videoGenerateAudio,
              watermark: generationConfig.videoWatermark,
              references: generationReferenceUrls(generationContext),
            },
          };
          pendingChildIds = [videoId];
          setNodes((prev) =>
            isEmptyVideoNode
              ? prev.map((node) =>
                  node.id === nodeId ? { ...node, ...videoNode } : node,
                )
              : [
                  ...prev.map((node) =>
                    node.id === nodeId
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            status: NODE_STATUS_SUCCESS,
                          },
                        }
                      : node,
                  ),
                  videoNode,
                ],
          );
          if (!isEmptyVideoNode)
            setConnections((prev) => [
              ...prev,
              { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId },
            ]);
          const video = await storeGeneratedVideo(
            await requestVideoGeneration(
              generationConfig,
              effectivePrompt,
              generationContext.referenceImages,
              generationContext.referenceVideos,
              generationContext.referenceAudios,
              "videoGeneration",
            ),
          );
          const videoSize = fitNodeSize(
            video.width || spec.width,
            video.height || spec.height,
            VIDEO_NODE_MAX_WIDTH,
            VIDEO_NODE_MAX_HEIGHT,
          );
          setNodes((prev) =>
            prev.map((node) =>
              node.id === videoId
                ? {
                    ...node,
                    width: videoSize.width,
                    height: videoSize.height,
                    position: {
                      x: node.position.x + node.width / 2 - videoSize.width / 2,
                      y:
                        node.position.y +
                        node.height / 2 -
                        videoSize.height / 2,
                    },
                    metadata: {
                      ...node.metadata,
                      ...videoMetadata(video),
                      prompt: effectivePrompt,
                      model: generationConfig.model,
                      size: generationConfig.size,
                      seconds: generationConfig.videoSeconds,
                      vquality: generationConfig.vquality,
                      generateAudio: generationConfig.videoGenerateAudio,
                      watermark: generationConfig.videoWatermark,
                      references: generationReferenceUrls(generationContext),
                    },
                  }
                : node,
            ),
          );
          return;
        }

        if (mode === "audio") {
          const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
          const isEmptyAudioNode =
            sourceNode?.type === CanvasNodeType.Audio &&
            !sourceNode.metadata?.content;
          const audioId = isEmptyAudioNode ? nodeId : nanoid();
          const parent = sourceNode?.position || { x: 0, y: 0 };
          const audioNode: CanvasNodeData = {
            id: audioId,
            type: CanvasNodeType.Audio,
            title: effectivePrompt.slice(0, 32) || "Generated Audio",
            position: isEmptyAudioNode
              ? sourceNode.position
              : {
                  x: parent.x + (sourceNode?.width || spec.width) + 96,
                  y:
                    parent.y +
                    ((sourceNode?.height || spec.height) - spec.height) / 2,
                },
            width: isEmptyAudioNode ? sourceNode.width : spec.width,
            height: isEmptyAudioNode ? sourceNode.height : spec.height,
            metadata: {
              prompt: effectivePrompt,
              status: NODE_STATUS_LOADING,
              ...buildAudioGenerationMetadata(generationConfig),
            },
          };
          pendingChildIds = [audioId];
          setNodes((prev) =>
            isEmptyAudioNode
              ? prev.map((node) =>
                  node.id === nodeId ? { ...node, ...audioNode } : node,
                )
              : [
                  ...prev.map((node) =>
                    node.id === nodeId
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            status: NODE_STATUS_SUCCESS,
                          },
                        }
                      : node,
                  ),
                  audioNode,
                ],
          );
          if (!isEmptyAudioNode)
            setConnections((prev) => [
              ...prev,
              { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId },
            ]);
          const audio = await storeGeneratedAudio(
            await requestAudioGeneration(generationConfig, effectivePrompt),
            generationConfig.audioFormat,
          );
          setNodes((prev) =>
            prev.map((node) =>
              node.id === audioId
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      ...audioMetadata(audio),
                      prompt: effectivePrompt,
                      ...buildAudioGenerationMetadata(generationConfig),
                    },
                  }
                : node,
            ),
          );
          return;
        }

        let streamed = "";
        const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
        const textCount = isConfigNode
          ? getGenerationCount(generationConfig.count)
          : 1;
        const parentConfig =
          NODE_DEFAULT_SIZE[
            isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text
          ];
        const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
        const parentPosition = sourceNode?.position || { x: 0, y: 0 };
        const childIds =
          isConfigNode || editingTextNode
            ? Array.from({ length: textCount }, () => nanoid())
            : [];
        pendingChildIds = childIds;
        if (isConfigNode || editingTextNode) {
          const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
            id,
            type: CanvasNodeType.Text,
            title: effectivePrompt.slice(0, 32) || "Generated Text",
            position: {
              x: parentPosition.x + parentConfig.width + 96,
              y:
                parentPosition.y +
                parentConfig.height / 2 -
                textConfig.height / 2 +
                (index - (textCount - 1) / 2) * (textConfig.height + 36),
            },
            width: textConfig.width,
            height: textConfig.height,
            metadata: {
              prompt: effectivePrompt,
              status: NODE_STATUS_LOADING,
              fontSize: 14,
            },
          }));
          setNodes((prev) => [
            ...prev.map((node) =>
              node.id === nodeId && isConfigNode
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      prompt: effectivePrompt,
                      status: NODE_STATUS_LOADING,
                      errorDetails: undefined,
                    },
                  }
                : node,
            ),
            ...childNodes,
          ]);
          setConnections((prev) => [
            ...prev,
            ...childIds.map((childId) => ({
              id: nanoid(),
              fromNodeId: nodeId,
              toNodeId: childId,
            })),
          ]);
        }

        const answers = await Promise.all(
          (childIds.length ? childIds : [nodeId]).map((targetNodeId) => {
            let localStreamed = "";
            return requestImageQuestion(
              generationConfig,
              buildNodeChatMessages({
                ...generationContext,
                prompt: effectivePrompt,
              }),
              (text) => {
                localStreamed = text;
                streamed = text;
                if (isConfigNode) return;
                setNodes((prev) =>
                  prev.map((node) =>
                    node.id === targetNodeId
                      ? {
                          ...node,
                          type: CanvasNodeType.Text,
                          metadata: {
                            ...node.metadata,
                            content: text,
                            status: NODE_STATUS_LOADING,
                          },
                        }
                      : node,
                  ),
                );
              },
              { boardRouteKey: "imagePrompt" },
            ).then((answer) => ({
              nodeId: targetNodeId,
              content: answer || localStreamed,
            }));
          }),
        );
        const answerByNodeId = new Map(
          answers.map((item) => [item.nodeId, item.content]),
        );
        setNodes((prev) =>
          prev.map((node) =>
            childIds.includes(node.id)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    content: answerByNodeId.get(node.id) || streamed,
                    status: NODE_STATUS_SUCCESS,
                  },
                }
              : node.id === nodeId && isConfigNode
                ? {
                    ...node,
                    metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS },
                  }
                : node.id === nodeId && !editingTextNode
                  ? {
                      ...node,
                      type: CanvasNodeType.Text,
                      title: prompt.slice(0, 32) || "Generated Text",
                      metadata: {
                        ...node.metadata,
                        content: answerByNodeId.get(node.id) || streamed,
                        status: NODE_STATUS_SUCCESS,
                      },
                    }
                  : node,
          ),
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error);
        message.error(errorDetails);
        const nextNodes = nodesRef.current.map((node) =>
          node.id === nodeId || pendingChildIds.includes(node.id)
            ? node.id === nodeId && !markSourceStatus
              ? node
              : {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
            : node,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } finally {
        setRunningNodeId(null);
      }
    },
    [effectiveConfig, openConfigDialog, persistCanvasSnapshot],
  );

  const handleRetryNode = useCallback(
    async (node: CanvasNodeData) => {
      const sourceNode =
        findRetrySourceNode(
          node.id,
          nodesRef.current,
          connectionsRef.current,
        ) || node;
      const retrySourceNode = sourceNode || node;
      const batchRoot = node.metadata?.batchRootId
        ? nodesRef.current.find(
            (item) => item.id === node.metadata?.batchRootId,
          )
        : null;
      const savedImageMetadata =
        node.type === CanvasNodeType.Image
          ? { ...batchRoot?.metadata, ...node.metadata }
          : undefined;
      const hasSavedImageMetadata = Boolean(savedImageMetadata?.generationType);
      const savedGenerationType = savedImageMetadata?.generationType;
      const generationConfig =
        hasSavedImageMetadata && savedImageMetadata
          ? {
              ...effectiveConfig,
              model:
                savedImageMetadata.model &&
                modelMatchesCapability(savedImageMetadata.model, "image")
                  ? savedImageMetadata.model
                  : effectiveConfig.imageModel || effectiveConfig.model,
              quality: savedImageMetadata.quality || effectiveConfig.quality,
              size: savedImageMetadata.size || effectiveConfig.size,
              count: "1",
            }
          : {
              ...buildGenerationConfig(
                effectiveConfig,
                sourceNode,
                node.type === CanvasNodeType.Text
                  ? "text"
                  : node.type === CanvasNodeType.Video
                    ? "video"
                    : node.type === CanvasNodeType.Audio
                      ? "audio"
                      : "image",
              ),
              count: "1",
            };
      const isStoryDirectorImage = isStoryDirectorGeneratedImage(
        node,
        nodesRef.current,
        connectionsRef.current,
      );

      if (
        node.type === CanvasNodeType.Image &&
        node.metadata?.content &&
        !isStoryDirectorImage &&
        savedGenerationType !== "edit"
      ) {
        const recoveredContext = await hydrateNodeGenerationContext(
          buildNodeGenerationContext(
            retrySourceNode.id,
            nodesRef.current,
            connectionsRef.current,
            retrySourceNode.metadata?.prompt || node.metadata?.prompt || "",
          ),
        );
        const prompt = (
          savedImageMetadata?.prompt ||
          recoveredContext?.prompt ||
          node.metadata?.prompt ||
          ""
        ).trim();
        if (!prompt) {
          message.warning("找不到提示词，无法重试");
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      status: NODE_STATUS_ERROR,
                      errorDetails: "找不到提示词，无法重试",
                    },
                  }
                : item,
            ),
          );
          return;
        }

        const upstreamReferenceImages: ReferenceImage[] =
          recoveredContext.referenceImages.length
          ? recoveredContext.referenceImages
          : sourceNodeReferenceImages(batchRoot || retrySourceNode);
        await handleGenerateNode(
          node.id,
          "image",
          prompt,
          upstreamReferenceImages.length
            ? { referenceImages: upstreamReferenceImages }
            : undefined,
        );
        return;
      }

      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: "请先完成模型配置后再重试",
                  },
                }
              : item,
          ),
        );
        return;
      }
      if (node.type === CanvasNodeType.Config) {
        await handleGenerateNode(
          node.id,
          node.metadata?.generationMode || "image",
          node.metadata?.composerContent ?? node.metadata?.prompt ?? "",
        );
        return;
      }

      let context = hasSavedImageMetadata
          ? null
          : await hydrateNodeGenerationContext(
              buildNodeGenerationContext(
                retrySourceNode.id,
                nodesRef.current,
                connectionsRef.current,
                retrySourceNode.metadata?.prompt || node.metadata?.prompt || "",
              ),
            );
      let prompt = (
        savedImageMetadata?.prompt ||
        context?.prompt ||
        ""
      ).trim();
      if (!prompt) {
        message.warning("找不到提示词，无法重试");
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: "找不到提示词，无法重试",
                  },
                }
              : item,
          ),
        );
        return;
      }
      const generationType = savedGenerationType;
      const useReferenceImages = generationType
        ? generationType === "edit"
        : Boolean(context?.referenceImages.length);
      let retryReferenceImages: ReferenceImage[] | null =
        hasSavedImageMetadata && savedImageMetadata
          ? await resolveMetadataReferences(savedImageMetadata)
          : useReferenceImages
            ? context?.referenceImages.length
              ? context.referenceImages
              : sourceNodeReferenceImages(batchRoot || sourceNode)
            : [];
      if (
        useReferenceImages &&
        (!retryReferenceImages || !retryReferenceImages.length) &&
        hasSavedImageMetadata &&
        generationType === "edit"
      ) {
        const recoveredContext = await hydrateNodeGenerationContext(
          buildNodeGenerationContext(
            retrySourceNode.id,
            nodesRef.current,
            connectionsRef.current,
            prompt || retrySourceNode.metadata?.prompt || node.metadata?.prompt || "",
          ),
        );
        if (!prompt) {
          prompt = (recoveredContext?.prompt || "").trim();
        }
        retryReferenceImages = recoveredContext?.referenceImages.length
          ? recoveredContext.referenceImages
          : sourceNodeReferenceImages(batchRoot || retrySourceNode);
        if (retryReferenceImages?.length) {
          message.warning("原始参考图已丢失，已改用上游参考重新生成");
        }
      }
      const hasRetryReferenceImages = Boolean(retryReferenceImages?.length);
      if (useReferenceImages && !hasRetryReferenceImages) {
        message.error("参考图片已丢失，无法继续重试");
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: "参考图片已丢失，无法继续重试",
                  },
                }
              : item,
          ),
        );
        return;
      }
      const retryImages: ReferenceImage[] =
        hasRetryReferenceImages && retryReferenceImages
          ? retryReferenceImages
          : [];
      const retryImageTaskId =
        node.type === CanvasNodeType.Image
          ? `canvas-${node.id}-${Date.now()}`
          : undefined;
      if (retryImageTaskId) {
        resumedImageTaskIdsRef.current.add(retryImageTaskId);
      }

      setRunningNodeId(node.id);

      const retryPendingNodes = nodesRef.current.map((item) =>
        item.id === node.id
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                status: NODE_STATUS_LOADING,
                errorDetails: undefined,
                sourceImageTaskId: retryImageTaskId,
              },
            }
          : item,
      );
      setNodes(retryPendingNodes);
      persistCanvasSnapshot(retryPendingNodes);

      try {
        if (node.type === CanvasNodeType.Text) {
          if (!context) return;
          let streamed = "";
          const answer = await requestImageQuestion(
            generationConfig,
            buildNodeChatMessages({ ...context, prompt }),
            (text) => {
              streamed = text;
              setNodes((prev) =>
                prev.map((item) =>
                  item.id === node.id
                    ? {
                        ...item,
                        type: CanvasNodeType.Text,
                        metadata: {
                          ...item.metadata,
                          content: text,
                          status: NODE_STATUS_LOADING,
                        },
                      }
                    : item,
                  ),
              );
            },
            { boardRouteKey: "imagePrompt" },
          );
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    type: CanvasNodeType.Text,
                    metadata: {
                      ...item.metadata,
                      content: answer || streamed,
                      prompt,
                      status: NODE_STATUS_SUCCESS,
                    },
                  }
                : item,
            ),
          );
          return;
        }
        if (node.type === CanvasNodeType.Video) {
          const video = await storeGeneratedVideo(
            await requestVideoGeneration(
              generationConfig,
              prompt,
              retryImages,
              context?.referenceVideos || [],
              context?.referenceAudios || [],
              "videoGeneration",
            ),
          );
          const videoSize = fitNodeSize(
            video.width || node.width,
            video.height || node.height,
            VIDEO_NODE_MAX_WIDTH,
            VIDEO_NODE_MAX_HEIGHT,
          );
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    width: videoSize.width,
                    height: videoSize.height,
                    position: {
                      x: item.position.x + item.width / 2 - videoSize.width / 2,
                      y:
                        item.position.y +
                        item.height / 2 -
                        videoSize.height / 2,
                    },
                    metadata: {
                      ...item.metadata,
                      ...videoMetadata(video),
                      prompt,
                      model: generationConfig.model,
                      size: generationConfig.size,
                      seconds: generationConfig.videoSeconds,
                      vquality: generationConfig.vquality,
                      generateAudio: generationConfig.videoGenerateAudio,
                      watermark: generationConfig.videoWatermark,
                    },
                  }
                : item,
            ),
          );
          return;
        }
        if (node.type === CanvasNodeType.Audio) {
          const audio = await storeGeneratedAudio(
            await requestAudioGeneration(generationConfig, prompt),
            generationConfig.audioFormat,
          );
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      ...audioMetadata(audio),
                      prompt,
                      ...buildAudioGenerationMetadata(generationConfig),
                    },
                  }
                : item,
            ),
          );
          return;
        }

        const taskId = retryImageTaskId || `canvas-${node.id}-${Date.now()}`;
        const taskNodes = nodesRef.current.map((item) =>
          item.id === node.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                  sourceImageTaskId: taskId,
                },
              }
            : item,
        );
        setNodes(taskNodes);
        persistCanvasSnapshot(taskNodes);
        const pollTaskId = await submitCanvasImageTask(
          taskId,
          generationConfig,
          prompt,
          useReferenceImages ? retryImages : [],
          {
            useReferenceLabels: isStoryDirectorGeneratedImage(
              node,
              nodesRef.current,
              connectionsRef.current,
            ),
          },
        );
        const image = await pollCanvasImageTask(pollTaskId);
        const uploadedImage = await uploadImage(image.dataUrl);
        const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const imageSize = imageNodeSize(
          uploadedImage.width,
          uploadedImage.height,
          imageConfig.width,
      );
      const generationMetadata = savedImageMetadata?.generationType
        ? {
            generationType: savedImageMetadata.generationType,
            model: generationConfig.model,
            size: generationConfig.size,
            quality: generationConfig.quality,
            count: savedImageMetadata.count || 1,
            references:
              savedImageMetadata.references?.length
                ? savedImageMetadata.references
                : generationType === "edit"
                  ? retryImages.map(referenceUrl).filter(
                      (url): url is string => Boolean(url),
                    )
                  : savedImageMetadata.references,
          }
        : buildImageGenerationMetadata(
            useReferenceImages ? "edit" : "generation",
              generationConfig,
              1,
              retryImages,
            );
        const batchRootId = node.metadata?.batchRootId;
        const nextNodes = nodesRef.current.map((item) => {
          if (item.id === node.id) {
            return {
              ...item,
              type: CanvasNodeType.Image,
              width: imageSize.width,
              height: imageSize.height,
              metadata: {
                ...item.metadata,
                ...imageMetadata(uploadedImage, image),
                prompt,
                ...generationMetadata,
              },
            };
          }
          if (
            batchRootId &&
            item.id === batchRootId &&
            !item.metadata?.content
          ) {
            const center = {
              x: item.position.x + item.width / 2,
              y: item.position.y + item.height / 2,
            };
            return {
              ...item,
              width: imageSize.width,
              height: imageSize.height,
              position: {
                x: center.x - imageSize.width / 2,
                y: center.y - imageSize.height / 2,
              },
              metadata: {
                ...item.metadata,
                ...imageMetadata(uploadedImage, image),
                prompt,
                ...generationMetadata,
                status: NODE_STATUS_SUCCESS,
                primaryImageId: node.id,
              },
            };
          }
          return item;
        });
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error);
        message.error(errorDetails);
        const nextNodes = nodesRef.current.map((item) =>
          item.id === node.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  status: NODE_STATUS_ERROR,
                  errorDetails,
                  sourceImageTaskId: undefined,
                },
              }
            : item,
        );
        if (retryImageTaskId) {
          resumedImageTaskIdsRef.current.delete(retryImageTaskId);
        }
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      effectiveConfig,
      handleGenerateNode,
      isAiConfigReady,
      message,
      openConfigDialog,
      persistCanvasSnapshot,
    ],
  );

  useEffect(() => {
    handleRetryNodeRef.current = (node) => void handleRetryNode(node);
  }, [handleRetryNode]);

  const generateImageFromTextNode = useCallback(
    (node: CanvasNodeData) => {
      const prompt = (
        node.metadata?.content ||
        node.metadata?.prompt ||
        ""
      ).trim();
      if (!prompt) {
        message.warning("文本节点为空，无法生图");
        return;
      }
      const sourceNode = nodesRef.current.find((item) => item.id === node.id);
      if (!sourceNode) return;
      const nodeSize = getNodeSpec(CanvasNodeType.Config);
      const configNode = createCanvasNode(
        CanvasNodeType.Config,
        {
          x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
          y: sourceNode.position.y + sourceNode.height / 2,
        },
        {
          prompt: "",
          model: effectiveConfig.imageModel || effectiveConfig.model,
          size: effectiveConfig.size,
          quality: effectiveConfig.quality,
          count: getGenerationCount(
            effectiveConfig.canvasImageCount || effectiveConfig.count,
          ),
        },
      );
      const connection = {
        id: nanoid(),
        fromNodeId: sourceNode.id,
        toNodeId: configNode.id,
      };
      const nextNodes = nodesRef.current
        .map((item) =>
          item.id === sourceNode.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  content: prompt,
                  prompt,
                  status: NODE_STATUS_SUCCESS,
                },
              }
            : item,
        )
        .concat(configNode);
      const nextConnections = [...connectionsRef.current, connection];
      nodesRef.current = nextNodes;
      connectionsRef.current = nextConnections;
      setNodes(nextNodes);
      setConnections(nextConnections);
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
    },
    [
      effectiveConfig.canvasImageCount,
      effectiveConfig.count,
      effectiveConfig.imageModel,
      effectiveConfig.model,
      effectiveConfig.quality,
      effectiveConfig.size,
      message,
    ],
  );

  useEffect(() => {
    generateImageFromTextNodeRef.current = generateImageFromTextNode;
  }, [generateImageFromTextNode]);

  const insertAssistantImage = useCallback(
    async (image: CanvasAssistantImage) => {
      const storedImage = image.storageKey
        ? {
            url: image.dataUrl,
            storageKey: image.storageKey,
            width: 1,
            height: 1,
            bytes: 0,
            mimeType: "image/png",
          }
        : await uploadImage(image.dataUrl);
      const meta =
        storedImage.width === 1 && storedImage.height === 1
          ? await readImageMeta(storedImage.url)
          : storedImage;
      const config = imageNodeSize(meta.width, meta.height);
      const center = screenToCanvas(
        (containerRef.current?.getBoundingClientRect().left || 0) +
          size.width / 2,
        (containerRef.current?.getBoundingClientRect().top || 0) +
          size.height / 2,
      );
      const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const node: CanvasNodeData = {
        id,
        type: CanvasNodeType.Image,
        title: image.prompt.slice(0, 32) || "Generated Image",
        position: {
          x: center.x - config.width / 2,
          y: center.y - config.height / 2,
        },
        width: config.width,
        height: config.height,
        metadata: {
          ...imageMetadata({
            ...storedImage,
            width: meta.width,
            height: meta.height,
          }),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          prompt: image.prompt,
        },
      };

      setNodes((prev) => [...prev, node]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(id);
    },
    [screenToCanvas, size.height, size.width],
  );

  const insertAssistantText = useCallback(
    (text: string) => {
      const center = screenToCanvas(
        (containerRef.current?.getBoundingClientRect().left || 0) +
          size.width / 2,
        (containerRef.current?.getBoundingClientRect().top || 0) +
          size.height / 2,
      );
      const node = {
        ...createCanvasNode(CanvasNodeType.Text, center, {
          content: text,
          status: NODE_STATUS_SUCCESS,
        }),
        title: text.slice(0, 32) || "Assistant Text",
      };

      setNodes((prev) => [...prev, node]);
      setSelectedNodeIds(new Set([node.id]));
      setSelectedConnectionId(null);
    },
    [screenToCanvas, size.height, size.width],
  );

  const handleAssetInsert = useCallback(
    (payload: InsertAssetPayload) => {
      if (payload.kind === "text") {
        insertAssistantText(payload.content);
      } else if (payload.kind === "video") {
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
        const center = screenToCanvas(
          (containerRef.current?.getBoundingClientRect().left || 0) +
            size.width / 2,
          (containerRef.current?.getBoundingClientRect().top || 0) +
            size.height / 2,
        );
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const nextSize = fitNodeSize(
          payload.width || spec.width,
          payload.height || spec.height,
          VIDEO_NODE_MAX_WIDTH,
          VIDEO_NODE_MAX_HEIGHT,
        );
        setNodes((prev) => [
          ...prev,
          {
            id,
            type: CanvasNodeType.Video,
            title: payload.title,
            position: {
              x: center.x - nextSize.width / 2,
              y: center.y - nextSize.height / 2,
            },
            width: nextSize.width,
            height: nextSize.height,
            metadata: {
              content: payload.url,
              storageKey: payload.storageKey,
              status: NODE_STATUS_SUCCESS,
              naturalWidth: payload.width,
              naturalHeight: payload.height,
            },
          },
        ]);
        setSelectedNodeIds(new Set([id]));
      } else {
        insertAssistantImage({
          id: `asset-${Date.now()}`,
          prompt: payload.title,
          dataUrl: payload.dataUrl,
          storageKey: payload.storageKey,
        });
      }
      setAssetPickerOpen(false);
    },
    [
      insertAssistantImage,
      insertAssistantText,
      screenToCanvas,
      size.height,
      size.width,
    ],
  );

  if (restoreError) {
    return (
      <CanvasRestoreErrorShell
        message={restoreError}
        onBack={() => router.push("/canvas/home")}
        onRepair={() => router.push("/canvas-repair")}
      />
    );
  }

  return (
    <main
      className="fixed inset-0 z-[999] flex h-screen w-screen overflow-hidden"
      aria-busy={!projectLoaded}
      style={{
        background: theme.canvas.background,
        color: theme.node.text,
        pointerEvents: projectLoaded ? "auto" : "none",
      }}
    >
      {!projectLoaded ? (
        <div
          className="absolute left-4 top-4 z-[120] rounded-md border px-3 py-2 text-xs shadow-sm"
          style={{
            background: theme.node.panel,
            borderColor: theme.node.stroke,
            color: theme.node.muted,
          }}
        >
          正在读取画布...
        </div>
      ) : null}
      <section className="relative min-w-0 flex-1 overflow-hidden">
        <CanvasTopBar
          title={currentProject?.title || "未命名画布"}
          titleDraft={titleDraft}
          isTitleEditing={titleEditing}
          onTitleDraftChange={setTitleDraft}
          onStartTitleEditing={startTitleEditing}
          onFinishTitleEditing={finishTitleEditing}
          onCancelTitleEditing={() => setTitleEditing(false)}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onHome={() => router.push("/canvas/home")}
          onProjects={() => router.push("/canvas/home")}
          onCreateProject={createAndOpenProject}
          onDeleteProject={deleteCurrentProject}
          onImportImage={() => handleUploadRequest()}
          onUndo={undoCanvas}
          onRedo={redoCanvas}
          generationHistoryOpen={generationHistoryOpen}
          onToggleGenerationHistory={() =>
            setGenerationHistoryOpen((value) => !value)
          }
          assistantCollapsed={assistantCollapsed}
          onExpandAssistant={() => {
            setAssistantMounted(true);
            setAssistantCollapsed(false);
          }}
        />

        <InfiniteCanvas
          containerRef={containerRef}
          viewport={viewport}
          backgroundMode={backgroundMode}
          zoomOnWheel={!selectedConnectionId}
          onViewportChange={(next) => {
            setViewport(next);
            setContextMenu(null);
          }}
          onCanvasMouseDown={handleCanvasMouseDown}
          onCanvasDeselect={deselectCanvas}
          onContextMenu={preventCanvasContextMenu}
          onDrop={handleDrop}
        >
          <svg
            className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible"
            style={{
              pointerEvents: "none",
              transform: "translateZ(0)",
              zIndex: 0,
            }}
          >
            <CanvasConnectionDefs />
            {connections
              .filter((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                return shouldRenderCanvasConnection(connection, from, to, nodes);
              })
              .map((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                if (!from || !to) return null;

                return (
                  <ConnectionPath
                    key={connection.id}
                    connection={connection}
                    from={from}
                    to={to}
                    toPanelOpen={shouldRouteConnectionToFloatingPanel(to, dialogNodeId)}
                    active={
                      selectedConnectionId === connection.id ||
                      relatedHighlight.connectionIds.has(connection.id)
                    }
                    onSelect={() => {
                      setSelectedConnectionId(connection.id);
                      setSelectedNodeIds(new Set());
                      setContextMenu(null);
                    }}
                    onContextMenu={(event) => {
                      setSelectedConnectionId(connection.id);
                      setSelectedNodeIds(new Set());
                      setContextMenu({
                        type: "connection",
                        x: event.clientX,
                        y: event.clientY,
                        connectionId: connection.id,
                      });
                    }}
                  />
                );
              })}
            {connectingParams ? (
              <ActiveConnectionPath
                node={nodeById.get(connectingParams.nodeId)}
                handle={connectingParams}
                mouseWorld={mouseWorld}
                target={connectionTargetNode}
                targetHandleId={connectionTargetHandleId}
                targetPanelOpen={Boolean(
                  connectionTargetNode &&
                  shouldRouteConnectionToFloatingPanel(connectionTargetNode, dialogNodeId),
                )}
              />
            ) : null}
          </svg>

          {visibleNodes.map((node) => (
            <CanvasNode
              key={node.id}
              data={node}
              scale={viewport.k}
              isSelected={selectedNodeIds.has(node.id)}
              isRelated={relatedHighlight.nodeIds.has(node.id)}
              isFocusRelated={activeNodeId === node.id}
              isConnectionTarget={connectionTargetNodeId === node.id}
              connectionTargetHandleId={connectionTargetHandleId}
              isConnecting={Boolean(connectingParams)}
              isRunning={runningNodeId === node.id}
              editRequestNonce={
                editingNodeId === node.id ? editRequestNonce : 0
              }
              showPanel={dialogNodeId === node.id && !selectionBox}
              batchCount={batchChildCountById.get(node.id) || 0}
              batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
              batchClosing={Boolean(
                node.metadata?.batchRootId &&
                collapsingBatchIds.has(node.metadata.batchRootId),
              )}
              batchOpening={openingBatchIds.has(node.id)}
              batchRecovering={collapsingBatchIds.has(node.id)}
              batchMotion={batchMotionById.get(node.id)}
              showImageInfo={showImageInfo}
              resourceLabel={resourceReferenceByNodeId.get(node.id)}
              mentionReferences={mentionReferencesByNodeId.get(node.id) || []}
              seedance2AspectRatioSources={seedance2AspectRatioSourcesByNodeId.get(node.id)}
              seedance2ReferenceSlots={seedance2ReferenceSlotsByNodeId.get(node.id)}
              onMetadataChange={handleNodeMetadataChange}
              onDeleteConnection={deleteConnection}
              renderPanel={(panelNode) =>
                panelNode.type === CanvasNodeType.Config ? (
                  <CanvasConfigComposer
                    value={
                      panelNode.metadata?.composerContent ??
                      panelNode.metadata?.prompt ??
                      ""
                    }
                    inputs={configInputsById.get(panelNode.id) || []}
                    onChange={(composerContent) =>
                      handleConfigNodeChange(panelNode.id, { composerContent })
                    }
                    onClose={() => setDialogNodeId(null)}
                  />
                ) : (
                  <CanvasNodePromptPanel
                    node={panelNode}
                    isRunning={runningNodeId === panelNode.id}
                    mentionReferences={
                      mentionReferencesByNodeId.get(panelNode.id) || []
                    }
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onImageSettingsOpenChange={(open) => {
                      setNodeImageSettingsOpen(open);
                      if (open) setToolbarNodeId(null);
                    }}
                  />
                )
              }
              renderNodeContent={(contentNode) =>
                contentNode.type === CanvasNodeType.StoryDirector ? (
                  <CanvasStoryDirectorPanel
                    node={contentNode}
                    embedded
                    storyDirectorInheritedTextModel={effectiveConfig.textModel || effectiveConfig.model || defaultConfig.textModel}
                    storyDirectorTextModels={storyDirectorTextModels}
                    onConfigChange={handleConfigNodeChange}
                    onAnalyzeStory={(target) =>
                      void analyzeStoryDirector(target)
                    }
                    onGenerateCharacters={(target) =>
                      void generateStoryCharacters(target)
                    }
                    onGenerateShots={(target) =>
                      void generateStoryShots(target)
                    }
                    onRunAll={(target) => void runStoryDirectorAll(target)}
                    onCreateCharacterConfig={(target) =>
                      createStoryDirectorConfig(target, "character")
                    }
                    onCreateShotConfig={(target) =>
                      createStoryDirectorConfig(target, "shot")
                    }
                  />
                ) : contentNode.type === CanvasNodeType.Seedance2Workflow ? (
                  <Seedance2WorkflowPanel
                    node={contentNode}
                    embedded
                    isCreatingPlaceholders={runningNodeId === contentNode.id}
                    onConfigChange={handleConfigNodeChange}
                    onCreatePlaceholders={rebuildSeedance2Placeholders}
                    storyDirectorSource={seedance2StoryDirectorSourceByNodeId.get(contentNode.id)}
                  />
                ) : contentNode.type === CanvasNodeType.Config ? (
                  <CanvasConfigNodePanel
                    node={contentNode}
                    isRunning={runningNodeId === contentNode.id}
                    inputSummary={getInputSummary(
                      configInputsById.get(contentNode.id) || [],
                    )}
                    onConfigChange={handleConfigNodeChange}
                    onComposerToggle={() =>
                      setDialogNodeId((current) =>
                        current === contentNode.id ? null : contentNode.id,
                      )
                    }
                    onGenerate={(nodeId) => {
                      const target = nodesRef.current.find(
                        (item) => item.id === nodeId,
                      );
                      void handleGenerateNode(
                        nodeId,
                        target?.metadata?.generationMode || "image",
                        target?.metadata?.composerContent ??
                          target?.metadata?.prompt ??
                          "",
                      );
                    }}
                  />
                ) : undefined
              }
              onMouseDown={handleNodeMouseDown}
              onHoverStart={(nodeId) => {
                if (nodeDraggingRef.current) return;
                setHoveredNodeId(nodeId);
                keepNodeToolbar(nodeId);
              }}
              onHoverEnd={(nodeId) => {
                setHoveredNodeId((current) =>
                  current === nodeId ? null : current,
                );
                hideNodeToolbar();
              }}
              onConnectStart={handleConnectStart}
              onResize={handleNodeResize}
              onContentChange={handleNodeContentChange}
              onToggleBatch={toggleBatchExpanded}
              onSetBatchPrimary={setBatchPrimary}
              onRetry={(node) => void handleRetryNode(node)}
              onGenerateImage={generateImageFromTextNode}
              onGenerateVideo={(node) => void generateSeedance2VideoFromPlaceholder(node)}
              onExtractVideoFrame={(node, frame) => void createImageNodeFromVideoFrame(node, frame)}
              onViewImage={previewNodeImage}
              onContextMenu={(event, id) => {
                event.preventDefault();
                event.stopPropagation();
                const currentSelected = selectedNodeIdsRef.current;
                const targetNode = nodesRef.current.find(
                  (item) => item.id === id,
                );
                const selectedImages = nodesRef.current.filter(
                  (item) =>
                    currentSelected.has(item.id) &&
                    item.type === CanvasNodeType.Image &&
                    Boolean(item.metadata?.content),
                );
                const keepSelection =
                  currentSelected.has(id) &&
                  selectedImages.length > 1 &&
                  targetNode?.type === CanvasNodeType.Image;
                if (!keepSelection) setSelectedNodeIds(new Set([id]));
                setSelectedConnectionId(null);
                setToolbarNodeId(null);
                setContextMenu(
                  keepSelection
                    ? {
                        type: "selection",
                        x: event.clientX,
                        y: event.clientY,
                        nodeIds: Array.from(currentSelected),
                      }
                    : {
                        type: "node",
                        x: event.clientX,
                        y: event.clientY,
                        nodeId: id,
                      },
                );
              }}
            />
          ))}

          {selectionBox ? (
            <div
              className="pointer-events-none absolute z-[100] border"
              style={{
                left: Math.min(
                  selectionBox.startWorldX,
                  selectionBox.currentWorldX,
                ),
                top: Math.min(
                  selectionBox.startWorldY,
                  selectionBox.currentWorldY,
                ),
                width: Math.abs(
                  selectionBox.currentWorldX - selectionBox.startWorldX,
                ),
                height: Math.abs(
                  selectionBox.currentWorldY - selectionBox.startWorldY,
                ),
                borderColor: theme.canvas.selectionStroke,
                background: theme.canvas.selectionFill,
              }}
            />
          ) : null}
          {pendingConnectionCreate ? (
            <ConnectionCreateMenu
              pending={pendingConnectionCreate}
              onCreate={(type) =>
                createConnectedNode(type, pendingConnectionCreate)
              }
              onClose={cancelPendingConnectionCreate}
            />
          ) : null}
        </InfiniteCanvas>

        {!nodes.length ? (
          <CanvasEmptyStarter
            theme={theme}
            onUpload={() => handleUploadRequest()}
            onTextToImage={() => createNode(CanvasNodeType.Config)}
            onOpenAssets={() => {
              setAssetPickerTab("my-assets");
              setAssetPickerOpen(true);
            }}
            onSeedance2Workflow={() => createSeedance2Workflow()}
          />
        ) : null}

        <CanvasToolbar
          selectedCount={selectedNodeIds.size}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          backgroundMode={backgroundMode}
          showImageInfo={showImageInfo}
          onAddImage={() => createNode(CanvasNodeType.Image)}
          onAddVideo={() => createNode(CanvasNodeType.Video)}
          onAddAudio={() => createNode(CanvasNodeType.Audio)}
          onAddText={() => createNode(CanvasNodeType.Text)}
          onAddConfig={() => createNode(CanvasNodeType.Config)}
          onAddStoryDirector={() => createStoryDirectorFromImages([])}
          onAddSeedance2Workflow={() => createSeedance2Workflow()}
          onUndo={undoCanvas}
          onRedo={redoCanvas}
          onUpload={() => handleUploadRequest()}
          onDelete={() => deleteNodes(new Set(selectedNodeIds))}
          onClear={() => setClearConfirmOpen(true)}
          onDeselect={deselectCanvas}
          onBackgroundModeChange={setBackgroundMode}
          onShowImageInfoChange={setShowImageInfo}
          onOpenAssetLibrary={() => {
            setAssetPickerTab("library");
            setAssetPickerOpen(true);
          }}
          onOpenMyAssets={() => {
            setAssetPickerTab("my-assets");
            setAssetPickerOpen(true);
          }}
        />

        {isMiniMapOpen ? (
          <Minimap
            nodes={nodes}
            viewport={viewport}
            viewportSize={size}
            onViewportChange={setViewport}
          />
        ) : null}

        {generationHistoryOpen ? (
          <CanvasGenerationHistoryPanel
            nodes={nodes}
            selectedId={
              selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null
            }
            onSelect={(nodeId) => {
              setSelectedNodeIds(new Set([nodeId]));
              setSelectedConnectionId(null);
              setDialogNodeId(nodeId);
            }}
            onInsert={(node) => duplicateNode(node.id)}
            onReference={(node) => createReferenceGenerationFromImages([node])}
            onSave={(node) => void saveNodeAsset(node)}
            onDownload={downloadNodeImage}
            onDelete={(node) => deleteNodes(new Set([node.id]))}
            onClose={() => setGenerationHistoryOpen(false)}
          />
        ) : null}

        <CanvasZoomControls
          scale={viewport.k}
          onScaleChange={setZoomScale}
          onReset={resetViewport}
          isMiniMapOpen={isMiniMapOpen}
          onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
        />

        {contextMenu ? (
          <CanvasNodeContextMenu
            menu={contextMenu}
            groups={buildContextMenuGroups(contextMenu)}
            onClose={() => setContextMenu(null)}
          />
        ) : null}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
          className="hidden"
          multiple
          onChange={handleImageInputChange}
        />

        <CanvasNodeInfoModal
          node={infoNode}
          open={Boolean(infoNode)}
          onClose={() => setInfoNodeId(null)}
        />

        {cropNode?.metadata?.content ? (
          <CanvasNodeCropDialog
            dataUrl={cropNode.metadata.content}
            open={Boolean(cropNode)}
            onClose={() => setCropNodeId(null)}
            onConfirm={(crop) => void cropImageNode(cropNode!, crop)}
          />
        ) : null}

        {layerEditNode?.metadata?.content ? (
          <CanvasNodeLayerEditDialog
            dataUrl={layerEditNode.metadata.content}
            open={Boolean(layerEditNode)}
            onClose={() => setLayerEditNodeId(null)}
            onConfirm={(payload) =>
              void layerEditImageNode(layerEditNode!, payload)
            }
          />
        ) : null}

        {maskEditNode?.metadata?.content ? (
          <CanvasNodeMaskEditDialog
            dataUrl={maskEditNode.metadata.content}
            open={Boolean(maskEditNode)}
            onClose={() => setMaskEditNodeId(null)}
            onConfirm={(payload) =>
              void maskEditImageNode(maskEditNode!, payload)
            }
          />
        ) : null}

        {seedance2FaceEditNode ? (
          <CanvasNodeSeedance2FaceEditDialog
            dataUrl={seedance2FaceEditDataUrl || ""}
            open={Boolean(seedance2FaceEditNode && seedance2FaceEditDataUrl)}
            onClose={() => setSeedance2FaceEditNodeId(null)}
            onConfirm={(payload) =>
              saveSeedance2FaceEditImageNode(seedance2FaceEditNode!, payload)
            }
          />
        ) : null}

        {splitNode?.metadata?.content ? (
          <CanvasNodeSplitDialog
            dataUrl={splitNode.metadata.content}
            open={Boolean(splitNode)}
            onClose={() => setSplitNodeId(null)}
            onConfirm={(params) => void splitImageNode(splitNode!, params)}
          />
        ) : null}

        {upscaleNode?.metadata?.content ? (
          <CanvasNodeUpscaleDialog
            dataUrl={upscaleNode.metadata.content}
            open={Boolean(upscaleNode)}
            onClose={() => setUpscaleNodeId(null)}
            onConfirm={(params) =>
              void aiUpscaleImageNode(upscaleNode!, params)
            }
          />
        ) : null}

        <Modal
          title="AI 超分"
          open={Boolean(superResolveNode?.metadata?.content)}
          centered
          footer={null}
          onCancel={() => setSuperResolveNodeId(null)}
        >
          <div className="py-8 text-center text-base font-medium">暂未实现</div>
        </Modal>

        {angleNode?.metadata?.content ? (
          <CanvasNodeAngleDialog
            dataUrl={angleNode.metadata.content}
            open={Boolean(angleNode)}
            onClose={() => setAngleNodeId(null)}
            onConfirm={(params) => void generateAngleNode(angleNode!, params)}
          />
        ) : null}

        <CanvasImageCompareDialog
          open={compareNodes.length >= 2}
          nodes={compareNodes}
          primaryId={comparePrimaryNodeId}
          onPrimaryChange={(nodeId) => {
            setComparePrimaryNodeId(nodeId);
            setSelectedNodeIds(new Set([nodeId]));
          }}
          onClose={() => {
            setCompareNodeIds([]);
            setComparePrimaryNodeId(null);
          }}
        />

        <Modal
          title="从画布选择图片替换"
          open={Boolean(replacePickerNode)}
          centered
          footer={null}
          width={760}
          onCancel={() => setReplacePickerNodeId(null)}
        >
          {replacePickerImages.length ? (
            <div className="grid max-h-[62vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {replacePickerImages.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className="group overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-cyan-400 hover:shadow-md"
                  onClick={() =>
                    void (
                      replacePickerNode &&
                      replaceNodeFromCanvasImage(replacePickerNode, image)
                    )
                  }
                >
                  <div className="aspect-[4/3] overflow-hidden bg-stone-100">
                    <img
                      src={image.metadata!.content!}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      draggable={false}
                    />
                  </div>
                  <div className="flex items-center gap-2 p-3">
                    <Check className="size-4 shrink-0 text-cyan-600 opacity-0 transition group-hover:opacity-100" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">
                        {image.title || "画布图片"}
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {Math.round(
                          image.metadata?.naturalWidth || image.width,
                        )}{" "}
                        x{" "}
                        {Math.round(
                          image.metadata?.naturalHeight || image.height,
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center text-center text-stone-500">
              <Images className="mb-3 size-8 text-stone-300" />
              <div className="text-sm">画布里还没有其它可替换的图片</div>
            </div>
          )}
        </Modal>

        <Modal
          title="图片详情"
          open={Boolean(previewNode?.metadata?.content)}
          centered
          onCancel={() => setPreviewNodeId(null)}
          footer={null}
          width="auto"
          styles={{
            body: {
              padding: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              maxHeight: "80vh",
            },
          }}
        >
          {previewNode?.metadata?.content ? (
            <img
              src={previewNode.metadata.content}
              alt={previewNode.title || "图片"}
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                objectFit: "contain",
              }}
            />
          ) : null}
        </Modal>

        <Modal
          title="清空画布？"
          open={clearConfirmOpen}
          centered
          onCancel={() => setClearConfirmOpen(false)}
          footer={
            <>
              <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
              <Button danger type="primary" onClick={clearCanvas}>
                清空
              </Button>
            </>
          }
        >
          <p className="text-sm opacity-60">
            这会删除当前画布上的所有节点和连线。
          </p>
        </Modal>

        <AssetPickerModal
          open={assetPickerOpen}
          defaultTab={assetPickerTab}
          onInsert={handleAssetInsert}
          onClose={() => setAssetPickerOpen(false)}
        />
      </section>
      {assistantMounted ? (
        <CanvasAssistantPanel
          nodes={nodes}
          selectedNodeIds={selectedNodeIds}
          sessions={chatSessions}
          activeSessionId={activeChatId}
          onSelectNodeIds={setSelectedNodeIds}
          onSessionsChange={handleAssistantSessionsChange}
          onInsertImage={insertAssistantImage}
          onInsertText={insertAssistantText}
          onPasteImage={pasteAssistantImage}
          onCollapseStart={() => setAssistantCollapsed(true)}
          onCollapse={() => setAssistantMounted(false)}
        />
      ) : null}
    </main>
  );
}

function CanvasTopBar({
  title,
  titleDraft,
  isTitleEditing,
  onTitleDraftChange,
  onStartTitleEditing,
  onFinishTitleEditing,
  onCancelTitleEditing,
  canUndo,
  canRedo,
  onHome,
  onProjects,
  onCreateProject,
  onDeleteProject,
  onImportImage,
  onUndo,
  onRedo,
  generationHistoryOpen,
  onToggleGenerationHistory,
  assistantCollapsed,
  onExpandAssistant,
}: {
  title: string;
  titleDraft: string;
  isTitleEditing: boolean;
  onTitleDraftChange: (value: string) => void;
  onStartTitleEditing: () => void;
  onFinishTitleEditing: () => void;
  onCancelTitleEditing: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onHome: () => void;
  onProjects: () => void;
  onCreateProject: () => void;
  onDeleteProject: () => void;
  onImportImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  generationHistoryOpen: boolean;
  onToggleGenerationHistory: () => void;
  assistantCollapsed: boolean;
  onExpandAssistant: () => void;
}) {
  const colorTheme = useThemeStore((state) => state.theme);
  const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
  const theme = canvasThemes[colorTheme];
  const titleRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (!isTitleEditing) return;
    const close = (event: PointerEvent) => {
      if (!titleRef.current?.contains(event.target as Node))
        onFinishTitleEditing();
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [isTitleEditing, onFinishTitleEditing]);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [accountOpen]);

  useEffect(() => {
    const openShortcuts = () => {
      setShortcutsOpen(true);
      setAccountOpen(false);
    };
    window.addEventListener(CANVAS_SHORTCUT_EVENT, openShortcuts);
    return () =>
      window.removeEventListener(CANVAS_SHORTCUT_EVENT, openShortcuts);
  }, []);

  return (
    <>
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-[calc(56px+env(safe-area-inset-top))] items-center justify-between px-2 pt-[env(safe-area-inset-top)] sm:h-16 sm:px-4 sm:pt-0">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 sm:gap-3">
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "home",
                  icon: <Home className="size-4" />,
                  label: "主页",
                  onClick: onHome,
                },
                {
                  key: "projects",
                  icon: <Images className="size-4" />,
                  label: "我的画布",
                  onClick: onProjects,
                },
                { type: "divider" },
                {
                  key: "new",
                  icon: <Plus className="size-4" />,
                  label: "新建画布",
                  onClick: onCreateProject,
                },
                {
                  key: "delete",
                  danger: true,
                  icon: <Trash2 className="size-4" />,
                  label: "删除当前画布",
                  onClick: onDeleteProject,
                },
                { type: "divider" },
                {
                  key: "import",
                  icon: <Upload className="size-4" />,
                  label: "导入素材",
                  onClick: onImportImage,
                },
                { type: "divider" },
                {
                  key: "undo",
                  disabled: !canUndo,
                  icon: <Undo2 className="size-4" />,
                  label: <MenuLabel text="撤销" shortcut="⌘ Z" />,
                  onClick: onUndo,
                },
                {
                  key: "redo",
                  disabled: !canRedo,
                  icon: <Redo2 className="size-4" />,
                  label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />,
                  onClick: onRedo,
                },
              ],
            }}
          >
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full transition hover:bg-black/5 sm:size-9 dark:hover:bg-white/10"
              style={{ color: theme.node.text }}
              aria-label="打开画布菜单"
            >
              <Menu className="size-5" />
            </button>
          </Dropdown>

          <div ref={titleRef} className="flex min-w-0 items-center gap-2">
            {isTitleEditing ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => onTitleDraftChange(event.target.value)}
                onBlur={onFinishTitleEditing}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onFinishTitleEditing();
                  if (event.key === "Escape") onCancelTitleEditing();
                }}
                className="max-w-[42vw] bg-transparent p-0 text-left text-base font-semibold tracking-normal outline-none sm:max-w-[280px] sm:text-lg"
                style={{ color: theme.node.text }}
              />
            ) : (
              <button
                type="button"
                className="max-w-[42vw] truncate border-b border-dashed border-transparent text-left text-base font-semibold tracking-normal transition hover:border-current sm:max-w-[280px] sm:text-lg"
                onDoubleClick={onStartTitleEditing}
                title="双击修改画布名称"
              >
                {title}
              </button>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
          <Button
            type="text"
            className="!h-10 !rounded-xl !px-2 !font-medium sm:!px-3"
            style={{
              background: generationHistoryOpen
                ? theme.toolbar.activeBg
                : theme.toolbar.panel,
              color: generationHistoryOpen
                ? theme.toolbar.activeText
                : theme.node.text,
              boxShadow: "0 10px 30px rgba(28,25,23,.10)",
            }}
            icon={<PanelRightOpen className="size-4" />}
            onClick={onToggleGenerationHistory}
          >
            <span className="hidden sm:inline">历史</span>
          </Button>
          <UserStatusActions
            variant="canvas"
            showDocs={false}
            showConfig={false}
            accountOpen={accountOpen}
            onAccountOpenChange={setAccountOpen}
            accountRef={accountRef}
            getPopupContainer={(node) => node.parentElement || document.body}
            onOpenShortcuts={() => {
              setShortcutsOpen(true);
              setAccountOpen(false);
            }}
          />
          {assistantCollapsed ? (
            <>
              <span
                className="h-6 w-px"
                style={{ background: theme.toolbar.border }}
              />
              <Button
                type="text"
                className="!h-10 !rounded-xl !px-2 !font-medium sm:!px-3"
                style={{
                  background: theme.toolbar.panel,
                  color: theme.node.text,
                  boxShadow: "0 10px 30px rgba(28,25,23,.10)",
                }}
                icon={<MessageSquare className="size-4" />}
                onClick={onExpandAssistant}
              >
                <span className="hidden sm:inline">助手</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <Modal
        title="快捷键"
        open={shortcutsOpen}
        onCancel={() => setShortcutsOpen(false)}
        footer={null}
        centered
      >
        <div
          className="space-y-2 border-t pt-4 text-sm"
          style={{ borderColor: theme.node.stroke }}
        >
          <Shortcut keys={["拖动画布"]} value="平移视图" />
          <Shortcut keys={["滚轮"]} value="缩放画布" />
          <Shortcut keys={["缩放滑杆"]} value="精确调整缩放" />
          <Shortcut keys={["点击板块"]} value="出现蓝色选中框" />
          <Shortcut
            keys={["选中板块", "Delete / Backspace"]}
            value="删除板块"
          />
          <Shortcut keys={["Ctrl / Cmd", "拖动"]} value="框选多个节点" />
          <Shortcut
            keys={["Shift / Ctrl / Cmd", "点击"]}
            value="追加选择节点"
          />
          <Shortcut keys={["Ctrl / Cmd", "A"]} value="全选节点" />
          <Shortcut
            keys={["Ctrl / Cmd", "C / V"]}
            value="复制 / 粘贴节点，或粘贴剪切板文本/图片"
          />
          <Shortcut keys={["Ctrl / Cmd", "D"]} value="复制一份选中节点" />
          <Shortcut keys={["Ctrl / Cmd", "Z"]} value="撤销" />
          <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value="重做" />
          <Shortcut keys={["Ctrl / Cmd", "Y"]} value="重做" />
          <Shortcut keys={["Ctrl / Cmd", "+ / -"]} value="放大 / 缩小" />
          <Shortcut keys={["Ctrl / Cmd", "0"]} value="重置视图" />
          <Shortcut keys={["Ctrl / Cmd", "N"]} value="新建画布" />
          <Shortcut keys={["Ctrl / Cmd", "O"]} value="导入素材" />
          <Shortcut keys={["I / T / G"]} value="新增图片 / 文本 / 配置节点" />
          <Shortcut keys={["V / A"]} value="新增视频 / 音频节点" />
          <Shortcut keys={["U"]} value="导入素材" />
          <Shortcut keys={["L / B"]} value="打开素材库 / 我的素材" />
          <Shortcut keys={["M"]} value="显示或隐藏小地图" />
          <Shortcut keys={["H"]} value="打开画布助手" />
          <Shortcut keys={["?"]} value="打开快捷键" />
          <Shortcut keys={["Delete / Backspace"]} value="删除选中板块或连线" />
          <Shortcut keys={["Esc"]} value="取消选择并关闭浮层" />
          <Shortcut keys={["按住图片", "滚轮"]} value="按预设比例缩放图片" />
          <Shortcut keys={["Cmd", "滚轮"]} value="上下平移画布" />
          <Shortcut keys={["滚轮 / 侧滚轮"]} value="左右平移画布" />
          <Shortcut keys={["拖入图片/视频/音频"]} value="上传到画布" />
        </div>
      </Modal>
    </>
  );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
  return (
    <span className="flex min-w-36 items-center justify-between gap-8">
      <span>{text}</span>
      <span className="text-xs opacity-45">{shortcut}</span>
    </span>
  );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-6 rounded-lg px-1 py-1.5">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {keys.map((key, index) => (
          <span key={`${key}-${index}`} className="flex items-center gap-1.5">
            {index ? <span className="text-xs opacity-35">+</span> : null}
            <kbd
              className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
              style={{
                borderColor: "rgba(120,113,108,.28)",
                background: "linear-gradient(#fff, rgba(245,245,244,.92))",
                color: "rgb(68,64,60)",
              }}
            >
              {key}
            </kbd>
          </span>
        ))}
      </span>
      <span className="text-right text-sm opacity-55">{value}</span>
    </div>
  );
}

function imageExtension(dataUrl: string) {
  return (
    dataUrl.match(/^data:image[/]([^;]+)/)?.[1] ||
    dataUrl.match(/image[/]([^;]+)/)?.[1] ||
    "png"
  );
}

async function clipboardImageBlob(dataUrl: string) {
  const sourceBlob = await (await fetch(dataUrl)).blob();
  if (sourceBlob.type === "image/png") return sourceBlob;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片解码失败"));
    element.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth || image.width);
  canvas.height = Math.max(1, image.naturalHeight || image.height);
  const context = canvas.getContext("2d");
  if (!context) return sourceBlob;
  context.drawImage(image, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片转换失败"))),
      "image/png",
    );
  });
}

function copyImageWithLegacySelection(dataUrl: string) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("contenteditable", "true");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "1px";
  wrapper.style.height = "1px";
  wrapper.style.overflow = "hidden";
  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = "canvas image";
  wrapper.appendChild(image);
  document.body.appendChild(wrapper);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNode(image);
  selection?.removeAllRanges();
  selection?.addRange(range);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    selection?.removeAllRanges();
    document.body.removeChild(wrapper);
  }
  return copied;
}

function audioExtension(mimeType?: string) {
  if (mimeType?.includes("wav")) return "wav";
  if (mimeType?.includes("opus")) return "opus";
  if (mimeType?.includes("aac")) return "aac";
  if (mimeType?.includes("flac")) return "flac";
  if (mimeType?.includes("pcm")) return "pcm";
  return "mp3";
}

function referencesImageLabel(prompt: string) {
  return /图片\s*\d+/.test(prompt);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  const limit = Math.max(1, Math.floor(concurrency));
  let nextIndex = 0;
  const errors: unknown[] = [];
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          await worker(items[currentIndex], currentIndex);
        } catch (error) {
          errors.push(error);
        }
      }
    },
  );
  await Promise.all(runners);
  if (errors.length) {
    const first = errors[0];
    throw first instanceof Error ? first : new Error("批量生成失败");
  }
}

async function submitCanvasImageTask(
  taskId: string,
  config: AiConfig,
  prompt: string,
  references: ReferenceImage[],
  options: { useReferenceLabels?: boolean; boardRouteKey?: ApiBoardRouteKey } = {},
): Promise<string> {
  const boardRouteKey = options.boardRouteKey || "imageGeneration";
  const route = resolveApiRequestRoute(config, "image", config.model, boardRouteKey);
  if (route.mode === "local" || route.mode === "localPool") {
    const localTask = (
      references.length
        ? requestEdit(config, prompt, references, undefined, boardRouteKey, {
            useReferenceLabels: options.useReferenceLabels,
          })
        : requestGeneration(config, prompt, boardRouteKey)
    ).then((images) => {
      const image = images[0];
      if (!image) throw new Error("图片接口没有返回图片");
      return image;
    });
    localCanvasImageTasks.set(taskId, localTask);
    return taskId;
  }

  if (references.length) {
    const hydratedReferences = await Promise.all(
      references.map(async (image) => ({
        ...image,
        dataUrl: await imageToDataUrl(image),
      })),
    );
    const files = hydratedReferences.map((image) => dataUrlToFile(image));
    const promptText = options.useReferenceLabels
      ? buildImageReferencePromptText(prompt, references)
      : prompt;
    const response = await createImageEditTask(
      taskId,
      files,
      promptText,
      route.model,
      config.size,
      outputSizeForCanvasTask(config.quality),
    );
    return canvasImageSubmittedTaskId(response, taskId);
  }
  const response = await createImageGenerationTask(
    taskId,
    prompt,
    route.model,
    config.size,
    outputSizeForCanvasTask(config.quality),
  );
  return canvasImageSubmittedTaskId(response, taskId);
}

function canvasImageSubmittedTaskId(response: unknown, fallbackTaskId: string) {
  if (!response || typeof response !== "object") return fallbackTaskId;
  const record = response as Record<string, unknown>;
  const task =
    record.task && typeof record.task === "object"
      ? (record.task as Record<string, unknown>)
      : undefined;
  return (
    stringValue(record.task_id) ||
    stringValue(record.id) ||
    stringValue(task?.task_id) ||
    stringValue(task?.id) ||
    fallbackTaskId
  );
}

async function pollCanvasImageTask(
  taskId: string,
): Promise<GeneratedImageResult> {
  const localTask = localCanvasImageTasks.get(taskId);
  if (localTask) {
    try {
      return await localTask;
    } finally {
      localCanvasImageTasks.delete(taskId);
    }
  }

  let failureCount = 0;
  let missingSince: number | null = null;
  while (true) {
    let taskList: Awaited<ReturnType<typeof fetchImageTasks>>;
    try {
      taskList = await fetchImageTasks([taskId]);
      failureCount = 0;
    } catch (error) {
      failureCount += 1;
      if (failureCount >= CANVAS_IMAGE_TASK_POLL_RETRY_LIMIT) {
        throw error instanceof Error
          ? error
          : new Error("图片任务状态查询失败，请刷新后重试");
      }
      await sleep(CANVAS_IMAGE_TASK_POLL_INTERVAL_MS);
      continue;
    }
    const task = taskList.items.find((item) => item.id === taskId);
    if (task) {
      missingSince = null;
    }
    if (isCanvasImageTaskSuccess(task?.status)) {
      const image = imageTaskToGeneratedImage(task);
      if (image) return image;
      throw new Error("图片任务完成但没有返回可用图片");
    }
    if (isCanvasImageTaskFailure(task?.status)) {
      throw new Error(task.error || "图片任务失败");
    }
    if (taskList.missing_ids?.includes(taskId)) {
      const now = Date.now();
      missingSince ??= now;
      if (now - missingSince >= CANVAS_IMAGE_TASK_MISSING_GRACE_MS) {
        throw new Error("图片任务状态同步超时，请刷新后查看生成结果或重新生成");
      }
      await sleep(CANVAS_IMAGE_TASK_POLL_INTERVAL_MS);
      continue;
    }
    missingSince = null;
    await sleep(CANVAS_IMAGE_TASK_POLL_INTERVAL_MS);
  }
}

function isCanvasImageTaskSuccess(status?: string) {
  return (
    status === "success" ||
    status === "completed" ||
    status === "done" ||
    status === "succeeded"
  );
}

function isCanvasImageTaskFailure(status?: string) {
  return (
    status === "error" ||
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled"
  );
}

function imageTaskToGeneratedImage(
  task: ImageTask,
): GeneratedImageResult | null {
  const item = task.data?.find((entry) => entry.b64_json || entry.url);
  if (!item) return null;
  const backendUrl = normalizeCanvasImageUrl(item.url?.trim() || "");
  const dataUrl = item.b64_json
    ? `data:image/png;base64,${item.b64_json}`
    : backendUrl;
  if (!dataUrl) return null;
  return {
    id: task.id,
    dataUrl,
    backendUrl: backendUrl || undefined,
    backendRel: extractBackendImageRel(backendUrl),
    revisedPrompt: item.revised_prompt,
  };
}

function extractBackendImageRel(url: string) {
  const marker = "/images/";
  const index = url.indexOf(marker);
  if (index < 0) return undefined;
  return (
    decodeURIComponent(
      url
        .slice(index + marker.length)
        .split("?", 1)[0]
        .split("#", 1)[0],
    ).replace(/^\/+/, "") || undefined
  );
}

let lastProtectedCanvasImageKey = "";

function protectBackendImagesForCanvas(
  nodes: CanvasNodeData[],
  projectId: string,
) {
  const paths = Array.from(
    new Set(
      nodes
        .filter((node) => node.type === CanvasNodeType.Image)
        .map(
          (node) =>
            node.metadata?.backendRel ||
            extractBackendImageRel(
              node.metadata?.backendUrl || node.metadata?.content || "",
            ),
        )
        .filter((path): path is string => Boolean(path)),
    ),
  ).sort();
  if (!paths.length) return;
  const key = `${projectId}:${paths.join("|")}`;
  if (key === lastProtectedCanvasImageKey) return;
  lastProtectedCanvasImageKey = key;
  void protectCanvasImages(paths, projectId).catch(() => {
    lastProtectedCanvasImageKey = "";
  });
}

function outputSizeForCanvasTask(quality: string | undefined) {
  const normalized = String(quality || "")
    .trim()
    .toLowerCase();
  if (normalized === "medium" || normalized === "2k") return "2k";
  if (normalized === "high" || normalized === "4k") return "4k";
  return "1k";
}

function normalizeStoryImageQuality(
  quality: string | undefined,
): AiConfig["quality"] {
  const normalized = String(quality || "")
    .trim()
    .toLowerCase();
  if (normalized === "2k" || normalized === "medium") return "medium";
  if (normalized === "4k" || normalized === "high") return "high";
  return "low";
}

function storyDirectorShotNodeSize(size: string | undefined) {
  return (
    nodeSizeFromRatio(
      size || "9:16",
      STORY_DIRECTOR_SHOT_NODE_WIDTH,
      STORY_DIRECTOR_SHOT_NODE_HEIGHT,
    ) || {
      width: STORY_DIRECTOR_SHOT_NODE_WIDTH,
      height: STORY_DIRECTOR_SHOT_NODE_HEIGHT,
    }
  );
}

function storyDirectorGridPosition(
  baseX: number,
  baseY: number,
  index: number,
  size: { width: number; height: number },
): Position {
  return {
    x:
      baseX +
      (index % STORY_DIRECTOR_SHOT_COLUMNS) *
        (size.width + STORY_DIRECTOR_SHOT_COLUMN_GAP),
    y:
      baseY +
      Math.floor(index / STORY_DIRECTOR_SHOT_COLUMNS) *
        (size.height + STORY_DIRECTOR_SHOT_ROW_GAP),
  };
}

function imageMetadata(
  image: UploadedImage,
  generated?: Pick<GeneratedImageResult, "backendUrl" | "backendRel">,
): CanvasNodeMetadata {
  const backendUrl = normalizeCanvasImageUrl(generated?.backendUrl || "");
  return {
    // The upstream URL may be a short-lived signed URL. uploadImage() has
    // already stored a durable local copy, which must drive the canvas preview.
    content: image.url,
    backendUrl,
    backendRel: generated?.backendRel,
    storageKey: image.storageKey,
    status: "success",
    naturalWidth: image.width,
    naturalHeight: image.height,
    bytes: image.bytes,
    mimeType: image.mimeType,
  };
}

function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
  return {
    content: video.url,
    storageKey: video.storageKey,
    status: "success",
    naturalWidth: video.width,
    naturalHeight: video.height,
    bytes: video.bytes,
    mimeType: video.mimeType || "video/mp4",
    durationMs: video.durationMs,
  };
}

function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
  return {
    content: audio.url,
    storageKey: audio.storageKey,
    status: "success",
    bytes: audio.bytes,
    mimeType: audio.mimeType || "audio/mpeg",
    durationMs: audio.durationMs,
  };
}

function buildImageGenerationMetadata(
  type: CanvasImageGenerationType,
  config: AiConfig,
  count: number,
  references: ReferenceImage[],
): CanvasNodeMetadata {
  return {
    generationType: type,
    model: config.model,
    size: config.size,
    quality: config.quality,
    count,
    references: references
      .map(referenceUrl)
      .filter((url): url is string => Boolean(url)),
  };
}

function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
  return {
    model: config.model,
    audioVoice: config.audioVoice,
    audioFormat: config.audioFormat,
    audioSpeed: config.audioSpeed,
    audioInstructions: config.audioInstructions,
  };
}

function referenceUrl(image: ReferenceImage) {
  return (
    image.storageKey ||
    image.url ||
    (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined)
  );
}

function generationReferenceUrls(context: {
  referenceImages: ReferenceImage[];
  referenceVideos: Array<{ storageKey?: string; url?: string }>;
  referenceAudios?: Array<{ storageKey?: string; url?: string }>;
}) {
  return [
    ...context.referenceImages
      .map(referenceUrl)
      .filter((url): url is string => Boolean(url)),
    ...context.referenceVideos
      .map((video) => video.storageKey || video.url)
      .filter((url): url is string => Boolean(url)),
    ...(context.referenceAudios || [])
      .map((audio) => audio.storageKey || audio.url)
      .filter((url): url is string => Boolean(url)),
  ];
}

async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
  if (metadata.generationType !== "edit") return [];
  if (!metadata.references?.length) return null;
  return resolveSavedReferenceUrls(metadata.references);
}

async function resolveImageNodeSavedReferences(metadata: CanvasNodeMetadata) {
  return resolveSavedReferenceUrls(metadata.references);
}

async function resolveSavedReferenceUrls(urls: string[] | undefined) {
  if (!urls?.length) return [];
  const references = await Promise.all(
    urls.map(async (url, index) => {
      const dataUrl = url.startsWith("image:")
        ? await resolveImageUrl(url, "")
        : url;
      return dataUrl
        ? {
            id: `${index}`,
            name: `reference-${index}.png`,
            type: "image/png",
            dataUrl,
            storageKey: url.startsWith("image:") ? url : undefined,
          }
        : null;
    }),
  );
  return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
  const restored = [...nodes];
  for (
    let index = 0;
    index < nodes.length;
    index += CANVAS_RESTORE_CHUNK_SIZE
  ) {
    const chunk = await Promise.all(
      nodes
        .slice(index, index + CANVAS_RESTORE_CHUNK_SIZE)
        .map(hydrateCanvasNode),
    );
    restored.splice(index, chunk.length, ...chunk);
    await yieldToBrowser();
  }
  return restored;
}

async function hydrateCanvasNode(node: CanvasNodeData) {
  try {
    const content = node.metadata?.content || "";
    if (
      (node.type === CanvasNodeType.Video ||
        node.type === CanvasNodeType.Audio) &&
      node.metadata?.storageKey
    ) {
      const resolved = await withCanvasRestoreTimeout(
        resolveMediaUrl(node.metadata.storageKey, restoreFallbackUrl(content)),
        restoreFallbackUrl(content),
        CANVAS_RESTORE_ITEM_TIMEOUT_MS,
      );
      return {
        ...node,
        metadata: { ...node.metadata, content: resolved || content },
      };
    }
    if (
      node.type !== CanvasNodeType.Image ||
      (!content && !node.metadata?.backendUrl && !node.metadata?.storageKey)
    )
      return node;
    if (node.metadata?.storageKey) {
      const resolved = await withCanvasRestoreTimeout(
        resolveImageUrl(node.metadata.storageKey, ""),
        "",
        CANVAS_RESTORE_ITEM_TIMEOUT_MS,
      );
      if (resolved) {
        return {
          ...node,
          metadata: { ...node.metadata, content: resolved },
        };
      }
    }
    if (node.metadata?.backendUrl) {
      const backendUrl = normalizeCanvasImageUrl(node.metadata.backendUrl);
      return {
        ...node,
        metadata: { ...node.metadata, backendUrl, content: backendUrl },
      };
    }
    if (content.startsWith("data:image/")) return node;
    if (content) {
      const normalizedContent = normalizeCanvasBackendImageSource(content);
      if (normalizedContent) {
        return {
          ...node,
          metadata: { ...node.metadata, content: normalizedContent },
        };
      }
    }
    return node;
  } catch {
    return markCanvasNodeRestoreError(node, "图片恢复失败，请重新上传。");
  }
}

function markCanvasNodeRestoreError(
  node: CanvasNodeData,
  errorDetails: string,
): CanvasNodeData {
  if (node.type !== CanvasNodeType.Image) return node;
  return {
    ...node,
    metadata: {
      ...node.metadata,
      content: "",
      status: NODE_STATUS_ERROR,
      errorDetails,
    },
  };
}

type Seedance2AspectRatioSources = {
  upstreamNaturalRatio?: string | null;
  currentShotRatio?: string | null;
};

function findMissingSeedance2RequiredReferences(
  placeholder: CanvasNodeData,
  references: Seedance2CustomerVideoReference[],
) {
  const requiredReferences = Array.isArray(
    placeholder.metadata?.seedanceRequiredReferences,
  )
    ? placeholder.metadata.seedanceRequiredReferences
    : [];
  const availableLabels = new Set(
    references
      .filter((reference) => Boolean(String(reference.value || "").trim()))
      .map((reference) => reference.label),
  );
  return requiredReferences.filter((label) => !availableLabels.has(label));
}

function buildSeedance2AspectRatioSources(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const map = new Map<string, Seedance2AspectRatioSources>();
  const incomingConnectionsByToNodeId = new Map<string, CanvasConnection[]>();
  connections.forEach((connection) => {
    const incoming = incomingConnectionsByToNodeId.get(connection.toNodeId) || [];
    incoming.push(connection);
    incomingConnectionsByToNodeId.set(connection.toNodeId, incoming);
  });
  nodes.forEach((node) => {
    if (node.type !== CanvasNodeType.Video || node.metadata?.seedanceWorkflowRole !== "placeholder") return;
    let upstreamNaturalRatio: string | null = null;
    let currentShotRatio: string | null = null;
    collectUpstreamImageNodes(node.id, nodeById, incomingConnectionsByToNodeId).forEach((source) => {
      const width = Number(source.metadata?.naturalWidth || source.width);
      const height = Number(source.metadata?.naturalHeight || source.height);
      const ratio = seedance2SourceRatioFromNaturalSize(width, height);
      if (!ratio) return;
      if (isCurrentShotImage(source, node)) {
        currentShotRatio ||= ratio;
        return;
      }
      upstreamNaturalRatio ||= ratio;
    });
    if (!upstreamNaturalRatio && !currentShotRatio) return;
    map.set(node.id, { upstreamNaturalRatio, currentShotRatio });
  });
  return map;
}

function collectUpstreamImageNodes(nodeId: string, nodeById: Map<string, CanvasNodeData>, incomingConnectionsByToNodeId: Map<string, CanvasConnection[]>) {
  const visited = new Set<string>([nodeId]);
  const images: CanvasNodeData[] = [];
  const queue = (incomingConnectionsByToNodeId.get(nodeId) || []).map((connection) => connection.fromNodeId);
  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const current = nodeById.get(currentId);
    if (current?.type === CanvasNodeType.Image && seedance2CanOccupyReferenceSlot(current)) images.push(current);
    (incomingConnectionsByToNodeId.get(currentId) || []).forEach((connection) => {
      if (!visited.has(connection.fromNodeId)) queue.push(connection.fromNodeId);
    });
  }
  return images;
}

function isCurrentShotImage(source: CanvasNodeData | undefined, placeholder: CanvasNodeData) {
  if (!source) return false;
  const shot = String(placeholder.metadata?.seedanceShotIndex || "");
  const text = `${source.title || ""}
${source.metadata?.storyLabel || ""}`.toLowerCase();
  return text.includes("当前分镜") || (Boolean(shot) && (text.includes(`第${shot}镜`) || text.includes(`镜头${shot}`)));
}

function withCanvasRestoreTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = CANVAS_RESTORE_TIMEOUT_MS,
) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) =>
      window.setTimeout(() => resolve(fallback), timeoutMs),
    ),
  ]);
}

function restoreFallbackUrl(content: string) {
  if (!content || content.startsWith("blob:")) return "";
  return normalizeCanvasImageUrl(content);
}

function seedance2FaceEditFallbackSource(metadata: CanvasNodeMetadata | undefined) {
  const content = String(metadata?.content || "").trim();
  if (isLocalCanvasImageSource(content)) return content;

  const normalizedContent = normalizeCanvasBackendImageSource(content);
  const normalizedBackendUrl = normalizeCanvasBackendImageSource(metadata?.backendUrl || "");
  const backendRel = String(metadata?.backendRel || "").trim().replace(/^\/+/, "");
  return normalizedContent || normalizedBackendUrl || (backendRel ? `/images/${backendRel}` : "");
}

function isLocalCanvasImageSource(value: string) {
  return /^(data:image\/|blob:)/i.test(String(value || "").trim());
}

function normalizeCanvasBackendImageSource(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isLocalCanvasImageSource(raw)) return raw;
  if (/^images\//i.test(raw)) return `/${raw}`;
  const marker = "/images/";
  const index = raw.indexOf(marker);
  if (index >= 0) return raw.slice(index);
  return normalizeCanvasImageUrl(raw);
}

function normalizeCanvasImageUrl(url: string) {
  if (
    typeof window === "undefined" ||
    window.location.protocol !== "https:" ||
    !url.startsWith("http://")
  )
    return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === window.location.hostname) {
      parsed.protocol = "https:";
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function sanitizeCanvasNodes(nodes: CanvasNodeData[] | undefined) {
  if (!Array.isArray(nodes)) return [];
  return compactBulkSeedance2PlaceholderPanels(removeLegacySeedance2TextNodes(
    nodes
      .filter((node): node is CanvasNodeData =>
        Boolean(
          node && typeof node.id === "string" && typeof node.type === "string",
        ),
      )
      .map((node) => {
        const spec = getNodeSpec(node.type);
        const width = readFiniteNumber(node.width, spec.width);
        const height = readFiniteNumber(node.height, spec.height);
        const position = {
          x: readFiniteNumber(node.position?.x, 0),
          y: readFiniteNumber(node.position?.y, 0),
        };
        return normalizeEmptyVideoNodeToSeedance2Placeholder({
          ...node,
          title:
            typeof node.title === "string" && node.title.trim()
              ? node.title
              : spec.title,
          position,
          width,
          height,
          metadata:
            node.metadata && typeof node.metadata === "object"
              ? node.metadata
              : {},
        });
      }),
  ));
}

function normalizeEmptyVideoNodeToSeedance2Placeholder(
  node: CanvasNodeData,
): CanvasNodeData {
  if (node.type !== CanvasNodeType.Video || node.metadata?.content) return node;
  const sourceMetadata = node.metadata || {};
  const isExistingSeedance2Placeholder = sourceMetadata.seedanceWorkflowRole === "placeholder";
  const seedanceLegacyMetadataKeys = [
    "seedanceRatio",
    "seedanceWorkflowNodeId",
    "seedanceModel",
    "seedanceStoryShotId",
    "seedancePromptPanelMode",
    "seedanceReferenceOrder",
    "seedanceReferenceSlotBindings",
    "seedanceReferenceExtraSlotBindings",
    "seedanceShotIndex",
    "seedanceStoryShotIndex",
    "seedanceWorkflowMode",
    "seedanceRequiredReferences",
  ] as const;
  const hasSeedanceLegacyMetadata = seedanceLegacyMetadataKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(sourceMetadata, key),
  );
  if (!isExistingSeedance2Placeholder && !hasSeedanceLegacyMetadata) return node;
  const ratio = normalizeSeedance2CreationAspectRatio(
    node.metadata?.seedanceRatio || node.metadata?.size || "9:16",
  );
  const metadata: CanvasNodeMetadata = {
    ...createSeedance2VideoPlaceholderMetadata({
      ratio,
      duration:
        node.metadata?.seedanceDuration || node.metadata?.seconds || "5",
      prompt: node.metadata?.prompt || "描述当前镜头的视频内容。",
      inheritSourceRatio: node.metadata?.seedanceInheritSourceRatio ?? true,
      ratioTouched: node.metadata?.seedanceRatioTouched ?? false,
    }),
    ...node.metadata,
    content: "",
    generationMode: "video",
    seedanceWorkflowRole: "placeholder",
    seedanceRatio: ratio,
    size: ratio,
  };
  const size = seedance2PlaceholderSize(ratio);
  return {
    ...node,
    title:
      node.title && node.title !== "Video"
        ? node.title
        : "Seedance2 视频占位框",
    width: isExistingSeedance2Placeholder ? Math.max(size.width, node.width) : size.width,
    height: isExistingSeedance2Placeholder ? Math.max(size.height, node.height) : size.height,
    metadata,
  };
}

function sanitizeCanvasConnections(
  connections: CanvasConnection[] | undefined,
  nodes: CanvasNodeData[],
) {
  if (!Array.isArray(connections)) return [];
  const ids = new Set(nodes.map((node) => node.id));
  return connections.filter((connection): connection is CanvasConnection =>
    Boolean(
      connection &&
      ids.has(connection.fromNodeId) &&
      ids.has(connection.toNodeId),
    ),
  );
}

function readFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shouldRouteConnectionToFloatingPanel(node: CanvasNodeData | undefined, dialogNodeId: string | null) {
  if (!node || dialogNodeId !== node.id) return false;
  if (node.type === CanvasNodeType.StoryDirector) return false;
  if (node.type === CanvasNodeType.Seedance2Workflow) return false;
  if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder") return false;
  if (node.type === CanvasNodeType.Video && node.metadata?.content) return false;
  return true;
}

function shouldRenderCanvasConnection(
  _connection: CanvasConnection,
  from: CanvasNodeData | undefined,
  to: CanvasNodeData | undefined,
  nodes: CanvasNodeData[],
) {
  if (!from || !to) return false;
  if (isHiddenBatchConnectionEndpoint(from, nodes) || isHiddenBatchConnectionEndpoint(to, nodes)) return false;
  if (isSeedance2WorkflowControlConnection(from, to)) return false;
  if (isSeedance2IdleEmptyReferenceConnection(from, to)) return false;
  return true;
}

function isSeedance2WorkflowControlConnection(
  from: CanvasNodeData,
  to: CanvasNodeData,
) {
  return (
    from.type === CanvasNodeType.Seedance2Workflow &&
    to.type === CanvasNodeType.Video &&
    to.metadata?.seedanceWorkflowRole === "placeholder" &&
    to.metadata?.seedanceWorkflowNodeId === from.id
  );
}

function isSeedance2IdleEmptyReferenceConnection(
  from: CanvasNodeData,
  to: CanvasNodeData,
) {
  return (
    from.type === CanvasNodeType.Image &&
    to.type === CanvasNodeType.Video &&
    to.metadata?.seedanceWorkflowRole === "placeholder" &&
    !seedance2CanOccupyReferenceSlot(from)
  );
}

function normalizeConfigNodeSize(nodes: CanvasNodeData[]) {
  const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
  const storySpec = NODE_DEFAULT_SIZE[CanvasNodeType.StoryDirector];
  const seedance2Spec = NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow];
  return nodes.map((node) => {
    if (node.type === CanvasNodeType.StoryDirector) {
      return {
        ...node,
        width: Math.max(node.width, storySpec.width),
        height: Math.max(node.height, storySpec.height),
      };
    }
    if (node.type === CanvasNodeType.Seedance2Workflow) {
      if ((node.width === 720 && node.height === 780) || (node.width === 960 && node.height === 640))
        return { ...node, width: seedance2Spec.width, height: seedance2Spec.height };
      return node;
    }
    if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder" && !node.metadata?.content) {
      const placeholderRatio = normalizeSeedance2CreationAspectRatio(
        node.metadata?.seedanceRatio || node.metadata?.size || SEEDANCE2_CREATION_FALLBACK_RATIO,
      );
      const placeholderSpec = seedance2PlaceholderSize(placeholderRatio);
      if (node.width >= placeholderSpec.width && node.height >= placeholderSpec.height) return node;
      return {
        ...node,
        width: Math.max(placeholderSpec.width, node.width),
        height: Math.max(placeholderSpec.height, node.height),
      };
    }
    if (node.type !== CanvasNodeType.Config) return node;
    if (node.width >= configSpec.width && node.height >= configSpec.height)
      return node;
    return {
      ...node,
      width: Math.max(node.width, configSpec.width),
      height: Math.max(node.height, configSpec.height),
    };
  });
}

async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
  const hydrateItem = async <
    T extends { dataUrl?: string; storageKey?: string },
  >(
    item: T,
  ) => {
    try {
      if (item.storageKey)
        return {
          ...item,
          dataUrl: await withCanvasRestoreTimeout(
            resolveImageUrl(
              item.storageKey,
              restoreFallbackUrl(item.dataUrl || ""),
            ),
            restoreFallbackUrl(item.dataUrl || ""),
            CANVAS_RESTORE_ITEM_TIMEOUT_MS,
          ),
        };
      if (item.dataUrl?.startsWith("data:image/")) return item;
    } catch {
      return { ...item, dataUrl: "" };
    }
    return item;
  };
  return Promise.all(
    sessions.map(async (session) => ({
      ...session,
      messages: await Promise.all(
        session.messages.map(async (message) => ({
          ...message,
          references: await Promise.all(
            (message.references || []).map(hydrateItem),
          ),
          images: await Promise.all((message.images || []).map(hydrateItem)),
        })),
      ),
    })),
  );
}

function getGenerationCount(count: string) {
  return Math.max(
    1,
    Math.min(CANVAS_IMAGE_MAX_COUNT, Math.floor(Math.abs(Number(count)) || 1)),
  );
}

function formatVideoFrameTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function nextImageSequenceNumber(nodes: CanvasNodeData[]) {
  return (
    nodes.reduce((max, node) => {
      if (node.type !== CanvasNodeType.Image) return max;
      return Math.max(max, Number(node.metadata?.imageSequenceNumber) || 0);
    }, 0) + 1
  );
}

function withImageSequenceNumbers(nodes: CanvasNodeData[]) {
  let next = nextImageSequenceNumber(nodes);
  let changed = false;
  const result = nodes.map((node) => {
    if (
      node.type !== CanvasNodeType.Image ||
      node.metadata?.imageSequenceNumber
    )
      return node;
    changed = true;
    return {
      ...node,
      metadata: { ...node.metadata, imageSequenceNumber: next++ },
    };
  });
  return changed ? result : nodes;
}

function applyNodeConfigPatch(
  node: CanvasNodeData,
  patch: Partial<CanvasNodeData["metadata"]>,
) {
  const safePatch = patch || {};
  const next = { ...node, metadata: { ...node.metadata, ...safePatch } };
  const spec =
    node.type === CanvasNodeType.Video
      ? NODE_DEFAULT_SIZE[CanvasNodeType.Video]
      : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
  const size =
    typeof safePatch.size === "string" && !node.metadata?.content
      ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height)
      : null;
  return size &&
    (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video)
    ? {
        ...next,
        ...size,
        position: {
          x: node.position.x + node.width / 2 - size.width / 2,
          y: node.position.y + node.height / 2 - size.height / 2,
        },
      }
    : next;
}

function getConnectionTargetAnchor(
  node: CanvasNodeData,
  current: ConnectionHandle,
  pointerX?: number,
  pointerY?: number,
): Position & { handleId?: string } {
  if (
    current.handleType === "source" &&
    node.type === CanvasNodeType.StoryDirector
  ) {
    const handle = nearestStoryDirectorInputHandle(node, pointerX, pointerY);
    return {
      x:
        node.position.x +
        node.width * storyDirectorHandleLeftRatio(handle.index),
      y:
        node.position.y +
        node.height * storyDirectorHandleTopRatio(handle.index),
      handleId: handle.id,
    };
  }

  return {
    x:
      current.handleType === "source"
        ? node.position.x
        : node.position.x + node.width,
    y: node.position.y + node.height / 2,
  };
}

function normalizeConnection(
  firstNodeId: string,
  secondNodeId: string,
  nodes: CanvasNodeData[],
  firstHandleType: "source" | "target",
  firstHandleId?: string,
  secondHandleId?: string,
): Omit<CanvasConnection, "id"> | null {
  const first = nodes.find((node) => node.id === firstNodeId);
  const second = nodes.find((node) => node.id === secondNodeId);
  if (!first || !second || first.id === second.id) return null;
  if (
    first.type === CanvasNodeType.Config &&
    second.type === CanvasNodeType.Config
  )
    return null;
  const raw =
    firstHandleType === "source"
      ? {
          fromNodeId: first.id,
          toNodeId: second.id,
          fromHandleId: firstHandleId,
          toHandleId: secondHandleId,
        }
      : {
          fromNodeId: second.id,
          toNodeId: first.id,
          fromHandleId: secondHandleId,
          toHandleId: firstHandleId,
        };

  if (second.type === CanvasNodeType.Config)
    return {
      fromNodeId: first.id,
      toNodeId: second.id,
      fromHandleId: firstHandleId,
      toHandleId: secondHandleId,
    };
  if (first.type === CanvasNodeType.Config && firstHandleType === "target")
    return raw;
  if (first.type === CanvasNodeType.Config)
    return {
      fromNodeId: first.id,
      toNodeId: second.id,
      fromHandleId: firstHandleId,
      toHandleId: secondHandleId,
    };
  return raw;
}

function nearestStoryDirectorInputHandle(
  node: CanvasNodeData,
  pointerX?: number,
  pointerY?: number,
) {
  const leftRatios = [0, 0, 0, 0];
  const topRatios = [0.46, 0.55, 0.64, 0.73];
  const index =
    typeof pointerX === "number" && typeof pointerY === "number"
      ? leftRatios.reduce((best, leftRatio, nextIndex) => {
          const dx = pointerX - (node.position.x + node.width * leftRatio);
          const dy =
            pointerY - (node.position.y + node.height * topRatios[nextIndex]);
          const bestDx =
            pointerX - (node.position.x + node.width * leftRatios[best]);
          const bestDy =
            pointerY - (node.position.y + node.height * topRatios[best]);
          return dx * dx + dy * dy < bestDx * bestDx + bestDy * bestDy
            ? nextIndex
            : best;
        }, 0)
      : 0;
  return { ...STORY_DIRECTOR_INPUT_HANDLES[index], index };
}

function storyDirectorHandleTopRatio(index: number) {
  return [0.46, 0.55, 0.64, 0.73][index] || 0.55;
}

function storyDirectorHandleLeftRatio(index: number) {
  return [0, 0, 0, 0][index] || 0;
}

function isStoryDirectorConnection(
  connection: CanvasConnection,
  nodes: CanvasNodeData[],
) {
  const from = nodes.find((node) => node.id === connection.fromNodeId);
  const to = nodes.find((node) => node.id === connection.toNodeId);
  return (
    from?.type === CanvasNodeType.StoryDirector ||
    to?.type === CanvasNodeType.StoryDirector ||
    Boolean(
      connection.fromHandleId?.startsWith("story:") ||
      connection.toHandleId?.startsWith("story:"),
    )
  );
}

function hasStoryDirectorAncestor(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const queue = connections
    .filter((connection) => connection.toNodeId === nodeId)
    .map((connection) => connection.fromNodeId);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeById.get(id);
    if (node?.type === CanvasNodeType.StoryDirector) return true;
    connections
      .filter((connection) => connection.toNodeId === id)
      .forEach((connection) => queue.push(connection.fromNodeId));
  }
  return false;
}

function hasDirectStoryDirectorSource(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return connections.some(
    (connection) =>
      connection.toNodeId === nodeId &&
      nodeById.get(connection.fromNodeId)?.type ===
        CanvasNodeType.StoryDirector,
  );
}

function isStoryDirectorGeneratedImage(
  node: CanvasNodeData | undefined,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  return Boolean(
    node?.type === CanvasNodeType.Image &&
    (node.metadata?.storyLabel || node.metadata?.storyGrid9GroupIndex),
  );
}

function shouldUseStoryDirectorGenerationRules(
  node: CanvasNodeData | undefined,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  if (!node) return false;
  if (node.type !== CanvasNodeType.StoryDirector) {
    return Boolean(node.metadata?.storyWorkflow);
  }
  const hasIncomingStoryConnection = connections.some(
    (connection) =>
      connection.toNodeId === node.id &&
      isStoryDirectorConnection(connection, nodes),
  );
  return (
    node.type === CanvasNodeType.StoryDirector ||
    Boolean(node.metadata?.storyWorkflow) ||
    isStoryDirectorGeneratedImage(node, nodes, connections) ||
    hasIncomingStoryConnection
  );
}

function getInputSummary(inputs: NodeGenerationInput[]) {
  return {
    textCount: inputs.filter((input) => input.type === "text").length,
    imageCount: inputs.filter((input) => input.type === "image").length,
    videoCount: inputs.filter((input) => input.type === "video").length,
    audioCount: inputs.filter((input) => input.type === "audio").length,
  };
}

function buildStoryDevelopmentText(
  analysis: StoryAnalysisResult,
  node: CanvasNodeData,
  originalStoryText: string,
) {
  const textValue = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("，");
    return "";
  };
  const shots = [...(analysis.shots || [])].sort(
    (left, right) => left.index - right.index,
  );
  const importantCharacters = (analysis.characters || []).filter(
    (character) =>
      character.importance === "main" || character.importance === "supporting",
  );
  const characterById = new Map(
    (analysis.characters || []).map((character) => [character.id, character]),
  );
  const characterNames = importantCharacters
    .map((character) => character.name)
    .filter(Boolean);
  const firstShot = shots[0];
  const lastShot = shots[shots.length - 1];
  const shotChain =
    shots.map((shot) => `第${shot.index}镜《${shot.title}》`).join(" -> ") ||
    "未形成镜头链";
  const style = textValue(node.metadata?.storyStyle) || "电影感写实";
  const aspectRatio = textValue(node.metadata?.storyAspectRatio) || "16:9";
  const originalLine = originalStoryText.trim()
    ? `原始故事输入：${originalStoryText.trim()}`
    : "原始故事输入：未填写";

  const roleBlocks = importantCharacters.length
    ? importantCharacters
        .map((character) => {
          const relatedShots = shots.filter((shot) =>
            (shot.appearingCharacterIds || []).includes(character.id),
          );
          const firstRelated = relatedShots[0];
          const middleRelated =
            relatedShots[Math.floor((relatedShots.length - 1) / 2)] ||
            firstRelated;
          const lastRelated = relatedShots[relatedShots.length - 1] || firstRelated;
          return `${character.name}：
初始状态：${
            firstRelated
              ? `在第${firstRelated.index}镜进入剧情，目标围绕“${firstRelated.title}”展开。`
              : "在故事开端建立身份和目标。"
          }
中段变化：${
            middleRelated
              ? `在第${middleRelated.index}镜随“${middleRelated.title}”继续推进，行动压力逐步增加。`
              : "随主要冲突推进产生变化。"
          }
最终状态：${
            lastRelated
              ? `在第${lastRelated.index}镜停留在“${lastRelated.title}”后的剧情状态。`
              : "在结尾保留与主线冲突相关的结果。"
          }`;
        })
        .join("\n\n")
    : "暂无明确主角或重要配角，按镜头剧情推进理解角色状态。";

  const shotBlocks = shots.length
    ? shots
        .map((shot, index) => {
          const previous = shots[index - 1];
          const next = shots[index + 1];
          const names = (shot.appearingCharacterIds || [])
            .map((id) => characterById.get(id)?.name || id)
            .filter(Boolean);
          const intentSubject = names.length ? names.join("、") : "本镜关键角色";
          return `第${shot.index}镜：${shot.title}
剧情功能：${storyDevelopmentFunctionLabel(index, shots.length)}，推动“${shot.title}”这一剧情节点。
上一镜承接：${previous ? `承接第${previous.index}镜《${previous.title}》后的行动结果。` : "开场镜头，无上一镜"}
本镜发生的变化：${shot.action || shot.title}。
角色意图：${intentSubject}围绕当前冲突继续行动，目标随本镜剧情推进而变得更明确。
动作发展方向：${shot.action || shot.title}${shot.camera ? `；运动节奏参考“${shot.camera}”。` : "。"}
结尾落点：${shot.continuityNote || `本镜结束在“${shot.title}”后的新状态，为后续动作留下衔接点。`}
下一镜引出：${next ? `第${next.index}镜《${next.title}》` : "最终镜头，不再引出下一镜"}`;
        })
        .join("\n\n")
    : "暂无镜头剧情推进。";

  return `故事内容发展

【故事总线】
${originalLine}
整体风格：${style}
画面比例：${aspectRatio}
故事从什么状态开始：${firstShot ? `第${firstShot.index}镜《${firstShot.title}》，${firstShot.action || "建立开场冲突"}。` : "尚未生成开场镜头。"}
核心冲突：${characterNames.length ? `${characterNames.join("、")}之间围绕原始故事目标形成冲突。` : "围绕原始故事目标形成冲突。"}
剧情如何升级：${shotChain}
最终走向：${lastShot ? `第${lastShot.index}镜《${lastShot.title}》，${lastShot.action || "完成本轮剧情收束"}。` : "尚未生成结尾镜头。"}

【角色状态发展】
${roleBlocks}

【镜头剧情推进】
${shotBlocks}`;
}

function storyDevelopmentFunctionLabel(index: number, total: number) {
  if (total <= 1) return "完整剧情节点";
  if (index === 0) return "开场建立冲突";
  if (index === total - 1) return "结尾收束结果";
  if (index === Math.floor(total / 2)) return "中段转折升级";
  return "过程推进";
}

function parseStoryAnalysis(raw: string): StoryAnalysisResult {
  const parsed = parseLooseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("故事分析没有返回可解析的 JSON");
  }
  const data = parsed as Record<string, unknown>;
  const rawCharacters = Array.isArray(data.characters) ? data.characters : [];
  const rawScenes = Array.isArray(data.scenes) ? data.scenes : [];
  const rawShots = Array.isArray(data.shots) ? data.shots : [];
  const characters = rawCharacters
    .map(normalizeStoryCharacter)
    .filter((item): item is StoryCharacter => Boolean(item));
  const scenes = rawScenes
    .map(normalizeStoryScene)
    .filter((item): item is StoryScene => Boolean(item));
  const shots = rawShots
    .map((item, index) => normalizeStoryShot(item, index, characters))
    .filter((item): item is StoryShot => Boolean(item));
  if (!characters.length && !shots.length)
    throw new Error("故事分析 JSON 缺少 characters 或 shots");
  return { characters, scenes, shots };
}

function videoNodeSizePatch(node: CanvasNodeData, video: UploadedFile): Pick<CanvasNodeData, "width" | "height" | "position"> {
  const size = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
  return {
    width: size.width,
    height: size.height,
    position: {
      x: node.position.x + node.width / 2 - size.width / 2,
      y: node.position.y + node.height / 2 - size.height / 2,
    },
  };
}

function parseLooseJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("故事分析没有返回内容");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first)
      return JSON.parse(candidate.slice(first, last + 1));
    throw new Error(`无法解析故事分析 JSON：${previewText(candidate)}`);
  }
}

function previewText(value: string, maxLength = 120) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "模型返回为空";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeStoryCharacter(value: unknown): StoryCharacter | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id =
    stringValue(item.id) || `char_${Math.random().toString(36).slice(2, 8)}`;
  const name = stringValue(item.name) || id;
  const importance = storyImportance(item.importance);
  const visualPrompt =
    stringValue(item.visualPrompt) || stringValue(item.appearance) || name;
  return {
    id,
    name,
    aliases: stringArray(item.aliases || item.alias),
    roleType: stringValue(item.roleType),
    importance,
    appearance: stringValue(item.appearance) || visualPrompt,
    personality: stringValue(item.personality),
    relationshipSummary: stringValue(
      item.relationshipSummary || item.relationship,
    ),
    visualPrompt,
    negativePrompt: stringValue(item.negativePrompt || item.avoid),
    status: "draft",
  };
}

function normalizeStoryScene(value: unknown): StoryScene | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id =
    stringValue(item.id) || `scene_${Math.random().toString(36).slice(2, 8)}`;
  const name = stringValue(item.name) || id;
  return {
    id,
    name,
    description: stringValue(item.description) || name,
    mood: stringValue(item.mood),
    visualStyle: stringValue(item.visualStyle),
  };
}

function normalizeStoryShot(
  value: unknown,
  index: number,
  characters: StoryCharacter[],
): StoryShot | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = stringValue(item.id) || `shot_${index + 1}`;
  const title = stringValue(item.title) || `镜头 ${index + 1}`;
  const characterIds = new Set(characters.map((character) => character.id));
  const appearing = stringArray(
    item.appearingCharacterIds || item.appearingCharacters,
  ).filter((id: string) => !characterIds.size || characterIds.has(id));
  const excluded = stringArray(
    item.excludedCharacterIds || item.excludedCharacters,
  ).filter((id: string) => !characterIds.size || characterIds.has(id));
  const characterState = stringValue(
    item.characterState ||
      item.characterStatus ||
      item.personStatus ||
      item["人物状态"],
  );
  const camera = stringValue(
    item.camera ||
      item.framing ||
      item.shotSize ||
      item.viewSize ||
      item["景别"] ||
      item["镜头"] ||
      item["镜头语言"],
  );
  const visualContent = stringValue(
    item.visualContent ||
      item.screenContent ||
      item.frameContent ||
      item.pictureContent ||
      item["画面内容"],
  );
  return {
    id,
    index: Number(item.index) || index + 1,
    title,
    sceneId: stringValue(item.sceneId),
    appearingCharacterIds: appearing,
    excludedCharacterIds: excluded,
    action: stringValue(item.action) || title,
    camera: camera || "电影感中景",
    emotion: stringValue(item.emotion),
    continuityNote: stringValue(item.continuityNote),
    characterState,
    visualContent,
    imagePrompt:
      stringValue(item.imagePrompt) ||
      visualContent ||
      stringValue(item.prompt) ||
      title,
    resultNodeIds: [],
    status: "pending",
  };
}

function storyImportance(value: unknown): StoryCharacter["importance"] {
  return value === "main" ||
    value === "supporting" ||
    value === "minor" ||
    value === "background"
    ? value
    : "supporting";
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value))
    return value.map(stringValue).filter(Boolean).join("，");
  return "";
}

function stringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  const text = stringValue(value);
  return text
    ? text
        .split(/[,，、\s]+/)
        .map((item: string) => item.trim())
        .filter(Boolean)
    : [];
}

function updateStoryCharacterStatus(
  node: CanvasNodeData,
  characterId: string,
  patch: Partial<StoryCharacter>,
): CanvasNodeData {
  return {
    ...node,
    metadata: {
      ...node.metadata,
      storyCharacters: (node.metadata?.storyCharacters || []).map(
        (character) =>
          character.id === characterId ? { ...character, ...patch } : character,
      ),
    },
  };
}

function updateStoryShotStatus(
  node: CanvasNodeData,
  shotId: string,
  patch: Partial<StoryShot>,
): CanvasNodeData {
  return {
    ...node,
    metadata: {
      ...node.metadata,
      storyShots: (node.metadata?.storyShots || []).map((shot) =>
        shot.id === shotId ? { ...shot, ...patch } : shot,
      ),
    },
  };
}

function updateStoryShotsStatus(
  node: CanvasNodeData,
  shotIds: string[],
  patch: Partial<StoryShot>,
): CanvasNodeData {
  const targetIds = new Set(shotIds);
  return {
    ...node,
    metadata: {
      ...node.metadata,
      storyShots: (node.metadata?.storyShots || []).map((shot) =>
        targetIds.has(shot.id)
          ? {
              ...shot,
              ...patch,
              resultNodeIds: patch.resultNodeIds
                ? [
                    ...new Set([
                      ...(shot.resultNodeIds || []),
                      ...patch.resultNodeIds,
                    ]),
                  ]
                : patch.resultNodeIds === undefined
                  ? shot.resultNodeIds
                  : patch.resultNodeIds,
            }
          : shot,
      ),
    },
  };
}

function reconcileStoryDirectorImageResults(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  let changed = false;
  let storyOutputImages = storyDirectorOutputImages(nodes, connections);
  const staleErrorImageIds = staleStoryDirectorErrorImageIds(
    storyOutputImages,
  );
  if (staleErrorImageIds.size) {
    nodes = nodes.filter((node) => !staleErrorImageIds.has(node.id));
    storyOutputImages = storyDirectorOutputImages(nodes, connections);
    changed = true;
  }

  const nextNodes = nodes.map((node) => {
    if (node.type !== CanvasNodeType.StoryDirector) return node;
    const shots = node.metadata?.storyShots || [];
    if (!shots.length) return node;

    const doneByIndex = new Map<number, { nodeId: string; prompt?: string }>();
    const errorByIndex = new Map<number, string>();
    const activeIndexes = new Set<number>();

    (storyOutputImages.get(node.id) || []).forEach((imageNode) => {
      const indexes = storyShotIndexesFromImageNode(imageNode);
      if (!indexes.length) return;
      const metadata = imageNode.metadata || {};
      if (metadata.content) {
        indexes.forEach((index) =>
          doneByIndex.set(index, {
            nodeId: imageNode.id,
            prompt: metadata.prompt,
          }),
        );
        return;
      }
      if (metadata.status === NODE_STATUS_ERROR) {
        indexes.forEach((index) =>
          errorByIndex.set(index, metadata.errorDetails || "分镜图生成失败"),
        );
        return;
      }
      if (
        metadata.sourceImageTaskId &&
        metadata.status === NODE_STATUS_LOADING
      ) {
        indexes.forEach((index) => activeIndexes.add(index));
      }
    });

    let shotChanged = false;
    const nextShots = shots.map((shot) => {
      const done = doneByIndex.get(shot.index);
      if (done) {
        const resultNodeIds = [
          ...new Set([...(shot.resultNodeIds || []), done.nodeId]),
        ];
        const finalPrompt = done.prompt || shot.finalPrompt;
        const nextShot = {
          ...shot,
          status: "done" as const,
          resultNodeIds,
          finalPrompt,
          errorDetails: undefined,
        };
        if (
          shot.status !== nextShot.status ||
          shot.finalPrompt !== nextShot.finalPrompt ||
          shot.errorDetails !== nextShot.errorDetails ||
          !shot.resultNodeIds?.includes(done.nodeId)
        )
          shotChanged = true;
        return nextShot;
      }

      const errorDetails = errorByIndex.get(shot.index);
      if (errorDetails && shot.status === "generating") {
        shotChanged = true;
        return { ...shot, status: "error" as const, errorDetails };
      }

      if (shot.status === "generating" && !activeIndexes.has(shot.index)) {
        shotChanged = true;
        return { ...shot, status: "pending" as const, errorDetails: undefined };
      }

      return shot;
    });

    const hasGeneratingShot = nextShots.some(
      (shot) => shot.status === "generating",
    );
    const shouldClearStoryLoading =
      !hasGeneratingShot &&
      (node.metadata?.status === NODE_STATUS_LOADING ||
        node.metadata?.storyGenerationStatus === NODE_STATUS_LOADING);
    if (!shotChanged && !shouldClearStoryLoading) return node;

    const hasErrorShot = nextShots.some((shot) => shot.status === "error");
    const allDone = nextShots.every((shot) => shot.status === "done");
    changed = true;
    return {
      ...node,
      metadata: {
        ...node.metadata,
        storyShots: nextShots,
        ...(shouldClearStoryLoading
          ? {
              status: hasErrorShot ? NODE_STATUS_ERROR : NODE_STATUS_SUCCESS,
              storyGenerationStatus: hasErrorShot
                ? NODE_STATUS_ERROR
                : allDone
                  ? NODE_STATUS_SUCCESS
                  : ("idle" as const),
              errorDetails: hasErrorShot
                ? node.metadata?.errorDetails
                : undefined,
            }
          : null),
      },
    };
  });

  return changed ? nextNodes : nodes;
}

function storyDirectorOutputImages(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const storyOutputImages = new Map<string, CanvasNodeData[]>();
  connections.forEach((connection) => {
    const from = nodeById.get(connection.fromNodeId);
    const to = nodeById.get(connection.toNodeId);
    if (
      from?.type !== CanvasNodeType.StoryDirector ||
      to?.type !== CanvasNodeType.Image
    )
      return;
    storyOutputImages.set(from.id, [
      ...(storyOutputImages.get(from.id) || []),
      to,
    ]);
  });
  return storyOutputImages;
}

function staleStoryDirectorErrorImageIds(
  storyOutputImages: Map<string, CanvasNodeData[]>,
) {
  const staleIds = new Set<string>();
  storyOutputImages.forEach((images) => {
    const successfulKeys = new Set<string>();
    images.forEach((imageNode) => {
      if (!imageNode.metadata?.content) return;
      const key = storyDirectorImageResultKey(imageNode);
      if (key) successfulKeys.add(key);
    });
    if (!successfulKeys.size) return;
    images.forEach((imageNode) => {
      if (
        imageNode.metadata?.content ||
        imageNode.metadata?.status !== NODE_STATUS_ERROR
      )
        return;
      const key = storyDirectorImageResultKey(imageNode);
      if (key && successfulKeys.has(key)) {
        staleIds.add(imageNode.id);
      }
    });
  });
  return staleIds;
}

function storyDirectorImageResultKey(node: CanvasNodeData) {
  const shotIndexes = storyShotIndexesFromImageNode(node);
  if (shotIndexes.length) return `shot:${shotIndexes.join(",")}`;
  const label = String(node.metadata?.storyLabel || node.title || "").trim();
  return label ? `label:${label}` : "";
}

function storyShotIndexesFromImageNode(node: CanvasNodeData) {
  const metadata = node.metadata || {};
  const rangeStart = numberValue(metadata.storyGrid9ShotStart);
  const rangeEnd = numberValue(metadata.storyGrid9ShotEnd);
  if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
    return Array.from(
      { length: rangeEnd - rangeStart + 1 },
      (_, offset) => rangeStart + offset,
    );
  }
  const index =
    parseStoryShotIndex(metadata.storyLabel) || parseStoryShotIndex(node.title);
  return index ? [index] : [];
}

function parseStoryShotIndex(value: unknown) {
  const text = stringValue(value);
  if (!text) return 0;
  const match = text.match(/第\s*(\d+)\s*镜/) || text.match(/镜头\s*(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

function numberValue(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function syncStoryDirectorInputMetadata(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.type !== CanvasNodeType.StoryDirector) return node;
    const inputs = storyDirectorInputIds(node.id, nodes, connections);
    const storyCharacters = bindStoryCharactersFromInputs(
      node.metadata?.storyCharacters || [],
      inputs.character,
      nodeById,
    );
    const metadata = {
      ...node.metadata,
      storySourceImageNodeId: inputs.reference[0],
      storySourceImageNodeIds: inputs.reference,
      storyCharacterSourceImageNodeIds: inputs.character,
      storySceneSourceImageNodeIds: inputs.scene,
      storyPropSourceImageNodeIds: inputs.prop,
      storyCharacters,
    };
    if (
      node.metadata?.storySourceImageNodeId ===
        metadata.storySourceImageNodeId &&
      sameStringArray(
        node.metadata?.storySourceImageNodeIds,
        metadata.storySourceImageNodeIds,
      ) &&
      sameStringArray(
        node.metadata?.storyCharacterSourceImageNodeIds,
        metadata.storyCharacterSourceImageNodeIds,
      ) &&
      sameStringArray(
        node.metadata?.storySceneSourceImageNodeIds,
        metadata.storySceneSourceImageNodeIds,
      ) &&
      sameStringArray(
        node.metadata?.storyPropSourceImageNodeIds,
        metadata.storyPropSourceImageNodeIds,
      ) &&
      node.metadata?.storyCharacters === storyCharacters
    ) {
      return node;
    }
    changed = true;
    return { ...node, metadata };
  });
  return changed ? nextNodes : nodes;
}

function storyDirectorInputIds(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const result: Record<StoryDirectorInputKind, string[]> = {
    reference: [],
    character: [],
    scene: [],
    prop: [],
  };
  connections
    .filter((connection) => connection.toNodeId === nodeId)
    .forEach((connection) => {
      const source = nodeById.get(connection.fromNodeId);
      if (!hasCanvasImageReference(source))
        return;
      const kind = storyDirectorKindFromHandleId(connection.toHandleId);
      if (!result[kind].includes(source.id)) result[kind].push(source.id);
    });
  return result;
}

function hasCanvasImageReference(
  node: CanvasNodeData | undefined | null,
): node is CanvasNodeData {
  return Boolean(
    node?.type === CanvasNodeType.Image &&
      (node.metadata?.content ||
        node.metadata?.storageKey ||
        node.metadata?.backendUrl),
  );
}

function storyDirectorKindFromHandleId(
  handleId?: string,
): StoryDirectorInputKind {
  return (
    STORY_DIRECTOR_INPUT_HANDLES.find((handle) => handle.id === handleId)
      ?.kind || "reference"
  );
}

function bindStoryCharactersFromInputs(
  characters: StoryCharacter[],
  characterNodeIds: string[],
  nodeById: Map<string, CanvasNodeData>,
) {
  if (!characters.length) return characters;
  const connectedIds = new Set(characterNodeIds);
  const usedIds = new Set<string>();
  let changed = false;
  const cleared = characters.map((character) => {
    if (
      character.referenceNodeId &&
      character.assetSource === "upstream" &&
      !connectedIds.has(character.referenceNodeId)
    ) {
      changed = true;
      return {
        ...character,
        referenceNodeId: undefined,
        referenceImageUrl: undefined,
        assetSource: undefined,
        assetLocked: false,
        status: "draft" as const,
      };
    }
    if (character.referenceNodeId) usedIds.add(character.referenceNodeId);
    return character;
  });
  const candidates = characterNodeIds.filter((id) => !usedIds.has(id));
  if (!candidates.length) return changed ? cleared : characters;

  const next = cleared.map((character) => {
    if (
      character.referenceNodeId ||
      character.importance === "minor" ||
      character.importance === "background"
    )
      return character;
    const matchId =
      findCharacterReferenceCandidate(character, candidates, nodeById) ||
      candidates.find((id) => !usedIds.has(id));
    if (!matchId) return character;
    const source = nodeById.get(matchId);
    const referenceImageUrl =
      source?.metadata?.content ||
      source?.metadata?.backendUrl ||
      source?.metadata?.storageKey;
    if (!referenceImageUrl) return character;
    usedIds.add(matchId);
    changed = true;
    return {
      ...character,
      referenceNodeId: matchId,
      referenceImageUrl,
      assetSource: "upstream" as const,
      assetLocked: true,
      status: "locked" as const,
    };
  });

  return changed ? next : characters;
}

function findCharacterReferenceCandidate(
  character: StoryCharacter,
  candidateIds: string[],
  nodeById: Map<string, CanvasNodeData>,
) {
  const names = [character.name, ...(character.aliases || [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!names.length) return null;
  return (
    candidateIds.find((id) => {
      const node = nodeById.get(id);
      const haystack =
        `${node?.title || ""}\n${node?.metadata?.prompt || ""}`.toLowerCase();
      return names.some((name) => haystack.includes(name));
    }) || null
  );
}

function sameStringArray(
  first: string[] | undefined,
  second: string[] | undefined,
) {
  const left = first || [];
  const right = second || [];
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function buildStoryCharacterImagePrompt(
  character: StoryCharacter,
  director: CanvasNodeData,
  referenceCount = 0,
) {
  const style = director.metadata?.storyStyle || "电影感写实";
  const referenceLine = referenceCount
    ? `参考图只用于统一整体画风、质感、世界观和色彩标准；不要复制参考图中的构图、背景、人物数量、道具或无关主体。`
    : "";
  const subjectRule = storyCharacterIsAnimal(character)
    ? "如果角色本体是动物，只画该动物角色的正面、侧面、背面和头部特写；不要加入人类形态、主人、桌椅、城市、室内场景或其它动物。"
    : "角色必须是单一人类角色；不要出现动物、宠物、猫、狗、桌椅、房间、城市街景、额外人物或剧情场景。";
  return `生成角色设定图，16:9 横版，纯白背景，${style}。

最高优先级统一模板：
- 本故事所有角色图必须像同一套角色资产表，使用完全一致的模板、白底、棚拍光线、镜头距离、色彩风格和渲染质感。
- 画面是 production character sheet / turnaround reference sheet，不是剧情插画、电影截图、写真、海报或场景图。
- 纯白无缝背景，柔和均匀棚拍光，不要任何室内、城市、自然、夜景、桌面、窗户、墙面、地面透视或复杂阴影。
- 固定四区布局，从左到右依次为：正面全身站姿、侧面全身站姿、背面全身站姿、右侧上半身面部特写。
- 四个区域必须是同一个角色、同一套服装、同一发型、同一脸型和同一材质表现；全身视图比例统一，站姿中性。
- 视觉关键词只用于角色身份、外貌、服装和气质；忽略其中的背景、灯光、构图、道具、宠物、场景和剧情动作。
- ${subjectRule}

角色：${character.name}
身份：${character.roleType || character.importance}
外貌：${character.appearance}
性格：${character.personality || "按故事气质表现"}
视觉关键词：${character.visualPrompt}
${referenceLine}

不要出现文字、水印、logo、编号、标签、边框线、拼贴说明。${character.negativePrompt ? `\n避免：${character.negativePrompt}` : ""}`;
}

function upgradeStoryCharacterPromptForRegeneration(
  prompt: string,
  node: CanvasNodeData | undefined,
) {
  if (!prompt || prompt.includes("最高优先级统一模板")) return prompt;
  const isCharacterSheet =
    node?.title?.startsWith("角色-") || prompt.includes("生成角色设定图");
  if (!isCharacterSheet) return prompt;
  const characterLine = prompt.match(/角色：([^\n]+)/)?.[1] || "";
  const identityLine = prompt.match(/身份：([^\n]+)/)?.[1] || "";
  const appearanceLine = prompt.match(/外貌：([^\n]+)/)?.[1] || "";
  const isAnimal =
    /转生后为|本体.*(?:猫|狗|狐|狼|虎|豹|鸟|兽)|猫|狗|狐|狼|虎|豹|鸟|兽|灵兽|妖兽|dragon|cat|dog|fox|wolf|tiger|leopard|bird|beast|animal/i.test(
      `${characterLine} ${identityLine} ${appearanceLine}`,
    );
  const subjectRule = isAnimal
    ? "如果角色本体是动物，只画该动物角色的正面、侧面、背面和头部特写；不要加入人类形态、主人、桌椅、城市、室内场景或其它动物。"
    : "角色必须是单一人类角色；不要出现动物、宠物、猫、狗、桌椅、房间、城市街景、额外人物或剧情场景。";
  return `最高优先级统一模板：
- 本故事所有角色图必须像同一套角色资产表，使用完全一致的模板、白底、棚拍光线、镜头距离、色彩风格和渲染质感。
- 画面是 production character sheet / turnaround reference sheet，不是剧情插画、电影截图、写真、海报或场景图。
- 纯白无缝背景，柔和均匀棚拍光，不要任何室内、城市、自然、夜景、桌面、窗户、墙面、地面透视或复杂阴影。
- 固定四区布局，从左到右依次为：正面全身站姿、侧面全身站姿、背面全身站姿、右侧上半身面部特写。
- 四个区域必须是同一个角色、同一套服装、同一发型、同一脸型和同一材质表现；全身视图比例统一，站姿中性。
- 旧提示词里的背景、灯光、构图、道具、宠物、场景和剧情动作全部忽略，只保留角色身份、外貌、服装和气质。
- ${subjectRule}

${prompt}`;
}

function storyCharacterIsAnimal(character: StoryCharacter) {
  const text =
    `${character.name} ${character.roleType || ""} ${character.appearance}`.toLowerCase();
  return /猫|狗|狐|狼|虎|豹|鸟|兽|灵兽|妖兽|dragon|cat|dog|fox|wolf|tiger|leopard|bird|beast|animal/.test(
    text,
  );
}

function storyCharacterDisplayName(character: StoryCharacter, index: number) {
  return character.name?.trim() || `角色-${index + 1}`;
}

function sourceReferenceImagesForStoryDirector(
  director: CanvasNodeData,
  nodes: CanvasNodeData[],
  kinds: StoryDirectorInputKind[] = ["reference", "scene", "prop"],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return kinds.flatMap((kind) =>
    storyDirectorSourceIdsForKind(director, kind).flatMap((id, index) => {
      const source = nodeById.get(id);
      return source
        ? canvasImageReferenceFromNode(
            source,
            `${storyDirectorInputKindLabel(kind)}${index + 1}.png`,
          )
        : [];
    }),
  );
}

function storyDirectorSourceIdsForKind(
  director: CanvasNodeData,
  kind: StoryDirectorInputKind,
) {
  if (kind === "character")
    return director.metadata?.storyCharacterSourceImageNodeIds || [];
  if (kind === "scene")
    return director.metadata?.storySceneSourceImageNodeIds || [];
  if (kind === "prop")
    return director.metadata?.storyPropSourceImageNodeIds || [];
  return director.metadata?.storySourceImageNodeIds?.length
    ? director.metadata.storySourceImageNodeIds
    : director.metadata?.storySourceImageNodeId
      ? [director.metadata.storySourceImageNodeId]
      : [];
}

function storyDirectorInputKindLabel(kind: StoryDirectorInputKind) {
  if (kind === "character") return "角色参考图";
  if (kind === "scene") return "场景参考图";
  if (kind === "prop") return "其它参考图";
  return "故事参考图";
}

function sourceImagesForStoryShot(
  shot: StoryShot,
  nodes: CanvasNodeData[],
  characterById: Map<string, StoryCharacter>,
): ReferenceImage[] {
  return shot.appearingCharacterIds.flatMap((characterId) => {
    const character = characterById.get(characterId);
    const node = character?.referenceNodeId
      ? nodes.find((item) => item.id === character.referenceNodeId)
      : null;
    return node
      ? canvasImageReferenceFromNode(
          node,
          `${character?.name || node.title || node.id}.png`,
        )
      : [];
  });
}

function canvasImageReferenceFromNode(
  node: CanvasNodeData,
  name: string,
): ReferenceImage[] {
  if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
  return [
    {
      id: node.id,
      name,
      type: node.metadata.mimeType || "image/png",
      dataUrl: node.metadata.content,
      storageKey: node.metadata.storageKey,
    },
  ];
}

function mergeReferenceImages(images: ReferenceImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });
}

function buildStoryShotImagePrompt(
  shot: StoryShot,
  director: CanvasNodeData,
  characterById: Map<string, StoryCharacter>,
  references: ReferenceImage[],
) {
  const style = director.metadata?.storyStyle || "电影感写实";
  const appearing = shot.appearingCharacterIds.map(
    (id) => characterById.get(id)?.name || id,
  );
  const excluded = shot.excludedCharacterIds.map(
    (id) => characterById.get(id)?.name || id,
  );
  const referenceLines = storyReferenceLinesForShot(
    shot,
    director,
    characterById,
    references,
  );
  const instanceRule = storySingleInstanceRule(appearing);
  return `画面比例 ${director.metadata?.storyAspectRatio || "16:9"}，${style}。

最高优先级人物数量规则：
${instanceRule}
参考图只是身份卡和服装卡，只提取脸型、发型、服装、配色和气质；不要复制参考图里的构图、人数、多视角、多姿态或多个站位。

当前镜头：第 ${shot.index} 镜，${shot.title}
动作：${shot.action}
景别：${shot.camera || "电影感中景"}
情绪：${shot.emotion || "符合剧情"}
画面内容：${shot.visualContent || shot.imagePrompt}
连续性：${shot.continuityNote || "保持故事连贯"}

${shot.imagePrompt}

${referenceLines ? `参考图片编号：\n${referenceLines}\n` : ""}
本镜头只出现：${appearing.length ? appearing.join("、") : "镜头描述中指定的人物"}。
不要出现：${excluded.length ? excluded.join("、") : "未在本镜头出现的其他主要角色"}。
不要把同一角色画成多个分身、复制人、镜像人物、远近两个版本、背景人物、群众、画像、雕像、屏幕画面、投影或倒影。不要让角色串脸，不要加入无关人物，不要文字、水印、logo。`;
}

function buildStoryGrid9ImagePrompt(
  shots: StoryShot[],
  director: CanvasNodeData,
  characterById: Map<string, StoryCharacter>,
  references: ReferenceImage[],
) {
  const style = director.metadata?.storyStyle || "电影感写实";
  const aspectRatio = director.metadata?.storyAspectRatio || "16:9";
  const cells = shots
    .map((shot, index) => {
      const appearingNames = shot.appearingCharacterIds.map(
        (id) => characterById.get(id)?.name || id,
      );
      const appearing = appearingNames.join("、") || "镜头描述中指定的人物";
      const excluded =
        shot.excludedCharacterIds
          .map((id) => characterById.get(id)?.name || id)
          .join("、") || "未在本镜头出现的其他主要角色";
      return `格${index + 1} / 第${shot.index}镜《${shot.title}》
动作：${shot.action}
景别：${shot.camera || "电影感中景"}
情绪：${shot.emotion || "符合剧情"}
画面内容：${shot.visualContent || shot.imagePrompt}
画面：${shot.imagePrompt}
只出现：${appearing}
${storySingleInstanceRule(appearingNames)}
不要出现：${excluded}`;
    })
    .join("\n\n");
  const referenceLines = storyReferenceLinesForGrid(
    shots,
    director,
    characterById,
    references,
  );

  return `生成一张 3x3 九宫格连续分镜图，画面比例 ${aspectRatio}，${style}。

规则：
- 一张图里必须有 9 个清晰独立画格，按从左到右、从上到下排列。
- 每个画格是一张完整分镜，构图干净，方便用户后续切图。
- 保持角色身份、服装、场景连续性；不要串脸，不要让未出现角色乱入。
- 每个画格必须严格遵守该格的人物数量规则；人数不能多也不能少。
- 每个画格内，同一个角色最多出现一次；不要把角色参考图复制成多个相同人物、多个姿态、多个站位或背景人物。
- 不要在画面中加入任何文字、数字、编号、镜头号、页码、字幕、水印、logo。
${references.length ? "- 参考图用于人物身份、场景、道具和整体连续性；参考图不是画面构图，不要机械复制参考图中的多视角、多姿态或多个主体。\n" : ""}${referenceLines ? `参考图片编号：\n${referenceLines}\n` : ""}
九宫格内容：
${cells}`;
}

function storySingleInstanceRule(appearingNames: string[]) {
  const names = appearingNames.filter(Boolean);
  if (!names.length)
    return "最终画面只画镜头描述明确要求的人物；每个主要角色最多出现一次，不要添加背景人物、群众、倒影或投影人物。";
  if (names.length === 1)
    return `最终画面中人物/动物角色总数必须是 1，只允许出现：${names[0]} 1 个。${names[0]}只能有一个实体，不能同时出现正面、侧面、背影、远景小人或第二个相同角色。`;
  return `最终画面中主要角色总数必须是 ${names.length}，名单为：${names.map((name) => `${name} 1 个`).join("、")}。每个角色只能有一个实体，不能重复出现同一张脸、同一套服装、同一动物花色或同一身份。`;
}

function storyReferenceLinesForShot(
  shot: StoryShot,
  director: CanvasNodeData,
  characterById: Map<string, StoryCharacter>,
  references: ReferenceImage[],
) {
  const characterLines = storyCharacterReferenceLines(
    [shot],
    characterById,
    references,
  );
  const supportLines = storySupportReferenceLines(director, references);
  return [characterLines, supportLines].filter(Boolean).join("\n");
}

function storyReferenceLinesForGrid(
  shots: StoryShot[],
  director: CanvasNodeData,
  characterById: Map<string, StoryCharacter>,
  references: ReferenceImage[],
) {
  const characterLines = storyCharacterReferenceLines(
    shots,
    characterById,
    references,
  );
  const supportLines = storySupportReferenceLines(director, references);
  return [characterLines, supportLines].filter(Boolean).join("\n");
}

function storyCharacterReferenceLines(
  shots: StoryShot[],
  characterById: Map<string, StoryCharacter>,
  references: ReferenceImage[],
) {
  const seen = new Set<string>();
  return shots
    .flatMap((shot) => shot.appearingCharacterIds)
    .map((id) => characterById.get(id))
    .filter((character): character is StoryCharacter =>
      Boolean(character?.referenceNodeId),
    )
    .map((character) => {
      if (seen.has(character.id)) return "";
      seen.add(character.id);
      const referenceIndex = references.findIndex(
        (reference) => reference.id === character.referenceNodeId,
      );
      return referenceIndex >= 0
        ? `图片${referenceIndex + 1} = ${character.name}，只用于身份、脸型、发型和服装参考；如果参考图包含多视角或多姿态，只取一个身份特征，每个画格里${character.name}最多出现一次。`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}

function storySupportReferenceLines(
  director: CanvasNodeData,
  references: ReferenceImage[],
) {
  const lines: string[] = [];
  const addLines = (
    ids: string[] | undefined,
    label: string,
    detail: string,
  ) => {
    ids?.forEach((id) => {
      const referenceIndex = references.findIndex(
        (reference) => reference.id === id,
      );
      if (referenceIndex >= 0)
        lines.push(`图片${referenceIndex + 1} = ${label}，${detail}`);
    });
  };
  addLines(
    director.metadata?.storySourceImageNodeIds ||
      (director.metadata?.storySourceImageNodeId
        ? [director.metadata.storySourceImageNodeId]
        : []),
    "故事整体参考",
    "只用于整体世界观、画风、色彩和连续性，不要复制构图、人物数量或无关主体。",
  );
  addLines(
    director.metadata?.storySceneSourceImageNodeIds,
    "场景参考",
    "只用于环境结构、空间关系、光线和氛围，不要把参考图中的人物或无关元素带入画面。",
  );
  addLines(
    director.metadata?.storyPropSourceImageNodeIds,
    "道具/其它参考",
    "只用于道具外形、材质、纹理、颜色和关键识别点；只有镜头内容需要该道具时才出现，不要当成人物参考。",
  );
  return lines.join("\n");
}

function buildStoryDirectorPrompt(
  node: CanvasNodeData,
  kind: StoryDirectorConfigKind,
) {
  const shotCount = node.metadata?.storyShotCount || 12;
  const style = node.metadata?.storyStyle || "电影感写实";
  const aspectRatio = node.metadata?.storyAspectRatio || "16:9";

  if (kind === "analysis") {
    return `你是故事导演节点的剧本分析模型。请读取上游“故事导演”文本，输出严格 JSON，不要输出解释。

任务：
1. 提取主要角色、重要配角、场景、人物关系。
2. 将剧情拆成 ${shotCount} 个镜头。
3. 每个镜头必须明确 appearingCharacterIds 和 excludedCharacterIds，防止不该出现的人物乱入。
4. characters[].visualPrompt 只能写角色本体的外貌、发型、服装、年龄、体型、气质和关键识别点；不要写背景、城市、房间、桌面、灯光、镜头、构图、剧情动作、宠物或其它角色。宠物/动物只能在该角色本体就是动物时写入。
5. characters[].negativePrompt 要补充会破坏角色资产统一性的内容，例如背景、场景、道具、其它人物、宠物、文字、水印、不同画风。
6. shots[].camera 要写景别和镜头语言，例如远景/中景/近景/特写、静态/推拉/摇移/俯拍/仰拍。
7. shots[].visualContent 要单独写画面内容，包括画面里看得见的主体、环境、道具、人物姿态、表情、空间关系、光线和关键视觉事件。
8. 输入文本可能是小说、章节大纲、脱口秀脚本、PPT 条目、对白、弹幕或分镜清单；这些都只是剧情内容，不是 JSON 源码。
9. 所有字符串字段必须是合法 JSON 字符串。对白、百分比、项目符号、书名号、引号和换行都要被安全写入字符串值；不要输出未转义换行、裸引号、Markdown、代码块或解释文字。

JSON 结构：
{
  "characters": [
    {
      "id": "char_001",
      "name": "角色名",
      "aliases": ["别名/称呼"],
      "roleType": "male_lead/supporting/villain/other",
      "importance": "main/supporting/minor/background",
      "appearance": "外貌",
      "personality": "性格",
      "visualPrompt": "可直接用于角色设定图的视觉提示词",
      "negativePrompt": "不要出现的特征"
    }
  ],
  "scenes": [
    {
      "id": "scene_001",
      "name": "场景名",
      "description": "场景描述",
      "mood": "氛围"
    }
  ],
  "shots": [
    {
      "id": "shot_001",
      "index": 1,
      "title": "镜头标题",
      "sceneId": "scene_001",
      "appearingCharacterIds": ["char_001"],
      "excludedCharacterIds": ["char_002"],
      "action": "动作",
      "camera": "景别和镜头语言，例如中景静态、近景推镜、远景俯拍",
      "emotion": "情绪",
      "visualContent": "画面内容：主体、环境、道具、光线、空间关系、关键视觉事件",
      "imagePrompt": "用于生成该镜头图片的提示词"
    }
  ]
}`;
  }

  if (kind === "character") {
    return `根据上游故事文本，为主要角色和重要配角生成角色设定图。画风：${style}。

请生成一张 ${aspectRatio} 横版角色资产图：纯白背景，包含多个角色设定区；每个重要角色需要正面、侧面、背面和上半身面部特写。保持同一角色的脸型、发型、服装和关键识别点一致。

要求：
- 只画故事中的 main 和 supporting 角色。
- 不要复杂背景。
- 不要水印、logo、无关文字。
- 每个角色要有清晰独立区域，避免串脸和混合人物。`;
  }

  return `根据上游故事文本生成分镜图片。画风：${style}。画面比例：${aspectRatio}。镜头数量：${shotCount}。

生成规则：
- 每个镜头只出现该镜头应该出现的角色。
- 每个出现角色在单张分镜里只能出现一次；如果只出现 1 个角色，最终画面就只能有 1 个角色实体。
- 没出现在当前镜头中的主要角色必须明确不要出现。
- 如果已连接首帧/参考图，请只把它作为风格、连续性、身份或末帧状态参考，不要复制参考图中的多视角、多姿态、多个站位或无关角色。
- 强调镜头语言、场景、动作、情绪和光线。
- 输出连续分镜感的一组图片，每张图代表一个镜头。`;
}

function buildStoryAnalysisRepairPrompt(
  node: CanvasNodeData,
  storyText: string,
  brokenOutput: string,
  error: unknown,
) {
  const reason =
    error instanceof Error ? error.message : String(error || "JSON 解析失败");
  return `你是故事导演节点的 JSON 修复模型。上一轮“故事分析”没有返回可解析 JSON，请根据原故事和错误输出，重新生成一个严格合法的 JSON 对象。

必须遵守：
1. 只输出 JSON 对象，不要 Markdown、代码块、解释、前后缀。
2. 顶层只能包含 characters、scenes、shots 三个数组。
3. 原故事可能包含 PPT 标题、项目符号、百分比、对白、弹幕、章节号和镜头号；它们都只是剧情内容。请转写成合法 JSON 字符串，不要把原文格式当成 JSON 语法。
4. 字符串中如需保留对白或多条内容，用一句通顺描述概括，避免原样复制多行对白造成 JSON 破损。
5. shots 数量按原任务要求整理；如果原文已有镜头清单，优先保留其顺序和核心内容。

目标结构：
${buildStoryDirectorPrompt(node, "analysis")}

解析错误：
${reason}

上一轮错误输出：
${clipForPrompt(brokenOutput)}

原故事文本：
${clipForPrompt(storyText)}`;
}

function clipForPrompt(value: string, maxLength = 12000) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  const half = Math.floor((maxLength - 80) / 2);
  return `${text.slice(0, half)}\n\n...中间内容已省略...\n\n${text.slice(-half)}`;
}

function supportsStoryDirectorJsonResponseFormat(model: string) {
  return !/^gemini(?:[-_.]|$)/i.test(model.trim());
}

function buildGenerationConfig(
  config: AiConfig,
  node: CanvasNodeData | undefined,
  mode: CanvasNodeGenerationMode,
): AiConfig {
  const defaultModel =
    mode === "image"
      ? config.imageModel
      : mode === "video"
        ? config.videoModel
        : mode === "audio"
          ? config.audioModel
          : config.textModel;
  const nodeModel =
    node?.metadata?.model && modelMatchesCapability(node.metadata.model, mode)
      ? node.metadata.model
      : "";
  return {
    ...config,
    model:
      nodeModel ||
      defaultModel ||
      (mode === "audio"
        ? defaultConfig.audioModel
        : config.model || defaultConfig.model),
    quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
    size: node?.metadata?.size || config.size || defaultConfig.size,
    videoSeconds:
      node?.metadata?.seconds ||
      config.videoSeconds ||
      defaultConfig.videoSeconds,
    vquality:
      node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
    videoGenerateAudio:
      node?.metadata?.generateAudio ||
      config.videoGenerateAudio ||
      defaultConfig.videoGenerateAudio,
    videoWatermark:
      node?.metadata?.watermark ||
      config.videoWatermark ||
      defaultConfig.videoWatermark,
    audioVoice:
      node?.metadata?.audioVoice ||
      config.audioVoice ||
      defaultConfig.audioVoice,
    audioFormat:
      node?.metadata?.audioFormat ||
      config.audioFormat ||
      defaultConfig.audioFormat,
    audioSpeed:
      node?.metadata?.audioSpeed ||
      config.audioSpeed ||
      defaultConfig.audioSpeed,
    audioInstructions:
      node?.metadata?.audioInstructions ||
      config.audioInstructions ||
      defaultConfig.audioInstructions,
    count: String(
      node?.metadata?.count ||
        (mode === "image"
          ? config.canvasImageCount || config.count
          : config.count) ||
        defaultConfig.count,
    ),
  };
}

function recoverInterruptedGeneration(nodes: CanvasNodeData[]) {
  return nodes.map((node) => {
    if (node.type === CanvasNodeType.StoryDirector)
      return recoverInterruptedStoryDirector(node);
    if (node.metadata?.status !== NODE_STATUS_LOADING) return node;
    if (node.type === CanvasNodeType.Image && node.metadata.sourceImageTaskId)
      return node;
    if (
      node.type === CanvasNodeType.Config ||
      (node.metadata.isBatchRoot && node.metadata.batchChildIds?.length)
    ) {
      return {
        ...node,
        metadata: {
          ...node.metadata,
          status: NODE_STATUS_SUCCESS,
          errorDetails: undefined,
        },
      };
    }
    return { ...node, metadata: clearCanvasGenerationTrace(node.metadata) };
  });
}

function recoverInterruptedStoryDirector(node: CanvasNodeData) {
  const metadata = node.metadata || {};
  const storyAnalysisStatus =
    metadata.storyAnalysisStatus === NODE_STATUS_LOADING
      ? "idle"
      : metadata.storyAnalysisStatus;
  const storyGenerationStatus =
    metadata.storyGenerationStatus === NODE_STATUS_LOADING
      ? "idle"
      : metadata.storyGenerationStatus;
  const hasLoadingStory =
    storyAnalysisStatus !== metadata.storyAnalysisStatus ||
    storyGenerationStatus !== metadata.storyGenerationStatus ||
    metadata.status === NODE_STATUS_LOADING;
  if (!hasLoadingStory) return node;
  return {
    ...node,
    metadata: {
      ...metadata,
      status: metadata.errorDetails
        ? NODE_STATUS_ERROR
        : NODE_STATUS_SUCCESS,
      storyAnalysisStatus,
      storyGenerationStatus,
      storyCharacters: metadata.storyCharacters || [],
      storyShots: metadata.storyShots || [],
    },
  };
}

function clearCanvasGenerationTrace(metadata: CanvasNodeMetadata | undefined) {
  const { status, errorDetails, sourceImageTaskId, ...rest } = metadata || {};
  return rest;
}

function findRetrySourceNode(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const queue = connections
    .filter((connection) => connection.toNodeId === nodeId)
    .map((connection) => connection.fromNodeId);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find((item) => item.id === id);
    if (node?.type === CanvasNodeType.Config) return node;
    connections
      .filter((connection) => connection.toNodeId === id)
      .forEach((connection) => queue.push(connection.fromNodeId));
  }
  return null;
}

function sourceNodeReferenceImages(node: CanvasNodeData | null) {
  if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content)
    return [];
  return [
    {
      id: node.id,
      name: `${node.title || node.id}.png`,
      type: node.metadata.mimeType || "image/png",
      dataUrl: node.metadata.content,
      storageKey: node.metadata.storageKey,
    },
  ];
}

function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

function isSupportedCanvasFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    isAudioFile(file)
  );
}

function getGridPosition(
  anchor: Position,
  index: number,
  total: number,
): Position {
  const columns = Math.min(4, Math.ceil(Math.sqrt(total)));
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: anchor.x + (column - (columns - 1) / 2) * CANVAS_FILE_GRID_GAP_X,
    y:
      anchor.y +
      (row - (Math.ceil(total / columns) - 1) / 2) * CANVAS_FILE_GRID_GAP_Y,
  };
}

function isHiddenBatchChild(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
  collapsingBatchIds?: Set<string>,
) {
  const rootId = node.metadata?.batchRootId;
  if (!rootId) return false;
  const root = nodes.find((item) => item.id === rootId);
  if (root && collapsingBatchIds?.has(rootId)) return false;
  return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function isHiddenBatchConnectionEndpoint(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
) {
  const rootId = node.metadata?.batchRootId;
  if (!rootId) return false;
  const root = nodes.find((item) => item.id === rootId);
  return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function buildAngleLabel(params: CanvasImageAngleParams) {
  const horizontal =
    params.horizontalAngle === 0
      ? "正面视角"
      : params.horizontalAngle > 0
        ? `向右旋转 ${params.horizontalAngle} 度`
        : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
  const pitch =
    params.pitchAngle === 0
      ? "水平视角"
      : params.pitchAngle > 0
        ? `俯视 ${params.pitchAngle} 度`
        : `仰视 ${Math.abs(params.pitchAngle)} 度`;
  return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
  return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
