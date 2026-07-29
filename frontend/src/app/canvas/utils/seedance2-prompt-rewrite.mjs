export function buildSeedance2BatchRewritePrompt(input) {
  const textShots = input.shots.map(({ sourceImage, ...shot }) => ({
    ...shot,
    hasSourceImage: Boolean(sourceImage),
  }));
  return [
    "你是 Seedance2 视频分镜提示词改写器。请根据故事导演的完整故事与每个分镜的结构化内容、全部上游分镜图片、图片分镜当前提示词和视频工作流模板规则，为每个分镜一对一生成视频提示词。",
    "请先理解每张上游分镜图中的角色、数量、外观、位置、场景、光线和构图，再把静态画面改写为连续的视频动作。",
    "保持上游图片与故事导演的角色、场景、叙事和镜头关系，不得凭空新增角色、道具或剧情。",
    "用户在视频工作流中填写的模板是每条视频提示词的最高优先级生成规则；每条 prompt 都必须根据该模板生成并逐项满足，规则冲突时以模板为准。",
    "必须补充动作过程、镜头运动、节奏、情绪和环境动态。不得把模板原文机械复制到结果，也不得返回与模板无关的固定通用提示词。",
    "不得遗漏、合并、调换或新增镜头。",
    "只返回 JSON，不要解释。返回格式：{\"shots\":[{\"shotId\":\"shot-1\",\"shotIndex\":1,\"prompt\":\"改写后的视频提示词\"}]}。",
    "",
    "<完整故事>",
    input.story,
    "</完整故事>",
    "",
    "<全部图片分镜>",
    JSON.stringify(textShots, null, 2),
    "</全部图片分镜>",
    "",
    "<完整改写模板规则>",
    input.template,
    "</完整改写模板规则>",
  ].join("\n");
}

export function buildSeedance2BatchRewriteRequest(input) {
  const model = typeof input.rewriteModel === "string" ? input.rewriteModel.trim() : "";
  if (!model) throw new Error("Seedance2 整批改写缺少文本模型");
  return {
    model,
    contentText: buildSeedance2BatchRewritePrompt(input),
    shots: input.shots.map((shot) => ({ ...shot })),
  };
}

export function parseSeedance2BatchRewriteResponse(raw, expectedShots) {
  const text = String(raw || "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] || text;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Seedance2 整批提示词返回无法解析为 JSON");
  }

  const shots = Array.isArray(parsed?.shots) ? parsed.shots : null;
  if (!shots) throw new Error("Seedance2 整批提示词 JSON 缺少 shots 数组");

  const usedIndexes = new Set();
  return expectedShots.map((expected) => {
    const responseIndex = shots.findIndex((candidate, index) => {
      if (usedIndexes.has(index) || !candidate || typeof candidate !== "object") return false;
      const shotId = typeof candidate.shotId === "string" ? candidate.shotId.trim() : "";
      const shotIndex = Number(candidate.shotIndex);
      return (shotId && shotId === expected.shotId) || shotIndex === expected.shotIndex;
    });
    if (responseIndex < 0) {
      throw new Error(`Seedance2 整批提示词缺少 ${expected.shotId || `第 ${expected.shotIndex} 镜`}`);
    }
    usedIndexes.add(responseIndex);
    const responseShot = shots[responseIndex];
    const prompt = typeof responseShot.prompt === "string" ? responseShot.prompt.trim() : "";
    if (!prompt) {
      throw new Error(`Seedance2 整批提示词中 ${expected.shotId || `第 ${expected.shotIndex} 镜`} 的 prompt 为空`);
    }
    return {
      shotId: expected.shotId,
      shotIndex: expected.shotIndex,
      prompt,
    };
  });
}

export async function rewriteSeedance2BatchPrompts(input, request) {
  const raw = await request(buildSeedance2BatchRewriteRequest(input));
  return parseSeedance2BatchRewriteResponse(raw, input.shots);
}
