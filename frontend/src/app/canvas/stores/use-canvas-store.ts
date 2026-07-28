import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { getCachedAuthStorageScope, normalizeStorageScope, scopedStorageKey } from "@/lib/user-storage-scope";
import { collectImageStorageKeys, setStoredImagesRetained } from "@/services/image-storage";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";
import { getCanvasMergeScopes, mergeCanvasProjectsByScope, type CanvasMergeProject } from "./canvas-project-merge";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
let canvasStorageScope = getCachedAuthStorageScope();

function getCanvasStorageKeys(name: string) {
    return getCanvasMergeScopes(canvasStorageScope).map((scope) => ({
        scope,
        storageKey: scopedStorageKey(name, scope),
    }));
}

function getPersistedProjects(parsed: StorageValue<CanvasStore>) {
    return Array.isArray(parsed.state?.projects) ? parsed.state.projects : [];
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const scopedValues = await Promise.all(
            getCanvasStorageKeys(name).map(async ({ scope, storageKey }) => {
                const value = await localForageStorage.getItem(storageKey);
                if (!value) return { scope, storageKey, value: null, parsed: null };
                try {
                    return {
                        scope,
                        storageKey,
                        value,
                        parsed: JSON.parse(value) as StorageValue<CanvasStore>,
                    };
                } catch {
                    void localForageStorage.removeItem(storageKey);
                    return { scope, storageKey, value: null, parsed: null };
                }
            }),
        );
        const parsedScopes = scopedValues.filter((entry): entry is { scope: string; storageKey: string; value: string; parsed: StorageValue<CanvasStore> } => Boolean(entry.parsed));
        if (!parsedScopes.length) return null;

        const primary = parsedScopes.find((entry) => entry.scope === canvasStorageScope) || parsedScopes[0];
        const parsed = primary.parsed;
        const merged = mergeCanvasProjectsByScope(
            parsedScopes.map((entry) => ({
                scope: entry.scope,
                projects: getPersistedProjects(entry.parsed) as unknown as CanvasMergeProject[],
            })),
        );
        parsed.state = {
            ...parsed.state,
            projects: merged.projects as CanvasProject[],
        };
        const mergedValue = JSON.stringify(parsed);
        if (scopedValues.some((entry) => entry.value !== mergedValue)) {
            void Promise.allSettled(getCanvasStorageKeys(name).map(({ storageKey }) => localForageStorage.setItem(storageKey, mergedValue)));
        }
        const referencedImageKeys = collectImageStorageKeys(parsed.state.projects);
        // Older project records can predate the retained flag. Mark their
        // images before hydration completes; the providers run the single
        // age-based cleanup only after both canvas and asset stores are ready.
        await setStoredImagesRetained(referencedImageKeys, true).catch(() => undefined);
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects) return;
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            const mergedValue = JSON.stringify(value);
            void Promise.allSettled(getCanvasStorageKeys(name).map(({ storageKey }) => localForageStorage.setItem(storageKey, mergedValue)));
        }, 400);
    },
    removeItem: (name) => Promise.allSettled(getCanvasStorageKeys(name).map(({ storageKey }) => localForageStorage.removeItem(storageKey))).then(() => undefined),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            createProject: (title = "未命名画布") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || "导入画布",
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const projects = state.projects.filter((project) => !ids.includes(project.id));
                    return { projects };
                }),
            replaceProjects: (projects) => set({ projects }),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
                })),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => (_state, error) => {
                if (error) {
                    useCanvasStore.setState({ projects: [] });
                }
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);

export function setCanvasStorageScope(scopeId?: string | null) {
    const nextScope = normalizeStorageScope(scopeId);
    if (nextScope === canvasStorageScope) return;
    canvasStorageScope = nextScope;
    queuedPersistState = null;
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    useCanvasStore.setState({ hydrated: false });
    void useCanvasStore.persist.rehydrate();
}
