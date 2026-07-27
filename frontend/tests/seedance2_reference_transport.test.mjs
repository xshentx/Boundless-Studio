import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hydrateSeedance2CustomerReferencesForTransport,
  seedance2ReferenceTransportSource,
} from "../src/app/canvas/utils/seedance2-reference-transport.mjs";
import {
  resolveSeedance2ReferenceSlots,
  seedance2ResolvedSlotsToCustomerReferences,
} from "../src/app/canvas/utils/seedance2-reference-slots.mjs";

const resolverCalls = [];
const resolved = await hydrateSeedance2CustomerReferencesForTransport(
  [
    { label: "公网图", value: "https://example.test/reference-a.png", nodeId: "remote" },
    { label: "本地缓存图", value: "image:local-cache-key", nodeId: "storage" },
    { label: "临时 blob 图", value: "blob:http://127.0.0.1:3001/transient", nodeId: "blob" },
    { label: "后端相对图", value: "2026/07/17/reference-b.png", nodeId: "backend-rel" },
    { label: "同源图片路径", value: "/images/2026/07/17/reference-c.png", nodeId: "backend-path" },
  ],
  async (source) => {
    resolverCalls.push(source);
    return `data:image/png;base64,${Buffer.from(source.storageKey || source.url || "").toString("base64")}`;
  },
);

assert.deepEqual(
  resolved.map((reference) => reference.value),
  [
    "https://example.test/reference-a.png",
    "data:image/png;base64,aW1hZ2U6bG9jYWwtY2FjaGUta2V5",
    "data:image/png;base64,YmxvYjpodHRwOi8vMTI3LjAuMC4xOjMwMDEvdHJhbnNpZW50",
    "data:image/png;base64,L2ltYWdlcy8yMDI2LzA3LzE3L3JlZmVyZW5jZS1iLnBuZw==",
    "data:image/png;base64,L2ltYWdlcy8yMDI2LzA3LzE3L3JlZmVyZW5jZS1jLnBuZw==",
  ],
  "Seedance2 transport references must convert browser-local and backend-relative image handles into loadable image data before upstream submission",
);

assert.deepEqual(
  resolverCalls,
  [
    { storageKey: "image:local-cache-key" },
    { url: "blob:http://127.0.0.1:3001/transient" },
    { url: "/images/2026/07/17/reference-b.png" },
    { url: "/images/2026/07/17/reference-c.png" },
  ],
  "Only non-loadable local handles should be passed through the image resolver",
);

assert.equal(seedance2ReferenceTransportSource("data:image/png;base64,abc"), null);
assert.equal(seedance2ReferenceTransportSource("https://example.test/a.png"), null);
assert.deepEqual(seedance2ReferenceTransportSource("image:abc"), { storageKey: "image:abc" });
assert.deepEqual(seedance2ReferenceTransportSource("blob:http://local/a"), { url: "blob:http://local/a" });
assert.deepEqual(seedance2ReferenceTransportSource("images/2026/a.png"), { url: "/images/2026/a.png" });

const placeholder = {
  id: "video-placeholder",
  type: "video",
  metadata: {},
};
const connectedImage = {
  id: "connected-image",
  type: "image",
  title: "Local reference",
  metadata: {
    backendUrl: "http://127.0.0.1:3001/images/2026/07/22/reference.png?token=test",
    storageKey: "image:local-reference",
  },
};
const connectedReferences = seedance2ResolvedSlotsToCustomerReferences(
  resolveSeedance2ReferenceSlots({
    placeholder,
    nodes: [placeholder, connectedImage],
    connections: [{
      id: "connected-reference",
      fromNodeId: connectedImage.id,
      toNodeId: placeholder.id,
      referenceSequence: 1,
    }],
    visibleSlotCount: 1,
  }),
);
const connectedResolverCalls = [];
const hydratedConnectedReferences = await hydrateSeedance2CustomerReferencesForTransport(
  connectedReferences,
  async (source) => {
    connectedResolverCalls.push(source);
    return "data:image/png;base64,bG9jYWwtcmVmZXJlbmNl";
  },
);

assert.deepEqual(
  connectedResolverCalls,
  [{ storageKey: "image:local-reference" }],
  "Connected canvas references must prefer their local storage key over a localhost backend URL",
);
assert.equal(
  hydratedConnectedReferences[0]?.value,
  "data:image/png;base64,bG9jYWwtcmVmZXJlbmNl",
  "Connected canvas references must be materialized before submission to Doubao International",
);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canvasPageSource = readFileSync(
  join(
    repoRoot,
    "src/app/canvas/workspace/canvas-client-page.tsx",
  ),
  "utf8",
);
const seedanceReferencePrepareSource = canvasPageSource.slice(
  canvasPageSource.indexOf("const resolvedSlots = resolveSeedance2ReferenceSlots"),
  canvasPageSource.indexOf("const missingRequiredReferences = findMissingSeedance2RequiredReferences"),
);
assert.match(
  seedanceReferencePrepareSource,
  /references\s*=\s*await hydrateSeedance2CustomerReferencesForTransport\(\s*seedance2ResolvedSlotsToCustomerReferences\(resolvedSlots\),\s*imageToDataUrl\s*,?\s*\)/,
  "Seedance2 workflow must hydrate local reference handles before submitting upstream",
);

console.log("seedance2 reference transport tests passed");
