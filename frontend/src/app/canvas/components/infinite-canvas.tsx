"use client";

import React, { useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "../types";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    backgroundMode?: CanvasBackgroundMode;
    zoomOnWheel?: boolean;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function InfiniteCanvas({ containerRef, viewport, backgroundMode = "lines", zoomOnWheel = false, onViewportChange, onCanvasMouseDown, onCanvasDeselect, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
    });
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const pinchState = useRef<{
        startDistance: number;
        startCenterX: number;
        startCenterY: number;
        startViewport: ViewportTransform;
    } | null>(null);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const previousCursorRef = useRef("");
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        scaleRef.current = viewport.k;
        viewportRef.current = viewport;
    }, [viewport]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing || event.keyCode === 229) return;
            if (event.code !== "Space") return;
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")) return;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setIsSpacePressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],[data-canvas-wheel-scroll],textarea,input,select,[contenteditable='true'],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;

        const zoomAtPointer = (deltaY: number) => {
            const delta = -deltaY;
            const factor = Math.pow(1.1, delta / 100);
            const newScale = Math.min(Math.max(viewport.k * factor, 0.05), 5);
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return false;

            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const worldX = (mouseX - viewport.x) / viewport.k;
            const worldY = (mouseY - viewport.y) / viewport.k;

            onViewportChange({
                x: mouseX - worldX * newScale,
                y: mouseY - worldY * newScale,
                k: newScale,
            });
            return true;
        };

        if (event.ctrlKey && !event.metaKey) {
            if (zoomAtPointer(event.deltaY)) return;
        }

        if (event.metaKey) {
            onViewportChange({
                ...viewport,
                y: viewport.y - event.deltaY,
            });
            return;
        }

        if (zoomOnWheel && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
            if (zoomAtPointer(event.deltaY)) return;
        }

        const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        onViewportChange({
            ...viewport,
            x: viewport.x - horizontalDelta,
        });
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");

        if (event.button === 0 && (event.ctrlKey || event.metaKey) && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
            return;
        }

        if (event.button === 1 || (event.button === 0 && (isBackgroundClick || isSpacePressed))) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewport.x,
                initialY: viewport.y,
                hasMoved: false,
            };
            previousCursorRef.current = document.body.style.cursor;
            document.body.style.cursor = "grabbing";
        }
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
            });
        };

        const finishPan = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved) {
                onCanvasDeselect?.();
            }
            panState.current.isPanning = false;
            document.body.style.cursor = previousCursorRef.current;
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", finishPan);
        window.addEventListener("pointercancel", finishPan);
        window.addEventListener("blur", finishPan);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", finishPan);
            window.removeEventListener("pointercancel", finishPan);
            window.removeEventListener("blur", finishPan);
        };
    }, [onCanvasDeselect, onViewportChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventWheelScroll = (event: WheelEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            // Keep wheel gestures inside form controls and embedded editors,
            // including when their scroll position is already at a boundary.
            // The React wheel handler also ignores these targets, so the same
            // gesture can never fall through to canvas zooming.
            if (target?.closest("[data-canvas-wheel-scroll],textarea,input,select,[contenteditable='true']")) return;
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const targetAllowsPageGesture = (target: EventTarget | null) =>
            target instanceof Element && Boolean(target.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown"));

        const touchDistance = (touches: TouchList) => {
            const first = touches[0];
            const second = touches[1];
            if (!first || !second) return 0;
            return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
        };

        const touchCenter = (touches: TouchList) => {
            const first = touches[0];
            const second = touches[1];
            return {
                x: ((first?.clientX || 0) + (second?.clientX || 0)) / 2,
                y: ((first?.clientY || 0) + (second?.clientY || 0)) / 2,
            };
        };

        const scheduleViewportChange = (next: ViewportTransform) => {
            nextViewportRef.current = next;
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
            });
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (targetAllowsPageGesture(event.target)) return;
            if (event.touches.length !== 2) return;
            const rect = container.getBoundingClientRect();
            const distance = touchDistance(event.touches);
            if (!distance) return;
            event.preventDefault();
            panState.current.isPanning = false;
            document.body.style.cursor = previousCursorRef.current;
            const center = touchCenter(event.touches);
            pinchState.current = {
                startDistance: distance,
                startCenterX: center.x - rect.left,
                startCenterY: center.y - rect.top,
                startViewport: viewportRef.current,
            };
        };

        const handleTouchMove = (event: TouchEvent) => {
            const pinch = pinchState.current;
            if (!pinch || event.touches.length !== 2) return;
            const distance = touchDistance(event.touches);
            if (!distance) return;
            const rect = container.getBoundingClientRect();
            const center = touchCenter(event.touches);
            const centerX = center.x - rect.left;
            const centerY = center.y - rect.top;
            const nextScale = Math.min(Math.max(pinch.startViewport.k * (distance / pinch.startDistance), 0.05), 5);
            const worldX = (pinch.startCenterX - pinch.startViewport.x) / pinch.startViewport.k;
            const worldY = (pinch.startCenterY - pinch.startViewport.y) / pinch.startViewport.k;
            event.preventDefault();
            scheduleViewportChange({
                x: centerX - worldX * nextScale,
                y: centerY - worldY * nextScale,
                k: nextScale,
            });
        };

        const handleTouchEnd = (event: TouchEvent) => {
            if (event.touches.length < 2) pinchState.current = null;
        };

        container.addEventListener("touchstart", handleTouchStart, { passive: false });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });
        container.addEventListener("touchend", handleTouchEnd, { passive: false });
        container.addEventListener("touchcancel", handleTouchEnd, { passive: false });
        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
            container.removeEventListener("touchcancel", handleTouchEnd);
        };
    }, [containerRef, onViewportChange]);

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full cursor-grab select-none overflow-hidden"
            style={{ background: theme.canvas.background, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} />
            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
