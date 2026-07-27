"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { apiGet } from "@/services/api/request";
import { buildApiUrl } from "@/services/api/url";
import type { AdminPublicSettings } from "@/services/api/admin";
import {
    defaultApiBoardModelRouting,
    defaultApiPlatformBoardModelRouting,
    defaultApiRelayAdvanced,
    defaultApiRelayRouting,
    ensureApiRelaySettings,
    filterModelsByCapability,
    inferCapabilityFromModel,
    mergeModelLists,
    modelMatchesCapability,
    normalizeModelList,
    resolveCapabilityRoute,
    type ApiBoardModelRouting,
    type ApiPlatformBoardModelRouting,
    type ApiCapability,
    type ApiRelayAdvanced,
    type ApiRelayProvider,
    type ApiRelayRouting,
} from "@/stores/api-relay-config";

export { filterModelsByCapability, modelMatchesCapability };
export { buildApiUrl };

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
    apiRelays: ApiRelayProvider[];
    apiRouting: ApiRelayRouting;
    apiBoardRouting: ApiBoardModelRouting;
    apiPlatformBoardRouting: ApiPlatformBoardModelRouting;
    apiRelayAdvanced: ApiRelayAdvanced;
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = ApiCapability;

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "",
    imageModel: "",
    videoModel: "",
    textModel: "",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "1k",
    size: "",
    count: "1",
    canvasImageCount: "1",
    apiRelays: [],
    apiRouting: defaultApiRelayRouting,
    apiBoardRouting: defaultApiBoardModelRouting,
    apiPlatformBoardRouting: defaultApiPlatformBoardModelRouting,
    apiRelayAdvanced: defaultApiRelayAdvanced,
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function resolveEffectiveConfig(config: AiConfig, _modelChannel: AdminPublicSettings["modelChannel"] | null) {
    return mergeLocalRelayModels({ ...config, channelMode: "local" });
}

function mergeLocalRelayModels(input: AiConfig) {
    const config = ensureApiRelaySettings(input);
    const relayTextModels = enabledRelayModelsForCapability(config.apiRelays, "text");
    const relayImageModels = enabledRelayModelsForCapability(config.apiRelays, "image");
    const relayVideoModels = enabledRelayModelsForCapability(config.apiRelays, "video");
    const relayAudioModels = enabledRelayModelsForCapability(config.apiRelays, "audio");
    const models = mergeModelLists(relayTextModels, relayImageModels, relayVideoModels, relayAudioModels);
    const textModels = normalizeModelList(relayTextModels);
    const imageModels = normalizeModelList(relayImageModels);
    const videoModels = normalizeModelList(relayVideoModels);
    const audioModels = normalizeModelList(relayAudioModels);
    const textModel = validRouteModel(config.apiRouting.text.model, textModels);
    const imageModel = validRouteModel(config.apiRouting.image.model, imageModels);
    const videoModel = validRouteModel(config.apiRouting.video.model, videoModels);
    const audioModel = validRouteModel(config.apiRouting.audio.model, audioModels);
    return {
        ...config,
        models,
        textModels,
        imageModels,
        videoModels,
        audioModels,
        model: validRouteModel(config.model, models) || imageModel || textModel || videoModel || audioModel,
        textModel,
        imageModel,
        videoModel,
        audioModel,
    };
}

export function enabledRelayModelsForCapability(relays: ApiRelayProvider[], capability: ApiCapability) {
    return relays
        .filter((provider) => provider.enabled && provider.capabilities.includes(capability))
        .flatMap((provider) =>
            capability === "text"
                ? provider.textModels
                : capability === "image"
                  ? provider.imageModels
                  : capability === "video"
                    ? provider.videoModels
                    : provider.audioModels,
        );
}

function validRouteModel(model: string, models: string[]) {
    return models.includes(model) ? model : "";
}

function normalizePersistedImageQuality(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    return ({ auto: "1k", low: "1k", medium: "2k", high: "4k" } as Record<string, string>)[normalized] || (["1k", "2k", "4k"].includes(normalized) ? normalized : "1k");
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    if (!model.trim()) return false;
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const capability = inferCapabilityFromModel(model);
    if (!normalized.apiRouting[capability].providerId) return false;
    try {
        resolveCapabilityRoute(normalized, capability, model);
        return true;
    } catch {
        return false;
    }
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            publicSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/public-settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                const normalizedConfig = ensureApiRelaySettings({
                    ...config,
                    channelMode: "local",
                    imageModel: config.imageModel || config.model,
                    videoModel: config.videoModel || defaultConfig.videoModel,
                    textModel: config.textModel || config.model,
                    audioModel: config.audioModel || defaultConfig.audioModel,
                    audioVoice: config.audioVoice || defaultConfig.audioVoice,
                    audioFormat: config.audioFormat || defaultConfig.audioFormat,
                    audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                    audioInstructions: config.audioInstructions || "",
                    videoSeconds: config.videoSeconds || "6",
                    vquality: config.vquality || "720",
                    videoGenerateAudio: config.videoGenerateAudio || "true",
                    videoWatermark: config.videoWatermark || "false",
                    quality: normalizePersistedImageQuality(config.quality),
                    canvasImageCount: config.canvasImageCount || "1",
                    imageModels: Array.isArray(persistedConfig.imageModels) ? normalizeModelList(config.imageModels) : filterModelsByCapability(config.models, "image"),
                    videoModels: Array.isArray(persistedConfig.videoModels) ? normalizeModelList(config.videoModels) : filterModelsByCapability(config.models, "video"),
                    textModels: Array.isArray(persistedConfig.textModels) ? normalizeModelList(config.textModels) : filterModelsByCapability(config.models, "text"),
                    audioModels: Array.isArray(persistedConfig.audioModels) ? normalizeModelList(config.audioModels) : filterModelsByCapability(config.models, "audio"),
                });
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: normalizedConfig,
                };
            },
        },
    ),
);


export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    return useMemo(() => resolveEffectiveConfig(config, modelChannel), [config, modelChannel]);
}
