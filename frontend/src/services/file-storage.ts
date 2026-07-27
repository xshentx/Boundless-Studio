"use client";

import localforage from "localforage";
import { nanoid } from "nanoid";

import { deleteDesktopMedia, getDesktopMediaBlob, listDesktopMedia, uploadDesktopMedia } from "@/services/desktop-storage";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const legacyStore = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const objectUrls = new Map<string, string>();

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const storageKey = `${prefix}:${nanoid()}`;
    try {
        await uploadDesktopMedia(storageKey, blob);
    } catch {
        await legacyStore.setItem(storageKey, blob);
    }
    const url = replaceObjectURL(storageKey, blob);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(url) : blob.type.startsWith("audio/") ? await readAudioMeta(url) : {};
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await getMediaBlob(storageKey);
    if (!blob) return fallback;
    return replaceObjectURL(storageKey, blob);
}

export async function getMediaBlob(storageKey: string) {
    try {
        const blob = await getDesktopMediaBlob(storageKey);
        if (blob) return blob;
        const legacy = await legacyStore.getItem<Blob>(storageKey);
        if (!legacy) return null;
        await uploadDesktopMedia(storageKey, legacy);
        await legacyStore.removeItem(storageKey);
        return legacy;
    } catch {
        return legacyStore.getItem<Blob>(storageKey);
    }
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    try {
        await uploadDesktopMedia(storageKey, blob);
        await legacyStore.removeItem(storageKey).catch(() => undefined);
    } catch {
        await legacyStore.setItem(storageKey, blob);
    }
    return replaceObjectURL(storageKey, blob);
}

export async function deleteStoredMedia(keys: Iterable<string>) {
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

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused = new Set<string>();
    try {
        (await listDesktopMedia()).forEach((record) => {
            if (!record.storageKey.startsWith("image:") && !usedKeys.has(record.storageKey)) unused.add(record.storageKey);
        });
    } catch {
        // Fall through to legacy IndexedDB enumeration.
    }
    await legacyStore.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.add(key);
    });
    await deleteStoredMedia(unused);
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
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

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
