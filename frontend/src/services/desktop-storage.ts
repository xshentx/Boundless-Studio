"use client";

export type DesktopMediaRecord = {
    storageKey: string;
    relativePath: string;
    mimeType: string;
    bytes: number;
    createdAt: number;
    lastAccessedAt: number;
    retained: boolean;
    category: "images" | "videos" | "audio" | "files";
};

type StateResponse = { value: string | null };
type MediaIndexResponse = { items: DesktopMediaRecord[] };

export class DesktopStorageUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DesktopStorageUnavailableError";
    }
}

async function responseMessage(response: Response) {
    try {
        const body = await response.clone().json() as { msg?: string; error?: { message?: string } };
        return body.msg || body.error?.message || `${response.status} ${response.statusText}`;
    } catch {
        return `${response.status} ${response.statusText}`;
    }
}

function stateURL(key: string) {
    return `/client-api/state?${new URLSearchParams({ key })}`;
}

function mediaURL(key: string, retained?: boolean) {
    const params = new URLSearchParams({ key });
    if (retained !== undefined) params.set("retained", String(retained));
    return `/client-api/media?${params}`;
}

export async function getDesktopState(key: string): Promise<string | null> {
    let response: Response;
    try {
        response = await fetch(stateURL(key), { method: "GET", cache: "no-store" });
    } catch (error) {
        throw new DesktopStorageUnavailableError(error instanceof Error ? error.message : "本地 data 存储连接失败");
    }
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
    return ((await response.json()) as StateResponse).value ?? null;
}

export async function setDesktopState(key: string, value: string) {
    let response: Response;
    try {
        response = await fetch(stateURL(key), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
        });
    } catch (error) {
        throw new DesktopStorageUnavailableError(error instanceof Error ? error.message : "本地 data 存储连接失败");
    }
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
}

export async function removeDesktopState(key: string) {
    let response: Response;
    try {
        response = await fetch(stateURL(key), { method: "DELETE" });
    } catch (error) {
        throw new DesktopStorageUnavailableError(error instanceof Error ? error.message : "本地 data 存储连接失败");
    }
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
}

export async function getDesktopJSON<T>(key: string): Promise<T | null> {
    const value = await getDesktopState(key);
    if (value === null) return null;
    return JSON.parse(value) as T;
}

export async function setDesktopJSON<T>(key: string, value: T) {
    await setDesktopState(key, JSON.stringify(value));
}

export async function getDesktopSetting(key: string) {
    try {
        const value = await getDesktopState(key);
        if (value !== null) return value;
        const legacy = safeLocalStorageGet(key);
        if (legacy !== null) {
            await setDesktopState(key, legacy);
            safeLocalStorageRemove(key);
        }
        return legacy;
    } catch {
        return safeLocalStorageGet(key);
    }
}

export async function setDesktopSetting(key: string, value: string) {
    try {
        await setDesktopState(key, value);
        safeLocalStorageRemove(key);
    } catch {
        safeLocalStorageSet(key, value);
    }
}

export async function removeDesktopSetting(key: string) {
    try {
        await removeDesktopState(key);
    } finally {
        safeLocalStorageRemove(key);
    }
}

export async function clearDesktopCanvasData() {
    const response = await fetch("/client-api/canvas-data", { method: "DELETE" });
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
}

export async function uploadDesktopMedia(key: string, blob: Blob, retained = false) {
    let response: Response;
    try {
        response = await fetch(mediaURL(key, retained), {
            method: "POST",
            headers: { "Content-Type": blob.type || "application/octet-stream" },
            body: blob,
        });
    } catch (error) {
        throw new DesktopStorageUnavailableError(error instanceof Error ? error.message : "本地媒体存储连接失败");
    }
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
    return response.json() as Promise<DesktopMediaRecord>;
}

export async function getDesktopMediaBlob(key: string): Promise<Blob | null> {
    let response: Response;
    try {
        response = await fetch(mediaURL(key), { method: "GET", cache: "no-store" });
    } catch (error) {
        throw new DesktopStorageUnavailableError(error instanceof Error ? error.message : "本地媒体存储连接失败");
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
    return response.blob();
}

export async function patchDesktopMedia(key: string, patch: { touch?: boolean; retained?: boolean }) {
    const response = await fetch(mediaURL(key), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
    return response.json() as Promise<DesktopMediaRecord>;
}

export async function deleteDesktopMedia(key: string) {
    const response = await fetch(mediaURL(key), { method: "DELETE" });
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
}

export async function listDesktopMedia(category?: DesktopMediaRecord["category"]) {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const suffix = params.size ? `?${params}` : "";
    const response = await fetch(`/client-api/media-index${suffix}`, { cache: "no-store" });
    if (!response.ok) throw new DesktopStorageUnavailableError(await responseMessage(response));
    return ((await response.json()) as MediaIndexResponse).items;
}

export type LegacyObjectStore = {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
    removeItem(key: string): Promise<void>;
};

export function createDesktopObjectStorage(namespace: string, legacy: LegacyObjectStore) {
    const desktopKey = (key: string) => `object:${namespace}:${key}`;
    return {
        async getItem<T>(key: string): Promise<T | null> {
            try {
                const current = await getDesktopJSON<T>(desktopKey(key));
                if (current !== null) return current;
                const oldValue = await legacy.getItem<T>(key);
                if (oldValue !== null) {
                    await setDesktopJSON(desktopKey(key), oldValue);
                    await legacy.removeItem(key);
                }
                return oldValue;
            } catch {
                return legacy.getItem<T>(key);
            }
        },
        async setItem<T>(key: string, value: T): Promise<T> {
            try {
                await setDesktopJSON(desktopKey(key), value);
                await legacy.removeItem(key).catch(() => undefined);
            } catch {
                await legacy.setItem(key, value);
            }
            return value;
        },
        async removeItem(key: string) {
            try {
                await removeDesktopState(desktopKey(key));
            } finally {
                await legacy.removeItem(key).catch(() => undefined);
            }
        },
    };
}

function safeLocalStorageGet(key: string) {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Development fallback only.
    }
}

function safeLocalStorageRemove(key: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // Ignore unavailable legacy storage.
    }
}
