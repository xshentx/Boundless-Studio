import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasClientSource = readFileSync(
  join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx"),
  "utf8",
);

const storyIntegrationSource = readFileSync(
  join(repoRoot, "src/app/canvas/utils/seedance2-story-integration.ts"),
  "utf8",
);
const builderStart = storyIntegrationSource.indexOf("export function buildVersionedStoryDirectorSlicePlaceholders");
const builderEnd = storyIntegrationSource.indexOf("function ", builderStart + "export function ".length);
assert.ok(builderStart >= 0 && builderEnd > builderStart, "Story Director placeholder builder should be extractable");
const builderSource = storyIntegrationSource.slice(builderStart, builderEnd);

const panelStart = canvasClientSource.indexOf("function Seedance2WorkflowPanel");
const panelEnd = canvasClientSource.indexOf("function InfiniteCanvasPage", panelStart);
assert.ok(panelStart >= 0 && panelEnd > panelStart, "Seedance2WorkflowPanel source should be extractable");
const panelSource = canvasClientSource.slice(panelStart, panelEnd);

const rebuildStart = canvasClientSource.indexOf("const rebuildSeedance2Placeholders");
const rebuildEnd = canvasClientSource.indexOf("const deleteNodes", rebuildStart);
assert.ok(rebuildStart >= 0 && rebuildEnd > rebuildStart, "Seedance2 placeholder rebuild handler should be extractable");
const rebuildSource = canvasClientSource.slice(rebuildStart, rebuildEnd);

const createStart = canvasClientSource.indexOf("const createSeedance2Workflow");
assert.ok(createStart >= 0 && createStart < rebuildStart, "Seedance2 workflow creator should be extractable");
const createSource = canvasClientSource.slice(createStart, rebuildStart);
const ratioOptionsStart = canvasClientSource.indexOf("const SEEDANCE2_API_RATIO_OPTIONS");
const ratioOptionsEnd = canvasClientSource.indexOf("const SEEDANCE2_SHOT_COUNT_OPTIONS", ratioOptionsStart);
assert.ok(ratioOptionsStart >= 0 && ratioOptionsEnd > ratioOptionsStart, "Seedance2 ratio options should be extractable");
const ratioOptionsSource = canvasClientSource.slice(ratioOptionsStart, ratioOptionsEnd);

assert.doesNotMatch(panelSource, /恢复默认/, "Seedance2 workflow panel should not render the restore default button");
assert.doesNotMatch(panelSource, /参考图顺序（每行一个）/, "Seedance2 workflow panel should not render the reference order textarea label");
assert.doesNotMatch(panelSource, /referenceOrderTextareaRef/, "Seedance2 workflow panel should not keep reference order textarea wiring");
assert.match(panelSource, /视频提示词模板/, "Seedance2 workflow panel should keep the prompt template textarea label");
assert.match(panelSource, /value=\{\s*meta\.seedancePromptTemplate\s*\|\|\s*""\s*\}[\s\S]*onChange=\{\s*\(event\)\s*=>\s*patch\(\s*\{\s*seedancePromptTemplate:\s*event\.target\.value\s*\},?\s*\)\s*\}/, "Seedance2 workflow panel should persist prompt template edits");
assert.match(
  canvasClientSource,
  /const SEEDANCE2_PROMPT_TEMPLATE_TEXTAREA_MIN_HEIGHT\s*=\s*196/,
  "Seedance2 workflow prompt template textarea default minimum height should be 196px (old 96px + 100px)",
);
assert.match(
  panelSource,
  /h-\[220px\][^"\n]*max-h-\[220px\][^"\n]*overflow-y-auto/,
  "Seedance2 workflow prompt template textarea should stay bounded and scroll internally",
);
assert.match(
  panelSource,
  /style=\{\{\s*\.\.\.fieldStyle,\s*minHeight:\s*SEEDANCE2_PROMPT_TEMPLATE_TEXTAREA_MIN_HEIGHT,?\s*\}\}/,
  "Seedance2 workflow prompt template textarea rendered CSS should keep the same 196px minimum height",
);
assert.doesNotMatch(panelSource, />接口</, "Seedance2 workflow panel should not render the interface label card");
assert.doesNotMatch(panelSource, /本地 Seedance2 API/, "Seedance2 workflow panel should not render the local Seedance2 API badge or copy");
assert.doesNotMatch(panelSource, /配置全局默认参数，并批量生成视频占位框；生成时走本地 Seedance2 API。/, "Seedance2 workflow panel should not render the old global-default/API description");
assert.match(panelSource, /label="\u6587\u672c\u6a21\u578b"/u, "Seedance2 workflow panel should keep the text model picker");
assert.match(panelSource, /label="\u89c6\u9891\u6a21\u578b"/u, "Seedance2 workflow panel should keep the video model picker");
assert.match(builderSource, /LOCAL_SEEDANCE2_API_ENDPOINT/, "Story Director placeholder creation should keep the local API endpoint fallback internally");

for (const label of [
  "\u5206\u955c\u6570\u91cf",
  "\u65f6\u957f",
  "\u89c6\u9891\u6a21\u578b",
  "\u6587\u672c\u6a21\u578b",
  "\u89c6\u9891\u753b\u9762\u6bd4\u4f8b",
  "\u6e05\u6670\u5ea6",
]) {
  assert.match(panelSource, new RegExp(`label="${label}"`), `Seedance2 workflow panel should render ${label}`);
}
assert.equal(
  (panelSource.match(/<Seedance2OptionPicker/g) || []).length,
  4,
  "Seedance2 workflow panel should retain four non-model option controls",
);
assert.equal(
  (panelSource.match(/<Seedance2ModelOptionPicker/g) || []).length,
  2,
  "Seedance2 workflow panel should render both dynamic model controls",
);
assert.doesNotMatch(panelSource, /label="\u751f\u6210\u6a21\u5f0f"/u, "Seedance2 workflow panel should not render a workflow-mode picker");
assert.doesNotMatch(panelSource, /label="\u8fde\u7eed\u751f\u6210"/u, "Seedance2 workflow panel should not render a continuous-generation picker");
assert.doesNotMatch(panelSource, /\u6bcf\u955c\u751f\u6210\u6570\u91cf/u, "Seedance2 workflow panel should not render per-shot generation count");
assert.match(panelSource, /\u5206\u955c\u5f0f/u, "Seedance2 workflow panel should show its fixed storyboard mode");
assert.match(panelSource, /seedanceRatioSelection:\s*"manual"/, "manual ratio changes should persist their provenance");
assert.match(builderSource, /resolveSeedance2WorkflowRatio\(/, "Story Director placeholder creation should resolve the effective workflow ratio");
assert.doesNotMatch(ratioOptionsSource, /adaptive/, "ratio picker should not offer an unsupported adaptive value");
assert.match(builderSource, /mode:\s*"slice"/, "Story Director placeholder creation should always use storyboard mode");
assert.match(builderSource, /const generateCount = 1/, "Story Director placeholder creation should create one result per shot");
assert.match(createSource, /mode:\s*"slice"/, "new workflows should be created in storyboard mode");
assert.match(createSource, /duration:\s*"10"/, "new workflows should default to 10 seconds");
assert.match(builderSource, /normalizeSeedance2Duration\(workflowMetadata\.seedanceDuration \|\| workflowMetadata\.seconds\)/, "Story Director placeholder creation should normalize workflow duration with its default fallback");

console.log("seedance2 workflow simplified ui tests passed");
