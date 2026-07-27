const IMAGE_QUOTA_UNAVAILABLE_MESSAGE = "系统维护中，请10分钟后再试";
const UPSTREAM_TEXT_RESPONSE_PREFIX = "上游返回了文字回复，未生成图片：";

export function formatCanvasGenerationError(error: unknown, fallback = "生成失败") {
    const message = error instanceof Error ? error.message : String(error || "");
    const trimmed = message.trim();

    if (/no available image quota/i.test(trimmed) || /insufficient_quota/i.test(trimmed)) {
        return IMAGE_QUOTA_UNAVAILABLE_MESSAGE;
    }
    if (trimmed.includes("请求被限流或额度不足") || trimmed.includes("额度不足")) {
        return IMAGE_QUOTA_UNAVAILABLE_MESSAGE;
    }
    if (/network error/i.test(trimmed) || /failed to fetch/i.test(trimmed) || /连接后端失败/.test(trimmed)) {
        return "连接后端失败，请确认服务已启动或稍后重试";
    }
    if (/Request failed with status code 5\d\d/i.test(trimmed)) {
        return "图片服务暂时不可用，请稍后重试";
    }
    if (trimmed.startsWith(UPSTREAM_TEXT_RESPONSE_PREFIX)) {
        const reason = trimmed.slice(UPSTREAM_TEXT_RESPONSE_PREFIX.length).trim();
        return reason ? `上游拒绝生成图片：${reason}` : "上游拒绝生成图片，请修改提示词后重试";
    }
    if (/content policy/i.test(trimmed) || trimmed.includes("内容政策") || trimmed.includes("暴力内容")) {
        return trimmed.startsWith("上游拒绝生成图片：") ? trimmed : `上游拒绝生成图片：${trimmed}`;
    }

    return trimmed || fallback;
}
