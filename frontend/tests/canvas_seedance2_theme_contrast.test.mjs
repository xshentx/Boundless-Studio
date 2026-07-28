import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const nodeSource = readFileSync(
  join(repoRoot, "src/app/canvas/components/canvas-node.tsx"),
  "utf8",
);

function functionSource(name) {
  const start = nodeSource.indexOf(`function ${name}`);
  const end = nodeSource.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0 && end > start, `${name} source should be extractable`);
  return nodeSource.slice(start, end);
}

const landscapeCard = functionSource("Seedance2LandscapeVideoPlaceholderCard");
assert.match(landscapeCard, /background: props\.theme\.node\.fill/);
assert.match(landscapeCard, /background: props\.theme\.node\.panel/);
assert.match(landscapeCard, /borderColor: props\.theme\.node\.stroke/);
assert.match(landscapeCard, /color: props\.theme\.node\.text/);
assert.match(landscapeCard, /color: props\.theme\.node\.muted/);
assert.doesNotMatch(landscapeCard, /bg-\[#(?:211f1d|1d1b19)\]|text-\[#fffaf5\]|text-white/);

const landscapeSelect = functionSource("Seedance2LandscapeSelect");
assert.match(landscapeSelect, /background: theme\.node\.panel/);
assert.match(landscapeSelect, /borderColor: theme\.node\.stroke/);
assert.match(landscapeSelect, /color: theme\.node\.text/);
assert.doesNotMatch(landscapeSelect, /bg-\[#1e1c1a\]|text-white|border-white/);

const referencePanel = functionSource("Seedance2LandscapeHtmlReferencePanel");
assert.match(referencePanel, /background: theme\.node\.panel/);
assert.match(referencePanel, /background: theme\.node\.fill/);
assert.match(referencePanel, /color: theme\.node\.text/);
assert.match(referencePanel, /color: theme\.node\.muted/);
assert.doesNotMatch(referencePanel, /bg-\[#(?:1e1c1a|211f1d)\]|text-\[#(?:7b7570|77716c)\]/);

const compactPrompt = functionSource("Seedance2CompactPromptSummary");
assert.match(compactPrompt, /background: theme\.node\.panel/);
assert.match(compactPrompt, /background: theme\.node\.fill/);
assert.match(compactPrompt, /borderColor: theme\.node\.stroke/);
assert.match(compactPrompt, /color: theme\.node\.text/);
assert.match(compactPrompt, /color: theme\.node\.muted/);
assert.doesNotMatch(compactPrompt, /bg-\[#1d1b19\]|text-\[#aaa39e\]|border-white\/10/);

const expandedPrompt = functionSource("Seedance2LandscapeHtmlPromptArea");
assert.match(expandedPrompt, /background: theme\.node\.panel/);
assert.match(expandedPrompt, /borderColor: theme\.node\.stroke/);
assert.match(expandedPrompt, /color: theme\.node\.text/);
assert.match(expandedPrompt, /color: theme\.node\.muted/);
assert.doesNotMatch(expandedPrompt, /bg-\[#1d1b19\]|text-\[#aaa39e\]/);

const portraitCard = functionSource("Seedance2PortraitVideoPlaceholderCard");
assert.match(portraitCard, /background: props\.theme\.node\.fill/);
assert.match(portraitCard, /borderColor: props\.theme\.node\.stroke/);
assert.match(portraitCard, /theme=\{props\.theme\}/);
assert.doesNotMatch(portraitCard, /bg-\[#211f1d\]|text-\[#fffaf5\]|border-\[#403b38\]/);

const portraitPreview = functionSource("Seedance2PortraitPreviewArea");
assert.match(portraitPreview, /\{ node, theme, shot, status, mode \}/);
assert.match(portraitPreview, /background: hasVideo \? undefined : theme\.node\.panel/);
assert.match(portraitPreview, /borderColor: theme\.node\.stroke/);
assert.match(portraitPreview, /color: theme\.node\.text/);
assert.match(portraitPreview, /color: theme\.node\.muted/);
assert.doesNotMatch(portraitPreview, /bg-\[#1c1a18\]|text-white|text-\[#77716c\]|border-\[#494440\]/);

console.log("seedance2 theme contrast tests passed");
