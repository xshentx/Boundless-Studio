import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dialogSource = readFileSync(join(webRoot, "src/components/api-access-settings-dialog.tsx"), "utf8");
const modelPickerSource = readFileSync(join(webRoot, "src/components/model-picker.tsx"), "utf8");

assert.match(
  dialogSource,
  /if \(!open\) return;[\s\S]*document\.getElementById\("root"\)[\s\S]*const rootWasInert = appRoot\?\.inert \?\? false[\s\S]*window\.getSelection\(\)\?\.removeAllRanges\(\)[\s\S]*appRoot\.inert = true[\s\S]*appRoot\.inert = rootWasInert/u,
  "API 设置弹窗打开时必须清除已有选择，通过 inert 锁定整个背景页面，并在关闭时恢复原状态",
);
assert.match(
  modelPickerSource,
  /model-select-trigger[^"\n]*select-none/u,
  "模型选择触发器必须禁止双击选中文字",
);
assert.match(
  modelPickerSource,
  /<SelectContent[\s\S]*className=\{cn\("[^"\n]*select-none/u,
  "模型选项弹层必须禁止双击选中文字",
);

console.log("API settings model picker selection guard tests passed");
