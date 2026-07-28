export type ApiCapability = "text" | "image" | "video" | "audio";

export type ApiRouteSource = "platform" | "localPool" | "relay";

export type ApiCapabilityRoute = {
    source?: ApiRouteSource;
    providerId: string;
    model: string;
};

export type ApiRelayRouting = Record<ApiCapability, ApiCapabilityRoute>;

export type ApiBoardRouteKey =
    | "storyDirector"
    | "videoWorkflowText"
    | "imagePrompt"
    | "videoPrompt"
    | "imageGeneration"
    | "videoGeneration";

export type ApiBoardModelRoute = {
    mode: "inherit" | "custom";
    providerId: string;
    model: string;
};

export type ApiBoardModelRouting = Record<ApiBoardRouteKey, ApiBoardModelRoute>;

export type ApiPlatformBoardModelRoute = {
    mode: "inherit" | "custom";
    model: string;
};

export type ApiPlatformBoardModelRouting = Record<ApiBoardRouteKey, ApiPlatformBoardModelRoute>;

export type ApiRelayAdvanced = {
    allowCustomModel: boolean;
    defaultTimeoutMs: number;
    showDisabledProviders: boolean;
};

export type ApiRelayProvider = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
    capabilities: ApiCapability[];
    models: string[];
    textModels: string[];
    imageModels: string[];
    videoModels: string[];
    audioModels: string[];
    timeoutMs: number;
    remark: string;
    createdAt: string;
    updatedAt: string;
};

export type ResolvedCapabilityRoute = {
    provider: ApiRelayProvider;
    capability: ApiCapability;
    model: string;
};

export type RelayCompatibleConfig = {
    channelMode?: "remote" | "local";
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    textModel?: string;
    imageModel?: string;
    videoModel?: string;
    audioModel?: string;
    models?: string[];
    textModels?: string[];
    imageModels?: string[];
    videoModels?: string[];
    audioModels?: string[];
    apiRelays?: ApiRelayProvider[];
    apiRouting?: Partial<ApiRelayRouting>;
    apiBoardRouting?: Partial<ApiBoardModelRouting>;
    apiPlatformBoardRouting?: Partial<ApiPlatformBoardModelRouting>;
    apiRelayAdvanced?: Partial<ApiRelayAdvanced>;
};

export const API_CAPABILITIES: ApiCapability[] = ["text", "image", "video", "audio"];

export const API_CAPABILITY_LABELS: Record<ApiCapability, string> = {
    text: "文本",
    image: "图片",
    video: "视频",
    audio: "音频",
};

export const API_BOARD_ROUTE_DEFINITIONS: readonly { key: ApiBoardRouteKey; label: string; capability: ApiCapability }[] = [
    { key: "storyDirector", label: "故事导演", capability: "text" },
    { key: "videoWorkflowText", label: "视频工作流文本", capability: "text" },
    { key: "imagePrompt", label: "图片提示词", capability: "text" },
    { key: "videoPrompt", label: "视频提示词", capability: "text" },
    { key: "imageGeneration", label: "图片生成", capability: "image" },
    { key: "videoGeneration", label: "视频生成", capability: "video" },
];

export const defaultApiRelayRouting: ApiRelayRouting = {
    text: { source: "relay", providerId: "", model: "" },
    image: { source: "relay", providerId: "", model: "" },
    video: { source: "relay", providerId: "", model: "" },
    audio: { source: "relay", providerId: "", model: "" },
};

export const defaultApiBoardModelRouting: ApiBoardModelRouting = {
    storyDirector: { mode: "inherit", providerId: "", model: "" },
    videoWorkflowText: { mode: "inherit", providerId: "", model: "" },
    imagePrompt: { mode: "inherit", providerId: "", model: "" },
    videoPrompt: { mode: "inherit", providerId: "", model: "" },
    imageGeneration: { mode: "inherit", providerId: "", model: "" },
    videoGeneration: { mode: "inherit", providerId: "", model: "" },
};

export const defaultApiPlatformBoardModelRouting: ApiPlatformBoardModelRouting = {
    storyDirector: { mode: "inherit", model: "" },
    videoWorkflowText: { mode: "inherit", model: "" },
    imagePrompt: { mode: "inherit", model: "" },
    videoPrompt: { mode: "inherit", model: "" },
    imageGeneration: { mode: "inherit", model: "" },
    videoGeneration: { mode: "inherit", model: "" },
};

export const defaultApiRelayAdvanced: ApiRelayAdvanced = {
    allowCustomModel: false,
    defaultTimeoutMs: 360_000,
    showDisabledProviders: false,
};

export function createApiRelayProvider(input: Partial<ApiRelayProvider> = {}): ApiRelayProvider {
    const now = input.createdAt || new Date().toISOString();
    const allModels = normalizeModelList(input.models || [...(input.textModels || []), ...(input.imageModels || []), ...(input.videoModels || []), ...(input.audioModels || [])]);

    return normalizeApiRelayProvider({
        id: input.id || `relay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: input.name || "中转 API",
        baseUrl: input.baseUrl || "",
        apiKey: input.apiKey || "",
        enabled: input.enabled ?? true,
        capabilities: normalizeCapabilities(input.capabilities || inferCapabilitiesFromModels(allModels)),
        models: allModels,
        textModels: input.textModels || filterModelsByCapability(allModels, "text"),
        imageModels: input.imageModels || filterModelsByCapability(allModels, "image"),
        videoModels: input.videoModels || filterModelsByCapability(allModels, "video"),
        audioModels: input.audioModels || filterModelsByCapability(allModels, "audio"),
        timeoutMs: input.timeoutMs || defaultApiRelayAdvanced.defaultTimeoutMs,
        remark: input.remark || "",
        createdAt: now,
        updatedAt: input.updatedAt || now,
    });
}

export function normalizeApiRelayProvider(provider: ApiRelayProvider): ApiRelayProvider {
    const models = normalizeModelList(provider.models);
    return {
        ...provider,
        name: provider.name.trim() || "中转 API",
        baseUrl: provider.baseUrl.trim(),
        apiKey: normalizeApiKeyInput(provider.apiKey),
        enabled: provider.enabled !== false,
        capabilities: normalizeCapabilities(provider.capabilities),
        models,
        textModels: normalizeModelList(provider.textModels.length ? provider.textModels : filterModelsByCapability(models, "text")),
        imageModels: normalizeModelList(provider.imageModels.length ? provider.imageModels : filterModelsByCapability(models, "image")),
        videoModels: normalizeModelList(provider.videoModels.length ? provider.videoModels : filterModelsByCapability(models, "video")),
        audioModels: normalizeModelList(provider.audioModels.length ? provider.audioModels : filterModelsByCapability(models, "audio")),
        timeoutMs: Math.max(30_000, Math.min(900_000, Math.floor(Number(provider.timeoutMs) || defaultApiRelayAdvanced.defaultTimeoutMs))),
        remark: provider.remark || "",
    };
}

export function ensureApiRelaySettings<T extends RelayCompatibleConfig>(config: T): T & { apiRelays: ApiRelayProvider[]; apiRouting: ApiRelayRouting; apiBoardRouting: ApiBoardModelRouting; apiPlatformBoardRouting: ApiPlatformBoardModelRouting; apiRelayAdvanced: ApiRelayAdvanced } {
    const relays = Array.isArray(config.apiRelays) ? config.apiRelays.map(normalizeApiRelayProvider) : [];
    const apiRelays = (relays.length ? relays : legacyProviderFromConfig(config)).map((provider) => normalizeApiRelayProvider(provider));

    return {
        ...config,
        apiRelays,
        apiRouting: ensureRouting(config, apiRelays),
        apiBoardRouting: ensureBoardRouting(config),
        apiPlatformBoardRouting: ensurePlatformBoardRouting(config),
        apiRelayAdvanced: {
            ...defaultApiRelayAdvanced,
            ...(config.apiRelayAdvanced || {}),
            allowCustomModel: false,
        },
    };
}

export function providersForCapability(providers: ApiRelayProvider[], capability: ApiCapability, includeDisabled = false) {
    return providers.filter((provider) => (includeDisabled || provider.enabled) && provider.capabilities.includes(capability));
}

export function providerModelsForCapability(provider: ApiRelayProvider, capability: ApiCapability) {
    const models = capability === "text" ? provider.textModels : capability === "image" ? provider.imageModels : capability === "video" ? provider.videoModels : provider.audioModels;
    return normalizeModelList(models);
}

export function resolveConfiguredModel(model: string, configuredModels: readonly string[]) {
    const requested = String(model || "").trim();
    if (!requested) return "";

    const exactMatch = configuredModels.find((configuredModel) => String(configuredModel || "").trim() === requested);
    if (exactMatch) return String(exactMatch).trim();

    const matchKey = normalizeModelMatchKey(requested);
    const aliasMatch = configuredModels.find((configuredModel) => normalizeModelMatchKey(configuredModel) === matchKey);
    return aliasMatch ? String(aliasMatch).trim() : "";
}

export function modelMatchesAllowedModel(model: string, allowedModels: readonly string[]) {
    return Boolean(resolveConfiguredModel(model, allowedModels));
}

function normalizeModelMatchKey(model: string) {
    return String(model || "")
        .trim()
        .toLowerCase()
        .replace(/[._]+/g, "-")
        .replace(/-+/g, "-");
}

export function fillMissingCapabilityRoutes(routing: Partial<ApiRelayRouting>, provider: ApiRelayProvider): ApiRelayRouting {
    return API_CAPABILITIES.reduce((nextRouting, capability) => {
        const current = routing[capability] || defaultApiRelayRouting[capability];
        if (!provider.capabilities.includes(capability)) {
            nextRouting[capability] = { source: "relay", providerId: current.providerId || "", model: current.model || "" };
            return nextRouting;
        }
        const providerModels = providerModelsForCapability(provider, capability);
        const currentUsesProvider = current.providerId === provider.id;
        const routeNeedsProvider = !current.providerId;
        const routeNeedsModelRefresh = currentUsesProvider && (!current.model || (providerModels.length > 0 && !modelBelongsToProvider(provider, capability, current.model)));
        if (!routeNeedsProvider && !routeNeedsModelRefresh) {
            nextRouting[capability] = { source: "relay", providerId: current.providerId || "", model: current.model || "" };
            return nextRouting;
        }
        nextRouting[capability] = {
            source: "relay",
            providerId: current.providerId || provider.id,
            model: modelBelongsToProvider(provider, capability, current.model) ? current.model : providerModels[0] || "",
        };
        return nextRouting;
    }, { ...defaultApiRelayRouting } as ApiRelayRouting);
}

export function resolveCapabilityRoute(config: RelayCompatibleConfig, capability: ApiCapability, preferredModel = ""): ResolvedCapabilityRoute {
    const normalized = ensureApiRelaySettings(config);
    const label = API_CAPABILITY_LABELS[capability];
    const route = normalized.apiRouting[capability];

    const cleanPreferred = preferredModel.trim();
    const configuredProvider = route.providerId ? normalized.apiRelays.find((item) => item.id === route.providerId) : undefined;
    const inferredProvider = !route.providerId && cleanPreferred
        ? preferredProviderForCapability(
            normalized.apiRelays.filter((item) => item.enabled && item.capabilities.includes(capability) && modelBelongsToProvider(item, capability, cleanPreferred)),
            capability,
        )
        : undefined;
    const provider = configuredProvider || inferredProvider;

    if (!provider) {
        if (route.providerId) throw new Error(`未找到${label}中转 API，请重新选择`);
        throw new Error(`未配置${label}中转 API，请到设置中添加`);
    }
    if (!provider.enabled) throw new Error(`当前选择的${label}中转已停用`);
    if (!provider.capabilities.includes(capability)) throw new Error(`当前中转不支持${label}生成`);
    if (!provider.baseUrl.trim()) throw new Error(`请为${label}中转填写 Base URL`);
    if (!provider.apiKey.trim()) throw new Error(`请为${label}中转填写 API Key`);

    const models = providerModelsForCapability(provider, capability);
    const model = route.model.trim() || (cleanPreferred && models.includes(cleanPreferred) ? cleanPreferred : "");

    if (!model) throw new Error(`请为${label}中转选择模型`);
    if (!normalized.apiRelayAdvanced.allowCustomModel && models.length && !models.includes(model)) throw new Error(`${label}模型不在当前中转模型列表中`);

    return { provider, capability, model };
}

export function resolveBoardCapabilityRoute(config: RelayCompatibleConfig, boardKey: ApiBoardRouteKey, preferredModel = ""): ResolvedCapabilityRoute {
    const definition = API_BOARD_ROUTE_DEFINITIONS.find((item) => item.key === boardKey);
    if (!definition) throw new Error(`未知板块模型路由：${boardKey}`);

    const normalized = ensureApiRelaySettings(config);
    const route = normalized.apiBoardRouting[boardKey] || defaultApiBoardModelRouting[boardKey];
    if (route.mode !== "custom") return resolveCapabilityRoute(normalized, definition.capability, preferredModel);

    const boardLabel = definition.label;
    const capabilityLabel = API_CAPABILITY_LABELS[definition.capability];

    if (!route.providerId) throw new Error(`未配置${boardLabel}板块中转 API，请到设置中添加`);

    const provider = normalized.apiRelays.find((item) => item.id === route.providerId);
    if (!provider) throw new Error(`未找到${boardLabel}板块中转 API，请重新选择`);
    if (!provider.enabled) throw new Error(`当前选择的${boardLabel}板块中转已停用`);
    if (!provider.capabilities.includes(definition.capability)) throw new Error(`当前中转不支持${boardLabel}所需的${capabilityLabel}能力`);
    if (!provider.baseUrl.trim()) throw new Error(`请为${boardLabel}板块中转填写 Base URL`);
    if (!provider.apiKey.trim()) throw new Error(`请为${boardLabel}板块中转填写 API Key`);

    const cleanPreferred = preferredModel.trim();
    const models = providerModelsForCapability(provider, definition.capability);
    const model = route.model.trim() || (cleanPreferred && models.includes(cleanPreferred) ? cleanPreferred : "");

    if (!model) throw new Error(`请为${boardLabel}板块中转选择模型`);
    if (!normalized.apiRelayAdvanced.allowCustomModel && models.length && !models.includes(model)) throw new Error(`${boardLabel}板块模型不在当前中转模型列表中`);

    return { provider, capability: definition.capability, model };
}

export function resolvePlatformBoardModel(config: RelayCompatibleConfig, boardKey: ApiBoardRouteKey, fallbackModel = "") {
    const definition = API_BOARD_ROUTE_DEFINITIONS.find((item) => item.key === boardKey);
    if (!definition) throw new Error(`未知平台板块模型：${boardKey}`);
    const normalized = ensureApiRelaySettings(config);
    const route = normalized.apiPlatformBoardRouting[boardKey] || defaultApiPlatformBoardModelRouting[boardKey];
    const customModel = route.mode === "custom" ? route.model.trim() : "";
    return customModel || fallbackModel.trim();
}

export function modelMatchesCapability(model: string, capability?: ApiCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ApiCapability) {
    return capability ? normalizeModelList(models).filter((model) => modelMatchesCapability(model, capability)) : normalizeModelList(models);
}

export function inferCapabilityFromModel(model: string): ApiCapability {
    if (isImageModelName(model)) return "image";
    if (isVideoModelName(model)) return "video";
    if (isAudioModelName(model)) return "audio";
    return "text";
}

export function shouldUsePlatformAccountPool(capability: ApiCapability, model: string) {
    return capability === "image" && model.trim().toLowerCase() === "gpt-image-2";
}

export function resolveApiRouteSource(route: Partial<ApiCapabilityRoute> | undefined): ApiRouteSource {
    if (route?.source === "platform" || route?.source === "localPool" || route?.source === "relay") return route.source;
    return String(route?.providerId || "").trim() ? "relay" : "platform";
}

export function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => String(model || "").trim()).filter(Boolean)));
}

export function normalizeApiKeyInput(value: string) {
    const input = String(value || "").trim();
    if (!input) return "";
    if (/^bearer\s+/i.test(input)) return input.replace(/^bearer\s+/i, "").trim();
    if (input.startsWith("{") && input.endsWith("}")) {
        try {
            const parsed = JSON.parse(input) as Record<string, unknown>;
            const key = parsed.OPENAI_API_KEY || parsed.apiKey || parsed.api_key || parsed.key;
            if (typeof key === "string" && key.trim()) return normalizeApiKeyInput(key);
        } catch {
            // Keep the original input so the user can correct malformed JSON.
        }
    }
    return input;
}

export function mergeModelLists(...lists: string[][]) {
    return normalizeModelList(lists.flat());
}

function ensureRouting(config: RelayCompatibleConfig, providers: ApiRelayProvider[]): ApiRelayRouting {
    const input = config.apiRouting || {};
    const fallbackModels: Record<ApiCapability, string> = {
        text: config.textModel || config.model || "",
        image: config.imageModel || config.model || "",
        video: config.videoModel || "",
        audio: config.audioModel || "",
    };

    return API_CAPABILITIES.reduce((routing, capability) => {
        const existing = input[capability] || defaultApiRelayRouting[capability];
        const provider = providers.find((item) => item.id === existing.providerId && item.capabilities.includes(capability));
        if (!provider) {
            routing[capability] = { source: "relay", providerId: "", model: "" };
            return routing;
        }
        const models = providerModelsForCapability(provider, capability);
        const fallback = fallbackModels[capability];
        const model =
            (modelBelongsToProvider(provider, capability, existing.model) ? existing.model : "") ||
            (modelBelongsToProvider(provider, capability, fallback) ? fallback : "") ||
            models[0] ||
            "";
        routing[capability] = {
            source: "relay",
            providerId: provider.id,
            model,
        };
        return routing;
    }, { ...defaultApiRelayRouting } as ApiRelayRouting);
}

function ensureBoardRouting(config: RelayCompatibleConfig): ApiBoardModelRouting {
    const input = config.apiBoardRouting || {};
    return API_BOARD_ROUTE_DEFINITIONS.reduce((routing, definition) => {
        const existing = input[definition.key] || defaultApiBoardModelRouting[definition.key];
        const mode = existing.mode === "custom" ? "custom" : "inherit";
        routing[definition.key] = {
            mode,
            providerId: mode === "custom" ? String(existing.providerId || "") : "",
            model: mode === "custom" ? String(existing.model || "").trim() : "",
        };
        return routing;
    }, { ...defaultApiBoardModelRouting } as ApiBoardModelRouting);
}

function ensurePlatformBoardRouting(config: RelayCompatibleConfig): ApiPlatformBoardModelRouting {
    const input = config.apiPlatformBoardRouting || {};
    return API_BOARD_ROUTE_DEFINITIONS.reduce((routing, definition) => {
        const existing = input[definition.key] || defaultApiPlatformBoardModelRouting[definition.key];
        const mode = existing.mode === "custom" ? "custom" : "inherit";
        routing[definition.key] = {
            mode,
            model: mode === "custom" ? String(existing.model || "").trim() : "",
        };
        return routing;
    }, { ...defaultApiPlatformBoardModelRouting } as ApiPlatformBoardModelRouting);
}

function legacyProviderFromConfig(config: RelayCompatibleConfig) {
    const baseUrl = String(config.baseUrl || "").trim();
    const apiKey = String(config.apiKey || "").trim();
    const hasCustomApi = Boolean(apiKey || (baseUrl && baseUrl !== "https://api.openai.com"));
    if (!hasCustomApi) return [];

    const models = mergeModelLists(config.models || [], config.textModels || [], config.imageModels || [], config.videoModels || [], config.audioModels || [], [config.textModel || "", config.imageModel || "", config.videoModel || "", config.audioModel || ""]);
    return [
        createApiRelayProvider({
            id: "legacy-default-relay",
            name: "默认中转",
            baseUrl,
            apiKey,
            enabled: true,
            capabilities: ["text", "image", "video", "audio"],
            models,
        }),
    ];
}

function inferCapabilitiesFromModels(models: string[]): ApiCapability[] {
    const inferred = new Set<ApiCapability>();
    for (const model of models) inferred.add(inferCapabilityFromModel(model));
    return inferred.size ? API_CAPABILITIES.filter((capability) => inferred.has(capability)) : ["text"];
}

function normalizeCapabilities(capabilities: ApiCapability[]) {
    const values = new Set(capabilities.filter((capability): capability is ApiCapability => API_CAPABILITIES.includes(capability)));
    return API_CAPABILITIES.filter((capability) => values.has(capability));
}

function preferredProviderForCapability(providers: ApiRelayProvider[], capability: ApiCapability) {
    const candidates = providersForCapability(providers, capability);
    if (capability === "video") {
        return candidates.find(isBlue22VideoRelay) || candidates.find((provider) => providerModelsForCapability(provider, "video").some((model) => model.toLowerCase().includes("seedance"))) || candidates[0];
    }
    return candidates[0];
}

function isVideoModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo") || value.includes("grok") || value.includes("imagine");
}


function isBlue22VideoRelay(provider: ApiRelayProvider) {
    const value = `${provider.name} ${provider.baseUrl} ${provider.remark}`.toLowerCase();
    return value.includes("blue22") || value.includes("api.blue22.click");
}

function modelBelongsToProvider(provider: ApiRelayProvider, capability: ApiCapability, model?: string) {
    const cleanModel = String(model || "").trim();
    if (!cleanModel) return false;
    const models = providerModelsForCapability(provider, capability);
    return models.includes(cleanModel);
}

function isImageModelName(model: string) {
    const value = model.toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = model.toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}
