export type CustomerVideoTask = {
  task_id?: string;
  id?: string;
  status?: string;
  result?: string;
  message?: string;
  failure_reason_short?: string;
  postprocess_last_error?: string;
  files?: string[];
  file_urls?: string[];
  watermark_removed?: boolean;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  } | null;
  error?: string | { message?: string; code?: string } | null;
};

export function customerVideoTaskFileUrls(
  task: CustomerVideoTask | undefined,
  fallbackBaseUrl?: string,
) {
  const candidates = [
    ...stringArray(task?.file_urls),
    ...stringArray(task?.files),
    task?.content?.video_url,
    videoResultUrl(task?.result),
  ];
  const seen = new Set<string>();
  return candidates
    .map((value) => normalizeCustomerVideoFileUrl(value, fallbackBaseUrl))
    .filter((url): url is string => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

export function isCustomerVideoTaskReady(
  task: CustomerVideoTask | undefined,
  fallbackBaseUrl?: string,
): task is CustomerVideoTask {
  return customerVideoTaskFileUrls(task, fallbackBaseUrl).length > 0;
}

export function customerVideoTaskError(task: CustomerVideoTask | undefined) {
  return (
    task?.failure_reason_short ||
    task?.postprocess_last_error ||
    errorMessage(task?.error) ||
    task?.message ||
    task?.result ||
    "视频生成失败"
  );
}

function normalizeCustomerVideoFileUrl(value: unknown, fallbackBaseUrl?: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = raw.startsWith("/") && fallbackBaseUrl
      ? new URL(raw, normalizeFallbackBaseUrl(fallbackBaseUrl))
      : new URL(raw);
    if (parsed.hostname === "0.0.0.0") {
      const fallback = fallbackBaseUrl ? new URL(normalizeFallbackBaseUrl(fallbackBaseUrl)) : null;
      if (fallback) {
        parsed.protocol = fallback.protocol;
        parsed.hostname = fallback.hostname;
        parsed.port = fallback.port;
      }
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function normalizeFallbackBaseUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "") || "http://127.0.0.1:8006";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function videoResultUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|blob:|asset:\/\/)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  if (/\.(mp4|mov|webm|m3u8)(\?|#|$)/i.test(raw)) return raw;
  return "";
}

function errorMessage(value: CustomerVideoTask["error"]) {
  if (typeof value === "string") return value;
  return value?.message || "";
}
