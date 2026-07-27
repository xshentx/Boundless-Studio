import { ensureApiRelaySettings, resolveBoardCapabilityRoute, resolveCapabilityRoute, type ApiBoardRouteKey, type ApiCapability, type ResolvedCapabilityRoute } from "@/stores/api-relay-config";
import { buildLocalRelayProxyHeaders, buildLocalRelayProxyUrl } from "@/services/api/relay-proxy";
import { routedLocalPoolHeaders } from "@/services/api/local-pool";
import { type AiConfig, type ModelCapability } from "@/stores/use-config-store";

const localPoolBackendBaseUrl = "";

export type ApiRequestRoute =
    | { mode: "remote"; capability: ApiCapability; model: string; timeoutMs: number }
    | { mode: "localPool"; capability: ApiCapability; model: string; timeoutMs: number }
    | { mode: "local"; capability: ApiCapability; model: string; provider: ResolvedCapabilityRoute["provider"]; timeoutMs: number };

export function resolveApiRequestRoute(config: AiConfig, capability: ModelCapability, preferredModel = "", boardRouteKey?: ApiBoardRouteKey): ApiRequestRoute {
    const fallbackModel = preferredModel.trim() || config[`${capability}Model`] || config.model;
    const normalized = ensureApiRelaySettings({ ...config, channelMode: "local" });
    const route = boardRouteKey ? resolveBoardCapabilityRoute(normalized, boardRouteKey, fallbackModel) : resolveCapabilityRoute(normalized, capability, fallbackModel);
    return {
        mode: "local",
        capability: route.capability,
        model: route.model,
        provider: route.provider,
        timeoutMs: route.provider.timeoutMs || normalized.apiRelayAdvanced.defaultTimeoutMs || 360_000,
    };
}

export function routedLocalApiUrl(route: ApiRequestRoute, path: string) {
    if (route.mode === "localPool") return routedLocalPoolApiUrl(route, path);
    if (route.mode !== "local") throw new Error("本地中转路由未解析");
    return buildLocalRelayProxyUrl(path);
}

export function routedLocalPoolApiUrl(route: ApiRequestRoute, path: string) {
    if (route.mode !== "localPool") throw new Error("本地号池路由未解析");
    const normalizedPath = `/v1${path.startsWith("/") ? path : `/${path}`}`.replace(/\/+$/, "");
    return `${localPoolBackendBaseUrl}${normalizedPath}`;
}

type LocalRelayRoute = Extract<ApiRequestRoute, { mode: "local" }>;
type LocalPoolRoute = Extract<ApiRequestRoute, { mode: "localPool" }>;

export function routedLocalHeaders(route: LocalRelayRoute, contentType?: string): Record<string, string>;
export function routedLocalHeaders(route: LocalPoolRoute, contentType?: string): Promise<Record<string, string>>;
export function routedLocalHeaders(route: LocalRelayRoute | LocalPoolRoute, contentType?: string): Record<string, string> | Promise<Record<string, string>>;
export function routedLocalHeaders(route: ApiRequestRoute, contentType?: string): Record<string, string> | Promise<Record<string, string>> {
    if (route.mode === "local") return buildLocalRelayProxyHeaders(route.provider, contentType) as Record<string, string>;
    if (route.mode === "localPool") return routedLocalPoolHeaders(contentType);
    throw new Error("本地请求路由未解析");
}
