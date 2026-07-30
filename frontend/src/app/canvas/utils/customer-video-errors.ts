export type CustomerVideoErrorAction = "submit" | "poll";

export type CustomerVideoErrorContext = {
  action: CustomerVideoErrorAction;
  baseUrl?: string;
};

export function formatCustomerVideoRequestError(error: unknown, context: CustomerVideoErrorContext) {
  const message = requestErrorMessage(error);
  const target = formatCustomerVideoTarget(context.baseUrl);
  const actionText = context.action === "poll" ? "查询" : "提交";

  if (isFetchNetworkError(message)) {
    return `视频接口连接失败：${actionText}视频任务时没有连上中转服务。请检查视频中转地址、网络/CORS、本地服务是否启动。${target}`;
  }

  const submitStatus = message.match(/Video task submit failed \((\d+)\)/i);
  if (submitStatus) {
    return `视频任务提交失败：接口返回 ${submitStatus[1]}。请检查视频中转 API Key、模型和权限。${target}`;
  }

  const queryStatus = message.match(/Video task query failed \((\d+)\)/i);
  if (queryStatus) {
    return `视频任务查询失败：接口返回 ${queryStatus[1]}。请检查任务接口路径和视频中转服务。${target}`;
  }

  if (!message) return `视频任务${actionText}失败。${target}`;
  if (/^视频(?:任务|生成|接口)/.test(message)) return message;
  return `视频任务${actionText}失败：${message}`;
}

function requestErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error || "");
}

function isFetchNetworkError(message: string) {
  return /failed to fetch|load failed|networkerror|network error|fetch failed/i.test(message);
}

function formatCustomerVideoTarget(baseUrl?: string) {
  const target = String(baseUrl || "").trim();
  return target ? `当前地址：${target}` : "";
}
