import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";

import { getDesktopState, removeDesktopState, setDesktopState } from "@/services/desktop-storage";
import { getStrictLocalForageItem, localForageStorage } from "@/lib/localforage-storage";

export const CONFIG_RECOVERY_SUFFIX = ":recovery";

let configWriteQueue: Promise<void> = Promise.resolve();

function recoveryKey(name: string) {
    return `${name}${CONFIG_RECOVERY_SUFFIX}`;
}

/**
 * Configuration gets a second durable copy because an application update can
 * restart the WebView while Zustand is still restoring its asynchronous
 * storage. A missing/temporarily unavailable primary must never be interpreted
 * as permission to persist the in-memory defaults over the user's API routes.
 */
export const recoverableConfigStorage: StateStorage = {
    async getItem(name) {
        let primaryError: unknown;
        try {
            const primary = await getStrictLocalForageItem(name);
            if (isPersistedConfigEnvelope(primary)) return primary;
            // A malformed primary is permanently unreadable, not a transient
            // desktop outage. Try recovery copies, then allow a clean default
            // instead of keeping the application on an infinite loading page.
        } catch (error) {
            primaryError = error;
        }

        const recovered = await readRecoveryValue(name);
        if (isPersistedConfigEnvelope(recovered)) {
            // Repair the primary in the same queue as later edits so an older
            // recovery write can never finish after a newer user change.
            void enqueueConfigWrite(() => setDesktopState(name, recovered)).catch(() => undefined);
            return recovered;
        }

        if (primaryError) throw primaryError;
        return null;
    },

    setItem(name, value) {
        return enqueueConfigWrite(async () => {
            // Save the browser recovery copy first so a process exit during an
            // update cannot leave both the primary and recovery copies stale.
            await writeBrowserRecovery(name, value);
            await localForageStorage.setItem(name, value);
            try {
                await setDesktopState(recoveryKey(name), value);
            } catch {
                // The primary storage already falls back to browser persistence.
                // Keep that same recovery path if the native mirror is unavailable.
            }
        });
    },

    removeItem(name) {
        return enqueueConfigWrite(async () => {
            await localForageStorage.removeItem(name);
            await Promise.allSettled([
                removeDesktopState(recoveryKey(name)),
                removeBrowserRecovery(name),
            ]);
        });
    },
};

export function flushRecoverableConfig(name: string, value: string) {
    // Queue behind earlier Zustand writes, then require both native copies to
    // contain this exact latest snapshot before the updater can restart.
    return enqueueConfigWrite(async () => {
        await setDesktopState(name, value);
        await setDesktopState(recoveryKey(name), value);
        await writeBrowserRecovery(name, value);
    });
}

function enqueueConfigWrite(write: () => Promise<void>) {
    const result = configWriteQueue.then(write, write);
    configWriteQueue = result.catch(() => undefined);
    return result;
}

async function readRecoveryValue(name: string) {
    if (typeof window === "undefined") return null;
    const key = recoveryKey(name);
    try {
        const native = await getDesktopState(key);
        if (isPersistedConfigEnvelope(native)) return native;
    } catch {
        // Fall through to the WebView-local recovery copies.
    }

    const local = safeLocalStorageGet(key);
    try {
        const indexedDb = await localforage.getItem<string>(key);
        if (isPersistedConfigEnvelope(indexedDb)) return indexedDb;
    } catch {
        // Fall through to the synchronous localStorage copy.
    }
    return isPersistedConfigEnvelope(local) ? local : null;
}

async function writeBrowserRecovery(name: string, value: string) {
    if (typeof window === "undefined") return;
    const key = recoveryKey(name);
    safeLocalStorageSet(key, value);
    try {
        await localforage.setItem(key, value);
    } catch {
        // localStorage remains as the synchronous recovery copy.
    }
}

async function removeBrowserRecovery(name: string) {
    if (typeof window === "undefined") return;
    const key = recoveryKey(name);
    safeLocalStorageRemove(key);
    try {
        await localforage.removeItem(key);
    } catch {
        // Ignore unavailable IndexedDB.
    }
}

function isPersistedConfigEnvelope(value: string | null): value is string {
    if (!value) return false;
    try {
        const parsed = JSON.parse(value) as { state?: { config?: unknown } };
        return Boolean(parsed && typeof parsed === "object" && parsed.state && typeof parsed.state.config === "object" && parsed.state.config !== null);
    } catch {
        return false;
    }
}

function safeLocalStorageGet(key: string) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Ignore unavailable localStorage.
    }
}

function safeLocalStorageRemove(key: string) {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // Ignore unavailable localStorage.
    }
}
