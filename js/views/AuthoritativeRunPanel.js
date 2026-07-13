import { AuthoritativeRunService } from "../services/authoritative-run-service.js";
import { ChallengeLadderService } from "../services/challenge-ladder-service.js";
import { WorldRiftService } from "../services/world-rift-service.js";
import { buildDataAttributes, escapeHtml } from "../ui/render-safe.js";

const MODES = ["pve", "challenge", "expedition", "challenge_ladder", "world_rift", "relay_expedition", "fate_chronicle"];
const FOCUS_KEYS = Object.freeze({
  refresh: "authoritative:refresh",
  begin: "authoritative:begin",
  settle: "authoritative:settle",
  endTurn: "authoritative:end-turn",
  abandon: "authoritative:abandon",
  returnRelay: "authoritative:return-relay",
  returnChronicle: "authoritative:return-chronicle"
});

const MODE_META = Object.freeze({
  pve: {
    label: "平衡试炼",
    shortLabel: "PVE",
    summary: "均衡三战，强调读懂敌方意图与稳住攻防节奏。",
    tags: ["稳定攻防", "广谱奖励"]
  },
  challenge: {
    label: "天劫挑战",
    shortLabel: "挑战",
    summary: "生命更紧、回合受限，得更主动地把防守转成终结。",
    tags: ["高倍率", "回合预算"]
  },
  expedition: {
    label: "裂界远征",
    shortLabel: "远征",
    summary: "跨战会整备恢复，但后段更硬，考验整段资源规划。",
    tags: ["战后恢复", "后段加压"]
  },
  challenge_ladder: {
    label: "众生试炼",
    shortLabel: "权威榜",
    summary: "全服统一种子槽与有限正式次数，只认服务端完整重放成绩。",
    tags: ["真实榜单", "每周三次", "统一种子"]
  },
  world_rift: {
    label: "天穹裂隙",
    shortLabel: "共斗",
    summary: "用服务端完整重放推进真实全服首领；每周五次，最佳三次进入贡献榜。",
    tags: ["异步共斗", "全服阶段", "最佳三次"]
  },
  relay_expedition: {
    label: "同道远征",
    shortLabel: "接力",
    summary: "共享路线与接力谱，不共享残血、牌组、手牌、弃牌堆或临时状态。",
    tags: ["四棒共享", "服务端接棒", "权威投影"]
  },
  fate_chronicle: {
    label: "命途长卷",
    shortLabel: "长卷",
    summary: "三章双誓约的服务器权威主线；失败不扣次数，当前卷面可跨设备恢复。",
    tags: ["单人主线", "双誓约", "失败可重试"]
  }
});

const STATUS_META = Object.freeze({
  idle: { label: "待命", tone: "muted" },
  active: { label: "进行中", tone: "success" },
  completed: { label: "待结算", tone: "warning" },
  settled: { label: "已结算", tone: "info" },
  defeated: { label: "已败退", tone: "danger" },
  abandoned: { label: "已放弃", tone: "muted" },
  expired: { label: "已过期", tone: "muted" }
});

const PHASE_META = Object.freeze({
  route: { label: "择路", tone: "info" },
  battle: { label: "交战", tone: "warning" },
  reward: { label: "领奖", tone: "success" },
  completed: { label: "完成", tone: "success" },
  defeated: { label: "败退", tone: "danger" },
  abandoned: { label: "放弃", tone: "muted" }
});

function clampInt(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatTrustTier(value = "") {
  const labels = {
    server_authoritative: "天道校验 已通过",
    server_replayed: "复演校验 已通过",
    verified_envelope: "凭证校验 已通过"
  };
  return labels[normalizeText(value)] || "天道校验 已通过";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isMode(value = "") {
  return MODES.includes(normalizeText(value));
}

function shortHash(value = "") {
  const text = normalizeText(value);
  if (!text) return "未提供";
  if (text.length <= 16) return text;
  return `${text.slice(0, 10)}…${text.slice(-6)}`;
}

function formatUtcDateTime(timestamp = 0, { compact = false } = {}) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "未记时";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: compact ? undefined : "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return `${formatter.format(value).replace(/\//g, "-")} UTC`;
}

function formatStatus(status = "") {
  return STATUS_META[normalizeText(status)] || STATUS_META.idle;
}

function formatPhase(phase = "") {
  return PHASE_META[normalizeText(phase)] || PHASE_META.route;
}

function extractRunEnvelope(result = null) {
  if (result && result.run && typeof result.run === "object") return result.run;
  if (result && result.lastSettlement && typeof result.lastSettlement === "object") return result.lastSettlement;
  return null;
}

function extractResultReceipt(result = null) {
  if (result && result.receipt && typeof result.receipt === "object") return result.receipt;
  if (result && result.action && typeof result.action === "object") return result.action;
  if (result && result.lastSettlement && result.lastSettlement.receipt && typeof result.lastSettlement.receipt === "object") {
    return result.lastSettlement.receipt;
  }
  return null;
}

function projectRunMeta(run = null, result = null) {
  if (!run || typeof run !== "object") return null;
  return {
    runId: normalizeText(run.runId),
    clientRunId: normalizeText(run.clientRunId),
    mode: normalizeText(run.mode),
    status: normalizeText(run.status),
    reportVersion: normalizeText(result && result.reportVersion),
    contentVersion: normalizeText(run.contentVersion),
    contentHash: normalizeText(run.contentHash),
    protocolVersion: normalizeText(run.protocolVersion),
    authorityLevel: normalizeText(run.authorityLevel),
    trustTier: normalizeText(run.trustTier),
    stateVersion: clampInt(run.stateVersion),
    actionCount: clampInt(run.actionCount),
    startedAt: clampInt(run.startedAt),
    expiresAt: clampInt(run.expiresAt),
    completedAt: clampInt(run.completedAt),
    settledAt: clampInt(run.settledAt),
    abandonedAt: clampInt(run.abandonedAt),
    updatedAt: clampInt(run.updatedAt),
    integrity: run.integrity && typeof run.integrity === "object" ? { ...run.integrity } : null,
    recovery: run.recovery && typeof run.recovery === "object" ? { ...run.recovery } : null,
    receipt: run.receipt && typeof run.receipt === "object" ? { ...run.receipt } : null
  };
}

function buildFocusKey(prefix = "", value = "") {
  const safePrefix = normalizeText(prefix);
  const safeValue = normalizeText(value);
  return safeValue ? `${safePrefix}:${safeValue}` : safePrefix;
}

function renderChip(label = "", extraClass = "") {
  return `<span class="season-ops-meta-chip ${extraClass}">${escapeHtml(label)}</span>`;
}

export class AuthoritativeRunPanel {
  constructor({
    service = AuthoritativeRunService,
    challengeLadderService = typeof ChallengeLadderService !== "undefined" ? ChallengeLadderService : null,
    worldRiftService = typeof WorldRiftService !== "undefined" ? WorldRiftService : null,
    relayExpeditionService = null,
    fateChronicleService = null,
    getCurrentUserId = () => "",
    requestRender = () => {},
    requestLogin = () => {},
    requestConfirm = async () => false,
    onRelayExpeditionProjected = () => {},
    onRelayExpeditionReturn = () => {},
    onFateChronicleProjected = () => {},
    onFateChronicleReturn = () => {}
  } = {}) {
    this.service = service;
    this.challengeLadderService = challengeLadderService;
    this.worldRiftService = worldRiftService;
    this.relayExpeditionService = relayExpeditionService;
    this.fateChronicleService = fateChronicleService;
    this.getCurrentUserId = getCurrentUserId;
    this.requestRender = requestRender;
    this.requestLogin = requestLogin;
    this.requestConfirm = requestConfirm;
    this.onRelayExpeditionProjected = onRelayExpeditionProjected;
    this.onRelayExpeditionReturn = onRelayExpeditionReturn;
    this.onFateChronicleProjected = onFateChronicleProjected;
    this.onFateChronicleReturn = onFateChronicleReturn;
    this.activeMode = "pve";
    this.serviceState = this.service && typeof this.service.getState === "function" ? this.service.getState() : {};
    this.lastRunMeta = null;
    this.lastEnvelope = null;
    this.lastReceipt = null;
    this.lastLoadedKey = "";
    this.challengeLadderState = this.challengeLadderService && typeof this.challengeLadderService.getState === "function"
      ? this.challengeLadderService.getState()
      : {};
    this.worldRiftState = this.worldRiftService && typeof this.worldRiftService.getState === "function"
      ? this.worldRiftService.getState()
      : {};
    this.relayExpeditionState = this.relayExpeditionService && typeof this.relayExpeditionService.getState === "function"
      ? this.relayExpeditionService.getState()
      : {};
    this.fateChronicleState = this.fateChronicleService && typeof this.fateChronicleService.getState === "function"
      ? this.fateChronicleService.getState()
      : {};
    this.unsubscribe = this.service && typeof this.service.subscribe === "function"
      ? this.service.subscribe(snapshot => {
        this.serviceState = snapshot || {};
        this.requestRender();
      }, { emitCurrent: false })
      : () => {};
    this.unsubscribeChallengeLadder = this.challengeLadderService && typeof this.challengeLadderService.subscribe === "function"
      ? this.challengeLadderService.subscribe(snapshot => {
        this.challengeLadderState = snapshot || {};
        this.requestRender();
      }, { emitCurrent: false })
      : () => {};
    this.unsubscribeWorldRift = this.worldRiftService && typeof this.worldRiftService.subscribe === "function"
      ? this.worldRiftService.subscribe(snapshot => {
        this.worldRiftState = snapshot || {};
        this.requestRender();
      }, { emitCurrent: false })
      : () => {};
    this.unsubscribeRelayExpedition = this.relayExpeditionService && typeof this.relayExpeditionService.subscribe === "function"
      ? this.relayExpeditionService.subscribe(snapshot => {
        this.relayExpeditionState = snapshot || {};
        this.requestRender();
      }, { emitCurrent: false })
      : () => {};
    this.unsubscribeFateChronicle = this.fateChronicleService && typeof this.fateChronicleService.subscribe === "function"
      ? this.fateChronicleService.subscribe(snapshot => {
        this.fateChronicleState = snapshot || {};
        this.requestRender();
      }, { emitCurrent: false })
      : () => {};
  }

  destroy() {
    if (typeof this.unsubscribe === "function") this.unsubscribe();
    if (typeof this.unsubscribeChallengeLadder === "function") this.unsubscribeChallengeLadder();
    if (typeof this.unsubscribeWorldRift === "function") this.unsubscribeWorldRift();
    if (typeof this.unsubscribeRelayExpedition === "function") this.unsubscribeRelayExpedition();
    if (typeof this.unsubscribeFateChronicle === "function") this.unsubscribeFateChronicle();
  }

  isBusy() {
    return !!(
      (this.serviceState && (this.serviceState.pending || this.serviceState.pendingReplay))
      || (this.getCurrentMode() === "challenge_ladder" && this.challengeLadderState && this.challengeLadderState.pending)
      || (this.getCurrentMode() === "world_rift" && this.worldRiftState && this.worldRiftState.pending)
      || (this.getCurrentMode() === "relay_expedition" && this.relayExpeditionState && (
        this.relayExpeditionState.pending
        || this.relayExpeditionState.authoritativeRun && this.relayExpeditionState.authoritativeRun.pending
      ))
      || (this.getCurrentMode() === "fate_chronicle" && this.fateChronicleState && this.fateChronicleState.pending)
    );
  }

  getCurrentMode() {
    return isMode(this.activeMode) ? this.activeMode : "pve";
  }

  isRelayExpeditionMode() {
    return this.getCurrentMode() === "relay_expedition";
  }

  isFateChronicleMode() {
    return this.getCurrentMode() === "fate_chronicle";
  }

  openRelayExpeditionMode() {
    this.activeMode = "relay_expedition";
    this.requestRender();
    return { success: true };
  }

  openFateChronicleMode() {
    this.activeMode = "fate_chronicle";
    this.lastLoadedKey = "";
    this.requestRender();
    return { success: true };
  }

  shouldShowMode(mode = "") {
    if (this.isFateChronicleMode()) return mode === "fate_chronicle";
    if (mode === "fate_chronicle") return false;
    if (mode !== "relay_expedition") return true;
    return this.isRelayExpeditionMode()
      || !!(
        this.relayExpeditionState
        && (
          this.relayExpeditionState.session
          || this.relayExpeditionState.current
          || this.relayExpeditionState.currentLeg
          || this.relayExpeditionState.pending
          || this.relayExpeditionState.lastError
        )
      );
  }

  getRelaySession() {
    return this.relayExpeditionState && (
      this.relayExpeditionState.session
      || this.relayExpeditionState.current && this.relayExpeditionState.current.currentSession
      || this.relayExpeditionState.current && this.relayExpeditionState.current.session
    ) || null;
  }

  getRelayCurrentLeg() {
    return this.relayExpeditionState && (
      this.relayExpeditionState.currentLeg
      || this.relayExpeditionState.session && (this.relayExpeditionState.session.currentLeg || this.relayExpeditionState.session.activeLeg)
      || this.relayExpeditionState.current && (this.relayExpeditionState.current.currentLeg || this.relayExpeditionState.current.activeLeg)
    ) || null;
  }

  getRelayAuthoritativeState() {
    return this.relayExpeditionState && this.relayExpeditionState.authoritativeRun
      ? this.relayExpeditionState.authoritativeRun
      : null;
  }

  getRelayActiveRunId() {
    const leg = this.getRelayCurrentLeg();
    const relayAuthoritative = this.getRelayAuthoritativeState();
    return normalizeText(
      relayAuthoritative && relayAuthoritative.runId
      || leg && (leg.runId || leg.run && leg.run.runId)
      || this.serviceState && this.serviceState.runId
    );
  }

  getCurrentProjection() {
    if (this.isRelayExpeditionMode()) {
      const relayProjection = this.getRelayAuthoritativeState() && this.getRelayAuthoritativeState().projection;
      if (relayProjection && typeof relayProjection === "object") return relayProjection;
    }
    const projection = this.serviceState && this.serviceState.projection;
    if (!projection || typeof projection !== "object") return null;
    const projectionMode = normalizeText(projection.mode);
    if (projectionMode && projectionMode !== this.getCurrentMode()) return null;
    return projection;
  }

  getProjectionPhase() {
    const projection = this.getCurrentProjection();
    return normalizeText(projection && projection.phase);
  }

  getActiveRunId() {
    if (this.isRelayExpeditionMode()) return this.getRelayActiveRunId();
    const projection = this.getCurrentProjection();
    if (projection && projection.runId) return normalizeText(projection.runId);
    const metaMatchesMode = this.lastRunMeta && normalizeText(this.lastRunMeta.mode) === this.getCurrentMode();
    return metaMatchesMode ? normalizeText(this.lastRunMeta.runId) : "";
  }

  getExpectedVersion() {
    if (this.isRelayExpeditionMode()) {
      const projection = this.getCurrentProjection();
      return clampInt(
        projection && Object.prototype.hasOwnProperty.call(projection, "version")
          ? projection.version
          : this.getRelayAuthoritativeState() && this.getRelayAuthoritativeState().projection && this.getRelayAuthoritativeState().projection.version,
        0
      );
    }
    const projection = this.getCurrentProjection();
    return clampInt(
      projection && Object.prototype.hasOwnProperty.call(projection, "version")
        ? projection.version
        : this.lastRunMeta && this.lastRunMeta.stateVersion,
      0
    );
  }

  getStatus() {
    if (this.isRelayExpeditionMode()) {
      const relayProjectionStatus = normalizeText(this.getCurrentProjection() && this.getCurrentProjection().runStatus);
      if (relayProjectionStatus) return relayProjectionStatus;
      const relayStateStatus = normalizeText(this.getRelayAuthoritativeState() && this.getRelayAuthoritativeState().status);
      if (relayStateStatus) return relayStateStatus;
    }
    const projectionStatus = normalizeText(this.getCurrentProjection() && this.getCurrentProjection().runStatus);
    if (projectionStatus) return projectionStatus;
    const runStatus = normalizeText(this.lastRunMeta && this.lastRunMeta.status);
    if (runStatus) return runStatus;
    const phase = this.getProjectionPhase();
    if (phase === "completed") return "completed";
    if (phase === "defeated") return "defeated";
    if (phase === "abandoned") return "abandoned";
    if (this.getCurrentProjection()) return "active";
    return "idle";
  }

  getLoadKey(userId = this.getCurrentUserId(), mode = this.getCurrentMode()) {
    return `${normalizeText(userId)}::${normalizeText(mode)}`;
  }

  shouldHydrateCurrent(force = false) {
    if (force) return true;
    const userId = normalizeText(this.getCurrentUserId());
    if (!userId) return false;
    const loadKey = this.getLoadKey(userId, this.getCurrentMode());
    const projection = this.getCurrentProjection();
    if (!projection) return loadKey !== this.lastLoadedKey;
    const projectionMode = normalizeText(projection.mode);
    return projectionMode !== this.getCurrentMode() || loadKey !== this.lastLoadedKey;
  }

  async activate({ force = false } = {}) {
    if (!this.shouldHydrateCurrent(force)) return { success: true, skipped: true };
    return this.loadCurrent({ force });
  }

  async handleAuthStateChanged({ active = false } = {}) {
    this.lastLoadedKey = "";
    this.lastEnvelope = null;
    this.lastRunMeta = null;
    this.lastReceipt = null;
    if (this.service && typeof this.service.reset === "function") {
      this.serviceState = this.service.reset();
    } else {
      this.serviceState = {};
    }
    if (this.challengeLadderService && typeof this.challengeLadderService.reset === "function") {
      this.challengeLadderState = this.challengeLadderService.reset();
    } else {
      this.challengeLadderState = {};
    }
    if (this.worldRiftService && typeof this.worldRiftService.reset === "function") {
      this.worldRiftState = this.worldRiftService.reset();
    } else {
      this.worldRiftState = {};
    }
    if (this.relayExpeditionService && typeof this.relayExpeditionService.reset === "function") {
      this.relayExpeditionState = this.relayExpeditionService.reset();
    } else {
      this.relayExpeditionState = {};
    }
    if (this.fateChronicleService && typeof this.fateChronicleService.reset === "function") {
      this.fateChronicleState = this.fateChronicleService.reset();
    } else {
      this.fateChronicleState = {};
    }
    this.requestRender();
    if (active) {
      return this.activate({ force: true });
    }
    return { success: true, skipped: true };
  }

  async loadCurrent({ force = false } = {}) {
    const expectedUserId = normalizeText(this.getCurrentUserId());
    if (!expectedUserId) {
      return this.handleAuthStateChanged({ active: false });
    }
    if (this.isRelayExpeditionMode()) {
      return this.loadRelayExpedition({ force, expectedUserId });
    }
    if (this.isFateChronicleMode()
      && this.fateChronicleService
      && typeof this.fateChronicleService.current === "function") {
      await this.fateChronicleService.current({ expectedUserId });
      this.fateChronicleState = this.fateChronicleService.getState();
    }
    if (this.getCurrentMode() === "challenge_ladder"
      && this.challengeLadderService
      && typeof this.challengeLadderService.current === "function") {
      await this.challengeLadderService.current({ expectedUserId });
      this.challengeLadderState = this.challengeLadderService.getState();
    }
    if (this.getCurrentMode() === "world_rift"
      && this.worldRiftService
      && typeof this.worldRiftService.current === "function") {
      await this.worldRiftService.current({ expectedUserId });
      this.worldRiftState = this.worldRiftService.getState();
    }
    const result = await this.service.current({
      mode: this.getCurrentMode(),
      expectedUserId
    });
    return this.applyResult(result, { kind: "current", userId: expectedUserId, force });
  }

  async loadRelayExpedition({ force = false, expectedUserId = normalizeText(this.getCurrentUserId()) } = {}) {
    if (!this.relayExpeditionService || typeof this.relayExpeditionService.current !== "function") {
      return { success: false, reason: "relay_expedition_unavailable", message: "同道远征服务尚未就绪。" };
    }
    const relayResult = await this.relayExpeditionService.current({ expectedUserId });
    this.relayExpeditionState = this.relayExpeditionService.getState();
    const loadKey = this.getLoadKey(expectedUserId, this.getCurrentMode());
    if (!relayResult || relayResult.success === false) {
      if (loadKey && this.lastLoadedKey === loadKey) this.lastLoadedKey = "";
      this.requestRender();
      return relayResult;
    }
    if (loadKey) this.lastLoadedKey = loadKey;
    const runId = this.getRelayActiveRunId();
    if (!runId) {
      this.lastEnvelope = null;
      this.lastRunMeta = null;
      this.lastReceipt = null;
      this.serviceState = {
        ...this.serviceState,
        mode: "relay_expedition",
        runId: "",
        projection: null,
        lastReceipt: null,
        lastError: null,
        pending: null,
        pendingReplay: false
      };
      this.requestRender();
      return relayResult;
    }
    const runResult = await this.relayExpeditionService.refreshRelayRun({ runId, expectedUserId });
    this.relayExpeditionState = this.relayExpeditionService.getState();
    if (runResult && runResult.success !== false) {
      return this.applyResult(runResult, { kind: "get", userId: expectedUserId, force: true });
    }
    this.requestRender();
    return runResult;
  }

  async refreshProjection() {
    const expectedUserId = normalizeText(this.getCurrentUserId());
    if (!expectedUserId) {
      return this.handleAuthStateChanged({ active: false });
    }
    if (this.isRelayExpeditionMode()) {
      return this.loadRelayExpedition({ force: true, expectedUserId });
    }
    if (this.isFateChronicleMode()
      && this.fateChronicleService
      && typeof this.fateChronicleService.current === "function") {
      await this.fateChronicleService.current({ expectedUserId });
      this.fateChronicleState = this.fateChronicleService.getState();
    }
    if (this.getCurrentMode() === "challenge_ladder"
      && this.challengeLadderService
      && typeof this.challengeLadderService.current === "function") {
      await this.challengeLadderService.current({ expectedUserId });
      this.challengeLadderState = this.challengeLadderService.getState();
    }
    if (this.getCurrentMode() === "world_rift"
      && this.worldRiftService
      && typeof this.worldRiftService.current === "function") {
      await this.worldRiftService.current({ expectedUserId });
      this.worldRiftState = this.worldRiftService.getState();
    }
    const runId = this.getActiveRunId();
    const result = runId
      ? await this.service.get({ runId, expectedUserId })
      : await this.service.current({ mode: this.getCurrentMode(), expectedUserId });
    return this.applyResult(result, { kind: runId ? "get" : "current", userId: expectedUserId, force: true });
  }

  async beginRun({ forceNew = false } = {}) {
    const expectedUserId = normalizeText(this.getCurrentUserId());
    if (!expectedUserId) {
      this.requestLogin();
      return { success: false, reason: "not_logged_in" };
    }
    if (this.isRelayExpeditionMode()) {
      return {
        success: false,
        reason: "relay_expedition_start_from_social",
        message: "同道远征的开队与接棒只在道友录小队页处理。"
      };
    }
    if (this.isFateChronicleMode()) {
      return {
        success: false,
        reason: "fate_chronicle_start_from_workspace",
        message: "请回到命途长卷选择章节与誓约后发车。"
      };
    }
    if (this.getCurrentMode() === "challenge_ladder"
      && (!this.challengeLadderService || typeof this.challengeLadderService.start !== "function")) {
      return { success: false, reason: "challenge_ladder_unavailable", message: "众生试炼服务尚未就绪。" };
    }
    if (this.getCurrentMode() === "world_rift"
      && (!this.worldRiftService || typeof this.worldRiftService.start !== "function")) {
      return { success: false, reason: "world_rift_unavailable", message: "天穹裂隙服务尚未就绪。" };
    }
    const isChallengeLadder = this.getCurrentMode() === "challenge_ladder";
    const isWorldRift = this.getCurrentMode() === "world_rift";
    const result = isChallengeLadder
      ? await this.challengeLadderService.start({
        forceNew,
        expectedUserId
      })
      : isWorldRift
        ? await this.worldRiftService.start({
          forceNew,
          expectedUserId
        })
        : await this.service.begin({
          mode: this.getCurrentMode(),
          forceNew,
          expectedUserId
        });
    if (isChallengeLadder && result && result.success !== false
      && typeof this.challengeLadderService.current === "function") {
      await this.challengeLadderService.current({ expectedUserId });
      this.challengeLadderState = this.challengeLadderService.getState();
    }
    if (isWorldRift && result && result.success !== false
      && typeof this.worldRiftService.current === "function") {
      await this.worldRiftService.current({ expectedUserId });
      this.worldRiftState = this.worldRiftService.getState();
    }
    return this.applyResult(result, { kind: "begin", userId: expectedUserId, force: true });
  }

  async submitAction(command = "", payload = null) {
    const expectedUserId = normalizeText(this.getCurrentUserId());
    const runId = this.getActiveRunId();
    if (!expectedUserId || !runId) {
      return { success: false, reason: "authoritative_run_missing_id", message: "权威试炼尚未开始。" };
    }
    const result = await this.service.action({
      runId,
      command,
      payload,
      expectedVersion: this.getExpectedVersion(),
      expectedUserId
    });
    return this.applyResult(result, { kind: "action", userId: expectedUserId, force: true });
  }

  async settleRun() {
    const expectedUserId = normalizeText(this.getCurrentUserId());
    const runId = this.getActiveRunId();
    if (!expectedUserId || !runId) {
      return { success: false, reason: "authoritative_run_missing_id", message: "权威试炼尚未开始。" };
    }
    const result = await this.service.settle({
      runId,
      expectedVersion: this.getExpectedVersion(),
      expectedUserId
    });
    const applied = this.applyResult(result, { kind: "settle", userId: expectedUserId, force: true });
    if (result && result.success !== false && this.isRelayExpeditionMode()) {
      if (!this.relayExpeditionService || typeof this.relayExpeditionService.projectLeg !== "function") {
        return { ...applied, relayProjection: { success: false, reason: "relay_expedition_unavailable" } };
      }
      const relayProjection = await this.relayExpeditionService.projectLeg({ runId, expectedUserId });
      this.relayExpeditionState = this.relayExpeditionService.getState();
      if (relayProjection && relayProjection.success !== false) {
        await this.relayExpeditionService.current({ expectedUserId });
        this.relayExpeditionState = this.relayExpeditionService.getState();
        this.lastEnvelope = null;
        this.lastRunMeta = null;
        this.lastReceipt = null;
        this.serviceState = {
          ...this.serviceState,
          mode: "relay_expedition",
          runId: "",
          projection: null,
          lastReceipt: null,
          pending: null,
          pendingReplay: false,
          lastError: null
        };
        this.requestRender();
        if (typeof this.onRelayExpeditionProjected === "function") {
          this.onRelayExpeditionProjected(relayProjection);
        }
      }
      return { ...applied, relayProjection };
    }
    if (result && result.success !== false && this.isFateChronicleMode()) {
      if (!this.fateChronicleService || typeof this.fateChronicleService.submit !== "function") {
        return { ...applied, chronicleSubmission: { success: false, reason: "fate_chronicle_unavailable" } };
      }
      const chronicleSubmission = await this.fateChronicleService.submit({ runId, expectedUserId });
      if (chronicleSubmission && chronicleSubmission.success !== false
        && typeof this.fateChronicleService.current === "function") {
        await this.fateChronicleService.current({ expectedUserId });
      }
      this.fateChronicleState = this.fateChronicleService.getState();
      if (chronicleSubmission && chronicleSubmission.success !== false
        && typeof this.onFateChronicleProjected === "function") {
        this.onFateChronicleProjected(chronicleSubmission);
      }
      return { ...applied, chronicleSubmission };
    }
    if (result && result.success !== false && this.getCurrentMode() === "challenge_ladder") {
      if (!this.challengeLadderService || typeof this.challengeLadderService.submit !== "function") {
        return { ...applied, ladderSubmission: { success: false, reason: "challenge_ladder_unavailable" } };
      }
      const ladderSubmission = await this.challengeLadderService.submit({ runId, expectedUserId });
      if (ladderSubmission && ladderSubmission.success !== false
        && typeof this.challengeLadderService.current === "function") {
        await this.challengeLadderService.current({ expectedUserId });
      }
      this.challengeLadderState = this.challengeLadderService.getState();
      return { ...applied, ladderSubmission };
    }
    if (result && result.success !== false && this.getCurrentMode() === "world_rift") {
      if (!this.worldRiftService || typeof this.worldRiftService.submit !== "function") {
        return { ...applied, riftSubmission: { success: false, reason: "world_rift_unavailable" } };
      }
      const riftSubmission = await this.worldRiftService.submit({ runId, expectedUserId });
      if (riftSubmission && riftSubmission.success !== false
        && typeof this.worldRiftService.current === "function") {
        await this.worldRiftService.current({ expectedUserId });
      }
      this.worldRiftState = this.worldRiftService.getState();
      return { ...applied, riftSubmission };
    }
    return applied;
  }

  async abandonRun() {
    const projection = this.getCurrentProjection();
    if (!projection || !normalizeArray(projection.allowedCommands).includes("abandon")) {
      return { success: false, reason: "authoritative_run_cannot_abandon", message: "当前状态不能放弃权威试炼。" };
    }
    const confirmed = await this.requestConfirm(
      "确认放弃这条权威试炼记录？放弃后本次服务器路线、战斗与奖励都会封卷。"
    );
    if (!confirmed) return { success: false, reason: "cancelled" };
    return this.submitAction("abandon", {});
  }

  async selectMode(mode = "") {
    const nextMode = isMode(mode) ? mode : this.getCurrentMode();
    if (nextMode === this.getCurrentMode()) return { success: true, skipped: true };
    this.activeMode = nextMode;
    this.requestRender();
    if (nextMode === "relay_expedition") {
      return this.activate({ force: false });
    }
    if (nextMode === "challenge_ladder" && normalizeText(this.getCurrentUserId())) {
      if (!this.challengeLadderService || typeof this.challengeLadderService.current !== "function") {
        return { success: false, reason: "challenge_ladder_unavailable", message: "众生试炼服务尚未就绪。" };
      }
      await this.challengeLadderService.current({ expectedUserId: normalizeText(this.getCurrentUserId()) });
      this.challengeLadderState = this.challengeLadderService.getState();
    }
    if (nextMode === "world_rift" && normalizeText(this.getCurrentUserId())) {
      if (!this.worldRiftService || typeof this.worldRiftService.current !== "function") {
        return { success: false, reason: "world_rift_unavailable", message: "天穹裂隙服务尚未就绪。" };
      }
      await this.worldRiftService.current({ expectedUserId: normalizeText(this.getCurrentUserId()) });
      this.worldRiftState = this.worldRiftService.getState();
    }
    return this.activate({ force: false });
  }

  applyResult(result = null, { userId = "" } = {}) {
    if (result && result.suppressed) {
      this.requestRender();
      return result;
    }
    const loadKey = normalizeText(userId) ? this.getLoadKey(userId, this.getCurrentMode()) : "";
    if (!result || result.success === false) {
      const run = extractRunEnvelope(result);
      if (run && (!isMode(run.mode) || normalizeText(run.mode) === this.getCurrentMode())) {
        this.lastEnvelope = run;
        this.lastRunMeta = projectRunMeta(run, result);
        this.lastReceipt = extractResultReceipt(result)
          || (this.lastRunMeta && this.lastRunMeta.receipt)
          || this.lastReceipt;
      }
      if (loadKey && this.lastLoadedKey === loadKey) this.lastLoadedKey = "";
      this.lastReceipt = extractResultReceipt(result) || this.lastReceipt;
      this.requestRender();
      return result;
    }
    if (loadKey) this.lastLoadedKey = loadKey;
    const run = extractRunEnvelope(result);
    if (!run) {
      this.lastEnvelope = null;
      this.lastRunMeta = null;
      this.lastReceipt = null;
      this.serviceState = {
        ...this.serviceState,
        projection: null,
        lastError: null,
        pending: null,
        pendingReplay: false,
        mode: this.getCurrentMode(),
        runId: ""
      };
      this.requestRender();
      return result;
    }
    this.lastEnvelope = run;
    this.lastRunMeta = projectRunMeta(run, result);
    this.lastReceipt = extractResultReceipt(result)
      || (this.lastRunMeta && this.lastRunMeta.receipt)
      || this.lastReceipt;
    this.serviceState = {
      ...this.serviceState,
      mode: this.lastRunMeta.mode || this.serviceState.mode,
      runId: this.lastRunMeta.runId || this.serviceState.runId,
      projection: (run && (run.projection || run.state)) || this.serviceState.projection,
      lastReceipt: this.lastReceipt,
      lastError: null,
      pending: null,
      pendingReplay: false
    };
    if (isMode(this.lastRunMeta && this.lastRunMeta.mode)) {
      this.activeMode = this.lastRunMeta.mode;
    }
    this.requestRender();
    return result;
  }

  async handleAction(actionNode = null) {
    if (!actionNode || actionNode.disabled) return false;
    const action = normalizeText(actionNode.dataset && actionNode.dataset.seasonOpsAction);
    if (!action.startsWith("authoritative-")) return false;
    if (this.isBusy()) return true;
    if (action === "authoritative-select-mode") {
      await this.selectMode(actionNode.dataset.mode);
      return true;
    }
    if (action === "authoritative-refresh") {
      await this.refreshProjection();
      return true;
    }
    if (action === "authoritative-login") {
      this.requestLogin();
      return true;
    }
    if (action === "authoritative-return-relay") {
      if (typeof this.onRelayExpeditionReturn === "function") this.onRelayExpeditionReturn();
      return true;
    }
    if (action === "authoritative-return-chronicle") {
      if (typeof this.onFateChronicleReturn === "function") this.onFateChronicleReturn();
      return true;
    }
    if (action === "authoritative-begin") {
      await this.beginRun();
      return true;
    }
    if (action === "authoritative-begin-new") {
      await this.beginRun({ forceNew: true });
      return true;
    }
    if (action === "authoritative-select-node") {
      await this.submitAction("select_node", { nodeId: actionNode.dataset.nodeId });
      return true;
    }
    if (action === "authoritative-play-card") {
      await this.submitAction("play_card", { cardInstanceId: actionNode.dataset.cardInstanceId });
      return true;
    }
    if (action === "authoritative-end-turn") {
      await this.submitAction("end_turn", {});
      return true;
    }
    if (action === "authoritative-choose-reward") {
      await this.submitAction("choose_reward", { rewardId: actionNode.dataset.rewardId });
      return true;
    }
    if (action === "authoritative-settle") {
      await this.settleRun();
      return true;
    }
    if (action === "authoritative-abandon") {
      await this.abandonRun();
      return true;
    }
    return false;
  }

  render() {
    return `
      <div class="season-ops-authoritative-panel" data-authoritative-mode="${escapeHtml(this.getCurrentMode())}">
        ${this.renderModeSection()}
        ${this.renderBody()}
      </div>
    `;
  }

  renderModeSection() {
    const buttons = MODES.filter(mode => this.shouldShowMode(mode)).map(mode => {
      const meta = MODE_META[mode];
      const selected = this.getCurrentMode() === mode;
      return `
        <button
          type="button"
          class="season-ops-authoritative-mode-btn ${selected ? "active" : ""}"
          data-season-ops-action="authoritative-select-mode"
          data-mode="${escapeHtml(mode)}"
          data-season-ops-focus-key="${escapeHtml(buildFocusKey("authoritative:mode", mode))}"
          aria-pressed="${selected ? "true" : "false"}"
          ${this.isBusy() ? "disabled" : ""}
        >
          <span class="season-ops-authoritative-mode-label">${escapeHtml(meta.label)}</span>
          <span class="season-ops-authoritative-mode-short">${escapeHtml(meta.shortLabel)}</span>
        </button>
      `;
    }).join("");
    const modeMeta = MODE_META[this.getCurrentMode()];
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>权威试炼</h3>
            <p>浏览器只提交命令，路线、敌意、伤害、奖励、终态与结算都由服务器裁定。</p>
          </div>
          <div class="season-ops-counter-chip">天道裁定</div>
        </div>
        <div class="season-ops-authoritative-mode-picker" role="group" aria-label="权威试炼模式">
          ${buttons}
        </div>
        <div class="season-ops-authoritative-mode-copy">
          <strong>${escapeHtml(modeMeta.label)}</strong>
          <span>${escapeHtml(modeMeta.summary)}</span>
          <div class="season-ops-authoritative-tag-row">
            ${modeMeta.tags.map(tag => renderChip(tag)).join("")}
          </div>
        </div>
      </section>
    `;
  }

  renderBody() {
    const expectedUserId = normalizeText(this.getCurrentUserId());
    if (!expectedUserId) {
      return this.renderStateCard(
        "未登录",
        "权威试炼只接受已登录账号的签名命令。登录后才能读取或恢复服务器卷面。",
        `<button type="button" class="menu-btn primary season-ops-state-btn" data-season-ops-action="authoritative-login">前往账号入口</button>`
      );
    }
    const projection = this.getCurrentProjection();
    const error = this.serviceState && this.serviceState.lastError
      || (this.getCurrentMode() === "challenge_ladder" && this.challengeLadderState && this.challengeLadderState.lastError)
      || (this.getCurrentMode() === "world_rift" && this.worldRiftState && this.worldRiftState.lastError)
      || (this.getCurrentMode() === "relay_expedition" && this.relayExpeditionState && this.relayExpeditionState.lastError)
      || (this.getCurrentMode() === "fate_chronicle" && this.fateChronicleState && this.fateChronicleState.lastError)
      || null;
    if (this.isBusy() && !projection) {
      return this.renderStateCard(
        "加载中",
        "正在向服务器恢复该模式的权威卷面，客户端不会本地推演任何战斗或奖励。"
      );
    }
    if (!projection && error) {
      return this.renderErrorCard(error);
    }
    if (!projection || !this.lastRunMeta) {
      return this.renderNoRunCard();
    }
    return `
      ${this.renderStatusBanner(error)}
      ${this.renderRunOverview()}
      ${this.renderPhaseSection()}
    `;
  }

  renderStateCard(title = "", description = "", actions = "") {
    return `
      <div class="season-ops-state-panel season-ops-authoritative-state" role="status" aria-live="polite">
        <div class="season-ops-state-kicker">权威试炼</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        ${actions ? `<div class="season-ops-state-actions">${actions}</div>` : ""}
      </div>
    `;
  }

  renderErrorCard(error = null) {
    const message = normalizeText(error && error.message, "权威试炼读取失败。");
    return `
      <div class="season-ops-state-panel season-ops-authoritative-state" role="alert" aria-live="assertive">
        <div class="season-ops-state-kicker">权威试炼</div>
        <h3>读取失败</h3>
        <p>${escapeHtml(message)}</p>
        <div class="season-ops-state-actions">
          <button
            type="button"
            class="menu-btn primary season-ops-state-btn"
            data-season-ops-action="authoritative-refresh"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.refresh)}"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "重试中..." : "重试"}</button>
        </div>
      </div>
    `;
  }

  renderNoRunCard() {
    if (this.isRelayExpeditionMode()) {
      return this.renderRelayExpeditionNoRunCard();
    }
    if (this.isFateChronicleMode()) {
      return this.renderFateChronicleNoRunCard();
    }
    const modeMeta = MODE_META[this.getCurrentMode()];
    const ladderContext = this.getCurrentMode() === "challenge_ladder" ? this.renderChallengeLadderContext() : "";
    const worldRiftContext = this.getCurrentMode() === "world_rift" ? this.renderWorldRiftContext() : "";
    const isBoundFormalMode = ["challenge_ladder", "world_rift"].includes(this.getCurrentMode());
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>${escapeHtml(modeMeta.label)}</h3>
            <p>${escapeHtml(modeMeta.summary)}</p>
          </div>
          <div class="season-ops-counter-chip">无进行中 run</div>
        </div>
        <div class="season-ops-inline-note">
          ${this.getCurrentMode() === "challenge_ladder"
            ? "当前没有可恢复的正式赛道卷面。发车会消耗一次本周额度，并绑定全服一致的种子槽。"
            : this.getCurrentMode() === "world_rift"
              ? "当前没有可恢复的裂隙卷面。发车会消耗一次本周额度，并把完整重放贡献原子写入真实全服首领。"
              : "当前模式没有可恢复的服务器卷面。开始后每一步都只以服务器投影为准，网络失败也不会本地前推。"}
        </div>
        ${ladderContext}
        ${worldRiftContext}
        <div class="season-ops-state-actions season-ops-authoritative-inline-actions">
          <button
            type="button"
            class="season-ops-inline-btn is-claimable"
            data-season-ops-action="authoritative-begin"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.begin)}"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "发车中..." : isBoundFormalMode ? "消耗一次正式额度发车" : "开始本模式试炼"}</button>
          <button
            type="button"
            class="season-ops-inline-btn"
            data-season-ops-action="authoritative-refresh"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.refresh)}"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "恢复中..." : "恢复服务器卷面"}</button>
        </div>
      </section>
    `;
  }

  renderRelayExpeditionNoRunCard() {
    const session = this.getRelaySession();
    const leg = this.getRelayCurrentLeg();
    const milestoneCount = Array.isArray(session && session.rewardMilestones)
      ? session.rewardMilestones.length
      : Array.isArray(session && session.milestones)
        ? session.milestones.length
        : 0;
    const currentLegIndex = clampInt(
      session && Object.prototype.hasOwnProperty.call(session, "currentLegIndex")
        ? session.currentLegIndex
        : leg && Object.prototype.hasOwnProperty.call(leg, "legIndex")
          ? leg.legIndex
          : 0,
      0
    );
    const displayLegIndex = Math.max(1, Math.min(4, currentLegIndex || 1));
    const routeScore = clampInt(session && (session.totalScore ?? session.routeScore));
    const processedLegs = clampInt(session && (session.processedLegs ?? session.completedLegs));
    const legStatus = normalizeText(leg && leg.status, "queued");
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>同道远征共享态</h3>
            <p>接力谱、路线分和棒次共享；残血、手牌、弃牌堆与临时状态不共享。</p>
          </div>
          <div class="season-ops-counter-chip">${session ? "共享卷面已恢复" : "尚未开跑"}</div>
        </div>
        <div class="season-ops-authoritative-meta-row">
          ${session ? renderChip(`第 ${displayLegIndex} / 4 棒`) : ""}
          ${session ? renderChip(`路线分 ${routeScore}`) : ""}
          ${session ? renderChip(`已处理 ${processedLegs} 棒`) : ""}
          ${session ? renderChip(`里程碑 ${milestoneCount}`) : ""}
          ${session && leg ? renderChip(`当前状态 ${legStatus}`) : ""}
        </div>
        <div class="season-ops-inline-note">
          ${session
            ? "接棒、让棒、奖励领取与下一棒调度都在道友录的小队工作区完成；这里仅恢复当前绑定的权威卷面。"
            : "当前没有可恢复的同道远征权威卷面。请回到道友录的小队页开跑、接棒或查看共享路线。"}
        </div>
        <div class="season-ops-state-actions season-ops-authoritative-inline-actions">
          <button
            type="button"
            class="season-ops-inline-btn"
            data-season-ops-action="authoritative-return-relay"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.returnRelay)}"
          >返回同道远征工作区</button>
          <button
            type="button"
            class="season-ops-inline-btn"
            data-season-ops-action="authoritative-refresh"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.refresh)}"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "恢复中..." : "恢复共享状态"}</button>
        </div>
      </section>
    `;
  }

  renderFateChronicleNoRunCard() {
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>命途长卷</h3>
            <p>当前没有可恢复的长卷战斗。章节、誓约、解锁和失败重试都在长卷工作区处理。</p>
          </div>
          <div class="season-ops-counter-chip">未发车</div>
        </div>
        <div class="season-ops-inline-note">长卷不扣正式次数。回到工作区选择已解锁章节与誓约后，服务器才会生成绑定卷面。</div>
        <div class="season-ops-state-actions season-ops-authoritative-inline-actions">
          <button
            type="button"
            class="season-ops-inline-btn is-claimable"
            data-season-ops-action="authoritative-return-chronicle"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.returnChronicle)}"
          >返回命途长卷</button>
          <button
            type="button"
            class="season-ops-inline-btn"
            data-season-ops-action="authoritative-refresh"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.refresh)}"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "恢复中..." : "检查可恢复卷面"}</button>
        </div>
      </section>
    `;
  }

  renderChallengeLadderContext() {
    const current = this.challengeLadderState && this.challengeLadderState.current;
    if (!current || typeof current !== "object") {
      return `<div class="season-ops-inline-note">正在等待本周权威轮换；正式榜不可用时仍可返回挑战观察站进行离线练习。</div>`;
    }
    const rotation = current.rotation && typeof current.rotation === "object" ? current.rotation : current;
    const attemptLimit = clampInt(current.allowance?.attemptLimit ?? current.attemptLimit ?? rotation.attemptLimit, 3);
    const remainingAttempts = clampInt(
      current.allowance?.remainingAttempts
        ?? current.remainingAttempts
        ?? current.attempts?.remaining
        ?? Math.max(0, attemptLimit - clampInt(current.allowance?.usedAttempts ?? current.attemptsUsed ?? current.attempts?.used)),
      0
    );
    const personalBest = current.personalBest || current.self || null;
    const score = clampInt(personalBest && (personalBest.officialScore ?? personalBest.score));
    const rank = clampInt(current.leaderboard?.myRank?.rank ?? personalBest?.rank ?? current.myRank?.rank ?? current.myRank);
    return `
      <div class="season-ops-authoritative-meta-row" data-challenge-ladder-context>
        ${renderChip(normalizeText(rotation.title, "本周众生试炼"))}
        ${renderChip(`正式次数 ${remainingAttempts}/${attemptLimit}`)}
        ${renderChip(score > 0 ? `个人最佳 ${score}` : "尚无正式成绩")}
        ${rank > 0 ? renderChip(`当前第 ${rank} 名`) : ""}
        ${renderChip("离线练习不计榜")}
      </div>
    `;
  }

  renderWorldRiftContext() {
    const current = this.worldRiftState && this.worldRiftState.current;
    if (!current || typeof current !== "object") {
      return `<div class="season-ops-inline-note">正在等待本周天穹裂隙；正式世界状态不可用时不会回退到本地模拟数据。</div>`;
    }
    const rotation = current.rotation && typeof current.rotation === "object" ? current.rotation : current;
    const world = current.world && typeof current.world === "object"
      ? current.world
      : current.worldState && typeof current.worldState === "object"
        ? current.worldState
        : this.worldRiftState.world && typeof this.worldRiftState.world === "object"
          ? this.worldRiftState.world
          : {};
    const attemptLimit = clampInt(current.allowance?.attemptLimit ?? current.attemptLimit ?? rotation.attemptLimit, 5);
    const remainingAttempts = clampInt(
      current.allowance?.remainingAttempts
        ?? current.remainingAttempts
        ?? current.attempts?.remaining
        ?? Math.max(0, attemptLimit - clampInt(current.allowance?.usedAttempts ?? current.attemptsUsed ?? current.attempts?.used)),
      0
    );
    const personal = current.personal || current.personalContribution || current.entry || current.self
      || this.worldRiftState.contribution
      || this.worldRiftState.leaderboard?.self
      || null;
    const ranked = clampInt(personal && (personal.rankedContribution ?? personal.rankScore ?? personal.score));
    const totalHp = clampInt(world.totalHp ?? rotation.totalHp, 10000);
    const appliedDamage = clampInt(world.appliedDamage ?? world.damage, 0, totalHp);
    const remainingHp = clampInt(world.remainingHp ?? Math.max(0, totalHp - appliedDamage), 0, totalHp);
    const phaseLabel = normalizeText(world.phaseTitle || world.currentPhase?.title || world.phaseName,
      world.cleared || String(world.status || "").startsWith("echo") ? "余响阶段" : `第 ${clampInt(world.currentPhaseIndex, 1, 3)} 阶段`);
    return `
      <div class="season-ops-authoritative-meta-row" data-world-rift-context>
        ${renderChip(normalizeText(rotation.title, "本周天穹裂隙"))}
        ${renderChip(`正式次数 ${remainingAttempts}/${attemptLimit}`)}
        ${renderChip(`${phaseLabel} · 剩余 ${remainingHp}/${totalHp}`)}
        ${renderChip(ranked > 0 ? `最佳三次 ${ranked}` : "尚无正式贡献")}
        ${renderChip(world.cleared || String(world.status || "").startsWith("echo") ? "已击破 · 余响可继续" : "全服真实推进")}
      </div>
    `;
  }

  renderStatusBanner(error = null) {
    if (!error || !error.message) return "";
    return `
      <div class="season-ops-notice tone-danger" role="alert" aria-live="assertive">
        ${escapeHtml(error.message)}
      </div>
    `;
  }

  renderRunOverview() {
    const projection = this.getCurrentProjection();
    const statusMeta = formatStatus(this.getStatus());
    const phaseMeta = formatPhase(this.getProjectionPhase());
    const integrity = this.lastRunMeta && this.lastRunMeta.integrity ? this.lastRunMeta.integrity : {};
    const recovery = this.lastRunMeta && this.lastRunMeta.recovery ? this.lastRunMeta.recovery : {};
    const player = projection && projection.player ? projection.player : {};
    const relayLeg = this.getRelayCurrentLeg();
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>${escapeHtml(MODE_META[this.getCurrentMode()].label)}</h3>
            <p>run ${escapeHtml(this.lastRunMeta.runId)} · ${escapeHtml(this.lastRunMeta.reportVersion || "authoritative-run-v2")}</p>
          </div>
          <div class="season-ops-authoritative-status-group">
            <span class="season-ops-counter-chip tone-${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span>
            <span class="season-ops-counter-chip tone-${escapeHtml(phaseMeta.tone)}">${escapeHtml(phaseMeta.label)}</span>
          </div>
        </div>
        <div class="season-ops-authoritative-stats-grid">
          ${this.renderStatTile("服务器版本", `v${projection.version}`, `动作 ${this.lastRunMeta.actionCount} · 协议 ${this.lastRunMeta.protocolVersion}`)}
          ${this.renderStatTile("玩家状态", `${clampInt(player.hp)}/${clampInt(player.maxHp)} HP`, `格挡 ${clampInt(player.block)} · 能量 ${clampInt(player.energy)}`)}
          ${this.renderStatTile("手牌与牌堆", `${normalizeArray(player.hand).length} 手牌`, `抽牌堆 ${clampInt(player.drawPileCount)} · 弃牌堆 ${clampInt(player.discardPileCount)}`)}
          ${this.renderStatTile("恢复与时效", `${clampInt(recovery.recoveryCount)} 次恢复`, this.lastRunMeta.expiresAt > 0 ? `到期 ${formatUtcDateTime(this.lastRunMeta.expiresAt, { compact: true })}` : "等待服务器时限")}
        </div>
        <div class="season-ops-authoritative-meta-row">
          ${renderChip(`内容 ${this.lastRunMeta.contentVersion}`)}
          ${renderChip(`内容哈希 ${shortHash(this.lastRunMeta.contentHash)}`)}
          ${renderChip(`状态哈希 ${shortHash(integrity.stateHash)}`)}
          ${renderChip(`链首 ${shortHash(integrity.chainHead)}`)}
          ${renderChip(formatTrustTier(this.lastRunMeta.trustTier))}
          ${this.isRelayExpeditionMode() && relayLeg ? renderChip(`第 ${clampInt(relayLeg.legIndex, 1)} 棒`) : ""}
          ${this.isRelayExpeditionMode() && relayLeg && relayLeg.tacticId ? renderChip(`接力谱 ${relayLeg.tacticId}`) : ""}
        </div>
        ${this.getCurrentMode() === "challenge_ladder" ? this.renderChallengeLadderContext() : ""}
        ${this.getCurrentMode() === "world_rift" ? this.renderWorldRiftContext() : ""}
      </section>
    `;
  }

  renderStatTile(label = "", value = "", hint = "") {
    return `
      <article class="season-ops-authoritative-stat">
        <div class="season-ops-summary-label">${escapeHtml(label)}</div>
        <div class="season-ops-summary-value">${escapeHtml(value)}</div>
        <div class="season-ops-summary-hint">${escapeHtml(hint)}</div>
      </article>
    `;
  }

  renderPhaseSection() {
    const phase = this.getProjectionPhase();
    if (phase === "route") return this.renderRoutePhase();
    if (phase === "battle") return this.renderBattlePhase();
    if (phase === "reward") return this.renderRewardPhase();
    if (phase === "completed") return this.renderCompletedPhase();
    if (phase === "defeated" || phase === "abandoned") return this.renderTerminalPhase();
    return this.renderStateCard("待命", "服务器暂未返回可展示的权威投影。");
  }

  renderRoutePhase() {
    const projection = this.getCurrentProjection();
    const route = projection && projection.route ? projection.route : {};
    const choices = normalizeArray(route.choices);
    const history = normalizeArray(route.completedNodes);
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>路线选择</h3>
            <p>服务器只开放当前两条候选节点；客户端只能选择其一，不能改写敌人与奖励池。</p>
          </div>
          <div class="season-ops-counter-chip">第 ${clampInt(route.stage, 1)} / ${clampInt(route.totalStages, 3)} 站</div>
        </div>
        <div class="season-ops-authoritative-choice-grid">
          ${choices.map(choice => this.renderRouteChoice(choice)).join("") || `<div class="season-ops-inline-empty">当前没有可选路线，请恢复服务器卷面。</div>`}
        </div>
        ${history.length > 0 ? `
          <div class="season-ops-authoritative-history">
            <strong>已通过节点</strong>
            <div class="season-ops-authoritative-history-list">
              ${history.map(node => renderChip(`${node.nodeType} · ${node.enemyId}${node.boss ? " · 首领" : ""}`)).join("")}
            </div>
          </div>
        ` : ""}
        ${this.renderFooterActions({ canAbandon: true })}
      </section>
    `;
  }

  renderRouteChoice(choice = {}) {
    const focusKey = buildFocusKey("authoritative:node", choice.nodeId);
    return `
      <article class="season-ops-authoritative-choice-card" tabindex="-1" data-season-ops-focus-fallback="${escapeHtml(focusKey)}">
        <div class="season-ops-authoritative-choice-top">
          <strong>${escapeHtml(choice.name || choice.enemyId || "未知节点")}</strong>
          <span class="season-ops-meta-chip">${escapeHtml(choice.threat || choice.type || "路线")}</span>
        </div>
        <p>${escapeHtml(`节点 ${choice.type || "route"} · 敌人上限 ${clampInt(choice.maxHp)} HP${choice.boss ? " · 首领" : ""}`)}</p>
        <button
          type="button"
          class="season-ops-inline-btn is-claimable"
          data-season-ops-action="authoritative-select-node"
          data-season-ops-focus-key="${escapeHtml(focusKey)}"
          ${buildDataAttributes({ "data-node-id": choice.nodeId })}
          ${this.isBusy() ? "disabled" : ""}
        >${this.isBusy() ? "提交中..." : "选择此路"}</button>
      </article>
    `;
  }

  renderBattlePhase() {
    const projection = this.getCurrentProjection();
    const battle = projection && projection.battle ? projection.battle : {};
    const player = projection && projection.player ? projection.player : {};
    const enemy = battle && battle.enemy ? battle.enemy : {};
    const hand = normalizeArray(player.hand);
    const intent = enemy && enemy.intent ? enemy.intent : null;
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>战斗投影</h3>
            <p>敌方下一手意图由服务器公开。客户端只能从当前权威手牌里出牌，绝不本地演算伤害。</p>
          </div>
          <div class="season-ops-counter-chip">回合 ${clampInt(battle.turn, 1)}</div>
        </div>
        <div class="season-ops-authoritative-battle-grid">
          <article class="season-ops-authoritative-combatant">
            <div class="season-ops-authoritative-combatant-head">
              <strong>我方</strong>
              <span class="season-ops-meta-chip">能量 ${clampInt(player.energy)}</span>
            </div>
            <div class="season-ops-authoritative-vitals">
              ${renderChip(`HP ${clampInt(player.hp)}/${clampInt(player.maxHp)}`)}
              ${renderChip(`格挡 ${clampInt(player.block)}`)}
              ${renderChip(`手牌 ${hand.length}`)}
              ${renderChip(`牌库 ${clampInt(player.drawPileCount)}`)}
            </div>
          </article>
          <article class="season-ops-authoritative-combatant">
            <div class="season-ops-authoritative-combatant-head">
              <strong>${escapeHtml(enemy.name || enemy.enemyId || "敌方")}</strong>
              <span class="season-ops-meta-chip">${escapeHtml(battle.nodeType || "battle")}</span>
            </div>
            <div class="season-ops-authoritative-vitals">
              ${renderChip(`HP ${clampInt(enemy.hp)}/${clampInt(enemy.maxHp)}`)}
              ${renderChip(`格挡 ${clampInt(enemy.block)}`)}
              ${renderChip(`易伤 ${clampInt(enemy.vulnerable)}`)}
              ${renderChip(`意图 ${normalizeText(intent && intent.label, "未公开")}`)}
            </div>
            ${intent ? `<div class="season-ops-authoritative-intent">${escapeHtml(this.describeEnemyIntent(intent))}</div>` : ""}
          </article>
        </div>
        <div class="season-ops-authoritative-hand-grid">
          ${hand.map(card => this.renderHandCard(card, player.energy)).join("") || `<div class="season-ops-inline-empty">当前权威手牌为空，可直接结束回合。</div>`}
        </div>
        ${this.renderLastReceipt()}
        ${this.renderFooterActions({ canEndTurn: true, canAbandon: true })}
      </section>
    `;
  }

  renderHandCard(card = {}, energy = 0) {
    const playable = clampInt(card.cost, 0) <= clampInt(energy, 0);
    const focusKey = buildFocusKey("authoritative:card", card.instanceId);
    return `
      <article class="season-ops-authoritative-hand-card ${playable ? "is-playable" : "is-locked"}" tabindex="-1" data-season-ops-focus-fallback="${escapeHtml(focusKey)}">
        <div class="season-ops-authoritative-card-top">
          <strong>${escapeHtml(card.name || card.cardId || "未知牌")}</strong>
          <span class="season-ops-authoritative-card-cost">${clampInt(card.cost)}</span>
        </div>
        <p>${escapeHtml(card.description || "服务器未提供描述。")}</p>
        <button
          type="button"
          class="season-ops-inline-btn ${playable ? "is-claimable" : "is-muted"}"
          data-season-ops-action="authoritative-play-card"
          data-season-ops-focus-key="${escapeHtml(focusKey)}"
          ${buildDataAttributes({ "data-card-instance-id": card.instanceId })}
          ${!playable || this.isBusy() ? "disabled" : ""}
        >${this.isBusy() ? "等待服务器..." : playable ? "打出此牌" : "能量不足"}</button>
      </article>
    `;
  }

  renderRewardPhase() {
    const projection = this.getCurrentProjection();
    const reward = projection && projection.reward ? projection.reward : {};
    const choices = normalizeArray(reward.choices);
    const scenario = projection && projection.scenario ? projection.scenario : {};
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>战后奖励</h3>
            <p>奖励项由服务器生成。选择后才会进入下一站，客户端不会本地补卡或回血。</p>
          </div>
          <div class="season-ops-counter-chip">整备 ${clampInt(scenario.betweenEncounterHeal)} HP</div>
        </div>
        <div class="season-ops-authoritative-choice-grid">
          ${choices.map(choice => this.renderRewardChoice(choice)).join("") || `<div class="season-ops-inline-empty">当前没有可选奖励，请恢复服务器卷面。</div>`}
        </div>
        ${this.renderLastReceipt()}
        ${this.renderFooterActions({ canAbandon: true })}
      </section>
    `;
  }

  renderRewardChoice(choice = {}) {
    const focusKey = buildFocusKey("authoritative:reward", choice.rewardId);
    return `
      <article class="season-ops-authoritative-choice-card" tabindex="-1" data-season-ops-focus-fallback="${escapeHtml(focusKey)}">
        <div class="season-ops-authoritative-choice-top">
          <strong>${escapeHtml(choice.name || choice.rewardId || "未知奖励")}</strong>
          <span class="season-ops-meta-chip">${escapeHtml(choice.kind || "reward")}</span>
        </div>
        <p>${escapeHtml(choice.description || "服务器未提供奖励描述。")}</p>
        <button
          type="button"
          class="season-ops-inline-btn is-claimable"
          data-season-ops-action="authoritative-choose-reward"
          data-season-ops-focus-key="${escapeHtml(focusKey)}"
          ${buildDataAttributes({ "data-reward-id": choice.rewardId })}
          ${this.isBusy() ? "disabled" : ""}
        >${this.isBusy() ? "提交中..." : "领取此项"}</button>
      </article>
    `;
  }

  renderCompletedPhase() {
    const settled = normalizeText(this.getStatus()) === "settled" || clampInt(this.lastRunMeta && this.lastRunMeta.settledAt) > 0;
    const summary = this.getCurrentProjection() && this.getCurrentProjection().summary ? this.getCurrentProjection().summary : {};
    const receipt = this.lastReceipt || (this.lastRunMeta && this.lastRunMeta.receipt) || null;
    const isRelay = this.isRelayExpeditionMode();
    const isChronicle = this.isFateChronicleMode();
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>${settled ? (isRelay ? "已完成权威结算" : "已结算归档") : (isRelay ? "待投影共享路线" : "待提交结算")}</h3>
            <p>${settled
              ? (isRelay ? "这条接力 run 已完成服务端结算，下一步会把结果投影回共享路线。" : "这条 run 已写入赛季进度与权威计数。")
              : (isRelay ? "服务器已确认本棒通关；结算后会直接投影回同道远征共享状态。" : "服务器已确认通关，但赛季进度还要等完整重放结算通过。")}</p>
          </div>
          <div class="season-ops-counter-chip">${escapeHtml(summary.grade || "未评级")}</div>
        </div>
        ${this.renderSummaryGrid(summary)}
        ${this.renderSettlementCard(receipt, settled)}
        ${this.renderRouteHistory()}
        <div class="season-ops-state-actions season-ops-authoritative-inline-actions">
          ${!settled ? `
            <button
              type="button"
              class="season-ops-inline-btn is-claimable"
              data-season-ops-action="authoritative-settle"
              data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.settle)}"
              ${this.isBusy() ? "disabled" : ""}
            >${this.isBusy() ? "结算中..." : isRelay ? "结算并投影到共享路线" : isChronicle ? "结算并归入长卷" : "提交正式结算"}</button>
          ` : isChronicle ? `
            <button
              type="button"
              class="season-ops-inline-btn is-claimable"
              data-season-ops-action="authoritative-return-chronicle"
              data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.returnChronicle)}"
            >返回命途长卷</button>
          ` : !isRelay ? `
            <button
              type="button"
              class="season-ops-inline-btn is-claimable"
              data-season-ops-action="authoritative-begin-new"
              data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.begin)}"
              ${this.isBusy() ? "disabled" : ""}
            >${this.isBusy() ? "发车中..." : "再开一局"}</button>
          ` : `
            <button
              type="button"
              class="season-ops-inline-btn"
              data-season-ops-action="authoritative-return-relay"
              data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.returnRelay)}"
            >返回同道远征工作区</button>
          `}
          <button
            type="button"
            class="season-ops-inline-btn"
            data-season-ops-action="authoritative-refresh"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.refresh)}"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "恢复中..." : "恢复服务器卷面"}</button>
        </div>
      </section>
    `;
  }

  renderTerminalPhase() {
    const projection = this.getCurrentProjection();
    const summary = projection && projection.summary ? projection.summary : {};
    const abandoned = projection && projection.phase === "abandoned";
    const isRelay = this.isRelayExpeditionMode();
    const isChronicle = this.isFateChronicleMode();
    return `
      <section class="season-ops-section-card season-ops-authoritative-section">
        <div class="season-ops-section-head">
          <div>
            <h3>${abandoned ? "试炼已放弃" : isRelay ? "本棒已结束" : "试炼已结束"}</h3>
            <p>${abandoned
              ? "这条权威路线已被主动封卷，不再接受后续操作。"
              : isRelay
                ? "服务器已确认本棒终态；共享路线推进与下一棒安排回到同道远征工作区处理。"
                : "服务器已确认败退终态，客户端只展示最终投影。"} </p>
          </div>
          <div class="season-ops-counter-chip">${escapeHtml(summary.reason || "terminal")}</div>
        </div>
        ${this.renderSummaryGrid(summary)}
        ${this.renderRouteHistory()}
        <div class="season-ops-state-actions season-ops-authoritative-inline-actions">
          ${isRelay ? `
            <button
              type="button"
              class="season-ops-inline-btn"
              data-season-ops-action="authoritative-return-relay"
              data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.returnRelay)}"
            >返回同道远征工作区</button>
          ` : isChronicle ? `
            <button
              type="button"
              class="season-ops-inline-btn is-claimable"
              data-season-ops-action="authoritative-return-chronicle"
              data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.returnChronicle)}"
            >返回长卷重试</button>
          ` : `
            <button
              type="button"
              class="season-ops-inline-btn is-claimable"
              data-season-ops-action="authoritative-begin-new"
              data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.begin)}"
              ${this.isBusy() ? "disabled" : ""}
            >${this.isBusy() ? "发车中..." : "重新开始本模式"}</button>
          `}
          <button
            type="button"
            class="season-ops-inline-btn"
            data-season-ops-action="authoritative-refresh"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.refresh)}"
            ${this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "恢复中..." : "恢复服务器卷面"}</button>
        </div>
      </section>
    `;
  }

  renderSummaryGrid(summary = {}) {
    return `
      <div class="season-ops-authoritative-stats-grid">
        ${this.renderStatTile("评分", `${clampInt(summary.score)} 分`, `评级 ${normalizeText(summary.grade, "未评级")}`)}
        ${this.renderStatTile("通过战斗", `${clampInt(summary.encountersWon)}`, `首领 ${clampInt(summary.bossWins)} 胜`)}
        ${this.renderStatTile("回合数", `${clampInt(summary.turns)}`, `出牌 ${clampInt(summary.cardsPlayed)} 张`)}
        ${this.renderStatTile("生命收支", `${clampInt(summary.remainingHp)}/${clampInt(summary.maxHp)} HP`, `受伤 ${clampInt(summary.damageTaken)} · 输出 ${clampInt(summary.damageDealt)}`)}
      </div>
    `;
  }

  renderSettlementCard(receipt = null, settled = false) {
    const effectiveReceipt = receipt && typeof receipt === "object" ? receipt : null;
    const progressDelta = effectiveReceipt && effectiveReceipt.progressDelta ? effectiveReceipt.progressDelta : null;
    const integrity = effectiveReceipt && effectiveReceipt.integrity ? effectiveReceipt.integrity : null;
    const isRelay = this.isRelayExpeditionMode();
    return `
      <article class="season-ops-authoritative-settlement">
        <div class="season-ops-authoritative-choice-top">
          <strong>${settled ? "结算回执" : "待结算摘要"}</strong>
          ${effectiveReceipt ? `<span class="season-ops-meta-chip">${escapeHtml(shortHash(effectiveReceipt.receiptId || effectiveReceipt.actionId || ""))}</span>` : ""}
        </div>
        <div class="season-ops-authoritative-meta-row">
          ${progressDelta ? renderChip(`战斗胜利 +${clampInt(progressDelta.battleWins)}`) : ""}
          ${progressDelta ? renderChip(`首领胜利 +${clampInt(progressDelta.bossWins)}`) : ""}
          ${progressDelta ? renderChip(`历练完成 +${clampInt(progressDelta.activityCompletions)}`) : ""}
          ${effectiveReceipt && effectiveReceipt.settledAt ? renderChip(`结算 ${formatUtcDateTime(effectiveReceipt.settledAt, { compact: true })}`) : ""}
          ${integrity ? renderChip(`回放 ${integrity.fullReplayPassed ? "通过" : "未通过"}`) : ""}
        </div>
        <p class="season-ops-inline-note">${escapeHtml(
          settled
            ? (isRelay ? "服务器已完成完整重放校验；投影后会把本棒摘要写回共享路线。" : "服务器已完成完整重放校验，并把这条 run 记入权威赛季进度。")
            : (isRelay ? "只有完整重放与状态哈希一致时，服务器才会允许把本棒结果投影回同道远征。" : "只有完整重放与状态哈希一致时，服务器才会把这条 run 写入正式历练。")
        )}</p>
      </article>
    `;
  }

  renderRouteHistory() {
    const projection = this.getCurrentProjection();
    const history = normalizeArray(projection && projection.route && projection.route.completedNodes);
    if (!history.length) return "";
    return `
      <article class="season-ops-authoritative-settlement">
        <div class="season-ops-authoritative-choice-top">
          <strong>路线留痕</strong>
          <span class="season-ops-meta-chip">${history.length} 节点</span>
        </div>
        <div class="season-ops-authoritative-history-list">
          ${history.map(node => renderChip(`${node.nodeType} · ${node.enemyId}${node.boss ? " · 首领" : ""}`)).join("")}
        </div>
      </article>
    `;
  }

  renderLastReceipt() {
    const receipt = this.lastReceipt;
    if (!receipt || typeof receipt !== "object") return "";
    const events = normalizeArray(receipt.events);
    if (!events.length) return "";
    return `
      <article class="season-ops-authoritative-settlement">
        <div class="season-ops-authoritative-choice-top">
          <strong>最近服务器回执</strong>
          <span class="season-ops-meta-chip">${escapeHtml(receipt.command || receipt.resultPhase || "receipt")}</span>
        </div>
        <div class="season-ops-authoritative-event-list">
          ${events.slice(-4).map(event => `<div class="season-ops-authoritative-event-row">${escapeHtml(this.describeEvent(event))}</div>`).join("")}
        </div>
        ${receipt.acceptedAt ? `<div class="season-ops-inline-note">确认时间 ${escapeHtml(formatUtcDateTime(receipt.acceptedAt, { compact: true }))}</div>` : ""}
      </article>
    `;
  }

  renderFooterActions({ canEndTurn = false, canAbandon = false } = {}) {
    const projection = this.getCurrentProjection();
    const allowed = new Set(normalizeArray(projection && projection.allowedCommands));
    return `
      <div class="season-ops-state-actions season-ops-authoritative-inline-actions">
        ${canEndTurn ? `
          <button
            type="button"
            class="season-ops-inline-btn is-claimable"
            data-season-ops-action="authoritative-end-turn"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.endTurn)}"
            ${!allowed.has("end_turn") || this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "等待服务器..." : "结束本回合"}</button>
        ` : ""}
        <button
          type="button"
          class="season-ops-inline-btn"
          data-season-ops-action="authoritative-refresh"
          data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.refresh)}"
          ${this.isBusy() ? "disabled" : ""}
        >${this.isBusy() ? "恢复中..." : "恢复服务器卷面"}</button>
        ${canAbandon ? `
          <button
            type="button"
            class="season-ops-inline-btn is-muted"
            data-season-ops-action="authoritative-abandon"
            data-season-ops-focus-key="${escapeHtml(FOCUS_KEYS.abandon)}"
            ${!allowed.has("abandon") || this.isBusy() ? "disabled" : ""}
          >${this.isBusy() ? "等待服务器..." : "放弃本次试炼"}</button>
        ` : ""}
      </div>
    `;
  }

  describeEnemyIntent(intent = {}) {
    const label = normalizeText(intent.label, intent.type || "未公开");
    const amount = clampInt(intent.amount, 0);
    const block = clampInt(intent.block, 0);
    if (amount > 0 && block > 0) return `${label} · 预计造成 ${amount} 伤害并获得 ${block} 格挡`;
    if (amount > 0) return `${label} · 预计造成 ${amount} 伤害`;
    if (block > 0) return `${label} · 预计获得 ${block} 格挡`;
    return label;
  }

  describeEvent(event = {}) {
    const type = normalizeText(event.type);
    if (type === "encounter_started") return `服务器已锁定遭遇 ${normalizeText(event.enemyId)}。`;
    if (type === "card_played") return `已打出 ${normalizeText(event.cardId)}，伤害 ${clampInt(event.damage)}，格挡 ${clampInt(event.block)}。`;
    if (type === "enemy_intent_resolved") return `敌方意图结算，承受 ${clampInt(event.damageTaken)} 伤害，敌方获得 ${clampInt(event.enemyBlock)} 格挡。`;
    if (type === "reward_chosen") return `已领取奖励 ${normalizeText(event.rewardKind)}。`;
    if (type === "encounter_won") return `已击破 ${normalizeText(event.enemyId)}${event.boss ? "（首领）" : ""}。`;
    if (type === "run_completed") return `服务器确认通关，评分 ${clampInt(event.score)}，评级 ${normalizeText(event.grade)}。`;
    if (type === "run_defeated") return `服务器确认败退，原因 ${normalizeText(event.reason)}。`;
    if (type === "run_abandoned") return "服务器确认本次试炼已放弃。";
    if (type === "player_turn_started") return `服务器已进入第 ${clampInt(event.turn, 1)} 回合。`;
    return JSON.stringify(event);
  }
}
