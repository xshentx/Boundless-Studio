"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { Download, FileUp, LayoutGrid, List, Plus, Settings2, Wrench } from "lucide-react";

import { readZip } from "@/lib/zip";
import { getDesktopSetting, setDesktopSetting } from "@/services/desktop-storage";
import { cleanupExpiredStoredImages } from "@/services/image-storage";
import { openApiSettings } from "@/services/settings-dialog";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "../components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "../components/canvas-project-card";
import type { CanvasExportFile } from "../export-types";
import { useCanvasStore } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";

export type CanvasHomeViewMode = "list" | "grid";

const CANVAS_HOME_VIEW_STORAGE_KEY = "infinite-canvas-home-view";

export default function CanvasPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [viewMode, setViewMode] = useState<CanvasHomeViewMode>("list");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    useEffect(() => {
        const timer = window.setTimeout(() => void cleanupExpiredStoredImages(), 1_000);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        let active = true;
        void getDesktopSetting(CANVAS_HOME_VIEW_STORAGE_KEY).then((savedViewMode) => {
            if (active && (savedViewMode === "grid" || savedViewMode === "list")) setViewMode(savedViewMode);
        });
        return () => { active = false; };
    }, []);

    const changeViewMode = (nextViewMode: CanvasHomeViewMode) => {
        setViewMode(nextViewMode);
        void setDesktopSetting(CANVAS_HOME_VIEW_STORAGE_KEY, nextViewMode);
    };

    const enterProject = (id: string) => {
        router.replace(`/canvas/workspace?id=${encodeURIComponent(id)}`);
    };
    const createAndEnter = () => {
        const id = createProject(`无限画布 ${projects.length + 1}`);
        window.requestAnimationFrame(() => enterProject(id));
    };
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project));
            message.success(`已导入 ${data.projects.length} 个画布`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <section className="h-screen overflow-y-auto bg-black text-stone-100">
            <div className="flex min-h-full w-full flex-col gap-8 px-5 py-8 pl-[88px] sm:px-8 sm:pl-[96px] lg:px-10 lg:pl-[112px]">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
                    <div>
                        <p className="text-xs text-stone-500">画布库</p>
                        <h1 className="mt-3 text-3xl font-semibold">无界创作台</h1>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="flex items-center rounded-md border border-stone-700 bg-stone-900 p-0.5" role="group" aria-label="画布显示方式">
                            <Button
                                type={viewMode === "list" ? "primary" : "text"}
                                size="small"
                                icon={<List className="size-4" />}
                                onClick={() => changeViewMode("list")}
                                aria-label="列表显示"
                                aria-pressed={viewMode === "list"}
                                title="列表显示"
                            >
                                列表
                            </Button>
                            <Button
                                type={viewMode === "grid" ? "primary" : "text"}
                                size="small"
                                icon={<LayoutGrid className="size-4" />}
                                onClick={() => changeViewMode("grid")}
                                aria-label="卡片显示"
                                aria-pressed={viewMode === "grid"}
                                title="卡片显示"
                            >
                                卡片
                            </Button>
                        </div>
                        <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                        <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            导入画布
                        </Button>
                        <Button icon={<Settings2 className="size-4" />} onClick={() => openApiSettings("relay")}>
                            设置
                        </Button>
                        <Link href="/canvas-repair">
                            <Button icon={<Wrench className="size-4" />}>修复加载</Button>
                        </Link>
                        {selectedIds.length ? (
                            <>
                                <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects(projects.filter((project) => selectedIds.includes(project.id)), `无限画布-${selectedIds.length}个项目`)}>
                                    导出选中
                                </Button>
                                <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除全部
                            </Button>
                        ) : null}
                    </div>
                </header>

                {!hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center border-y border-white/10 text-sm text-stone-500">正在加载画布...</section>
                ) : projects.length ? (
                    <div className={viewMode === "list" ? "flex flex-col gap-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"} data-view-mode={viewMode}>
                        {projects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} viewMode={viewMode} />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-white/10 text-center">
                        <h2 className="text-xl font-medium">还没有画布</h2>
                        <p className="mt-3 text-sm text-stone-500">新建一个画布后，就可以独立保存节点、连线和画布外观。</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </section>
    );
}
