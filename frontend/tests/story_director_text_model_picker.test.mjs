import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasCustomStoryDirectorTextModel,
  resolveStoryDirectorTextModel,
  resolveStoryDirectorTextModelPresentation,
} from "../src/app/canvas/utils/story-director-text-model.mjs";

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

const generateCharactersStart = workspaceSource.indexOf("const generateStoryCharacters");
const generateCharactersEnd = workspaceSource.indexOf("const generateStoryShots", generateCharactersStart);
assert.ok(
  generateCharactersStart >= 0 && generateCharactersEnd > generateCharactersStart,
  "story director character image generation function should be extractable",
);
const generateCharactersSource = workspaceSource.slice(generateCharactersStart, generateCharactersEnd);

assert.match(
  typesSource,
  /storyDirectorTextModel\?:\s*string/,
  "CanvasNodeMetadata should persist the story director text model selection",
);
assert.match(
  typesSource,
  /storyDirectorTextModelMode\?:\s*"inherit"\s*\|\s*"custom"/,
  "CanvasNodeMetadata should persist whether story director text model inherits or is custom",
);

assert.match(
  panelSource,
  /<StoryDirectorTextModelSelect[\s\S]*<StatusPill/,
  "story director text model picker should render in the header before the status pill",
);
assert.match(
  panelSource,
  /resolveStoryDirectorTextModelPresentation\(\s*node\.metadata,[\s\S]{0,160}?storyDirectorTextModels,/,
  "story director picker should use the shared runtime presentation resolver",
);
assert.doesNotMatch(
  panelSource,
  /STORY_DIRECTOR_TEXT_MODEL_HIDDEN|宸查殣钘弢hiddenModel/,
  "story director picker source should not retain a hidden-model option path",
);
assert.match(
  panelSource,
  /storyDirectorTextModelMode:\s*"custom"[\s\S]*storyDirectorTextModel:\s*value/,
  "selecting a story director model should persist it to story-specific metadata",
);
assert.match(
  panelSource,
  /storyDirectorTextModelMode:\s*"inherit"[\s\S]*storyDirectorTextModel:\s*""/,
  "selecting inherit should clear the story-specific model without touching metadata.model",
);

assert.match(
  workspaceSource,
  /storyDirectorInheritedTextModel=\{\s*effectiveConfig\.textModel\s*\|\|\s*effectiveConfig\.model\s*\|\|\s*defaultConfig\.textModel\s*\}/,
  "workspace should pass the inherited global text model into the story director panel",
);
assert.match(
  workspaceSource,
  /const storyDirectorTextModel = resolveStoryDirectorTextModel\(\s*node(?:\.metadata)?,/,
  "story analysis should resolve the node story text model before falling back to inherited config",
);
assert.match(
  workspaceSource,
  /from "\.\.\/utils\/story-director-text-model"/,
  "story director requests should import the same shared text-model resolver as the panel",
);
assert.match(
  workspaceSource,
  /textModel:\s*storyDirectorTextModel/,
  "story analysis requests should set config.textModel to the resolved story text model",
);
assert.match(
  workspaceSource,
  /model:\s*storyDirectorTextModel/,
  "story analysis requests should set config.model to the resolved story text model",
);
assert.match(
  workspaceSource,
  /hasCustomStoryDirectorTextModel\(\s*node(?:\.metadata)?,\s*storyDirectorTextModels,?\s*\)/,
  "custom node text model should be validated against the dynamic settings models",
);
assert.match(
  workspaceSource,
  /boardRouteKey:\s*storyDirectorBoardRouteKey/,
  "JSON analysis and repair requests should use the same resolved story director route key",
);
assert.match(
  workspaceSource,
  /customTextProvider[\s\S]{0,900}?providerId:\s*customTextProvider\.id[\s\S]{0,180}?model:\s*storyDirectorTextModel/,
  "a dynamically selected custom model should route through the enabled relay that provides it",
);
assert.match(
  workspaceSource,
  /function supportsStoryDirectorJsonResponseFormat\(model:\s*string\)/,
  "story analysis should explicitly decide whether a selected text model supports OpenAI json_object response_format",
);
assert.match(
  workspaceSource,
  /supportsStoryDirectorJsonResponseFormat\(storyDirectorTextModel\)[\s\S]*responseFormat:\s*"json_object"[\s\S]*undefined/,
  "story analysis should omit responseFormat for Gemini text models to avoid Gemini upstream HTTP 400",
);
assert.doesNotMatch(
  workspaceSource,
  /responseFormat:\s*undefined,\s*[\s\S]{0,240}?disableFileGeneration:\s*true/,
  "Gemini story analysis requests should omit disableFileGeneration because Gemini rejects disable_file_generation",
);
assert.match(
  workspaceSource,
  /return\s+!\s*\/\^gemini[\s\S]*\.test\(model\.trim\(\)\)/,
  "Gemini story-director models should not be sent OpenAI json_object response_format",
);
assert.doesNotMatch(
  generateCharactersSource,
  /storyDirectorTextModel/,
  "story director text model selection should not leak into character image generation",
);

const configuredTextModels = [
  "claude-sonnet-4.5",
  "  gemini-3.1-pro  ",
  "qwen3-max",
  "claude-sonnet-4.5",
  "",
];
const invalidMetadata = {
  storyDirectorTextModelMode: "custom",
  storyDirectorTextModel: "gpt-5.6",
};
const invalidMetadataSnapshot = structuredClone(invalidMetadata);
const invalidPresentation = resolveStoryDirectorTextModelPresentation(
  invalidMetadata,
  "claude-sonnet-4.5",
  configuredTextModels,
);

const inheritValue = "__inherit_story_director_text_model__";
const expectedRuntimeOptions = [
  { value: inheritValue, label: "\u7ee7\u627f\uff1aclaude-sonnet-4.5" },
  { value: "claude-sonnet-4.5", label: "claude-sonnet-4.5" },
  { value: "gemini-3.1-pro", label: "gemini-3.1-pro" },
  { value: "qwen3-max", label: "qwen3-max" },
];

assert.equal(
  invalidPresentation.selectedValue,
  inheritValue,
  "a saved model removed from settings should render as inherit",
);
assert.deepEqual(
  Array.from(invalidPresentation.options, ({ value, label }) => ({ value, label })),
  expectedRuntimeOptions,
  "runtime options should be built only from the dynamically configured text models",
);
assert.equal(
  invalidPresentation.title,
  "\u7ee7\u627f\uff1aclaude-sonnet-4.5",
  "the select title should show the inherited configured model",
);
assert.doesNotMatch(
  JSON.stringify({
    value: invalidPresentation.selectedValue,
    options: invalidPresentation.options,
    title: invalidPresentation.title,
  }),
  /gpt-5\.6|\u5df2\u9690\u85cf/,
  "no runtime option field should reveal a model removed from settings",
);
assert.deepEqual(
  invalidMetadata,
  invalidMetadataSnapshot,
  "rendering a removed saved model should not rewrite historical metadata",
);
assert.equal(
  hasCustomStoryDirectorTextModel(invalidMetadata, configuredTextModels),
  false,
  "a model removed from settings should keep the inherited storyDirector board route",
);
assert.equal(
  hasCustomStoryDirectorTextModel(
    {
      storyDirectorTextModelMode: "custom",
      storyDirectorTextModel: " gemini-3.1-pro ",
    },
    configuredTextModels,
  ),
  true,
  "a configured saved model should use the custom model route",
);

assert.equal(
  resolveStoryDirectorTextModel(
    invalidMetadata,
    "claude-sonnet-4.5",
    configuredTextModels,
  ),
  "claude-sonnet-4.5",
  "requests should inherit the current text model for a removed saved model",
);
assert.equal(
  resolveStoryDirectorTextModel(
    { storyDirectorTextModelMode: "custom", storyDirectorTextModel: "  qwen3-max  " },
    "claude-sonnet-4.5",
    configuredTextModels,
  ),
  "qwen3-max",
  "configured saved models should be trimmed and preserved",
);
assert.equal(
  resolveStoryDirectorTextModel(
    { storyDirectorTextModelMode: "custom", storyDirectorTextModel: 54 },
    "claude-sonnet-4.5",
    configuredTextModels,
  ),
  "claude-sonnet-4.5",
  "non-string saved models should inherit",
);

assert.match(
  workspaceSource,
  /const storyDirectorTextModels = useMemo\(\(\) =>[\s\S]*config\.apiRelays[\s\S]*providerModelsForCapability[\s\S]*config\.textModels/,
  "story director model choices should be derived from relay and text models in settings",
);
assert.match(
  workspaceSource,
  /storyDirectorTextModels=\{storyDirectorTextModels\}/,
  "workspace should pass dynamic configured models into the story director dropdown",
);
assert.match(
  workspaceSource,
  /resolveStoryDirectorTextModel\([\s\S]{0,180}?storyDirectorTextModels,/,
  "story analysis runtime should resolve against the same dynamic model list as the dropdown",
);
assert.doesNotMatch(
  readFileSync(join(canvasRoot, "utils/story-director-text-model.ts"), "utf8"),
  /STORY_DIRECTOR_TEXT_MODEL_OPTIONS|dola-chat/,
  "story director utility should not retain hard-coded model options",
);

console.log("story director text model picker tests passed");
