import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

globalThis.window = globalThis;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.document = {
  addEventListener() {},
  removeEventListener() {}
};

const { normalizeChronicleModel } = await import("../js/views/FateChronicleView.js");

const viewSource = read("js/views/FateChronicleView.js");
const serviceSource = read("js/services/fate-chronicle-service.js");
const panelSource = read("js/views/AuthoritativeRunPanel.js");
const backendClientSource = read("js/services/backend-client.js");
const gameSource = read("js/game.js");
const indexSource = read("index.html");
const cssSource = read("css/fate-chronicle.css");

[
  "export class FateChronicleView",
  "export function loadFateChronicleStyles",
  "export function normalizeChronicleModel",
  "FateChronicleService.reset();",
  "this.runPanel.clearRun();",
  "result.suppressed",
  "archiveResult.suppressed",
  "authoritative-return-chronicle",
  "renderStateShell",
  "fate-chronicle-state-back",
  "aria-pressed=",
  "claim.carryoverCycle",
  "foundationCycleId"
].forEach(marker => {
  assert.ok(viewSource.includes(marker), `fate chronicle view should pin ${marker}`);
});
assert.ok(!viewSource.includes('fate-chronicle-stylesheet'), 'fate chronicle should not request a second stylesheet after deferred loading');

[
  "requestGeneration",
  "completedMutationEpoch",
  "activeMutationCount",
  "observedGeneration !== requestGeneration",
  "DEFAULT_WEEKLY_ARCHIVE_PROTOCOL_VERSION = \"weekly-archive-v1\"",
  "client.claimWeeklyArchiveFoundation",
  "client.startFateChronicleAttempt"
].forEach(marker => {
  assert.ok(serviceSource.includes(marker), `fate chronicle client service should pin ${marker}`);
});

[
  "fate_chronicle",
  "onFateChronicleProjected",
  "onFateChronicleReturn",
  "返回命途长卷"
].forEach(marker => {
  assert.ok(panelSource.includes(marker), `authoritative run panel should pin ${marker}`);
});

[
  "getFateChronicleCurrent",
  "startFateChronicleAttempt",
  "submitFateChronicleResult",
  "claimFateChronicleReward",
  "getWeeklyArchiveCurrent",
  "claimWeeklyArchiveFoundation",
  "WEEKLY_ARCHIVE_PROTOCOL_VERSION"
].forEach(marker => {
  assert.ok(backendClientSource.includes(marker), `backend client should pin ${marker}`);
});

[
  "ensureFateChronicleViewLoaded()",
  "import('./views/FateChronicleView.js')",
  "showFateChronicle()",
  "showScreen('fate-chronicle-screen')"
].forEach(marker => {
  assert.ok(gameSource.includes(marker), `game shell should pin ${marker}`);
});
assert.ok(!gameSource.includes('import { FateChronicleView }'), 'fate chronicle should not stay in the eager game bundle');

[
  'data-boot-action="open-chronicle"',
  'id="fate-chronicle-screen"',
  "V11"
].forEach(marker => {
  assert.ok(indexSource.includes(marker), `index should pin ${marker}`);
});
assert.ok(!indexSource.includes('href="css/fate-chronicle.css"'), 'fate chronicle stylesheet should load with its deferred view');

[
  ".fate-chronicle-shell",
  ".fate-chronicle-state-nav",
  ".fate-chronicle-chapter-grid",
  ".fate-chronicle-vow-btn",
  "overflow-wrap: anywhere",
  "@media (max-width: 640px)",
  "@media (max-width: 390px)"
].forEach(marker => {
  assert.ok(cssSource.includes(marker), `fate chronicle CSS should pin ${marker}`);
});

const backendShapedState = {
  current: {
    reportVersion: "fate-chronicle-v1-current",
    rotation: {
      meta: {
        rotationId: "fchron-2026-w29",
        startsAt: Date.UTC(2026, 6, 13),
        endsAt: Date.UTC(2026, 6, 20),
        claimEndsAt: Date.UTC(2026, 6, 27)
      },
      progress: {
        chapters: [
          {
            chapterId: "chapter-1",
            chapterIndex: 1,
            title: "照火问心",
            description: "第一章",
            unlocked: true,
            completed: true,
            dualCompleted: false,
            bestResult: { officialScore: 670, grade: "A" },
            oaths: [
              { oathId: "guard", title: "守誓", description: "稳守", encounterCount: 3, completed: true },
              { oathId: "edge", title: "锋誓", description: "前压", encounterCount: 3, completed: false }
            ]
          },
          {
            chapterId: "chapter-2",
            chapterIndex: 2,
            title: "镜命辨真",
            unlocked: true,
            completed: false,
            oaths: [
              { oathId: "guard", title: "守誓", encounterCount: 4, completed: false },
              { oathId: "edge", title: "锋誓", encounterCount: 4, completed: false }
            ]
          },
          {
            chapterId: "chapter-3",
            chapterIndex: 3,
            title: "裂天归卷",
            unlocked: false,
            completed: false,
            oaths: [
              { oathId: "guard", title: "守誓", encounterCount: 5, completed: false },
              { oathId: "edge", title: "锋誓", encounterCount: 5, completed: false }
            ]
          }
        ],
        milestones: [
          {
            milestoneId: "chapter-1-clear",
            title: "照火初卷",
            claimable: true,
            claimed: false,
            reward: { amount: 30 }
          }
        ]
      }
    },
    activeAttempt: {
      attemptId: "fchron-attempt-active",
      chapterId: "chapter-2",
      oathId: "edge",
      runId: "fchron-run-active"
    },
    activeRun: {
      runId: "fchron-run-active",
      mode: "fate_chronicle"
    }
  },
  attempt: {
    attemptId: "fchron-attempt-active",
    chapterId: "chapter-2",
    oathId: "edge",
    runId: "fchron-run-active"
  },
  activeRun: {
    runId: "fchron-run-active",
    mode: "fate_chronicle"
  },
  weeklyArchive: {
    cycle: {
      cycleId: "warchive-2026-w29",
      claimEndsAt: Date.UTC(2026, 6, 27)
    },
    grade: {
      title: "基础归卷",
      proofCount: 2,
      totalProofs: 5
    },
    slots: [
      { slotId: "fate_chronicle", mode: "fate_chronicle", earned: true },
      { slotId: "challenge_ladder", mode: "challenge_ladder", earned: true },
      { slotId: "world_rift", mode: "world_rift", earned: false },
      { slotId: "pvp_live", mode: "pvp_live", earned: false },
      { slotId: "relay_expedition", mode: "relay_expedition", earned: false }
    ],
    claim: {
      amount: 120,
      activeCycle: {
        cycleId: "warchive-2026-w29",
        claimable: false,
        claimed: false
      },
      carryoverCycle: {
        cycleId: "warchive-2026-w28",
        claimable: true,
        claimed: false
      }
    }
  }
};

const model = normalizeChronicleModel(backendShapedState);
assert.equal(model.rotation.rotationId, "fchron-2026-w29");
assert.equal(model.chapters.length, 3);
assert.equal(model.chapters[0].chapterId, "chapter-1");
assert.equal(model.chapters[0].vows[0].vowId, "guard");
assert.equal(model.chapters[0].vows[0].completed, true);
assert.equal(model.chapters[0].bestScore, 670);
assert.equal(model.chapters[1].unlocked, true);
assert.equal(model.chapters[2].unlocked, false);
assert.equal(model.rewardMilestones[0].milestoneId, "chapter-1-clear");
assert.equal(model.activeRunId, "fchron-run-active");
assert.equal(model.credentialCount, 2);
assert.equal(model.vouchers.filter(entry => entry.completed).length, 2);
assert.equal(model.foundationRewardAmount, 120);
assert.equal(model.foundationClaimable, true);
assert.equal(model.foundationCycleId, "warchive-2026-w28");
assert.equal(model.foundationIsCarryover, true);

const explicitlyLocked = structuredClone(backendShapedState);
explicitlyLocked.weeklyArchive.claim.carryoverCycle.claimable = false;
const lockedModel = normalizeChronicleModel(explicitlyLocked);
assert.equal(lockedModel.credentialCount, 2);
assert.equal(
  lockedModel.foundationClaimable,
  false,
  "2/5 evidence must not override the server's explicit claim-window decision"
);

console.log("Fate chronicle UI checks passed.");
