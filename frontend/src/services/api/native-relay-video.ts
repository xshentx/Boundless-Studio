import { RequestRelayVideo as requestRelayVideoWithNativeClient } from "../../../wailsjs/go/main/App";

import { shouldUseDesktopLoopback } from "@/services/desktop-api-url";

export type NativeRelayVideoRequest = {
  method: "GET" | "POST";
  baseUrl: string;
  apiKey?: string;
  path: string;
  body?: string;
  idempotencyKey?: string;
};

export type NativeRelayVideoResult<T> = {
  ok: boolean;
  status: number;
  data: T;
};

export function shouldUseNativeRelayVideo(protocol = currentProtocol()) {
  if (!shouldUseDesktopLoopback(protocol) || typeof window === "undefined") return false;
  const runtimeWindow = window as typeof window & {
    go?: { main?: { App?: { RequestRelayVideo?: unknown } } };
  };
  return typeof runtimeWindow.go?.main?.App?.RequestRelayVideo === "function";
}

export async function requestNativeRelayVideo<T>(request: NativeRelayVideoRequest): Promise<NativeRelayVideoResult<T>> {
  const response = await requestRelayVideoWithNativeClient(
    request.method,
    request.baseUrl,
    request.apiKey || "",
    request.path,
    request.body || "",
    request.idempotencyKey || "",
  );
  if (response.message) {
    throw new Error(response.message);
  }
  if (!response.status) {
    throw new Error("fetch failed");
  }

  const ok = response.status >= 200 && response.status < 300;
  let data: T;
  try {
    data = JSON.parse(response.body) as T;
  } catch {
    if (ok) {
      throw new Error(`Video relay returned invalid JSON (HTTP ${response.status})`);
    }
    data = { detail: response.body } as T;
  }
  return {
    ok,
    status: response.status,
    data,
  };
}

function currentProtocol() {
  return typeof window === "undefined" ? "" : window.location.protocol;
}
