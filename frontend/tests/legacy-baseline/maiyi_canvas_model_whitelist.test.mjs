import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const tapnowSource = readFileSync(
  join(repoRoot, "public/maiyi-canvas/index.html"),
  "utf8",
);
const bridgeSource = readFileSync(
  join(repoRoot, "public/maiyi-canvas/chatgpt2api-bridge.js"),
  "utf8",
);

assert.match(
  tapnowSource,
  /Sv=\[\{id:"gpt-5\.5",provider:"openai",type:"Chat"\},\{id:"gpt-5\.6",provider:"openai",type:"Chat"\},\{id:"gpt-5\.6-luna",provider:"openai",type:"Chat"\},\{id:"gpt-5\.6-sol",provider:"openai",type:"Chat"\},\{id:"gpt-5\.6-terra",provider:"openai",type:"Chat"\},\{id:"gemini-3\.5-flash",provider:"google",type:"Chat"\},\{id:"gemini-3\.1-pro",provider:"google",type:"Chat"\}/,
  "Tapnow Studio should ship the 12.11 chat whitelist models",
);

assert.doesNotMatch(
  tapnowSource,
  /Sv=\[[\s\S]*gpt-5\.2/,
  "Tapnow Studio chat whitelist should not include GPT-5.2 variants",
);

assert.doesNotMatch(
  tapnowSource,
  /Sv=\[[\s\S]*codex-auto-review/,
  "Tapnow Studio chat whitelist should not include codex review models",
);

assert.match(
  bridgeSource,
  /fallbackSessionModels\(\)[\s\S]*(?:DEFAULT_CHAT_MODEL_ID|gpt-5\.5)[\s\S]*gpt-5\.6[\s\S]*gpt-5\.6-luna[\s\S]*gpt-5\.6-sol[\s\S]*gpt-5\.6-terra[\s\S]*gemini-3\.5-flash[\s\S]*gemini-3\.1-pro/,
  "Tapnow Studio chat fallback models should keep the 12.11 GPT 5.5/5.6 and Gemini models",
);
assert.doesNotMatch(
  bridgeSource,
  /fallbackSessionModels\(\)[\s\S]*gpt-5\.1/,
  "Tapnow Studio chat fallback models should not include legacy GPT-5.1",
);
assert.doesNotMatch(
  bridgeSource,
  /fallbackSessionModels\(\)[\s\S]*gpt-4o/,
  "Tapnow Studio chat fallback models should not include GPT-4o",
);

console.log("Tapnow Studio model whitelist test passed");
