import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

import { getDesktopState, removeDesktopState, setDesktopState } from "@/services/desktop-storage";

localforage.config({
    name: "infinite-canvas",
    storeName: "app_state",
});

const INDEXED_DB_READ_TIMEOUT_MS = 15_000;
const INDEXED_DB_TIMEOUT = "__indexed_db_read_timeout__";

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            const desktopValue = await getDesktopState(name);
            if (desktopValue !== null) return desktopValue;
            const legacyValue = await readLegacyValue(name);
            if (legacyValue !== null) {
                await setDesktopState(name, legacyValue);
                await clearLegacyValue(name);
            }
            return legacyValue;
        } catch {
            return readLegacyValue(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await setDesktopState(name, value);
            await clearLegacyValue(name);
        } catch {
            cacheLegacyLocalStorage(name, value);
            try {
                await localforage.setItem(name, value);
            } catch {
                // Standalone Vite development can continue with localStorage.
            }
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await removeDesktopState(name);
        } finally {
            await clearLegacyValue(name);
        }
    },
};

async function readLegacyValue(name: string) {
    const localValue = safeReadLocalStorage(name);
    try {
        const value = await Promise.race([
            localforage.getItem<string>(name),
            new Promise<typeof INDEXED_DB_TIMEOUT>((resolve) => window.setTimeout(() => resolve(INDEXED_DB_TIMEOUT), INDEXED_DB_READ_TIMEOUT_MS)),
        ]);
        if (value === INDEXED_DB_TIMEOUT) return localValue;
        return value || localValue || null;
    } catch {
        return localValue;
    }
}

async function clearLegacyValue(name: string) {
    try {
        window.localStorage.removeItem(name);
    } catch {
        // Ignore unavailable localStorage.
    }
    try {
        await localforage.removeItem(name);
    } catch {
        // Ignore unavailable IndexedDB.
    }
}

function safeReadLocalStorage(name: string) {
    try {
        return window.localStorage.getItem(name);
    } catch {
        return null;
    }
}

function cacheLegacyLocalStorage(name: string, value: string) {
    try {
        window.localStorage.setItem(name, value);
    } catch {
        // Ignore unavailable localStorage.
    }
}
