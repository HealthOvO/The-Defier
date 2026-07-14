import { AuthService } from "../services/authService.js";
import { BackendClient } from "../services/backend-client.js";
import { createAuthoritativeRunService } from "../services/authoritative-run-service.js";
import { FateChronicleService } from "../services/fate-chronicle-service.js";
import { AuthoritativeRunPanel } from "./AuthoritativeRunPanel.js";
import { buildDataAttributes, escapeHtml } from "../ui/render-safe.js";

export function loadFateChronicleStyles() {
  if (typeof import.meta.env !== "object") return Promise.resolve();
  return import("../../css/fate-chronicle.css");
}

const CHAPTER_BLUEPRINTS = Object.freeze([
  {
    order: 1,
    fallbackId: "chronicle-chapter-1",
    title: "第一章：照火问心",
    summary: "先把稳住节奏与主动抢终结区分开。",
    vows: [
      {
        fallbackId: "chronicle-ember-guard",
        title: "稳健誓约",
        summary: "3 战，较高生命与护盾牌。",
        tone: "guard"
      },
      {
        fallbackId: "chronicle-ember-edge",
        title: "进取誓约",
        summary: "3 战，较低生命与进攻/易伤牌。",
        tone: "edge"
      }
    ]
  },
  {
    order: 2,
    fallbackId: "chronicle-chapter-2",
    title: "第二章：镜命辨真",
    summary: "开始要求你在回复、抽滤和回合预算里做取舍。",
    vows: [
      {
        fallbackId: "chronicle-mirror-guard",
        title: "稳健誓约",
        summary: "4 战，强调回复与抽滤。",
        tone: "guard"
      },
      {
        fallbackId: "chronicle-mirror-edge",
        title: "进取誓约",
        summary: "4 战，总回合预算更紧。",
        tone: "edge"
      }
    ]
  },
  {
    order: 3,
    fallbackId: "chronicle-chapter-3",
    title: "第三章：裂天归卷",
    summary: "最后一章把容错压低，只奖励更干净的路线。",
    vows: [
      {
        fallbackId: "chronicle-rift-guard",
        title: "稳健誓约",
        summary: "5 战，战间小幅回复。",
        tone: "guard"
      },
      {
        fallbackId: "chronicle-rift-edge",
        title: "进取誓约",
        summary: "5 战，低容错与更高倍率。",
        tone: "edge"
      }
    ]
  }
]);

const ARCHIVE_VOUCHERS = Object.freeze([
  { id: "fate_chronicle", label: "长卷证", summary: "任一章节完成完整结算" },
  { id: "challenge_ladder", label: "众生证", summary: "众生试炼正式结算" },
  { id: "world_rift", label: "裂隙证", summary: "世界裂隙形成权威贡献" },
  { id: "pvp_live", label: "论道证", summary: "真人排位正式完赛" },
  { id: "relay_expedition", label: "同道证", summary: "同道远征完成一棒" }
]);

function clampInt(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatChronicleTrustTier(value = "") {
  const labels = {
    server_authoritative: "天道校验 已通过",
    server_replayed: "复演校验 已通过",
    verified_envelope: "凭证校验 已通过"
  };
  return labels[normalizeText(value)] || "天道校验 已通过";
}

function formatRunStatusLabel(value = "") {
  const labels = {
    idle: "待恢复",
    active: "进行中",
    completed: "待归卷",
    settled: "已归卷",
    defeated: "已败退",
    abandoned: "已放弃",
    expired: "已过期"
  };
  return labels[normalizeText(value)] || "进行中";
}

function formatRunPhaseLabel(value = "") {
  const labels = {
    route: "路线选择中",
    battle: "交战中",
    reward: "奖励选择中",
    completed: "归卷完成",
    defeated: "已败退",
    abandoned: "已放弃"
  };
  return labels[normalizeText(value)] || "路线选择中";
}

function formatTerminalReasonLabel(value = "", fallback = "可继续重试") {
  const labels = {
    boss_defeated: "首领已击破",
    hp_depleted: "气血耗尽",
    turn_budget_exhausted: "回合耗尽",
    player_abandoned: "主动封卷"
  };
  return labels[normalizeText(value)] || fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function formatUtcDateTime(timestamp = 0, { compact = false, dateOnly = false } = {}) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "未记时";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: compact || dateOnly ? undefined : "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: dateOnly ? undefined : "2-digit",
    minute: dateOnly ? undefined : "2-digit",
    hour12: false
  });
  return `${formatter.format(value).replace(/\//g, "-")} UTC`;
}

function chronicleChip(label = "", tone = "") {
  return `<span class="fate-chronicle-chip${tone ? ` tone-${escapeHtml(tone)}` : ""}">${escapeHtml(label)}</span>`;
}

function getValue(source, ...paths) {
  for (const path of paths) {
    let cursor = source;
    let found = true;
    const keys = Array.isArray(path) ? path : String(path).split(".");
    for (const key of keys) {
      if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, key)) {
        found = false;
        break;
      }
      cursor = cursor[key];
    }
    if (found && cursor !== undefined && cursor !== null) return cursor;
  }
  return null;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function collectCompletedIds(...sources) {
  const set = new Set();
  sources.forEach(source => {
    normalizeArray(source).forEach(entry => {
      if (typeof entry === "string") {
        const id = normalizeText(entry);
        if (id) set.add(id);
        return;
      }
      const id = normalizeText(entry && (entry.vowId || entry.oathId || entry.covenantId || entry.id || entry.rewardId));
      if (id) set.add(id);
    });
  });
  return set;
}

function buildProgressMap(progressSource = null) {
  const progress = new Map();
  normalizeArray(progressSource).forEach(entry => {
    const chapterId = normalizeText(entry && (entry.chapterId || entry.id || entry.chapterKey || entry.key));
    if (chapterId) progress.set(chapterId, normalizeObject(entry));
  });
  if (progress.size > 0) return progress;
  const objectSource = normalizeObject(progressSource);
  Object.entries(objectSource).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    progress.set(normalizeText(value.chapterId || key), normalizeObject(value));
  });
  return progress;
}

function buildSelectedDefaults(model, previous = {}) {
  const currentChapterId = normalizeText(previous.chapterId);
  const currentVowId = normalizeText(previous.vowId);
  const activeAttempt = model.activeAttempt;
  const activeChapterId = normalizeText(activeAttempt && (activeAttempt.chapterId || activeAttempt.chapter && activeAttempt.chapter.chapterId));
  const activeVowId = normalizeText(activeAttempt && (activeAttempt.vowId || activeAttempt.oathId || activeAttempt.covenantId || activeAttempt.variantId));
  const preferredChapterId = activeChapterId || currentChapterId;
  const preferredVowId = activeVowId || currentVowId;
  let selectedChapter = model.chapters.find(chapter => chapter.chapterId === preferredChapterId) || null;
  if (!selectedChapter) {
    selectedChapter = model.chapters.find(chapter => chapter.unlocked && chapter.available !== false) || model.chapters[0] || null;
  }
  let selectedVow = selectedChapter
    ? selectedChapter.vows.find(vow => vow.vowId === preferredVowId) || null
    : null;
  if (!selectedVow && selectedChapter) {
    selectedVow = selectedChapter.vows.find(vow => vow.available !== false) || selectedChapter.vows[0] || null;
  }
  return {
    chapterId: normalizeText(selectedChapter && selectedChapter.chapterId),
    vowId: normalizeText(selectedVow && selectedVow.vowId)
  };
}

export function normalizeChronicleModel(state = {}) {
  const current = normalizeObject(state.current);
  const rotationEnvelope = normalizeObject(getValue(current, "rotation") || current);
  const rotation = normalizeObject(getValue(rotationEnvelope, "meta") || rotationEnvelope);
  const rotationProgress = normalizeObject(
    getValue(rotationEnvelope, "progress")
      || getValue(current, "progress")
  );
  const progressMap = buildProgressMap(
    getValue(rotationProgress, "chapters")
      || getValue(current, "progress.chapterProgress")
      || getValue(current, "progress.chapters")
      || getValue(current, "chapterProgress")
      || getValue(current, "chaptersProgress")
  );
  const attempt = normalizeObject(
    state.attempt
      || getValue(current, "attempt")
      || getValue(current, "activeAttempt")
      || getValue(current, "currentAttempt")
      || getValue(current, "resumableAttempt")
      || getValue(current, "recoverableAttempt")
  );
  const activeRun = normalizeObject(state.activeRun || getValue(attempt, "run") || getValue(attempt, "authoritativeRun"));
  const rawChapterList = normalizeArray(
    getValue(rotationProgress, "chapters")
      || getValue(current, "chapters")
      || getValue(rotation, "chapters")
      || getValue(current, "chapterList")
  );
  const chapters = CHAPTER_BLUEPRINTS.map((blueprint, index) => {
    const chapterSource = rawChapterList.find(entry => {
      const order = clampInt(entry && (entry.order || entry.chapterOrder || entry.index || entry.chapterIndex), 0);
      return order === blueprint.order;
    }) || rawChapterList[index] || {};
    const source = normalizeObject(chapterSource);
    const chapterId = normalizeText(
      source.chapterId
        || source.id
        || source.chapterKey
        || source.key
        || blueprint.fallbackId
    );
    const chapterProgress = normalizeObject(progressMap.get(chapterId) || progressMap.get(blueprint.fallbackId));
    const explicitUnlocked = getValue(source, "unlocked");
    const completedVows = collectCompletedIds(
      getValue(source, "completedVows"),
      getValue(source, "completedOaths"),
      getValue(source, "completedCovenants"),
      getValue(chapterProgress, "completedVows"),
      getValue(chapterProgress, "completedOaths"),
      getValue(chapterProgress, "completedCovenants")
    );
    const chapterCompleted = normalizeBoolean(
      getValue(source, "completed")
      || getValue(chapterProgress, "completed")
      || getValue(chapterProgress, "cleared"),
      completedVows.size > 0
    );
    const vowSource = normalizeArray(
      getValue(source, "vows")
        || getValue(source, "oaths")
        || getValue(source, "covenants")
        || getValue(source, "routes")
        || getValue(source, "variants")
    );
    const vows = blueprint.vows.map((template, vowIndex) => {
      const matchingSource = vowSource.find(entry => {
        const id = normalizeText(entry && (entry.vowId || entry.oathId || entry.covenantId || entry.variantId || entry.id));
        return id === template.fallbackId;
      }) || vowSource[vowIndex] || {};
      const vow = normalizeObject(matchingSource);
      const vowId = normalizeText(
        vow.vowId
          || vow.oathId
          || vow.covenantId
          || vow.variantId
          || vow.id
          || template.fallbackId
      );
      const completed = normalizeBoolean(vow.completed, completedVows.has(vowId));
      return {
        vowId,
        title: normalizeText(vow.title || vow.label || vow.name, template.title),
        summary: normalizeText(vow.summary || vow.description, template.summary),
        tone: normalizeText(vow.tone || template.tone, template.tone),
        encounters: clampInt(vow.encounterCount || vow.encounters || vow.battles || vow.stageCount, 0),
        available: normalizeBoolean(
          getValue(vow, "available"),
          normalizeBoolean(getValue(vow, "unlocked"), true)
        ),
        completed
      };
    });
    return {
      order: blueprint.order,
      chapterId,
      title: normalizeText(source.title || source.name || blueprint.title, blueprint.title),
      summary: normalizeText(source.summary || source.description, blueprint.summary),
      available: normalizeBoolean(getValue(source, "available"), true),
      unlocked: explicitUnlocked === null
        ? blueprint.order === 1
        : normalizeBoolean(explicitUnlocked, blueprint.order === 1),
      completed: chapterCompleted,
      dualCompleted: normalizeBoolean(
        getValue(source, "dualCompleted") || getValue(chapterProgress, "dualCompleted"),
        vows.filter(vow => vow.completed).length >= 2
      ),
      bestScore: clampInt(
        getValue(source, "bestScore")
          || getValue(source, "bestResult.officialScore")
          || getValue(chapterProgress, "bestScore")
          || getValue(chapterProgress, "personalBest.score")
      ),
      bestGrade: normalizeText(
        getValue(source, "bestGrade")
          || getValue(source, "bestResult.grade")
          || getValue(chapterProgress, "bestGrade")
          || getValue(chapterProgress, "personalBest.grade")
      ),
      resultCount: clampInt(getValue(source, "resultCount") || getValue(chapterProgress, "resultCount")),
      active: chapterId === normalizeText(attempt.chapterId || getValue(attempt, "chapter.chapterId")),
      vows
    };
  });

  chapters.forEach((chapter, index) => {
    if (index === 0) {
      chapter.unlocked = chapter.unlocked !== false;
      return;
    }
    if (chapter.unlocked === false) {
      const previous = chapters[index - 1];
      chapter.unlocked = previous.completed || previous.dualCompleted || previous.vows.some(vow => vow.completed);
    }
  });

  const rewardSources = [
    ...normalizeArray(getValue(rotationProgress, "milestones")),
    ...normalizeArray(getValue(current, "rewardMilestones")),
    ...normalizeArray(getValue(current, "milestones")),
    ...normalizeArray(getValue(current, "claimableRewards")),
    ...normalizeArray(getValue(current, "progress.rewardMilestones")),
    ...normalizeArray(getValue(current, "progress.milestones"))
  ];
  const milestoneMap = new Map();
  rewardSources.forEach(entry => {
    const source = normalizeObject(entry);
    const milestoneId = normalizeText(source.milestoneId || source.id || source.rewardId);
    if (!milestoneId || milestoneMap.has(milestoneId)) return;
    milestoneMap.set(milestoneId, {
      milestoneId,
      title: normalizeText(source.title || source.label || source.name, "里程碑奖励"),
      summary: normalizeText(source.summary || source.description, "完成条件满足后可领取。"),
      claimed: normalizeBoolean(source.claimed, source.status === "claimed"),
      claimable: normalizeBoolean(
        source.claimable,
        normalizeBoolean(source.eligible, source.claimed !== true && source.status !== "locked")
      ),
      chapterId: normalizeText(source.chapterId),
      rewardText: normalizeText(
        source.rewardText
          || source.rewardLine
          || source.rewardSummary
          || (source.reward && source.reward.amount ? `${source.reward.amount} 荣誉` : "")
      )
    });
  });

  const weeklyArchive = normalizeObject(state.weeklyArchive || getValue(current, "weeklyArchive"));
  const credentialMap = new Map();
  normalizeArray(getValue(weeklyArchive, "completedModes") || getValue(weeklyArchive, "credentialModes") || getValue(weeklyArchive, "voucherModes")).forEach(mode => {
    const key = normalizeText(mode);
    if (key) credentialMap.set(key, true);
  });
  normalizeArray(getValue(weeklyArchive, "credentials") || getValue(weeklyArchive, "vouchers") || getValue(weeklyArchive, "facts")).forEach(entry => {
    const source = normalizeObject(entry);
    const key = normalizeText(source.mode || source.credentialId || source.voucherId || source.id);
    if (key) credentialMap.set(key, normalizeBoolean(source.completed, true));
  });
  normalizeArray(getValue(weeklyArchive, "slots")).forEach(entry => {
    const source = normalizeObject(entry);
    const key = normalizeText(source.mode || source.slotId);
    if (key) credentialMap.set(key, normalizeBoolean(source.earned, false));
  });
  const vouchers = ARCHIVE_VOUCHERS.map(entry => ({
    ...entry,
    completed: credentialMap.get(entry.id) === true
  }));
  const credentialCount = clampInt(
    getValue(weeklyArchive, "grade.proofCount")
      || getValue(weeklyArchive, "earnedCount")
      || getValue(weeklyArchive, "credentialCount")
      || getValue(weeklyArchive, "completedCount")
      || getValue(weeklyArchive, "voucherCount")
      || vouchers.filter(entry => entry.completed).length,
    vouchers.filter(entry => entry.completed).length
  );
  const foundationReward = normalizeObject(
    getValue(weeklyArchive, "claim")
      || getValue(weeklyArchive, "foundationReward")
      || getValue(weeklyArchive, "reward")
      || getValue(weeklyArchive, "foundation")
  );
  const activeFoundationClaim = normalizeObject(
    getValue(weeklyArchive, "claim.activeCycle")
      || getValue(weeklyArchive, "foundationClaim")
      || getValue(weeklyArchive, "rewardClaim")
  );
  const carryoverFoundationClaim = normalizeObject(getValue(weeklyArchive, "claim.carryoverCycle"));
  const claimTarget = normalizeBoolean(activeFoundationClaim.claimable, false)
    ? activeFoundationClaim
    : normalizeBoolean(carryoverFoundationClaim.claimable, false)
      ? carryoverFoundationClaim
      : activeFoundationClaim;
  const foundationClaimed = normalizeBoolean(claimTarget.claimed, false);
  const foundationRewardAmount = clampInt(
    getValue(foundationReward, "renown")
      || getValue(foundationReward, "amount")
      || getValue(foundationReward, "walletDelta.renown")
      || 120,
    120
  );
  const archiveTier = normalizeText(
    getValue(weeklyArchive, "grade.title"),
    credentialCount >= 5
      ? "全证"
      : credentialCount >= 4
        ? "辉卷"
        : credentialCount >= 3
          ? "升格"
          : credentialCount >= 2
            ? "基础归卷"
            : "未归卷"
  );
  const foundationClaimable = normalizeBoolean(claimTarget.claimable, false);
  const foundationCycleId = normalizeText(
    claimTarget.cycleId
      || getValue(weeklyArchive, "cycle.cycleId")
      || weeklyArchive.cycleId
  );
  const foundationIsCarryover = !!foundationCycleId
    && foundationCycleId === normalizeText(carryoverFoundationClaim.cycleId)
    && normalizeBoolean(carryoverFoundationClaim.claimable, false);

  const activeRunId = normalizeText(
    activeRun.runId
      || activeRun.id
      || attempt.runId
      || getValue(attempt, "run.runId")
      || getValue(attempt, "authoritativeRun.runId")
  );

  return {
    current,
    rotation,
    weeklyArchive,
    archiveTier,
    credentialCount,
    vouchers,
    foundationClaimable,
    foundationClaimed,
    foundationCycleId,
    foundationIsCarryover,
    foundationRewardAmount,
    chapters,
    activeAttempt: Object.keys(attempt).length ? attempt : null,
    activeRunId,
    rewardMilestones: Array.from(milestoneMap.values()),
    window: {
      startAt: clampInt(getValue(rotation, "startsAt") || getValue(current, "startsAt")),
      endAt: clampInt(getValue(rotation, "endsAt") || getValue(current, "endsAt")),
      claimUntil: clampInt(
        getValue(rotation, "claimEndsAt")
          || getValue(rotation, "claimUntil")
          || getValue(current, "claimUntil")
          || getValue(weeklyArchive, "cycle.claimEndsAt")
          || getValue(weeklyArchive, "claimUntil")
      )
    }
  };
}

class FateChronicleRunPanel extends AuthoritativeRunPanel {
  constructor({
    service,
    chronicleService,
    fateChronicleService = chronicleService,
    getCurrentUserId,
    requestRender,
    requestLogin,
    requestConfirm,
    onSubmitted,
    onFateChronicleProjected = onSubmitted,
    onFateChronicleReturn = () => {}
  }) {
    super({
      service,
      fateChronicleService,
      getCurrentUserId,
      requestRender,
      requestLogin,
      requestConfirm,
      onFateChronicleProjected,
      onFateChronicleReturn
    });
    this.chronicleService = chronicleService;
    this.onSubmitted = onSubmitted;
  }

  getCurrentMode() {
    return "fate_chronicle";
  }

  transformMarkup(markup = "") {
    return String(markup || "")
      .replace(/data-season-ops-action=/g, "data-fate-chronicle-action=")
      .replace(/data-season-ops-focus-key=/g, "data-fate-chronicle-focus-key=")
      .replace(/data-season-ops-focus-fallback=/g, "data-fate-chronicle-focus-fallback=");
  }

  clearRun() {
    if (this.service && typeof this.service.reset === "function") {
      this.serviceState = this.service.reset();
    } else {
      this.serviceState = {};
    }
    this.lastLoadedKey = "";
    this.lastEnvelope = null;
    this.lastRunMeta = null;
    this.lastReceipt = null;
    this.requestRender();
    return this.serviceState;
  }

  async loadRun({ runId = "", expectedUserId = normalizeText(this.getCurrentUserId()) } = {}) {
    const safeRunId = normalizeText(runId);
    if (!safeRunId || !expectedUserId) {
      this.clearRun();
      return { success: false, reason: "fate_chronicle_run_missing" };
    }
    const result = await this.service.get({ runId: safeRunId, expectedUserId });
    const applied = this.applyResult(result, { kind: "get", userId: expectedUserId, force: true });
    if (!result || result.success === false || result.suppressed) {
      this.clearRun();
    }
    return applied;
  }

  async settleRun() {
    const expectedUserId = normalizeText(this.getCurrentUserId());
    const runId = this.getActiveRunId();
    if (!expectedUserId || !runId) {
      return { success: false, reason: "authoritative_run_missing_id", message: "当前没有可继续的长卷战局。" };
    }
    const settled = await this.service.settle({
      runId,
      expectedVersion: this.getExpectedVersion(),
      expectedUserId
    });
    const applied = this.applyResult(settled, { kind: "settle", userId: expectedUserId, force: true });
    if (!settled || settled.success === false) return applied;
    const projected = await this.chronicleService.submit({ runId, expectedUserId });
    if (projected && projected.success !== false && typeof this.onSubmitted === "function") {
      await this.onSubmitted(projected);
    }
    return { ...applied, chronicleProjection: projected };
  }

  render() {
    const projection = this.getCurrentProjection();
    const phase = normalizeText(this.getProjectionPhase(), "idle");
    const error = this.serviceState && this.serviceState.lastError ? this.serviceState.lastError : null;
    if (!projection || !this.lastRunMeta) {
      return this.transformMarkup(`
        <section class="fate-chronicle-run-shell" data-fate-chronicle-state="idle">
          ${this.renderStateCard("待恢复", "当前无进行中战局。")}
        </section>
      `);
    }
    return this.transformMarkup(`
      <section
        class="fate-chronicle-run-shell"
        data-fate-chronicle-state="${escapeHtml(phase)}"
        data-fate-chronicle-run-panel="true"
      >
        ${this.renderStatusBanner(error)}
        ${this.renderRunOverview()}
        ${this.renderPhaseSection()}
      </section>
    `);
  }

  renderRunOverview() {
    const projection = normalizeObject(this.getCurrentProjection());
    const player = normalizeObject(projection.player);
    const recovery = normalizeObject(this.lastRunMeta && this.lastRunMeta.recovery);
    const status = formatRunStatusLabel(this.getStatus());
    const phase = formatRunPhaseLabel(this.getProjectionPhase());
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>进行中的长卷战局</h3>
            <p>本局进度已同步，可继续推进本周固定卷面。</p>
          </div>
          <div class="season-ops-authoritative-status-group">
            <span class="season-ops-counter-chip">${escapeHtml(status)}</span>
            <span class="season-ops-counter-chip">${escapeHtml(phase)}</span>
          </div>
        </div>
        <div class="season-ops-authoritative-stats-grid">
          ${this.renderStatTile("长卷进度", `${clampInt(this.lastRunMeta.actionCount)} 步已记卷`, "本局进度已同步")}
          ${this.renderStatTile("玩家状态", `${clampInt(player.hp)}/${clampInt(player.maxHp)} HP`, `格挡 ${clampInt(player.block)} · 能量 ${clampInt(player.energy)}`)}
          ${this.renderStatTile("手牌与牌堆", `${normalizeArray(player.hand).length} 手牌`, `抽牌堆 ${clampInt(player.drawPileCount)} · 弃牌堆 ${clampInt(player.discardPileCount)}`)}
          ${this.renderStatTile("恢复与时效", `${clampInt(recovery.recoveryCount)} 次恢复`, this.lastRunMeta.expiresAt > 0 ? `到期 ${formatUtcDateTime(this.lastRunMeta.expiresAt, { compact: true })}` : "等待服务器时限")}
        </div>
        <div class="season-ops-authoritative-meta-row">
          ${chronicleChip("本局进度已同步")}
          ${chronicleChip("本周固定卷面")}
          ${chronicleChip(this.lastRunMeta.expiresAt > 0 ? "跨设备可继续" : "等待卷面记录")}
          ${chronicleChip(formatChronicleTrustTier(this.lastRunMeta.trustTier))}
        </div>
      </section>
    `;
  }

  renderTerminalPhase() {
    const projection = normalizeObject(this.getCurrentProjection());
    const summary = normalizeObject(projection.summary);
    const abandoned = normalizeText(projection.phase) === "abandoned";
    return `
      <section class="season-ops-section-card season-ops-authoritative-section" data-fate-chronicle-terminal="${abandoned ? "abandoned" : "defeated"}">
        <div class="season-ops-section-head">
          <div>
            <h3>${abandoned ? "本次长卷已放弃" : "本次长卷已败退"}</h3>
            <p>${abandoned ? "这条权威路线已经封卷，不再接受继续推进。" : "本次失败不会扣次数，也不会倒退章节解锁；你可以立刻重试同章同誓约。"}</p>
          </div>
          <div class="season-ops-counter-chip">${escapeHtml(formatTerminalReasonLabel(summary.reason, abandoned ? "已封卷" : "可重试"))}</div>
        </div>
        ${this.renderSummaryGrid(summary)}
        ${this.renderRouteHistory()}
        <div class="season-ops-state-actions season-ops-authoritative-inline-actions">
          <button
            type="button"
            class="season-ops-inline-btn is-claimable"
            data-fate-chronicle-action="authoritative-begin-new"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "准备中..." : "重试同章同誓约"}</button>
          <button
            type="button"
            class="season-ops-inline-btn"
            data-fate-chronicle-action="authoritative-refresh"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "恢复中..." : "恢复服务器卷面"}</button>
        </div>
      </section>
    `;
  }
}

export class FateChronicleView {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.containerId = "fate-chronicle-screen";
    this.phase = "idle";
    this.errorMessage = "";
    this.notice = null;
    this.boundUserId = "";
    this.refreshSeq = 0;
    this.selectedChapterId = "";
    this.selectedVowId = "";
    this.authoritativeService = createAuthoritativeRunService({ client: BackendClient });
    this.runPanel = new FateChronicleRunPanel({
      service: this.authoritativeService,
      chronicleService: FateChronicleService,
      fateChronicleService: FateChronicleService,
      getCurrentUserId: () => this.getCurrentUserId(),
      requestRender: () => this.render(),
      requestLogin: () => this.openLoginModal(),
      requestConfirm: message => this.requestConfirmation(message),
      onSubmitted: async result => {
        this.notice = {
          tone: "success",
          text: result && result.message ? result.message : "本章长卷已完成归卷投影。"
        };
        await this.refresh({ silent: true, preserveNotice: true });
      },
      onFateChronicleProjected: async result => {
        this.notice = {
          tone: "success",
          text: result && result.message ? result.message : "本章长卷已完成归卷投影。"
        };
        await this.refresh({ silent: true, preserveNotice: true });
      },
      onFateChronicleReturn: () => {
        this.notice = {
          tone: "info",
          text: "已返回命途长卷卷面。"
        };
        this.render();
      }
    });
    this.boundClickHandler = this.handleClick.bind(this);
    this.boundStorageHandler = this.handleStorageChange.bind(this);
    this.unsubscribe = FateChronicleService.subscribe(() => {
      this.render();
    }, { emitCurrent: false });
  }

  destroy() {
    if (typeof this.unsubscribe === "function") this.unsubscribe();
    if (this.runPanel && typeof this.runPanel.destroy === "function") this.runPanel.destroy();
    const container = this.getContainer();
    if (container && container.__fateChronicleBound) {
      container.removeEventListener("click", this.boundClickHandler);
      delete container.__fateChronicleBound;
    }
    if (typeof window !== "undefined" && this.storageListenerBound) {
      window.removeEventListener("storage", this.boundStorageHandler);
      this.storageListenerBound = false;
    }
  }

  getContainer() {
    if (typeof document === "undefined") return null;
    return document.getElementById(this.containerId);
  }

  ensureRoot() {
    const container = this.getContainer();
    if (!container) return null;
    container.classList.add("fate-chronicle-screen");
    if (!container.__fateChronicleBound) {
      container.addEventListener("click", this.boundClickHandler);
      container.__fateChronicleBound = true;
    }
    if (typeof window !== "undefined" && !this.storageListenerBound) {
      window.addEventListener("storage", this.boundStorageHandler);
      this.storageListenerBound = true;
    }
    return container;
  }

  getCurrentUser() {
    if (typeof AuthService !== "undefined" && AuthService && typeof AuthService.getCurrentUser === "function") {
      return AuthService.getCurrentUser();
    }
    if (typeof BackendClient !== "undefined" && BackendClient && typeof BackendClient.getCurrentUser === "function") {
      return BackendClient.getCurrentUser();
    }
    return null;
  }

  getCurrentUserId() {
    const user = this.getCurrentUser();
    return normalizeText(user && (user.objectId || user.id || user.userId || user.username));
  }

  getCurrentUserName() {
    const user = this.getCurrentUser();
    return normalizeText(user && (user.username || user.nickname || user.name || user.objectId || user.id), "未登录");
  }

  async show(options = {}) {
    const container = this.ensureRoot();
    if (!container) return { success: false, message: "命途长卷容器不存在" };
    if (options && options.refresh === false) {
      this.render();
      return { success: true, skipped: true };
    }
    this.render();
    return this.refresh({ silent: false });
  }

  async refresh({ silent = false, preserveNotice = false } = {}) {
    const container = this.ensureRoot();
    if (!container) {
      return { success: false, reason: "fate_chronicle_container_missing", message: "命途长卷容器不存在" };
    }
    const expectedUserId = this.getCurrentUserId();
    const refreshSeq = ++this.refreshSeq;
    if (!expectedUserId) {
      this.boundUserId = "";
      this.phase = "not_logged_in";
      this.errorMessage = "";
      this.notice = preserveNotice ? this.notice : null;
      FateChronicleService.reset();
      this.runPanel.clearRun();
      this.render();
      return { success: false, reason: "not_logged_in", message: "未登录" };
    }
    if (!preserveNotice) this.notice = null;
    const accountChanged = this.boundUserId !== expectedUserId;
    if (accountChanged) {
      this.selectedChapterId = "";
      this.selectedVowId = "";
      FateChronicleService.reset();
      this.runPanel.clearRun();
    }
    this.boundUserId = expectedUserId;
    this.errorMessage = "";
    this.phase = silent && FateChronicleService.getState().current ? "ready" : "loading";
    this.render();
    const result = await FateChronicleService.current({ expectedUserId });
    if (refreshSeq !== this.refreshSeq || this.getCurrentUserId() !== expectedUserId) {
      return { success: false, suppressed: true };
    }
    if (!result || result.success === false || result.suppressed) {
      this.phase = result && result.suppressed ? "loading" : "error";
      this.errorMessage = result && result.message ? result.message : "命途长卷读取失败";
      this.runPanel.clearRun();
      this.render();
      return result || { success: false, reason: "fate_chronicle_read_failed", message: this.errorMessage };
    }
    const archiveResult = await FateChronicleService.loadArchive({ expectedUserId });
    if (refreshSeq !== this.refreshSeq || this.getCurrentUserId() !== expectedUserId) {
      return { success: false, suppressed: true };
    }
    if (archiveResult && archiveResult.suppressed) {
      this.phase = "loading";
      return archiveResult;
    }
    const model = normalizeChronicleModel(FateChronicleService.getState());
    const defaults = buildSelectedDefaults(model, {
      chapterId: this.selectedChapterId,
      vowId: this.selectedVowId
    });
    this.selectedChapterId = defaults.chapterId;
    this.selectedVowId = defaults.vowId;
    if (model.activeRunId) {
      await this.runPanel.loadRun({ runId: model.activeRunId, expectedUserId });
    } else {
      this.runPanel.clearRun();
    }
    if (refreshSeq !== this.refreshSeq || this.getCurrentUserId() !== expectedUserId) {
      return { success: false, suppressed: true };
    }
    this.phase = "ready";
    if (!archiveResult || archiveResult.success === false) {
      this.notice = preserveNotice && this.notice
        ? this.notice
        : { tone: "warning", text: archiveResult && archiveResult.message ? archiveResult.message : "三证归卷读取失败" };
    }
    this.render();
    return result;
  }

  handleStorageChange() {
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId && this.boundUserId) {
      this.phase = "not_logged_in";
      this.boundUserId = "";
      FateChronicleService.reset();
      this.runPanel.clearRun();
      this.render();
      return;
    }
    if (currentUserId && currentUserId !== this.boundUserId) {
      this.notice = {
        tone: "info",
        text: "检测到账号切换，旧命途长卷回执已被抑制，正在恢复新账号卷面。"
      };
      this.refresh({ silent: true, preserveNotice: true }).catch(() => {});
    }
  }

  getModel() {
    return normalizeChronicleModel(FateChronicleService.getState());
  }

  getSelectedChapter(model = this.getModel()) {
    return model.chapters.find(chapter => chapter.chapterId === this.selectedChapterId) || model.chapters[0] || null;
  }

  getSelectedVow(model = this.getModel(), chapter = this.getSelectedChapter(model)) {
    if (!chapter) return null;
    return chapter.vows.find(vow => vow.vowId === this.selectedVowId) || chapter.vows[0] || null;
  }

  async requestConfirmation(message = "") {
    if (this.game && typeof this.game.showConfirmModal === "function") {
      return await new Promise(resolve => {
        this.game.showConfirmModal(message, () => resolve(true), () => resolve(false));
      });
    }
    return typeof window !== "undefined" ? window.confirm(message) : false;
  }

  openLoginModal() {
    if (this.game && typeof this.game.showLoginModal === "function") {
      this.game.showLoginModal();
      return;
    }
  }

  async startSelectedAttempt({ forceNew = false } = {}) {
    const expectedUserId = this.getCurrentUserId();
    if (!expectedUserId) {
      this.openLoginModal();
      return { success: false, reason: "not_logged_in" };
    }
    const model = this.getModel();
    const chapter = this.getSelectedChapter(model);
    const vow = this.getSelectedVow(model, chapter);
    if (!chapter || !vow || !chapter.chapterId || !vow.vowId) {
      return {
        success: false,
        reason: "fate_chronicle_selection_missing",
        message: "当前没有可发车的章节或誓约。"
      };
    }
    const result = await FateChronicleService.start({
      rotationId: normalizeText(model.rotation.rotationId || model.rotation.id),
      chapterId: chapter.chapterId,
      oathId: vow.vowId,
      expectedUserId,
      forceNew
    });
    if (result && result.success !== false) {
      this.notice = {
        tone: "success",
        text: normalizeText(result.message, `已进入${chapter.title} · ${vow.title}。`)
      };
      await this.refresh({ silent: true, preserveNotice: true });
    } else if (result && result.message) {
      this.notice = { tone: "danger", text: result.message };
      this.render();
    }
    return result;
  }

  async retryAttemptFromPanel() {
    const model = this.getModel();
    const attempt = normalizeObject(model.activeAttempt);
    const attemptChapterId = normalizeText(attempt.chapterId || getValue(attempt, "chapter.chapterId"));
    const attemptVowId = normalizeText(attempt.vowId || attempt.oathId || attempt.covenantId || attempt.variantId);
    if (attemptChapterId) this.selectedChapterId = attemptChapterId;
    if (attemptVowId) this.selectedVowId = attemptVowId;
    return this.startSelectedAttempt({ forceNew: true });
  }

  async claimMilestone(milestoneId = "") {
    const expectedUserId = this.getCurrentUserId();
    if (!expectedUserId) {
      this.openLoginModal();
      return { success: false, reason: "not_logged_in" };
    }
    const model = this.getModel();
    const result = await FateChronicleService.claimReward({
      rotationId: normalizeText(model.rotation.rotationId || model.rotation.id),
      milestoneId,
      expectedUserId
    });
    if (result && result.success !== false) {
      this.notice = {
        tone: "success",
        text: normalizeText(result.message, "长卷奖励已领取。")
      };
      await this.refresh({ silent: true, preserveNotice: true });
    } else if (result && result.message) {
      this.notice = { tone: "danger", text: result.message };
      this.render();
    }
    return result;
  }

  async claimArchiveFoundation() {
    const expectedUserId = this.getCurrentUserId();
    if (!expectedUserId) {
      this.openLoginModal();
      return { success: false, reason: "not_logged_in" };
    }
    const model = this.getModel();
    const result = await FateChronicleService.claimArchive({
      cycleId: model.foundationCycleId,
      expectedUserId
    });
    if (result && result.success !== false) {
      this.notice = {
        tone: "success",
        text: normalizeText(result.message, "三证归卷基础奖励已领取。")
      };
      await this.refresh({ silent: true, preserveNotice: true });
    } else if (result && result.message) {
      this.notice = { tone: "danger", text: result.message };
      this.render();
    }
    return result;
  }

  async handleRunPanelAction(actionNode) {
    const action = normalizeText(actionNode && actionNode.dataset && actionNode.dataset.fateChronicleAction);
    if (!action) return false;
    if (action === "authoritative-refresh") {
      const model = this.getModel();
      if (model.activeRunId) {
        await this.runPanel.loadRun({ runId: model.activeRunId, expectedUserId: this.getCurrentUserId() });
      } else {
        await this.refresh({ silent: true, preserveNotice: true });
      }
      return true;
    }
    if (action === "authoritative-select-node") {
      await this.runPanel.submitAction("select_node", { nodeId: normalizeText(actionNode.dataset.nodeId) });
      return true;
    }
    if (action === "authoritative-play-card") {
      await this.runPanel.submitAction("play_card", { cardInstanceId: normalizeText(actionNode.dataset.cardInstanceId) });
      return true;
    }
    if (action === "authoritative-end-turn") {
      await this.runPanel.submitAction("end_turn", {});
      return true;
    }
    if (action === "authoritative-choose-reward") {
      await this.runPanel.submitAction("choose_reward", { rewardId: normalizeText(actionNode.dataset.rewardId) });
      return true;
    }
    if (action === "authoritative-abandon") {
      const result = await this.runPanel.abandonRun();
      if (result && result.success !== false) {
        await this.refresh({ silent: true, preserveNotice: true });
      }
      return true;
    }
    if (action === "authoritative-settle") {
      await this.runPanel.settleRun();
      return true;
    }
    if (action === "authoritative-begin-new") {
      await this.retryAttemptFromPanel();
      return true;
    }
    if (action === "authoritative-return-chronicle") {
      if (typeof this.runPanel.onFateChronicleReturn === "function") {
        this.runPanel.onFateChronicleReturn();
      }
      await this.refresh({ silent: true, preserveNotice: true });
      return true;
    }
    return false;
  }

  async handleClick(event) {
    const actionNode = event.target.closest("[data-fate-chronicle-action]");
    if (!actionNode) return;
    const action = normalizeText(actionNode.dataset.fateChronicleAction);
    if (await this.handleRunPanelAction(actionNode)) return;
    if (action === "login") {
      this.openLoginModal();
      return;
    }
    if (action === "return-menu") {
      if (this.game && typeof this.game.showScreen === "function") {
        this.game.showScreen("main-menu");
      }
      return;
    }
    if (action === "refresh") {
      await this.refresh({ silent: true, preserveNotice: true });
      return;
    }
    if (action === "select-chapter") {
      this.selectedChapterId = normalizeText(actionNode.dataset.chapterId);
      const model = this.getModel();
      const chapter = this.getSelectedChapter(model);
      const nextVow = this.getSelectedVow(model, chapter);
      this.selectedVowId = normalizeText(nextVow && nextVow.vowId);
      this.render();
      return;
    }
    if (action === "select-vow") {
      this.selectedChapterId = normalizeText(actionNode.dataset.chapterId, this.selectedChapterId);
      this.selectedVowId = normalizeText(actionNode.dataset.vowId);
      this.render();
      return;
    }
    if (action === "start") {
      await this.startSelectedAttempt();
      return;
    }
    if (action === "claim-milestone") {
      await this.claimMilestone(normalizeText(actionNode.dataset.milestoneId));
      return;
    }
    if (action === "claim-foundation") {
      await this.claimArchiveFoundation();
      return;
    }
  }

  renderNotice() {
    if (!this.notice || !this.notice.text) return "";
    return `
      <div class="fate-chronicle-notice tone-${escapeHtml(this.notice.tone || "info")}" data-fate-chronicle-state="notice" role="status">
        ${escapeHtml(this.notice.text)}
      </div>
    `;
  }

  renderStateShell(content = "") {
    return `
      <div class="fate-chronicle-shell fate-chronicle-state-shell">
        <div class="fate-chronicle-state-nav">
          <button
            type="button"
            class="back-btn fate-chronicle-state-back"
            data-fate-chronicle-action="return-menu"
            aria-label="返回主菜单"
            title="返回主菜单"
          >↩</button>
          <div>
            <div class="fate-chronicle-kicker">命途长卷</div>
            <strong>周命档案</strong>
          </div>
        </div>
        ${content}
      </div>
    `;
  }

  renderGuestState() {
    return `
      <section class="fate-chronicle-state-card" data-fate-chronicle-state="guest">
        <div class="fate-chronicle-kicker">账号绑定</div>
        <h2>游客无法恢复长卷</h2>
        <p>命途长卷与三证归卷都依赖账号签名。登录后才能读取每周章节、恢复进行中的长卷战局和领取 2/5 基础归卷奖励。</p>
        <div class="fate-chronicle-actions">
          <button type="button" class="menu-btn primary" data-fate-chronicle-action="login">前往登录</button>
        </div>
      </section>
    `;
  }

  renderLoadingState() {
    return `
      <section class="fate-chronicle-state-card" data-fate-chronicle-state="loading">
        <div class="fate-chronicle-kicker">命途长卷</div>
        <h2>正在恢复服务器卷面</h2>
        <p>章节解锁、双誓约、进行中的长卷战局与三证归卷都以本周固定卷面为准，客户端不会本地补全。</p>
      </section>
    `;
  }

  renderErrorState() {
    return `
      <section class="fate-chronicle-state-card" data-fate-chronicle-state="error" role="alert">
        <div class="fate-chronicle-kicker">命途长卷</div>
        <h2>读取失败</h2>
        <p>${escapeHtml(this.errorMessage || "命途长卷读取失败。")}</p>
        <div class="fate-chronicle-actions">
          <button type="button" class="menu-btn primary" data-fate-chronicle-action="refresh">重试</button>
        </div>
      </section>
    `;
  }

  renderHeader(model) {
    const archiveWindow = model.window.endAt > 0 ? `结卷 ${formatUtcDateTime(model.window.endAt, { compact: true })}` : "等待服务器开卷";
    const claimWindow = model.window.claimUntil > 0 ? `领奖至 ${formatUtcDateTime(model.window.claimUntil, { compact: true })}` : "宽限窗口待定";
    return `
      <section class="fate-chronicle-header" data-fate-chronicle-state="ready">
        <button type="button" class="back-btn" data-fate-chronicle-action="return-menu" aria-label="返回主菜单" title="返回主菜单">↩</button>
        <div class="fate-chronicle-title-group">
          <div class="fate-chronicle-kicker">天道见证</div>
          <h1>命途长卷</h1>
          <p>三章顺序解锁、双誓约固定周种子、失败不扣次数，结算后再把长卷证折进本周三证归卷。</p>
        </div>
        <div class="fate-chronicle-header-side">
          <div class="fate-chronicle-account-card" data-fate-chronicle-account="${escapeHtml(this.boundUserId || "guest")}">
            <span>当前账号</span>
            <strong>${escapeHtml(this.getCurrentUserName())}</strong>
            <small>${escapeHtml(archiveWindow)} · ${escapeHtml(claimWindow)}</small>
          </div>
          <button type="button" class="menu-btn" data-fate-chronicle-action="refresh">刷新卷面</button>
        </div>
      </section>
    `;
  }

  renderArchiveSection(model) {
    const pending = FateChronicleService.getState().pending;
    const claimBusy = !!(pending && pending.kind === "claimArchive");
    return `
      <section class="fate-chronicle-section" data-fate-chronicle-state="archive">
        <div class="fate-chronicle-section-head">
          <div>
            <div class="fate-chronicle-kicker">三证归卷</div>
            <h2>本周归卷状态</h2>
            <p>只要任意两类权威凭证就能拿满本周唯一经济收益，3-5 证只提升档案等级与展示荣誉。</p>
          </div>
          <div class="fate-chronicle-tier-card">
            <strong>${escapeHtml(model.archiveTier)}</strong>
            <span>${escapeHtml(`${model.credentialCount}/5`)}</span>
          </div>
        </div>
        <div class="fate-chronicle-summary-grid">
          <article class="fate-chronicle-summary-card">
            <span>基础归卷</span>
            <strong>${model.credentialCount >= 2 ? "已达成" : "未达成"}</strong>
            <small>2/5 即可领取 ${model.foundationRewardAmount} 荣誉</small>
          </article>
          <article class="fate-chronicle-summary-card">
            <span>升格档案</span>
            <strong>${model.credentialCount >= 3 ? "已升格" : "待补 3/5"}</strong>
            <small>只升级周档案，不再追加货币</small>
          </article>
          <article class="fate-chronicle-summary-card">
            <span>辉卷与全证</span>
            <strong>${model.credentialCount >= 4 ? `${model.credentialCount}/5` : "待补 4/5"}</strong>
            <small>4/5 辉卷，5/5 全证</small>
          </article>
        </div>
        <div class="fate-chronicle-voucher-grid" data-fate-chronicle-vouchers="true">
          ${model.vouchers.map(voucher => `
            <article
              class="fate-chronicle-voucher ${voucher.completed ? "is-complete" : "is-empty"}"
              data-fate-chronicle-voucher="${escapeHtml(voucher.id)}"
            >
              <div class="fate-chronicle-voucher-top">
                <strong>${escapeHtml(voucher.label)}</strong>
                <span>${voucher.completed ? "已铸证" : "未铸证"}</span>
              </div>
              <p>${escapeHtml(voucher.summary)}</p>
            </article>
          `).join("")}
        </div>
        <div class="fate-chronicle-actions">
          <button
            type="button"
            class="menu-btn primary"
            data-fate-chronicle-action="claim-foundation"
            data-fate-chronicle-foundation-claim="${model.foundationClaimable ? "claimable" : (model.foundationClaimed ? "claimed" : "locked")}"
            ${!model.foundationClaimable || claimBusy ? "disabled" : ""}
          >${claimBusy ? "领取中..." : model.foundationClaimed ? "基础归卷已领取" : model.foundationClaimable ? `${model.foundationIsCarryover ? "补领上周" : "领取"} ${model.foundationRewardAmount} 荣誉` : "需先达成 2/5"}</button>
        </div>
      </section>
    `;
  }

  renderChronicleMilestones(model) {
    const milestones = model.rewardMilestones;
    if (!milestones.length) return "";
    const pending = FateChronicleService.getState().pending;
    return `
      <section class="fate-chronicle-section" data-fate-chronicle-state="milestones">
        <div class="fate-chronicle-section-head">
          <div>
            <div class="fate-chronicle-kicker">纯外观里程碑</div>
            <h2>长卷奖励</h2>
            <p>章节完成、同章双解与全卷收口都只发长卷自身里程碑，不改战力。</p>
          </div>
        </div>
        <div class="fate-chronicle-milestone-grid">
          ${milestones.map(entry => {
            const claimBusy = !!(pending && pending.kind === "claim" && normalizeText(pending.milestoneId) === entry.milestoneId);
            const claimState = entry.claimed ? "claimed" : entry.claimable ? "claimable" : "locked";
            return `
              <article class="fate-chronicle-milestone-card" data-fate-chronicle-milestone="${escapeHtml(entry.milestoneId)}">
                <div class="fate-chronicle-voucher-top">
                  <strong>${escapeHtml(entry.title)}</strong>
                  <span>${entry.claimed ? "已领取" : entry.claimable ? "可领取" : "未达成"}</span>
                </div>
                <p>${escapeHtml(entry.summary)}</p>
                ${entry.rewardText ? `<div class="fate-chronicle-inline-note">${escapeHtml(entry.rewardText)}</div>` : ""}
                <button
                  type="button"
                  class="menu-btn ${entry.claimable ? "primary" : ""}"
                  data-fate-chronicle-action="claim-milestone"
                  data-milestone-id="${escapeHtml(entry.milestoneId)}"
                  data-fate-chronicle-claim-state="${escapeHtml(claimState)}"
                  ${!entry.claimable || claimBusy ? "disabled" : ""}
                >${claimBusy ? "领取中..." : entry.claimed ? "已领取" : entry.claimable ? "领取奖励" : "未达成"}</button>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  renderChapterSection(model) {
    const selectedChapter = this.getSelectedChapter(model);
    const selectedVow = this.getSelectedVow(model, selectedChapter);
    const pending = FateChronicleService.getState().pending;
    const startBusy = !!(pending && pending.kind === "start");
    const activeAttempt = normalizeObject(model.activeAttempt);
    const activeChapterId = normalizeText(activeAttempt.chapterId || getValue(activeAttempt, "chapter.chapterId"));
    const activeVowId = normalizeText(activeAttempt.vowId || activeAttempt.oathId || activeAttempt.covenantId || activeAttempt.variantId);
    return `
      <section class="fate-chronicle-section" data-fate-chronicle-state="chapters">
        <div class="fate-chronicle-section-head">
          <div>
            <div class="fate-chronicle-kicker">三章顺序解锁</div>
            <h2>本周章节与双誓约</h2>
            <p>完成任一誓约即可解锁下一章；同章两条誓约都完成时记为双解，仅影响档案展示与纯外观里程碑。</p>
          </div>
          <div class="fate-chronicle-inline-stack">
            ${model.activeRunId ? chronicleChip("存在进行中的长卷战局", "success") : chronicleChip("当前无进行中战局", "muted")}
            ${model.credentialCount > 0 ? chronicleChip(`已铸证 ${model.credentialCount}/5`, "info") : ""}
          </div>
        </div>
        ${model.activeRunId ? `
          <div class="fate-chronicle-notice tone-info" data-fate-chronicle-state="active-run">
            当前账号已有进行中的长卷战局。页面已自动恢复当前卷面，切号后旧回执不会覆盖新账号状态。
          </div>
        ` : ""}
        <div class="fate-chronicle-chapter-grid">
          ${model.chapters.map(chapter => `
            <article
              class="fate-chronicle-chapter-card ${chapter.chapterId === this.selectedChapterId ? "is-selected" : ""} ${chapter.unlocked ? "" : "is-locked"}"
              data-fate-chronicle-chapter="${escapeHtml(chapter.chapterId)}"
            >
              <div class="fate-chronicle-chapter-head">
                <div>
                  <span>${escapeHtml(`第 ${chapter.order} 章`)}</span>
                  <strong>${escapeHtml(chapter.title)}</strong>
                </div>
                <button
                  type="button"
                  class="menu-btn"
                  data-fate-chronicle-action="select-chapter"
                  data-chapter-id="${escapeHtml(chapter.chapterId)}"
                  data-fate-chronicle-select="${chapter.chapterId === this.selectedChapterId ? "current" : "choose"}"
                  aria-pressed="${chapter.chapterId === this.selectedChapterId ? "true" : "false"}"
                >${chapter.chapterId === this.selectedChapterId ? "当前章节" : chapter.unlocked ? "查看本章" : "尚未解锁"}</button>
              </div>
              <p>${escapeHtml(chapter.summary)}</p>
              <div class="fate-chronicle-inline-stack">
                ${chronicleChip(chapter.unlocked ? "已解锁" : "需先完成前章", chapter.unlocked ? "success" : "muted")}
                ${chronicleChip(chapter.completed ? "任一誓约已通关" : "待首通", chapter.completed ? "info" : "muted")}
                ${chronicleChip(chapter.dualCompleted ? "同章双解" : "未双解", chapter.dualCompleted ? "success" : "muted")}
                ${chapter.bestScore > 0 ? chronicleChip(`最佳 ${chapter.bestScore}${chapter.bestGrade ? ` · ${chapter.bestGrade}` : ""}`) : ""}
              </div>
              <div class="fate-chronicle-vow-list">
                ${chapter.vows.map(vow => {
                  const active = chapter.chapterId === activeChapterId && vow.vowId === activeVowId;
                  return `
                    <button
                      type="button"
                      class="fate-chronicle-vow-btn ${chapter.chapterId === this.selectedChapterId && vow.vowId === this.selectedVowId ? "is-selected" : ""} ${vow.completed ? "is-complete" : ""}"
                      data-fate-chronicle-action="select-vow"
                      data-chapter-id="${escapeHtml(chapter.chapterId)}"
                      data-vow-id="${escapeHtml(vow.vowId)}"
                      aria-pressed="${chapter.chapterId === this.selectedChapterId && vow.vowId === this.selectedVowId ? "true" : "false"}"
                      ${!chapter.unlocked || vow.available === false ? "disabled" : ""}
                    >
                      <span>${escapeHtml(vow.title)}</span>
                      <small>${escapeHtml(active ? "进行中" : vow.completed ? "已完成" : vow.summary)}</small>
                    </button>
                  `;
                }).join("")}
              </div>
            </article>
          `).join("")}
        </div>
        ${selectedChapter && selectedVow ? `
          <div class="fate-chronicle-launch-card" data-fate-chronicle-selected="${escapeHtml(`${selectedChapter.chapterId}:${selectedVow.vowId}`)}">
            <div>
              <div class="fate-chronicle-kicker">当前选择</div>
              <h3>${escapeHtml(selectedChapter.title)} · ${escapeHtml(selectedVow.title)}</h3>
              <p>${escapeHtml(selectedVow.summary)}</p>
            </div>
            <div class="fate-chronicle-inline-stack">
              ${chronicleChip(selectedChapter.unlocked ? "章节可进入" : "章节未解锁", selectedChapter.unlocked ? "success" : "muted")}
              ${chronicleChip(selectedVow.completed ? "本誓约已完成" : "本誓约待完成", selectedVow.completed ? "info" : "warning")}
              ${model.activeRunId ? chronicleChip("优先恢复进行中战局", "info") : ""}
            </div>
            <div class="fate-chronicle-actions">
              <button
                type="button"
                class="menu-btn primary"
                data-fate-chronicle-action="start"
                data-fate-chronicle-start-state="${model.activeRunId ? "resume" : "start"}"
                ${!selectedChapter.unlocked || startBusy || !!model.activeRunId ? "disabled" : ""}
              >${startBusy ? "发车中..." : model.activeRunId ? "已有进行中战局" : "进入本章誓约"}</button>
            </div>
          </div>
        ` : ""}
      </section>
    `;
  }

  renderRunSection(model) {
    if (!model.activeRunId && !this.runPanel.getCurrentProjection()) return "";
    return `
      <section class="fate-chronicle-section" data-fate-chronicle-state="run">
        <div class="fate-chronicle-section-head">
          <div>
            <div class="fate-chronicle-kicker">本周固定卷面</div>
            <h2>当前长卷战局</h2>
            <p>路线选择、出牌、结束回合、奖励选择和完整结算都会直接写入本局进度。</p>
          </div>
        </div>
        ${this.runPanel.render()}
      </section>
    `;
  }

  render() {
    const container = this.ensureRoot();
    if (!container) return;
    if (this.phase === "not_logged_in") {
      container.innerHTML = this.renderStateShell(this.renderGuestState());
      return;
    }
    if (this.phase === "loading") {
      container.innerHTML = this.renderStateShell(this.renderLoadingState());
      return;
    }
    if (this.phase === "error") {
      container.innerHTML = this.renderStateShell(this.renderErrorState());
      return;
    }
    const model = this.getModel();
    const serviceState = FateChronicleService.getState();
    const archiveError = serviceState.archiveError;
    container.innerHTML = `
      <div class="fate-chronicle-shell" data-fate-chronicle-state="ready">
        ${this.renderHeader(model)}
        ${this.renderNotice()}
        ${archiveError && archiveError.message ? `
          <div class="fate-chronicle-notice tone-warning" data-fate-chronicle-state="archive-warning">
            ${escapeHtml(archiveError.message)}
          </div>
        ` : ""}
        ${this.renderArchiveSection(model)}
        ${this.renderChronicleMilestones(model)}
        ${this.renderChapterSection(model)}
        ${this.renderRunSection(model)}
      </div>
    `;
  }
}
