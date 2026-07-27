"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Button } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, modelMatchesCapability, selectableModelsByCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, imageCreditCost, outputSizeForImageQuality, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { resolvePromptTextareaHeight } from "./canvas-prompt-panel-height";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onImageSettingsOpenChange?: (open: boolean) => void;
};

const PROMPT_TEXTAREA_COLLAPSED_HEIGHT = 96;
const PROMPT_TEXTAREA_EXPANDED_MIN_HEIGHT = 220;
const PROMPT_TEXTAREA_EXPANDED_MAX_HEIGHT = 640;
const PROMPT_TEXTAREA_VIEWPORT_MARGIN = 220;
const PROMPT_TEXTAREA_SCROLL_HEIGHT_BUFFER = 2;
export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, mentionReferences = [], onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const globalConfig = useEffectiveConfig();
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const manualPromptTextareaHeightRef = useRef<number | null>(null);
    const [prompt, setPrompt] = useState(hasImageContent ? node.metadata?.prompt || "" : isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const [isPromptExpanded, setIsPromptExpanded] = useState(false);
    const [promptTextareaHeight, setPromptTextareaHeight] = useState(PROMPT_TEXTAREA_COLLAPSED_HEIGHT);
    const credits =
        mode === "image"
            ? imageCreditCost({ channelMode: config.channelMode, prices: publicSettings?.billing?.prices, mode: hasImageContent ? "edit" : "generation", outputSize: outputSizeForImageQuality(config.quality), count: config.count })
            : requestCreditCost({ channelMode: config.channelMode, modelCosts: publicSettings?.modelChannel.modelCosts, model: config.model, count: 1 });

    const measurePromptTextarea = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const viewportMax = getPromptTextareaViewportMax();
        const minimumHeight = isPromptExpanded ? PROMPT_TEXTAREA_EXPANDED_MIN_HEIGHT : PROMPT_TEXTAREA_COLLAPSED_HEIGHT;
        const manualHeight = manualPromptTextareaHeightRef.current;
        const contentHeight = manualHeight === null ? measurePromptTextareaContentHeight(textarea, "", viewportMax) : minimumHeight;
        const nextHeight = resolvePromptTextareaHeight({
            minimumHeight,
            maximumHeight: viewportMax,
            contentHeight,
            manualHeight: manualPromptTextareaHeightRef.current,
        });

        if (manualHeight !== null && Math.abs(manualHeight - nextHeight) > 1) {
            manualPromptTextareaHeightRef.current = nextHeight;
            textarea.style.height = `${nextHeight}px`;
        }

        setPromptTextareaHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    }, [isPromptExpanded]);

    const syncPromptTextareaResizeHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const manualResizeHeight = readInlinePromptTextareaHeight(textarea.style.height);
        if (!manualResizeHeight) return;

        const minimumHeight = isPromptExpanded ? PROMPT_TEXTAREA_EXPANDED_MIN_HEIGHT : PROMPT_TEXTAREA_COLLAPSED_HEIGHT;
        const nextHeight = resolvePromptTextareaHeight({
            minimumHeight,
            maximumHeight: getPromptTextareaViewportMax(),
            contentHeight: minimumHeight,
            manualHeight: manualResizeHeight,
        });
        manualPromptTextareaHeightRef.current = nextHeight;
        if (Math.abs(manualResizeHeight - nextHeight) > 1) textarea.style.height = `${nextHeight}px`;
        setPromptTextareaHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    }, [isPromptExpanded]);

    const resetPromptTextareaManualHeight = useCallback(() => {
        manualPromptTextareaHeightRef.current = null;
        const textarea = textareaRef.current;
        if (textarea) textarea.style.height = "";
    }, []);

    useEffect(() => {
        setPrompt(hasImageContent ? node.metadata?.prompt || "" : isEditingExistingContent ? "" : node.metadata?.prompt || "");
    }, [hasImageContent, isEditingExistingContent, node.id, node.metadata?.prompt]);

    useEffect(() => {
        resetPromptTextareaManualHeight();
        setIsPromptExpanded(false);
        setPromptTextareaHeight(PROMPT_TEXTAREA_COLLAPSED_HEIGHT);
    }, [node.id, resetPromptTextareaManualHeight]);

    useLayoutEffect(() => {
        measurePromptTextarea();
    }, [measurePromptTextarea, prompt]);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(() => syncPromptTextareaResizeHeight());
        observer.observe(textarea);
        return () => observer.disconnect();
    }, [syncPromptTextareaResizeHeight]);

    useEffect(() => {
        if (!isPromptExpanded) return;
        const handleWindowResize = () => measurePromptTextarea();
        window.addEventListener("resize", handleWindowResize);
        return () => window.removeEventListener("resize", handleWindowResize);
    }, [isPromptExpanded, measurePromptTextarea]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        onPromptChange(node.id, value);
        measurePromptTextarea();
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
    };

    return (
        <div
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <CanvasResourceMentionTextarea
                ref={textareaRef}
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                containerStyle={{ height: promptTextareaHeight, minHeight: PROMPT_TEXTAREA_COLLAPSED_HEIGHT, transition: "none" }}
                className="thin-scrollbar block h-full w-full resize-y overflow-y-auto whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-sm leading-5 outline-none"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, minHeight: PROMPT_TEXTAREA_COLLAPSED_HEIGHT, transition: "none" }}
                highlightLabels={false}
                placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
                onDoubleClick={(event) => {
                    event.stopPropagation();
                    resetPromptTextareaManualHeight();
                    setIsPromptExpanded((expanded) => !expanded);
                }}
                onWheel={(event) => {
                    if (canScrollPromptTextarea(event.currentTarget, event.deltaY)) event.stopPropagation();
                }}
            />

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    disabled={isRunning || !prompt.trim()}
                    onClick={submit}
                    aria-label="生成"
                >
                    <span className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                            <CreditSymbol />
                            {credits.toLocaleString()}
                        </span>
                        {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                    </span>
                </Button>
            </div>
        </div>
    );
}

function getPromptTextareaViewportMax() {
    if (typeof window === "undefined") return PROMPT_TEXTAREA_EXPANDED_MAX_HEIGHT;
    return clampPromptTextareaHeight(window.innerHeight - PROMPT_TEXTAREA_VIEWPORT_MARGIN);
}

function readInlinePromptTextareaHeight(height: string) {
    if (!height) return 0;
    const parsedHeight = Number.parseFloat(height);
    if (!Number.isFinite(parsedHeight)) return 0;
    return Math.max(PROMPT_TEXTAREA_COLLAPSED_HEIGHT, Math.ceil(parsedHeight));
}

function measurePromptTextareaContentHeight(textarea: HTMLTextAreaElement, restoreHeight: string, maxHeight: number) {
    textarea.style.height = "0px";
    try {
        return clampPromptTextareaHeight(textarea.scrollHeight + PROMPT_TEXTAREA_SCROLL_HEIGHT_BUFFER, maxHeight);
    } finally {
        textarea.style.height = restoreHeight;
    }
}

function clampPromptTextareaHeight(height: number, maxHeight = PROMPT_TEXTAREA_EXPANDED_MAX_HEIGHT) {
    return Math.min(Math.max(height, PROMPT_TEXTAREA_COLLAPSED_HEIGHT), maxHeight);
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    const configuredModels = selectableModelsByCapability(globalConfig, mode);
    const configuredDefault = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    const savedModel = String(node.metadata?.model || "").trim();
    const nodeModel = savedModel && configuredModels.includes(savedModel) && modelMatchesCapability(savedModel, mode) ? savedModel : "";
    const defaultModel = configuredModels.includes(configuredDefault) ? configuredDefault : "";
    return {
        ...globalConfig,
        model: nodeModel || defaultModel,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

export function canScrollPromptTextarea(textarea: Pick<HTMLTextAreaElement, "scrollHeight" | "clientHeight" | "scrollTop">, deltaY: number) {
    const maximumScrollTop = textarea.scrollHeight - textarea.clientHeight;
    if (maximumScrollTop <= 1 || deltaY === 0) return false;
    if (deltaY < 0) return textarea.scrollTop > 0;
    return textarea.scrollTop < maximumScrollTop - 1;
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述要生成的视频内容";
    if (mode === "audio") return "描述要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
