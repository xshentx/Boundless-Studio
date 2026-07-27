type RelayErrorLike = {
    code?: unknown;
    message?: unknown;
    response?: {
        status?: unknown;
        data?: unknown;
    };
};

export function formatRelayModelsError(error: unknown, baseUrl: string) {
    const item = errorLike(error);
    const status = typeof item.response?.status === "number" ? item.response.status : undefined;
    const payloadMessage = extractRelayErrorMessage(item.response?.data);
    const errorMessage = typeof item.message === "string" ? item.message : "";
    const message = payloadMessage || errorMessage;
    const target = formatRelayTarget(baseUrl);

    if (status === 401 || status === 403) {
        return `读取模型失败：鉴权失败 (${status})，请检查 API Key、套餐权限或模型列表权限。${target}`;
    }

    if (status === 404) {
        return `读取模型失败：模型列表接口 /models 不存在或 Base URL 填错（返回 404）。请确认中转是否兼容 OpenAI 的 /v1/models；如果不支持自动读取，就在模型列表里手动填写模型。${target}`;
    }

    if (isHtmlServerPage(message)) {
        return status
            ? `读取模型失败：中转返回了网页错误 (${status})，不是模型列表 JSON。请检查 Base URL 是否填到了正确的 API 根地址。${target}`
            : `读取模型失败：中转返回了网页错误，不是模型列表 JSON。请检查 Base URL 是否填到了正确的 API 根地址。${target}`;
    }

    if (isNetworkError(message) || item.code === "ERR_NETWORK") {
        return `读取模型失败：没有连上中转服务。请检查中转地址、网络或本地代理是否正常。${target}`;
    }

    if (status) {
        return `读取模型失败：中转返回 ${status}。${target}`;
    }

    return message ? `读取模型失败：${message}` : `读取模型失败。${target}`;
}

function errorLike(error: unknown): RelayErrorLike {
    return error && typeof error === "object" ? (error as RelayErrorLike) : {};
}

function extractRelayErrorMessage(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    for (const key of ["message", "msg", "detail", "code"]) {
        if (typeof record[key] === "string" && record[key]) return String(record[key]).trim();
    }
    return extractRelayErrorMessage(record.error);
}

function isHtmlServerPage(message: string) {
    return /<html[\s>]|<!doctype html|<h1>|openresty|nginx/i.test(message);
}

function isNetworkError(message: string) {
    return /failed to fetch|network error|fetch failed|load failed|econnrefused|etimedout|timeout/i.test(message);
}

function formatRelayTarget(baseUrl: string) {
    const target = String(baseUrl || "").trim();
    return target ? `当前地址：${target}` : "";
}
