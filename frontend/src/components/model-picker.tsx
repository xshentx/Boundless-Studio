"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { ModelIcon, ModelLabel } from "@/components/model-icon";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { modelMatchesAllowedModel, normalizeModelList, resolveConfiguredModel } from "@/stores/api-relay-config";
import { selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

export type ModelSelectControlProps = {
    models: readonly string[];
    value?: string;
    onChange: (model: string) => void;
    placeholder?: string;
    emptyLabel?: string;
    disabled?: boolean;
    title?: string;
    triggerClassName?: string;
    contentClassName?: string;
    triggerStyle?: CSSProperties;
    contentAlign?: "start" | "center" | "end";
    contentSide?: "top" | "right" | "bottom" | "left";
    contentSideOffset?: number;
    onMissingConfig?: () => void;
};

export function ModelSelectControl({
    models,
    value,
    onChange,
    placeholder = "选择模型",
    emptyLabel = "暂无已配置模型",
    disabled = false,
    title,
    triggerClassName,
    contentClassName,
    triggerStyle,
    contentAlign = "start",
    contentSide = "bottom",
    contentSideOffset = 6,
    onMissingConfig,
}: ModelSelectControlProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const aliasMigrationRef = useRef("");
    const options = useMemo(() => normalizeModelList([...models]), [models]);
    const requested = String(value || "").trim();
    const current = resolveConfiguredModel(requested, options);

    useEffect(() => {
        const migrationKey = current && current !== requested ? `${requested}\u0000${current}` : "";
        if (!migrationKey) {
            aliasMigrationRef.current = "";
            return;
        }
        if (aliasMigrationRef.current === migrationKey) return;
        aliasMigrationRef.current = migrationKey;
        onChange(current);
    }, [current, onChange, requested]);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={current || undefined}
            disabled={disabled}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length) onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={(model) => {
                if (options.includes(model)) onChange(model);
            }}
        >
            <SelectTrigger
                className={cn(
                    "model-select-trigger h-10 min-w-0 select-none justify-start gap-2 rounded-xl border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    triggerClassName,
                )}
                style={triggerStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={title || current || placeholder}
                aria-label={title || placeholder}
            >
                {current ? <ModelIcon model={current} /> : null}
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current || placeholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className={cn("z-[1200] w-80 max-w-[calc(100vw-24px)] select-none rounded-xl border border-border/70 bg-popover p-1 shadow-xl", contentClassName)}
                position="popper"
                align={contentAlign}
                side={contentSide}
                sideOffset={contentSideOffset}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    options.map((model) => (
                        <SelectItem key={model} value={model} textValue={model}>
                            <ModelLabel model={model} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty_model_list__" disabled>
                        {emptyLabel}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    allowedModels?: readonly string[];
    onMissingConfig?: () => void;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder = "选择模型", allowedModels, onMissingConfig }: ModelPickerProps) {
    const options = useMemo(() => {
        const configuredModels = selectableModelsByCapability(config, capability);
        if (!allowedModels?.length) return configuredModels;
        return configuredModels.filter((model) => modelMatchesAllowedModel(model, allowedModels));
    }, [allowedModels, capability, config]);

    return (
        <ModelSelectControl
            models={options}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            emptyLabel={emptyModelLabel(capability)}
            onMissingConfig={onMissingConfig}
            triggerClassName={cn(
                "canvas-composer-model-picker h-8 w-fit max-w-full rounded-full",
                fullWidth ? "w-full min-w-0" : "min-w-[9rem]",
                className,
            )}
        />
    );
}

function emptyModelLabel(capability?: ModelCapability) {
    const label = capability === "image" ? "生图" : capability === "video" ? "视频" : capability === "text" ? "文本" : capability === "audio" ? "音频" : "";
    return `暂无已配置${label}模型`;
}
