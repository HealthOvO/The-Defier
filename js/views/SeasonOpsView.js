import { AuthService } from "../services/authService.js";
import { BackendClient, SESSION_STORAGE_KEY } from "../services/backend-client.js";
import { RelayExpeditionService } from "../services/relay-expedition-service.js";
import { AuthoritativeRunPanel } from "./AuthoritativeRunPanel.js";
import { buildDataAttributes, escapeHtml } from "../ui/render-safe.js";

export function loadSeasonOpsStyles() {
  if (typeof import.meta.env !== 'object') return Promise.resolve();
  return import('../../css/season-ops.css');
}

const TAB_ORDER = ["contracts", "store", "leaderboard", "ledger"];
const UI_TAB_ORDER = [...TAB_ORDER, "authoritative"];
const AUTHORITATIVE_TAB_ID = "authoritative";

const TAB_META = {
  contracts: { id: "contracts", label: "契约", icon: "卷" },
  store: { id: "store", label: "外观商店", icon: "藏" },
  leaderboard: { id: "leaderboard", label: "权威榜单", icon: "榜" },
  ledger: { id: "ledger", label: "账本", icon: "簿" },
  authoritative: { id: "authoritative", label: "权威试炼", icon: "试" }
};

const TRUST_META = {
  client_observed: {
    label: "客户端观察",
    shortLabel: "观察",
    tone: "observed",
    note: "仅用于基础目标，不进入正式榜。"
  },
  server_verified: {
    label: "可信封装",
    shortLabel: "可信",
    tone: "verified",
    note: "可信玩法可推进赛季历练，但不写正式榜。"
  },
  server_authoritative: {
    label: "服务端权威",
    shortLabel: "权威",
    tone: "authoritative",
    note: "真人结算与权威试炼可推进权威契约；只有真人排位进入正式榜。"
  }
};

const CYCLE_META = {
  daily: {
    label: "日常契约",
    empty: "今日尚未出现可展示的契约。",
    summary: "UTC 00:00 换卷，适合处理基础推进。"
  },
  weekly: {
    label: "周契约",
    empty: "本周尚无可展示的周契约。",
    summary: "周一 UTC 00:00 换卷，适合多玩法推进。"
  },
  season: {
    label: "赛季契约",
    empty: "当前赛季暂无赛季契约。",
    summary: "长期目标允许补进度，不要求每日清空。"
  }
};

const OFFER_TYPE_META = {
  badge: { label: "徽记", icon: "徽" },
  title: { label: "称号", icon: "称" },
  card_back: { label: "卡背", icon: "背" },
  frame: { label: "边框", icon: "框" },
  banner: { label: "旌旗", icon: "旗" }
};

const SEASON_STATE_META = {
  upcoming: { label: "未开卷", tone: "info" },
  active: { label: "赛季进行中", tone: "success" },
  grace: { label: "领奖宽限期", tone: "warning" },
  ended: { label: "已归档", tone: "muted" },
  inactive: { label: "未开放", tone: "muted" }
};

function clampInt(value, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatSignedNumber(value = 0) {
  const amount = clampInt(value, 0);
  if (amount > 0) return `+${amount}`;
  if (amount < 0) return `${amount}`;
  return "0";
}

function formatRewardImpact(value = "") {
  return normalizeText(value) === "cosmetic_only" ? "仅外观" : "赛季权益";
}

function formatUtcDateTime(timestamp = 0, options = {}) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "未记时";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: options.compact ? undefined : "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: options.dateOnly ? undefined : "2-digit",
    minute: options.dateOnly ? undefined : "2-digit",
    hour12: false
  });
  const text = formatter.format(value).replace(/\//g, "-");
  return options.dateOnly ? `${text} UTC` : `${text} UTC`;
}

function buildFallbackSeasonLabel(season = null) {
  if (!season) return "未开放赛季";
  const title = normalizeText(season.title, "赛季卷面");
  const stateMeta = SEASON_STATE_META[normalizeText(season.state, "inactive")] || SEASON_STATE_META.inactive;
  return `${title} · ${stateMeta.label}`;
}

export class SeasonOpsView {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.containerId = "season-ops-screen";
    this.activeTab = "contracts";
    this.phase = "idle";
    this.dashboard = null;
    this.errorMessage = "";
    this.notice = null;
    this.isRefreshing = false;
    this.isLoadingLedger = false;
    this.boundUserId = "";
    this.requestSeq = 0;
    this.viewGeneration = 0;
    this.ledgerRequestSeq = 0;
    this.pendingClaims = new Set();
    this.pendingPurchases = new Set();
    this.purchaseMutationIds = new Map();
    this.pendingFocusKey = "";
    this.authoritativeRunPanel = new AuthoritativeRunPanel({
      relayExpeditionService: RelayExpeditionService,
      getCurrentUserId: () => this.getCurrentUserId(),
      requestRender: () => this.render(),
      requestLogin: () => this.openLoginModal(),
      requestConfirm: message => this.requestConfirmation(message),
      onRelayExpeditionProjected: result => this.handleRelayExpeditionProjected(result),
      onRelayExpeditionReturn: () => this.handleRelayExpeditionProjected()
    });
    this.boundClickHandler = this.handleClick.bind(this);
    this.boundKeydownHandler = this.handleKeydown.bind(this);
    this.boundStorageHandler = this.handleStorageChange.bind(this);
  }

  getContainer() {
    if (typeof document === "undefined") return null;
    return document.getElementById(this.containerId);
  }

  ensureRoot() {
    const container = this.getContainer();
    if (!container) return null;
    container.classList.add("season-ops-screen");
    if (!container.__seasonOpsBound) {
      container.addEventListener("click", this.boundClickHandler);
      container.addEventListener("keydown", this.boundKeydownHandler);
      container.__seasonOpsBound = true;
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

  show(options = {}) {
    if (options && options.tab) {
      this.setActiveTab(options.tab, { render: false });
    }
    const container = this.ensureRoot();
    if (!container) return Promise.resolve({ success: false, message: "赛季司容器不存在" });
    this.render();
    if (options && options.refresh === false) {
      return Promise.resolve({ success: true, skipped: true });
    }
    return this.refresh({ silent: false });
  }

  async refresh(options = {}) {
    const container = this.ensureRoot();
    if (!container) {
      return { success: false, reason: "season_ops_container_missing", message: "赛季司容器不存在" };
    }

    const expectedUserId = this.getCurrentUserId();
    if (!expectedUserId) {
      this.boundUserId = "";
      this.dashboard = null;
      this.notice = null;
      this.errorMessage = "";
      this.phase = "not_logged_in";
      this.isRefreshing = false;
      this.isLoadingLedger = false;
      await this.authoritativeRunPanel.handleAuthStateChanged({ active: this.activeTab === AUTHORITATIVE_TAB_ID });
      this.render();
      return { success: false, reason: "not_logged_in", message: "未登录" };
    }

    if (this.boundUserId && this.boundUserId !== expectedUserId) {
      this.pendingClaims.clear();
      this.pendingPurchases.clear();
      this.purchaseMutationIds.clear();
    }
    this.boundUserId = expectedUserId;
    this.errorMessage = "";
    if (this.dashboard && options.silent) {
      this.isRefreshing = true;
    } else {
      this.phase = "loading";
      this.isRefreshing = true;
    }
    if (!options.preserveNotice) {
      this.notice = null;
    }
    this.render();
    const shouldRefreshAuthoritative = this.activeTab === AUTHORITATIVE_TAB_ID;
    const authoritativePromise = shouldRefreshAuthoritative
      ? this.authoritativeRunPanel.activate({ force: true }).catch(error => ({ success: false, error, message: error.message || "权威试炼读取失败" }))
      : Promise.resolve({ success: true, skipped: true });

    const generation = this.invalidateReadResponses();
    const requestId = ++this.requestSeq;
    const result = await BackendClient.getSeasonOpsDashboard({ expectedUserId });
    if (this.isStaleResponse(requestId, expectedUserId, generation)) {
      return { success: false, ignored: true, reason: "season_ops_stale_response" };
    }

    this.isRefreshing = false;
    if (!result || !result.success) {
      return this.applyRefreshFailure(result);
    }

    const normalized = this.normalizeDashboard(result, expectedUserId);
    this.dashboard = normalized;
    this.phase = this.isDashboardEmpty(normalized) ? "empty" : "ready";
    this.notice = null;
    await authoritativePromise;
    this.render();
    return { success: true, dashboard: normalized };
  }

  setActiveTab(tabId = "", options = {}) {
    const normalized = this.normalizeTabId(tabId);
    if (!normalized) return;
    this.activeTab = normalized;
    if (options.render !== false) {
      this.render();
    }
    if (normalized === AUTHORITATIVE_TAB_ID) {
      this.authoritativeRunPanel.activate({ force: false }).catch(error => {
        console.warn("Authoritative run panel activation failed:", error);
      });
    }
  }

  openRelayExpeditionMode(options = {}) {
    if (this.authoritativeRunPanel && typeof this.authoritativeRunPanel.openRelayExpeditionMode === "function") {
      this.authoritativeRunPanel.openRelayExpeditionMode();
    }
    this.activeTab = AUTHORITATIVE_TAB_ID;
    if (options.render !== false) this.render();
    return { success: true };
  }

  handleRelayExpeditionProjected() {
    this.notice = { tone: "success", text: "本棒结果已投影到共享路线，已回到同道远征工作区。" };
    if (this.game && typeof this.game.showSocialHub === "function") {
      this.game.showSocialHub("squad");
      return { success: true, redirected: true };
    }
    this.render();
    return { success: true, redirected: false };
  }

  async handleAuthStateChanged() {
    const currentUserId = this.getCurrentUserId();
    if (currentUserId === this.boundUserId && this.phase !== "not_logged_in") return { success: true, skipped: true };
    this.boundUserId = currentUserId;
    this.invalidateReadResponses();
    this.pendingClaims.clear();
    this.pendingPurchases.clear();
    this.purchaseMutationIds.clear();
    this.isLoadingLedger = false;
    await this.authoritativeRunPanel.handleAuthStateChanged({ active: this.activeTab === AUTHORITATIVE_TAB_ID });
    if (!currentUserId) {
      this.dashboard = null;
      this.notice = null;
      this.phase = "not_logged_in";
      this.isRefreshing = false;
      this.render();
      return { success: true, loggedIn: false };
    }
    this.dashboard = null;
    this.notice = null;
    this.phase = "loading";
    this.render();
    return this.refresh({ silent: false });
  }

  destroy() {
    this.authoritativeRunPanel.destroy();
    const container = this.getContainer();
    if (!container) return;
    if (container.__seasonOpsBound) {
      container.removeEventListener("click", this.boundClickHandler);
      container.removeEventListener("keydown", this.boundKeydownHandler);
      delete container.__seasonOpsBound;
    }
    if (typeof window !== "undefined" && this.storageListenerBound) {
      window.removeEventListener("storage", this.boundStorageHandler);
      this.storageListenerBound = false;
    }
  }

  invalidateReadResponses() {
    this.viewGeneration += 1;
    this.ledgerRequestSeq += 1;
    return this.viewGeneration;
  }

  isStaleResponse(requestId, expectedUserId, generation) {
    return requestId !== this.requestSeq
      || generation !== this.viewGeneration
      || expectedUserId !== this.getCurrentUserId();
  }

  isSameUser(expectedUserId) {
    return normalizeText(expectedUserId) && normalizeText(expectedUserId) === this.getCurrentUserId();
  }

  captureFocusKey(container) {
    if (!container || typeof document === "undefined") return this.pendingFocusKey;
    const active = document.activeElement;
    if (!active || !container.contains(active)) return this.pendingFocusKey;
    return normalizeText(active.dataset && (active.dataset.seasonOpsFocusKey || active.dataset.seasonOpsFocusFallback), this.pendingFocusKey);
  }

  restoreFocusKey(container, focusKey = "") {
    const key = normalizeText(focusKey);
    this.pendingFocusKey = "";
    if (!container || !key) return;
    const primary = [...container.querySelectorAll("[data-season-ops-focus-key]")]
      .find(element => element.dataset.seasonOpsFocusKey === key && !element.disabled);
    const fallback = [...container.querySelectorAll("[data-season-ops-focus-fallback]")]
      .find(element => element.dataset.seasonOpsFocusFallback === key);
    const target = primary || fallback;
    if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
  }

  handleStorageChange(event) {
    if (event && event.key && event.key !== SESSION_STORAGE_KEY) return;
    this.handleAuthStateChanged().catch(error => {
      console.warn("Season ops external auth refresh failed:", error);
    });
  }

  handleKeydown(event) {
    const tab = event && event.target && typeof event.target.closest === "function"
      ? event.target.closest('[data-season-ops-action="switch-tab"]')
      : null;
    if (!tab) return;
    const currentIndex = UI_TAB_ORDER.indexOf(normalizeText(tab.dataset.tabId));
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % UI_TAB_ORDER.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + UI_TAB_ORDER.length) % UI_TAB_ORDER.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = UI_TAB_ORDER.length - 1;
    else return;
    event.preventDefault();
    const nextTabId = UI_TAB_ORDER[nextIndex];
    this.setActiveTab(nextTabId);
    const nextTab = this.getContainer()?.querySelector(`[data-season-ops-action="switch-tab"][data-tab-id="${nextTabId}"]`);
    if (nextTab) nextTab.focus();
  }

  normalizeTabId(tabId = "") {
    const value = normalizeText(tabId).toLowerCase();
    if (UI_TAB_ORDER.includes(value)) return value;
    return "";
  }

  applyRefreshFailure(result = null) {
    const message = normalizeText(result && result.message, "赛季司读取失败");
    const reason = normalizeText(result && result.reason);
    const currentUserId = this.getCurrentUserId();
    const accountChanged = ["season_ops_account_changed", "progression_account_changed"].includes(reason);

    if (!currentUserId) {
      this.dashboard = null;
      this.phase = "not_logged_in";
      this.notice = null;
      this.errorMessage = "";
      this.render();
      return result;
    }

    if (accountChanged && this.dashboard) {
      this.phase = "ready";
      this.notice = { tone: "warning", text: "账号已变化，旧卷宗未应用，请重新刷新。" };
      this.render();
      return result;
    }

    if (this.dashboard) {
      this.phase = "ready";
      this.notice = { tone: "danger", text: message };
      this.render();
      return result;
    }

    this.phase = accountChanged ? "not_logged_in" : "error";
    this.errorMessage = message;
    this.notice = null;
    this.render();
    return result;
  }

  normalizeDashboard(result = {}, expectedUserId = "") {
    const season = this.normalizeSeason(result.season);
    const wallet = this.normalizeWallet(result.wallet);
    const objectivesSource = Array.isArray(result.objectives)
      ? result.objectives
      : Array.isArray(result.contracts)
        ? result.contracts
        : Array.isArray(result.progression && result.progression.objectives)
          ? result.progression.objectives
          : [];
    const objectives = objectivesSource
      .map(entry => this.normalizeObjective(entry))
      .filter(Boolean)
      .sort((left, right) => this.sortObjectives(left, right));
    const entitlements = normalizeArray(result.entitlements).map(entry => this.normalizeEntitlement(entry)).filter(Boolean);
    const offers = (Array.isArray(result.offers) ? result.offers : normalizeArray(result.store && result.store.offers))
      .map(entry => this.normalizeOffer(entry, wallet, entitlements, season))
      .filter(Boolean)
      .sort((left, right) => left.price.amount - right.price.amount);

    const leaderboardRaw = Array.isArray(result.leaderboard)
      ? result.leaderboard
      : normalizeArray(result.leaderboard && result.leaderboard.entries);
    const selfRaw = result.self || (result.leaderboard && result.leaderboard.self) || null;
    const leaderboard = leaderboardRaw.map(entry => this.normalizeLeaderboardEntry(entry, expectedUserId)).filter(Boolean);
    const self = this.normalizeLeaderboardEntry(selfRaw, expectedUserId, true);
    const ledgerRaw = Array.isArray(result.ledger)
      ? result.ledger
      : normalizeArray(result.ledger && result.ledger.entries);
    const ledger = ledgerRaw.map(entry => this.normalizeLedgerEntry(entry)).filter(Boolean);

    return {
      reportVersion: normalizeText(result.reportVersion, "season-ops-dashboard-v1"),
      protocolVersion: normalizeText(result.protocolVersion, "season-ops-v1"),
      generatedAt: clampInt(result.generatedAt || Date.now()),
      season,
      wallet,
      objectives,
      objectiveGroups: this.groupObjectives(objectives),
      entitlements,
      offers,
      leaderboard,
      self,
      ledger,
      ledgerNextCursor: normalizeText(result.ledgerNextCursor || (result.ledger && result.ledger.nextCursor)),
      trustBoundary: normalizeText(season.boundary, "正式榜单只接收服务端权威真人结算。"),
      userName: this.getCurrentUserName()
    };
  }

  normalizeSeason(source = null) {
    const season = source && typeof source === "object" ? source : {};
    return {
      seasonId: normalizeText(season.seasonId || season.id, ""),
      title: normalizeText(season.title || season.name, "赛季卷面"),
      ruleVersion: normalizeText(season.ruleVersion, ""),
      catalogVersion: normalizeText(season.catalogVersion, ""),
      startsAt: clampInt(season.startsAt),
      endsAt: clampInt(season.endsAt),
      graceEndsAt: clampInt(season.graceEndsAt),
      rewardCurrency: normalizeText(season.rewardCurrency || season.currency, "renown"),
      rewardImpact: normalizeText(season.rewardImpact, "cosmetic_only"),
      state: normalizeText(season.state, "inactive"),
      isActive: !!season.isActive,
      isGrace: !!season.isGrace,
      isEnded: !!season.isEnded,
      boundary: normalizeText(season.boundary, "")
    };
  }

  normalizeWallet(source = null) {
    const wallet = source && typeof source === "object" ? source : {};
    return {
      currency: normalizeText(wallet.currency, "renown"),
      balance: clampInt(wallet.balance),
      lifetimeEarned: clampInt(wallet.lifetimeEarned),
      lifetimeSpent: clampInt(wallet.lifetimeSpent),
      updatedAt: clampInt(wallet.updatedAt),
      spendPolicy: normalizeText(wallet.spendPolicy, "cosmetic_only")
    };
  }

  normalizeObjective(source = null) {
    if (!source || typeof source !== "object") return null;
    const cycleType = this.normalizeCycleType(source.scope || source.cycleType || source.periodType || source.cycle);
    const rewardSource = source.reward && typeof source.reward === "object" ? source.reward : {};
    const current = clampInt(
      Object.prototype.hasOwnProperty.call(source, "current")
        ? source.current
        : Object.prototype.hasOwnProperty.call(source, "progress")
          ? source.progress
          : source.value
    );
    const target = Math.max(1, clampInt(source.target, 1));
    const completed = Object.prototype.hasOwnProperty.call(source, "completed")
      ? !!source.completed
      : current >= target;
    const claimed = !!source.claimed;
    const claimable = Object.prototype.hasOwnProperty.call(source, "claimable")
      ? !!source.claimable
      : completed && !claimed;
    return {
      objectiveId: normalizeText(source.objectiveId || source.id),
      title: normalizeText(source.title || source.name, "无名契约"),
      summary: normalizeText(source.summary || source.description, ""),
      scope: cycleType,
      cycleId: normalizeText(source.cycleId || source.cycleKey || source.periodId || cycleType),
      current,
      target,
      completed,
      claimable,
      claimed,
      claimedAt: clampInt(source.claimedAt),
      trustRequirement: this.normalizeTrustRequirement(source.trustRequirement || source.trustTier || source.authorityLevel),
      reward: {
        rewardType: normalizeText(rewardSource.rewardType || source.rewardType, "currency"),
        currency: normalizeText(rewardSource.currency || source.currency, "renown"),
        amount: clampInt(rewardSource.amount || source.rewardAmount || source.reward || source.renownReward),
        rewardImpact: normalizeText(rewardSource.rewardImpact || source.rewardImpact, "cosmetic_only"),
        spendPolicy: normalizeText(rewardSource.spendPolicy || source.spendPolicy, "cosmetic_only")
      }
    };
  }

  normalizeEntitlement(source = null) {
    if (!source || typeof source !== "object") return null;
    return {
      entitlementId: normalizeText(source.entitlementId || source.id),
      entitlementKey: normalizeText(source.entitlementKey || source.key),
      entitlementType: normalizeText(source.entitlementType || source.type),
      seasonId: normalizeText(source.seasonId),
      grantedAt: clampInt(source.grantedAt)
    };
  }

  normalizeOffer(source = null, wallet = null, entitlements = [], season = null) {
    if (!source || typeof source !== "object") return null;
    const offerType = normalizeText(source.offerType || source.type, "badge");
    const priceSource = source.price && typeof source.price === "object" ? source.price : {};
    const entitlementKey = normalizeText(source.entitlementKey || source.rewardKey);
    const ownedFromEntitlements = Array.isArray(entitlements) && entitlements.some(entry => entry.entitlementKey === entitlementKey);
    const balance = clampInt(wallet && wallet.balance);
    const priceAmount = clampInt(priceSource.amount || source.priceAmount || source.price);
    const available = Object.prototype.hasOwnProperty.call(source, "available")
      ? !!source.available
      : !!(season && (season.isActive || season.isGrace));
    return {
      offerId: normalizeText(source.offerId || source.id),
      seasonId: normalizeText(source.seasonId),
      title: normalizeText(source.title || source.name, "未命名外观"),
      offerType,
      entitlementType: normalizeText(source.entitlementType || offerType),
      entitlementKey,
      price: {
        currency: normalizeText(priceSource.currency || source.currency, "renown"),
        amount: priceAmount
      },
      purchaseLimit: Math.max(1, clampInt(source.purchaseLimit || source.limit || 1, 1)),
      owned: !!source.owned || ownedFromEntitlements,
      available,
      rewardImpact: normalizeText(source.rewardImpact, "cosmetic_only"),
      affordable: available && balance >= priceAmount
    };
  }

  normalizeLeaderboardEntry(source = null, expectedUserId = "", forceKeep = false) {
    if (!source || typeof source !== "object") return forceKeep ? null : null;
    const userId = normalizeText(source.userId || source.objectId || source.id);
    const entry = {
      rank: clampInt(source.rank),
      seasonId: normalizeText(source.seasonId),
      userId,
      userName: normalizeText(source.userName || source.username || source.displayName, userId ? `账号 ${userId.slice(0, 8)}` : "匿名修士"),
      score: clampInt(source.score),
      wins: clampInt(source.wins),
      losses: clampInt(source.losses),
      rankedGames: clampInt(source.rankedGames || source.matches),
      division: normalizeText(source.division, "潜龙榜"),
      authoritativeParticipant: Object.prototype.hasOwnProperty.call(source, "authoritativeParticipant")
        ? !!source.authoritativeParticipant
        : clampInt(source.rankedGames || source.matches) > 0,
      updatedAt: clampInt(source.updatedAt),
      isSelf: !!expectedUserId && !!userId && userId === expectedUserId
    };
    if (!entry.rank && !forceKeep && !entry.userId && !entry.userName) return null;
    return entry;
  }

  normalizeLedgerEntry(source = null) {
    if (!source || typeof source !== "object") return null;
    return {
      entryId: normalizeText(source.entryId || source.id),
      currency: normalizeText(source.currency, "renown"),
      delta: clampInt(source.delta),
      balanceAfter: clampInt(source.balanceAfter),
      reason: normalizeText(source.reason, "账本变更"),
      rewardImpact: normalizeText(source.rewardImpact, "cosmetic_only"),
      createdAt: clampInt(source.createdAt)
    };
  }

  normalizeCycleType(value = "") {
    const text = normalizeText(value).toLowerCase();
    if (text === "day") return "daily";
    if (text === "week") return "weekly";
    if (text === "seasonal") return "season";
    if (["daily", "weekly", "season"].includes(text)) return text;
    if (text.startsWith("daily")) return "daily";
    if (text.startsWith("weekly")) return "weekly";
    if (text.startsWith("season")) return "season";
    return "season";
  }

  normalizeTrustRequirement(value = "") {
    const text = normalizeText(value).toLowerCase();
    if (TRUST_META[text]) return text;
    return "client_observed";
  }

  sortObjectives(left, right) {
    const cycleWeight = { daily: 1, weekly: 2, season: 3 };
    const leftWeight = cycleWeight[left.scope] || 99;
    const rightWeight = cycleWeight[right.scope] || 99;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    if (left.claimable !== right.claimable) return left.claimable ? -1 : 1;
    if (left.claimed !== right.claimed) return left.claimed ? 1 : -1;
    const leftProgress = left.target > 0 ? left.current / left.target : 0;
    const rightProgress = right.target > 0 ? right.current / right.target : 0;
    if (leftProgress !== rightProgress) return rightProgress - leftProgress;
    return left.title.localeCompare(right.title, "zh-CN");
  }

  groupObjectives(objectives = []) {
    const groups = { daily: [], weekly: [], season: [] };
    for (const objective of objectives) {
      const key = this.normalizeCycleType(objective && objective.scope);
      groups[key].push(objective);
    }
    return groups;
  }

  isDashboardEmpty(dashboard = null) {
    if (!dashboard) return true;
    return dashboard.objectives.length === 0
      && dashboard.offers.length === 0
      && dashboard.leaderboard.length === 0
      && !dashboard.self
      && dashboard.ledger.length === 0;
  }

  render() {
    const container = this.ensureRoot();
    if (!container) return;
    const focusKey = this.captureFocusKey(container);
    container.innerHTML = `
      <div class="season-ops-shell" data-season-ops-phase="${escapeHtml(this.phase)}">
        ${this.renderHeader()}
        <div class="season-ops-body">
          ${this.renderSummaryStrip()}
          ${this.renderTabs()}
          <section
            id="season-ops-tabpanel"
            class="season-ops-panel season-ops-content-panel"
            role="tabpanel"
            aria-labelledby="season-ops-tab-${escapeHtml(this.activeTab)}"
          >
            ${this.renderNotice()}
            ${this.renderContent()}
          </section>
        </div>
      </div>
    `;
    this.restoreFocusKey(container, focusKey);
  }

  renderHeader() {
    const season = this.dashboard && this.dashboard.season ? this.dashboard.season : null;
    const stateMeta = SEASON_STATE_META[normalizeText(season && season.state, "inactive")] || SEASON_STATE_META.inactive;
    return `
      <header class="screen-header transparent season-ops-header">
        <div class="season-ops-title-group">
          <button
            type="button"
            class="back-btn menu-btn small season-ops-back-btn"
            data-season-ops-action="back"
            aria-label="返回主菜单"
            title="返回主菜单"
          ><span aria-hidden="true">←</span></button>
          <div class="season-ops-title-copy">
            <div class="season-ops-kicker">赛季司</div>
            <h2>契约、外观、权威榜、账本与权威试炼</h2>
            <p>${escapeHtml(season ? buildFallbackSeasonLabel(season) : "登录后读取本账号赛季卷宗。")}</p>
          </div>
        </div>
        <div class="season-ops-header-actions">
          <div class="season-ops-account-chip ${this.getCurrentUserId() ? "is-live" : "is-guest"}">
            <span class="label">账号</span>
            <strong>${escapeHtml(this.getCurrentUserName())}</strong>
          </div>
          <div class="season-ops-account-chip tone-${escapeHtml(stateMeta.tone)}">
            <span class="label">状态</span>
            <strong>${escapeHtml(stateMeta.label)}</strong>
          </div>
          <button
            type="button"
            class="menu-btn small season-ops-refresh-btn ${this.isRefreshing ? "is-busy" : ""}"
            data-season-ops-action="refresh"
            data-season-ops-focus-key="refresh"
            ${this.phase === "loading" && !this.dashboard ? "disabled" : ""}
          >${this.isRefreshing ? "刷新中..." : "刷新卷宗"}</button>
        </div>
      </header>
    `;
  }

  renderSummaryStrip() {
    if (!this.dashboard) {
      return `
        <section class="season-ops-summary-grid">
          ${this.renderSummaryCard("赛季", "待取卷", "登录后读取当前赛季与宽限信息。")}
          ${this.renderSummaryCard("荣誉", "0", "荣誉只用于外观，不授予战力。")}
          ${this.renderSummaryCard("可领契约", "0", "领取与购买均绑定当前账号。")}
          ${this.renderSummaryCard("榜单", "未入卷", "只统计正式真人权威结算。")}
        </section>
      `;
    }

    const season = this.dashboard.season;
    const claimableCount = this.dashboard.objectives.filter(entry => entry.claimable).length;
    const ownedCount = this.dashboard.offers.filter(entry => entry.owned).length;
    const selfRank = this.dashboard.self && this.dashboard.self.rank ? `第 ${this.dashboard.self.rank} 名` : "未入卷";
    const seasonWindow = season.startsAt > 0 && season.endsAt > 0
      ? `${formatUtcDateTime(season.startsAt, { dateOnly: true })} 至 ${formatUtcDateTime(season.endsAt, { dateOnly: true })}`
      : "等待赛季边界";

    return `
      <section class="season-ops-summary-grid">
        ${this.renderSummaryCard("赛季", season.title, seasonWindow, `tone-${(SEASON_STATE_META[season.state] || SEASON_STATE_META.inactive).tone}`)}
        ${this.renderSummaryCard("荣誉", `${this.dashboard.wallet.balance}`, `累计收入 ${this.dashboard.wallet.lifetimeEarned} · 已支出 ${this.dashboard.wallet.lifetimeSpent}`, "tone-gold")}
        ${this.renderSummaryCard("可领契约", `${claimableCount}`, `已拥有外观 ${ownedCount} 件 · 奖励不影响战力`, claimableCount > 0 ? "tone-success" : "tone-muted")}
        ${this.renderSummaryCard("榜单", selfRank, this.dashboard.self ? `${this.dashboard.self.userName} · ${this.dashboard.self.score} 分` : "只统计正式真人权威结算", this.dashboard.self ? "tone-info" : "tone-muted")}
      </section>
    `;
  }

  renderSummaryCard(label, value, hint, extraClass = "") {
    return `
      <article class="season-ops-summary-card ${extraClass}">
        <div class="season-ops-summary-label">${escapeHtml(label)}</div>
        <div class="season-ops-summary-value">${escapeHtml(value)}</div>
        <div class="season-ops-summary-hint">${escapeHtml(hint)}</div>
      </article>
    `;
  }

  renderTabs() {
    const disabled = this.phase === "loading" && !this.dashboard;
    const buttons = UI_TAB_ORDER.map(tabId => {
      const meta = TAB_META[tabId];
      return `
        <button
          id="season-ops-tab-${escapeHtml(tabId)}"
          type="button"
          class="season-ops-tab-btn ${this.activeTab === tabId ? "active" : ""}"
          data-season-ops-action="switch-tab"
          data-tab-id="${escapeHtml(tabId)}"
          data-season-ops-focus-key="tab:${escapeHtml(tabId)}"
          role="tab"
          aria-selected="${this.activeTab === tabId ? "true" : "false"}"
          aria-controls="season-ops-tabpanel"
          tabindex="${this.activeTab === tabId ? "0" : "-1"}"
          ${disabled ? "disabled" : ""}
        >
          <span class="season-ops-tab-icon">${escapeHtml(meta.icon)}</span>
          <span class="season-ops-tab-label">${escapeHtml(meta.label)}</span>
        </button>
      `;
    }).join("");
    return `
      <nav class="season-ops-tab-bar" role="tablist" aria-label="赛季司栏目">
        ${buttons}
      </nav>
    `;
  }

  renderNotice() {
    if (!this.notice || !this.notice.text) return "";
    const tone = normalizeText(this.notice.tone, "info");
    const role = tone === "danger" ? "alert" : "status";
    return `<div class="season-ops-notice tone-${escapeHtml(tone)}" role="${role}" aria-live="${role === "alert" ? "assertive" : "polite"}">${escapeHtml(this.notice.text)}</div>`;
  }

  renderContent() {
    if (this.activeTab === AUTHORITATIVE_TAB_ID) {
      return this.authoritativeRunPanel.render();
    }

    if (this.phase === "not_logged_in") {
      return this.renderStatePanel(
        "未登录",
        "赛季司只读取当前账号卷宗。登录后才能查看契约、购买外观与读取账本。",
        `<button type="button" class="menu-btn primary season-ops-state-btn" data-season-ops-action="login">前往账号入口</button>`
      );
    }

    if (this.phase === "loading" && !this.dashboard) {
      return this.renderStatePanel(
        "加载中",
        "正在调取赛季卷宗、荣誉钱包、权威榜与近期账本。"
      );
    }

    if (this.phase === "error") {
      return this.renderStatePanel(
        "读取失败",
        this.errorMessage || "赛季司卷宗读取失败。",
        `<button type="button" class="menu-btn primary season-ops-state-btn" data-season-ops-action="refresh">重试</button>`
      );
    }

    if (this.phase === "empty") {
      return this.renderStatePanel(
        "当前为空",
        "这个账号尚未写入赛季卷宗，可先完成正式玩法或刷新后再看。"
      );
    }

    if (!this.dashboard) {
      return this.renderStatePanel("待命", "赛季司等待卷宗输入。");
    }

    if (this.activeTab === "contracts") return this.renderContractsTab();
    if (this.activeTab === "store") return this.renderStoreTab();
    if (this.activeTab === "leaderboard") return this.renderLeaderboardTab();
    if (this.activeTab === "ledger") return this.renderLedgerTab();
    return this.renderStatePanel("未找到栏目", "当前栏目不存在。");
  }

  renderStatePanel(title, description, actions = "") {
    const isError = this.phase === "error";
    return `
      <div class="season-ops-state-panel" role="${isError ? "alert" : "status"}" aria-live="${isError ? "assertive" : "polite"}">
        <div class="season-ops-state-kicker">赛季司卷面</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        ${actions ? `<div class="season-ops-state-actions">${actions}</div>` : ""}
      </div>
    `;
  }

  renderContractsTab() {
    const groups = this.dashboard.objectiveGroups;
    const sections = ["daily", "weekly", "season"].map(groupId => {
      const meta = CYCLE_META[groupId];
      const entries = normalizeArray(groups[groupId]);
      const claimable = entries.filter(entry => entry.claimable).length;
      return `
        <section class="season-ops-section-card">
          <div class="season-ops-section-head">
            <div>
              <h3>${escapeHtml(meta.label)}</h3>
              <p>${escapeHtml(meta.summary)}</p>
            </div>
            <div class="season-ops-counter-chip ${claimable > 0 ? "is-focus" : ""}">${claimable > 0 ? `${claimable} 可领` : `${entries.length} 条`}</div>
          </div>
          <div class="season-ops-contract-list">
            ${entries.length > 0 ? entries.map(entry => this.renderObjectiveCard(entry)).join("") : `<div class="season-ops-inline-empty">${escapeHtml(meta.empty)}</div>`}
          </div>
        </section>
      `;
    }).join("");

    return `
      <div class="season-ops-stack">
        <div class="season-ops-inline-note">契约奖励只发放荣誉，不授予卡牌、属性、起手或匹配优势。</div>
        ${sections}
      </div>
    `;
  }

  renderObjectiveCard(entry) {
    const trust = TRUST_META[entry.trustRequirement] || TRUST_META.client_observed;
    const progress = entry.target > 0 ? Math.max(0, Math.min(100, Math.round(entry.current / entry.target * 100))) : 0;
    const claimKey = this.getClaimKey(entry.objectiveId, entry.cycleId);
    const isPending = this.pendingClaims.has(claimKey);
    let statusLabel = "未完成";
    let buttonLabel = "继续推进";
    let buttonDisabled = true;
    let buttonClass = "is-muted";

    if (entry.claimed) {
      statusLabel = "已领取";
      buttonLabel = "已领取";
      buttonDisabled = true;
      buttonClass = "is-complete";
    } else if (entry.claimable) {
      statusLabel = "可领取";
      buttonLabel = isPending ? "领取中..." : "领取";
      buttonDisabled = isPending;
      buttonClass = "is-claimable";
    } else if (entry.completed) {
      statusLabel = "待同步";
      buttonLabel = "待同步";
      buttonDisabled = true;
    }

    const summaryLine = entry.summary || `${entry.current}/${entry.target} · 奖励 ${entry.reward.amount} 荣誉`;
    return `
      <article class="season-ops-contract-card ${entry.claimed ? "is-claimed" : entry.claimable ? "is-claimable" : ""}" tabindex="-1" data-season-ops-focus-fallback="claim:${escapeHtml(entry.objectiveId)}:${escapeHtml(entry.cycleId)}">
        <div class="season-ops-contract-topline">
          <div class="season-ops-contract-title-group">
            <h4>${escapeHtml(entry.title)}</h4>
            <p>${escapeHtml(summaryLine)}</p>
          </div>
          <div class="season-ops-trust-badge tone-${escapeHtml(trust.tone)}">${escapeHtml(trust.shortLabel)}</div>
        </div>
        <div class="season-ops-contract-meta">
          <span class="season-ops-meta-chip">${escapeHtml(trust.label)}</span>
          <span class="season-ops-meta-chip">奖励 ${entry.reward.amount} 荣誉</span>
          <span class="season-ops-meta-chip">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="season-ops-progress">
          <div class="season-ops-progress-bar">
            <div class="season-ops-progress-fill" style="width:${progress}%"></div>
          </div>
          <div class="season-ops-progress-copy">
            <span>${entry.current}/${entry.target}</span>
            <span>${progress}%</span>
          </div>
        </div>
        <div class="season-ops-contract-footer">
          <div class="season-ops-contract-note">${escapeHtml(trust.note)}</div>
          <button
            type="button"
            class="season-ops-inline-btn ${buttonClass}"
            data-season-ops-action="claim"
            data-season-ops-focus-key="claim:${escapeHtml(entry.objectiveId)}:${escapeHtml(entry.cycleId)}"
            ${buildDataAttributes({ "data-objective-id": entry.objectiveId, "data-cycle-id": entry.cycleId })}
            ${buttonDisabled ? "disabled" : ""}
          >${escapeHtml(buttonLabel)}</button>
        </div>
      </article>
    `;
  }

  renderStoreTab() {
    const offers = this.dashboard.offers;
    return `
      <div class="season-ops-stack">
        <section class="season-ops-section-card season-ops-wallet-card">
          <div class="season-ops-section-head">
            <div>
              <h3>外观商店</h3>
              <p>购买前会二次确认，重复提交会沿用同一笔订单结果。</p>
            </div>
            <div class="season-ops-wallet-value">${this.dashboard.wallet.balance}<span>荣誉</span></div>
          </div>
          <div class="season-ops-wallet-meta">
            <span class="season-ops-meta-chip">累计收入 ${this.dashboard.wallet.lifetimeEarned}</span>
            <span class="season-ops-meta-chip">累计支出 ${this.dashboard.wallet.lifetimeSpent}</span>
            <span class="season-ops-meta-chip">仅外观</span>
          </div>
        </section>
        <div class="season-ops-offer-grid">
          ${offers.length > 0 ? offers.map(entry => this.renderOfferCard(entry)).join("") : `<div class="season-ops-inline-empty">当前赛季暂无可购买外观。</div>`}
        </div>
      </div>
    `;
  }

  renderOfferCard(entry) {
    const offerMeta = OFFER_TYPE_META[entry.offerType] || OFFER_TYPE_META.badge;
    const pending = this.pendingPurchases.has(entry.offerId);
    const disabled = entry.owned || !entry.available || !entry.affordable || pending;
    const buttonLabel = entry.owned
      ? "已拥有"
      : pending
        ? "购买中..."
        : !entry.available
          ? "商店未开放"
        : entry.affordable
          ? `购入 ${entry.price.amount} 荣誉`
          : `余额不足 · ${entry.price.amount}`;
    return `
      <article class="season-ops-offer-card ${entry.owned ? "is-owned" : ""}" tabindex="-1" data-season-ops-focus-fallback="purchase:${escapeHtml(entry.offerId)}">
        <div class="season-ops-offer-type">${escapeHtml(offerMeta.icon)}</div>
        <div class="season-ops-offer-copy">
          <div class="season-ops-offer-head">
            <h4>${escapeHtml(entry.title)}</h4>
            <span class="season-ops-meta-chip">${escapeHtml(offerMeta.label)}</span>
          </div>
          <p>${escapeHtml(entry.rewardImpact === "cosmetic_only" ? "仅提供外观权益，不改动战斗资源与匹配。" : "赛季外观权益。")}</p>
          <div class="season-ops-offer-meta">
            <span class="season-ops-meta-chip">价格 ${entry.price.amount} 荣誉</span>
            <span class="season-ops-meta-chip">限购 ${entry.purchaseLimit}</span>
          </div>
        </div>
        <button
          type="button"
          class="season-ops-inline-btn ${entry.owned ? "is-complete" : entry.affordable ? "is-claimable" : "is-muted"}"
          data-season-ops-action="purchase"
          data-season-ops-focus-key="purchase:${escapeHtml(entry.offerId)}"
          ${buildDataAttributes({ "data-offer-id": entry.offerId, "data-season-id": entry.seasonId })}
          ${disabled ? "disabled" : ""}
        >${escapeHtml(buttonLabel)}</button>
      </article>
    `;
  }

  renderLeaderboardTab() {
    const entries = this.dashboard.leaderboard;
    const self = this.dashboard.self;
    return `
      <div class="season-ops-stack">
        <section class="season-ops-section-card">
          <div class="season-ops-section-head">
            <div>
              <h3>权威榜单</h3>
              <p>只统计正式真人对局的服务端权威结算。镜像、练习与旧 PVP 不入卷。</p>
            </div>
            <div class="season-ops-counter-chip">${entries.length} 席</div>
          </div>
          ${self ? this.renderSelfLeaderboardCard(self) : `<div class="season-ops-inline-empty">当前账号尚未写入正式榜单。至少完成 1 场正式结算后可见个人名次。</div>`}
        </section>
        <section class="season-ops-section-card">
          <div class="season-ops-ranking-list">
            ${entries.length > 0 ? entries.map(entry => this.renderLeaderboardRow(entry)).join("") : `<div class="season-ops-inline-empty">当前赛季前榜尚未形成。</div>`}
          </div>
        </section>
      </div>
    `;
  }

  renderSelfLeaderboardCard(entry) {
    return `
      <div class="season-ops-self-rank-card">
        <div>
          <div class="season-ops-self-rank-label">我的席位</div>
          <div class="season-ops-self-rank-value">第 ${entry.rank || "?"} 名</div>
        </div>
        <div class="season-ops-self-rank-meta">
          <span class="season-ops-meta-chip">${escapeHtml(entry.userName)}</span>
          <span class="season-ops-meta-chip">${entry.score} 分</span>
          <span class="season-ops-meta-chip">${entry.wins} 胜 ${entry.losses} 负</span>
          <span class="season-ops-meta-chip">${entry.rankedGames} 场正式结算</span>
        </div>
      </div>
    `;
  }

  renderLeaderboardRow(entry) {
    return `
      <article class="season-ops-rank-row ${entry.isSelf ? "is-self" : ""}">
        <div class="season-ops-rank-index">#${entry.rank || "-"}</div>
        <div class="season-ops-rank-main">
          <div class="season-ops-rank-name-row">
            <strong>${escapeHtml(entry.userName)}</strong>
            <span class="season-ops-meta-chip">${escapeHtml(entry.division)}</span>
            ${entry.isSelf ? `<span class="season-ops-meta-chip is-self">本人</span>` : ""}
          </div>
          <div class="season-ops-rank-stats">
            <span>${entry.score} 分</span>
            <span>${entry.wins} 胜</span>
            <span>${entry.losses} 负</span>
            <span>${entry.rankedGames} 场</span>
          </div>
        </div>
        <div class="season-ops-rank-updated">${escapeHtml(formatUtcDateTime(entry.updatedAt, { compact: true }))}</div>
      </article>
    `;
  }

  renderLedgerTab() {
    const entries = this.dashboard.ledger;
    return `
      <div class="season-ops-stack">
        <section class="season-ops-section-card" tabindex="-1" data-season-ops-focus-fallback="load-ledger">
          <div class="season-ops-section-head">
            <div>
              <h3>荣誉账本</h3>
              <p>每笔荣誉变动均可核对增减额、原因、余额与时间。</p>
            </div>
            <div class="season-ops-counter-chip">${entries.length} 条近期记录</div>
          </div>
          <div class="season-ops-ledger-list">
            ${entries.length > 0 ? entries.map(entry => this.renderLedgerRow(entry)).join("") : `<div class="season-ops-inline-empty">当前账号尚无荣誉账本记录。</div>`}
          </div>
          ${this.dashboard.ledgerNextCursor ? `
            <div class="season-ops-ledger-more">
              <button type="button" class="season-ops-inline-btn" data-season-ops-action="load-ledger" data-season-ops-focus-key="load-ledger" ${this.isLoadingLedger ? "disabled" : ""}>
                ${this.isLoadingLedger ? "读取中..." : "读取更早记录"}
              </button>
            </div>
          ` : ""}
        </section>
      </div>
    `;
  }

  renderLedgerRow(entry) {
    const positive = entry.delta >= 0;
    return `
      <article class="season-ops-ledger-row ${positive ? "is-positive" : "is-negative"}">
        <div class="season-ops-ledger-delta">${escapeHtml(formatSignedNumber(entry.delta))}</div>
        <div class="season-ops-ledger-copy">
          <strong>${escapeHtml(entry.reason)}</strong>
          <div class="season-ops-ledger-meta">
            <span>余额 ${entry.balanceAfter}</span>
            <span>${escapeHtml(formatUtcDateTime(entry.createdAt, { compact: true }))}</span>
            <span>${escapeHtml(formatRewardImpact(entry.rewardImpact))}</span>
          </div>
        </div>
      </article>
    `;
  }

  async handleClick(event) {
    const container = this.getContainer();
    if (!container) return;
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const actionNode = target.closest("[data-season-ops-action]");
    if (!actionNode || actionNode.disabled || !container.contains(actionNode)) return;
    const action = normalizeText(actionNode.dataset.seasonOpsAction);
    if (!action) return;
    if (action.startsWith("authoritative-")) {
      await this.authoritativeRunPanel.handleAction(actionNode);
      return;
    }

    if (action === "refresh") {
      await this.refresh({ silent: false });
      return;
    }
    if (action === "switch-tab") {
      this.setActiveTab(actionNode.dataset.tabId);
      return;
    }
    if (action === "back") {
      this.goBack();
      return;
    }
    if (action === "login") {
      this.openLoginModal();
      return;
    }
    if (action === "claim") {
      await this.handleClaim(actionNode.dataset.objectiveId, actionNode.dataset.cycleId);
      return;
    }
    if (action === "purchase") {
      await this.handlePurchase(actionNode.dataset.offerId, actionNode.dataset.seasonId);
      return;
    }
    if (action === "load-ledger") {
      await this.loadMoreLedger();
    }
  }

  goBack() {
    if (this.game && typeof this.game.showScreen === "function") {
      this.game.showScreen("main-menu");
    }
  }

  openLoginModal() {
    if (this.game && typeof this.game.showLoginModal === "function") {
      this.game.showLoginModal();
      return;
    }
    if (this.game && this.game.systemView && typeof this.game.systemView.showLoginModal === "function") {
      this.game.systemView.showLoginModal();
      return;
    }
    const modal = document.getElementById("auth-modal");
    if (modal) modal.classList.add("active");
  }

  getClaimKey(objectiveId = "", cycleId = "") {
    return `${normalizeText(objectiveId)}::${normalizeText(cycleId)}`;
  }

  findObjective(objectiveId = "", cycleId = "") {
    if (!this.dashboard) return null;
    return this.dashboard.objectives.find(entry => entry.objectiveId === normalizeText(objectiveId) && entry.cycleId === normalizeText(cycleId)) || null;
  }

  findOffer(offerId = "") {
    if (!this.dashboard) return null;
    return this.dashboard.offers.find(entry => entry.offerId === normalizeText(offerId)) || null;
  }

  async handleClaim(objectiveId = "", cycleId = "") {
    const safeObjectiveId = normalizeText(objectiveId);
    const safeCycleId = normalizeText(cycleId);
    if (!safeObjectiveId || !safeCycleId) return;
    const userId = this.getCurrentUserId();
    if (!userId) {
      await this.handleAuthStateChanged();
      return;
    }
    const key = this.getClaimKey(safeObjectiveId, safeCycleId);
    if (this.pendingClaims.has(key)) return;
    const objective = this.findObjective(safeObjectiveId, safeCycleId);
    if (!objective || objective.claimed || !objective.claimable) return;

    this.pendingClaims.add(key);
    this.invalidateReadResponses();
    this.notice = null;
    this.render();

    let result = null;
    try {
      result = await BackendClient.claimProgressionReward(safeObjectiveId, safeCycleId);
      if (!this.isSameUser(userId)) return;
      if (!result || !result.success) {
        const reason = normalizeText(result && result.reason);
        if (["progression_account_changed", "season_ops_account_changed"].includes(reason)) {
          this.notice = { tone: "warning", text: normalizeText(result && result.message, "登录账号已变化，请刷新赛季司后重试。") };
        } else {
          this.notice = { tone: "danger", text: normalizeText(result && result.message, "契约领取失败。") };
        }
        return;
      }

      this.applyClaimResult(objective, result);
      const gained = clampInt(result && result.claim && result.claim.amount, objective.reward.amount);
      this.notice = { tone: "success", text: `已领取 ${objective.title}，荣誉 +${gained}。` };
      await this.refresh({ silent: true, preserveNotice: true });
    } finally {
      this.pendingClaims.delete(key);
      if (this.isSameUser(userId)) {
        this.render();
      }
    }
    return result;
  }

  applyClaimResult(objective, result) {
    if (!this.dashboard || !objective) return;
    objective.claimed = true;
    objective.claimable = false;
    objective.completed = true;
    objective.claimedAt = clampInt(result && result.claim && result.claim.claimedAt, Date.now());
    if (result && result.balance) {
      this.dashboard.wallet = this.normalizeWallet(result.balance);
    }
    const amount = clampInt(result && result.claim && result.claim.amount, objective.reward.amount);
    if (amount > 0) {
      this.dashboard.ledger.unshift({
        entryId: normalizeText(result && result.claim && result.claim.claimId, `claim-${objective.objectiveId}`),
        currency: "renown",
        delta: amount,
        balanceAfter: this.dashboard.wallet.balance,
        reason: "契约奖励",
        rewardImpact: "cosmetic_only",
        createdAt: objective.claimedAt
      });
      this.dashboard.ledger = this.dashboard.ledger.slice(0, 10);
    }
    this.dashboard.objectiveGroups = this.groupObjectives(this.dashboard.objectives);
  }

  async handlePurchase(offerId = "", seasonId = "") {
    const safeOfferId = normalizeText(offerId);
    const safeSeasonId = normalizeText(seasonId);
    if (!safeOfferId || !safeSeasonId) return;
    const userId = this.getCurrentUserId();
    if (!userId) {
      await this.handleAuthStateChanged();
      return;
    }
    const offer = this.findOffer(safeOfferId);
    if (!offer || offer.owned || !offer.available || !offer.affordable || this.pendingPurchases.has(safeOfferId)) return;

    this.pendingFocusKey = `purchase:${safeOfferId}`;
    const confirmed = await this.requestPurchaseConfirmation(offer);
    if (!confirmed) {
      this.pendingFocusKey = "";
      return;
    }

    this.pendingPurchases.add(safeOfferId);
    this.invalidateReadResponses();
    this.notice = null;
    this.render();

    let result = null;
    try {
      const mutationId = this.purchaseMutationIds.get(safeOfferId) || (typeof BackendClient.createMutationId === "function"
        ? BackendClient.createMutationId()
        : `mutation-${Date.now().toString(36)}`);
      this.purchaseMutationIds.set(safeOfferId, mutationId);
      result = await BackendClient.purchaseSeasonOpsOffer(safeOfferId, safeSeasonId, {
        expectedUserId: userId,
        mutationId
      });
      if (!this.isSameUser(userId)) return;
      if (!result || !result.success) {
        const reason = normalizeText(result && result.reason);
        if (["progression_account_changed", "season_ops_account_changed"].includes(reason)) {
          this.notice = { tone: "warning", text: normalizeText(result && result.message, "账号已变化，原购买回执未应用到当前界面。") };
        } else {
          this.notice = { tone: "danger", text: normalizeText(result && result.message, "赛季商品购买失败。") };
        }
        return;
      }

      this.applyPurchaseResult(offer, result);
      this.purchaseMutationIds.delete(safeOfferId);
      this.notice = { tone: "success", text: `已购入 ${offer.title}，扣除 ${offer.price.amount} 荣誉。` };
      await this.refresh({ silent: true, preserveNotice: true });
    } finally {
      this.pendingPurchases.delete(safeOfferId);
      if (this.isSameUser(userId)) {
        this.render();
      }
    }
    return result;
  }

  applyPurchaseResult(offer, result) {
    if (!this.dashboard || !offer) return;
    offer.owned = true;
    if (result && result.wallet) {
      this.dashboard.wallet = this.normalizeWallet(result.wallet);
    }
    if (result && result.entitlement) {
      this.dashboard.entitlements.unshift(this.normalizeEntitlement(result.entitlement));
    }
    this.dashboard.ledger.unshift({
      entryId: normalizeText(result && result.purchaseId, `purchase-${offer.offerId}`),
      currency: "renown",
      delta: -offer.price.amount,
      balanceAfter: this.dashboard.wallet.balance,
      reason: "商店购买",
      rewardImpact: "cosmetic_only",
      createdAt: clampInt(result && result.purchasedAt, Date.now())
    });
    this.dashboard.ledger = this.dashboard.ledger.slice(0, 10);
    for (const item of this.dashboard.offers) {
      item.affordable = this.dashboard.wallet.balance >= item.price.amount;
      if (item.offerId === offer.offerId) {
        item.owned = true;
      }
    }
  }

  async loadMoreLedger() {
    if (!this.dashboard || !this.dashboard.ledgerNextCursor || this.isLoadingLedger) return null;
    const userId = this.getCurrentUserId();
    if (!userId) {
      await this.handleAuthStateChanged();
      return null;
    }
    const cursor = this.dashboard.ledgerNextCursor;
    const generation = this.viewGeneration;
    const requestId = ++this.ledgerRequestSeq;
    this.isLoadingLedger = true;
    this.notice = null;
    this.render();
    let result = null;
    try {
      result = await BackendClient.getSeasonOpsLedger({
        expectedUserId: userId,
        limit: 20,
        cursor
      });
      if (!this.isSameUser(userId)
        || generation !== this.viewGeneration
        || requestId !== this.ledgerRequestSeq
        || !this.dashboard
        || cursor !== this.dashboard.ledgerNextCursor) {
        return { success: false, ignored: true, reason: "season_ops_stale_ledger_response" };
      }
      if (!result || !result.success) {
        this.notice = {
          tone: "danger",
          text: normalizeText(result && result.message, "更早账本记录读取失败。")
        };
        return result;
      }
      const knownIds = new Set(this.dashboard.ledger.map(entry => entry.entryId));
      const additions = normalizeArray(result.entries)
        .map(entry => this.normalizeLedgerEntry(entry))
        .filter(entry => entry && !knownIds.has(entry.entryId));
      this.dashboard.ledger.push(...additions);
      this.dashboard.ledgerNextCursor = normalizeText(result.nextCursor);
      return result;
    } finally {
      this.isLoadingLedger = false;
      if (this.isSameUser(userId)) this.render();
    }
  }

  requestPurchaseConfirmation(offer) {
    const message = `确认用 ${offer.price.amount} 荣誉兑换「${offer.title}」？\n\n该权益只提供外观，不影响战斗资源与榜单权重。`;
    return this.requestConfirmation(message);
  }

  requestConfirmation(message) {
    return new Promise(resolve => {
      if (this.game && typeof this.game.showConfirmModal === "function") {
        this.game.showConfirmModal(message, () => resolve(true), () => resolve(false));
        return;
      }
      if (this.game && this.game.systemView && typeof this.game.systemView.showConfirmModal === "function") {
        this.game.systemView.showConfirmModal(message, () => resolve(true), () => resolve(false));
        return;
      }
      resolve(typeof window !== "undefined" ? window.confirm(message) : false);
    });
  }
}
