"use client";

import type { CSSProperties } from "react";
import { Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Settings2, Video } from "lucide-react";
import { Button, Segmented } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import { videoResolutionLabel, videoSecondsLabel, videoSizeLabel } from "@/components/video-settings-panel";
import { audioFormatLabel, audioSpeedLabel, audioVoiceLabel } from "@/lib/audio-generation";
import { defaultConfig, modelMatchesCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, imageCreditCost, outputSizeForImageQuality, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "../types";

const CANVAS_IMAGE_MAX_COUNT = 20;

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onComposerToggle: () => void;
};

export function CanvasConfigNodePanel({ node, isRunning, inputSummary, onConfigChange, onGenerate, onComposerToggle }: CanvasConfigNodePanelProps) {
    const globalConfig = useEffectiveConfig();
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode || "image";
    const config = buildNodeConfig(globalConfig, node, mode);
    const count = Math.max(1, Math.min(CANVAS_IMAGE_MAX_COUNT, Math.floor(Math.abs(Number(config.count)) || 1)));
    const credits =
        mode === "image"
            ? imageCreditCost({ channelMode: config.channelMode, prices: publicSettings?.billing?.prices, mode: inputSummary.imageCount > 0 ? "edit" : "generation", outputSize: outputSizeForImageQuality(config.quality), count })
            : requestCreditCost({ channelMode: config.channelMode, modelCosts: publicSettings?.modelChannel.modelCosts, model: config.model, count: 1 });
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const sectionStyle = { background: theme.node.fill, borderColor: theme.node.stroke };
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
    const canGenerate = hasComposerContent || (mode === "audio" ? inputSummary.textCount > 0 : hasAnyInput);
    const updateImageConfig = (key: keyof AiConfig, value: string) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value });

    return (
        <div className="flex h-full w-full cursor-move flex-col gap-2.5 overflow-hidden px-4 pb-4 pt-8 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
                <div className="shrink-0 text-sm font-semibold">生成配置</div>
                <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        size="small"
                        className="canvas-config-mode !rounded-md !p-0.5"
                        value={mode}
                        onChange={(value) => onConfigChange(node.id, { generationMode: value as CanvasGenerationMode })}
                        options={[
                            {
                                value: "image",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <ImageIcon className="size-3.5" />
                                        生图
                                    </span>
                                ),
                            },
                            {
                                value: "text",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <MessageSquare className="size-3.5" />
                                        文本
                                    </span>
                                ),
                            },
                            {
                                value: "video",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Video className="size-3.5" />
                                        视频
                                    </span>
                                ),
                            },
                            {
                                value: "audio",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Music2 className="size-3.5" />
                                        音频
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>

            <section className="rounded-xl border p-3" style={sectionStyle}>
                <SectionTitle label="输入素材" muted={theme.node.muted} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <InputChip label="提示词" value={`${inputSummary.textCount} 个`} style={chipStyle} />
                    <InputChip label="参考图" value={`${inputSummary.imageCount} 张`} style={chipStyle} />
                    <InputChip label="参考视频" value={`${inputSummary.videoCount} 个`} style={chipStyle} />
                    <InputChip label="参考音频" value={`${inputSummary.audioCount} 个`} style={chipStyle} />
                </div>
                <button type="button" className="mt-2 inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium" style={chipStyle} onMouseDown={(event) => event.stopPropagation()} onClick={onComposerToggle}>
                    <Settings2 className="size-3.5" />
                    组装提示词
                </button>
            </section>

            <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                <SectionTitle label="模型" muted={theme.node.muted} />
                <ModelPicker className="canvas-compact-control mt-2 h-10" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability={mode} onMissingConfig={() => openConfigDialog(true)} fullWidth />
            </section>

            {mode === "image" ? (
                <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                    <SectionTitle label="图片参数" muted={theme.node.muted} />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <CanvasImageSettingsPopover
                            config={config}
                            placement="topLeft"
                            autoAdjustOverflow={false}
                            sections={["quality"]}
                            showTitle={false}
                            trigger={
                                <SettingTile label="清晰度" value={imageQualityLabel(config.quality)} style={chipStyle} interactive />
                            }
                            onConfigChange={updateImageConfig}
                        />
                        <CanvasImageSettingsPopover
                            config={config}
                            placement="top"
                            autoAdjustOverflow={false}
                            sections={["size"]}
                            showTitle={false}
                            trigger={
                                <SettingTile label="尺寸" value={imageSizeLabel(config.size)} style={chipStyle} interactive />
                            }
                            onConfigChange={updateImageConfig}
                        />
                        <CanvasImageSettingsPopover
                            config={config}
                            placement="topRight"
                            autoAdjustOverflow={false}
                            sections={["count"]}
                            showTitle={false}
                            trigger={
                                <SettingTile label="张数" value={`${count} 张`} style={chipStyle} interactive />
                            }
                            onConfigChange={updateImageConfig}
                        />
                    </div>
                </section>
            ) : mode === "video" ? (
                <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                    <SectionTitle label="视频参数" muted={theme.node.muted} />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <SettingTile label="清晰度" value={videoResolutionLabel(config.vquality)} style={chipStyle} />
                        <SettingTile label="比例" value={videoSizeLabel(config.size)} style={chipStyle} />
                        <SettingTile label="时长" value={videoSecondsLabel(config.videoSeconds)} style={chipStyle} />
                    </div>
                    <CanvasVideoSettingsPopover config={config} placement="topRight" buttonClassName="canvas-compact-control !mt-2 !h-9 !w-full !justify-center !rounded-lg !px-2" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                </section>
            ) : mode === "audio" ? (
                <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                    <SectionTitle label="音频参数" muted={theme.node.muted} />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <SettingTile label="声音" value={audioVoiceLabel(config.audioVoice)} style={chipStyle} />
                        <SettingTile label="格式" value={audioFormatLabel(config.audioFormat)} style={chipStyle} />
                        <SettingTile label="语速" value={audioSpeedLabel(config.audioSpeed)} style={chipStyle} />
                    </div>
                    <CanvasAudioSettingsPopover config={config} placement="topRight" buttonClassName="canvas-compact-control !mt-2 !h-9 !w-full !justify-center !rounded-lg !px-2" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                </section>
            ) : null}

            <Button
                type="primary"
                className="mt-auto !h-9 !w-full !cursor-pointer !rounded-lg"
                disabled={isRunning || !canGenerate}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onGenerate(node.id)}
            >
                <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1">
                        <CreditSymbol />
                        {credits.toLocaleString()}
                    </span>
                    {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                    <span>开始生成</span>
                </span>
            </Button>
        </div>
    );
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-8 min-w-0 items-center justify-between gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span className="truncate opacity-70">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function SectionTitle({ label, muted }: { label: string; muted: string }) {
    return (
        <div className="text-xs font-medium" style={{ color: muted }}>
            {label}
        </div>
    );
}

function SettingTile({ label, value, style, interactive = false }: { label: string; value: string; style: CSSProperties; interactive?: boolean }) {
    return (
        <div
            className={`relative min-w-0 overflow-hidden rounded-lg border px-2.5 py-2.5 transition ${
                interactive ? "cursor-pointer shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.08)] group-focus-visible:-translate-y-0.5" : ""
            }`}
            style={style}
        >
            {interactive ? <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-current opacity-55" /> : null}
            <div className="flex min-w-0 items-center justify-between gap-1.5">
                <div className="truncate text-[10px] opacity-60">{label}</div>
                {interactive ? (
                    <span
                        className="grid size-6 shrink-0 place-items-center rounded-full border opacity-85 shadow-[0_6px_14px_rgba(0,0,0,0.14)] transition group-hover:scale-105 group-hover:opacity-100"
                        style={{ background: "rgba(255,255,255,0.08)", borderColor: "currentColor" }}
                    >
                        <Settings2 className="size-3.5" />
                    </span>
                ) : null}
            </div>
            <div className="mt-1 truncate text-xs font-semibold">{value || "-"}</div>
        </div>
    );
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    const nodeModel = node.metadata?.model && modelMatchesCapability(node.metadata.model, mode) ? node.metadata.model : "";
    return {
        ...globalConfig,
        model: nodeModel || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model),
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
