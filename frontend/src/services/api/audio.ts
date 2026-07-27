import axios from "axios";

import { audioMimeType, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import { resolveApiRequestRoute, routedLocalApiUrl, routedLocalHeaders, type ApiRequestRoute } from "@/services/api/ai-routing";
import { uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { getStoredAuthKey } from "@/store/auth";

function aiApiUrl(config: AiConfig, route: ApiRequestRoute, path: string) {
    return route.mode === "local" ? routedLocalApiUrl(route, path) : `/api/v1${path}`;
}

async function aiHeaders(config: AiConfig, route: ApiRequestRoute) {
    if (route.mode === "local") return routedLocalHeaders(route, "application/json");
    const token = (await getStoredAuthKey()) || useUserStore.getState().token;
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
    };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

export async function requestAudioGeneration(config: AiConfig, prompt: string): Promise<Blob> {
    const route = resolveApiRequestRoute(config, "audio", config.model || config.audioModel);
    const model = route.model.trim();
    assertAudioConfig(config, model);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const instructions = config.audioInstructions.trim();

    try {
        const response = await axios.post<Blob>(
            aiApiUrl(config, route, "/audio/speech"),
            {
                model,
                input: prompt,
                voice: normalizeAudioVoiceValue(config.audioVoice),
                response_format: format,
                speed: Number(normalizeAudioSpeedValue(config.audioSpeed)),
                ...(instructions ? { instructions } : {}),
            },
            { headers: await aiHeaders(config, route), responseType: "blob", timeout: route.timeoutMs },
        );
        await assertAudioBlob(response.data);
        refreshRemoteUser(config);
        return response.data.type.startsWith("audio/") ? response.data : new Blob([response.data], { type: audioMimeType(format) });
    } catch (error) {
        throw new Error(readAxiosError(error, "音频生成失败"));
    }
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
    const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
    return uploadMediaFile(audio, "audio");
}

function assertAudioConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先选择音频模型");
}

async function assertAudioBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "音频生成失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function readErrorValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const item = value as { error?: unknown; message?: unknown; detail?: unknown; msg?: unknown };
    if (typeof item.msg === "string") return item.msg;
    if (typeof item.message === "string") return item.message;
    return readErrorValue(item.error) || readErrorValue(item.detail);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ detail?: unknown; error?: unknown; message?: string; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return readErrorValue(responseData) || statusMessage(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}
