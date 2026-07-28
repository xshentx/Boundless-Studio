"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { ApiAccessSettingsDialog } from "@/components/api-access-settings-dialog";
import { UpdateNotificationBridge } from "@/components/update-notification-bridge";
import { getAntThemeConfig } from "@/lib/app-theme";
import { syncAppDataToWebdav } from "@/services/app-sync";
import { cleanupExpiredStoredImages, collectImageStorageKeys, setStoredImagesRetained } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useCanvasStore } from "./stores/use-canvas-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const AUTO_WEBDAV_SYNC_DELAY_MS = 2_500;

export function CanvasProviders({ children }: { children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme);
  const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
  const updateWebdavConfig = useConfigStore((state) => state.updateWebdavConfig);
  const webdav = useConfigStore((state) => state.webdav);
  const canvasHydrated = useCanvasStore((state) => state.hydrated);
  const projects = useCanvasStore((state) => state.projects);
  const assetHydrated = useAssetStore((state) => state.hydrated);
  const assets = useAssetStore((state) => state.assets);
  const dark = theme === "dark";
  const syncTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const lastSyncedFingerprintRef = useRef("");
  const imageCleanupReadyRef = useRef(false);
  const syncFingerprint = useMemo(() => buildSyncFingerprint(projects, assets), [projects, assets]);

  useEffect(() => {
    void loadPublicSettings();
  }, [loadPublicSettings]);

  useEffect(() => {
    if (!canvasHydrated || !assetHydrated) {
      imageCleanupReadyRef.current = false;
      return;
    }
    if (imageCleanupReadyRef.current) return;
    imageCleanupReadyRef.current = true;

    const protectedImageKeys = collectImageStorageKeys({ projects, assets });
    void (async () => {
      // Retain the complete cross-store reference set before deleting any old
      // unretained image. This prevents either persistence store from cleaning
      // media while the other store is still restoring its references.
      await setStoredImagesRetained(protectedImageKeys, true);
      await cleanupExpiredStoredImages(undefined, protectedImageKeys);
    })().catch((error) => console.warn("Canvas image cleanup failed", error));
  }, [assetHydrated, assets, canvasHydrated, projects]);

  useEffect(() => {
    if (!canvasHydrated || !assetHydrated || !webdav.url.trim()) return;
    if (syncInFlightRef.current || syncFingerprint === lastSyncedFingerprintRef.current) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      void (async () => {
        try {
          await syncAppDataToWebdav(webdav);
          lastSyncedFingerprintRef.current = buildSyncFingerprint(useCanvasStore.getState().projects, useAssetStore.getState().assets);
          updateWebdavConfig("lastSyncedAt", new Date().toISOString());
        } catch (error) {
          console.warn("Canvas WebDAV auto sync failed", error);
        } finally {
          syncInFlightRef.current = false;
        }
      })();
    }, AUTO_WEBDAV_SYNC_DELAY_MS);
    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [assetHydrated, canvasHydrated, syncFingerprint, updateWebdavConfig, webdav]);

  useEffect(() => {
    const root = document.documentElement;
    const previousDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;

    root.classList.toggle("dark", dark);
    root.style.colorScheme = theme;

    return () => {
      root.classList.toggle("dark", previousDark);
      root.style.colorScheme = previousColorScheme;
    };
  }, [dark, theme]);

  return (
    <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark)}>
      <App>
        <QueryClientProvider client={queryClient}>
          {children}
          <UpdateNotificationBridge />
          <ApiAccessSettingsDialog />
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}

function buildSyncFingerprint(projects: { id: string; updatedAt: string }[], assets: { id: string; updatedAt: string }[]) {
  return [
    "projects",
    projects.length,
    ...projects.map((project) => `${project.id}:${project.updatedAt}`),
    "assets",
    assets.length,
    ...assets.map((asset) => `${asset.id}:${asset.updatedAt}`),
  ].join("|");
}
