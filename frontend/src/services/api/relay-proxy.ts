export const LOCAL_RELAY_PROXY_PREFIX = "/local-relay-proxy";
export const LOCAL_RELAY_BASE_URL_HEADER = "x-local-relay-base-url";

export function buildLocalRelayProxyUrl(path: string) {
    return `${LOCAL_RELAY_PROXY_PREFIX}/${path.replace(/^\/+/, "").replace(/\/+$/, "")}/`;
}

export function buildLocalRelayProxyHeaders(provider: { baseUrl: string; apiKey: string }, contentType?: string) {
    return {
        [LOCAL_RELAY_BASE_URL_HEADER]: provider.baseUrl,
        Authorization: `Bearer ${provider.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export function resolveLocalRelayProxyTarget(baseUrl: string, pathParts: string[]) {
    const cleanPath = `/${pathParts.map((part) => encodeURIComponent(decodeURIComponent(part))).join("/")}`;
    return buildProxyTargetApiUrl(baseUrl, cleanPath);
}

function buildProxyTargetApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl.trim().replace(/\/+$/, ""));
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeOpenAiCompatibleBaseUrl(baseUrl: string) {
    return normalizeKnownSuffix(baseUrl, "/v1") || normalizeKnownSuffix(baseUrl, "/api/v3") || normalizeKnownSuffix(baseUrl, "/api/plan/v3") || baseUrl;
}

function normalizeKnownSuffix(baseUrl: string, suffix: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        if (!lowerPath.endsWith(suffix)) return "";
        url.pathname = `${path.slice(0, path.length - suffix.length)}${suffix}`;
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return "";
    }
}
