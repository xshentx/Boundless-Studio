import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = join(
  repoRoot,
  "src/components/api-access-settings-dialog.tsx",
);
const source = readFileSync(settingsPath, "utf8");

const routeRowSource = source.slice(
  source.indexOf("function RouteRow"),
  source.indexOf("function RelayProviderCard"),
);
const relayUpdateSource = source.slice(
  source.indexOf("const updateRelay"),
  source.indexOf("const deleteRelay"),
);
const capabilityUpdateSource = source.slice(
  source.indexOf("const updateCapabilityRoute"),
  source.indexOf("const updateBoardRoute"),
);

assert.match(routeRowSource, /<option value="">默认<\/option>/);
assert.match(routeRowSource, /disabled=\{!route\.providerId\}/);
assert.match(routeRowSource, /使用画布默认模型/);
assert.doesNotMatch(routeRowSource, /\|\| providers\[0\]/);
assert.match(capabilityUpdateSource, /patch\.providerId === ""/);
assert.doesNotMatch(relayUpdateSource, /fillMissingCapabilityRoutes/);

assert.match(
  routeRowSource,
  /className="grid gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-900 sm:grid-cols-\[80px_1fr_1fr\] sm:items-center"/,
  "the existing route-row layout must remain unchanged",
);

console.log("api relay default model routing UI tests passed");
