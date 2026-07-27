export type TextApiResponseErrorOptions = {
    status?: number;
    contentType?: string;
    operation?: string;
};

const HTML_DOCUMENT_PATTERN = /^\s*(?:<!doctype\s+html\b|<html\b)/i;
const GATEWAY_MARKER_PATTERN = /\b(?:bad[_ ]gateway|gateway timeout|service unavailable|upstream server error)\b/i;
const DIRECT_GATEWAY_PATTERN = /^\s*(?:bad_gateway|(?:502|503|504)\s+(?:bad gateway|gateway timeout|service unavailable))\b/i;

function responseText(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";

    const record = value as Record<string, unknown>;
    for (const key of ["message", "msg", "detail"]) {
        if (typeof record[key] === "string" && record[key].trim()) {
            return record[key].trim();
        }
    }
    return responseText(record.error);
}

function gatewayStatus(status: number | undefined, text: string) {
    if (status === 502 || status === 503 || status === 504) return status;
    const match = text.match(/\b(502|503|504)\b/);
    return match ? Number(match[1]) : undefined;
}

function isStructuredApiPayload(value: unknown, text: string) {
    if (value && typeof value === "object") return true;
    if (/(?:^|\r?\n)data:/i.test(text)) return true;
    if (!/^[{[]/.test(text)) return false;
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Detects raw proxy/CDN error pages returned in place of an OpenAI-compatible
 * JSON or SSE payload. It deliberately does not classify ordinary model text
 * that merely discusses HTTP errors as a failed response.
 */
export function detectTextApiResponseError(
    value: unknown,
    options: TextApiResponseErrorOptions = {},
): string | null {
    const text = responseText(value);
    const contentType = String(options.contentType || "").toLowerCase();
    const startsWithHtml = HTML_DOCUMENT_PATTERN.test(text);
    const isHtml = startsWithHtml || (contentType.includes("text/html") && !isStructuredApiPayload(value, text));
    const isDirectGatewayError = DIRECT_GATEWAY_PATTERN.test(text);
    const hasGatewayMarkers = GATEWAY_MARKER_PATTERN.test(text);
    const hasGatewayHttpStatus = options.status === 502 || options.status === 503 || options.status === 504;

    if (!isHtml && !isDirectGatewayError && !(hasGatewayMarkers && (hasGatewayHttpStatus || /unable to complete the request|protected by|proxy|upstream/i.test(text)))) {
        return null;
    }

    const operation = String(options.operation || "文本生成失败").trim() || "文本生成失败";
    const status = gatewayStatus(options.status, text);
    if (status) {
        return `${operation}：上游网关异常（${status}），请稍后重试或检查中转 API`;
    }
    if (hasGatewayMarkers || isDirectGatewayError) {
        return `${operation}：上游网关异常，请稍后重试或检查中转 API`;
    }
    return `${operation}：中转返回了异常网页内容，请检查中转 API 或稍后重试`;
}
