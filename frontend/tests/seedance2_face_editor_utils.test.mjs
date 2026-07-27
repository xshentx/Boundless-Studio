import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clampEllipseBox,
  createDefaultFaceGridLayer,
  createDefaultFaceSelection,
  createFaceLayerFromSelection,
  createSeedance2FaceEditOriginalBackup,
  createGridLinePlan,
  faceEditorLayerOrder,
  preserveNodeDisplayPatch,
  restoreSeedance2FaceEditOriginalNode,
  resizeEllipseBox,
} from "../src/app/canvas/utils/seedance2-face-editor.mjs";

const imageSize = { width: 1000, height: 800 };
assert.deepEqual(createDefaultFaceSelection(imageSize), { x: 350, y: 200, width: 300, height: 400, rotation: 0 });
assert.deepEqual(createDefaultFaceSelection({ width: 40, height: 30 }), { x: 8, y: 3, width: 24, height: 24, rotation: 0 });
assert.deepEqual(createDefaultFaceSelection({ width: 20, height: 10 }), { x: 0, y: 0, width: 20, height: 10, rotation: 0 });
assert.deepEqual(clampEllipseBox({ x: -20, y: -10, width: 1100, height: 900, rotation: 0 }, imageSize), { x: 0, y: 0, width: 1000, height: 800, rotation: 0 });
assert.deepEqual(resizeEllipseBox({ x: 350, y: 200, width: 300, height: 400, rotation: 0 }, "se", { dx: 100, dy: 80 }, imageSize, false), { x: 350, y: 200, width: 400, height: 480, rotation: 0 });
assert.deepEqual(resizeEllipseBox({ x: 350, y: 200, width: 300, height: 400, rotation: 0 }, "se", { dx: 100, dy: 80 }, imageSize, true), { x: 350, y: 200, width: 400, height: 400, rotation: 0 });
assert.deepEqual(resizeEllipseBox({ x: 100, y: 80, width: 120, height: 90, rotation: 12 }, "w", { dx: 105, dy: 0 }, { width: 300, height: 260 }, false), { x: 196, y: 80, width: 24, height: 90, rotation: 12 });
assert.deepEqual(resizeEllipseBox({ x: 100, y: 80, width: 120, height: 90, rotation: 12 }, "n", { dx: 0, dy: 80 }, { width: 300, height: 260 }, false), { x: 100, y: 146, width: 120, height: 24, rotation: 12 });
assert.deepEqual(resizeEllipseBox({ x: 100, y: 80, width: 120, height: 90, rotation: 12 }, "w", { dx: 200, dy: 0 }, { width: 300, height: 260 }, false), { x: 196, y: 80, width: 24, height: 90, rotation: 12 });
assert.deepEqual(resizeEllipseBox({ x: 100, y: 80, width: 120, height: 90, rotation: 12 }, "n", { dx: 0, dy: 200 }, { width: 300, height: 260 }, false), { x: 100, y: 146, width: 120, height: 24, rotation: 12 });
assert.deepEqual(resizeEllipseBox({ x: 100, y: 80, width: 120, height: 90, rotation: 12 }, "w", { dx: 200, dy: 0 }, { width: 300, height: 260 }, true), { x: 196, y: 80, width: 24, height: 24, rotation: 12 });
assert.deepEqual(resizeEllipseBox({ x: 100, y: 80, width: 120, height: 90, rotation: 12 }, "nw", { dx: 200, dy: 200 }, { width: 300, height: 260 }, true), { x: 196, y: 146, width: 24, height: 24, rotation: 12 });
assert.deepEqual(createFaceLayerFromSelection("face-1", { x: 120, y: 90, width: 240, height: 180, rotation: 0 }), { id: "face-1", kind: "face", sourceSelection: { x: 120, y: 90, width: 240, height: 180, rotation: 0 }, x: 120, y: 90, width: 240, height: 180, rotation: 0, opacity: 1 });
assert.deepEqual(createFaceLayerFromSelection("face-rotated", { x: 120, y: 90, width: 240, height: 180, rotation: -17.5 }), { id: "face-rotated", kind: "face", sourceSelection: { x: 120, y: 90, width: 240, height: 180, rotation: -17.5 }, x: 120, y: 90, width: 240, height: 180, rotation: -17.5, opacity: 1 });
assert.deepEqual(createDefaultFaceGridLayer("grid-1", { x: 120, y: 90, width: 240, height: 180, rotation: 0 }), { id: "grid-1", kind: "grid", x: 120, y: 90, width: 240, height: 180, rotation: 0, color: "#ef4444", opacity: 0.82, spacing: 24, strokeWidth: 2 });
const gridLinePlan = createGridLinePlan({ width: 100, height: 80 }, 25);
assert.deepEqual(gridLinePlan.bounds, { x: 0, y: 0, width: 100, height: 80, rotation: 0 });
assert.equal(gridLinePlan.diagonals.length, 18);
assert.equal(createGridLinePlan({ width: 100, height: 80 }).spacing, 24);
assert.equal(createGridLinePlan({ width: 100, height: 80 }, Number.NaN).spacing, 24);
assert.equal(createGridLinePlan({ width: 100, height: 80 }, Number.POSITIVE_INFINITY).spacing, 24);
assert.equal(createGridLinePlan({ width: 100, height: 80 }, 0).spacing, 24);
assert.equal(createGridLinePlan({ width: 100, height: 80 }, -5).spacing, 24);
assert.equal(createGridLinePlan({ width: 100, height: 80 }, 2).spacing, 4);
assertCreateGridLinePlanTypeChecks();
assert.deepEqual(faceEditorLayerOrder([{ id: "grid-2", kind: "grid" }, { id: "face-1", kind: "face" }, { id: "grid-1", kind: "grid" }]), ["face-1", "grid-2", "grid-1"]);
const originalNode = { id: "node-a", type: "image", title: "原图", position: { x: 12, y: 34 }, width: 320, height: 480, metadata: { content: "old-url", storageKey: "old-key", prompt: "keep prompt", imageSequenceNumber: 7, freeResize: true } };
assert.deepEqual(preserveNodeDisplayPatch(originalNode, { content: "new-url", storageKey: "new-key", naturalWidth: 1000, naturalHeight: 800, bytes: 12345, mimeType: "image/png" }), { ...originalNode, metadata: { content: "new-url", storageKey: "new-key", prompt: "keep prompt", imageSequenceNumber: 7, freeResize: true, naturalWidth: 1000, naturalHeight: 800, bytes: 12345, mimeType: "image/png", status: "success", errorDetails: undefined } });
assert.deepEqual(preserveNodeDisplayPatch(originalNode, { content: "new-url", storageKey: "new-key", prompt: "replace prompt", imageSequenceNumber: 99, freeResize: false, naturalWidth: 1000, naturalHeight: 800, bytes: 12345, mimeType: "image/png" }), { ...originalNode, metadata: { content: "new-url", storageKey: "new-key", prompt: "keep prompt", imageSequenceNumber: 7, freeResize: true, naturalWidth: 1000, naturalHeight: 800, bytes: 12345, mimeType: "image/png", status: "success", errorDetails: undefined } });
const seedanceOriginalNode = {
  id: "node-seedance2-original",
  type: "image",
  title: "Seedance2 source",
  position: { x: 45, y: 67 },
  width: 512,
  height: 640,
  metadata: {
    content: "original-data-url",
    storageKey: "original-storage-key",
    backendUrl: "https://example.test/original.png",
    backendRel: "/uploads/original.png",
    naturalWidth: 1536,
    naturalHeight: 2048,
    bytes: 123456,
    mimeType: "image/png",
    prompt: "keep original prompt",
    imageSequenceNumber: 12,
    freeResize: true,
    status: "error",
    errorDetails: "old error",
  },
};
const seedanceFirstEdit = createSeedance2FaceEditOriginalBackup(seedanceOriginalNode, {
  content: "edited-data-url",
  storageKey: "edited-storage-key",
  backendUrl: "https://example.test/edited.png",
  backendRel: "/uploads/edited.png",
  naturalWidth: 1024,
  naturalHeight: 1024,
  bytes: 78910,
  mimeType: "image/jpeg",
  prompt: "should not replace prompt",
  imageSequenceNumber: 99,
  freeResize: false,
});
assert.deepEqual(seedanceFirstEdit, {
  ...seedanceOriginalNode,
  metadata: {
    ...seedanceOriginalNode.metadata,
    content: "edited-data-url",
    storageKey: "edited-storage-key",
    backendUrl: "https://example.test/edited.png",
    backendRel: "/uploads/edited.png",
    naturalWidth: 1024,
    naturalHeight: 1024,
    bytes: 78910,
    mimeType: "image/jpeg",
    status: "success",
    errorDetails: undefined,
    seedance2FaceEditOriginal: {
      content: "original-data-url",
      storageKey: "original-storage-key",
      backendUrl: "https://example.test/original.png",
      backendRel: "/uploads/original.png",
      naturalWidth: 1536,
      naturalHeight: 2048,
      bytes: 123456,
      mimeType: "image/png",
    },
  },
});
const seedanceSecondEdit = createSeedance2FaceEditOriginalBackup(seedanceFirstEdit, {
  content: "edited-again-data-url",
  storageKey: "edited-again-storage-key",
  backendUrl: "https://example.test/edited-again.png",
  backendRel: "/uploads/edited-again.png",
  naturalWidth: 800,
  naturalHeight: 900,
  bytes: 45678,
  mimeType: "image/webp",
});
assert.deepEqual(seedanceSecondEdit.metadata.seedance2FaceEditOriginal, seedanceFirstEdit.metadata.seedance2FaceEditOriginal);
assert.equal(seedanceSecondEdit.metadata.content, "edited-again-data-url");
assert.equal(seedanceSecondEdit.metadata.storageKey, "edited-again-storage-key");
assert.equal(seedanceSecondEdit.metadata.prompt, "keep original prompt");
assert.equal(seedanceSecondEdit.metadata.imageSequenceNumber, 12);
assert.equal(seedanceSecondEdit.metadata.freeResize, true);
const restoredSeedanceNode = restoreSeedance2FaceEditOriginalNode({
  ...seedanceSecondEdit,
  position: { x: 111, y: 222 },
  width: 333,
  height: 444,
  metadata: {
    ...seedanceSecondEdit.metadata,
    status: "error",
    errorDetails: "restore should clear this",
  },
});
assert.deepEqual(restoredSeedanceNode, {
  ...seedanceSecondEdit,
  position: { x: 111, y: 222 },
  width: 333,
  height: 444,
  metadata: {
    ...seedanceSecondEdit.metadata,
    content: "original-data-url",
    storageKey: "original-storage-key",
    backendUrl: "https://example.test/original.png",
    backendRel: "/uploads/original.png",
    naturalWidth: 1536,
    naturalHeight: 2048,
    bytes: 123456,
    mimeType: "image/png",
    status: "success",
    errorDetails: undefined,
  },
});
const restoredPartialOriginal = restoreSeedance2FaceEditOriginalNode({
  id: "node-partial-original",
  type: "image",
  title: "partial original",
  position: { x: 1, y: 2 },
  width: 300,
  height: 400,
  metadata: {
    content: "edited-content",
    storageKey: "edited-storage-key",
    backendUrl: "https://example.test/edited-stale.png",
    backendRel: "/uploads/edited-stale.png",
    naturalWidth: 900,
    naturalHeight: 1000,
    bytes: 555,
    mimeType: "image/webp",
    prompt: "partial prompt",
    imageSequenceNumber: 21,
    freeResize: false,
    seedance2FaceEditOriginal: {
      content: "original-content-only",
    },
  },
});
assert.equal(restoredPartialOriginal.metadata.content, "original-content-only");
assert.equal(restoredPartialOriginal.metadata.storageKey, undefined);
assert.equal(restoredPartialOriginal.metadata.backendUrl, undefined);
assert.equal(restoredPartialOriginal.metadata.backendRel, undefined);
assert.equal(restoredPartialOriginal.metadata.naturalWidth, undefined);
assert.equal(restoredPartialOriginal.metadata.naturalHeight, undefined);
assert.equal(restoredPartialOriginal.metadata.bytes, undefined);
assert.equal(restoredPartialOriginal.metadata.mimeType, undefined);
assert.equal(restoredPartialOriginal.metadata.prompt, "partial prompt");
assert.equal(restoredPartialOriginal.metadata.imageSequenceNumber, 21);
assert.equal(restoredPartialOriginal.metadata.freeResize, false);
assert.equal(restoredPartialOriginal.metadata.status, "success");
assert.equal(restoredPartialOriginal.metadata.errorDetails, undefined);
const restoredWithResolvedContent = restoreSeedance2FaceEditOriginalNode(seedanceSecondEdit, {
  content: "blob:current-session-original",
});
assert.equal(restoredWithResolvedContent.metadata.content, "blob:current-session-original");
assert.equal(restoredWithResolvedContent.metadata.storageKey, "original-storage-key");
assert.equal(restoreSeedance2FaceEditOriginalNode(originalNode), originalNode);
console.log("seedance2 face editor utility tests passed");

function assertCreateGridLinePlanTypeChecks() {
  const require = createRequire(import.meta.url);
  const ts = require("../node_modules/typescript/lib/typescript.js");
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const virtualFile = path.join(repoRoot, "tests", "__seedance2_face_editor_typecheck__.ts");
  const source = [
    'import { createGridLinePlan } from "../src/app/canvas/utils/seedance2-face-editor";',
    "const plan = createGridLinePlan({ width: 100, height: 80 }, 25);",
    "const defaultPlan = createGridLinePlan({ width: 100, height: 80 });",
    "const spacing: number = plan.spacing;",
    "const defaultSpacing: number = defaultPlan.spacing;",
    "void spacing;",
    "void defaultSpacing;",
  ].join("\n");
  const compilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    jsx: ts.JsxEmit.Preserve,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    allowSyntheticDefaultImports: true,
  };
  const host = ts.createCompilerHost(compilerOptions, true);
  const normalize = (fileName) => path.normalize(fileName).toLowerCase();
  const virtualNormalized = normalize(virtualFile);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => normalize(fileName) === virtualNormalized || originalFileExists(fileName);
  host.readFile = (fileName) => (normalize(fileName) === virtualNormalized ? source : originalReadFile(fileName));
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (normalize(fileName) === virtualNormalized) return ts.createSourceFile(fileName, source, languageVersion, true);
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram([virtualFile], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map((diagnostic) => formatTypeScriptDiagnostic(ts, diagnostic)), []);
}

function formatTypeScriptDiagnostic(ts, diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} - ${message}`;
}
