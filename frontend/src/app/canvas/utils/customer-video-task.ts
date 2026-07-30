export type CustomerVideoTask = {
  task_id?: string;
  id?: string;
  status?: string;
  result?: string;
  message?: string;
  msg?: string;
  detail?: unknown;
  reason?: unknown;
  error_message?: string;
  errorMessage?: string;
  failure_reason?: unknown;
  failure_reason_short?: string;
  postprocess_last_error?: string;
  data?: unknown;
  files?: string[];
  file_urls?: string[];
  watermark_removed?: boolean;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  } | null;
  error?: unknown;
};

const UPSTREAM_ERROR_KEYS = [
  "postprocess_last_error",
  "error_message",
  "errorMessage",
  "failure_reason",
  "reason",
  "upstream_error",
  "upstreamError",
  "cause",
  "error",
  "detail",
  "errors",
  "message",
  "msg",
  "failure_reason_short",
  "data",
  "response",
  "body",
  "task",
  "tasks",
  "result",
  "code",
] as const;

/**
 * Extracts the most actionable provider error from differently shaped upstream
 * responses. A generic top-level "failed" message must not hide a more useful
 * nested detail returned by the video provider.
 */
export function extractUpstreamError(value: unknown) {
  const candidates: string[] = [];
  collectUpstreamErrorCandidates(value, candidates, new WeakSet<object>(), 0);
  return (
    candidates.find(
      (candidate) =>
        !isGenericUpstreamFailure(candidate) && !isLikelyCustomerVideoUrl(candidate),
    ) ||
    candidates.find((candidate) => !isLikelyCustomerVideoUrl(candidate)) ||
    ""
  );
}

const CUSTOMER_VIDEO_FAILURE_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "canceled",
  "cancelled",
  "expired",
]);

export function isCustomerVideoTaskFailed(task: CustomerVideoTask | undefined) {
  return CUSTOMER_VIDEO_FAILURE_STATUSES.has(
    String(task?.status || "").trim().toLowerCase(),
  );
}

export function customerVideoResponseFailure(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const response = value as { success?: unknown; code?: unknown };
  if (response.success === false) {
    return extractUpstreamError(value) || "Video request failed";
  }
  const code = String(response.code ?? "").trim().toLowerCase();
  const numericCode = /^\d+$/.test(code) ? Number(code) : Number.NaN;
  const isSuccessfulCode =
    ["0", "ok", "success", "succeeded"].includes(code) ||
    (Number.isFinite(numericCode) && numericCode >= 200 && numericCode < 300);
  if (code && !isSuccessfulCode) {
    return extractUpstreamError(value) || code;
  }
  return "";
}

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
  return formatCustomerVideoTaskError(extractUpstreamError(task));
}

function isGenericCustomerVideoFailure(value: unknown) {
  return isGenericUpstreamFailure(String(value || ""));
}

function formatCustomerVideoTaskError(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || isGenericCustomerVideoFailure(raw)) return "视频生成失败";

  const detail = raw.replace(/^protocol_only\s+direct\s+adapter\s+failed:\s*/i, "").trim();
  if (/国家\s*\/\s*地区.*不可用/.test(detail)) {
    return "视频生成失败：当前视频供应商在所在国家/地区不可用，请切换可用的视频供应商或线路。";
  }
  if (/^视频生成失败(?:[：:]|$)/.test(detail)) return detail;
  return `视频生成失败：${detail}`;
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

function collectUpstreamErrorCandidates(
  value: unknown,
  candidates: string[],
  seen: WeakSet<object>,
  depth: number,
) {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return;
    const parsed = parseUpstreamErrorJson(text);
    if (parsed !== undefined) {
      const previousLength = candidates.length;
      collectUpstreamErrorCandidates(parsed, candidates, seen, depth + 1);
      if (candidates.length > previousLength) return;
    }
    candidates.push(text);
    return;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    candidates.push(String(value));
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectUpstreamErrorCandidates(item, candidates, seen, depth + 1),
    );
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of UPSTREAM_ERROR_KEYS) {
    if (!(key in record)) continue;
    collectUpstreamErrorCandidates(record[key], candidates, seen, depth + 1);
  }
}

function parseUpstreamErrorJson(value: string) {
  if (!/^[\[{]/.test(value)) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isGenericUpstreamFailure(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return /^(?:生成失败|视频生成失败|请求失败|任务失败|视频任务失败|failed|failure|error|generation failed|video generation failed|request failed|task failed|unknown error|internal server error)[.!。！]?$/.test(
    normalized,
  );
}

function isLikelyCustomerVideoUrl(value: string) {
  const raw = value.trim();
  return (
    /^(?:https?:|blob:|asset:\/\/)/i.test(raw) ||
    /^\/(?!\/)/.test(raw) ||
    /\.(?:mp4|mov|webm|m3u8)(?:\?|#|$)/i.test(raw)
  );
}
