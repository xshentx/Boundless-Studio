"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { getCachedAuthStorageScope, normalizeStorageScope, scopedStorageKey } from "@/lib/user-storage-scope";
import { cleanupUnusedImages, getImageBlob, resolveImageUrl, setStoredImagesRetained, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";
let assetStorageScope = getCachedAuthStorageScope();

function getAssetStorageKey(name: string) {
    return scopedStorageKey(name, assetStorageScope);
}

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const storageKey = getAssetStorageKey(name);
        const value = await localForageStorage.getItem(storageKey);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        const assets = Array.isArray(parsed.state.assets) ? parsed.state.assets : [];
        parsed.state.assets = assets;
        const assetImageKeys = assets.flatMap((asset) => (asset.kind === "image" && asset.data.storageKey ? [asset.data.storageKey] : []));
        await setStoredImagesRetained(assetImageKeys, true);
        const missingKeys = new Set<string>();
        await Promise.all(
            assets.map(async (asset) => {
                if (asset.kind === "image" && asset.data.storageKey && !(await getImageBlob(asset.data.storageKey))) {
                    missingKeys.add(asset.data.storageKey);
                }
            }),
        );
        parsed.state.assets = await Promise.all(
            assets.filter((asset) => asset.kind !== "image" || !asset.data.storageKey || !missingKeys.has(asset.data.storageKey)).map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey)
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
                    };
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl, { retained: true });
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(getAssetStorageKey(name), JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(getAssetStorageKey(name)),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                }),
            replaceAssets: (assets) => set({ assets }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/app/canvas/stores/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);

export function setAssetStorageScope(scopeId?: string | null) {
    const nextScope = normalizeStorageScope(scopeId);
    if (nextScope === assetStorageScope) return;
    assetStorageScope = nextScope;
    useAssetStore.setState({ hydrated: false, assets: [] });
    void useAssetStore.persist.rehydrate();
}
