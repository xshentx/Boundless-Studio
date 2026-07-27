import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasRoot = join(
  repoRoot,
  "src/app/canvas",
);
const panelSource = readFileSync(
  join(canvasRoot, "components/canvas-story-director-panel.tsx"),
  "utf8",
);
const workspaceSource = readFileSync(
  join(canvasRoot, "workspace/canvas-client-page.tsx"),
  "utf8",
);
const typesSource = readFileSync(join(canvasRoot, "types.ts"), "utf8");

for (const quickModeControl of [
  "一键全流程",
  "分析故事",
  "补齐缺失角色图",
  "生成分镜图",
  "角色图配置节点",
  "分镜图配置节点",
]) {
  assert.match(
    panelSource,
    new RegExp(quickModeControl),
    `the 1.001 quick-mode UI should keep ${quickModeControl}`,
  );
}

assert.doesNotMatch(
  panelSource,
  /\bSegmented\b|storyGenerationMode|storyStagedDraft|StagedWorkflowSection|onCreateStagedDraft|onRunStage|onUpdateStage|onConfirmStage|onPauseStage|onCommitVersion|分段式/,
  "the story director panel should expose only the 1.001 quick-mode UI",
);

assert.doesNotMatch(
  workspaceSource,
  /story-director-prompts|story-director-stage-executors|story-director-staged-workflow|story-director-versioning|persistStoryDirectorDraft|createStoryDirectorStagedDraft|runStoryDirectorStage|updateStoryDirectorStage|confirmStoryDirectorStage|pauseStoryDirectorStage|commitStoryDirectorVersion|parseStoryStageOutput|onCreateStagedDraft|onRunStage|onUpdateStage|onConfirmStage|onPauseStage|onCommitVersion/,
  "the canvas workspace should not retain a callable staged story-director execution path",
);

assert.match(
  typesSource,
  /storyGenerationMode\?: StoryGenerationMode/,
  "legacy generation-mode metadata should remain readable",
);
assert.match(
  typesSource,
  /storyStagedDraft\?: StoryStagedDraft/,
  "legacy staged-draft metadata should remain readable without being rendered or executed",
);

assert.match(
  workspaceSource,
  /const baseX = current\.position\.x - imageSpec\.width - 140;/,
  "generated character images should start to the left of the story director",
);
assert.match(
  workspaceSource,
  /const baseY = current\.position\.y;/,
  "the first generated character image should align with the story director top edge",
);
assert.match(
  workspaceSource,
  /position:\s*\{\s*x: baseX,\s*y: baseY \+ index \* \(imageSpec\.height \+ 72\),\s*\}/,
  "generated character images should form one vertical column from top to bottom",
);
assert.doesNotMatch(
  workspaceSource,
  /x: baseX \+ \(index % 3\)/,
  "generated character images should not use the previous three-column layout",
);

console.log("story director quick-mode UI contract tests passed");
