import axios from "axios";

import { resolveApiRequestRoute, routedLocalApiUrl, routedLocalHeaders, type ApiRequestRoute } from "@/services/api/ai-routing";
import { buildLocalRelayProxyHeaders, buildLocalRelayProxyUrl } from "@/services/api/relay-proxy";
import { formatRelayModelsError } from "@/services/api/relay-errors";
import { detectTextApiResponseError } from "@/services/api/text-response-errors";
import type { ApiBoardRouteKey } from "@/stores/api-relay-config";
import { type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { nanoid } from "nanoid";
import { dataUrlToFile, readImageMeta } from "@/lib/image-utils";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageToDataUrl } from "@/services/image-storage";
import { getStoredAuthKey } from "@/store/auth";
import type { ReferenceImage } from "@/types/image";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ChatCompletionOptions = {
    responseFormat?: "json_object";
    stream?: boolean;
    disableFileGeneration?: boolean;
    boardRouteKey?: ApiBoardRouteKey;
};

type ImageEditOptions = {
    useReferenceLabels?: boolean;
};

type ImageApiError = {
    message?: string;
    code?: string | null;
    type?: string;
    param?: string | null;
};

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: ImageApiError;
    code?: number;
    msg?: string;
};

export type GeneratedImageResult = {
    id: string;
    dataUrl: string;
    backendUrl?: string;
    backendRel?: string;
    revisedPrompt?: string;
};

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    auto: "low",
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";
const IMAGE_MAX_COUNT = 20;
const IMAGE_REQUEST_TIMEOUT_MS = 360_000;

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

function outputSizeForQuality(quality: string | undefined) {
    if (quality === "low") return "1k";
    if (quality === "medium") return "2k";
    if (quality === "high") return "4k";
    return undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    shortSide = basePixels || DEFAULT_IMAGE_SHORT_SIDE;
    longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;

    // Keep explicit dimensions inside relay limits. The output_size field still
    // carries the selected 1k/2k/4k tier to providers that support it.
    const edgeScale = IMAGE_MAX_EDGE / Math.max(longSide, shortSide);
    const pixelScale = Math.sqrt(IMAGE_MAX_PIXELS / (longSide * shortSide));
    const scale = Math.min(1, edgeScale, pixelScale);
    if (scale < 1) {
        longSide = Math.floor((longSide * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.floor((shortSide * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseImageRatio(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    if (Math.max(w, h) / Math.min(w, h) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    return { width: w, height: h };
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("图像尺寸必须是正整数，例如 1024x1024");
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error("图像尺寸的宽高必须是 16 的倍数，请调整尺寸");
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error("图像尺寸最长边不能超过 3840px，请调整尺寸");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error("图像总像素需在 655360 到 8294400 之间，请调整尺寸");
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(quality, value);
    throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
}

function greatestCommonDivisor(a: number, b: number): number {
    let x = Math.abs(Math.trunc(a));
    let y = Math.abs(Math.trunc(b));
    while (y) {
        const next = x % y;
        x = y;
        y = next;
    }
    return x || 1;
}

async function resolveEditRequestSize(quality: string | undefined, size: string, firstReferenceDataUrl: string | undefined) {
    const configuredSize = resolveRequestSize(quality, size);
    if (configuredSize || size.trim().toLowerCase() !== "auto" || !firstReferenceDataUrl) {
        return configuredSize;
    }
    const meta = await readImageMeta(firstReferenceDataUrl);
    if (!meta.width || !meta.height) {
        return undefined;
    }
    const divisor = greatestCommonDivisor(meta.width, meta.height);
    return `${Math.trunc(meta.width / divisor)}:${Math.trunc(meta.height / divisor)}`;
}

function resolveImageResult(item: Record<string, unknown>): GeneratedImageResult | null {
    const b64Json = typeof item.b64_json === "string" ? item.b64_json.trim() : "";
    const backendUrl = typeof item.url === "string" ? item.url.trim() : "";
    const dataUrl = b64Json ? `data:image/png;base64,${b64Json}` : backendUrl;
    if (!dataUrl) return null;
    return {
        id: nanoid(),
        dataUrl,
        backendUrl: backendUrl || undefined,
        backendRel: extractBackendImageRel(backendUrl),
        revisedPrompt: typeof item.revised_prompt === "string" ? item.revised_prompt : undefined,
    };
}

function parseImagePayload(payload: ImageApiResponse) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || "请求失败");
    }
    const images =
        payload.data
            ?.map(resolveImageResult)
            .filter((value): value is GeneratedImageResult => Boolean(value)) || [];

    if (images.length === 0) {
        throw new Error("接口没有返回图片");
    }

    return images;
}

function extractBackendImageRel(url: string) {
    if (!url) return undefined;
    const marker = "/images/";
    const index = url.indexOf(marker);
    if (index < 0) return undefined;
    return decodeURIComponent(url.slice(index + marker.length).split("?", 1)[0].split("#", 1)[0]).replace(/^\/+/, "") || undefined;
}

function readErrorPayload(value: unknown): ImageApiError {
    if (typeof value === "string") return { message: value };
    if (!value || typeof value !== "object") return {};
    const item = value as { error?: unknown; message?: unknown; detail?: unknown; msg?: unknown; code?: unknown; type?: unknown; param?: unknown };
    if (typeof item.msg === "string") return { message: item.msg };
    if (typeof item.message === "string") {
        return {
            message: item.message,
            code: typeof item.code === "string" ? item.code : null,
            type: typeof item.type === "string" ? item.type : undefined,
            param: typeof item.param === "string" ? item.param : null,
        };
    }
    const nestedError = readErrorPayload(item.error);
    if (nestedError.message || nestedError.code) return nestedError;
    return readErrorPayload(item.detail);
}

function formatImageApiError(error: ImageApiError, fallback: string) {
    const message = String(error.message || "").trim();
    if (/no available image quota/i.test(message) || error.code === "insufficient_quota" || error.code === "maintenance_retry_later") {
        return "系统维护中，请10分钟后再试";
    }
    if (/token(_| )?invalidated|authentication token has been invalidated|invalidated oauth token|account token is invalid/i.test(message)) {
        return "上游生图账号已失效，系统已尝试剔除异常账号；请刷新账号池或补充可用账号后重试";
    }
    if (error.code === "image_generation_no_result") {
        return message ? `提示词过于模糊，上游没有直接出图：${message}` : "提示词过于模糊，上游没有直接出图，请补充主体、场景或风格后重试";
    }
    return message || fallback;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ detail?: unknown; error?: unknown; message?: string; msg?: string; code?: number }>(error)) {
        if (error.code === "ECONNABORTED") return `${fallback}：请求超时，请检查后端号池、上游接口或稍后重试`;
        const responseData = error.response?.data;
        const responseError = detectTextApiResponseError(responseData, {
            status: error.response?.status,
            contentType: String(error.response?.headers?.["content-type"] || ""),
            operation: fallback,
        });
        if (responseError) return responseError;
        const errorPayload = readErrorPayload(responseData);
        const message = formatImageApiError(errorPayload, "");
        if (message && !isOpaqueServerError(message)) return message;
        return readStatusError(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    if (status && status >= 500) return `${fallback}：后端或上游服务异常 (${status})，请稍后重试或查看后端日志`;
    return status ? `${fallback}：${status}` : fallback;
}

function isOpaqueServerError(message: string) {
    return ["internal server error", "server error"].includes(message.trim().toLowerCase());
}

function readTextContent(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === "string") return item;
                if (!item || typeof item !== "object") return "";
                const record = item as Record<string, unknown>;
                return typeof record.text === "string" ? record.text : "";
            })
            .join("");
    }
    return "";
}

function extractChatText(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const payload = value as Record<string, unknown>;
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
    const delta = firstChoice.delta && typeof firstChoice.delta === "object" ? (firstChoice.delta as Record<string, unknown>) : {};
    const message = firstChoice.message && typeof firstChoice.message === "object" ? (firstChoice.message as Record<string, unknown>) : {};
    const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
    const directCandidates = [delta.content, message.content, payload.delta, payload.text, payload.content, payload.output_text, data.text, data.content];

    for (const candidate of directCandidates) {
        const text = readTextContent(candidate);
        if (text.trim()) return text;
    }
    return "";
}

function parseStreamChunk(chunk: string, onDelta: (value: string) => void) {
    let deltaText = "";
    // SSE permits either LF or CRLF line endings. Normalize both forms so
    // strict HTTP relays do not leave the response buffered and unread.
    for (const eventBlock of chunk.split(/\r?\n\r?\n/)) {
        const dataLines = eventBlock
            .split(/\r?\n/)
            .map((line) => line.match(/^data:\s?(.*)$/)?.[1])
            .filter((line): line is string => Boolean(line));
        for (const data of dataLines) {
            if (!data || data === "[DONE]") continue;
            try {
                const payload = JSON.parse(data) as unknown;
                deltaText += extractChatText(payload);
            } catch {
                // Ignore malformed stream fragments; the final response handling still surfaces API errors.
            }
        }
    }
    if (deltaText) onDelta(deltaText);
}

function parseTextResponsePayload(value: unknown) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        const sseStart = trimmed.search(/(?:^|\r?\n)data:/);
        if (sseStart >= 0) {
            let streamed = "";
            parseStreamChunk(trimmed.slice(sseStart).trimStart(), (delta) => {
                streamed += delta;
            });
            return streamed;
        }
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            return extractChatText(parsed) || trimmed;
        } catch {
            return trimmed;
        }
    }
    return extractChatText(value);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(route: ApiRequestRoute, path: string) {
    if (route.mode === "local" || route.mode === "localPool") return routedLocalApiUrl(route, path);
    return `/v1${path}`;
}

async function aiHeaders(config: AiConfig, route: ApiRequestRoute, contentType?: string) {
    if (route.mode === "local" || route.mode === "localPool") return routedLocalHeaders(route, contentType);
    const token = (await getStoredAuthKey()) || useUserStore.getState().token;
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

function withSystemMessage(config: AiConfig, messages: ChatCompletionMessage[]) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function requestGeneration(config: AiConfig, prompt: string, boardRouteKey?: ApiBoardRouteKey) {
    const n = Math.max(1, Math.min(IMAGE_MAX_COUNT, Math.floor(Math.abs(Number(config.count)) || 1)));
    const route = resolveApiRequestRoute(config, "image", boardRouteKey ? "" : config.model || config.imageModel, boardRouteKey);
    const quality = normalizeQuality(config.quality);
    const outputSize = outputSizeForQuality(quality);
    const requestSize = resolveRequestSize(quality, config.size);
    const requestUrl = aiApiUrl(route, "/images/generations");
    try {
        const response = await axios.post<ImageApiResponse>(
            requestUrl,
            {
                model: route.model,
                prompt: withSystemPrompt(config, prompt),
                n,
                ...(quality ? { quality } : {}),
                ...(requestSize ? { size: requestSize } : {}),
                ...(outputSize ? { output_size: outputSize } : {}),
                response_format: "b64_json",
                output_format: IMAGE_OUTPUT_FORMAT,
            },
            {
                headers: await aiHeaders(config, route, "application/json"),
                timeout: route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS,
            },
        );
        const images = parseImagePayload(response.data);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, `图片生成失败 ${requestUrl}`));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, boardRouteKey?: ApiBoardRouteKey, options: ImageEditOptions = {}) {
    const n = Math.max(1, Math.min(IMAGE_MAX_COUNT, Math.floor(Math.abs(Number(config.count)) || 1)));
    const route = resolveApiRequestRoute(config, "image", boardRouteKey ? "" : config.model || config.imageModel, boardRouteKey);
    const quality = normalizeQuality(config.quality);
    const outputSize = outputSizeForQuality(quality);
    const referenceImages = await Promise.all(references.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) })));
    const requestSize = await resolveEditRequestSize(quality, config.size, referenceImages[0]?.dataUrl);
    const requestPrompt = options.useReferenceLabels === false ? prompt : buildImageReferencePromptText(prompt, references);
    const formData = new FormData();
    formData.set("model", route.model);
    formData.set("prompt", withSystemPrompt(config, requestPrompt));
    formData.set("n", String(n));
    formData.set("response_format", "b64_json");
    formData.set("output_format", IMAGE_OUTPUT_FORMAT);
    if (quality) {
        formData.set("quality", quality);
    }
    if (requestSize) {
        formData.set("size", requestSize);
    }
    if (outputSize) {
        formData.set("output_size", outputSize);
    }
    const files = referenceImages.map((image) => dataUrlToFile(image));
    files.forEach((file) => formData.append("image", file));
    if (mask) formData.set("mask", dataUrlToFile(mask));
    const requestUrl = aiApiUrl(route, "/images/edits");

    try {
        const response = await axios.post<ImageApiResponse>(requestUrl, formData, { headers: await aiHeaders(config, route), timeout: route.timeoutMs || IMAGE_REQUEST_TIMEOUT_MS });
        const images = parseImagePayload(response.data);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, `图片编辑失败 ${requestUrl}`));
    }
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta?: (text: string) => void, options: ChatCompletionOptions = {}) {
    let buffer = "";
    let answer = "";
    let processedLength = 0;
    const stream = options.stream ?? true;
    const route = resolveApiRequestRoute(config, "text", options.boardRouteKey ? "" : config.model || config.textModel, options.boardRouteKey);
    const payload = {
        model: route.model,
        messages: withSystemMessage(config, messages),
        stream,
        ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
        ...(options.disableFileGeneration ? { disable_file_generation: true } : {}),
    };

    try {
        const response = await axios.post(
            aiApiUrl(route, "/chat/completions"),
            payload,
            {
                headers: {
                    ...(await aiHeaders(config, route, "application/json")),
                } as Record<string, string>,
                timeout: route.timeoutMs,
                ...(stream
                    ? {
                          responseType: "text" as const,
                          onDownloadProgress: (event) => {
                              const responseText = String(event.event?.target?.responseText || "");
                              const nextText = responseText.slice(processedLength);
                              processedLength = responseText.length;
                              buffer += nextText;
                              const chunks = buffer.split(/\r?\n\r?\n/);
                              buffer = chunks.pop() || "";
                              for (const chunk of chunks) {
                                  parseStreamChunk(chunk, (delta) => {
                                      answer += delta;
                                      onDelta?.(answer);
                                  });
                              }
                          },
                      }
                    : {}),
            },
        );
        const responseError = detectTextApiResponseError(response.data, {
            status: response.status,
            contentType: String(response.headers?.["content-type"] || ""),
            operation: "文本生成失败",
        });
        if (responseError) throw new Error(responseError);
        if (typeof response.data === "object" && response.data && "code" in response.data && (response.data as { code?: number; msg?: string }).code !== 0) {
            throw new Error((response.data as { msg?: string }).msg || "请求失败");
        }
        if (typeof response.data === "string") {
            let apiError = "";
            try {
                const payload = JSON.parse(response.data) as { code?: number; msg?: string };
                if (typeof payload.code === "number" && payload.code !== 0) {
                    apiError = payload.msg || "请求失败";
                }
            } catch {
                // ignore plain text stream content
            }
            if (apiError) throw new Error(apiError);
        }
        if (buffer) {
            parseStreamChunk(buffer, (delta) => {
                answer += delta;
                onDelta?.(answer);
            });
        }
        // Progress callbacks can expose only a prefix of an XHR response.
        // Re-parse the completed payload so a partial answer cannot reach
        // JSON consumers when the final response is available.
        if (stream) {
            const fullAnswer = parseTextResponsePayload(response.data);
            if (fullAnswer && fullAnswer !== answer) {
                answer = fullAnswer;
                onDelta?.(answer);
            }
        }
        // Some OpenAI-compatible relays ignore `stream` and return one JSON
        // response. Recover that payload before reporting a false empty result.
        if (stream && !answer.trim()) {
            const fallbackAnswer = parseTextResponsePayload(response.data);
            if (fallbackAnswer) {
                answer = fallbackAnswer;
                onDelta?.(answer);
            }
        }
        if (!stream) {
            answer = parseTextResponsePayload(response.data);
            if (answer) onDelta?.(answer);
        }
    } catch (error) {
        throw new Error(readAxiosError(error, "文本生成失败"));
    }
    refreshRemoteUser(config);
    if (!answer.trim()) throw new Error("文本生成没有返回内容");
    return answer;
}

export async function fetchImageModels(config: AiConfig) {
    if (config.channelMode === "remote") return config.models;
    return fetchRelayModels(config.baseUrl, config.apiKey);
}

export async function fetchRelayModels(baseUrl: string, apiKey: string) {
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildLocalRelayProxyUrl("/models"), {
            headers: buildLocalRelayProxyHeaders({ baseUrl, apiKey }),
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(formatRelayModelsError(error, baseUrl));
    }
}
