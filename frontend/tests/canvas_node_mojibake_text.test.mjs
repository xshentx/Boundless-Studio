import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasNodePath = join(
  repoRoot,
  "src/app/canvas/components/canvas-node.tsx",
);
const canvasNodeSource = readFileSync(canvasNodePath, "utf8");

const expectedReadableCopy = [
  "生成中",
  "生成失败",
  "重试",
  "未知节点",
  "生图",
  "双击编辑文字",
  "竖版布局",
  "尺寸",
  "默认参考图顺序",
  "打开节点面板可修改参数，并一键创建对应视频占位框。",
  "空音频节点",
  "音频",
  "故事导演",
  "小说分析、角色资产、分镜提示词总控",
  "镜头",
  "风格",
  "文本",
  "已填",
  "待填",
  "连接",
  "角色",
];

for (const copy of expectedReadableCopy) {
  assert.match(canvasNodeSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `canvas-node should contain readable copy: ${copy}`);
}

assert.doesNotMatch(
  canvasNodeSource,
  /鐢熸垚涓|鐢熸垚澶辫触|閲嶈瘯|鏈[\uE000-\uF8FF]?\S*鑺傜偣|鐢熷浘|鍙屽嚮缂栬緫鏂囧瓧|绔栫増甯冨眬|灏哄[\uE000-\uF8FF]|榛樿[\uE000-\uF8FF]?ゅ弬鑰冨浘椤哄簭|鎵撳紑鑺傜偣|绌洪煶棰戣妭鐐|闊抽[\uE000-\uF8FF]|鏁呬簨瀵兼紨|灏忚[\uE000-\uF8FF]?村垎|闀滃ご|椋庢牸|鏂囨湰|宸插\uff5e|寰呭\uff5e|杩炴帴|瑙掕壊/u,
  "canvas-node visible copy should not contain known UTF-8-as-GBK mojibake",
);

assert.doesNotMatch(
  canvasNodeSource,
  /[\uE000-\uF8FF]/u,
  "canvas-node visible copy should not contain private-use replacement characters from mojibake recovery",
);

console.log("canvas node mojibake text tests passed");
