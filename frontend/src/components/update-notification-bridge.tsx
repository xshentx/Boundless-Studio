"use client";

import { useEffect } from "react";
import { App } from "antd";

import { Button } from "@/components/ui/button";
import { loadDesktopUpdateSettings, subscribeDesktopUpdateState, type DesktopUpdateState } from "@/services/desktop-updater";
import { openApiSettings } from "@/services/settings-dialog";
import { useConfigStore } from "@/stores/use-config-store";

const notifiedVersions = new Set<string>();

export function UpdateNotificationBridge() {
    const { notification } = App.useApp();

    useEffect(() => {
        const showAvailableUpdate = (state: DesktopUpdateState) => {
            if (!state.available || state.phase !== "available" || !state.latestVersion || notifiedVersions.has(state.latestVersion)) return;
            notifiedVersions.add(state.latestVersion);
            notification.info({
                key: `boundless-update-${state.latestVersion}`,
                message: `发现新版本 v${state.latestVersion}`,
                description: state.releaseName || "Boundless Studio 有可用更新",
                duration: 0,
                placement: "bottomRight",
                btn: (
                    <Button
                        type="button"
                        className="h-8 rounded-lg px-3 text-xs"
                        onClick={() => {
                            notification.destroy(`boundless-update-${state.latestVersion}`);
                            openApiSettings("update");
                        }}
                    >
                        查看更新
                    </Button>
                ),
            });
        };

        const unsubscribe = subscribeDesktopUpdateState(showAvailableUpdate);
        void loadDesktopUpdateSettings().then(({ state }) => showAvailableUpdate(state)).catch(() => undefined);
        return unsubscribe;
    }, [notification]);

    return null;
}