import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSeedance2PromptTextModelValues,
  resolveSeedance2PromptTextModel,
} from "../src/app/canvas/utils/seedance2-text-model.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const canvasRoot = join(
  repoRoot,
  "src/app/canvas",
);
const canvasClientSource = readFileSync(
  join(canvasRoot, "workspace/canvas-client-page.tsx"),
  "utf8",
);
const typesSource = readFileSync(join(canvasRoot, "types.ts"), "utf8");

const panelStart = canvasClientSource.indexOf(
  "function Seedance2WorkflowPanel",
);
const panelEnd = canvasClientSource.indexOf(
  "function InfiniteCanvasPage",
  panelStart,
);
assert.ok(
  panelStart >= 0 && panelEnd > panelStart,
  "Seedance2WorkflowPanel source should be extractable",
);
const panelSource = canvasClientSource.slice(panelStart, panelEnd);
const generateStart = canvasClientSource.indexOf(
  "const generateSeedance2VideoFromPlaceholder",
);
const generateEnd = canvasClientSource.indexOf(
  "const handleGenerateNode",
  generateStart,
);
assert.ok(
  generateStart >= 0 && generateEnd > generateStart,
  "Seedance2 video generation handler should be extractable",
);
const generationSource = canvasClientSource.slice(generateStart, generateEnd);

assert.match(
  typesSource,
  /seedancePromptTextModel\?:\s*string/,
  "CanvasNodeMetadata should persist the Seedance2 prompt text model selection",
);
assert.match(
  panelSource,
  /useEffectiveConfig\(\)/,
  "Seedance2 workflow panel should read effective config to keep the default text model",
);
assert.doesNotMatch(
  canvasClientSource,
  /BLUE22_TEXT_MODELS/,
  "Seedance2 local picker must not require a separate uncommitted global model-pool change",
);
assert.match(
  canvasClientSource,
  /selectableModelsByCapability\(effectiveConfig,\s*"text"\)/,
  "Seedance2 text model picker should preserve every configured text model",
);
assert.match(
  panelSource,
  /resolveSeedance2PromptTextModel\(node,\s*effectiveConfig\)/,
  "Seedance2 text model picker should use the shared resolver also used by batch rewrite requests",
);
assert.match(
  panelSource,
  /label="文本模型"/,
  "Seedance2 workflow panel should render a 文本模型 picker",
);
assert.match(
  panelSource,
  /seedancePromptTextModel:\s*value/,
  "Seedance2 text model picker should save selection to workflow metadata only",
);
assert.doesNotMatch(
  generationSource,
  /seedancePromptTextModel/,
  "Seedance2 video generation handler should not read the prompt text model, preserving current generation logic",
);

const modelInput = {
  savedModel: "provider-saved-text-model",
  currentTextModel: "gpt-5.5",
  configuredTextModels: [
    "gpt-5.5",
    "provider-configured-text-model",
    "gpt-image-2",
  ],
  defaultTextModel: "dola-chat",
};
const isTextModel = (model) => model !== "gpt-image-2";

assert.deepEqual(
  buildSeedance2PromptTextModelValues(modelInput, isTextModel),
  ["gpt-5.5", "provider-configured-text-model"],
  "only dynamically configured text models should remain selectable in stable order",
);
assert.equal(
  resolveSeedance2PromptTextModel(modelInput, isTextModel),
  "gpt-5.5",
  "a saved model removed from configuration should fall back to the configured route model",
);
assert.equal(
  resolveSeedance2PromptTextModel(
    { ...modelInput, savedModel: "gpt-image-2" },
    isTextModel,
  ),
  "gpt-5.5",
  "a saved non-text model should fall back to the current effective text model",
);

console.log("seedance2 workflow text model picker tests passed");
