import axios from "axios";

import { desktopApiUrl } from "@/services/desktop-api-url";

import { dataUrlToFile } from "@/lib/image-utils";
import { resolveApiRequestRoute, routedLocalApiUrl, routedLocalHeaders, type ApiRequestRoute } from "@/services/api/ai-routing";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import type { ApiBoardRouteKey } from "@/stores/api-relay-config";
import { type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { getStoredAuthKey } from "@/store/auth";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; error?: { message?: string } };
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type RelayVideoTask = {
    id?: string;
    task_id?: string;
    status?: string;
    file_urls?: string[];
    files?: string[];
    result?: string;
    message?: string;
    error?: { code?: string; message?: string } | string | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type RelayVideoResponse = RelayVideoTask & {
    success?: boolean;
    code?: string | number;
    msg?: string;
    detail?: unknown;
    task?: RelayVideoTask;
    tasks?: RelayVideoTask[];
};
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };
type ReferenceMediaUploadResponse = { id: string; url: string; mimeType: string; bytes: number };

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "seedance"; model: string; route?: ApiRequestRoute };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

function aiApiUrl(config: AiConfig, route: ApiRequestRoute, path: string) {
    return route.mode === "local" ? routedLocalApiUrl(route, path) : `/api/v1${path}`;
}

async function aiHeaders(config: AiConfig, route: ApiRequestRoute, contentType?: string) {
    if (route.mode === "local") return routedLocalHeaders(route, contentType);
    const token = (await getStoredAuthKey()) || useUserStore.getState().token;
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], boardRouteKey?: ApiBoardRouteKey): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, boardRouteKey);
    const delayMs = task.provider === "seedance" ? 5000 : 2500;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        const state = await pollVideoGenerationTask(config, task);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === 119) throw new Error(`${task.provider === "seedance" ? "Seedance " : ""}视频生成超时，请稍后重试`);
        await delay(delayMs);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], boardRouteKey?: ApiBoardRouteKey): Promise<VideoGenerationTask> {
    const route = resolveApiRequestRoute(config, "video", config.model || config.videoModel, boardRouteKey);
    const model = route.model.trim();
    assertVideoConfig(config, model);
    if (isSeedanceVideoConfig({ ...config, model })) {
        return createSeedanceTask(config, route, model, prompt, references, videoReferences, audioReferences);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考素材");
    }
    return createOpenAIVideoTask(config, route, model, prompt, references);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    assertVideoConfig(config, task.model);
    const route = task.route || resolveApiRequestRoute(config, "video", task.model);
    return task.provider === "seedance" ? pollSeedanceTask(config, route, task) : pollOpenAIVideoTask(config, route, task);
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
    throw new Error("视频接口没有返回可播放的视频");
}

async function createOpenAIVideoTask(config: AiConfig, route: ApiRequestRoute, model: string, prompt: string, references: ReferenceImage[]): Promise<VideoGenerationTask> {
    if (route.mode === "remote") return createRelayVideoTask(config, route, model, prompt, references);

    const body = new FormData();
    body.append("model", model);
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, route, "/videos"), body, { headers: await aiHeaders(config, route), timeout: route.timeoutMs })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model, route };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, route, `/videos/${task.id}`), { headers: await aiHeaders(config, route), params: route.mode === "remote" ? { model: task.model } : undefined, timeout: route.timeoutMs })).data);
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, route, `/videos/${task.id}/content`), { headers: await aiHeaders(config, route), params: route.mode === "remote" ? { model: task.model } : undefined, responseType: "blob", timeout: route.timeoutMs });
            await assertVideoBlob(content.data);
            refreshRemoteUser(config);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: video.error?.message || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function createSeedanceTask(config: AiConfig, route: ApiRequestRoute, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]): Promise<VideoGenerationTask> {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    if (route.mode === "remote") {
        if (videoReferences.length || audioReferences.length) {
            throw new Error("当前中转视频接口暂不支持参考视频或参考音频，请先使用参考图片生成");
        }
        return createRelayVideoTask(config, route, model, prompt, references);
    }

    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model,
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, model),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, route), payload, { headers: await aiHeaders(config, route, "application/json"), timeout: route.timeoutMs })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model, route };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function pollSeedanceTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    if (route.mode === "remote") return pollRelayVideoTask(config, route, task);

    try {
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, route, task.id), { headers: await aiHeaders(config, route), timeout: route.timeoutMs })).data);
        if (state.status === "succeeded") {
            const url = state.content?.video_url;
            if (!url) return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
            refreshRemoteUser(config);
            return { status: "completed", result: await videoResultFromUrl(url) };
        }
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: state.error?.message || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务查询失败"));
    }
}

async function createRelayVideoTask(config: AiConfig, route: ApiRequestRoute, model: string, prompt: string, references: ReferenceImage[]): Promise<VideoGenerationTask> {
    const payload = await buildRelayVideoPayload(config, model, prompt, references);
    const requestUrl = aiApiUrl(config, route, "/videos/generations");
    try {
        const response = await axios.post<RelayVideoResponse>(requestUrl, payload, { headers: await aiHeaders(config, route, "application/json"), timeout: route.timeoutMs });
        const data = response.data;
        if (!data || data.success === false) throw new Error(readErrorValue(data) || "视频任务创建失败");
        const relayTask = data.task || data;
        const taskId = data.task_id || relayTask.task_id || data.id || relayTask.id;
        if (!taskId) throw new Error("视频接口没有返回任务 ID");
        return { id: taskId, provider: "seedance", model, route };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function pollRelayVideoTask(config: AiConfig, route: ApiRequestRoute, task: VideoGenerationTask): Promise<VideoGenerationTaskState> {
    const requestUrl = aiApiUrl(config, route, `/videos/generations/tasks/${encodeURIComponent(task.id)}`);
    try {
        const response = await axios.get<RelayVideoResponse>(requestUrl, { headers: await aiHeaders(config, route), timeout: route.timeoutMs });
        const data = response.data;
        if (!data || data.success === false) throw new Error(readErrorValue(data) || "视频任务查询失败");
        return relayVideoTaskState(config, data.task || data);
    } catch (error) {
        if (isRelayVideoEndpointMissing(error)) {
            try {
                const response = await axios.get<RelayVideoResponse>(relayVideoTaskListUrl(config, route), { headers: await aiHeaders(config, route), timeout: route.timeoutMs });
                const data = response.data;
                if (!data || data.success === false) throw new Error(readErrorValue(data) || "视频任务查询失败");
                const relayTask = findRelayVideoTaskById(data, task.id);
                return relayTask ? relayVideoTaskState(config, relayTask) : { status: "pending" };
            } catch (listError) {
                throw new Error(readAxiosError(listError, "视频任务查询失败"));
            }
        }
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

function relayVideoTaskListUrl(config: AiConfig, route: ApiRequestRoute) {
    return aiApiUrl(config, route, "/tasks");
}

function findRelayVideoTaskById(data: RelayVideoResponse, taskId: string) {
    const cleanTaskId = String(taskId || "").trim();
    if (!cleanTaskId) return undefined;
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    return tasks.find((item) => item.task_id === cleanTaskId || item.id === cleanTaskId);
}

async function relayVideoTaskState(config: AiConfig, relayTask: RelayVideoTask): Promise<VideoGenerationTaskState> {
    const urls = relayVideoFileUrls(relayTask);
    if (urls.length) {
        refreshRemoteUser(config);
        return { status: "completed", result: await videoResultFromUrl(urls[0]) };
    }
    const status = String(relayTask.status || "").toLowerCase();
    if (["failed", "failure", "error", "canceled", "cancelled", "expired"].includes(status)) {
        return { status: "failed", error: readErrorValue(relayTask) || "视频生成失败" };
    }
    return { status: "pending" };
}

function isRelayVideoEndpointMissing(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    const message = readErrorValue(error.response?.data).toLowerCase();
    return status === 404 || message.includes("not found") || message.includes("page not found");
}

async function buildRelayVideoPayload(config: AiConfig, model: string, prompt: string, references: ReferenceImage[]) {
    const referenceImages = (
        await Promise.all(references.slice(0, SEEDANCE_REFERENCE_LIMITS.images).map((image) => resolveSeedanceImageUrl(config, image)))
    ).filter((url) => Boolean(String(url || "").trim()));
    const ratio = normalizeRelayVideoRatio(normalizeSeedanceRatio(config.size));
    const duration = normalizeRelayVideoDuration(normalizeSeedanceDuration(config.videoSeconds));
    return {
        model,
        mode: referenceImages.length ? "image_to_video" : "text_to_video",
        prompt: prompt.trim(),
        ratio,
        duration,
        ...(referenceImages.length
            ? {
                  reference_image: referenceImages[0],
                  reference_images: referenceImages,
              }
            : {}),
    };
}

function normalizeRelayVideoRatio(value: string) {
    return !value || value === "adaptive" || value === "auto" ? "16:9" : value;
}

function normalizeRelayVideoDuration(value: number) {
    return [5, 10, 15].includes(value) ? value : 5;
}

function relayVideoFileUrls(task: RelayVideoTask) {
    const candidates = [
        ...(Array.isArray(task.file_urls) ? task.file_urls : []),
        ...(Array.isArray(task.files) ? task.files : []),
        task.content?.video_url,
        task.result,
    ];
    return candidates.map(normalizeRelayVideoFileUrl).filter((url): url is string => Boolean(url));
}

function normalizeRelayVideoFileUrl(value: unknown) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        if (parsed.hostname === "0.0.0.0" && typeof window !== "undefined") parsed.hostname = window.location.hostname;
        return parsed.toString();
    } catch {
        return raw;
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, route: ApiRequestRoute, taskId?: string) {
    if (route.mode === "remote") return taskId ? `/v1/videos/generations/tasks/${encodeURIComponent(taskId)}` : "/v1/videos/generations";
    return routedLocalApiUrl(route, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    if (config.channelMode === "remote") {
        return uploadReferenceMedia(dataUrlToFile({ ...image, dataUrl }));
    }
    return dataUrl;
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    const file = new File([blob], video.name || "reference-video.mp4", { type: video.type || blob.type || "video/mp4" });
    return uploadReferenceMedia(file);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    const file = new File([blob], audio.name || "reference-audio.mp3", { type: audio.type || blob.type || "audio/mpeg" });
    return uploadReferenceMedia(file);
}

async function uploadReferenceMedia(file: File) {
    const token = (await getStoredAuthKey()) || useUserStore.getState().token;
    if (!token) throw new Error("使用本地参考素材需要先登录，并在服务端配置 PUBLIC_BASE_URL");
    const body = new FormData();
    body.append("file", file, file.name);
    const response = await axios.post<ApiEnvelope<ReferenceMediaUploadResponse>>(desktopApiUrl("/api/v1/media/references"), body, { headers: { Authorization: `Bearer ${token}` } });
    const payload = unwrapEnvelope(response.data, "参考素材上传失败");
    if (!payload.url) throw new Error("参考素材上传后没有返回公网 URL");
    return payload.url;
}

async function videoResultFromUrl(url: string): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob" });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch {
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先选择视频模型");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
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

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
