import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasRoot = join(
  repoRoot,
  "src/app/canvas",
);
const workspaceSource = readFileSync(
  join(canvasRoot, "workspace/canvas-client-page.tsx"),
  "utf8",
);
const typesSource = readFileSync(join(canvasRoot, "types.ts"), "utf8");

function loadStoryDevelopmentFormatter() {
  const start = workspaceSource.indexOf("function buildStoryDevelopmentText");
  const end = workspaceSource.indexOf("function parseStoryAnalysis", start);
  assert.notEqual(start, -1, "buildStoryDevelopmentText should exist");
  assert.ok(end > start, "buildStoryDevelopmentText should appear before parseStoryAnalysis");
  const source = `${workspaceSource.slice(start, end)}\nmodule.exports = { buildStoryDevelopmentText };`;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(outputText, sandbox, { filename: "story-development-formatter.js" });
  return sandbox.module.exports.buildStoryDevelopmentText;
}

const buildStoryDevelopmentText = loadStoryDevelopmentFormatter();
const text = buildStoryDevelopmentText(
  {
    characters: [
      {
        id: "wolf",
        name: "狼",
        importance: "main",
        appearance: "灰狼",
        personality: "凶猛",
        visualPrompt: "灰狼角色设定",
        status: "draft",
      },
      {
        id: "sheep",
        name: "羊",
        importance: "supporting",
        appearance: "白羊",
        personality: "胆小",
        visualPrompt: "白羊角色设定",
        status: "draft",
      },
    ],
    scenes: [],
    shots: [
      {
        id: "shot-1",
        index: 1,
        title: "狼发现羊",
        appearingCharacterIds: ["wolf", "sheep"],
        excludedCharacterIds: [],
        action: "狼从草地边缘靠近羊",
        camera: "中景推镜",
        emotion: "紧张",
        visualContent: "狼和羊在草地上对峙",
        imagePrompt: "草地狼羊分镜图",
        resultNodeIds: [],
        status: "pending",
      },
      {
        id: "shot-2",
        index: 2,
        title: "追逐开始",
        appearingCharacterIds: ["wolf", "sheep"],
        excludedCharacterIds: [],
        action: "狼扑向羊，羊开始逃跑",
        camera: "远景跟拍",
        emotion: "惊慌",
        visualContent: "羊向远处逃跑",
        imagePrompt: "追逐分镜图",
        resultNodeIds: [],
        status: "pending",
      },
    ],
  },
  {
    id: "director-1",
    type: "story_director",
    title: "故事导演",
    metadata: { storyStyle: "电影感写实", storyAspectRatio: "16:9" },
  },
  "狼抓了羊",
);

assert.match(text, /故事内容发展/, "refill should be a story-development brief");
assert.match(text, /【故事总线】/, "refill should include the story spine section");
assert.match(text, /【角色状态发展】/, "refill should include role state progression");
assert.match(text, /【镜头剧情推进】/, "refill should include shot-by-shot plot progression");
assert.match(text, /第1镜：狼发现羊/, "refill should include the first shot title");
assert.match(text, /上一镜承接：开场镜头，无上一镜/, "first shot should explicitly mark no previous shot");
assert.match(text, /下一镜引出：第2镜《追逐开始》/, "shot progression should point to the next shot");

for (const duplicatedLabel of ["画面内容：", "出场角色：", "情绪氛围：", "分镜图片提示词："]) {
  assert.doesNotMatch(text, new RegExp(duplicatedLabel), `refill should not duplicate ${duplicatedLabel}`);
}

assert.match(
  workspaceSource,
  /const storyDevelopmentText = buildStoryDevelopmentText\(analysis, node, storyText\);/,
  "analysis success should build story-development text before metadata patching",
);
assert.match(
  workspaceSource,
  /storyOriginalText:\s*item\.metadata\?\.storyOriginalText\s*\|\|\s*storyText/,
  "analysis success should preserve the original text once",
);
assert.match(
  workspaceSource,
  /storyText:\s*storyDevelopmentText/,
  "analysis success should replace storyText with story-development text",
);
assert.match(
  workspaceSource,
  /content:\s*storyDevelopmentText/,
  "analysis success should replace content with story-development text",
);
assert.match(
  typesSource,
  /storyOriginalText\?:\s*string/,
  "CanvasNodeMetadata should include storyOriginalText for preserving the raw input",
);

console.log("story director story development refill tests passed");
