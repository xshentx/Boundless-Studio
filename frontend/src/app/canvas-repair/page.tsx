"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearDesktopCanvasData } from "@/services/desktop-storage";

const CANVAS_KEYS = [
    "infinite-canvas:canvas_store",
    "infinite-canvas:asset_store",
];

const INDEXED_DB_NAMES = [
    "infinite-canvas",
    "localforage",
];

function deleteDatabase(name: string) {
    return new Promise<void>((resolve) => {
        if (typeof indexedDB === "undefined") {
            resolve();
            return;
        }
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

async function clearCanvasStorage() {
    await clearDesktopCanvasData();
    CANVAS_KEYS.forEach((key) => {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
    });
    Object.keys(window.localStorage)
        .filter((key) => key.startsWith("infinite-canvas"))
        .forEach((key) => window.localStorage.removeItem(key));
    Object.keys(window.sessionStorage)
        .filter((key) => key.startsWith("infinite-canvas"))
        .forEach((key) => window.sessionStorage.removeItem(key));

    const dynamicNames = typeof indexedDB !== "undefined" && "databases" in indexedDB
        ? (await indexedDB.databases().catch(() => [])).map((item) => item.name || "").filter((name) => name.includes("infinite-canvas"))
        : [];
    await Promise.all([...new Set([...INDEXED_DB_NAMES, ...dynamicNames])].map(deleteDatabase));
}

export default function CanvasRepairPage() {
    const [state, setState] = useState<"idle" | "running" | "done">("idle");
    const [error, setError] = useState("");
    const targetUrl = useMemo(() => "/canvas", []);

    const handleRepair = async () => {
        setState("running");
        setError("");
        try {
            await clearCanvasStorage();
            setState("done");
        } catch (exc) {
            setState("idle");
            setError(exc instanceof Error ? exc.message : "清理失败，请换浏览器再试");
        }
    };

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
            <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col justify-center">
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="grid size-11 place-items-center rounded-lg bg-slate-950 text-white">
                        {state === "done" ? <CheckCircle2 className="size-5" /> : <Trash2 className="size-5" />}
                    </div>
                    <h1 className="mt-5 text-2xl font-black tracking-tight">修复画布加载</h1>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                        如果画布一直显示页面无法加载，通常是浏览器里保存的画布缓存过大或损坏。这里会清理本机画布缓存和临时素材，不影响账号、图币和服务器图片。
                    </p>
                    {error ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        {state === "done" ? (
                            <Button asChild className="h-10 rounded-md bg-slate-950 px-5 text-white hover:bg-slate-800">
                                <Link href={targetUrl}>重新进入画布</Link>
                            </Button>
                        ) : (
                            <Button className="h-10 rounded-md bg-slate-950 px-5 text-white hover:bg-slate-800" onClick={() => void handleRepair()} disabled={state === "running"}>
                                {state === "running" ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                                清理并修复
                            </Button>
                        )}
                        <Button asChild variant="outline" className="h-10 rounded-md border-slate-300 bg-white px-5 text-slate-800 hover:bg-slate-50">
                            <Link href="/">返回首页</Link>
                        </Button>
                    </div>
                </div>
            </section>
        </main>
    );
}

