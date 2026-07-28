import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "../node_modules/typescript/lib/typescript.js";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasPath = join(repoRoot, "src/app/canvas/workspace/canvas-client-page.tsx");
const source = readFileSync(canvasPath, "utf8");
const start = source.indexOf("const CANVAS_MEDIA_SOURCE_KEYS");
const end = source.indexOf("type Seedance2AspectRatioSources");
assert.notEqual(start, -1, "canvas media merge helpers should exist");
assert.notEqual(end, -1, "hydrate helper boundary should exist");

function loadRecovery(overrides = {}) {
  const compiled = ts.transpileModule(
    `${source.slice(start, end)}\nmodule.exports = { hydrateCanvasNode, canvasImageRecoverySources, mergeHydratedCanvasMedia, mergeHydratedAssistantMedia, mergeHydratedCanvasHistoryEntry };`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const uploadedSources = [];
  const retainedKeys = [];
  const sandbox = {
    exports: {},
    module: { exports: {} },
    CanvasNodeType: { Image: "image", Video: "video", Audio: "audio" },
    NODE_STATUS_SUCCESS: "success",
    NODE_STATUS_ERROR: "error",
    CANVAS_RESTORE_ITEM_TIMEOUT_MS: 800,
    CANVAS_RECOVERY_SOURCE_TIMEOUT_MS: 10,
    CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS: { retained: true },
    AbortController,
    DOMException,
    window: { setTimeout, clearTimeout },
    resolveMediaUrl: async (_key, fallback) => fallback,
    restoreFallbackUrl: (value) => (String(value).startsWith("blob:") ? "" : String(value)),
    resolveImageUrl: async () => "",
    setStoredImagesRetained: async (keys) => retainedKeys.push(...keys),
    withCanvasRestoreTimeout: async (promise) => promise.catch(() => null),
    extractBackendImageRel: (value) => {
      const marker = "/images/";
      const index = String(value || "").indexOf(marker);
      return index < 0 ? undefined : decodeURIComponent(String(value).slice(index + marker.length).split("?", 1)[0]);
    },
    normalizeCanvasBackendImageSource: (value) => {
      const raw = String(value || "").trim();
      if (!raw || raw.startsWith("blob:")) return raw;
      const index = raw.indexOf("/images/");
      return index >= 0 ? raw.slice(index) : raw;
    },
    uploadImage: async (value, options) => {
      uploadedSources.push({ value, options });
      return {
        url: "blob:recovered-preview",
        storageKey: "image:recovered",
        width: 1280,
        height: 720,
        bytes: 4096,
        mimeType: "image/png",
      };
    },
    imageMetadata: (image, generated = {}) => ({
      content: image.url,
      storageKey: image.storageKey,
      backendUrl: generated.backendUrl,
      backendRel: generated.backendRel,
      status: "success",
      errorDetails: undefined,
      naturalWidth: image.width,
      naturalHeight: image.height,
      bytes: image.bytes,
      mimeType: image.mimeType,
    }),
    ...overrides,
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: "canvas-expired-image-recovery.js" });
  return { ...sandbox.module.exports, uploadedSources, retainedKeys };
}

const expiredNode = {
  id: "character-ref-1",
  type: "image",
  title: "角色参考图",
  position: { x: 0, y: 0 },
  width: 320,
  height: 180,
  metadata: {
    content: "blob:http://127.0.0.1:3001/expired",
    storageKey: "image:expired-local-copy",
    backendUrl: "https://old.example/images/projects/character 1.png?signature=expired",
    backendRel: "projects/character 1.png",
    status: "error",
    errorDetails: "图片已过期，需重新上传",
    storyCharacterId: "character-1",
  },
};

const remoteRecovery = loadRecovery();
const recovered = await remoteRecovery.hydrateCanvasNode(expiredNode);
assert.equal(
  remoteRecovery.uploadedSources[0].value,
  "/images/projects/character%201.png",
  "backendRel must be tried before a stale signed backendUrl",
);
assert.equal(remoteRecovery.uploadedSources[0].options.retained, true, "re-downloaded canvas images must be retained");
assert.equal(recovered.metadata.content, "blob:recovered-preview");
assert.equal(recovered.metadata.storageKey, "image:recovered");
assert.equal(recovered.metadata.status, "success");
assert.equal(recovered.metadata.errorDetails, undefined, "successful recovery must clear the stale error");
assert.equal(recovered.metadata.storyCharacterId, "character-1", "recovery must preserve Story Director image bindings");

let remoteUploadAttempted = false;
const localRecovery = loadRecovery({
  resolveImageUrl: async () => "blob:restored-local",
  uploadImage: async () => {
    remoteUploadAttempted = true;
    throw new Error("must not download when local storage works");
  },
});
const locallyRecovered = await localRecovery.hydrateCanvasNode(expiredNode);
assert.equal(locallyRecovered.metadata.content, "blob:restored-local");
assert.equal(locallyRecovered.metadata.status, "success");
assert.equal(locallyRecovered.metadata.errorDetails, undefined);
assert.equal(remoteUploadAttempted, false);
assert.deepEqual(localRecovery.retainedKeys, ["image:expired-local-copy"]);

const failedRecovery = loadRecovery({
  uploadImage: async () => {
    throw new Error("remote source unavailable");
  },
});
const failed = await failedRecovery.hydrateCanvasNode(expiredNode);
assert.equal(failed.metadata.status, "error");
assert.equal(failed.metadata.content, "");
assert.match(failed.metadata.errorDetails, /本地缓存和远程源均无法恢复/u);


const mergeRecovery = loadRecovery();
const hydratedForMerge = {
  ...expiredNode,
  metadata: {
    ...expiredNode.metadata,
    content: "blob:hydrated-copy",
    storageKey: "image:hydrated-copy",
    status: "success",
    errorDetails: undefined,
    retained: true,
  },
};
const userEditedNode = {
  ...expiredNode,
  title: "user-edited title",
  position: { x: 480, y: 260 },
  metadata: { ...expiredNode.metadata, storyCharacterId: "character-user-edited" },
};
const userReplacement = {
  ...expiredNode,
  id: "replacement-node",
  metadata: { ...expiredNode.metadata, content: "blob:user-replacement" },
};
const userUnretainedNode = {
  ...expiredNode,
  id: "unretained-node",
  metadata: { ...expiredNode.metadata, retained: false },
};
const mergedNodes = mergeRecovery.mergeHydratedCanvasMedia(
  [
    userEditedNode,
    userReplacement,
    { ...expiredNode, id: "new-node" },
    userUnretainedNode,
  ],
  [
    expiredNode,
    { ...expiredNode, id: "replacement-node" },
    { ...expiredNode, id: "unretained-node" },
  ],
  [
    hydratedForMerge,
    { ...hydratedForMerge, id: "replacement-node" },
    { ...hydratedForMerge, id: "unretained-node" },
  ],
);
assert.equal(mergedNodes[0].title, "user-edited title", "hydration must preserve concurrent node edits");
assert.deepEqual(mergedNodes[0].position, { x: 480, y: 260 });
assert.equal(mergedNodes[0].metadata.storyCharacterId, "character-user-edited");
assert.equal(mergedNodes[0].metadata.content, "blob:hydrated-copy");
assert.equal(mergedNodes[0].metadata.storageKey, "image:hydrated-copy");
assert.equal(
  mergedNodes[1].metadata.content,
  "blob:user-replacement",
  "hydration must not overwrite an image replaced by the user",
);
assert.equal(mergedNodes[2].id, "new-node", "nodes added while hydration is pending must survive");
assert.equal(
  mergedNodes[3].metadata.content,
  expiredNode.metadata.content,
  "hydration must not overwrite media after the user changes its retention",
);
assert.equal(mergedNodes[3].metadata.retained, false);

const sourceSessions = [{
  id: "session-1",
  title: "original",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  messages: [{
    id: "message-1",
    role: "assistant",
    mode: "image",
    text: "original text",
    images: [{ id: "image-1", dataUrl: "blob:expired", storageKey: "image:chat", prompt: "p" }],
  }],
}];
const hydratedSessions = structuredClone(sourceSessions);
hydratedSessions[0].messages[0].images[0].dataUrl = "blob:hydrated-chat";
const currentSessions = structuredClone(sourceSessions);
currentSessions[0].title = "user title";
currentSessions[0].messages[0].text = "user edited text";
currentSessions[0].messages.push({ id: "message-2", role: "user", mode: "ask", text: "new message" });
const mergedSessions = mergeRecovery.mergeHydratedAssistantMedia(
  currentSessions,
  sourceSessions,
  hydratedSessions,
);
assert.equal(mergedSessions[0].title, "user title");
assert.equal(mergedSessions[0].messages[0].text, "user edited text");
assert.equal(mergedSessions[0].messages[0].images[0].dataUrl, "blob:hydrated-chat");
assert.equal(mergedSessions[0].messages[1].id, "message-2");

const mergedHistory = mergeRecovery.mergeHydratedCanvasHistoryEntry(
  {
    nodes: [expiredNode, userReplacement],
    connections: [],
    chatSessions: sourceSessions,
    activeChatId: "session-1",
    backgroundMode: "dots",
    showImageInfo: false,
  },
  [expiredNode, { ...expiredNode, id: "replacement-node" }],
  [hydratedForMerge, { ...hydratedForMerge, id: "replacement-node" }],
  sourceSessions,
  hydratedSessions,
);
assert.equal(
  mergedHistory.nodes[0].metadata.content,
  "blob:hydrated-copy",
  "undo history must not reintroduce expired canvas media",
);
assert.equal(
  mergedHistory.nodes[1].metadata.content,
  "blob:user-replacement",
  "undo history must preserve a user-replaced image",
);
assert.equal(
  mergedHistory.chatSessions[0].messages[0].images[0].dataUrl,
  "blob:hydrated-chat",
  "undo history must not reintroduce expired assistant media",
);

let unsafeUploadAttempted = false;
const unsafeRecovery = loadRecovery({
  uploadImage: async () => {
    unsafeUploadAttempted = true;
    throw new Error("unsafe route must not be fetched");
  },
});
for (const backendRel of [
  "../api/config",
  "%2e%2e/api/config",
  "%252e%252e%252fapi%252fconfig",
]) {
  const unsafeResult = await unsafeRecovery.hydrateCanvasNode({
    ...expiredNode,
    metadata: { content: "", backendRel },
  });
  assert.equal(
    unsafeUploadAttempted,
    false,
    `${backendRel} must not escape the /images route`,
  );
  assert.equal(unsafeResult.metadata.status, "error");
}

let timedOutRequestAborted = false;
const timeoutRecovery = loadRecovery({
  uploadImage: async (_source, options) =>
    await new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        timedOutRequestAborted = true;
        reject(options.signal.reason);
      }, { once: true });
    }),
});
await timeoutRecovery.hydrateCanvasNode({
  ...expiredNode,
  metadata: { content: "", backendRel: "projects/slow.png" },
});
assert.equal(timedOutRequestAborted, true, "timed-out recovery downloads must be aborted");

assert.match(
  source,
  /await hydrateCanvasImages\([\s\S]*initialNodes,[\s\S]*mediaRestoreController\.signal/u,
  "project restore must keep durable recovery cancellable when the project changes",
);
assert.match(
  source,
  /setNodes\(\(currentNodes\) =>[\s\S]*mergeHydratedCanvasMedia/u,
  "background hydration must merge media into current canvas state",
);
const restoreBlock = source.slice(source.indexOf("const restoreProjectState"), source.indexOf("if (!projectId)"));
assert.doesNotMatch(
  restoreBlock,
  /setConnections\(restoredConnections\)/u,
  "background hydration must not restore captured connections over user edits",
);
assert.doesNotMatch(
  source,
  /uploadImage\((?:generated|image|frame|payload|piece)\.dataUrl\);/u,
  "new canvas images must not be created as expiring local cache entries",
);

console.log("canvas expired image durable recovery tests passed");
