"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";

import { readImageMeta } from "@/lib/image-utils";
import { deleteDesktopMedia, getDesktopMediaBlob, listDesktopMedia, patchDesktopMedia, uploadDesktopMedia } from "@/services/desktop-storage";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type StoredImageRecord = { blob: Blob; createdAt: number; lastAccessedAt?: number; retained?: boolean };
type StoredImage = Blob | StoredImageRecord;
type UploadImageOptions = { retained?: boolean; signal?: AbortSignal };

const legacyStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const objectUrls = new Map<string, string>();
export const CANVAS_IMAGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function uploadImage(input: string | Blob, options: UploadImageOptions = {}): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await fetchImageBlob(input, options.signal) : input;
    throwIfUploadAborted(options.signal);
    assertNonEmptyImageBlob(blob);
    const storageKey = `image:${nanoid()}`;
    let stored = false;
    try {
        try {
            await uploadDesktopMedia(storageKey, blob, Boolean(options.retained));
        } catch (error) {
            throwIfUploadAborted(options.signal, error);
            const now = Date.now();
            await legacyStore.setItem(storageKey, { blob, createdAt: now, lastAccessedAt: now, retained: Boolean(options.retained) });
        }
        stored = true;
        throwIfUploadAborted(options.signal);
        const url = replaceObjectURL(storageKey, blob);
        const meta = await readImageMeta(url);
        throwIfUploadAborted(options.signal);
        return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
    } catch (error) {
        if (stored && options.signal?.aborted) await deleteStoredImages([storageKey]);
        throw error;
    }
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) {
        void touchStoredImages([storageKey]);
        return cached;
    }
    const blob = await getImageBlob(storageKey, { touch: true });
    if (!blob) return fallback;
    return replaceObjectURL(storageKey, blob);
}

export async function getImageBlob(storageKey: string, options: { touch?: boolean } = {}) {
    try {
        const blob = await getDesktopMediaBlob(storageKey);
        if (blob?.size) {
            if (options.touch) void patchDesktopMedia(storageKey, { touch: true });
            return blob;
        }
        const legacy = await getLegacyRecord(storageKey);
        if (!legacy?.blob.size) return null;
        await uploadDesktopMedia(storageKey, legacy.blob, Boolean(legacy.retained));
        await legacyStore.removeItem(storageKey);
        if (options.touch) void patchDesktopMedia(storageKey, { touch: true });
        return legacy.blob;
    } catch {
        const legacy = await getLegacyRecord(storageKey);
        if (!legacy?.blob.size) return null;
        if (options.touch) await legacyStore.setItem(storageKey, { ...legacy, lastAccessedAt: Date.now() });
        return legacy.blob;
    }
}

export async function setImageBlob(storageKey: string, blob: Blob, options: UploadImageOptions = {}) {
    assertNonEmptyImageBlob(blob);
    try {
        await uploadDesktopMedia(storageKey, blob, Boolean(options.retained));
        if (options.retained !== undefined) await patchDesktopMedia(storageKey, { retained: options.retained, touch: true });
        await legacyStore.removeItem(storageKey).catch(() => undefined);
    } catch {
        const existing = await getLegacyRecord(storageKey);
        const now = Date.now();
        await legacyStore.setItem(storageKey, {
            blob,
            createdAt: existing?.createdAt || now,
            lastAccessedAt: now,
            retained: options.retained ?? existing?.retained ?? false,
        });
    }
    return replaceObjectURL(storageKey, blob);
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await fetchImageBlob(url));
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            revokeObjectURL(key);
            try {
                await deleteDesktopMedia(key);
            } catch {
                // Standalone development may not have the Go API.
            }
            await legacyStore.removeItem(key).catch(() => undefined);
        }),
    );
}

export async function touchStoredImages(keys: Iterable<string>) {
    const now = Date.now();
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            try {
                const record = await patchDesktopMedia(key, { touch: true });
                if (record) return;
                const legacy = await getLegacyRecord(key);
                if (legacy) {
                    await uploadDesktopMedia(key, legacy.blob, Boolean(legacy.retained));
                    await legacyStore.removeItem(key);
                }
            } catch {
                const legacy = await getLegacyRecord(key);
                if (legacy) await legacyStore.setItem(key, { ...legacy, lastAccessedAt: now });
            }
        }),
    );
}

export async function setStoredImagesRetained(keys: Iterable<string>, retained = true) {
    const now = Date.now();
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            try {
                const record = await patchDesktopMedia(key, { retained, touch: true });
                if (record) return;
                const legacy = await getLegacyRecord(key);
                if (legacy) {
                    await uploadDesktopMedia(key, legacy.blob, retained);
                    await legacyStore.removeItem(key);
                }
            } catch {
                const legacy = await getLegacyRecord(key);
                if (legacy) await legacyStore.setItem(key, { ...legacy, retained, lastAccessedAt: now });
            }
        }),
    );
}

export async function cleanupExpiredStoredImages(maxAgeMs = CANVAS_IMAGE_RETENTION_MS) {
    const now = Date.now();
    const expired = new Set<string>();
    try {
        (await listDesktopMedia("images"))
            .filter((record) => record.storageKey.startsWith("image:") && !record.retained && now - (record.lastAccessedAt || record.createdAt) > maxAgeMs)
            .forEach((record) => expired.add(record.storageKey));
    } catch {
        // Standalone development can still clean the legacy IndexedDB store.
    }
    await legacyStore.iterate((value: StoredImage, key) => {
        const record = unwrapStoredImage(value);
        if (!record || record.retained) return;
        if (now - (record.lastAccessedAt || record.createdAt) > maxAgeMs) expired.add(key);
    });
    await deleteStoredImages(expired);
    return [...expired];
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused = new Set<string>();
    try {
        (await listDesktopMedia("images")).forEach((record) => {
            if (record.storageKey.startsWith("image:") && !usedKeys.has(record.storageKey)) unused.add(record.storageKey);
        });
    } catch {
        // Fall through to legacy IndexedDB enumeration.
    }
    await legacyStore.iterate((_value, key) => {
        if (key.startsWith("image:") && !usedKeys.has(key)) unused.add(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

async function getLegacyRecord(storageKey: string) {
    return unwrapStoredImage(await legacyStore.getItem<StoredImage>(storageKey));
}

function unwrapStoredImage(value: StoredImage | null) {
    if (!value) return null;
    if (value instanceof Blob) return { blob: value, createdAt: Date.now(), lastAccessedAt: Date.now(), retained: false };
    if (value.blob instanceof Blob) {
        const createdAt = Number(value.createdAt) || Date.now();
        return {
            blob: value.blob,
            createdAt,
            lastAccessedAt: Number(value.lastAccessedAt) || createdAt,
            retained: Boolean(value.retained),
        };
    }
    return null;
}

function replaceObjectURL(storageKey: string, blob: Blob) {
    revokeObjectURL(storageKey);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

function revokeObjectURL(storageKey: string) {
    const existing = objectUrls.get(storageKey);
    if (existing) URL.revokeObjectURL(existing);
    objectUrls.delete(storageKey);
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

async function fetchImageBlob(url: string, signal?: AbortSignal) {
    const response = await fetch(normalizeFetchUrl(url), { signal });
    if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(readFetchError(message, response.status));
    }
    const blob = await response.blob();
    assertNonEmptyImageBlob(blob);
    return blob;
}

function throwIfUploadAborted(signal?: AbortSignal, fallback?: unknown): void {
    if (!signal?.aborted) return;
    if (signal.reason !== undefined) throw signal.reason;
    if (fallback !== undefined) throw fallback;
    throw new DOMException("The image upload was aborted", "AbortError");
}

function assertNonEmptyImageBlob(blob: Blob) {
    if (!blob.size) throw new Error("图片内容为空，请重新加载或上传后再试");
}

function normalizeFetchUrl(url: string) {
    if (typeof window === "undefined" || window.location.protocol !== "https:" || !url.startsWith("http://")) return url;
    try {
        const parsed = new URL(url);
        if (parsed.hostname === window.location.hostname) {
            parsed.protocol = "https:";
            return parsed.toString();
        }
    } catch {
        return url;
    }
    return url;
}

function readFetchError(message: string, status: number) {
    const value = message.trim();
    if (value && !["internal server error", "server error"].includes(value.toLowerCase())) return value;
    if (status === 401 || status === 403) return "图片访问鉴权失败，请重新登录后再试";
    return `图片读取失败：后端或上游服务异常 (${status})`;
}
