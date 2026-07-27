import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dialogPath = resolve(
  repoRoot,
  "src/app/canvas/components/canvas-node-seedance2-face-edit-dialog.tsx",
);
const source = readFileSync(dialogPath, "utf8");

assert.match(source, /回退一步/);
assert.match(source, /Ctrl\/Cmd \+ Z/);
assert.match(source, /undoSnapshotRef/);
assert.match(source, /captureUndoSnapshot/);
assert.match(source, /restoreUndoSnapshot/);
assert.match(source, /const key = event\.key\.toLowerCase\(\)/);
assert.match(source, /key !== "x" && key !== "v" && key !== "z"/);
assert.match(source, /consumeEditorShortcutEvent/);
assert.match(source, /event\.stopPropagation\(\);/);
assert.match(source, /event\.stopImmediatePropagation\(\);/);
assert.match(source, /window\.addEventListener\("keydown", handleKeyDown, true\)/);
assert.match(source, /window\.removeEventListener\("keydown", handleKeyDown, true\)/);
assert.doesNotMatch(source, /editorRef\.current\?\.contains\(event\.target as Node\)/);
assert.match(source, /if \(isEditorShortcutTarget\(event\.target\)\) return;/);

console.log("seedance2 face editor undo shortcut tests passed");
