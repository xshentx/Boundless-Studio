"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Clapperboard, Eye, Film, Image as ImageIcon, Music2, RefreshCw, Star, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { ModelSelectControl } from "@/components/model-picker";
import { formatBytes } from "@/lib/image-utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { selectableModelsByCapability, useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { NODE_DEFAULT_SIZE } from "../constants";
import { CanvasNodeType, STORY_DIRECTOR_INPUT_HANDLES, type CanvasNodeData, type Position, type Seedance2ExtraReferenceSlotKey, type Seedance2ReferenceSlotBinding, type Seedance2ReferenceSlotKey, type Seedance2ReferenceSlotUseAs } from "../types";
import { formatCanvasGenerationError } from "../utils/canvas-errors";
import {
    normalizeSeedance2AspectRatio,
    normalizeSeedance2Duration,
    seedance2PlaceholderSize,
    SEEDANCE2_DURATION_OPTIONS,
} from "../utils/seedance2-workflow";
import { SEEDANCE2_PORTRAIT_MIN_SIZE, seedance2RatioFromNodeFrame, seedance2VisibleReferenceSlotCount } from "../utils/seedance2-responsive-layout";
import {
    seedance2PortraitReferenceGridClassName,
    seedance2ReferenceGridCanvasEventHandlers,
} from "../utils/seedance2-reference-grid";
import {
    SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
    SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER,
    SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY,
    buildSeedance2ReferenceSlotKeysFromOrder,
    normalizeSeedance2ReferenceSlotUseAs,
    seedance2BoundExtraSlotStats,
    type Seedance2ResolvedReferenceSlot,
} from "../utils/seedance2-reference-slots";
import { seedance2RegeneratePromptPatch } from "../utils/seedance2-story-integration";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
const selectionBlue = "#2f80ff";
const IMAGE_WHEEL_SCALE_PRESETS = [0.55, 0.7, 0.85, 1, 1.25, 1.5, 1.75, 2, 2.4, 3, 3.8, 4.8, 6];
const IMAGE_LABEL_ID_LENGTH = 4;
const STORY_DIRECTOR_MIN_HEIGHT = NODE_DEFAULT_SIZE[CanvasNodeType.StoryDirector].height;
const SEEDANCE2_RATIO_OPTIONS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;
const SEEDANCE2_PORTRAIT_DEFAULT_REFERENCE_SLOT_COUNT = 2;
const SEEDANCE2_LANDSCAPE_DEFAULT_REFERENCE_SLOT_COUNT = 4;
const SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH = 1114;
const SEEDANCE2_HTML_PLACEHOLDER_BASE_HEIGHT = 668;
const SEEDANCE2_HTML_STAGE_NODE_LEFT = 88;
const SEEDANCE2_HTML_STAGE_NODE_TOP = 30;
const SEEDANCE2_HTML_LANDSCAPE_RECTS = {
    divider: { left: 421, top: 33, width: 2, height: 662 },
    preview: { left: 106, top: 49, width: 301, height: 220 },
    model: { left: 106, top: 283, width: 301, height: 53 },
    ratio: { left: 107, top: 343, width: 147, height: 53 },
    duration: { left: 261, top: 343, width: 145, height: 53 },
    upload: { left: 106, top: 410, width: 301, height: 269 },
    promptTitle: { left: 445, top: 61, width: 210, height: 26 },
    promptEdit: { left: 991, top: 61, width: 185, height: 26 },
    promptBox: { left: 445, top: 103, width: 731, height: 486 },
    generate: { left: 445, top: 604, width: 731, height: 67 },
} as const;

type Seedance2HtmlLandscapeRect = (typeof SEEDANCE2_HTML_LANDSCAPE_RECTS)[keyof typeof SEEDANCE2_HTML_LANDSCAPE_RECTS];

type Seedance2PlaceholderAspectRatioSources = {
    upstreamNaturalRatio?: string | null;
    currentShotRatio?: string | null;
};

type CanvasNodeResizeOptions = {
    persistSeedanceManualMinHeight?: boolean;
    seedanceRatio?: "9:16" | "16:9";
};

type CanvasNodeProps = {
    data: CanvasNodeData;
    scale: number;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    connectionTargetHandleId?: string | null;
    isConnecting: boolean;
    isRunning?: boolean;
    editRequestNonce?: number;
    showPanel: boolean;
    showImageInfo: boolean;
    resourceLabel?: CanvasResourceReference;
    mentionReferences?: CanvasResourceReference[];
    seedance2AspectRatioSources?: Seedance2PlaceholderAspectRatioSources;
    seedance2ReferenceSlots?: Seedance2ResolvedReferenceSlot[];
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    batchCount?: number;
    batchExpanded?: boolean;
    batchClosing?: boolean;
    batchOpening?: boolean;
    batchRecovering?: boolean;
    batchMotion?: { x: number; y: number; index: number };
    onMouseDown: (event: React.MouseEvent, nodeId: string) => void;
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (event: React.MouseEvent, nodeId: string, handleType: "source" | "target", handleId?: string) => void;
    onResize: (nodeId: string, width: number, height: number, position?: Position, options?: CanvasNodeResizeOptions) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onDeleteConnection?: (connectionId: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onGenerateVideo?: (node: CanvasNodeData) => void;
    onExtractVideoFrame?: (node: CanvasNodeData, frame: { dataUrl: string; width: number; height: number; currentTime: number }) => void;
    onViewImage?: (node: CanvasNodeData) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    isRunning?: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    resourceLabel?: CanvasResourceReference;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onDeleteConnection?: (connectionId: string) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    seedance2AspectRatioSources?: Seedance2PlaceholderAspectRatioSources;
    seedance2ReferenceSlots?: Seedance2ResolvedReferenceSlot[];
    onRetry?: (node: CanvasNodeData) => void;
    onGenerateImage?: (node: CanvasNodeData) => void;
    onGenerateVideo?: (node: CanvasNodeData) => void;
    onExtractVideoFrame?: (node: CanvasNodeData, frame: { dataUrl: string; width: number; height: number; currentTime: number }) => void;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
};

export const CanvasNode = React.memo(function CanvasNode({
    data,
    scale,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    connectionTargetHandleId,
    isConnecting,
    isRunning = false,
    editRequestNonce = 0,
    showPanel,
    showImageInfo,
    resourceLabel,
    mentionReferences = [],
    seedance2AspectRatioSources,
    seedance2ReferenceSlots,
    renderPanel,
    renderNodeContent,
    batchCount = 0,
    batchExpanded = false,
    batchClosing = false,
    batchOpening = false,
    batchRecovering = false,
    batchMotion,
    onMouseDown,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResize,
    onContentChange,
    onMetadataChange,
    onDeleteConnection,
    onToggleBatch,
    onSetBatchPrimary,
    onRetry,
    onGenerateImage,
    onGenerateVideo,
    onExtractVideoFrame,
    onViewImage,
    onContextMenu,
}: CanvasNodeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [hovered, setHovered] = useState(false);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const contentFrameRef = useRef<HTMLDivElement | null>(null);
    const storyResizeFrameRef = useRef<number | null>(null);
    const seedance2ResizeFrameRef = useRef<number | null>(null);
    const nodeSizeRef = useRef({ id: data.id, width: data.width, height: data.height });
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content);
    const isStoryDirector = data.type === CanvasNodeType.StoryDirector;
    const isSeedance2Workflow = data.type === CanvasNodeType.Seedance2Workflow;
    const isSeedance2VideoPlaceholder = data.type === CanvasNodeType.Video && !data.metadata?.content && data.metadata?.seedanceWorkflowRole === "placeholder";
    nodeSizeRef.current = { id: data.id, width: data.width, height: data.height };
    const isBatchRoot = data.type === CanvasNodeType.Image && Boolean(data.metadata?.isBatchRoot) && batchCount > 1;
    const isBatchChild = data.type === CanvasNodeType.Image && Boolean(data.metadata?.batchRootId);
    const isActive = isConnectionTarget || isSelected;
    const showSelectionCornerDots = isSelected && data.type !== CanvasNodeType.StoryDirector;
    const imageBorderColor = isActive ? selectionBlue : isFocusRelated ? `${selectionBlue}aa` : isRelated && !isBatchChild ? theme.node.muted : "transparent";
    const activeShadow = isStoryDirector && isSelected
        ? `0 0 0 2px ${selectionBlue}, 0 0 0 7px ${selectionBlue}24, 0 20px 54px rgba(47,128,255,.24)`
        : isStoryDirector && isConnectionTarget
          ? `0 0 0 2px ${selectionBlue}, 0 0 0 6px ${selectionBlue}20`
          : isSelected
        ? `0 0 0 2px ${selectionBlue}, 0 0 0 7px ${selectionBlue}24, 0 20px 54px rgba(47,128,255,.28)`
        : isConnectionTarget
          ? `0 0 0 2px ${selectionBlue}, 0 0 0 6px ${selectionBlue}20`
          : isFocusRelated
            ? `0 0 0 1px ${selectionBlue}55, 0 18px 48px rgba(0,0,0,.14)`
            : isRelated && !isBatchChild
              ? `0 0 0 1px ${theme.node.muted}55, 0 18px 48px rgba(0,0,0,.14)`
              : undefined;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        keepRatio: false,
        ratio: 1,
    });
    const resizeContextRef = useRef({
        data,
        isSeedance2VideoPlaceholder,
        seedance2AspectRatioSources,
        onResize,
    });
    resizeContextRef.current = {
        data,
        isSeedance2VideoPlaceholder,
        seedance2AspectRatioSources,
        onResize,
    };

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!isEditingContent) return;
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingContent]);

    useEffect(() => {
        if (!editRequestNonce || data.type !== CanvasNodeType.Text) return;
        setIsEditingContent(true);
    }, [data.type, editRequestNonce]);

    useEffect(() => {
        if (!isSeedance2VideoPlaceholder) return;

        if (seedance2ResizeFrameRef.current !== null) cancelAnimationFrame(seedance2ResizeFrameRef.current);
        seedance2ResizeFrameRef.current = requestAnimationFrame(() => {
            seedance2ResizeFrameRef.current = null;
            const ratio = resolveSeedance2PlaceholderRatio(data, seedance2AspectRatioSources);
            const stableSize = seedance2PlaceholderSize(ratio);
            const manualMinimumHeight = data.metadata?.seedanceReferenceSlotsExpanded === true
                ? Number(data.metadata.seedanceManualMinHeight || 0)
                : 0;
            const nextHeight = Math.max(stableSize.height, manualMinimumHeight);
            const nextWidth = data.metadata?.seedanceReferenceSlotsExpanded === true
                ? Math.max(stableSize.width, data.width)
                : stableSize.width;
            if (data.width === nextWidth && Math.abs(data.height - nextHeight) <= 2) return;
            onResize(data.id, nextWidth, nextHeight, data.position, { persistSeedanceManualMinHeight: false });
        });
        return () => {
            if (seedance2ResizeFrameRef.current !== null) cancelAnimationFrame(seedance2ResizeFrameRef.current);
        };
    }, [
        data.height,
        data.id,
        data.metadata?.seedanceManualMinHeight,
        data.metadata?.seedanceReferenceSlotsExpanded,
        data.metadata?.seedanceInheritSourceRatio,
        data.metadata?.seedanceRatio,
        data.metadata?.seedanceRatioTouched,
        data.metadata?.seedanceSourceAspectRatio,
        data.metadata?.size,
        data.position,
        data.width,
        isSeedance2VideoPlaceholder,
        onResize,
        seedance2AspectRatioSources?.currentShotRatio,
        seedance2AspectRatioSources?.upstreamNaturalRatio,
    ]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    const handleResizeMove = useCallback(
        (event: MouseEvent) => {
            if (!resizeRef.current.isResizing) return;
            const {
                data,
                isSeedance2VideoPlaceholder,
                seedance2AspectRatioSources,
                onResize,
            } = resizeContextRef.current;

            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const minWidth = 220;
            const minHeight = 160;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx));
            const rawHeight = Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
            }

            let resizeOptions: CanvasNodeResizeOptions | undefined;
            if (isSeedance2VideoPlaceholder) {
                const ratio = resolveSeedance2PlaceholderRatio(data, seedance2AspectRatioSources);
                const normalizedRatio = normalizeSeedance2AspectRatio(ratio);
                const currentRatio = normalizedRatio === "16:9" ? "16:9" : "9:16";
                const nextRatio = seedance2RatioFromNodeFrame(width, height, currentRatio);
                resizeOptions = { seedanceRatio: nextRatio };
                if (nextRatio === "9:16") {
                    width = Math.max(width, SEEDANCE2_PORTRAIT_MIN_SIZE.width);
                    height = Math.max(height, SEEDANCE2_PORTRAIT_MIN_SIZE.height);
                }
            }

            onResize(data.id, width, height, {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            }, resizeOptions);
        },
        [scale],
    );

    const handleResizeUp = useCallback(() => {
        resizeRef.current.isResizing = false;
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeUp);
    }, [handleResizeMove]);

    const handleResizeMouseDown = (event: React.MouseEvent, corner: ResizeCorner) => {
        event.stopPropagation();
        event.preventDefault();
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || (data.type === CanvasNodeType.Video && !isSeedance2VideoPlaceholder),
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        window.addEventListener("mousemove", handleResizeMove);
        window.addEventListener("mouseup", handleResizeUp);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleResizeMove);
            window.removeEventListener("mouseup", handleResizeUp);
        };
    }, [handleResizeMove, handleResizeUp]);

    useEffect(() => {
        const autoHeightPanel = isStoryDirector
            ? {
                selector: "[data-story-director-panel]",
                minHeight: STORY_DIRECTOR_MIN_HEIGHT,
            }
            : null;
        if (!autoHeightPanel) return;
        const contentFrame = contentFrameRef.current;
        if (!contentFrame) return;

        const syncAutoHeight = () => {
            if (storyResizeFrameRef.current !== null) cancelAnimationFrame(storyResizeFrameRef.current);
            storyResizeFrameRef.current = requestAnimationFrame(() => {
                storyResizeFrameRef.current = null;
                const currentNode = nodeSizeRef.current;
                const panel = contentFrame.querySelector(autoHeightPanel.selector);
                const measuredHeight = panel instanceof HTMLElement ? storyDirectorPanelContentHeight(panel) : contentFrame.scrollHeight;
                const nextHeight = Math.max(
                    autoHeightPanel.minHeight,
                    Math.ceil(measuredHeight + 4),
                );
                if (Math.abs(nextHeight - currentNode.height) > 3) onResize(currentNode.id, currentNode.width, nextHeight);
            });
        };

        const observer = new ResizeObserver(syncAutoHeight);
        observer.observe(contentFrame);
        if (contentFrame.parentElement instanceof HTMLElement) observer.observe(contentFrame.parentElement);
        const observeAutoHeightPanel = () => {
            const panel = contentFrame.querySelector(autoHeightPanel.selector);
            if (!(panel instanceof HTMLElement)) return;
            observer.observe(panel);
            const textarea = panel.querySelector("textarea");
            if (textarea instanceof HTMLTextAreaElement) observer.observe(textarea);
        };
        observeAutoHeightPanel();
        const mutationObserver = new MutationObserver(() => {
            observeAutoHeightPanel();
            syncAutoHeight();
        });
        mutationObserver.observe(contentFrame, { childList: true, subtree: true, attributes: true });
        syncAutoHeight();
        window.setTimeout(syncAutoHeight, 0);
        window.setTimeout(syncAutoHeight, 120);
        return () => {
            observer.disconnect();
            mutationObserver.disconnect();
            if (storyResizeFrameRef.current !== null) cancelAnimationFrame(storyResizeFrameRef.current);
        };
    }, [isSeedance2Workflow, isStoryDirector, onResize]);

    return (
        <div
            data-node-id={data.id}
            className={`node-element absolute flex select-none flex-col transition-shadow duration-200 ${isSelected ? "z-50" : "z-10"}`}
            style={{
                transform: `translate(${data.position.x}px, ${data.position.y}px)`,
                width: data.width,
                height: data.height,
                transition: "box-shadow 200ms ease",
                contain: "layout style",
            }}
            onMouseEnter={() => {
                setHovered(true);
                onHoverStart(data.id);
            }}
            onMouseLeave={() => {
                setHovered(false);
                onHoverEnd(data.id);
            }}
            onContextMenu={(event) => onContextMenu(event, data.id)}
        >
            <div
                className="relative h-full w-full overflow-visible rounded-3xl border-2"
                style={{
                    background: isStoryDirector ? "transparent" : hasImageContent ? theme.node.fill : hasVideoContent ? "transparent" : theme.node.fill,
                    borderColor: isStoryDirector ? (isActive ? selectionBlue : "transparent") : hasImageContent ? imageBorderColor : isActive ? selectionBlue : isFocusRelated ? `${selectionBlue}aa` : isRelated ? theme.node.muted : theme.node.stroke,
                    boxShadow: activeShadow,
                }}
                onMouseDown={(event) => {
                    const target = event.target instanceof Element ? event.target : null;
                    if (target?.closest("[data-canvas-no-drag]")) return;
                    onMouseDown(event, data.id);
                }}
                onDoubleClick={(event) => {
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
                        return;
                    }
                    if (data.type === CanvasNodeType.Image && hasImageContent) {
                        event.stopPropagation();
                        onViewImage?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                <div
                    ref={contentFrameRef}
                    className={`relative flex h-full w-full ${isStoryDirector || isSeedance2Workflow ? "items-start" : "items-center"} justify-center rounded-[inherit] ${isBatchRoot || isStoryDirector || isSeedance2Workflow ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            background: isStoryDirector ? "transparent" : hasImageContent ? theme.node.fill : hasVideoContent ? "transparent" : theme.node.fill,
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    <NodeContent
                        node={data}
                        theme={theme}
                        isEditingContent={isEditingContent}
                        textareaRef={textareaRef}
                        isBatchRoot={isBatchRoot}
                        batchCount={batchCount}
                        batchExpanded={batchExpanded}
                        batchOpening={batchOpening}
                        batchRecovering={batchRecovering}
                        isRunning={isRunning}
                        renderNodeContent={renderNodeContent}
                        resourceLabel={resourceLabel}
                        mentionReferences={mentionReferences}
                        seedance2AspectRatioSources={seedance2AspectRatioSources}
                        seedance2ReferenceSlots={seedance2ReferenceSlots}
                        onContentChange={onContentChange}
                        onMetadataChange={onMetadataChange}
                        onDeleteConnection={onDeleteConnection}
                        onStopEditing={() => setIsEditingContent(false)}
                        onRetry={onRetry}
                        onGenerateImage={onGenerateImage}
                        onGenerateVideo={onGenerateVideo}
                        onExtractVideoFrame={onExtractVideoFrame}
                        onToggleBatch={() => onToggleBatch?.(data.id)}
                        onSetBatchPrimary={() => onSetBatchPrimary?.(data)}
                    />
                </div>

                {showImageInfo && hasImageContent ? <ImageInfoBar node={data} /> : null}
                {resourceLabel && !(hasImageContent && resourceLabel.kind === "image") ? <ResourceLabelBadge reference={resourceLabel} /> : null}

                {!isStoryDirector && !hasImageContent && !hasVideoContent && !hasAudioContent ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${theme.canvas.background}66, transparent)` }} /> : null}

                {!isStoryDirector ? (
                    <>
                        <ResizeHandle corner="top-left" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="top-right" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-left" onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-right" onMouseDown={handleResizeMouseDown} />
                    </>
                ) : null}

                {showSelectionCornerDots ? (
                    <>
                        <span className="pointer-events-none absolute -left-2 -top-2 size-3.5 rounded-full border-2 bg-[#2f80ff]" style={{ borderColor: theme.node.panel }} />
                        <span className="pointer-events-none absolute -right-2 -top-2 size-3.5 rounded-full border-2 bg-[#2f80ff]" style={{ borderColor: theme.node.panel }} />
                        <span className="pointer-events-none absolute -bottom-2 -left-2 size-3.5 rounded-full border-2 bg-[#2f80ff]" style={{ borderColor: theme.node.panel }} />
                        <span className="pointer-events-none absolute -bottom-2 -right-2 size-3.5 rounded-full border-2 bg-[#2f80ff]" style={{ borderColor: theme.node.panel }} />
                    </>
                ) : null}
            </div>

            {data.type === CanvasNodeType.StoryDirector ? (
                <StoryDirectorConnectionHandles
                    activeHandleId={isConnectionTarget ? connectionTargetHandleId : null}
                    visible
                    onMouseDown={(event, handleId) => onConnectStart(event, data.id, "target", handleId)}
                />
            ) : (
                <ConnectionHandleDot nodeType={data.type} side="left" active={isConnectionTarget} visible={hovered || isSelected || isConnecting} onMouseDown={(event) => onConnectStart(event, data.id, "target")} />
            )}
            <ConnectionHandleDot nodeType={data.type} side="right" active={isConnecting && isSelected} visible={data.type !== CanvasNodeType.Config && (hovered || isSelected || isConnecting)} onMouseDown={(event) => onConnectStart(event, data.id, "source")} />

            {data.type !== CanvasNodeType.Video && !isStoryDirector && !isSeedance2Workflow && !isSeedance2VideoPlaceholder && showPanel && renderPanel ? <div className="absolute left-1/2 top-full z-[70] w-[500px] -translate-x-1/2 pt-4">{renderPanel(data)}</div> : null}
        </div>
    );
});

function NodeContent(props: NodeContentRendererProps) {
    if ((props.node.type === CanvasNodeType.Config || props.node.type === CanvasNodeType.StoryDirector || props.node.type === CanvasNodeType.Seedance2Workflow) && props.renderNodeContent) return props.renderNodeContent(props.node);
    if (props.node.type === CanvasNodeType.Video) return <VideoNodeContent {...props} />;
    if (props.isBatchRoot) return <ImageNodeContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type];
    return Renderer ? <Renderer {...props} /> : <UnknownNodeContent theme={props.theme} />;
}

function nearestImageScalePreset(scale: number) {
    return IMAGE_WHEEL_SCALE_PRESETS.reduce((nearest, preset) => (Math.abs(preset - scale) < Math.abs(nearest - scale) ? preset : nearest));
}

function nextImageScalePreset(scale: number, direction: 1 | -1) {
    const current = nearestImageScalePreset(scale);
    const currentIndex = IMAGE_WHEEL_SCALE_PRESETS.indexOf(current);
    return IMAGE_WHEEL_SCALE_PRESETS[Math.min(IMAGE_WHEEL_SCALE_PRESETS.length - 1, Math.max(0, currentIndex + direction))];
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.StoryDirector]: StoryDirectorContent,
    [CanvasNodeType.Seedance2Workflow]: Seedance2WorkflowContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function LoadingContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3" style={{ color: theme.node.activeStroke }}>
            <div className="size-10 animate-spin rounded-full border-2" style={{ borderColor: theme.node.stroke, borderTopColor: theme.node.activeStroke }} />
            <span className="text-[10px] tracking-[0.2em]">生成中</span>
        </div>
    );
}

function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    const errorDetails = formatCanvasGenerationError(node.metadata?.errorDetails, "生成失败");
    return (
        <div className="flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
            <div className="text-xs leading-5 text-red-300">{errorDetails}</div>
            <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </button>
        </div>
    );
}

function UnknownNodeContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return (
        <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: theme.node.placeholder }}>
            未知节点
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onGenerateImage }: NodeContentRendererProps) {
    const fontSize = node.metadata?.fontSize || 14;
    const textStyle = { fontSize: `${fontSize}px`, lineHeight: `${Math.round(fontSize * 1.65)}px`, color: theme.node.text, boxSizing: "border-box", textAlign: "center" } as React.CSSProperties;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden pt-8">
            <button
                type="button"
                className="absolute right-3 top-3 z-20 inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium opacity-85 backdrop-blur-md transition hover:scale-[1.02] hover:opacity-100"
                style={{ background: `${theme.toolbar.panel}dd`, borderColor: theme.node.stroke, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onGenerateImage?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title="Generate image"
                aria-label="Generate image"
            >
                <ImageIcon className="size-3.5" />
                生图
            </button>
            {isEditingContent ? (
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    className="thin-scrollbar block h-full w-full resize-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent px-12 py-10 m-0 font-mono outline-none select-text appearance-none"
                    style={textStyle}
                    value={node.metadata?.content || ""}
                    references={mentionReferences}
                    highlightLabels={false}
                    onChange={(value) => onContentChange(node.id, value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : (
                <div
                    className="thin-scrollbar flex h-full w-full items-center justify-center overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-12 py-10 font-mono text-center"
                    style={textStyle}
                    onWheel={(event) => event.stopPropagation()}
                >
                    {node.metadata?.content || <span style={{ color: theme.node.placeholder }}>双击编辑文字</span>}
                </div>
            )}
        </div>
    );
}

function ResourceLabelBadge({ reference }: { reference: CanvasResourceReference }) {
    return (
        <span className={`pointer-events-none absolute right-2 top-2 z-30 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${reference.active ? "bg-[#2f80ff] text-white shadow-sm" : "bg-black/35 text-white/75"}`}>
            {reference.label}
        </span>
    );
}

function ImageNodeContent(props: NodeContentRendererProps) {
    if (!props.node.metadata?.content && props.isBatchRoot) {
        const content =
            props.node.metadata?.status === "loading" ? (
                <LoadingContent theme={props.theme} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} onToggleBatch={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!props.node.metadata?.content) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            resourceLabel={props.resourceLabel}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
        />
    );
}

function EmptyImageContent({ isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, theme }: NodeContentRendererProps) {
    const content = (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ color: theme.node.placeholder }}>
            <ImageIcon className="size-7 opacity-35" />
            <div className="text-sm font-semibold" style={{ color: theme.node.text }}>图片占位框</div>
            <div className="text-xs opacity-60">等待输入提示词</div>
        </div>
    );
    if (isBatchRoot)
        return (
            <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

function VideoNodeContent({ node, theme, mentionReferences, seedance2AspectRatioSources, seedance2ReferenceSlots, isRunning, onContentChange, onMetadataChange, onDeleteConnection, onGenerateVideo, onExtractVideoFrame }: NodeContentRendererProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    if (!node.metadata?.content) {
        if (node.metadata?.seedanceWorkflowRole === "placeholder")
            return <Seedance2VideoPlaceholderCard node={node} theme={theme} mentionReferences={mentionReferences} aspectRatioSources={seedance2AspectRatioSources} seedance2ReferenceSlots={seedance2ReferenceSlots} isRunning={Boolean(isRunning)} onContentChange={onContentChange} onMetadataChange={onMetadataChange} onDeleteConnection={onDeleteConnection} onGenerateVideo={onGenerateVideo} />;
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: theme.node.panel, color: theme.node.placeholder }}>
                <Video className="size-8 opacity-45" />
                <div className="text-base font-semibold" style={{ color: theme.node.text }}>视频占位框</div>
                <div className="text-xs opacity-60">等待上传或生成视频</div>
            </div>
        );
    }
    const version = node.metadata?.seedanceShotIndex || 1;
    const duration = normalizeSeedance2Duration(node.metadata?.seedanceDuration || node.metadata?.seconds);
    const ratio = normalizeSeedance2AspectRatio(node.metadata?.seedanceRatio || node.metadata?.size);
    const previewUrl = node.metadata.backendUrl || node.metadata.content;
    const stepVideoFrame = (direction: -1 | 1) => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        const frameStepSeconds = 1 / 24;
        const durationLimit = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Number.POSITIVE_INFINITY;
        video.currentTime = Math.max(0, Math.min(durationLimit, (video.currentTime || 0) + direction * frameStepSeconds));
    };
    const selectCurrentFrame = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        const width = video.videoWidth || Math.round(node.metadata?.naturalWidth || node.width);
        const height = video.videoHeight || Math.round(node.metadata?.naturalHeight || node.height);
        if (!width || !height) return;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, width, height);
        onExtractVideoFrame?.(node, {
            dataUrl: canvas.toDataURL("image/png"),
            width,
            height,
            currentTime: video.currentTime || 0,
        });
    };
    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[18px] bg-black">
            <div className="min-h-0 flex-1">
                <video ref={videoRef} src={node.metadata.content} controls crossOrigin="anonymous" draggable={false} onDragStart={(event) => event.preventDefault()} className="h-full w-full bg-black object-contain" data-canvas-no-zoom />
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-[#050817] px-3 py-2 text-[10px] text-white/75" data-canvas-no-drag data-canvas-no-zoom>
                <span className="rounded-full bg-white/10 px-3 py-1 font-semibold">V{version}</span>
                <span className="rounded-full bg-white/10 px-3 py-1 font-semibold">{duration}s</span>
                <span className="rounded-full bg-white/10 px-3 py-1 font-semibold">{ratio}</span>
                {previewUrl ? (
                    <a className="px-2 py-1 text-sm font-medium text-white/90 hover:text-white" href={previewUrl} target="_blank" rel="noreferrer" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        预览
                    </a>
                ) : null}
                <div className="inline-flex items-center gap-1" data-seedance2-inline-frame-controls>
                    <button type="button" className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/20" onClick={(event) => { event.stopPropagation(); stepVideoFrame(-1); }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        上一帧
                    </button>
                    <button type="button" className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/20" onClick={(event) => { event.stopPropagation(); stepVideoFrame(1); }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        下一帧
                    </button>
                    <button type="button" className="rounded-md bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-orange-600" onClick={selectCurrentFrame} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        选帧
                    </button>
                </div>
            </div>
        </div>
    );
}

function seedance2PlaceholderLayout(ratio: string) {
    const normalized = normalizeSeedance2AspectRatio(ratio);
    if (normalized === "9:16" || normalized === "3:4") {
        return {
            orientation: "portrait" as const,
            rootClass: "seedance2-placeholder-portrait flex-col",
            previewClass: "basis-[48%] border-b",
            promptClass: "basis-[52%]",
        };
    }
    if (normalized === "1:1") {
        return {
            orientation: "square" as const,
            rootClass: "seedance2-placeholder-square flex-col",
            previewClass: "basis-[45%] border-b",
            promptClass: "basis-[55%]",
        };
    }
    return {
        orientation: "landscape" as const,
        rootClass: "seedance2-placeholder-landscape flex-row",
        previewClass: "basis-[30%] border-r",
        promptClass: "basis-[70%]",
    };
}

function Seedance2VideoPlaceholderCard({
    node,
    theme,
    mentionReferences,
    aspectRatioSources,
    seedance2ReferenceSlots,
    isRunning,
    onContentChange,
    onMetadataChange,
    onDeleteConnection,
    onGenerateVideo,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    mentionReferences: CanvasResourceReference[];
    aspectRatioSources?: Seedance2PlaceholderAspectRatioSources;
    seedance2ReferenceSlots?: Seedance2ResolvedReferenceSlot[];
    isRunning: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onDeleteConnection?: (connectionId: string) => void;
    onGenerateVideo?: (node: CanvasNodeData) => void;
}) {
    const mode = node.metadata?.seedanceWorkflowMode === "slice" ? "slice" : "continuous";
    const shot = node.metadata?.seedanceShotIndex || 1;
    const status = seedance2PlaceholderStatusText(node.metadata?.status);
    const referenceOrder = Array.isArray(node.metadata?.seedanceReferenceOrder) ? node.metadata.seedanceReferenceOrder : [];
    const duration = normalizeSeedance2Duration(node.metadata?.seedanceDuration || node.metadata?.seconds);
    const ratio = resolveSeedance2PlaceholderRatio(node, aspectRatioSources);
    const ratioLayout = seedance2PlaceholderLayout(ratio);
    const usesPortraitCard = normalizeSeedance2AspectRatio(ratio) === "9:16";
    const isCompactPromptPanel = node.metadata?.seedancePromptPanelMode === "compact";
    const portraitHint = ratioLayout.orientation === "portrait" ? "竖版布局" : "";

    if (usesPortraitCard) {
        return (
            <Seedance2PortraitVideoPlaceholderCard
                node={node}
                theme={theme}
                mentionReferences={mentionReferences}
                shot={shot}
                status={status}
                mode={mode}
                ratio={ratio}
                duration={duration}
                referenceOrder={referenceOrder}
                seedance2ReferenceSlots={seedance2ReferenceSlots}
                isCompactPromptPanel={isCompactPromptPanel}
                isRunning={isRunning}
                onContentChange={onContentChange}
                onMetadataChange={onMetadataChange}
                onDeleteConnection={onDeleteConnection}
                onGenerateVideo={onGenerateVideo}
            />
        );
    }

    if (ratioLayout.orientation === "landscape") {
        return (
            <Seedance2LandscapeVideoPlaceholderCard
                node={node}
                theme={theme}
                mentionReferences={mentionReferences}
                shot={shot}
                status={status}
                mode={mode}
                ratio={ratio}
                duration={duration}
                referenceOrder={referenceOrder}
                seedance2ReferenceSlots={seedance2ReferenceSlots}
                isCompactPromptPanel={isCompactPromptPanel}
                isRunning={isRunning}
                onContentChange={onContentChange}
                onMetadataChange={onMetadataChange}
                onDeleteConnection={onDeleteConnection}
                onGenerateVideo={onGenerateVideo}
            />
        );
    }

    return (
        <div className={`flex h-full w-full overflow-hidden ${ratioLayout.rootClass}`} style={{ color: theme.node.text }} data-seedance2-orientation={ratioLayout.orientation} title={portraitHint}>
            <Seedance2VideoPreviewArea node={node} theme={theme} shot={shot} status={status} mode={mode} ratio={ratio} duration={duration} referenceOrder={referenceOrder} seedance2ReferenceSlots={seedance2ReferenceSlots} className={ratioLayout.previewClass} onMetadataChange={onMetadataChange} onDeleteConnection={onDeleteConnection} />
            {isCompactPromptPanel ? (
                <Seedance2CompactPromptSummary node={node} theme={theme} className={ratioLayout.promptClass} isRunning={isRunning} onMetadataChange={onMetadataChange} onGenerateVideo={onGenerateVideo} />
            ) : (
                <Seedance2InlinePromptEditor node={node} theme={theme} mentionReferences={mentionReferences} className={ratioLayout.promptClass} isRunning={isRunning} onPromptChange={(value) => onContentChange(node.id, value)} onMetadataChange={onMetadataChange} onGenerateVideo={() => onGenerateVideo?.(node)} />
            )}
        </div>
    );
}

function Seedance2LandscapeVideoPlaceholderCard(props: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    mentionReferences: CanvasResourceReference[];
    shot: number;
    status: string;
    mode: string;
    ratio: string;
    duration: string;
    referenceOrder: string[];
    seedance2ReferenceSlots?: Seedance2ResolvedReferenceSlot[];
    isCompactPromptPanel: boolean;
    isRunning: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onDeleteConnection?: (connectionId: string) => void;
    onGenerateVideo?: (node: CanvasNodeData) => void;
}) {
    const hasVideo = Boolean(props.node.metadata?.content);
    return (
        <div
            className="relative h-full w-full min-h-[668px] min-w-[1114px] overflow-hidden seedance2-placeholder-landscape flex-row rounded-[45px] border-[4px]"
            data-seedance2-orientation="landscape"
            data-seedance2-landscape-html-reference
            style={{
                background: props.theme.node.fill,
                borderColor: props.theme.node.stroke,
                color: props.theme.node.text,
                minWidth: SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH,
                minHeight: SEEDANCE2_HTML_PLACEHOLDER_BASE_HEIGHT,
            }}
        >
            <div
                className="absolute z-[2]"
                style={{ ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.divider), background: props.theme.node.stroke }}
                aria-hidden="true"
            />
            <div
                className="absolute z-[3] overflow-hidden rounded-[29px] border-[1.5px]"
                style={{
                    ...seedance2HtmlLandscapeResponsivePreviewStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.preview),
                    background: props.theme.node.panel,
                    borderColor: props.theme.node.stroke,
                }}
                data-seedance2-landscape-preview
            >
                {hasVideo ? (
                    <video src={props.node.metadata?.content} controls className="h-full w-full bg-black object-contain" data-canvas-no-zoom />
                ) : (
                    <div className="absolute inset-0 grid place-items-center text-center">
                        <div data-seedance2-placeholder-copy>
                            <Video className="mx-auto mb-5 size-[34px] opacity-95" style={{ color: props.theme.node.faint }} />
                            <div className="whitespace-nowrap text-[28px] font-extrabold leading-[34px]" style={{ color: props.theme.node.text, textShadow: "-1px 0 #2aa7ff, 1px 0 #ff6d00" }}>
                                第{props.shot}镜视频占位框
                            </div>
                            <div className="mt-2 text-[20px] font-semibold leading-[26px]" style={{ color: props.theme.node.muted }}>
                                {props.status} · {props.mode}
                            </div>
                            <Seedance2PlaceholderErrorDetails node={props.node} className="mx-auto max-w-[440px] text-[14px]" />
                        </div>
                    </div>
                )}
            </div>
            <Seedance2LandscapeModelSelect
                theme={props.theme}
                rect={SEEDANCE2_HTML_LANDSCAPE_RECTS.model}
                value={props.node.metadata?.seedanceModel || props.node.metadata?.model || ""}
                onChange={(selectedModel) => {
                    props.onMetadataChange?.(props.node.id, {
                        seedanceModel: selectedModel,
                        model: selectedModel,
                    });
                }}
            />
            <Seedance2LandscapeSelect
                theme={props.theme}
                rect={SEEDANCE2_HTML_LANDSCAPE_RECTS.ratio}
                value={
                    props.node.metadata?.seedanceInheritSourceRatio !== false &&
                    !props.node.metadata?.seedanceRatioTouched
                        ? "inherit"
                        : props.ratio
                }
                title="比例：默认跟随上游图片，手动选择后锁定"
                onChange={(event) => {
                    const value = event.target.value;
                    if (value === "inherit") {
                        props.onMetadataChange?.(props.node.id, {
                            seedanceInheritSourceRatio: true,
                            seedanceRatioTouched: false,
                            seedanceSourceAspectRatio: undefined,
                        });
                        return;
                    }
                    const selectedRatio = normalizeSeedance2AspectRatio(value);
                    props.onMetadataChange?.(props.node.id, {
                        seedanceRatio: selectedRatio,
                        size: selectedRatio,
                        seedanceInheritSourceRatio: false,
                        seedanceRatioTouched: true,
                    });
                }}
            >
                <option value="inherit">跟随上游</option>
                {SEEDANCE2_RATIO_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </Seedance2LandscapeSelect>
            <Seedance2LandscapeSelect
                theme={props.theme}
                rect={SEEDANCE2_HTML_LANDSCAPE_RECTS.duration}
                value={props.duration}
                title="时长：5s / 10s / 15s"
                onChange={(event) => {
                    const selectedDuration = normalizeSeedance2Duration(event.target.value);
                    props.onMetadataChange?.(props.node.id, {
                        seedanceDuration: selectedDuration,
                        seconds: selectedDuration,
                    });
                }}
            >
                {SEEDANCE2_DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </Seedance2LandscapeSelect>
            <Seedance2LandscapeHtmlReferencePanel
                node={props.node}
                theme={props.theme}
                referenceOrder={props.referenceOrder}
                resolvedSlots={props.seedance2ReferenceSlots}
                onMetadataChange={props.onMetadataChange}
                onDeleteConnection={props.onDeleteConnection}
            />
            {props.isCompactPromptPanel ? (
                <Seedance2CompactPromptSummary node={props.node} theme={props.theme} variant="landscape-html" isRunning={props.isRunning} onMetadataChange={props.onMetadataChange} onGenerateVideo={props.onGenerateVideo} />
            ) : (
                <Seedance2LandscapeHtmlPromptArea
                    node={props.node}
                    theme={props.theme}
                    mentionReferences={props.mentionReferences}
                    isRunning={props.isRunning}
                    onPromptChange={(value) => props.onContentChange(props.node.id, value)}
                    onMetadataChange={props.onMetadataChange}
                    onGenerateVideo={() => props.onGenerateVideo?.(props.node)}
                />
            )}
        </div>
    );
}

function seedance2HtmlLandscapeResponsivePreviewStyle(rect: Seedance2HtmlLandscapeRect): React.CSSProperties {
    return {
        position: "absolute",
        left: `${((rect.left - SEEDANCE2_HTML_STAGE_NODE_LEFT) / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%`,
        top: rect.top - SEEDANCE2_HTML_STAGE_NODE_TOP,
        width: `max(${rect.width}px, ${(rect.width / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%)`,
        height: rect.height,
    };
}

function seedance2HtmlLandscapeFixedControlStyle(rect: Seedance2HtmlLandscapeRect): React.CSSProperties {
    return {
        position: "absolute",
        left: `${((rect.left - SEEDANCE2_HTML_STAGE_NODE_LEFT) / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%`,
        top: rect.top - SEEDANCE2_HTML_STAGE_NODE_TOP,
        width: `${(rect.width / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%`,
        height: rect.height,
    };
}

function seedance2HtmlLandscapeReferencePanelStyle(rect: Seedance2HtmlLandscapeRect): React.CSSProperties {
    const localTop = rect.top - SEEDANCE2_HTML_STAGE_NODE_TOP;
    return {
        position: "absolute",
        left: `${((rect.left - SEEDANCE2_HTML_STAGE_NODE_LEFT) / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%`,
        top: localTop,
        bottom: SEEDANCE2_HTML_PLACEHOLDER_BASE_HEIGHT - localTop - rect.height,
        width: `${(rect.width / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%`,
    };
}

function seedance2HtmlLandscapeRectStyle(rect: Seedance2HtmlLandscapeRect, options: { bottom?: number } = {}): React.CSSProperties {
    const localLeft = rect.left - SEEDANCE2_HTML_STAGE_NODE_LEFT;
    const localTop = rect.top - SEEDANCE2_HTML_STAGE_NODE_TOP;
    return {
        position: "absolute",
        left: `${(localLeft / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%`,
        top: options.bottom === undefined ? `${(localTop / SEEDANCE2_HTML_PLACEHOLDER_BASE_HEIGHT) * 100}%` : undefined,
        bottom: options.bottom === undefined ? undefined : options.bottom,
        width: `${(rect.width / SEEDANCE2_HTML_PLACEHOLDER_BASE_WIDTH) * 100}%`,
        height: `${(rect.height / SEEDANCE2_HTML_PLACEHOLDER_BASE_HEIGHT) * 100}%`,
    };
}

function Seedance2LandscapeSelect({
    theme,
    rect,
    value,
    title,
    onChange,
    children,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    rect: Seedance2HtmlLandscapeRect;
    value: string;
    title: string;
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    children: ReactNode;
}) {
    return (
        <label
            className="z-[4] block"
            style={seedance2HtmlLandscapeFixedControlStyle(rect)}
            data-canvas-no-drag
            data-canvas-no-zoom
            data-seedance2-landscape-html-controls
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <select
                value={value}
                title={title}
                className="h-full w-full appearance-none rounded-[25px] border-[1.5px] px-[15px] pr-12 text-[18px] font-medium leading-[52px] outline-none transition hover:border-orange-500/80 focus:border-orange-500"
                style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                onChange={onChange}
                onClick={(event) => event.stopPropagation()}
            >
                {children}
            </select>
            <span className="pointer-events-none absolute right-[17px] top-1/2 size-[10px] -translate-y-1/2 rotate-45 border-b-[3px] border-r-[3px]" style={{ borderColor: theme.node.muted }} />
        </label>
    );
}

function Seedance2VideoModelSelect({
    value,
    onChange,
    theme,
    triggerClassName = "h-8 w-full rounded-xl border px-2 text-[11px] shadow-none",
}: {
    value: string;
    onChange: (model: string) => void;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    triggerClassName?: string;
}) {
    const effectiveConfig = useEffectiveConfig();
    const models = selectableModelsByCapability(effectiveConfig, "video");
    return (
        <ModelSelectControl
            models={models}
            value={value}
            onChange={onChange}
            placeholder="选择模型"
            emptyLabel="暂无已配置视频模型"
            title="视频模型"
            triggerClassName={triggerClassName}
            triggerStyle={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
            contentClassName="z-[1300]"
        />
    );
}

function Seedance2LandscapeModelSelect({
    theme,
    rect,
    value,
    onChange,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    rect: Seedance2HtmlLandscapeRect;
    value: string;
    onChange: (model: string) => void;
}) {
    return (
        <div
            className="z-[4] block"
            style={seedance2HtmlLandscapeFixedControlStyle(rect)}
            data-canvas-no-drag
            data-canvas-no-zoom
            data-seedance2-landscape-html-controls
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <Seedance2VideoModelSelect
                value={value}
                onChange={onChange}
                theme={theme}
                triggerClassName="h-full w-full rounded-[25px] border-[1.5px] px-[15px] text-[18px] font-medium leading-[52px] shadow-none transition hover:border-orange-500/80"
            />
        </div>
    );
}

type Seedance2ReferencePreviewState = { value: string; label: string } | null;

function Seedance2ReferencePreviewOverlay({ preview, onClose }: { preview: Seedance2ReferencePreviewState; onClose: () => void }) {
    if (!preview || typeof document === "undefined") return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[300] grid place-items-center bg-black/80 p-8"
            data-seedance2-reference-preview-overlay
            role="dialog"
            aria-modal="true"
            aria-label={preview.label}
            onClick={onClose}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <button
                type="button"
                className="absolute right-6 top-6 grid size-10 place-items-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-500"
                aria-label="关闭参考图预览"
                title="关闭预览"
                onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                }}
            >
                <X className="size-5" />
            </button>
            <img
                src={preview.value}
                alt={preview.label}
                className="max-h-[88vh] max-w-[92vw] object-contain shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            />
        </div>,
        document.body,
    );
}

function Seedance2ReferenceThumbnailActions({
    value,
    label,
    onPreview,
    onRemove,
    removeTitle = "删除手动参考图",
}: {
    value?: string;
    label: string;
    onPreview: (preview: { value: string; label: string }) => void;
    onRemove?: () => void;
    removeTitle?: string;
}) {
    if (!value && !onRemove) return null;
    const isolateButton = (event: React.SyntheticEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };
    return (
        <>
            {value ? (
                <button
                    type="button"
                    className="absolute left-1/2 top-1/2 z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/70 text-white opacity-0 shadow-lg transition hover:bg-black/85 group-hover:opacity-100"
                    data-seedance2-reference-preview
                    aria-label={`预览${label}`}
                    title="预览参考图"
                    onMouseDown={isolateButton}
                    onPointerDown={isolateButton}
                    onClick={(event) => {
                        isolateButton(event);
                        onPreview({ value, label });
                    }}
                >
                    <Eye className="size-4" />
                </button>
            ) : null}
            {onRemove ? (
                <button
                    type="button"
                    className="absolute right-1 top-1 z-20 grid size-7 place-items-center rounded-full bg-red-600 text-white opacity-0 shadow-lg transition hover:bg-red-500 group-hover:opacity-100"
                    data-seedance2-reference-remove
                    aria-label={`删除${label}`}
                    title={removeTitle}
                    onMouseDown={isolateButton}
                    onPointerDown={isolateButton}
                    onClick={(event) => {
                        isolateButton(event);
                        onRemove();
                    }}
                >
                    <X className="size-4" />
                </button>
            ) : null}
        </>
    );
}

function Seedance2LandscapeHtmlReferencePanel({
    node,
    theme,
    referenceOrder,
    resolvedSlots,
    onMetadataChange,
    onDeleteConnection,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    referenceOrder: string[];
    resolvedSlots?: Seedance2ResolvedReferenceSlot[];
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onDeleteConnection?: (connectionId: string) => void;
}) {
    const [preview, setPreview] = useState<Seedance2ReferencePreviewState>(null);
    const bindings = node.metadata?.seedanceReferenceSlotBindings || {};
    const extraBindings = node.metadata?.seedanceReferenceExtraSlotBindings || {};
    const orderedSlotKeys = buildSeedance2ReferenceSlotKeysFromOrder(referenceOrder);
    type LandscapeReferenceSlot = {
        key: Seedance2ReferenceSlotKey | Seedance2ExtraReferenceSlotKey;
        slotIndex: number;
        isExtra: boolean;
        binding?: Seedance2ReferenceSlotBinding;
        resolved?: Seedance2ResolvedReferenceSlot;
    };
    const slotForIndex = (index: number): LandscapeReferenceSlot => {
        if (index < SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.length) {
            const key = orderedSlotKeys[index];
            return { key, slotIndex: index + 1, isExtra: false, binding: bindings[key] };
        }
        const key = `reference_${index + 1}` as Seedance2ExtraReferenceSlotKey;
        return { key, slotIndex: index + 1, isExtra: true, binding: extraBindings[key] };
    };
    const slots = resolvedSlots?.length
        ? resolvedSlots.slice(0, SEEDANCE2_MAX_REFERENCE_SLOT_COUNT).map((resolved) => ({
            ...slotForIndex(resolved.slotIndex - 1),
            resolved,
        }))
        : Array.from({ length: SEEDANCE2_LANDSCAPE_DEFAULT_REFERENCE_SLOT_COUNT }, (_, index) => slotForIndex(index));
    const loadReferenceImage = (slot: (typeof slots)[number], file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") return;
            const nextBinding = {
                nodeId: `manual-${slot.key}-${Date.now()}`,
                value: reader.result,
                label: file.name || `参考图 ${slot.slotIndex}`,
                required: !slot.isExtra && (slot.key === "upstream_hd_frame" || slot.key === "current_shot"),
                useAs: normalizeSeedance2ReferenceSlotUseAs(slot.binding?.useAs),
            };
            if (slot.isExtra) {
                onMetadataChange?.(node.id, {
                    seedanceReferenceExtraSlotBindings: {
                        [slot.key]: nextBinding,
                    },
                });
                return;
            }
            onMetadataChange?.(node.id, {
                seedanceReferenceSlotBindings: {
                    ...bindings,
                    [slot.key]: nextBinding,
                },
            });
        };
        reader.readAsDataURL(file);
    };
    const removeManualReference = (slot: (typeof slots)[number]) => {
        if (slot.isExtra) {
            onMetadataChange?.(node.id, {
                seedanceReferenceExtraSlotBindings: { [slot.key]: undefined },
            });
            return;
        }
        onMetadataChange?.(node.id, {
            seedanceReferenceSlotBindings: { [slot.key]: undefined },
        });
    };
    return (
        <section
            className="z-[3] overflow-hidden rounded-[28px] border-[1.5px]"
            style={{ ...seedance2HtmlLandscapeReferencePanelStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.upload), background: theme.node.panel, borderColor: theme.node.stroke }}
            data-seedance2-landscape-reference-panel
            data-visible-slot-count={slots.length}
            data-canvas-no-zoom
        >
            <div className="absolute left-[15px] right-[72px] top-[12px] overflow-hidden text-ellipsis whitespace-nowrap text-[17px] font-extrabold leading-[22px]" style={{ color: theme.node.text }}>
                图片排序 · 参考图上传
            </div>
            <div className="absolute right-[16px] top-[13px] whitespace-nowrap text-[13px] font-bold leading-[22px]" style={{ color: theme.node.muted }}>
                共 {slots.length} 张
            </div>
            <div
                className={`absolute inset-x-[18px] bottom-[10px] top-[46px] grid content-start gap-2 ${slots.length > 4 ? "thin-scrollbar grid-cols-3 auto-rows-min overflow-y-auto pr-1" : "grid-cols-[repeat(2,98px)] justify-center overflow-hidden"}`}
                data-seedance2-landscape-reference-grid
                data-canvas-no-drag
            >
                {slots.map((slot) => {
                    const source = slot.resolved?.source;
                    const isReadOnlySlot = source === "connected" || source === "pending";
                    const isCompact = slots.length > 4;
                    const hasValue = Boolean(slot.resolved?.value || slot.binding?.value || slot.binding?.nodeId);
                    const connectionSequence = slot.resolved?.referenceSequence ?? slot.slotIndex;
                    const displayLabel = source === "connected"
                        ? `参考图 ${slot.slotIndex} · 连线`
                        : source === "manual"
                            ? `参考图 ${slot.slotIndex} · 手动`
                            : `参考图 ${slot.slotIndex}`;
                    const subtext = source === "connected"
                        ? `第${connectionSequence}条连线图片`
                        : source === "manual"
                            ? "手动固定"
                            : source === "pending"
                                ? "等待图片生成"
                                : hasValue ? "点击替换" : "等待连线或点击上传";
                    const thumbnailValue = isReadOnlySlot
                        ? slot.resolved?.previewValue
                        : slot.resolved?.value || slot.binding?.value;
                    const SlotElement = isReadOnlySlot ? "div" : "label";
                    const connectionId = slot.resolved?.connectionId;
                    const removeReference = isReadOnlySlot
                        ? connectionId && onDeleteConnection
                            ? () => onDeleteConnection(connectionId)
                            : undefined
                        : hasValue
                            ? () => removeManualReference(slot)
                            : undefined;
                    return (
                        <SlotElement
                            key={slot.key}
                            className={`group relative aspect-square min-w-0 overflow-hidden border-[1.5px] ${isCompact ? "rounded-md" : "rounded-xl"} ${isReadOnlySlot ? "cursor-default" : "cursor-pointer transition hover:border-orange-500/80"}`}
                            style={{ background: theme.node.fill, borderColor: hasValue ? "rgba(249,115,22,.7)" : theme.node.stroke }}
                            data-seedance2-landscape-reference-slot
                            data-seedance2-reference-source-node-id={slot.resolved?.nodeId}
                            data-canvas-no-drag
                            title={isReadOnlySlot ? displayLabel : `${displayLabel}：${hasValue ? "点击替换" : "点击添加"}`}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            {!isReadOnlySlot ? (
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(event) => {
                                        const input = event.currentTarget;
                                        loadReferenceImage(slot, input.files?.[0]);
                                        input.value = "";
                                    }}
                                />
                            ) : null}
                            {thumbnailValue ? (
                                <img src={thumbnailValue} alt={displayLabel} className="absolute inset-0 h-full w-full object-cover" />
                            ) : (
                                <span className={isCompact ? "absolute inset-0 grid place-items-center bg-[#653516] text-[11px] font-extrabold text-[#ffad61]" : "absolute inset-0 grid place-items-center bg-[#653516] text-[14px] font-extrabold text-[#ffad61]"}>参考图</span>
                            )}
                            <Seedance2ReferenceThumbnailActions
                                value={thumbnailValue}
                                label={displayLabel}
                                onPreview={setPreview}
                                onRemove={removeReference}
                                removeTitle={isReadOnlySlot ? "删除连线及参考图" : "删除手动参考图"}
                            />
                            <span className={`pointer-events-none absolute inset-x-0 bottom-0 min-w-0 bg-black/65 ${isCompact ? "p-0.5" : "p-1"}`}>
                                <span className={isCompact ? "block truncate text-[6px] font-bold leading-[7px] text-[#f7f7f7]" : "block truncate text-[9px] font-bold leading-3 text-[#f7f7f7]"}>{displayLabel}</span>
                                <span className={isCompact ? "block truncate text-[6px] leading-[7px] text-white/70" : "block truncate text-[8px] leading-3 text-white/70"}>{subtext}</span>
                            </span>
                        </SlotElement>
                    );
                })}
            </div>
            <Seedance2ReferencePreviewOverlay preview={preview} onClose={() => setPreview(null)} />
        </section>
    );
}

function Seedance2CompactPromptSummary({
    node,
    theme,
    className = "",
    variant = "default",
    isRunning,
    onMetadataChange,
    onGenerateVideo,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    className?: string;
    variant?: "default" | "portrait" | "landscape-html";
    isRunning: boolean;
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onGenerateVideo?: (node: CanvasNodeData) => void;
}) {
    const prompt = node.metadata?.prompt || "";
    const promptSummary = seedance2CompactPromptSummaryText(prompt, variant === "landscape-html" ? 150 : 92);
    const disabled = isRunning || !prompt.trim();
    const expandPrompt = (event: React.MouseEvent) => {
        event.stopPropagation();
        onMetadataChange?.(node.id, {
            seedancePromptPanelMode: "inline",
            seedancePromptExpandedByUser: true,
        });
    };
    const handleGenerateVideo = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onGenerateVideo?.(node);
    };

    if (variant === "landscape-html") {
        return (
            <div
                className="pointer-events-none absolute inset-0 z-[3]"
                data-seedance2-prompt-panel-mode="compact"
                data-canvas-no-zoom
            >
                <div
                    className="pointer-events-auto absolute flex items-center gap-3 font-extrabold leading-[26px]"
                    style={{ ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.promptTitle), color: theme.node.text }}
                >
                    <span>视频提示词</span>
                    <span className="rounded-full border border-orange-500/40 bg-orange-500/15 px-3 py-1 text-[16px] font-black" style={{ color: theme.node.text }}>
                        已折叠
                    </span>
                </div>
                <div
                    className="pointer-events-auto absolute text-right text-[20px] font-bold leading-[26px]"
                    style={{ ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.promptEdit), color: theme.node.text }}
                >
                    <button
                        type="button"
                        className="rounded-full border px-4 py-1 text-[18px] font-black transition hover:opacity-80"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        onClick={expandPrompt}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        展开编辑
                    </button>
                </div>
                <section
                    className="pointer-events-auto absolute flex flex-col justify-between overflow-hidden rounded-[30px] border-[1.5px] px-[24px] py-[22px]"
                    style={{ ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.promptBox), background: theme.node.panel, borderColor: theme.node.stroke }}
                    data-seedance2-compact-prompt-summary
                    onDoubleClick={expandPrompt}
                >
                    <div>
                        <div className="text-[24px] font-black leading-[30px]" style={{ color: theme.node.text }}>提示词已生成，默认轻量显示</div>
                        <div className="mt-4 line-clamp-4 whitespace-pre-wrap break-words text-[22px] font-semibold leading-[31px]" style={{ color: promptSummary ? theme.node.text : theme.node.muted }}>
                            {promptSummary || "暂无提示词，展开后可手动填写。"}
                        </div>
                    </div>
                    <div className="mt-6 rounded-[22px] border px-5 py-4 text-[18px] font-bold leading-[26px]" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
                        故事模式批量占位默认折叠，减少长文本和编辑器渲染；需要修改时点击“展开编辑”。
                    </div>
                </section>
                <button
                    type="button"
                    className="pointer-events-auto absolute z-[4] rounded-[31px] border-0 bg-gradient-to-b from-[#ff6c00] via-[#f86500] to-[#d84f00] text-[26px] font-extrabold leading-[67px] text-white shadow-[0_10px_24px_rgba(249,115,22,.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                    style={{
                        ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.generate, { bottom: 10 }),
                        top: undefined,
                    }}
                    disabled={disabled}
                    onClick={handleGenerateVideo}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {isRunning ? "视频生成中" : "生成视频"}
                </button>
            </div>
        );
    }

    const isPortrait = variant === "portrait";
    const rootClassName = isPortrait
        ? `flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden px-2 pb-2 pt-2 ${className}`
        : `flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 ${className}`;
    const summaryClassName = isPortrait
        ? "min-h-0 flex-1 cursor-pointer overflow-hidden rounded-xl border px-3 py-2 text-xs font-semibold leading-5"
        : "min-h-0 flex-1 cursor-pointer overflow-hidden rounded-2xl border px-4 py-3 text-sm font-semibold leading-6";
    const buttonClassName = isPortrait
        ? "h-9 shrink-0 rounded-xl bg-orange-500 px-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-45"
        : "h-12 shrink-0 rounded-2xl bg-orange-500 px-4 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-45";

    return (
        <div className={rootClassName} style={{ borderColor: theme.node.stroke }} data-seedance2-prompt-panel-mode="compact" data-seedance2-compact-prompt-summary data-canvas-no-zoom>
            <div className="flex shrink-0 items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                <span className="min-w-0 truncate font-bold" style={{ color: theme.node.text }}>视频提示词 · 已折叠</span>
                <button
                    type="button"
                    className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-black transition hover:bg-black/10"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                    onClick={expandPrompt}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    展开编辑
                </button>
            </div>
            <div
                className={summaryClassName}
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: promptSummary ? theme.node.text : theme.node.muted }}
                onDoubleClick={expandPrompt}
                title="双击展开编辑完整提示词"
            >
                {promptSummary || "暂无提示词，展开后可手动填写。"}
            </div>
            <button
                type="button"
                className={buttonClassName}
                disabled={disabled}
                onClick={handleGenerateVideo}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {isRunning ? "视频生成中" : "生成视频"}
            </button>
        </div>
    );
}

function seedance2CompactPromptSummaryText(prompt: string, maxLength: number) {
    const oneLine = prompt.replace(/\s+/g, " ").trim();
    return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength)}…` : oneLine;
}

function useDismissSeedance2PromptEditor(
    isEditing: boolean,
    rootRef: React.RefObject<HTMLElement | null>,
    dismiss: () => void,
) {
    useEffect(() => {
        if (!isEditing) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (rootRef.current?.contains(target)) return;
            if (target instanceof Element && target.closest('[data-canvas-resource-mention-menu="true"]')) return;
            dismiss();
        };
        // Capture phase still runs when the canvas prevents the native blur while starting a pan.
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [dismiss, isEditing, rootRef]);
}

function Seedance2LandscapeHtmlPromptArea({
    node,
    theme,
    mentionReferences,
    isRunning,
    onPromptChange,
    onMetadataChange,
    onGenerateVideo,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    mentionReferences: CanvasResourceReference[];
    isRunning: boolean;
    onPromptChange: (value: string) => void;
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onGenerateVideo: () => void;
}) {
    const prompt = node.metadata?.prompt || "";
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const promptRootRef = useRef<HTMLDivElement | null>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const promptPreviewText = prompt.trim();
    const dismissPromptEditor = useCallback(() => setIsEditingPrompt(false), []);
    useDismissSeedance2PromptEditor(isEditingPrompt, promptRootRef, dismissPromptEditor);

    useEffect(() => {
        if (!isEditingPrompt) return;
        const textarea = promptTextareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingPrompt, promptTextareaRef]);

    return (
        <div
            ref={promptRootRef}
            className="pointer-events-none absolute inset-0 z-[3]"
            data-seedance2-inline-prompt
            data-seedance2-landscape-html-prompt
            data-canvas-no-zoom
        >
            <div
                className="pointer-events-auto absolute flex items-center gap-3 font-extrabold leading-[26px]"
                style={{ ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.promptTitle), color: theme.node.text }}
            >
                <span>视频提示词</span>
                <button
                    type="button"
                    className="grid size-[26px] shrink-0 place-items-center rounded-full transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                    style={{ color: theme.node.muted }}
                    disabled={!node.metadata?.seedanceAutoPrompt}
                    data-seedance2-regenerate-prompt
                    aria-label="从分镜重新生成提示词"
                    title="从分镜重新生成提示词"
                    onClick={(event) => {
                        event.stopPropagation();
                        onMetadataChange?.(node.id, seedance2RegeneratePromptPatch(node.metadata));
                    }}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <RefreshCw className="size-[17px]" />
                </button>
            </div>
            <div
                className="absolute text-right text-[20px] font-bold leading-[26px]"
                style={{ ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.promptEdit), color: theme.node.text }}
            >
                双击编辑视频提示词
            </div>
            <section
                className="pointer-events-auto absolute overflow-hidden rounded-[30px] border-[1.5px]"
                style={{ ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.promptBox), background: theme.node.panel, borderColor: theme.node.stroke }}
                data-seedance2-landscape-html-prompt-box
            >
                {isEditingPrompt ? (
                    <CanvasResourceMentionTextarea
                        value={prompt}
                        references={mentionReferences}
                        onChange={onPromptChange}
                        ref={promptTextareaRef}
                        className="thin-scrollbar block h-full min-h-0 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words rounded-[30px] border-0 px-[23px] py-[18px] text-[26px] font-medium leading-[34px] outline-none select-text"
                        style={{ background: theme.node.fill, color: theme.node.text }}
                        highlightLabels={false}
                        placeholder="描述当前镜头的视频内容。"
                        data-seedance2-inline-prompt-textarea
                        data-canvas-wheel-scroll
                        onBlur={dismissPromptEditor}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                    />
                ) : (
                    <div
                        className="h-full w-full cursor-text overflow-y-auto whitespace-pre-wrap break-words px-[23px] py-[18px] text-[26px] font-medium leading-[34px] select-text"
                        style={{ color: promptPreviewText ? theme.node.text : theme.node.muted }}
                        data-seedance2-inline-prompt-preview
                        data-canvas-wheel-scroll
                        onWheel={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            setIsEditingPrompt(true);
                        }}
                    >
                        {promptPreviewText || "描述当前镜头的视频内容。"}
                    </div>
                )}
            </section>
            <button
                type="button"
                className="pointer-events-auto absolute z-[4] rounded-[31px] border-0 bg-gradient-to-b from-[#ff6c00] via-[#f86500] to-[#d84f00] text-[26px] font-extrabold leading-[67px] text-white shadow-[0_10px_24px_rgba(249,115,22,.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                style={{
                    ...seedance2HtmlLandscapeRectStyle(SEEDANCE2_HTML_LANDSCAPE_RECTS.generate, { bottom: 10 }),
                    top: undefined,
                }}
                disabled={isRunning}
                onClick={(event) => {
                    event.stopPropagation();
                    onGenerateVideo();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {isRunning ? "视频生成中" : "生成视频"}
            </button>
        </div>
    );
}

function Seedance2PortraitVideoPlaceholderCard(props: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    mentionReferences: CanvasResourceReference[];
    shot: number;
    status: string;
    mode: string;
    ratio: string;
    duration: string;
    referenceOrder: string[];
    seedance2ReferenceSlots?: Seedance2ResolvedReferenceSlot[];
    isCompactPromptPanel: boolean;
    isRunning: boolean;
    onContentChange: (nodeId: string, content: string) => void;
    onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onDeleteConnection?: (connectionId: string) => void;
    onGenerateVideo?: (node: CanvasNodeData) => void;
}) {
    const orderedSlotKeys = buildSeedance2ReferenceSlotKeysFromOrder(props.referenceOrder);
    const semanticBindings = props.node.metadata?.seedanceReferenceSlotBindings || {};
    const highestBoundSemanticSlotIndex = orderedSlotKeys.reduce((highest, key, index) => (
        semanticBindings[key]?.value || semanticBindings[key]?.nodeId ? Math.max(highest, index + 1) : highest
    ), 0);
    const semanticBoundSlotCount = Object.values(semanticBindings).filter((binding) => Boolean(binding?.value || binding?.nodeId)).length;
    const { boundSlotCount: extraBoundSlotCount, highestSlotIndex: highestBoundExtraSlotIndex } = seedance2BoundExtraSlotStats(props.node.metadata?.seedanceReferenceExtraSlotBindings);
    const slotLayoutHeight = Number(props.node.metadata?.seedanceManualMinHeight || 0) || props.node.height;
    const responsiveSlotCount = seedance2VisibleReferenceSlotCount({
        width: props.node.width,
        height: slotLayoutHeight,
        boundSlotCount: Math.max(semanticBoundSlotCount + extraBoundSlotCount, highestBoundExtraSlotIndex),
        isExpanded: props.node.metadata?.seedanceReferenceSlotsExpanded === true,
        orientation: "9:16",
    });
    const expandedSlotCount = responsiveSlotCount > SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.length
        ? responsiveSlotCount
        : SEEDANCE2_PORTRAIT_DEFAULT_REFERENCE_SLOT_COUNT;
    const slotCount = Math.max(SEEDANCE2_PORTRAIT_DEFAULT_REFERENCE_SLOT_COUNT, expandedSlotCount, highestBoundSemanticSlotIndex, highestBoundExtraSlotIndex);
    return (
        <div
            className="grid h-full w-full grid-rows-[224px_277px_minmax(210px,1fr)] overflow-hidden rounded-[28px] border"
            style={{ background: props.theme.node.fill, borderColor: props.theme.node.stroke, color: props.theme.node.text }}
            data-seedance2-orientation="portrait"
            data-seedance2-portrait-placeholder
        >
            <Seedance2PortraitPreviewArea node={props.node} theme={props.theme} shot={props.shot} status={props.status} mode={props.mode} />
            <Seedance2PortraitConfigArea node={props.node} theme={props.theme} ratio={props.ratio} duration={props.duration} referenceOrder={props.referenceOrder} slotCount={slotCount} resolvedSlots={props.seedance2ReferenceSlots} onMetadataChange={props.onMetadataChange} onDeleteConnection={props.onDeleteConnection} />
            {props.isCompactPromptPanel ? (
                <Seedance2CompactPromptSummary node={props.node} theme={props.theme} className="border-t" variant="portrait" isRunning={props.isRunning} onMetadataChange={props.onMetadataChange} onGenerateVideo={props.onGenerateVideo} />
            ) : (
                <Seedance2InlinePromptEditor node={props.node} theme={props.theme} mentionReferences={props.mentionReferences} className="border-t" variant="portrait" isRunning={props.isRunning} onPromptChange={(value) => props.onContentChange(props.node.id, value)} onMetadataChange={props.onMetadataChange} onGenerateVideo={() => props.onGenerateVideo?.(props.node)} />
            )}
        </div>
    );
}

function Seedance2PortraitPreviewArea({ node, theme, shot, status, mode }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; shot: number; status: string; mode: string }) {
    const hasVideo = Boolean(node.metadata?.content);
    return (
        <div className="relative flex min-h-0 justify-center border-b px-2 py-3" style={{ borderColor: theme.node.stroke }}>
            <div
                className={`grid h-[200px] min-w-0 shrink-0 place-items-center overflow-hidden rounded-[24px] border ${hasVideo ? "bg-black" : "text-center"}`}
                style={{ width: "calc(100% - 6px)", background: hasVideo ? undefined : theme.node.panel, borderColor: theme.node.stroke }}
                data-seedance2-portrait-preview
            >
                {hasVideo ? (
                    <video src={node.metadata?.content} controls className="h-full w-full bg-black object-contain" data-canvas-no-zoom />
                ) : (
                    <div className="px-3" data-seedance2-placeholder-copy>
                        <Video className="mx-auto mb-4 size-9" style={{ color: theme.node.faint }} />
                        <div className="whitespace-nowrap text-xl font-black" style={{ color: theme.node.text }}>第{shot}镜视频占位框</div>
                        <div className="mt-3 text-sm font-extrabold" style={{ color: theme.node.muted }}>{status} · {mode}</div>
                        <Seedance2PlaceholderErrorDetails node={node} />
                    </div>
                )}
            </div>
        </div>
    );
}

function Seedance2PortraitConfigArea({ node, theme, ratio, duration, referenceOrder, slotCount, resolvedSlots, onMetadataChange, onDeleteConnection }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; ratio: string; duration: string; referenceOrder: string[]; slotCount: number; resolvedSlots?: Seedance2ResolvedReferenceSlot[]; onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void; onDeleteConnection?: (connectionId: string) => void }) {
    const followsSource =
        node.metadata?.seedanceInheritSourceRatio !== false &&
        !node.metadata?.seedanceRatioTouched;
    const model = node.metadata?.seedanceModel || node.metadata?.model || "";

    return (
        <div className="flex h-full min-h-0 flex-col border-b px-3 pb-0 pt-3" style={{ borderColor: theme.node.stroke }} data-canvas-no-drag data-canvas-no-zoom>
            <div className="grid shrink-0 grid-cols-2 gap-2 text-[10px]">
                <label className="col-span-2 min-w-0">
                    <span className="sr-only">视频模型</span>
                    <Seedance2VideoModelSelect
                        value={model}
                        theme={theme}
                        onChange={(selectedModel) => {
                            onMetadataChange?.(node.id, {
                                seedanceModel: selectedModel,
                                model: selectedModel,
                            });
                        }}
                    />
                </label>
                <label className="min-w-0">
                    <span className="sr-only">视频比例</span>
                    <select
                        value={followsSource ? "inherit" : ratio}
                        className="h-8 w-full rounded-xl border px-2 text-[11px] outline-none"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                        title="比例：默认跟随上游图片，手动选择后锁定"
                        onChange={(event) => {
                            const value = event.target.value;
                            if (value === "inherit") {
                                onMetadataChange?.(node.id, {
                                    seedanceInheritSourceRatio: true,
                                    seedanceRatioTouched: false,
                                    seedanceSourceAspectRatio: undefined,
                                });
                                return;
                            }
                            const selectedRatio = normalizeSeedance2AspectRatio(value);
                            onMetadataChange?.(node.id, {
                                seedanceRatio: selectedRatio,
                                size: selectedRatio,
                                seedanceInheritSourceRatio: false,
                                seedanceRatioTouched: true,
                            });
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <option value="inherit">跟随上游</option>
                        {SEEDANCE2_RATIO_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </label>
                <label className="min-w-0">
                    <span className="sr-only">视频时长</span>
                    <select
                        value={duration}
                        className="h-8 w-full rounded-xl border px-2 text-[11px] outline-none"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                        title="时长：5s / 10s / 15s"
                        onChange={(event) => {
                            const selectedDuration = normalizeSeedance2Duration(event.target.value);
                            onMetadataChange?.(node.id, {
                                seedanceDuration: selectedDuration,
                                seconds: selectedDuration,
                            });
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        {SEEDANCE2_DURATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                <Seedance2VideoThumbnailSortSlot
                    node={node}
                    referenceOrder={referenceOrder}
                    theme={theme}
                    variant="portrait"
                    visibleSlotCount={slotCount}
                    resolvedSlots={resolvedSlots}
                    onMetadataChange={onMetadataChange}
                    onDeleteConnection={onDeleteConnection}
                />
            </div>
        </div>
    );
}

function Seedance2LandscapeControlArea({ node, theme, shot, status, mode, ratio, duration, referenceOrder, resolvedSlots, onMetadataChange }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; shot: number; status: string; mode: string; ratio: string; duration: string; referenceOrder: string[]; resolvedSlots?: Seedance2ResolvedReferenceSlot[]; onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void }) {
    const hasVideo = Boolean(node.metadata?.content);
    const followsSource =
        node.metadata?.seedanceInheritSourceRatio !== false &&
        !node.metadata?.seedanceRatioTouched;
    const model = node.metadata?.seedanceModel || node.metadata?.model || "";

    return (
        <div className="relative flex h-full min-h-0 min-w-0 flex-col gap-2.5 overflow-hidden border-r p-3" style={{ borderColor: theme.node.stroke }} data-canvas-no-drag data-canvas-no-zoom>
            <div className={`grid min-h-0 flex-[1.2] place-items-center overflow-hidden rounded-[24px] border ${hasVideo ? "bg-black" : "text-center"}`} style={{ background: hasVideo ? undefined : theme.node.panel, borderColor: theme.node.stroke }}>
                {hasVideo ? (
                    <video src={node.metadata?.content} controls className="h-full w-full bg-black object-contain" data-canvas-no-zoom />
                ) : (
                    <div className="px-3">
                        <Video className="mx-auto mb-3 size-8" style={{ color: theme.node.faint }} />
                        <div className="whitespace-nowrap text-base font-black" style={{ color: theme.node.text }}>第{shot}镜视频占位框</div>
                        <div className="mt-2 text-[11px] font-extrabold" style={{ color: theme.node.muted }}>{status} · {mode}</div>
                        <Seedance2PlaceholderErrorDetails node={node} className="text-[10px] leading-3" />
                    </div>
                )}
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 text-[10px]">
                <label className="col-span-2 min-w-0">
                    <span className="sr-only">视频模型</span>
                    <Seedance2VideoModelSelect
                        value={model}
                        theme={theme}
                        onChange={(selectedModel) => {
                            onMetadataChange?.(node.id, {
                                seedanceModel: selectedModel,
                                model: selectedModel,
                            });
                        }}
                    />
                </label>
                <label className="min-w-0">
                    <span className="sr-only">视频比例</span>
                    <select
                        value={followsSource ? "inherit" : ratio}
                        className="h-8 w-full rounded-xl border px-2 text-[11px] outline-none transition hover:border-orange-500/80 focus:border-orange-500"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                        title="比例：默认跟随上游图片，手动选择后锁定"
                        onChange={(event) => {
                            const value = event.target.value;
                            if (value === "inherit") {
                                onMetadataChange?.(node.id, {
                                    seedanceInheritSourceRatio: true,
                                    seedanceRatioTouched: false,
                                    seedanceSourceAspectRatio: undefined,
                                });
                                return;
                            }
                            const selectedRatio = normalizeSeedance2AspectRatio(value);
                            onMetadataChange?.(node.id, {
                                seedanceRatio: selectedRatio,
                                size: selectedRatio,
                                seedanceInheritSourceRatio: false,
                                seedanceRatioTouched: true,
                            });
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <option value="inherit">跟随上游</option>
                        {SEEDANCE2_RATIO_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </label>
                <label className="min-w-0">
                    <span className="sr-only">视频时长</span>
                    <select
                        value={duration}
                        className="h-8 w-full rounded-xl border px-2 text-[11px] outline-none transition hover:border-orange-500/80 focus:border-orange-500"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                        title="时长：5s / 10s / 15s"
                        onChange={(event) => {
                            const selectedDuration = normalizeSeedance2Duration(event.target.value);
                            onMetadataChange?.(node.id, {
                                seedanceDuration: selectedDuration,
                                seconds: selectedDuration,
                            });
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        {SEEDANCE2_DURATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="min-h-0 shrink-0">
                <Seedance2VideoThumbnailSortSlot
                    node={node}
                    referenceOrder={referenceOrder}
                    theme={theme}
                    visibleSlotCount={SEEDANCE2_LANDSCAPE_DEFAULT_REFERENCE_SLOT_COUNT}
                    resolvedSlots={resolvedSlots}
                    onMetadataChange={onMetadataChange}
                />
            </div>
        </div>
    );
}

function Seedance2VideoPreviewArea({ node, theme, shot, status, mode, ratio, duration, referenceOrder, seedance2ReferenceSlots, className, onMetadataChange, onDeleteConnection }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; shot: number; status: string; mode: string; ratio: string; duration: string; referenceOrder: string[]; seedance2ReferenceSlots?: Seedance2ResolvedReferenceSlot[]; className: string; onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void; onDeleteConnection?: (connectionId: string) => void }) {
    const hasVideo = Boolean(node.metadata?.content);
    const followsSource =
        node.metadata?.seedanceInheritSourceRatio !== false &&
        !node.metadata?.seedanceRatioTouched;
    const model = node.metadata?.seedanceModel || node.metadata?.model || "";
    const referenceCount = Object.values(node.metadata?.seedanceReferenceSlotBindings || {}).filter((binding) => Boolean(binding?.value || binding?.nodeId)).length;
    return (
        <div className={`relative flex min-h-0 min-w-0 flex-col overflow-hidden p-3 ${className}`} style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.placeholder }}>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border" style={{ borderColor: theme.node.stroke, background: hasVideo ? "#050505" : theme.node.panel }}>
                {hasVideo ? (
                    <video src={node.metadata?.content} controls className="h-full w-full bg-black object-contain" data-canvas-no-zoom />
                ) : (
                    <div className="px-3 text-center">
                        <Video className="mx-auto mb-2 size-8 opacity-45" />
                        <div className="text-base font-semibold" style={{ color: theme.node.text }}>第{shot}镜视频占位框</div>
                        <div className="mt-1 text-[11px] opacity-60">{status} · {mode}</div>
                        <Seedance2PlaceholderErrorDetails node={node} className="text-[10px] leading-3" />
                        <div className="mt-2 rounded-full border px-2 py-1 text-[10px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已绑定 {referenceCount} 张参考图</div>
                    </div>
                )}
            </div>
            <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 text-[10px]" data-canvas-no-drag data-canvas-no-zoom>
                <label className="col-span-2 min-w-0">
                    <span className="mb-1 block font-semibold" style={{ color: theme.node.text }}>生成模式</span>
                    <select
                        defaultValue="image_to_video"
                        className="h-8 w-full rounded-xl border px-2 text-[11px] font-semibold outline-none"
                        style={{ borderColor: "rgba(249,115,22,.85)", background: theme.node.fill, color: theme.node.text }}
                        title="生成模式：文生视频 / 图生视频 / 首尾帧"
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <option value="image_to_video">图生视频</option>
                        <option value="first_last_frame">首尾帧</option>
                        <option value="text_to_video">文生视频</option>
                    </select>
                </label>
                <label className="col-span-2 min-w-0">
                    <span className="sr-only">视频模型</span>
                    <Seedance2VideoModelSelect
                        value={model}
                        theme={theme}
                        onChange={(selectedModel) => {
                            onMetadataChange?.(node.id, {
                                seedanceModel: selectedModel,
                                model: selectedModel,
                            });
                        }}
                    />
                </label>
                <label className="min-w-0">
                    <span className="sr-only">视频比例</span>
                    <select
                        value={followsSource ? "inherit" : ratio}
                        className="h-8 w-full rounded-xl border px-2 text-[11px] outline-none"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                        title="比例：默认跟随上游图片，手动选择后锁定"
                        onChange={(event) => {
                            const value = event.target.value;
                            if (value === "inherit") {
                                onMetadataChange?.(node.id, {
                                    seedanceInheritSourceRatio: true,
                                    seedanceRatioTouched: false,
                                    seedanceSourceAspectRatio: undefined,
                                });
                                return;
                            }
                            const selectedRatio = normalizeSeedance2AspectRatio(value);
                            onMetadataChange?.(node.id, {
                                seedanceRatio: selectedRatio,
                                size: selectedRatio,
                                seedanceInheritSourceRatio: false,
                                seedanceRatioTouched: true,
                            });
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <option value="inherit">跟随上游</option>
                        {SEEDANCE2_RATIO_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </label>
                <label className="min-w-0">
                    <span className="sr-only">视频时长</span>
                    <select
                        value={duration}
                        className="h-8 w-full rounded-xl border px-2 text-[11px] outline-none"
                        style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                        title="时长：5s / 10s / 15s"
                        onChange={(event) => {
                            const selectedDuration = normalizeSeedance2Duration(event.target.value);
                            onMetadataChange?.(node.id, {
                                seedanceDuration: selectedDuration,
                                seconds: selectedDuration,
                            });
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        {SEEDANCE2_DURATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="mt-3 min-h-0 shrink-0">
                <Seedance2VideoThumbnailSortSlot node={node} referenceOrder={referenceOrder} theme={theme} resolvedSlots={seedance2ReferenceSlots} onMetadataChange={onMetadataChange} onDeleteConnection={onDeleteConnection} />
            </div>
        </div>
    );
}

function Seedance2InlinePromptEditor({ node, theme, mentionReferences, className, variant = "default", isRunning, onPromptChange, onMetadataChange, onGenerateVideo }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; mentionReferences: CanvasResourceReference[]; className: string; variant?: "default" | "portrait"; isRunning: boolean; onPromptChange: (value: string) => void; onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void; onGenerateVideo: () => void }) {
    const prompt = node.metadata?.prompt || "";
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const isPortraitVariant = variant === "portrait";
    const promptRootRef = useRef<HTMLDivElement | null>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const dismissPromptEditor = useCallback(() => setIsEditingPrompt(false), []);
    useDismissSeedance2PromptEditor(isEditingPrompt, promptRootRef, dismissPromptEditor);
    const rootClassName = isPortraitVariant
        ? `flex h-full min-h-0 min-w-0 flex-col gap-[3px] overflow-hidden px-2 pb-1 pt-[3px] ${className}`
        : `flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-3 ${className}`;
    const headerClassName = "flex shrink-0 items-center justify-between gap-2 text-[11px]";
    const textareaClassName = isPortraitVariant
        ? "thin-scrollbar block min-h-[160px] flex-1 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-xs font-semibold leading-5 outline-none select-text"
        : "thin-scrollbar block min-h-0 flex-1 w-full resize-none overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 outline-none select-text";
    const promptPreviewClassName = isPortraitVariant
        ? "thin-scrollbar min-h-[160px] flex-1 cursor-text overflow-y-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-xs font-semibold leading-5 select-text"
        : "thin-scrollbar min-h-0 flex-1 cursor-text overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 select-text";
    const requestPreviewClassName = "rounded-2xl border px-3 py-2 text-[11px] leading-5";
    const requestPreviewText = "请求预览：按参考图连线先后生成 reference_images；可在左侧用途下拉中指定普通参考图或首帧。";
    const buttonClassName = isPortraitVariant
        ? "mt-auto h-10 shrink-0 rounded-xl bg-orange-500 px-3 text-sm font-bold text-white shadow-[0_10px_22px_rgba(249,115,22,.22)] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-45"
        : "h-12 shrink-0 rounded-2xl bg-orange-500 px-4 text-base font-bold text-white shadow-[0_12px_30px_rgba(249,115,22,.25)] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-45";
    const promptPreviewText = prompt.trim();

    useEffect(() => {
        if (!isEditingPrompt) return;
        const textarea = promptTextareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingPrompt]);

    return (
        <div ref={promptRootRef} className={rootClassName} style={{ borderColor: theme.node.stroke }} data-seedance2-inline-prompt data-canvas-no-zoom>
            {!isPortraitVariant ? (
                <div className={headerClassName} style={{ color: theme.node.muted }}>
                    <span className="flex shrink-0 items-center gap-1 font-semibold" style={{ color: theme.node.text }}>
                        视频提示词
                        <button
                            type="button"
                            className="grid size-6 shrink-0 place-items-center rounded-full transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-35"
                            disabled={!node.metadata?.seedanceAutoPrompt}
                            data-seedance2-regenerate-prompt
                            aria-label="从分镜重新生成提示词"
                            title="从分镜重新生成提示词"
                            onClick={(event) => {
                                event.stopPropagation();
                                onMetadataChange?.(node.id, seedance2RegeneratePromptPatch(node.metadata));
                            }}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            <RefreshCw className="size-3.5" />
                        </button>
                    </span>
                    <span className="truncate">双击编辑当前镜头</span>
                </div>
            ) : null}
            {isEditingPrompt ? (
                <CanvasResourceMentionTextarea
                    value={prompt}
                    references={mentionReferences}
                    onChange={onPromptChange}
                    ref={promptTextareaRef}
                    className={textareaClassName}
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                    highlightLabels={false}
                    placeholder="描述当前镜头的视频内容"
                    data-seedance2-inline-prompt-textarea
                    data-canvas-wheel-scroll
                    onBlur={dismissPromptEditor}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
            ) : (
                <div
                    className={promptPreviewClassName}
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: promptPreviewText ? theme.node.text : theme.node.muted }}
                    data-seedance2-inline-prompt-preview
                    data-canvas-wheel-scroll
                    onWheel={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        setIsEditingPrompt(true);
                    }}
                >
                    {promptPreviewText || <span className="opacity-70">描述当前镜头的视频内容</span>}
                </div>
            )}
            {!isPortraitVariant ? (
                <div className={requestPreviewClassName} style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.muted }}>
                    {requestPreviewText}
                </div>
            ) : null}
            <button
                type="button"
                className={buttonClassName}
                disabled={isRunning || !prompt.trim()}
                onClick={(event) => {
                    event.stopPropagation();
                    onGenerateVideo?.();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {isRunning ? "视频生成中" : "生成视频"}
            </button>
        </div>
    );
}

function Seedance2VideoThumbnailSortSlot({ node, referenceOrder, theme, variant = "landscape", visibleSlotCount, resolvedSlots, onMetadataChange, onDeleteConnection }: { node: CanvasNodeData; referenceOrder: string[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; variant?: "landscape" | "portrait"; visibleSlotCount?: number; resolvedSlots?: Seedance2ResolvedReferenceSlot[]; onMetadataChange?: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void; onDeleteConnection?: (connectionId: string) => void }) {
    const [preview, setPreview] = useState<Seedance2ReferencePreviewState>(null);
    const bindings = node.metadata?.seedanceReferenceSlotBindings || {};
    const extraBindings = node.metadata?.seedanceReferenceExtraSlotBindings || {};
    const orderedSlotKeys = buildSeedance2ReferenceSlotKeysFromOrder(referenceOrder);
    type ThumbnailReferenceSlot = {
        key: Seedance2ReferenceSlotKey | Seedance2ExtraReferenceSlotKey;
        label: string;
        fallbackLabel: string;
        binding?: Seedance2ReferenceSlotBinding;
        isExtra: boolean;
        slotIndex: number;
        source?: Seedance2ResolvedReferenceSlot["source"];
        value?: string;
        previewValue?: string;
        nodeId?: string;
        connectionId?: string;
        referenceSequence?: number;
    };
    const isPortrait = variant === "portrait";
    const safeVisibleSlotCount = Number.isFinite(visibleSlotCount) ? Math.floor(Number(visibleSlotCount)) : SEEDANCE2_PORTRAIT_DEFAULT_REFERENCE_SLOT_COUNT;
    const portraitVisibleSlotCount = Math.min(SEEDANCE2_MAX_REFERENCE_SLOT_COUNT, Math.max(SEEDANCE2_PORTRAIT_DEFAULT_REFERENCE_SLOT_COUNT, safeVisibleSlotCount));
    const slotForIndex = (index: number): ThumbnailReferenceSlot => {
        if (index < SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER.length) {
            const key = orderedSlotKeys[index];
            return {
                key,
                label: bindings[key]?.label || SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY[key],
                fallbackLabel: `参考图 ${index + 1}`,
                binding: bindings[key],
                isExtra: false,
                slotIndex: index + 1,
            };
        }
        const key = `reference_${index + 1}` as Seedance2ExtraReferenceSlotKey;
        const binding = extraBindings[key];
        return {
            key,
            label: binding?.label || `参考图 ${index + 1}`,
            fallbackLabel: `参考图 ${index + 1}`,
            binding,
            isExtra: true,
            slotIndex: index + 1,
        };
    };
    const semanticSlots = orderedSlotKeys.map((_, index) => slotForIndex(index));
    const landscapeVisibleSlotCount = visibleSlotCount === undefined
        ? semanticSlots.length
        : Math.min(SEEDANCE2_MAX_REFERENCE_SLOT_COUNT, Math.max(1, safeVisibleSlotCount));
    const fallbackSlots = isPortrait
        ? Array.from({ length: portraitVisibleSlotCount }, (_, index) => slotForIndex(index))
        : semanticSlots.slice(0, landscapeVisibleSlotCount);
    const slots: ThumbnailReferenceSlot[] = resolvedSlots?.length
        ? resolvedSlots.slice(0, SEEDANCE2_MAX_REFERENCE_SLOT_COUNT).map((resolvedSlot) => ({
            ...slotForIndex(resolvedSlot.slotIndex - 1),
            source: resolvedSlot.source,
            value: resolvedSlot.value,
            previewValue: resolvedSlot.previewValue,
            nodeId: resolvedSlot.nodeId,
            connectionId: resolvedSlot.connectionId,
            referenceSequence: resolvedSlot.referenceSequence,
        }))
        : fallbackSlots;
    const displayedVisibleSlotCount = resolvedSlots?.length
        ? slots.length
        : isPortrait ? portraitVisibleSlotCount : visibleSlotCount ?? slots.length;
    const hideUseAsSelect = true;
    const rootClassName = isPortrait
        ? "flex h-full min-h-0 w-full flex-col rounded-xl border p-2"
        : "flex max-h-[300px] min-h-0 w-full shrink-0 flex-col rounded-2xl border p-2.5";
    const headerClassName = isPortrait
        ? "mb-1 flex items-center justify-between gap-2"
        : "mb-2 flex items-center justify-between gap-2";
    const titleClassName = isPortrait ? "text-[10px] font-bold" : "text-[11px] font-bold";
    const countClassName = isPortrait ? "text-[9px] opacity-55" : "text-[10px] opacity-55";
    const gridClassName = isPortrait
        ? seedance2PortraitReferenceGridClassName(displayedVisibleSlotCount)
        : "grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden";
    const slotClassName = "group relative aspect-square min-w-0 cursor-pointer overflow-hidden rounded-xl border transition hover:border-orange-500/70 hover:bg-white/5";
    const thumbnailClassName = "absolute inset-0 h-full w-full object-cover";
    const placeholderClassName = "absolute inset-0 grid place-items-center bg-orange-500/15 text-[13px] font-semibold text-orange-300";
    const labelClassName = isPortrait ? "truncate text-[10px] font-semibold" : "truncate text-[11px] font-semibold";
    const subtextClassName = isPortrait ? "truncate text-[8px] opacity-55" : "truncate text-[9px] opacity-55";
    const selectClassName = isPortrait ? "mt-1 h-6 rounded-md border px-1 text-[9px] outline-none" : "mt-2 h-7 rounded-lg border px-2 text-[10px] outline-none";
    const loadReferenceImage = (slot: (typeof slots)[number], label: string, file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") return;
            const nextBinding = {
                nodeId: `manual-${slot.key}-${Date.now()}`,
                value: reader.result,
                label: file.name || label,
                required: !slot.isExtra && (slot.key === "upstream_hd_frame" || slot.key === "current_shot"),
                useAs: normalizeSeedance2ReferenceSlotUseAs(slot.binding?.useAs),
            };
            if (slot.isExtra) {
                onMetadataChange?.(node.id, {
                    seedanceReferenceExtraSlotBindings: {
                        [slot.key]: nextBinding,
                    },
                });
                return;
            }
            onMetadataChange?.(node.id, {
                seedanceReferenceSlotBindings: {
                    ...bindings,
                    [slot.key]: nextBinding,
                },
            });
        };
        reader.readAsDataURL(file);
    };
    const removeManualReference = (item: (typeof slots)[number]) => {
        if (item.isExtra) {
            onMetadataChange?.(node.id, {
                seedanceReferenceExtraSlotBindings: { [item.key]: undefined },
            });
            return;
        }
        onMetadataChange?.(node.id, {
            seedanceReferenceSlotBindings: { [item.key]: undefined },
        });
    };
    const updateReferenceUseAs = (item: (typeof slots)[number], nextUseAs: Seedance2ReferenceSlotUseAs) => {
        const nextBinding = {
            ...(item.binding || {
                label: item.label || item.fallbackLabel,
            }),
            useAs: nextUseAs,
        };
        if (item.isExtra) {
            onMetadataChange?.(node.id, {
                seedanceReferenceExtraSlotBindings: {
                    [item.key]: nextBinding,
                },
            });
            return;
        }
        onMetadataChange?.(node.id, {
            seedanceReferenceSlotBindings: {
                ...bindings,
                [item.key]: nextBinding,
            },
        });
    };
    return (
        <div className={rootClassName} style={{ background: theme.node.fill, borderColor: theme.node.stroke }} data-canvas-no-drag data-canvas-no-zoom data-visible-slot-count={displayedVisibleSlotCount}>
            <div className={headerClassName}>
                <span className={titleClassName} style={{ color: theme.node.text }}>连线参考图上传</span>
                <span className={countClassName}>{isPortrait ? `可见 ${displayedVisibleSlotCount}` : "按连接先后"}</span>
            </div>
            <div
                className={gridClassName}
                style={isPortrait ? { gridTemplateColumns: "repeat(2, 150px)", justifyContent: "center" } : undefined}
                data-seedance2-reference-grid
                data-canvas-no-drag
                data-canvas-no-zoom
                {...seedance2ReferenceGridCanvasEventHandlers}
            >
                {slots.map((item) => {
                    const hasValue = Boolean(item.value || item.binding?.value || item.binding?.nodeId);
                    const isReadOnlySlot = item.source === "connected" || item.source === "pending";
                    const connectionSequence = item.referenceSequence ?? item.slotIndex;
                    const displayLabel = item.source === "connected"
                        ? `参考图 ${item.slotIndex} · 连线`
                        : item.source === "manual"
                            ? `参考图 ${item.slotIndex} · 手动`
                            : hasValue ? item.label : item.fallbackLabel;
                    const subtext = item.source === "connected"
                        ? `第${connectionSequence}条连线图片`
                        : item.source === "manual"
                            ? "手动固定"
                            : item.source === "pending"
                                ? "等待图片生成"
                                : hasValue ? "已绑定，可替换" : "等待连线或点击上传";
                    const thumbnailValue = isReadOnlySlot
                        ? item.previewValue
                        : item.value || item.binding?.value;
                    const SlotElement = isReadOnlySlot ? "div" : "label";
                    const connectionId = item.connectionId;
                    const removeReference = isReadOnlySlot
                        ? connectionId && onDeleteConnection
                            ? () => onDeleteConnection(connectionId)
                            : undefined
                        : hasValue
                            ? () => removeManualReference(item)
                            : undefined;
                    return (
                        <SlotElement
                            key={item.key}
                            className={isReadOnlySlot ? slotClassName.replace("cursor-pointer", "cursor-default") : slotClassName}
                            style={{ borderColor: hasValue ? "rgba(249,115,22,.65)" : theme.node.stroke, color: theme.node.muted }}
                            data-seedance2-reference-source-node-id={item.nodeId}
                            title={isReadOnlySlot ? displayLabel : hasValue ? `${displayLabel}：点击可替换` : `${displayLabel}：点击添加`}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            {!isReadOnlySlot ? (
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(event) => {
                                        const input = event.currentTarget;
                                        loadReferenceImage(item, displayLabel, input.files?.[0]);
                                        input.value = "";
                                    }}
                                />
                            ) : null}
                            {thumbnailValue ? (
                                <img
                                    src={thumbnailValue}
                                    alt={displayLabel}
                                    className={thumbnailClassName}
                                />
                            ) : (
                                <span className={placeholderClassName}>参考图</span>
                            )}
                            <Seedance2ReferenceThumbnailActions
                                value={thumbnailValue}
                                label={displayLabel}
                                onPreview={setPreview}
                                onRemove={removeReference}
                                removeTitle={isReadOnlySlot ? "删除连线及参考图" : "删除手动参考图"}
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 min-w-0 bg-black/65 p-1">
                                <div className="min-w-0">
                                    <div className={labelClassName} style={{ color: theme.node.text }}>{displayLabel}</div>
                                    <div className={subtextClassName}>{subtext}</div>
                                </div>
                            </div>
                            {!hideUseAsSelect && (
                                <select
                                    value={normalizeSeedance2ReferenceSlotUseAs(item.binding?.useAs)}
                                    className={selectClassName}
                                    style={{ borderColor: theme.node.stroke, background: theme.node.panel, color: theme.node.text }}
                                    title="设置这张参考图在视频生成中的用途"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => {
                                        event.stopPropagation();
                                        const nextUseAs = normalizeSeedance2ReferenceSlotUseAs(event.currentTarget.value);
                                        updateReferenceUseAs(item, nextUseAs);
                                    }}
                                >
                                    <option value="reference_image">普通参考图</option>
                                    <option value="first_frame">首帧</option>
                                </select>
                            )}
                        </SlotElement>
                    );
                })}
            </div>
            <Seedance2ReferencePreviewOverlay preview={preview} onClose={() => setPreview(null)} />
        </div>
    );
}

function resolveSeedance2PlaceholderRatio(node: CanvasNodeData, sources: Seedance2PlaceholderAspectRatioSources = {}) {
    const upstreamNaturalRatio = normalizeSeedance2PlaceholderRatio(sources.upstreamNaturalRatio);
    const currentShotRatio = normalizeSeedance2PlaceholderRatio(sources.currentShotRatio);
    const sourceRatio = normalizeSeedance2PlaceholderRatio(node.metadata?.seedanceSourceAspectRatio);
    const seedanceRatio = normalizeSeedance2PlaceholderRatio(node.metadata?.seedanceRatio);
    const metadataSize = normalizeSeedance2PlaceholderRatio(node.metadata?.size);
    const followsSource =
        node.metadata?.seedanceInheritSourceRatio !== false &&
        !node.metadata?.seedanceRatioTouched;
    if (followsSource) {
        return sourceRatio || currentShotRatio || upstreamNaturalRatio || seedanceRatio || metadataSize || "9:16";
    }
    return seedanceRatio || metadataSize || "9:16";
}

function normalizeSeedance2PlaceholderRatio(value?: string | null) {
    const normalized = String(value || "").trim();
    const direct = SEEDANCE2_PLACEHOLDER_RATIOS.find((item) => item === normalized);
    if (direct) return direct;
    const match = normalized.match(/^(\d+(?:\.\d+)?)[x:](\d+(?:\.\d+)?)$/i);
    if (!match) return "";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "";
    return nearestSeedance2PlaceholderRatio(width / height);
}

function seedance2PlaceholderStatusText(status?: string | null) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "success" || normalized === "done" || normalized === "ready") return "已完成";
    if (normalized === "loading" || normalized === "generating" || normalized === "running") return "生成中";
    if (normalized === "downloading") return "下载中";
    if (normalized === "canceled" || normalized === "cancelled") return "已取消";
    if (normalized === "uploading" || normalized === "upload" || normalized === "uploaded") return "上传中";
    if (normalized === "error" || normalized === "failed" || normalized === "timeout") return "生成失败";
    return "等待生成";
}

function Seedance2PlaceholderErrorDetails({ node, className = "" }: { node: CanvasNodeData; className?: string }) {
    const status = String(node.metadata?.status || "").toLowerCase();
    const raw = String(node.metadata?.errorDetails || "").trim();
    if (!raw || !["error", "failed", "timeout"].includes(status)) return null;
    const details = formatCanvasGenerationError(raw, "视频生成失败");
    if (details === "视频生成失败") return null;
    return (
        <div
            className={`mt-2 rounded-lg border border-red-400/40 bg-red-500/10 px-2.5 py-1.5 font-medium leading-4 text-red-500 ${className}`}
            style={{ borderColor: "rgba(248,113,113,.45)" }}
            title={details}
            data-seedance2-generation-error
        >
            {details}
        </div>
    );
}

function nearestSeedance2PlaceholderRatio(ratio: number) {
    return SEEDANCE2_PLACEHOLDER_RATIOS.reduce((best, item) => (Math.abs(seedance2PlaceholderRatioNumber(item) - ratio) < Math.abs(seedance2PlaceholderRatioNumber(best) - ratio) ? item : best), "9:16");
}

function seedance2PlaceholderRatioNumber(value: string) {
    const [width, height] = value.split(":").map(Number);
    return width / height;
}

const SEEDANCE2_PLACEHOLDER_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] as const;

function VideoMetric({ label, value, theme }: { label: string; value: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="min-w-0 rounded-md px-2 py-1" style={{ background: theme.node.fill }}>
            <div className="opacity-50">{label}</div>
            <div className="truncate font-semibold">{value}</div>
        </div>
    );
}

function Seedance2WorkflowContent({ node, theme }: NodeContentRendererProps) {
    const mode = node.metadata?.seedanceWorkflowMode === "slice" ? "slice" : "continuous";
    const shotCount = node.metadata?.seedanceShotCount || 4;
    const generateCount = node.metadata?.seedanceGenerateCount || 1;
    const continuous = Boolean(node.metadata?.seedanceContinuous);
    const order = node.metadata?.seedanceReferenceOrder?.length ? node.metadata.seedanceReferenceOrder : ["upstream frame", "current shot", "character", "scene"];
    return (
        <div className="flex h-full w-full cursor-move flex-col gap-3 overflow-hidden px-5 py-5" style={{ color: theme.node.text }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-base font-semibold">
                        <Film className="size-5 shrink-0 text-orange-300" />
                        <span className="truncate">{node.title || "Seedance2 video workflow"}</span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>story director - video placeholder - Seedance2 API</div>
                </div>
                <span className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>{mode}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
                <StoryMetric label="shots" value={`${shotCount}`} theme={theme} />
                <StoryMetric label="generations" value={`${generateCount}`} theme={theme} />
                <StoryMetric label="continuous" value={continuous ? "on" : "off"} theme={theme} />
                <StoryMetric label="尺寸" value={node.metadata?.seedanceRatio || "16:9"} theme={theme} />
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                <div className="mb-2 text-xs font-semibold">默认参考图顺序</div>
                <div className="flex flex-wrap gap-1.5">
                    {order.map((item, index) => (
                        <span key={`${item}-${index}`} className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>{index + 1}. {item}</span>
                    ))}
                </div>
            </div>
            <div className="min-h-0 flex-1 rounded-xl border p-3" style={{ borderColor: theme.node.stroke }}>
                <div className="text-xs font-semibold">video prompt template</div>
                <div className="thin-scrollbar mt-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap text-xs leading-5" style={{ color: theme.node.muted }}>
                    {node.metadata?.seedancePromptTemplate || "story settings + shot content + character and scene assets + references + Seedance video prompt"}
                </div>
            </div>
            <div className="text-[11px]" style={{ color: theme.node.muted }}>打开节点面板可修改参数，并一键创建对应视频占位框。</div>
        </div>
    );
}

function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    if (!node.metadata?.content)
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2" style={{ color: theme.node.placeholder }}>
                <Music2 className="size-7 opacity-35" />
                <span className="text-sm">空音频节点</span>
            </div>
        );
    return (
        <div className="flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{node.title || "音频"}</span>
            </div>
            <audio src={node.metadata.content} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
}

function StoryDirectorContent({ node, theme }: NodeContentRendererProps) {
    const shotCount = node.metadata?.storyShotCount || 12;
    const style = node.metadata?.storyStyle || "cinematic";
    const aspectRatio = node.metadata?.storyAspectRatio || "16:9";
    const text = node.metadata?.storyText?.trim() || node.metadata?.content?.trim() || "";
    const characterRefs = node.metadata?.storyCharacterSourceImageNodeIds?.length || 0;
    const sceneRefs = node.metadata?.storySceneSourceImageNodeIds?.length || 0;
    const propRefs = node.metadata?.storyPropSourceImageNodeIds?.length || 0;

    return (
        <div className="flex h-full w-full cursor-move flex-col gap-3 overflow-hidden px-6 py-6" style={{ color: theme.node.text }}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-base font-semibold">
                        <Clapperboard className="size-5 shrink-0" />
                        <span className="truncate">{node.title || "故事导演"}</span>
                    </div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        小说分析、角色资产、分镜提示词总控
                    </div>
                </div>
                <span className="shrink-0 rounded-md border px-2 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                    {aspectRatio}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <StoryMetric label="镜头" value={`${shotCount}`} theme={theme} />
                <StoryMetric label="风格" value={style} theme={theme} />
                <StoryMetric label="文本" value={text ? "已填" : "待填"} theme={theme} />
            </div>

            <div className="grid grid-cols-3 gap-2">
                <StoryMetric label="character refs" value={`${characterRefs}`} theme={theme} />
                <StoryMetric label="scene refs" value={`${sceneRefs}`} theme={theme} />
                <StoryMetric label="other refs" value={`${propRefs}`} theme={theme} />
            </div>

            <div className="min-h-0 flex-1 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                <div className="line-clamp-[7] whitespace-pre-wrap break-words text-xs leading-5" style={{ color: text ? theme.node.text : theme.node.placeholder }}>
                    {text || "Open the panel to paste story text. Connect character, scene, and other images as references."}
                </div>
            </div>
        </div>
    );
}

function StoryMetric({ label, value, theme }: { label: string; value: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="min-w-0 rounded-lg border px-2 py-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="text-[10px] opacity-55">{label}</div>
            <div className="mt-1 truncate text-xs font-semibold">{value}</div>
        </div>
    );
}

function ImageContent({
    node,
    resourceLabel,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
}: {
    node: CanvasNodeData;
    resourceLabel?: CanvasResourceReference;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchChild = Boolean(node.metadata?.batchRootId);
    const wheelHoldRef = useRef<{ pointerId: number; wheelUsed: boolean } | null>(null);
    const [imageLoadFailed, setImageLoadFailed] = useState(false);
    const imageSource = node.metadata?.content || "";
    const showImagePlaceholder = imageLoadFailed || !imageSource;
    const storyLabel = storyImageLabel(node);
    const imageLabel = storyLabel || (resourceLabel?.active && resourceLabel.kind === "image" ? resourceLabel.label : `图片${node.metadata?.imageSequenceNumber || numericImageLabel(node.id)}`);

    const resizeImageByWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const hold = wheelHoldRef.current;
        if (!hold) return;
        if ((event.buttons & 1) !== 1) {
            wheelHoldRef.current = null;
            return;
        }
        hold.wheelUsed = true;
        event.preventDefault();
        event.stopPropagation();
        const defaultSize = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const currentScale = Math.max(node.width / defaultSize.width, node.height / defaultSize.height, IMAGE_WHEEL_SCALE_PRESETS[0]);
        const nextScale = nextImageScalePreset(currentScale, event.deltaY < 0 ? 1 : -1);
        const baseWidth = node.width / currentScale;
        const baseHeight = node.height / currentScale;
        const nextWidth = Math.max(120, baseWidth * nextScale);
        const nextHeight = Math.max(90, baseHeight * nextScale);
        const center = {
            x: node.position.x + node.width / 2,
            y: node.position.y + node.height / 2,
        };
        const resizeEvent = new CustomEvent("canvas:image-wheel-resize", {
            detail: {
                nodeId: node.id,
                width: nextWidth,
                height: nextHeight,
                position: { x: center.x - nextWidth / 2, y: center.y - nextHeight / 2 },
            },
        });
        window.dispatchEvent(resizeEvent);
    };

    const startWheelHold = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        wheelHoldRef.current = { pointerId: event.pointerId, wheelUsed: false };
    };

    const stopWheelHold = (event: React.PointerEvent<HTMLDivElement>) => {
        if (wheelHoldRef.current?.pointerId === event.pointerId) wheelHoldRef.current = null;
    };

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
            <div className="relative h-full w-full overflow-hidden rounded-[inherit]" onPointerDown={startWheelHold} onPointerUp={stopWheelHold} onPointerCancel={stopWheelHold} onWheel={resizeImageByWheel}>
                <div className="relative h-full w-full overflow-hidden">
                    {imageSource ? (
                        <img
                            src={imageSource}
                            alt=""
                            draggable={false}
                            onError={() => setImageLoadFailed(true)}
                            onLoad={() => setImageLoadFailed(false)}
                            onDragStart={(event) => event.preventDefault()}
                            className={`pointer-events-none block h-full w-full select-none object-cover ${imageLoadFailed ? "opacity-0" : ""}`}
                        />
                    ) : null}
                    {showImagePlaceholder ? (
                        <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ color: theme.node.placeholder }}>
                            <div className="flex max-w-[calc(100%-32px)] items-center gap-2 rounded-2xl border px-3 py-2 text-sm backdrop-blur-md" style={{ background: `${theme.node.panel}cc`, borderColor: theme.node.stroke }}>
                                <ImageIcon className="size-4 opacity-55" />
                                <span className="truncate">{imageLoadFailed ? "图片已过期，需重新上传" : "图片预览"}</span>
                            </div>
                        </div>
                    ) : null}
                </div>
                {(node.metadata?.content || node.metadata?.storageKey) && !isBatchRoot ? (
                    <span className="pointer-events-none absolute right-2 top-2 z-30 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white shadow-[0_6px_18px_rgba(0,0,0,.20)] backdrop-blur-sm">
                        {imageLabel}
                    </span>
                ) : null}
            </div>
            {isBatchRoot ? (
                <button
                    type="button"
                    className="absolute right-2 top-2 z-30 flex h-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }}
                    aria-label={`${imageLabel}-${batchCount}: ${batchExpanded ? "group expanded" : "group collapsed"}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none text-[#2f80ff]">{imageLabel}-{batchCount}</span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </button>
            ) : null}
            {isBatchChild ? (
                <button
                    type="button"
                    className="absolute right-3 top-3 z-30 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSetBatchPrimary?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Star className="size-3.5 text-[#2f80ff]" />
                    设为主图
                </button>
            ) : null}
        </BatchFrame>
    );
}

function numericImageLabel(id: string) {
    const match = id.match(/\d+/g)?.join("");
    if (match) return String(Number(match.slice(-IMAGE_LABEL_ID_LENGTH)) || 1);
    const total = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return String((total % 99) + 1);
}

function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <span className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` 路 ${size}` : ""}
            </span>
        </div>
    );
}

function BatchFrame({ batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, children }: { batchCount: number; batchExpanded: boolean; batchOpening: boolean; batchRecovering: boolean; onToggleBatch?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchRoot = batchCount > 1;
    return (
        <div
            className="group/batch relative h-full w-full overflow-visible"
            onDoubleClick={
                isBatchRoot
                    ? (event) => {
                          event.stopPropagation();
                          onToggleBatch?.();
                      }
                    : undefined
            }
        >
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 5) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300 group-hover/batch:translate-x-2"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded && !batchOpening ? 0.34 : 1,
                                transform:
                                    batchOpening || batchRecovering ? `translate(${54 + index * 22}px, ${20 + index * 12}px) rotate(${8 + index * 5}deg) scale(.98)` : `translate(${34 + index * 18}px, ${14 + index * 10}px) rotate(${6 + index * 4}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ corner, onMouseDown }: { corner: ResizeCorner; onMouseDown: (event: React.MouseEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return <div className={`absolute z-50 size-7 ${positionClass}`} onMouseDown={(event) => onMouseDown(event, corner)} />;
}

function storyDirectorPanelContentHeight(panel: HTMLElement) {
    const style = window.getComputedStyle(panel);
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const childrenHeight = Array.from(panel.children).reduce((total, child) => {
        if (!(child instanceof HTMLElement)) return total;
        const childStyle = window.getComputedStyle(child);
        const marginTop = child.hasAttribute("data-story-director-config-area") ? 0 : Number.parseFloat(childStyle.marginTop) || 0;
        const marginBottom = Number.parseFloat(childStyle.marginBottom) || 0;
        return total + marginTop + child.offsetHeight + marginBottom;
    }, 0);
    return Math.ceil(paddingTop + childrenHeight + paddingBottom);
}

function ConnectionHandleDot({ nodeType, side, active, visible, onMouseDown }: { nodeType: CanvasNodeType; side: "left" | "right"; active: boolean; visible: boolean; onMouseDown: (event: React.MouseEvent) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const color = nodePortColor(nodeType);

    return (
        <div
            className={`group/port absolute top-1/2 z-30 flex size-12 -translate-y-1/2 cursor-crosshair items-center justify-center transition-opacity duration-150 ${
                side === "left" ? "-left-6" : "-right-6"
            } ${visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-35"}`}
            onMouseDown={onMouseDown}
        >
            <div
                className="grid size-5 place-items-center rounded-full border transition-all duration-150 group-hover/port:scale-110"
                style={{
                    background: theme.node.panel,
                    borderColor: active ? color : `${theme.node.muted}aa`,
                    boxShadow: active ? `0 0 0 5px ${color}24, 0 0 16px ${color}88` : `0 0 0 3px ${theme.node.panel}88`,
                }}
            >
                <div className="size-2.5 rounded-full transition-all group-hover/port:scale-110" style={{ background: active ? color : theme.node.muted }} />
            </div>
        </div>
    );
}

function StoryDirectorConnectionHandles({ activeHandleId, visible, onMouseDown }: { activeHandleId?: string | null; visible: boolean; onMouseDown: (event: React.MouseEvent, handleId: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const color = nodePortColor(CanvasNodeType.StoryDirector);

    return (
        <div className={`pointer-events-none absolute inset-0 z-40 transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-45"}`}>
            {STORY_DIRECTOR_INPUT_HANDLES.map((handle, index) => {
                const active = activeHandleId === handle.id;
                return (
                    <div
                        key={handle.id}
                        className={`absolute left-3 flex h-10 -translate-x-full -translate-y-1/2 cursor-crosshair items-center justify-center gap-2 ${visible ? "pointer-events-auto" : "pointer-events-none"}`}
                        style={{ top: `${storyHandleTopPercent(index)}%` }}
                        onMouseDown={(event) => onMouseDown(event, handle.id)}
                        title={`连接${handle.label}`}
                        aria-label={`连接${handle.label}`}
                    >
                        <span
                            className="max-w-[64px] truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur"
                            style={{ background: `${theme.toolbar.panel}e6`, borderColor: active ? `${selectionBlue}cc` : theme.toolbar.border, color: theme.node.text }}
                        >
                            {handle.shortLabel}
                        </span>
                        <span
                            className="grid size-6 place-items-center rounded-full border transition-all duration-150"
                            style={{
                                background: active ? `${selectionBlue}24` : `${selectionBlue}14`,
                                borderColor: active ? `${selectionBlue}ee` : `${selectionBlue}aa`,
                                boxShadow: active ? `0 0 0 5px ${selectionBlue}24, 0 0 18px ${selectionBlue}cc` : `0 0 0 4px ${selectionBlue}14, 0 0 14px ${selectionBlue}66`,
                            }}
                        >
                            <span className="size-2.5 rounded-full" style={{ background: active ? selectionBlue : `${selectionBlue}cc` }} />
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function storyHandleTopPercent(index: number) {
    return [46, 55, 64, 73][index] || 55;
}

function storyImageLabel(node: CanvasNodeData) {
    const label = node.metadata?.storyLabel?.trim();
    if (label) return label;
    const characterName = node.title.match(/^角色-(.+)$/)?.[1]?.trim();
    if (characterName) return characterName;
    const shotIndex = node.title.match(/^镜头(\d+)/)?.[1];
    if (shotIndex) return `shot ${shotIndex}`;
    const groupIndex = Number(node.metadata?.storyGrid9GroupIndex) || 0;
    if (!groupIndex && !node.title.startsWith("9-grid")) return "";
    const start = Number(node.metadata?.storyGrid9ShotStart) || 0;
    const end = Number(node.metadata?.storyGrid9ShotEnd) || 0;
    if (start && end) return start === end ? `shot ${start}` : `shots ${start}-${end}`;
    return groupIndex ? `9-grid ${groupIndex}` : node.title;
}

function nodePortColor(type: CanvasNodeType) {
    if (type === CanvasNodeType.Image) return "#60a5fa";
    if (type === CanvasNodeType.Text) return "#a78bfa";
    if (type === CanvasNodeType.Config) return "#34d399";
    if (type === CanvasNodeType.Video) return "#fb923c";
    if (type === CanvasNodeType.Audio) return "#f472b6";
    if (type === CanvasNodeType.Seedance2Workflow) return "#fb923c";
    return "#60a5fa";
}
