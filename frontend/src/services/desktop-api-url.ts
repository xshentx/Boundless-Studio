export const DESKTOP_LOOPBACK_ORIGIN = "http://127.0.0.1:34116";

export function desktopApiUrl(path: string, protocol = currentProtocol()) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return shouldUseDesktopLoopback(protocol) ? `${DESKTOP_LOOPBACK_ORIGIN}${normalizedPath}` : normalizedPath;
}

export function shouldUseDesktopLoopback(protocol: string) {
    const normalized = String(protocol || "").trim().toLowerCase();
    return normalized === "wails:";
}

function currentProtocol() {
    return typeof window === "undefined" ? "" : window.location.protocol;
}
