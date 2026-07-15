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
  removeEventListener() {},
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
  "foundationCycleId",
  "revealAuthoritativePhase"
].forEach(marker => {
  assert.ok(viewSource.includes(marker), `fate chronicle view should pin ${marker}`);
});

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
  "返回命途长卷",
  "requestPhaseReveal",
  "data-authoritative-phase",
  "tabindex=\"-1\""
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
assert.ok(!gameSource.includes("import { FateChronicleView }"), "fate chronicle should not stay in the eager game bundle");

[
  'data-boot-action="open-chronicle"',
  'id="fate-chronicle-screen"',
  "V11"
].forEach(marker => {
  assert.ok(indexSource.includes(marker), `index should pin ${marker}`);
});
assert.ok(!indexSource.includes('href="css/fate-chronicle.css"'), "fate chronicle stylesheet should load with its deferred view");

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

const legacyV1State = {
  current: {
    rotation: {
      meta: {
        rotationId: "fchron-v1-current",
        startsAt: Date.UTC(2026, 6, 13),
        endsAt: Date.UTC(2026, 6, 20),
        claimEndsAt: Date.UTC(2026, 6, 27),
      },
      progress: {
        chapters: [
          {
            chapterId: "chapter-1",
            chapterIndex: 1,
            title: "照火问心",
            unlocked: true,
            completed: true,
            dualCompleted: false,
            oathCount: 2,
            allOathsCompleted: false,
            allOathsCompletedAt: 0,
            bestResult: { officialScore: 670, grade: "A" },
            oaths: [
              { oathId: "guard", title: "守誓", description: "稳守", encounterCount: 3, completed: true },
              { oathId: "edge", title: "锋誓", description: "前压", encounterCount: 3, completed: false },
            ],
          },
          {
            chapterId: "chapter-2",
            chapterIndex: 2,
            title: "镜命辨真",
            unlocked: true,
            completed: false,
            dualCompleted: false,
            oathCount: 2,
            allOathsCompleted: false,
            allOathsCompletedAt: 0,
            oaths: [
              { oathId: "guard", title: "守誓", encounterCount: 4, completed: false },
              { oathId: "edge", title: "锋誓", encounterCount: 4, completed: false },
            ],
          },
          {
            chapterId: "chapter-3",
            chapterIndex: 3,
            title: "裂天归卷",
            unlocked: false,
            completed: false,
            dualCompleted: false,
            oathCount: 2,
            allOathsCompleted: false,
            allOathsCompletedAt: 0,
            oaths: [
              { oathId: "guard", title: "守誓", encounterCount: 5, completed: false },
              { oathId: "edge", title: "锋誓", encounterCount: 5, completed: false },
            ],
          },
        ],
        milestones: [
          {
            milestoneId: "chapter-1-dual",
            title: "照火全誓",
            claimable: false,
            claimed: false,
            reward: { amount: 20 },
          },
        ],
      },
    },
    activeAttempt: {
      attemptId: "fchron-attempt-v1-active",
      chapterId: "chapter-1",
      oathId: "guard",
      runId: "fchron-run-v1-active",
    },
    activeRun: {
      runId: "fchron-run-v1-active",
      mode: "fate_chronicle",
    },
  },
  weeklyArchive: {
    cycle: {
      cycleId: "warchive-2026-w29",
      claimEndsAt: Date.UTC(2026, 6, 27),
    },
    grade: {
      title: "基础归卷",
      proofCount: 2,
      totalProofs: 5,
    },
    slots: [
      { slotId: "fate_chronicle", mode: "fate_chronicle", earned: true },
      { slotId: "challenge_ladder", mode: "challenge_ladder", earned: true },
      { slotId: "world_rift", mode: "world_rift", earned: false },
      { slotId: "pvp_live", mode: "pvp_live", earned: false },
      { slotId: "relay_expedition", mode: "relay_expedition", earned: false },
    ],
    claim: {
      amount: 120,
      activeCycle: {
        cycleId: "warchive-2026-w29",
        claimable: false,
        claimed: false,
      },
      carryoverCycle: {
        cycleId: "warchive-2026-w28",
        claimable: true,
        claimed: false,
      },
    },
  },
};

const legacyModel = normalizeChronicleModel(legacyV1State);
assert.equal(legacyModel.rotation.rotationId, "fchron-v1-current");
assert.equal(legacyModel.chapters.length, 3);
assert.deepEqual(legacyModel.chapters.map(chapter => chapter.chapterId), ["chapter-1", "chapter-2", "chapter-3"]);
assert(legacyModel.chapters.every(chapter => chapter.vows.length === 2), "legacy v1 chapters must not render a phantom third oath");
assert.deepEqual(legacyModel.chapters[0].vows.map(vow => vow.vowId), ["guard", "edge"]);
assert.equal(legacyModel.chapters[0].vows.some(vow => vow.vowId === "proof"), false, "legacy v1 chapter-1 must not invent the proof oath");
assert.equal(legacyModel.chapters[0].oathCount, 2, "legacy v1 should preserve the original two-oath count");
assert.equal(legacyModel.chapters[0].allOathsCompleted, false, "legacy v1 should not mark a 1/2 chapter as fully completed");
assert.equal(legacyModel.chapters[0].dualCompleted, false, "legacy v1 dualCompleted alias should stay false until all legacy oaths are complete");
assert.equal(legacyModel.activeRunId, "fchron-run-v1-active");
assert.equal(legacyModel.credentialCount, 2);
assert.equal(legacyModel.foundationRewardAmount, 120);
assert.equal(legacyModel.foundationClaimable, true);
assert.equal(legacyModel.foundationCycleId, "warchive-2026-w28");
assert.equal(legacyModel.foundationIsCarryover, true);

const v2State = {
  current: {
    reportVersion: "fate-chronicle-v2-current",
    rotation: {
      meta: {
        rotationId: "fchron-v2-current",
        catalogVersion: "fate-chronicle-catalog-v2",
        rotationRuleVersion: "fate-chronicle-rotation-v2",
        startsAt: Date.UTC(2026, 6, 20),
        endsAt: Date.UTC(2026, 6, 27),
        claimEndsAt: Date.UTC(2026, 7, 3),
      },
      progress: {
        chapters: [
          {
            chapterId: "chapter-1",
            chapterIndex: 1,
            title: "照火问心",
            unlocked: true,
            completed: true,
            dualCompleted: false,
            oathCount: 3,
            allOathsCompleted: false,
            allOathsCompletedAt: 0,
            bestResult: { officialScore: 702, grade: "A" },
            oaths: [
              { oathId: "guard", title: "守誓", encounterCount: 3, completed: true },
              { oathId: "edge", title: "锋誓", encounterCount: 3, completed: true },
              { oathId: "proof", title: "定稿誓", encounterCount: 3, completed: false },
            ],
          },
          {
            chapterId: "chapter-2",
            chapterIndex: 2,
            title: "镜命辨真",
            unlocked: true,
            completed: true,
            dualCompleted: true,
            oathCount: 3,
            allOathsCompleted: true,
            allOathsCompletedAt: Date.UTC(2026, 6, 22, 9, 0, 0),
            bestResult: { officialScore: 845, grade: "S" },
            oaths: [
              { oathId: "guard", title: "守誓", encounterCount: 4, completed: true },
              { oathId: "edge", title: "锋誓", encounterCount: 4, completed: true },
              { oathId: "audit", title: "审镜誓", encounterCount: 4, completed: true },
            ],
          },
          {
            chapterId: "chapter-3",
            chapterIndex: 3,
            title: "裂天归卷",
            unlocked: true,
            completed: false,
            dualCompleted: false,
            oathCount: 3,
            allOathsCompleted: false,
            allOathsCompletedAt: 0,
            oaths: [
              { oathId: "guard", title: "守誓", encounterCount: 5, completed: false },
              { oathId: "edge", title: "锋誓", encounterCount: 5, completed: false },
              { oathId: "seal", title: "封卷誓", encounterCount: 5, completed: false },
            ],
          },
        ],
        milestones: [
          {
            milestoneId: "chapter-1-dual",
            title: "照火全誓",
            claimable: false,
            claimed: false,
            reward: { amount: 20 },
          },
          {
            milestoneId: "chapter-2-dual",
            title: "镜命全誓",
            claimable: true,
            claimed: false,
            reward: { amount: 25 },
          },
        ],
      },
    },
    activeAttempt: {
      attemptId: "fchron-attempt-v2-active",
      chapterId: "chapter-3",
      oathId: "seal",
      runId: "fchron-run-v2-active",
    },
    activeRun: {
      runId: "fchron-run-v2-active",
      mode: "fate_chronicle",
    },
  },
  weeklyArchive: structuredClone(legacyV1State.weeklyArchive),
};

const v2Model = normalizeChronicleModel(v2State);
assert.equal(v2Model.rotation.rotationId, "fchron-v2-current");
assert.equal(v2Model.chapters.length, 3);
assert(v2Model.chapters.every(chapter => chapter.vows.length === 3), "v2 chapters should render all nine oaths dynamically");
assert.deepEqual(v2Model.chapters[0].vows.map(vow => vow.vowId), ["guard", "edge", "proof"]);
assert.deepEqual(v2Model.chapters[1].vows.map(vow => vow.vowId), ["guard", "edge", "audit"]);
assert.deepEqual(v2Model.chapters[2].vows.map(vow => vow.vowId), ["guard", "edge", "seal"]);
assert(v2Model.chapters.every(chapter => chapter.oathCount === chapter.vows.length), "oathCount should match the rendered oath count");
assert.equal(v2Model.chapters[0].oathCount, 3);
assert.equal(v2Model.chapters[0].allOathsCompleted, false, "v2 2/3 progress must not look fully completed");
assert.equal(v2Model.chapters[0].dualCompleted, false, "dualCompleted compatibility alias must stay false for 2/3 on v2");
assert.equal(v2Model.chapters[0].allOathsCompletedAt, 0, "v2 partial completion must not backfill a full-completion timestamp");
assert.equal(v2Model.chapters[1].allOathsCompleted, true, "v2 3/3 progress must mark the chapter fully completed");
assert.equal(v2Model.chapters[1].dualCompleted, true, "dualCompleted compatibility alias must remain true once all three oaths are done");
assert.equal(v2Model.chapters[1].allOathsCompletedAt, Date.UTC(2026, 6, 22, 9, 0, 0));
assert.equal(v2Model.rewardMilestones.find(entry => entry.milestoneId === "chapter-1-dual")?.claimable, false, "v2 2/3 must not expose the chapter full-oath reward as claimable");
assert.equal(v2Model.rewardMilestones.find(entry => entry.milestoneId === "chapter-2-dual")?.claimable, true, "v2 3/3 should keep the chapter full-oath reward claimable");
assert.equal(v2Model.activeRunId, "fchron-run-v2-active");

console.log("Fate chronicle UI checks passed.");
