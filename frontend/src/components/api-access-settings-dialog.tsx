"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { App } from "antd";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { ModelSelectControl } from "@/components/model-picker";
import { UpdateSettingsPanel } from "@/components/update-settings-panel";
import { Button } from "@/components/ui/button";
import { fetchRelayModels } from "@/services/api/image";
import { OPEN_API_SETTINGS_EVENT, type ApiSettingsTab } from "@/services/settings-dialog";
import {
    API_BOARD_ROUTE_DEFINITIONS,
    API_CAPABILITIES,
    API_CAPABILITY_LABELS,
    createApiRelayProvider,
    filterModelsByCapability,
    normalizeApiKeyInput,
    normalizeModelList,
    providerModelsForCapability,
    providersForCapability,
    type ApiBoardModelRoute,
    type ApiBoardRouteKey,
    type ApiCapability,
    type ApiCapabilityRoute,
    type ApiRelayProvider,
} from "@/stores/api-relay-config";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";

export function ApiAccessSettingsDialog() {
    const { message } = App.useApp();
    const open = useConfigStore((state) => state.isConfigOpen);
    const setOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [loadingProviderId, setLoadingProviderId] = useState("");
    const [settingsTab, setSettingsTab] = useState<ApiSettingsTab>("relay");
    const requestedSettingsTabRef = useRef<ApiSettingsTab | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const openRequestedSettings = (event: Event) => {
            const requestedTab = event instanceof CustomEvent ? event.detail : null;
            const nextTab: ApiSettingsTab = requestedTab === "routing" || requestedTab === "update" ? requestedTab : "relay";
            requestedSettingsTabRef.current = nextTab;
            setSettingsTab(nextTab);
            setOpen(true);
        };
        window.addEventListener(OPEN_API_SETTINGS_EVENT, openRequestedSettings);
        return () => window.removeEventListener(OPEN_API_SETTINGS_EVENT, openRequestedSettings);
    }, [setOpen]);

    useEffect(() => {
        if (!open) return;
        if (requestedSettingsTabRef.current) {
            setSettingsTab(requestedSettingsTabRef.current);
            requestedSettingsTabRef.current = null;
            return;
        }
        setSettingsTab("relay");
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const appRoot = document.getElementById("root");
        const rootWasInert = appRoot?.inert ?? false;
        window.getSelection()?.removeAllRanges();
        if (appRoot) appRoot.inert = true;

        return () => {
            if (appRoot) appRoot.inert = rootWasInert;
        };
    }, [open]);

    const close = () => {
        setOpen(false);
        clearPromptContinue();
    };

    const updateRelays = (relays: ApiRelayProvider[]) => updateConfig("apiRelays", relays);

    const updateRelay = (id: string, patch: Partial<ApiRelayProvider>) => {
        const nextRelays = config.apiRelays.map((provider) =>
            provider.id === id
                ? {
                      ...provider,
                      ...patch,
                      updatedAt: new Date().toISOString(),
                  }
                : provider,
        );
        updateRelays(nextRelays);
    };

    const addRelay = () => {
        const provider = createApiRelayProvider({
            name: `中转 API ${config.apiRelays.length + 1}`,
            capabilities: ["text", "image", "video"],
        });
        updateRelays([...config.apiRelays, provider]);
    };

    const deleteRelay = (id: string) => {
        updateRelays(config.apiRelays.filter((provider) => provider.id !== id));
        const nextRouting = { ...config.apiRouting };
        for (const capability of API_CAPABILITIES) {
            if (nextRouting[capability].providerId === id) nextRouting[capability] = { source: "relay", providerId: "", model: "" };
        }
        updateConfig("apiRouting", nextRouting);
        const nextBoardRouting = { ...config.apiBoardRouting };
        for (const definition of API_BOARD_ROUTE_DEFINITIONS) {
            if (nextBoardRouting[definition.key].providerId === id) nextBoardRouting[definition.key] = { mode: "inherit", providerId: "", model: "" };
        }
        updateConfig("apiBoardRouting", nextBoardRouting);
    };

    const updateCapabilityRoute = (capability: ApiCapability, patch: Partial<ApiCapabilityRoute>) => {
        const current = config.apiRouting[capability];
        const providerId = patch.providerId ?? current.providerId;
        const provider = config.apiRelays.find((item) => item.id === providerId);
        const models = provider ? providerModelsForCapability(provider, capability) : [];
        const model = patch.providerId !== undefined ? models[0] || "" : patch.model ?? current.model;

        updateConfig("apiRouting", {
            ...config.apiRouting,
            [capability]: { source: "relay", providerId, model },
        });
        if (model) updateConfig(`${capability}Model`, model);
    };

    const updateBoardRoute = (key: ApiBoardRouteKey, patch: Partial<ApiBoardModelRoute>) => {
        const definition = API_BOARD_ROUTE_DEFINITIONS.find((item) => item.key === key);
        if (!definition) return;
        const current = config.apiBoardRouting[key];
        const mode = patch.mode ?? current.mode;
        let providerId = patch.providerId ?? current.providerId;
        let model = patch.model ?? current.model;

        if (mode === "inherit") {
            providerId = "";
            model = "";
        } else {
            const providers = providersForCapability(config.apiRelays, definition.capability, config.apiRelayAdvanced.showDisabledProviders);
            if (patch.mode === "custom" && !providerId) {
                const fallbackProvider = providersForCapability(config.apiRelays, definition.capability)[0] || providers[0];
                providerId = fallbackProvider?.id || "";
                model = fallbackProvider ? providerModelsForCapability(fallbackProvider, definition.capability)[0] || "" : "";
            }
            if (patch.providerId !== undefined) {
                const provider = config.apiRelays.find((item) => item.id === providerId);
                const models = provider ? providerModelsForCapability(provider, definition.capability) : [];
                model = models[0] || "";
            }
        }

        updateConfig("apiBoardRouting", {
            ...config.apiBoardRouting,
            [key]: { mode, providerId, model },
        });
    };

    const pullModels = async (provider: ApiRelayProvider) => {
        if (!provider.baseUrl.trim() || !provider.apiKey.trim()) {
            message.warning("请先填写 Base URL 和 API Key");
            return;
        }
        setLoadingProviderId(provider.id);
        try {
            const normalizedApiKey = normalizeApiKeyInput(provider.apiKey);
            const models = await fetchRelayModels(provider.baseUrl, normalizedApiKey);
            const updatedProvider = {
                ...provider,
                apiKey: normalizedApiKey,
                models,
                textModels: filterModelsByCapability(models, "text"),
                imageModels: filterModelsByCapability(models, "image"),
                videoModels: filterModelsByCapability(models, "video"),
                audioModels: filterModelsByCapability(models, "audio"),
                capabilities: API_CAPABILITIES.filter((capability) => filterModelsByCapability(models, capability).length > 0),
            };
            updateRelay(provider.id, updatedProvider);
            message.success(`已读取 ${models.length} 个模型`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingProviderId("");
        }
    };

    if (!mounted || !open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/45 px-4 py-6"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
            }}
        >
            <div className="relative flex h-[min(760px,calc(100vh-3rem))] w-[min(94vw,880px)] flex-col overflow-hidden rounded-[28px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.28),0_8px_24px_-12px_rgba(15,23,42,0.12)] dark:border-stone-800 dark:bg-stone-950">
                <button type="button" className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-stone-500 transition hover:bg-black/5 hover:text-stone-900 dark:hover:bg-white/10 dark:hover:text-white" onClick={close} aria-label="关闭">
                    <span className="text-lg leading-none">×</span>
                </button>

                <div className="flex min-h-0 flex-1 flex-col text-stone-900 dark:text-stone-100">
                    <div className="inline-flex shrink-0 self-start rounded-xl bg-stone-100 p-1 dark:bg-stone-900" role="tablist" aria-label="API 设置">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={settingsTab === "relay"}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${settingsTab === "relay" ? "bg-white text-stone-950 shadow-sm dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                            onClick={() => setSettingsTab("relay")}
                        >
                            中转设置
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={settingsTab === "routing"}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${settingsTab === "routing" ? "bg-white text-stone-950 shadow-sm dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                            onClick={() => setSettingsTab("routing")}
                        >
                            模型路由设置
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={settingsTab === "update"}
                            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${settingsTab === "update" ? "bg-white text-stone-950 shadow-sm dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                            onClick={() => setSettingsTab("update")}
                        >
                            软件更新
                        </button>
                    </div>

                    <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
                        {settingsTab === "relay" ? (
                            <div className="space-y-5" role="tabpanel">
                                <div>
                                    <div className="text-base font-semibold">中转设置</div>
                                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">配置中转地址和每个中转可用的模型列表。</div>
                                </div>

                                <div className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold">中转地址</div>
                                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">可以添加多个中转，每个中转保存自己的 Base URL / API Key / 模型列表。</div>
                                        </div>
                                        <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={addRelay}>
                                            添加中转
                                        </Button>
                                    </div>
                                    <div className="space-y-3">
                                        {config.apiRelays.length ? (
                                            config.apiRelays.map((provider) => (
                                                <RelayProviderCard key={provider.id} provider={provider} loading={loadingProviderId === provider.id} onChange={(patch) => updateRelay(provider.id, patch)} onDelete={() => deleteRelay(provider.id)} onPullModels={() => void pullModels(provider)} />
                                            ))
                                        ) : (
                                            <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">还没有中转地址，点击“添加中转”开始配置。</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : settingsTab === "routing" ? (
                            <div className="space-y-5" role="tabpanel">
                                <div>
                                    <div className="text-base font-semibold">模型路由设置</div>
                                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">按模型类型配置默认路由、板块模型路由和高级选项。</div>
                                </div>

                                <div className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                                    <div className="mb-3">
                                        <div className="text-sm font-semibold">模型路由</div>
                                        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">文本、图片、视频、音频分别选择默认中转和模型。</div>
                                    </div>
                                    <div className="grid gap-3">
                                        {API_CAPABILITIES.map((capability) => (
                                            <RouteRow key={capability} capability={capability} config={config} onRouteChange={updateCapabilityRoute} />
                                        ))}
                                    </div>
                                </div>

                                <details className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                                    <summary className="cursor-pointer select-none text-sm font-semibold">
                                        板块模型路由（可选）
                                        <span className="ml-2 text-xs font-normal text-stone-500 dark:text-stone-400">默认继承上面的文本/图片/视频路由</span>
                                    </summary>
                                    <div className="mt-3 grid gap-3">
                                        {API_BOARD_ROUTE_DEFINITIONS.map((definition) => (
                                            <BoardRouteRow key={definition.key} definition={definition} config={config} onRouteChange={updateBoardRoute} />
                                        ))}
                                    </div>
                                </details>

                                <details className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                                    <summary className="cursor-pointer select-none text-sm font-semibold">高级</summary>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <label className="flex items-center gap-2 text-sm">
                                            <input type="checkbox" checked={config.apiRelayAdvanced.showDisabledProviders} onChange={(event) => updateConfig("apiRelayAdvanced", { ...config.apiRelayAdvanced, showDisabledProviders: event.target.checked })} />
                                            路由下拉显示停用中转
                                        </label>
                                    </div>
                                    <div className="mt-3 grid gap-1.5">
                                        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">默认超时毫秒</span>
                                        <input className={inputClass} value={String(config.apiRelayAdvanced.defaultTimeoutMs)} onChange={(event) => updateConfig("apiRelayAdvanced", { ...config.apiRelayAdvanced, defaultTimeoutMs: Number(event.target.value) || 360_000 })} />
                                    </div>
                                </details>
                            </div>
                        ) : (
                            <UpdateSettingsPanel />
                        )}
                    </div>
                    <div className="mt-5 flex shrink-0 justify-end gap-2">
                        <Button type="button" className="h-10 rounded-xl px-5" onClick={close}>
                            完成
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="grid gap-1.5">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
            {children}
        </label>
    );
}

function BoardRouteRow({
    definition,
    config,
    onRouteChange,
}: {
    definition: (typeof API_BOARD_ROUTE_DEFINITIONS)[number];
    config: AiConfig;
    onRouteChange: (key: ApiBoardRouteKey, patch: Partial<ApiBoardModelRoute>) => void;
}) {
    const route = config.apiBoardRouting[definition.key];
    const providers = providersForCapability(config.apiRelays, definition.capability, config.apiRelayAdvanced.showDisabledProviders);
    const provider = providers.find((item) => item.id === route.providerId) || config.apiRelays.find((item) => item.id === route.providerId);
    const models = provider ? providerModelsForCapability(provider, definition.capability) : [];
    const isCustom = route.mode === "custom";
    const capabilityLabel = API_CAPABILITY_LABELS[definition.capability];

    return (
        <div className="grid gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-900 sm:grid-cols-[120px_74px_118px_1fr_1fr] sm:items-center">
            <div>
                <div className="text-sm font-semibold">{definition.label}</div>
                <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">{definition.key}</div>
            </div>
            <div className="inline-flex h-8 items-center justify-center rounded-lg bg-white px-2 text-xs text-stone-600 dark:bg-stone-950 dark:text-stone-300">{capabilityLabel}</div>
            <select className={inputClass} value={route.mode} onChange={(event) => onRouteChange(definition.key, { mode: event.target.value === "custom" ? "custom" : "inherit" })}>
                <option value="inherit">继承全局</option>
                <option value="custom">单独指定</option>
            </select>
            <select className={inputClass} value={route.providerId} disabled={!isCustom} onChange={(event) => onRouteChange(definition.key, { providerId: event.target.value })}>
                <option value="">{isCustom ? "选择中转" : `继承${capabilityLabel}路由`}</option>
                {providers.map((item) => (
                    <option key={item.id} value={item.id}>
                        {item.name}
                        {item.enabled ? "" : "（停用）"}
                    </option>
                ))}
            </select>
            <ModelSelectControl
                models={models}
                value={isCustom ? route.model : ""}
                disabled={!isCustom || !provider}
                placeholder={!isCustom ? "继承全局模型" : provider ? `选择${capabilityLabel}模型` : `请先选择${capabilityLabel}中转`}
                emptyLabel={`暂无已配置${capabilityLabel}模型`}
                triggerClassName={inputClass}
                contentClassName="z-[1400] w-[min(360px,calc(100vw-24px))]"
                onChange={(model) => onRouteChange(definition.key, { model })}
            />
        </div>
    );
}

function RouteRow({ capability, config, onRouteChange }: { capability: ApiCapability; config: AiConfig; onRouteChange: (capability: ApiCapability, patch: Partial<ApiCapabilityRoute>) => void }) {
    const providers = providersForCapability(config.apiRelays, capability, config.apiRelayAdvanced.showDisabledProviders);
    const route = config.apiRouting[capability];
    const provider = route.providerId ? providers.find((item) => item.id === route.providerId) || config.apiRelays.find((item) => item.id === route.providerId) : undefined;
    const models = provider ? providerModelsForCapability(provider, capability) : [];

    return (
        <div className="grid gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-900 sm:grid-cols-[80px_1fr_1fr] sm:items-center">
            <div className="text-sm font-semibold">{API_CAPABILITY_LABELS[capability]}</div>
            <select className={inputClass} value={route.providerId} onChange={(event) => onRouteChange(capability, { source: "relay", providerId: event.target.value })}>
                <option value="">选择中转 API</option>
                {providers.map((item) => (
                    <option key={item.id} value={item.id}>
                        {item.name}
                        {item.enabled ? "" : "（停用）"}
                    </option>
                ))}
            </select>
            <ModelSelectControl
                models={models}
                value={route.model}
                disabled={!provider}
                placeholder={provider ? `选择${API_CAPABILITY_LABELS[capability]}模型` : "请先选择中转 API"}
                emptyLabel={`暂无已配置${API_CAPABILITY_LABELS[capability]}模型`}
                triggerClassName={inputClass}
                contentClassName="z-[1400] w-[min(360px,calc(100vw-24px))]"
                onChange={(model) => onRouteChange(capability, { model })}
            />
        </div>
    );
}

function RelayProviderCard({ provider, loading, onChange, onDelete, onPullModels }: { provider: ApiRelayProvider; loading: boolean; onChange: (patch: Partial<ApiRelayProvider>) => void; onDelete: () => void; onPullModels: () => void }) {
    const updateModels = (value: string) => {
        const models = normalizeModels(value);
        onChange({
            models,
            textModels: filterModelsByCapability(models, "text"),
            imageModels: filterModelsByCapability(models, "image"),
            videoModels: filterModelsByCapability(models, "video"),
            audioModels: filterModelsByCapability(models, "audio"),
        });
    };

    return (
        <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900/60">
            <div className="flex items-center justify-between gap-2">
                <input className={inputClass} value={provider.name} onChange={(event) => onChange({ name: event.target.value })} />
                <label className="flex shrink-0 items-center gap-2 text-xs text-stone-500">
                    <input type="checkbox" checked={provider.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
                    启用
                </label>
                <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={onDelete}>
                    删除
                </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Base URL">
                    <input className={inputClass} value={provider.baseUrl} placeholder="https://your-relay.example.com" onChange={(event) => onChange({ baseUrl: event.target.value })} />
                </Field>
                <Field label="API Key">
                    <input className={inputClass} value={provider.apiKey} type="password" placeholder="sk-..." onChange={(event) => onChange({ apiKey: normalizeApiKeyInput(event.target.value) })} />
                </Field>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
                {API_CAPABILITIES.map((capability) => (
                    <label key={capability} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={provider.capabilities.includes(capability)} onChange={(event) => onChange({ capabilities: event.target.checked ? mergeCapabilities(provider.capabilities, capability) : provider.capabilities.filter((item) => item !== capability) })} />
                        {API_CAPABILITY_LABELS[capability]}
                    </label>
                ))}
            </div>
            <Field label="模型列表">
                <textarea className={`${inputClass} min-h-24 resize-y py-2 leading-5`} value={provider.models.join("\n")} placeholder={"每行一个模型，例如：\ngpt-5.5\ngpt-image-2\nseedance-2.0"} onChange={(event) => updateModels(event.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-stone-500">已配置 {provider.models.length} 个模型</div>
                <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={onPullModels} disabled={loading}>
                    {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    从 /models 读取
                </Button>
            </div>
        </div>
    );
}

function normalizeModels(value: string) {
    return normalizeModelList(value.split(/[\n,，\s]+/));
}

function mergeCapabilities(capabilities: ApiCapability[], capability: ApiCapability) {
    return API_CAPABILITIES.filter((item) => item === capability || capabilities.includes(item));
}

const inputClass = "h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400 dark:border-stone-800 dark:bg-stone-950 dark:focus:border-stone-600";
