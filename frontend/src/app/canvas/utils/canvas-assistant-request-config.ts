import { providerModelsForCapability, type ApiBoardRouteKey, type ApiCapability } from "@/stores/api-relay-config";
import type { AiConfig } from "@/stores/use-config-store";

export type CanvasAssistantMode = "ask" | "image";

export type CanvasAssistantRequest = {
    config: AiConfig;
    boardRouteKey: Extract<ApiBoardRouteKey, "imagePrompt" | "imageGeneration">;
};

export function buildCanvasAssistantRequestConfig(config: AiConfig, mode: CanvasAssistantMode): CanvasAssistantRequest | null {
    const capability: ApiCapability = mode === "image" ? "image" : "text";
    const boardRouteKey: CanvasAssistantRequest["boardRouteKey"] = mode === "image" ? "imageGeneration" : "imagePrompt";
    const selectedModel = String(mode === "image" ? config.imageModel : config.textModel).trim();
    if (!selectedModel) return null;

    const supportsSelection = (provider: AiConfig["apiRelays"][number]) =>
        provider.enabled && provider.capabilities.includes(capability) && providerModelsForCapability(provider, capability).includes(selectedModel);
    const boardProviderId = config.apiBoardRouting[boardRouteKey]?.mode === "custom" ? config.apiBoardRouting[boardRouteKey].providerId : "";
    const capabilityProviderId = config.apiRouting[capability]?.providerId || "";
    const preferredProviderIds = [boardProviderId, capabilityProviderId].filter(Boolean);
    const provider =
        preferredProviderIds.map((providerId) => config.apiRelays.find((item) => item.id === providerId && supportsSelection(item))).find(Boolean) ||
        config.apiRelays.find(supportsSelection);
    if (!provider) return null;

    return {
        boardRouteKey,
        config: {
            ...config,
            model: selectedModel,
            ...(capability === "image" ? { imageModel: selectedModel } : { textModel: selectedModel }),
            apiBoardRouting: {
                ...config.apiBoardRouting,
                [boardRouteKey]: { mode: "custom", providerId: provider.id, model: selectedModel },
            },
        },
    };
}
