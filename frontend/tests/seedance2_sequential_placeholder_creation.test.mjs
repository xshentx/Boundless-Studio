import assert from "node:assert/strict";

import {
  createSeedance2SequentialPlaceholderRun,
} from "../src/app/canvas/utils/seedance2-story-integration.mjs";

const rewrittenShots = [
  { shotId: "shot-3", shotIndex: 3, prompt: "第三镜" },
  { shotId: "shot-1", shotIndex: 1, prompt: "第一镜" },
  { shotId: "shot-2", shotIndex: 2, prompt: "第二镜" },
];

const events = [];
const completed = createSeedance2SequentialPlaceholderRun({
  rewrittenShots,
  appendShot: (shot) => {
    events.push(shot.shotIndex);
    return { shotIndex: shot.shotIndex };
  },
});
assert.deepEqual(completed.createdShotIndexes, [1, 2, 3]);
assert.deepEqual(events, [1, 2, 3]);
assert.equal(completed.nextShotIndex, null);
assert.equal(completed.error, null);

const failedEvents = [];
const failed = createSeedance2SequentialPlaceholderRun({
  rewrittenShots,
  appendShot: (shot) => {
    failedEvents.push(shot.shotIndex);
    if (shot.shotIndex === 2) throw new Error("第2镜创建失败");
    return { shotIndex: shot.shotIndex };
  },
});
assert.deepEqual(failed.createdShotIndexes, [1]);
assert.deepEqual(failedEvents, [1, 2]);
assert.equal(failed.nextShotIndex, 2);
assert.match(failed.error?.message || "", /第2镜/);

const resumed = createSeedance2SequentialPlaceholderRun({
  rewrittenShots,
  startShotIndex: 2,
  appendShot: (shot) => ({ shotIndex: shot.shotIndex }),
});
assert.deepEqual(resumed.createdShotIndexes, [2, 3]);
assert.equal(resumed.nextShotIndex, null);
assert.equal(resumed.error, null);

console.log("seedance2 sequential placeholder creation tests passed");
