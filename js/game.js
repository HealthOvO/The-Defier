import { PVPScene } from "./scenes/pvp-scene.js";
import { PVPService } from "./services/pvp-service.js";
import { Player } from "./core/player.js";
import { Battle } from "./core/battle.js";
import { GameMap } from "./core/map.js";
import { EventSystem } from "./core/events.js";
import { AchievementSystem } from "./core/achievements.js";
import { MapView } from "./views/MapView.js";
import { ShopView } from "./views/ShopView.js";
import { InventoryView } from "./views/InventoryView.js";
import { RewardView } from "./views/RewardView.js";
import { EventView } from "./views/EventView.js";
import { AuthService } from "./services/authService.js";
import { RUN_DESTINIES } from "./data/run_destinies.js";
import { RUN_VOWS } from "./data/run_vows.js";
import { Utils } from "./core/utils.js";
import { SPIRIT_COMPANIONS } from "./data/spirit_companions.js";
import { CharacterSelectView } from "./views/CharacterSelectView.js";
import { RunManager } from "./managers/RunManager.js";
import { EventManager } from "./managers/EventManager.js";
import { inferDeckArchetype, getRandomArchetypeCard, getRandomCard, upgradeCard, getRewardCards } from "./data/cards.js";
import { StrategicView } from "./views/StrategicView.js";
import { ShopManager } from "./managers/ShopManager.js";
import { EndlessManager } from "./managers/EndlessManager.js";
import { CHARACTERS, CARDS, ENEMIES } from "./data/index.js";
import { getV6CharacterIdentityTemplate, getV6SpiritStoryTemplate, V6_WORLDVIEW_RECALL } from "./data/narrative_templates.js";
import { SystemView } from "./views/SystemView.js";
import { audioManager } from "./core/audio.js";
import { SaveManager } from "./managers/SaveManager.js";
import { FateRing, MutatedRing, SealedRing, KarmaRing, AnalysisRing } from "./core/fateRing.js";
import { TREASURES, TREASURE_CONFIG } from "./data/treasures.js";
import { LAWS, LAW_RESONANCES } from "./data/laws.js";
import { ACHIEVEMENT_CATEGORIES, getAchievementRewardText, ACHIEVEMENTS } from "./data/achievements.js";
import { HUDView } from "./views/HUDView.js";
import { PVPResultView } from "./views/PVPResultView.js";
import { FATE_RING } from "./data/fate_ring.js";
import { FateRingView } from "./views/FateRingView.js";
import { particles } from "./core/particles.js";
import { MetaProgressionManager } from "./managers/MetaProgressionManager.js";
import { SeasonBoardManager } from "./managers/SeasonBoardManager.js";
import { SanctumAgendaManager } from "./managers/SanctumAgendaManager.js";
import { CampfireView } from "./views/CampfireView.js";
/**
 * The Defier 4.2 - 逆命者
 * 主游戏控制器（修复版）
 */
export class Game {
  constructor() {
    this.player = new Player();
    this.player.game = this; // 供 player.js 安全访问当前游戏实例，避免依赖全局变量
    this.battle = new Battle(this);
    this.map = new GameMap(this);
    this.eventSystem = new EventSystem(this);
    this.achievementSystem = new AchievementSystem(this);
    this.currentScreen = 'main-menu';
    this.currentEnemies = [];
    this.currentBattleNode = null; // 记录当前战斗节点
    this.mode = 'pve';
    this.pvpOpponentRank = null;
    this.pvpMatchTicket = null;
    this.pvpDangerProfile = null;
    this.pvpMatchIntent = null;
    this.pvpResultReview = null;
    this.stealAttempted = false;
    this.rewardCardSelected = false; // 防止重复选牌
    this.lastBattleRewardMeta = null;
    this.lastExpeditionRewardMeta = null;
    this.lastRunPathRewardMeta = null;
    this.lastRunPathMapFeedback = null;
    this.runPathMapFeedbackTimer = null;
    if (PVPService && typeof PVPService.init === 'function') {
      PVPService.init({
        game: this,
        authService: AuthService,
        utils: Utils
      });
    }
    if (PVPScene && typeof PVPScene.init === 'function') {
      PVPScene.init({
        game: this
      });
    }
    this.sanctumAgendaState = this.createDefaultSanctumAgendaState();
    this.heavenlyMandateState = this.createDefaultHeavenlyMandateState();
    this.seasonVerificationState = this.createDefaultSeasonVerificationState();
    this.lastSeasonBoardLaneRewardClaim = null;
    this.fateAftereffectState = this.createDefaultFateAftereffectState();
    this.comboCount = 0;
    this.lastCardType = null;
    this.selectedCharacterId = null;
    this.selectedRunDestinyId = null;
    this.selectedSpiritCompanionId = null;
    this.selectedRunPathId = null;
    this.activeTrial = null;
    this.trialData = null;
    this.trialMode = null;
    this.pendingRunDestinyDrafts = {};
    this.pendingSpiritCompanionDrafts = {};
    this.pendingRunPathDrafts = {};
    this.runStartTime = null;
    this.currentSaveSlot = null; // Default to null (unknown), NOT 0 (Slot 1)
    this.cachedSlots = [null, null, null, null]; // Cache for slots
    this.guestMode = false;
    this.guideState = this.loadGuideState();
    this.legacyStorageKey = 'theDefierLegacyV1';
    this.legacyUpgradeCatalog = this.getLegacyUpgradeCatalog();
    this.legacyProgress = this.loadLegacyProgress();
    this.featureFlags = {
      combatDepthV2: true,
      pvpRuleSyncV2: true,
      mapNodeTrialForge: true,
      endlessModeV1: true
    };
    this.endlessState = this.createDefaultEndlessState();
    if (this.legacyProgress && this.legacyProgress.endlessSeasonLedger && typeof this.legacyProgress.endlessSeasonLedger === 'object') {
      this.endlessState = this.normalizeEndlessState({
        ...this.endlessState,
        ...this.legacyProgress.endlessSeasonLedger
      });
    }
    this.encounterState = this.createDefaultEncounterState();
    this.chapterEventLedger = this.createDefaultChapterEventLedger();
    this.currentEventRuntimeMeta = null;
    this.lawCodexFilterState = {
      query: '',
      status: 'all',
      element: 'all',
      resonance: 'all'
    };
    this.treasureCompendiumFilter = 'all';
    this.treasureCompendiumSort = 'rarity_desc';
    this.treasureCompendiumSearchQuery = '';
    this.treasureCompendiumFilterState = {
      status: 'all',
      rarities: [],
      sources: []
    };
    this.treasureCompendiumPresetStorageKey = 'theDefierTreasureCompendiumPresetsV1';
    this.treasureCompendiumPresetCache = null;
    this.lastLegacyGain = 0;
    this.debugMode = localStorage.getItem('theDefierDebug') === 'true';
    this.mapView = new MapView(this);
    this.shopView = new ShopView(this);
    this.inventoryView = new InventoryView(this);
    this.rewardView = new RewardView(this);
    this.eventView = new EventView(this);
    this.automationBootConfig = this.parseAutomationBootConfig();
    this.boundGlobalEvents = false;
    this.isAuthBusy = false;
    this.isSyncingSlots = false;
    setTimeout(() => this.updateDebugUI(), 0);

    // Restore slot from session if exists
    const savedSlot = sessionStorage.getItem('currentSaveSlot');
    if (savedSlot !== null) this.currentSaveSlot = parseInt(savedSlot);
    this.attachHubControllers();
    this.init();
  }

  getOrCreateManager(name, Factory) {
    if (!name || typeof Factory !== 'function') return null;
    if (!this[name]) {
      this[name] = new Factory(this);
    }
    return this[name];
  }

  getOrCreateView(name, Factory) {
    if (!name || typeof Factory !== 'function') return null;
    if (!this[name]) {
      this[name] = new Factory(this);
    }
    return this[name];
  }
  ensureRunManager() {
    if (typeof this.getOrCreateManager === 'function') {
      this.getOrCreateManager('runManager', RunManager);
    } else if (!this.runManager) {
      this.runManager = new RunManager(this);
    }
    return this.runManager;
  }
  ensureEndlessManager() {
    if (typeof this.getOrCreateManager === 'function') {
      this.getOrCreateManager('endlessManager', EndlessManager);
    } else if (!this.endlessManager) {
      this.endlessManager = new EndlessManager(this);
    }
    return this.endlessManager;
  }
  ensureCharacterSelectView() {
    if (typeof this.getOrCreateView === 'function') {
      this.getOrCreateView('characterSelectView', CharacterSelectView);
    } else if (!this.characterSelectView) {
      this.characterSelectView = new CharacterSelectView(this);
    }
    return this.characterSelectView;
  }
  ensureInventoryView() {
    if (typeof this.getOrCreateView === 'function') {
      this.getOrCreateView('inventoryView', InventoryView);
    } else if (!this.inventoryView) {
      this.inventoryView = new InventoryView(this);
    }
    return this.inventoryView;
  }
  ensureRewardView() {
    if (typeof this.getOrCreateView === 'function') {
      this.getOrCreateView('rewardView', RewardView);
    } else if (!this.rewardView) {
      this.rewardView = new RewardView(this);
    }
    return this.rewardView;
  }
  ensureEventManager() {
    if (typeof this.getOrCreateManager === 'function') {
      this.getOrCreateManager('eventManager', EventManager);
    } else if (!this.eventManager) {
      this.eventManager = new EventManager(this);
    }
    return this.eventManager;
  }
  createEventManagerHooks() {
    return {
      armTrialChallenge: config => {
        if (typeof this.armTrialChallenge === 'function') {
          return this.armTrialChallenge(config);
        }
        return typeof Game !== 'undefined' && Game?.prototype && typeof Game.prototype.armTrialChallenge === 'function' ? Game.prototype.armTrialChallenge.call(this, config) : null;
      },
      autoSave: () => {
        if (typeof this.autoSave === 'function') {
          return this.autoSave();
        }
        return typeof Game !== 'undefined' && Game?.prototype && typeof Game.prototype.autoSave === 'function' ? Game.prototype.autoSave.call(this) : null;
      },
      showScreen: screenId => {
        if (typeof this.showScreen === 'function') {
          return this.showScreen(screenId);
        }
        return typeof Game !== 'undefined' && Game?.prototype && typeof Game.prototype.showScreen === 'function' ? Game.prototype.showScreen.call(this, screenId) : false;
      }
    };
  }
  getEventManagerHooks() {
    const createHooks = typeof this.createEventManagerHooks === 'function' ? this.createEventManagerHooks : typeof Game !== 'undefined' && Game?.prototype && typeof Game.prototype.createEventManagerHooks === 'function' ? Game.prototype.createEventManagerHooks : null;
    if ((!this.eventManagerHooks || typeof this.eventManagerHooks !== 'object') && createHooks) {
      this.eventManagerHooks = createHooks.call(this);
    }
    return this.eventManagerHooks;
  }
  attachHubControllers() {
    const runtimeGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof globalThis !== 'undefined' ? globalThis : null;
    if (!runtimeGlobal) return;
    if (typeof runtimeGlobal.__attachCollectionHubController === 'function') {
      this.collectionHub = runtimeGlobal.__attachCollectionHubController(this);
    }
    if (typeof runtimeGlobal.__attachChallengeHubController === 'function') {
      this.challengeHub = runtimeGlobal.__attachChallengeHubController(this);
    }
    if (typeof runtimeGlobal.__attachExpeditionHubController === 'function') {
      this.expeditionHub = runtimeGlobal.__attachExpeditionHubController(this);
    }
  }
  ensureChallengeHubLoaded() {
    if (this.challengeHub && typeof this.challengeHub.showChallengeHub === 'function') {
      return Promise.resolve(this.challengeHub);
    }
    if (!this.challengeHubLoadPromise) {
      this.challengeHubLoadPromise = import('./core/challenge_hub.js').then(() => {
        this.attachHubControllers();
        return this.challengeHub;
      });
    }
    return this.challengeHubLoadPromise;
  }
  warmupDeferredHubControllers() {
    if (!this.deferredHubWarmupPromise) {
      this.deferredHubWarmupPromise = Promise.allSettled([this.ensureChallengeHubLoaded()]);
    }
    return this.deferredHubWarmupPromise;
  }
  scheduleDeferredHubWarmup() {
    if (this.deferredHubWarmupScheduled) return;
    this.deferredHubWarmupScheduled = true;
    const runWarmup = () => {
      void this.warmupDeferredHubControllers();
    };
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(runWarmup);
    } else if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(runWarmup, 0);
    } else {
      runWarmup();
    }
  }

  // 初始化
  init() {
    this.bindGlobalEvents();
    this.initRuntimeHooks();
    this.scheduleDeferredHubWarmup();
    // Initialize Auth
    if (typeof AuthService !== 'undefined') {
      AuthService.init();
      this.checkLoginStatus();
    }
    this.initCollection();
    this.initDynamicBackground();
    this.loadGameResult = this.automationBootConfig ? false : this.loadGame();

    // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
    // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
    let savedSlotIndex = sessionStorage.getItem('currentSaveSlot');

    // 关键修复：如果会话均无，尝试从本地持久化存储恢复
    if (savedSlotIndex === null) {
      savedSlotIndex = localStorage.getItem('lastSaveSlot');
    }
    if (savedSlotIndex !== null) {
      this.currentSaveSlot = parseInt(savedSlotIndex);
      console.log(`已恢复存档位: Slot ${this.currentSaveSlot + 1}`);
    }

    // 检查是否有存档，更新按钮状态
    const continueBtn = document.getElementById('continue-game-btn');
    const newGameBtn = document.getElementById('new-game-btn');

    // 默认显示“新的轮回”
    if (newGameBtn) newGameBtn.style.display = 'flex';
    if (this.loadGameResult && this.player.currentHp > 0) {
      if (continueBtn) {
        continueBtn.style.display = 'flex';
        // 当有存档时，新游戏按钮改为“次级”样式或保持原样，但必须显示
        // 这里我们确保它就在那里，并且文字清晰
        // 这里我们确保它就在那里，而且文字清晰
      }
    } else {
      if (continueBtn) continueBtn.style.display = 'none';
    }

    // 默认总是留在主菜单，除非特定场景（比如移动端恢复？）
    // 这里我们强制让用户选择，解决了刷新后乱入的问题
    this.showScreen('main-menu');

    // 安全检查：如果已登录但没有选中存档位（例如新标签页打开），强制显示存档选择，防止数据错乱
    if (typeof AuthService !== 'undefined' && AuthService.isLoggedIn() && this.currentSaveSlot === null) {
      console.log('Logged in but slot unknown. Prompting selection.');
      // 延迟一点以免与主菜单动画冲突
      setTimeout(() => this.openSaveSlotsWithSync(), 800);
    }
    this.scheduleAutomationBoot();
    console.log('The Defier 2.1 初始化完成！');
  }
  parseAutomationBootConfig() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return null;
    let params = null;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (error) {
      console.warn('Automation boot config parse failed:', error);
      return null;
    }
    const mode = String(params.get('autotest') || '').trim();
    const allowedModes = new Set(['guest-character-selection', 'guest-run-path-selection', 'guest-map', 'guest-battle', 'guest-pvp']);
    if (!allowedModes.has(mode)) return null;
    return {
      mode,
      characterId: String(params.get('character') || 'linFeng').trim() || 'linFeng',
      runDestinyId: String(params.get('destiny') || 'foldedEdge').trim() || 'foldedEdge',
      spiritCompanionId: String(params.get('spirit') || 'swordWraith').trim() || 'swordWraith',
      runPathId: String(params.get('path') || 'insight').trim() || 'insight',
      realm: Math.max(1, Math.min(18, Math.floor(Number(params.get('realm')) || 1))),
      battleType: String(params.get('battleType') || 'normal').trim() || 'normal'
    };
  }
  scheduleAutomationBoot() {
    if (!this.automationBootConfig) return;
    setTimeout(() => this.runAutomationBootFlow(), 80);
  }
  runAutomationBootFlow() {
    const config = this.automationBootConfig;
    if (!config) return false;
    this.guestMode = true;
    if (typeof document !== 'undefined') {
      ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
    }
    if (config.mode === 'guest-character-selection' || config.mode === 'guest-run-path-selection') {
      this.showCharacterSelection();
      if (typeof this.selectCharacter === 'function') {
        this.selectCharacter(config.characterId);
      }
      if (config.mode === 'guest-run-path-selection' && typeof this.selectRunPath === 'function') {
        this.selectRunPath(config.runPathId);
      }
      return true;
    }
    if (config.mode === 'guest-map' || config.mode === 'guest-battle') {
      this.startNewGame(config.characterId, {
        runDestinyId: config.runDestinyId,
        spiritCompanionId: config.spiritCompanionId,
        runPathId: config.runPathId
      });
      if (config.mode === 'guest-map') {
        this.startRealm(config.realm, false);
        return true;
      }
      this.startDebugBattle(config.realm, config.battleType);
      return true;
    }
    if (config.mode === 'guest-pvp') {
      this.showScreen('pvp-screen');
      if (typeof window !== 'undefined' && PVPScene && typeof PVPScene.onShow === 'function') {
        PVPScene.onShow();
      }
      return true;
    }
    return false;
  }
  initRuntimeHooks() {
    // Deterministic-ish stepping hook for automation.
    window.advanceTime = (ms = 16) => {
      const delta = Math.max(0, Number(ms) || 0);
      if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.advanceTime === 'function') {
        this.battle.advanceTime(delta);
        return;
      }
      if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.updateBattleUI === 'function') {
        this.battle.updateBattleUI();
      }
    };
    window.render_game_to_text = () => this.renderGameToText();
  }
  renderGameToText() {
    const mode = this.currentScreen || 'unknown';
    const isBattleMode = mode === 'battle-screen';
    const chapterSnapshot = this.player && typeof this.getChapterDisplaySnapshot === 'function' ? this.getChapterDisplaySnapshot(this.player?.realm || 1) : null;
    const frontierRisk = this.map && typeof this.map.getAccessibleNodeRiskForecast === 'function' ? this.map.getAccessibleNodeRiskForecast(chapterSnapshot).topRisk : null;
    const currentNodeRisk = this.currentBattleNode && this.map && typeof this.map.resolveNodeRiskProfile === 'function' ? this.map.resolveNodeRiskProfile(this.currentBattleNode, chapterSnapshot) : null;
    const strategicEngineering = typeof this.getStrategicEngineeringSnapshot === 'function' ? this.getStrategicEngineeringSnapshot() : null;
    const strategicEngineeringEventBias = typeof this.getStrategicEngineeringEventBiasProfile === 'function' ? this.getStrategicEngineeringEventBiasProfile() : null;
    const normalizePvpDanger = (profile = null) => {
      if (!profile) return null;
      if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.normalizePVPDangerProfile === 'function') {
        return PVPService.normalizePVPDangerProfile(profile);
      }
      return profile;
    };
    const pvpMyRank = typeof PVPService !== 'undefined' && PVPService && PVPService.currentRankData ? PVPService.currentRankData : null;
    const pvpFocus = typeof window !== 'undefined' && typeof PVPScene !== 'undefined' && PVPScene && typeof PVPScene.getRankingFocusSnapshot === 'function' ? PVPScene.getRankingFocusSnapshot() : null;
    const pvpDangerProfile = normalizePvpDanger(this.pvpDangerProfile);
    const pvpMatchIntent = this.pvpMatchIntent && typeof this.pvpMatchIntent === 'object' ? {
      targetName: String(this.pvpMatchIntent.targetName || ''),
      targetRankId: String(this.pvpMatchIntent.targetRankId || ''),
      engagementId: String(this.pvpMatchIntent.engagementId || ''),
      engagementLabel: String(this.pvpMatchIntent.engagementLabel || ''),
      engagementLine: String(this.pvpMatchIntent.engagementLine || ''),
      modeId: String(this.pvpMatchIntent.modeId || ''),
      modeLabel: String(this.pvpMatchIntent.modeLabel || ''),
      modeLine: String(this.pvpMatchIntent.modeLine || ''),
      winRewardText: String(this.pvpMatchIntent.winRewardText || ''),
      lossRewardText: String(this.pvpMatchIntent.lossRewardText || ''),
      reserveText: String(this.pvpMatchIntent.reserveText || ''),
      counterplayText: String(this.pvpMatchIntent.counterplayText || ''),
      chipText: String(this.pvpMatchIntent.chipText || ''),
      tags: Array.isArray(this.pvpMatchIntent.tags) ? this.pvpMatchIntent.tags.slice(0, 3) : [],
      rewardPreview: this.pvpMatchIntent.rewardPreview && typeof this.pvpMatchIntent.rewardPreview === 'object' ? {
        winCoins: Math.max(0, Math.floor(Number(this.pvpMatchIntent.rewardPreview.winCoins) || 0)),
        lossCoins: Math.max(0, Math.floor(Number(this.pvpMatchIntent.rewardPreview.lossCoins) || 0)),
        winRatingDelta: Math.trunc(Number(this.pvpMatchIntent.rewardPreview.winRatingDelta) || 0),
        lossRatingDelta: Math.trunc(Number(this.pvpMatchIntent.rewardPreview.lossRatingDelta) || 0)
      } : null
    } : null;
    const pvpResultReview = this.pvpResultReview && typeof this.pvpResultReview === 'object' ? {
      outcomeId: String(this.pvpResultReview.outcomeId || ''),
      verdictLabel: String(this.pvpResultReview.verdictLabel || ''),
      title: String(this.pvpResultReview.title || ''),
      subtitle: String(this.pvpResultReview.subtitle || ''),
      chipText: String(this.pvpResultReview.chipText || ''),
      summary: String(this.pvpResultReview.summary || ''),
      focusTitle: String(this.pvpResultReview.focusTitle || ''),
      focusText: String(this.pvpResultReview.focusText || ''),
      nextTitle: String(this.pvpResultReview.nextTitle || ''),
      nextText: String(this.pvpResultReview.nextText || ''),
      economyLine: String(this.pvpResultReview.economyLine || ''),
      dangerLine: String(this.pvpResultReview.dangerLine || ''),
      tags: Array.isArray(this.pvpResultReview.tags) ? this.pvpResultReview.tags.slice(0, 3) : [],
      dangerProfile: normalizePvpDanger(this.pvpResultReview.dangerProfile || null)
    } : null;
    const pvpPayload = mode === 'pvp-screen' || this.mode === 'pvp' || !!pvpFocus || !!this.pvpOpponentRank || !!pvpDangerProfile || !!pvpResultReview ? {
      activeTab: typeof window !== 'undefined' && PVPScene ? PVPScene.activeTab || null : null,
      myRank: pvpMyRank ? {
        score: Math.max(0, Math.floor(Number(pvpMyRank.score) || 0)),
        realm: Math.max(1, Math.floor(Number(pvpMyRank.realm) || 1)),
        division: pvpMyRank.division || null
      } : null,
      rankingFocus: pvpFocus ? {
        rank: pvpFocus.rank ? {
          objectId: pvpFocus.rank.objectId || null,
          user: pvpFocus.rank.user ? {
            objectId: pvpFocus.rank.user.objectId || null,
            username: pvpFocus.rank.user.username || ''
          } : null,
          score: Math.max(0, Math.floor(Number(pvpFocus.rank.score) || 0)),
          realm: Math.max(1, Math.floor(Number(pvpFocus.rank.realm) || 1)),
          division: pvpFocus.rank.division || null
        } : null,
        duelBrief: pvpFocus.duelBrief && typeof pvpFocus.duelBrief === 'object' ? {
          targetName: String(pvpFocus.duelBrief.targetName || ''),
          targetRankId: String(pvpFocus.duelBrief.targetRankId || ''),
          engagementId: String(pvpFocus.duelBrief.engagementId || ''),
          engagementLabel: String(pvpFocus.duelBrief.engagementLabel || ''),
          engagementLine: String(pvpFocus.duelBrief.engagementLine || ''),
          modeId: String(pvpFocus.duelBrief.modeId || ''),
          modeLabel: String(pvpFocus.duelBrief.modeLabel || ''),
          modeLine: String(pvpFocus.duelBrief.modeLine || ''),
          winRewardText: String(pvpFocus.duelBrief.winRewardText || ''),
          lossRewardText: String(pvpFocus.duelBrief.lossRewardText || ''),
          reserveText: String(pvpFocus.duelBrief.reserveText || ''),
          counterplayText: String(pvpFocus.duelBrief.counterplayText || ''),
          chipText: String(pvpFocus.duelBrief.chipText || ''),
          tags: Array.isArray(pvpFocus.duelBrief.tags) ? pvpFocus.duelBrief.tags.slice(0, 3) : [],
          rewardPreview: pvpFocus.duelBrief.rewardPreview && typeof pvpFocus.duelBrief.rewardPreview === 'object' ? {
            winCoins: Math.max(0, Math.floor(Number(pvpFocus.duelBrief.rewardPreview.winCoins) || 0)),
            lossCoins: Math.max(0, Math.floor(Number(pvpFocus.duelBrief.rewardPreview.lossCoins) || 0)),
            winRatingDelta: Math.trunc(Number(pvpFocus.duelBrief.rewardPreview.winRatingDelta) || 0),
            lossRatingDelta: Math.trunc(Number(pvpFocus.duelBrief.rewardPreview.lossRatingDelta) || 0)
          } : null
        } : null,
        dossier: pvpFocus.dossier && typeof pvpFocus.dossier === 'object' ? {
          targetName: String(pvpFocus.dossier.targetName || ''),
          targetRankId: String(pvpFocus.dossier.targetRankId || ''),
          targetDivision: String(pvpFocus.dossier.targetDivision || ''),
          targetRealm: Math.max(1, Math.floor(Number(pvpFocus.dossier.targetRealm) || 1)),
          confidence: String(pvpFocus.dossier.confidence || ''),
          confidenceLabel: String(pvpFocus.dossier.confidenceLabel || ''),
          title: String(pvpFocus.dossier.title || ''),
          summary: String(pvpFocus.dossier.summary || ''),
          riskLine: String(pvpFocus.dossier.riskLine || ''),
          scoreLine: String(pvpFocus.dossier.scoreLine || ''),
          seasonLine: String(pvpFocus.dossier.seasonLine || ''),
          seasonName: String(pvpFocus.dossier.seasonName || ''),
          seasonDetail: String(pvpFocus.dossier.seasonDetail || ''),
          segmentLabel: String(pvpFocus.dossier.segmentLabel || ''),
          segmentLine: String(pvpFocus.dossier.segmentLine || ''),
          sourceLabel: String(pvpFocus.dossier.sourceLabel || ''),
          sourceLine: String(pvpFocus.dossier.sourceLine || ''),
          formationLabel: String(pvpFocus.dossier.formationLabel || ''),
          formationLine: String(pvpFocus.dossier.formationLine || ''),
          routeValue: String(pvpFocus.dossier.routeValue || ''),
          routeLine: String(pvpFocus.dossier.routeLine || ''),
          comparisonValue: String(pvpFocus.dossier.comparisonValue || ''),
          comparisonLine: String(pvpFocus.dossier.comparisonLine || ''),
          historyValue: String(pvpFocus.dossier.historyValue || ''),
          historyLine: String(pvpFocus.dossier.historyLine || ''),
          historyTag: String(pvpFocus.dossier.historyTag || ''),
          historyCount: Math.max(0, Math.floor(Number(pvpFocus.dossier.historyCount) || 0)),
          trendValue: String(pvpFocus.dossier.trendValue || ''),
          trendLine: String(pvpFocus.dossier.trendLine || ''),
          trendTag: String(pvpFocus.dossier.trendTag || ''),
          trendSampleCount: Math.max(0, Math.floor(Number(pvpFocus.dossier.trendSampleCount) || 0)),
          ledgerValue: String(pvpFocus.dossier.ledgerValue || ''),
          ledgerLine: String(pvpFocus.dossier.ledgerLine || ''),
          ledgerTag: String(pvpFocus.dossier.ledgerTag || ''),
          ledgerSampleCount: Math.max(0, Math.floor(Number(pvpFocus.dossier.ledgerSampleCount) || 0)),
          ledgerChips: Array.isArray(pvpFocus.dossier.ledgerChips) ? pvpFocus.dossier.ledgerChips.slice(0, 4) : [],
          archetypeLabel: String(pvpFocus.dossier.archetypeLabel || ''),
          counterplayText: String(pvpFocus.dossier.counterplayText || ''),
          reserveText: String(pvpFocus.dossier.reserveText || ''),
          tags: Array.isArray(pvpFocus.dossier.tags) ? pvpFocus.dossier.tags.slice(0, 6) : [],
          clueCards: Array.isArray(pvpFocus.dossier.clueCards) ? pvpFocus.dossier.clueCards.slice(0, 6).map(item => ({
            label: String(item && item.label || ''),
            value: String(item && item.value || ''),
            detail: String(item && item.detail || '')
          })) : []
        } : null,
        dangerProfile: normalizePvpDanger(pvpFocus.dangerProfile || null)
      } : null,
      activeMatch: this.pvpOpponentRank || pvpDangerProfile ? {
        opponent: this.pvpOpponentRank ? {
          objectId: this.pvpOpponentRank.objectId || null,
          user: this.pvpOpponentRank.user ? {
            objectId: this.pvpOpponentRank.user.objectId || null,
            username: this.pvpOpponentRank.user.username || ''
          } : null,
          score: Math.max(0, Math.floor(Number(this.pvpOpponentRank.score) || 0)),
          realm: Math.max(1, Math.floor(Number(this.pvpOpponentRank.realm) || 1)),
          division: this.pvpOpponentRank.division || null
        } : null,
        ticket: this.pvpMatchTicket || null,
        dangerProfile: pvpDangerProfile,
        intent: pvpMatchIntent
      } : null,
      resultOverlay: pvpResultReview
    } : null;
    const payload = {
      coordSystem: 'ui-screen-space, origin top-left, +x right, +y down',
      mode,
      player: {
        hp: this.player?.currentHp ?? 0,
        maxHp: this.player?.maxHp ?? 0,
        block: this.player?.block ?? 0,
        energy: this.player?.currentEnergy ?? 0,
        maxEnergy: this.player?.baseEnergy ?? 0,
        hand: Array.isArray(this.player?.hand) ? this.player.hand.length : 0,
        drawPile: Array.isArray(this.player?.drawPile) ? this.player.drawPile.length : 0,
        discardPile: Array.isArray(this.player?.discardPile) ? this.player.discardPile.length : 0,
        stance: this.player?.stance || 'neutral',
        archetypeResonance: this.player?.archetypeResonance ? {
          id: this.player.archetypeResonance.id,
          tier: this.player.archetypeResonance.tier
        } : null,
        runDestiny: this.player && typeof this.player.getRunDestinyMeta === 'function' ? this.player.getRunDestinyMeta() : null,
        runPath: this.player && typeof this.player.getRunPathMeta === 'function' ? this.player.getRunPathMeta() : null,
        runVows: this.player && typeof this.player.getRunVowMetas === 'function' ? this.player.getRunVowMetas() : [],
        spiritCompanion: this.player && typeof this.player.getSpiritCompanionMeta === 'function' ? this.player.getSpiritCompanionMeta() : null,
        spiritCharge: this.player && typeof this.player.getSpiritCompanionMeta === 'function' && this.player.getSpiritCompanionMeta() ? {
          charge: Math.max(0, Math.floor(Number(this.player?.spiritCompanionBattleState?.charge) || 0)),
          max: Math.max(1, Math.floor(Number(this.player.getSpiritCompanionMeta().chargeMax) || 1))
        } : null,
        treasureWorkshop: this.player && typeof this.player.getTreasureWorkshopSnapshot === 'function' ? this.player.getTreasureWorkshopSnapshot('equipped') : [],
        treasureResearch: this.player && typeof this.player.getTreasureWorkshopResearchOverview === 'function' ? this.player.getTreasureWorkshopResearchOverview() : null,
        adventureBuffs: this.player?.adventureBuffs || null
      },
      draft: mode === 'character-selection-screen' ? {
        selectedCharacterId: this.selectedCharacterId || null,
        selectedRunDestinyId: this.selectedRunDestinyId || null,
        selectedSpiritCompanionId: this.selectedSpiritCompanionId || null,
        selectedRunPathId: this.selectedRunPathId || null,
        characterIdentity: this.getCharacterIdentityProfile(this.selectedCharacterId || ''),
        runDestinies: Array.isArray(this.pendingRunDestinyDrafts?.[this.selectedCharacterId || '']) ? this.pendingRunDestinyDrafts[this.selectedCharacterId || ''].slice() : [],
        spiritCompanions: Array.isArray(this.pendingSpiritCompanionDrafts?.[this.selectedCharacterId || '']) ? this.pendingSpiritCompanionDrafts[this.selectedCharacterId || ''].slice() : [],
        runPaths: Array.isArray(this.pendingRunPathDrafts?.[this.selectedCharacterId || '']) ? this.pendingRunPathDrafts[this.selectedCharacterId || ''].slice() : []
      } : null,
      eventModal: (() => {
        const modal = typeof document !== 'undefined' ? document.getElementById('event-modal') : null;
        if (!modal || !modal.classList.contains('active')) return null;
        return {
          title: document.getElementById('event-title')?.textContent || '',
          tone: modal.dataset.eventTone || '',
          atmosphere: document.getElementById('event-atmosphere')?.textContent || '',
          summary: document.getElementById('event-system-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          engineeringEventMeta: this.currentEvent && this.currentEvent.engineeringEventMeta ? {
            trackId: this.currentEvent.engineeringEventMeta.trackId || '',
            name: this.currentEvent.engineeringEventMeta.name || '',
            icon: this.currentEvent.engineeringEventMeta.icon || '',
            tier: Math.max(0, Math.floor(Number(this.currentEvent.engineeringEventMeta.tier) || 0)),
            tierLabel: this.currentEvent.engineeringEventMeta.tierLabel || '',
            summary: this.currentEvent.engineeringEventMeta.summary || '',
            effectSummary: this.currentEvent.engineeringEventMeta.effectSummary || '',
            source: this.currentEvent.engineeringEventMeta.source || '',
            selectedByEngineeringBias: !!this.currentEvent.engineeringEventMeta.selectedByEngineeringBias
          } : null
        };
      })(),
      battle: isBattleMode && this.battle ? {
        turn: this.battle.turnNumber || 0,
        currentTurn: this.battle.currentTurn || 'none',
        encounterTheme: this.battle.activeEncounterTheme ? {
          id: this.battle.activeEncounterTheme.id,
          name: this.battle.activeEncounterTheme.name,
          tierStage: this.battle.activeEncounterTheme.tierStage || 1
        } : null,
        squadEcology: this.battle.activeSquadEcology ? {
          id: this.battle.activeSquadEcology.id,
          name: this.battle.activeSquadEcology.name,
          tag: this.battle.activeSquadEcology.tag,
          count: this.battle.activeSquadEcology.count || 0
        } : null,
        trialChallenge: this.trialData ? {
          id: this.trialData.id || null,
          name: this.trialData.name || null,
          conditions: this.trialData.conditions || {},
          rewardMultiplier: this.trialData.rewardMultiplier || 1,
          reward: this.trialData.reward || null
        } : null,
        battleCommand: typeof this.battle.getBattleCommandSnapshot === 'function' ? this.battle.getBattleCommandSnapshot() : null,
        nodeRisk: currentNodeRisk ? {
          type: currentNodeRisk.type,
          label: currentNodeRisk.label,
          index: currentNodeRisk.index,
          tierId: currentNodeRisk.tierId,
          tierLabel: currentNodeRisk.tierLabel,
          summary: currentNodeRisk.summary,
          counterplay: currentNodeRisk.counterplay
        } : null,
        chapterRules: chapterSnapshot ? {
          chapterIndex: chapterSnapshot.chapterIndex,
          name: chapterSnapshot.name,
          stageLabel: chapterSnapshot.stageLabel,
          dangerProfile: chapterSnapshot.dangerProfile ? {
            index: chapterSnapshot.dangerProfile.index,
            tierId: chapterSnapshot.dangerProfile.tierId,
            tierLabel: chapterSnapshot.dangerProfile.tierLabel,
            summary: chapterSnapshot.dangerProfile.summary,
            dominantRisk: chapterSnapshot.dangerProfile.dominantRisk,
            counterplay: chapterSnapshot.dangerProfile.counterplay
          } : null,
          nemesis: chapterSnapshot.nemesis ? {
            id: chapterSnapshot.nemesis.id,
            name: chapterSnapshot.nemesis.name,
            status: chapterSnapshot.nemesis.status,
            statusLabel: chapterSnapshot.nemesis.statusLabel,
            triggerNodeTypes: chapterSnapshot.nemesis.triggerNodeTypes,
            engagedCount: chapterSnapshot.nemesis.engagedCount,
            recurrenceCount: chapterSnapshot.nemesis.recurrenceCount,
            pressureIndex: chapterSnapshot.nemesis.pressureIndex,
            currentVariantLabel: chapterSnapshot.nemesis.currentVariantLabel,
            clueLine: chapterSnapshot.nemesis.clueLine,
            clueRevealed: chapterSnapshot.nemesis.clueRevealed,
            alliedFactionName: chapterSnapshot.nemesis.alliedFactionName,
            fateOutcome: chapterSnapshot.nemesis.fateOutcome,
            counterplay: chapterSnapshot.nemesis.counterplay,
            rewardSummary: chapterSnapshot.nemesis.rewardSummary
          } : null,
          skyOmen: chapterSnapshot.skyOmen ? {
            name: chapterSnapshot.skyOmen.name,
            desc: chapterSnapshot.skyOmen.desc
          } : null,
          leyline: chapterSnapshot.leyline ? {
            name: chapterSnapshot.leyline.name,
            desc: chapterSnapshot.leyline.desc
          } : null
        } : null,
        chapterBattlefield: typeof this.battle.getChapterBattlefieldDisplayState === 'function' ? this.battle.getChapterBattlefieldDisplayState() : null,
        systemsHud: typeof this.battle.getBattleSystemDisplayState === 'function' ? this.battle.getBattleSystemDisplayState() : null,
        bossAct: typeof this.battle.getBossActDisplayState === 'function' ? (() => {
          const display = this.battle.getBossActDisplayState();
          if (!display || !display.state || !display.act) return null;
          return {
            bossId: display.state.bossId || display.boss?.id || null,
            currentActId: display.act.id || null,
            currentActName: display.act.name || '',
            memoryName: display.state.memoryName || '',
            runPathCounterplay: display.state.runPathCounterplay || null,
            counterChips: typeof this.battle.resolveBossActCounterChips === 'function' ? this.battle.resolveBossActCounterChips(display) : []
          };
        })() : null,
        enemies: (this.battle.enemies || []).filter(e => e.currentHp > 0).map((e, idx) => ({
          i: idx,
          id: e.id,
          name: e.name,
          hp: e.currentHp,
          maxHp: e.maxHp,
          block: e.block || 0,
          buffs: e.buffs || {},
          phase: e.currentPhase || 0,
          tactic: e.tacticalPlanLabel || null
        }))
      } : null,
      map: this.map ? {
        realm: this.player?.realm || 1,
        chapter: chapterSnapshot ? {
          chapterIndex: chapterSnapshot.chapterIndex,
          name: chapterSnapshot.name,
          stageLabel: chapterSnapshot.stageLabel,
          dangerProfile: chapterSnapshot.dangerProfile ? {
            index: chapterSnapshot.dangerProfile.index,
            tierId: chapterSnapshot.dangerProfile.tierId,
            tierLabel: chapterSnapshot.dangerProfile.tierLabel,
            summary: chapterSnapshot.dangerProfile.summary,
            dominantRisk: chapterSnapshot.dangerProfile.dominantRisk,
            counterplay: chapterSnapshot.dangerProfile.counterplay
          } : null,
          nemesis: chapterSnapshot.nemesis ? {
            id: chapterSnapshot.nemesis.id,
            name: chapterSnapshot.nemesis.name,
            status: chapterSnapshot.nemesis.status,
            statusLabel: chapterSnapshot.nemesis.statusLabel,
            triggerNodeTypes: chapterSnapshot.nemesis.triggerNodeTypes,
            engagedCount: chapterSnapshot.nemesis.engagedCount,
            recurrenceCount: chapterSnapshot.nemesis.recurrenceCount,
            pressureIndex: chapterSnapshot.nemesis.pressureIndex,
            currentVariantLabel: chapterSnapshot.nemesis.currentVariantLabel,
            clueLine: chapterSnapshot.nemesis.clueLine,
            clueRevealed: chapterSnapshot.nemesis.clueRevealed,
            alliedFactionName: chapterSnapshot.nemesis.alliedFactionName,
            fateOutcome: chapterSnapshot.nemesis.fateOutcome,
            counterplay: chapterSnapshot.nemesis.counterplay,
            rewardSummary: chapterSnapshot.nemesis.rewardSummary
          } : null,
          skyOmen: chapterSnapshot.skyOmen ? {
            name: chapterSnapshot.skyOmen.name,
            desc: chapterSnapshot.skyOmen.desc
          } : null,
          leyline: chapterSnapshot.leyline ? {
            name: chapterSnapshot.leyline.name,
            desc: chapterSnapshot.leyline.desc
          } : null,
          frontierRisk: frontierRisk ? {
            type: frontierRisk.type,
            label: frontierRisk.label,
            index: frontierRisk.index,
            tierId: frontierRisk.tierId,
            tierLabel: frontierRisk.tierLabel,
            summary: frontierRisk.summary,
            counterplay: frontierRisk.counterplay,
            reserveGuidance: frontierRisk.reserveGuidance
          } : null,
          engineeringFocus: strategicEngineering && strategicEngineering.focusTrack ? {
            trackId: strategicEngineering.focusTrack.trackId,
            name: strategicEngineering.focusTrack.name,
            icon: strategicEngineering.focusTrack.icon,
            tier: strategicEngineering.focusTrack.tier,
            tierLabel: strategicEngineering.focusTrack.tierLabel,
            progress: strategicEngineering.focusTrack.progress,
            nextTarget: strategicEngineering.focusTrack.nextTarget,
            remaining: strategicEngineering.focusTrack.remaining,
            effectSummary: strategicEngineering.focusTrack.effectSummary,
            summary: strategicEngineering.summary
          } : null,
          engineeringEventBias: strategicEngineeringEventBias ? {
            trackId: strategicEngineeringEventBias.trackId,
            name: strategicEngineeringEventBias.name,
            icon: strategicEngineeringEventBias.icon,
            tier: strategicEngineeringEventBias.tier,
            tierLabel: strategicEngineeringEventBias.tierLabel,
            biasChance: strategicEngineeringEventBias.biasChance,
            eventIds: Array.isArray(strategicEngineeringEventBias.eventIds) ? strategicEngineeringEventBias.eventIds.slice() : [],
            signal: strategicEngineeringEventBias.signal,
            bonusPreview: strategicEngineeringEventBias.bonusPreview,
            summary: strategicEngineeringEventBias.summary
          } : null
        } : null,
        engineeringProjects: strategicEngineering ? strategicEngineering.allTracks.map(track => ({
          trackId: track.trackId,
          name: track.name,
          icon: track.icon,
          nodeLabel: track.nodeLabel,
          tier: track.tier,
          tierLabel: track.tierLabel,
          progress: track.progress,
          nextTarget: track.nextTarget,
          remaining: track.remaining,
          effectSummary: track.effectSummary
        })) : [],
        runPathFlash: this.lastRunPathMapFeedback ? {
          pathId: this.lastRunPathMapFeedback.pathId || null,
          name: this.lastRunPathMapFeedback.name || null,
          phaseLabel: this.lastRunPathMapFeedback.phaseLabel || '',
          title: this.lastRunPathMapFeedback.title || '',
          rewardText: this.lastRunPathMapFeedback.rewardText || '',
          completed: !!this.lastRunPathMapFeedback.completed
        } : null,
        activeNodes: typeof this.map.getAccessibleNodes === 'function' ? this.map.getAccessibleNodes().map(n => {
          const risk = typeof this.map.resolveNodeRiskProfile === 'function' ? this.map.resolveNodeRiskProfile(n, chapterSnapshot) : null;
          return {
            id: n.id,
            row: n.row,
            type: n.type,
            engineering: strategicEngineering ? (() => {
              const track = strategicEngineering.allTracks.find(entry => entry.trackId === n.type);
              if (!track) return null;
              return {
                trackId: track.trackId,
                name: track.name,
                tier: track.tier,
                tierLabel: track.tierLabel,
                progress: track.progress,
                nextTarget: track.nextTarget,
                remaining: track.remaining,
                effectSummary: track.effectSummary
              };
            })() : null,
            risk: risk ? {
              index: risk.index,
              tierId: risk.tierId,
              tierLabel: risk.tierLabel,
              label: risk.label,
              summary: risk.summary
            } : null
          };
        }) : []
      } : null,
      destinyLedger: this.getChapterEventLedgerSnapshot({
        includeEntries: true,
        limit: 4
      }),
      legacy: {
        essence: this.legacyProgress?.essence || 0,
        unspent: this.getLegacyUnspentEssence(),
        upgrades: this.legacyProgress?.upgrades || {},
        lastPreset: this.legacyProgress?.lastPreset || null,
        secondaryPreset: this.legacyProgress?.secondaryPreset || null,
        doctrine: this.player?.legacyRunDoctrine || null,
        mission: this.player?.legacyRunMission || null
      },
      reward: mode === 'reward-screen' ? {
        stealState: typeof document !== 'undefined' ? document.getElementById('reward-screen')?.dataset?.stealState || 'hidden' : 'hidden',
        battleMeta: this.lastBattleRewardMeta ? {
          encounter: !!this.lastBattleRewardMeta.encounter,
          squad: !!this.lastBattleRewardMeta.squad
        } : null,
        expedition: (() => {
          const expeditionMeta = this.rewardView ? this.rewardView.getRewardExpeditionMeta() : null;
          if (!expeditionMeta) return null;
          const brief = this.rewardView ? this.rewardView.getRewardNarrativeBriefMeta() : null;
          const serializeSeasonBoardLaneReward = (reward = null) => {
            if (!reward || typeof reward !== 'object') return null;
            const gains = reward.gains && typeof reward.gains === 'object' ? reward.gains : {};
            return {
              id: reward.id || '',
              weekTag: reward.weekTag || '',
              weekLabel: reward.weekLabel || '',
              laneId: reward.laneId || '',
              laneLabel: reward.laneLabel || '',
              laneIcon: reward.laneIcon || '',
              rewardKey: reward.rewardKey || '',
              label: reward.label || '',
              summaryLine: reward.summaryLine || '',
              detailLine: reward.detailLine || '',
              status: reward.status || '',
              statusLabel: reward.statusLabel || '',
              ready: !!reward.ready,
              claimable: !!reward.claimable,
              claimed: !!reward.claimed,
              claimedAt: Math.max(0, Math.floor(Number(reward.claimedAt) || 0)),
              rewardLine: reward.rewardLine || '',
              gains: {
                insight: Math.max(0, Math.floor(Number(gains.insight ?? gains.heavenlyInsight) || 0)),
                karma: Math.max(0, Math.floor(Number(gains.karma) || 0)),
                ringExp: Math.max(0, Math.floor(Number(gains.ringExp) || 0)),
                gold: Math.max(0, Math.floor(Number(gains.gold) || 0))
              },
              buttonLabel: reward.buttonLabel || '',
              progressText: reward.progressText || ''
            };
          };
          const serializeSeasonBoardFrontier = (frontier = null) => {
            if (!frontier || typeof frontier !== 'object') return null;
            const decree = frontier.decree && typeof frontier.decree === 'object' ? {
              available: frontier.decree.available !== false,
              id: frontier.decree.id || '',
              weekTag: frontier.decree.weekTag || '',
              phaseId: frontier.decree.phaseId || '',
              phaseLabel: frontier.decree.phaseLabel || '',
              laneId: frontier.decree.laneId || '',
              laneLabel: frontier.decree.laneLabel || '',
              fullLaneLabel: frontier.decree.fullLaneLabel || '',
              statusId: frontier.decree.statusId || '',
              statusLabel: frontier.decree.statusLabel || '',
              pressureScore: Math.max(0, Math.min(3, Math.floor(Number(frontier.decree.pressureScore) || 0))),
              tone: frontier.decree.tone || '',
              toneLabel: frontier.decree.toneLabel || '',
              title: frontier.decree.title || '',
              summaryLine: frontier.decree.summaryLine || '',
              constraintLine: frontier.decree.constraintLine || '',
              successLine: frontier.decree.successLine || '',
              riskLine: frontier.decree.riskLine || '',
              focusLine: frontier.decree.focusLine || '',
              actionLaneId: frontier.decree.actionLaneId || '',
              actionType: frontier.decree.actionType || '',
              actionValue: frontier.decree.actionValue || '',
              actionTargetLabel: frontier.decree.actionTargetLabel || '',
              taskId: frontier.decree.taskId || '',
              source: frontier.decree.source || '',
              sourceId: frontier.decree.sourceId || ''
            } : null;
            const chronicle = frontier.chronicle && typeof frontier.chronicle === 'object' ? {
              available: frontier.chronicle.available !== false,
              id: frontier.chronicle.id || '',
              weekTag: frontier.chronicle.weekTag || '',
              phaseId: frontier.chronicle.phaseId || '',
              phaseLabel: frontier.chronicle.phaseLabel || '',
              laneId: frontier.chronicle.laneId || '',
              laneLabel: frontier.chronicle.laneLabel || '',
              fullLaneLabel: frontier.chronicle.fullLaneLabel || '',
              statusId: frontier.chronicle.statusId || '',
              statusLabel: frontier.chronicle.statusLabel || '',
              pressureScore: Math.max(0, Math.min(3, Math.floor(Number(frontier.chronicle.pressureScore) || 0))),
              title: frontier.chronicle.title || '',
              summaryLine: frontier.chronicle.summaryLine || '',
              currentEntryLine: frontier.chronicle.currentEntryLine || '',
              progressLine: frontier.chronicle.progressLine || '',
              lessonLine: frontier.chronicle.lessonLine || '',
              nextRecordLine: frontier.chronicle.nextRecordLine || '',
              actionLaneId: frontier.chronicle.actionLaneId || '',
              actionTargetLabel: frontier.chronicle.actionTargetLabel || '',
              taskId: frontier.chronicle.taskId || '',
              source: frontier.chronicle.source || '',
              sourceId: frontier.chronicle.sourceId || ''
            } : null;
            const council = frontier.council && typeof frontier.council === 'object' ? {
              available: frontier.council.available !== false,
              id: frontier.council.id || '',
              weekTag: frontier.council.weekTag || '',
              phaseId: frontier.council.phaseId || '',
              phaseLabel: frontier.council.phaseLabel || '',
              laneId: frontier.council.laneId || '',
              laneLabel: frontier.council.laneLabel || '',
              fullLaneLabel: frontier.council.fullLaneLabel || '',
              statusId: frontier.council.statusId || '',
              statusLabel: frontier.council.statusLabel || '',
              pressureScore: Math.max(0, Math.min(3, Math.floor(Number(frontier.council.pressureScore) || 0))),
              title: frontier.council.title || '',
              summaryLine: frontier.council.summaryLine || '',
              verdictLine: frontier.council.verdictLine || '',
              focusLine: frontier.council.focusLine || '',
              supportLine: frontier.council.supportLine || '',
              auditLine: frontier.council.auditLine || '',
              riskLine: frontier.council.riskLine || '',
              source: frontier.council.source || '',
              sourceId: frontier.council.sourceId || '',
              laneOpinions: Array.isArray(frontier.council.laneOpinions) ? frontier.council.laneOpinions.map(opinion => ({
                laneId: opinion?.laneId || '',
                laneLabel: opinion?.laneLabel || '',
                role: opinion?.role || '',
                stance: opinion?.stance || '',
                stanceLabel: opinion?.stanceLabel || '',
                noteLine: opinion?.noteLine || ''
              })) : []
            } : null;
            const resolution = frontier.resolution && typeof frontier.resolution === 'object' ? {
              available: frontier.resolution.available !== false,
              submitted: !!frontier.resolution.submitted,
              id: frontier.resolution.id || '',
              weekTag: frontier.resolution.weekTag || '',
              phaseId: frontier.resolution.phaseId || '',
              phaseLabel: frontier.resolution.phaseLabel || '',
              laneId: frontier.resolution.laneId || '',
              laneLabel: frontier.resolution.laneLabel || '',
              fullLaneLabel: frontier.resolution.fullLaneLabel || '',
              statusId: frontier.resolution.statusId || '',
              statusLabel: frontier.resolution.statusLabel || '',
              choiceId: frontier.resolution.choiceId || '',
              choiceLabel: frontier.resolution.choiceLabel || '',
              suggestedChoiceId: frontier.resolution.suggestedChoiceId || '',
              suggestedChoiceLabel: frontier.resolution.suggestedChoiceLabel || '',
              stanceId: frontier.resolution.stanceId || '',
              supportLaneId: frontier.resolution.supportLaneId || '',
              supportLaneLabel: frontier.resolution.supportLaneLabel || '',
              settlementOutcomeId: frontier.resolution.settlementOutcomeId || '',
              settlementOutcomeLabel: frontier.resolution.settlementOutcomeLabel || '',
              resolutionTier: frontier.resolution.resolutionTier || '',
              resolvedStatus: frontier.resolution.resolvedStatus || '',
              proofQuality: frontier.resolution.proofQuality || '',
              lineageStyle: frontier.resolution.lineageStyle || '',
              summaryLine: frontier.resolution.summaryLine || '',
              chronicleSealLine: frontier.resolution.chronicleSealLine || '',
              councilResolutionLine: frontier.resolution.councilResolutionLine || '',
              source: frontier.resolution.source || '',
              sourceId: frontier.resolution.sourceId || '',
              submittedAt: Math.max(0, Math.floor(Number(frontier.resolution.submittedAt) || 0))
            } : null;
            const chronicleArchive = frontier.chronicleArchive && typeof frontier.chronicleArchive === 'object' ? {
              available: frontier.chronicleArchive.available !== false,
              id: frontier.chronicleArchive.id || '',
              weekTag: frontier.chronicleArchive.weekTag || '',
              weekLabel: frontier.chronicleArchive.weekLabel || '',
              totalRecords: Math.max(0, Math.floor(Number(frontier.chronicleArchive.totalRecords) || 0)),
              sealedCount: Math.max(0, Math.floor(Number(frontier.chronicleArchive.sealedCount) || 0)),
              countsByChoice: {
                hold_primary: Math.max(0, Math.floor(Number(frontier.chronicleArchive.countsByChoice?.hold_primary) || 0)),
                rebalance_support: Math.max(0, Math.floor(Number(frontier.chronicleArchive.countsByChoice?.rebalance_support) || 0)),
                seal_dispute: Math.max(0, Math.floor(Number(frontier.chronicleArchive.countsByChoice?.seal_dispute) || 0))
              },
              countsByStance: {
                frontier_loyalist: Math.max(0, Math.floor(Number(frontier.chronicleArchive.countsByStance?.frontier_loyalist) || 0)),
                support_balancer: Math.max(0, Math.floor(Number(frontier.chronicleArchive.countsByStance?.support_balancer) || 0)),
                dispute_archivist: Math.max(0, Math.floor(Number(frontier.chronicleArchive.countsByStance?.dispute_archivist) || 0))
              },
              dominantStanceId: frontier.chronicleArchive.dominantStanceId || '',
              dominantStanceLabel: frontier.chronicleArchive.dominantStanceLabel || '',
              summaryLine: frontier.chronicleArchive.summaryLine || '',
              detailLine: frontier.chronicleArchive.detailLine || '',
              progressText: frontier.chronicleArchive.progressText || '',
              latestEntry: frontier.chronicleArchive.latestEntry && typeof frontier.chronicleArchive.latestEntry === 'object' ? {
                recordId: frontier.chronicleArchive.latestEntry.recordId || '',
                weekTag: frontier.chronicleArchive.latestEntry.weekTag || '',
                weekLabel: frontier.chronicleArchive.latestEntry.weekLabel || '',
                choiceId: frontier.chronicleArchive.latestEntry.choiceId || '',
                choiceLabel: frontier.chronicleArchive.latestEntry.choiceLabel || '',
                stanceId: frontier.chronicleArchive.latestEntry.stanceId || '',
                stanceLabel: frontier.chronicleArchive.latestEntry.stanceLabel || '',
                supportLaneId: frontier.chronicleArchive.latestEntry.supportLaneId || '',
                supportLaneLabel: frontier.chronicleArchive.latestEntry.supportLaneLabel || '',
                summaryLine: frontier.chronicleArchive.latestEntry.summaryLine || '',
                chronicleSealLine: frontier.chronicleArchive.latestEntry.chronicleSealLine || '',
                councilResolutionLine: frontier.chronicleArchive.latestEntry.councilResolutionLine || '',
                submittedAt: Math.max(0, Math.floor(Number(frontier.chronicleArchive.latestEntry.submittedAt) || 0))
              } : null,
              styleEntries: Array.isArray(frontier.chronicleArchive.styleEntries) ? frontier.chronicleArchive.styleEntries.map(entry => ({
                id: entry?.id || '',
                label: entry?.label || '',
                choiceId: entry?.choiceId || '',
                choiceLabel: entry?.choiceLabel || '',
                count: Math.max(0, Math.floor(Number(entry?.count) || 0)),
                countText: entry?.countText || '',
                summaryLine: entry?.summaryLine || '',
                latestAt: Math.max(0, Math.floor(Number(entry?.latestAt) || 0))
              })) : [],
              entries: Array.isArray(frontier.chronicleArchive.entries) ? frontier.chronicleArchive.entries.map(entry => ({
                recordId: entry?.recordId || '',
                weekTag: entry?.weekTag || '',
                weekLabel: entry?.weekLabel || '',
                choiceId: entry?.choiceId || '',
                choiceLabel: entry?.choiceLabel || '',
                stanceId: entry?.stanceId || '',
                stanceLabel: entry?.stanceLabel || '',
                supportLaneId: entry?.supportLaneId || '',
                supportLaneLabel: entry?.supportLaneLabel || '',
                summaryLine: entry?.summaryLine || '',
                chronicleSealLine: entry?.chronicleSealLine || '',
                councilResolutionLine: entry?.councilResolutionLine || '',
                submittedAt: Math.max(0, Math.floor(Number(entry?.submittedAt) || 0))
              })) : []
            } : null;
            return {
              available: frontier.available !== false,
              id: frontier.id || '',
              statusId: frontier.statusId || '',
              statusLabel: frontier.statusLabel || '',
              pressureScore: Math.max(0, Math.min(3, Math.floor(Number(frontier.pressureScore) || 0))),
              pressureLabel: frontier.pressureLabel || '',
              primaryFrontId: frontier.primaryFrontId || '',
              primaryFrontLabel: frontier.primaryFrontLabel || '',
              primaryFrontShortLabel: frontier.primaryFrontShortLabel || '',
              primaryLaneId: frontier.primaryLaneId || '',
              primaryAnchorSection: frontier.primaryAnchorSection || '',
              summaryLine: frontier.summaryLine || '',
              detailLine: frontier.detailLine || '',
              guideLine: frontier.guideLine || '',
              actionLaneId: frontier.actionLaneId || '',
              actionType: frontier.actionType || '',
              actionValue: frontier.actionValue || '',
              ctaLabel: frontier.ctaLabel || '',
              actionTargetLabel: frontier.actionTargetLabel || '',
              actionLine: frontier.actionLine || '',
              source: frontier.source || '',
              sourceId: frontier.sourceId || '',
              taskSource: frontier.taskSource || '',
              taskSourceId: frontier.taskSourceId || '',
              taskId: frontier.taskId || '',
              decree,
              chronicle,
              council,
              resolution,
              chronicleArchive,
              items: Array.isArray(frontier.items) ? frontier.items.map((item, index) => ({
                id: item?.id || '',
                laneId: item?.laneId || '',
                label: item?.label || '',
                shortLabel: item?.shortLabel || '',
                icon: item?.icon || '',
                role: item?.role || '',
                roleLabel: item?.roleLabel || '',
                statusId: item?.statusId || '',
                statusLabel: item?.statusLabel || '',
                pressureScore: Math.max(0, Math.min(3, Math.floor(Number(item?.pressureScore) || 0))),
                pressureLabel: item?.pressureLabel || '',
                progressText: item?.progressText || '',
                completed: !!item?.completed,
                summaryLine: item?.summaryLine || '',
                detailLine: item?.detailLine || '',
                anchorSection: item?.anchorSection || '',
                actionType: item?.actionType || '',
                actionValue: item?.actionValue || '',
                ctaLabel: item?.ctaLabel || '',
                actionTargetLabel: item?.actionTargetLabel || '',
                priority: Math.max(1, Math.min(9, Math.floor(Number(item?.priority) || (index + 1))))
              })) : []
            };
          };
          const serializeSeasonBoardChapterArc = (chapterArc = null) => {
            if (!chapterArc || typeof chapterArc !== 'object') return null;
            const rescueWindow = chapterArc.rescueWindow && typeof chapterArc.rescueWindow === 'object' ? {
              available: chapterArc.rescueWindow.available !== false,
              open: !!chapterArc.rescueWindow.open,
              statusId: chapterArc.rescueWindow.statusId || '',
              statusLabel: chapterArc.rescueWindow.statusLabel || '',
              reasonLine: chapterArc.rescueWindow.reasonLine || '',
              guideLine: chapterArc.rescueWindow.guideLine || ''
            } : null;
            const pressureWindow = chapterArc.pressureWindow && typeof chapterArc.pressureWindow === 'object' ? {
              available: chapterArc.pressureWindow.available !== false,
              open: !!chapterArc.pressureWindow.open,
              statusId: chapterArc.pressureWindow.statusId || '',
              statusLabel: chapterArc.pressureWindow.statusLabel || '',
              reasonLine: chapterArc.pressureWindow.reasonLine || '',
              guideLine: chapterArc.pressureWindow.guideLine || '',
              shortLine: chapterArc.pressureWindow.shortLine || ''
            } : null;
            const review = chapterArc.review && typeof chapterArc.review === 'object' ? {
              available: chapterArc.review.available !== false,
              statusId: chapterArc.review.statusId || '',
              statusLabel: chapterArc.review.statusLabel || '',
              endingPreviewLine: chapterArc.review.endingPreviewLine || '',
              finalCommentLine: chapterArc.review.finalCommentLine || '',
              summaryLine: chapterArc.review.summaryLine || ''
            } : null;
            const objective = chapterArc.objective && typeof chapterArc.objective === 'object' ? {
              available: chapterArc.objective.available !== false,
              id: chapterArc.objective.id || '',
              label: chapterArc.objective.label || '',
              statusId: chapterArc.objective.statusId || '',
              statusLabel: chapterArc.objective.statusLabel || '',
              focusLaneId: chapterArc.objective.focusLaneId || '',
              focusLaneLabel: chapterArc.objective.focusLaneLabel || '',
              summaryLine: chapterArc.objective.summaryLine || '',
              statusLine: chapterArc.objective.statusLine || '',
              goalLine: chapterArc.objective.goalLine || '',
              reasonLine: chapterArc.objective.reasonLine || '',
              guideLine: chapterArc.objective.guideLine || '',
              shortLine: chapterArc.objective.shortLine || ''
            } : null;
            const carryover = chapterArc.carryover && typeof chapterArc.carryover === 'object' ? {
              available: chapterArc.carryover.available !== false,
              chapterId: chapterArc.carryover.chapterId || '',
              chapterLabel: chapterArc.carryover.chapterLabel || '',
              resultId: chapterArc.carryover.resultId || '',
              resultLabel: chapterArc.carryover.resultLabel || '',
              dominantChoiceId: chapterArc.carryover.dominantChoiceId || '',
              dominantChoiceLabel: chapterArc.carryover.dominantChoiceLabel || '',
              preferredLaneId: chapterArc.carryover.preferredLaneId || '',
              preferredLaneLabel: chapterArc.carryover.preferredLaneLabel || '',
              openingWeek: !!chapterArc.carryover.openingWeek,
              applied: !!chapterArc.carryover.applied,
              statusLabel: chapterArc.carryover.statusLabel || '',
              summaryLine: chapterArc.carryover.summaryLine || '',
              guideLine: chapterArc.carryover.guideLine || ''
            } : null;
            return {
              available: chapterArc.available !== false,
              id: chapterArc.id || '',
              chapterId: chapterArc.chapterId || '',
              chapterLabel: chapterArc.chapterLabel || '',
              arcLabel: chapterArc.arcLabel || '',
              windowLabel: chapterArc.windowLabel || '',
              weekTag: chapterArc.weekTag || '',
              weekLabel: chapterArc.weekLabel || '',
              weekSlot: Math.max(1, Math.min(3, Math.floor(Number(chapterArc.weekSlot) || 1))),
              weeksRemaining: Math.max(0, Math.min(3, Math.floor(Number(chapterArc.weeksRemaining) || 0))),
              sealedWeeks: Math.max(0, Math.min(3, Math.floor(Number(chapterArc.sealedWeeks) || 0))),
              targetWeeks: Math.max(1, Math.min(3, Math.floor(Number(chapterArc.targetWeeks) || 3))),
              progressText: chapterArc.progressText || '',
              countsByChoice: {
                hold_primary: Math.max(0, Math.floor(Number(chapterArc.countsByChoice?.hold_primary) || 0)),
                rebalance_support: Math.max(0, Math.floor(Number(chapterArc.countsByChoice?.rebalance_support) || 0)),
                seal_dispute: Math.max(0, Math.floor(Number(chapterArc.countsByChoice?.seal_dispute) || 0))
              },
              countsByStance: {
                frontier_loyalist: Math.max(0, Math.floor(Number(chapterArc.countsByStance?.frontier_loyalist) || 0)),
                support_balancer: Math.max(0, Math.floor(Number(chapterArc.countsByStance?.support_balancer) || 0)),
                dispute_archivist: Math.max(0, Math.floor(Number(chapterArc.countsByStance?.dispute_archivist) || 0))
              },
              dominantChoiceId: chapterArc.dominantChoiceId || '',
              dominantChoiceLabel: chapterArc.dominantChoiceLabel || '',
              dominantStanceId: chapterArc.dominantStanceId || '',
              dominantStanceLabel: chapterArc.dominantStanceLabel || '',
              summaryLine: chapterArc.summaryLine || '',
              statusLine: chapterArc.statusLine || '',
              goalLine: chapterArc.goalLine || '',
              feedbackLine: chapterArc.feedbackLine || '',
              rescueWindow,
              pressureWindow,
              review,
              objective,
              carryover,
              entries: Array.isArray(chapterArc.entries) ? chapterArc.entries.map(entry => ({
                recordId: entry?.recordId || '',
                weekTag: entry?.weekTag || '',
                weekLabel: entry?.weekLabel || '',
                weekSlot: Math.max(1, Math.min(3, Math.floor(Number(entry?.weekSlot) || 1))),
                choiceId: entry?.choiceId || '',
                choiceLabel: entry?.choiceLabel || '',
                stanceId: entry?.stanceId || '',
                stanceLabel: entry?.stanceLabel || '',
                supportLaneId: entry?.supportLaneId || '',
                supportLaneLabel: entry?.supportLaneLabel || '',
                summaryLine: entry?.summaryLine || '',
                chronicleSealLine: entry?.chronicleSealLine || '',
                councilResolutionLine: entry?.councilResolutionLine || '',
                submittedAt: Math.max(0, Math.floor(Number(entry?.submittedAt) || 0))
              })) : []
            };
          };
          return {
            id: expeditionMeta.id || null,
            chapterName: expeditionMeta.chapterName || '',
            endingName: expeditionMeta.endingName || '',
            endingIcon: expeditionMeta.endingIcon || '',
            score: Math.max(0, Math.floor(Number(expeditionMeta.score) || 0)),
            scoreLabel: expeditionMeta.scoreLabel || '',
            ratingLabel: expeditionMeta.ratingLabel || '',
            ratingTone: expeditionMeta.ratingTone || 'idle',
            highlightLine: expeditionMeta.highlightLine || '',
            trainingAdvice: expeditionMeta.trainingAdvice || '',
            branchName: expeditionMeta.branchName || '',
            nemesisLine: expeditionMeta.nemesisLine || '',
            focusLines: Array.isArray(expeditionMeta.focusLines) ? expeditionMeta.focusLines.map(line => String(line || '')).filter(Boolean) : [],
            breakdown: Array.isArray(expeditionMeta.breakdown) ? expeditionMeta.breakdown.map(line => String(line || '')).filter(Boolean) : [],
            tags: Array.isArray(expeditionMeta.tags) ? expeditionMeta.tags.map(tag => String(tag || '')).filter(Boolean) : [],
            seasonBoard: expeditionMeta.seasonBoard ? {
              seasonId: expeditionMeta.seasonBoard.seasonId || '',
              seasonLabel: expeditionMeta.seasonBoard.seasonLabel || '',
              seasonName: expeditionMeta.seasonBoard.seasonName || '',
              seasonIcon: expeditionMeta.seasonBoard.seasonIcon || '',
              seasonSource: expeditionMeta.seasonBoard.seasonSource || '',
              weekTag: expeditionMeta.seasonBoard.weekTag || '',
              weekLabel: expeditionMeta.seasonBoard.weekLabel || '',
              phaseId: expeditionMeta.seasonBoard.phaseId || '',
              phaseLabel: expeditionMeta.seasonBoard.phaseLabel || '',
              phaseIcon: expeditionMeta.seasonBoard.phaseIcon || '',
              themeId: expeditionMeta.seasonBoard.themeId || '',
              themeLabel: expeditionMeta.seasonBoard.themeLabel || '',
              summaryLine: expeditionMeta.seasonBoard.summaryLine || '',
              detailLine: expeditionMeta.seasonBoard.detailLine || '',
              guideLine: expeditionMeta.seasonBoard.guideLine || '',
              statusLine: expeditionMeta.seasonBoard.statusLine || '',
              rewardLine: expeditionMeta.seasonBoard.rewardLine || '',
              crossModeSummary: expeditionMeta.seasonBoard.crossModeSummary || '',
              completedTaskCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.completedTaskCount) || 0)),
              totalTaskCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.totalTaskCount) || 0)),
              progress: expeditionMeta.seasonBoard.progress ? {
                completed: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.progress.completed) || 0)),
                total: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.progress.total) || 0)),
                progressText: expeditionMeta.seasonBoard.progress.progressText || '',
                ratio: Math.max(0, Math.min(1, Number(expeditionMeta.seasonBoard.progress.ratio) || 0))
              } : null,
              settlement: expeditionMeta.seasonBoard.settlement ? {
                id: expeditionMeta.seasonBoard.settlement.id || '',
                sourceRunId: expeditionMeta.seasonBoard.settlement.sourceRunId || '',
                chapterIndex: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.settlement.chapterIndex) || 0)),
                outcomeId: expeditionMeta.seasonBoard.settlement.outcomeId || '',
                outcomeLabel: expeditionMeta.seasonBoard.settlement.outcomeLabel || '',
                outcomeTone: expeditionMeta.seasonBoard.settlement.outcomeTone || '',
                summaryLine: expeditionMeta.seasonBoard.settlement.summaryLine || '',
                detailLine: expeditionMeta.seasonBoard.settlement.detailLine || '',
                guideLine: expeditionMeta.seasonBoard.settlement.guideLine || '',
                statusLine: expeditionMeta.seasonBoard.settlement.statusLine || '',
                progressText: expeditionMeta.seasonBoard.settlement.progressText || '',
                settlementWeekTag: expeditionMeta.seasonBoard.settlement.settlementWeekTag || '',
                settlementPhaseId: expeditionMeta.seasonBoard.settlement.settlementPhaseId || '',
                settlementSource: expeditionMeta.seasonBoard.settlement.settlementSource || '',
                resolutionTier: expeditionMeta.seasonBoard.settlement.resolutionTier || '',
                resolvedStatus: expeditionMeta.seasonBoard.settlement.resolvedStatus || '',
                writebackLine: expeditionMeta.seasonBoard.settlement.writebackLine || '',
                proofQuality: expeditionMeta.seasonBoard.settlement.proofQuality || '',
                lineageStyle: expeditionMeta.seasonBoard.settlement.lineageStyle || '',
                primaryVerificationRecordId: expeditionMeta.seasonBoard.settlement.primaryVerificationRecordId || '',
                sideVerificationRecordId: expeditionMeta.seasonBoard.settlement.sideVerificationRecordId || '',
                selectedContractLabel: expeditionMeta.seasonBoard.settlement.selectedContractLabel || '',
                contractResolutionLine: expeditionMeta.seasonBoard.settlement.contractResolutionLine || '',
                recoveryEligible: !!expeditionMeta.seasonBoard.settlement.recoveryEligible
              } : null,
              debtPack: expeditionMeta.seasonBoard.debtPack ? {
                id: expeditionMeta.seasonBoard.debtPack.id || '',
                sourceRunId: expeditionMeta.seasonBoard.debtPack.sourceRunId || '',
                chapterIndex: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.debtPack.chapterIndex) || 0)),
                sourceAgendaId: expeditionMeta.seasonBoard.debtPack.sourceAgendaId || '',
                sourceLabel: expeditionMeta.seasonBoard.debtPack.sourceLabel || '',
                debtThemeId: expeditionMeta.seasonBoard.debtPack.debtThemeId || '',
                debtThemeLabel: expeditionMeta.seasonBoard.debtPack.debtThemeLabel || '',
                summaryLine: expeditionMeta.seasonBoard.debtPack.summaryLine || '',
                detailLine: expeditionMeta.seasonBoard.debtPack.detailLine || '',
                guideLine: expeditionMeta.seasonBoard.debtPack.guideLine || '',
                statusLine: expeditionMeta.seasonBoard.debtPack.statusLine || '',
                progressText: expeditionMeta.seasonBoard.debtPack.progressText || '',
                settleWindowText: expeditionMeta.seasonBoard.debtPack.settleWindowText || '',
                recommendedValidationLabel: expeditionMeta.seasonBoard.debtPack.recommendedValidationLabel || '',
                recommendedAnchorSection: expeditionMeta.seasonBoard.debtPack.recommendedAnchorSection || '',
                status: expeditionMeta.seasonBoard.debtPack.status || '',
                deferCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.debtPack.deferCount) || 0)),
                openedWeekTag: expeditionMeta.seasonBoard.debtPack.openedWeekTag || '',
                carryIntoWeekTag: expeditionMeta.seasonBoard.debtPack.carryIntoWeekTag || '',
                occupiedMandateTaskId: expeditionMeta.seasonBoard.debtPack.occupiedMandateTaskId || '',
                occupationReason: expeditionMeta.seasonBoard.debtPack.occupationReason || '',
                occupiesStrongSlot: !!expeditionMeta.seasonBoard.debtPack.occupiesStrongSlot,
                resolvedStatus: expeditionMeta.seasonBoard.debtPack.resolvedStatus || '',
                writebackLine: expeditionMeta.seasonBoard.debtPack.writebackLine || '',
                verificationRecordId: expeditionMeta.seasonBoard.debtPack.verificationRecordId || '',
                selectedContractLabel: expeditionMeta.seasonBoard.debtPack.selectedContractLabel || '',
                contractResolutionLine: expeditionMeta.seasonBoard.debtPack.contractResolutionLine || '',
                recoveryEligible: !!expeditionMeta.seasonBoard.debtPack.recoveryEligible
              } : null,
              weekVerdictLedger: expeditionMeta.seasonBoard.weekVerdictLedger?.current ? {
                current: {
                  ledgerId: expeditionMeta.seasonBoard.weekVerdictLedger.current.ledgerId || '',
                  weekTag: expeditionMeta.seasonBoard.weekVerdictLedger.current.weekTag || '',
                  weekLabel: expeditionMeta.seasonBoard.weekVerdictLedger.current.weekLabel || '',
                  phaseId: expeditionMeta.seasonBoard.weekVerdictLedger.current.phaseId || '',
                  phaseLabel: expeditionMeta.seasonBoard.weekVerdictLedger.current.phaseLabel || '',
                  sourceRunId: expeditionMeta.seasonBoard.weekVerdictLedger.current.sourceRunId || '',
                  chapterIndex: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.weekVerdictLedger.current.chapterIndex) || 0)),
                  settlementId: expeditionMeta.seasonBoard.weekVerdictLedger.current.settlementId || '',
                  settlementOutcomeId: expeditionMeta.seasonBoard.weekVerdictLedger.current.settlementOutcomeId || '',
                  settlementOutcomeLabel: expeditionMeta.seasonBoard.weekVerdictLedger.current.settlementOutcomeLabel || '',
                  debtPackId: expeditionMeta.seasonBoard.weekVerdictLedger.current.debtPackId || '',
                  debtStatus: expeditionMeta.seasonBoard.weekVerdictLedger.current.debtStatus || '',
                  deferCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.weekVerdictLedger.current.deferCount) || 0)),
                  carryIntoWeekTag: expeditionMeta.seasonBoard.weekVerdictLedger.current.carryIntoWeekTag || '',
                  primaryVerificationOrderId: expeditionMeta.seasonBoard.weekVerdictLedger.current.primaryVerificationOrderId || '',
                  sideVerificationOrderId: expeditionMeta.seasonBoard.weekVerdictLedger.current.sideVerificationOrderId || '',
                  resolutionTier: expeditionMeta.seasonBoard.weekVerdictLedger.current.resolutionTier || '',
                  resolvedStatus: expeditionMeta.seasonBoard.weekVerdictLedger.current.resolvedStatus || '',
                  primaryVerificationResultStatus: expeditionMeta.seasonBoard.weekVerdictLedger.current.primaryVerificationResultStatus || '',
                  sideVerificationResultStatus: expeditionMeta.seasonBoard.weekVerdictLedger.current.sideVerificationResultStatus || '',
                  primaryWritebackMode: expeditionMeta.seasonBoard.weekVerdictLedger.current.primaryWritebackMode || '',
                  sideWritebackMode: expeditionMeta.seasonBoard.weekVerdictLedger.current.sideWritebackMode || '',
                  writebackLine: expeditionMeta.seasonBoard.weekVerdictLedger.current.writebackLine || '',
                  proofQuality: expeditionMeta.seasonBoard.weekVerdictLedger.current.proofQuality || '',
                  lineageStyle: expeditionMeta.seasonBoard.weekVerdictLedger.current.lineageStyle || '',
                  carryIntoNextWeek: !!expeditionMeta.seasonBoard.weekVerdictLedger.current.carryIntoNextWeek,
                  settlementSource: expeditionMeta.seasonBoard.weekVerdictLedger.current.settlementSource || '',
                  summaryLine: expeditionMeta.seasonBoard.weekVerdictLedger.current.summaryLine || '',
                  frontierResolutionId: expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionId || '',
                  frontierResolutionChoiceId: expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionChoiceId || '',
                  frontierResolutionLabel: expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionLabel || '',
                  frontierResolutionStance: expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionStance || '',
                  frontierResolutionSupportLaneId: expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionSupportLaneId || '',
                  frontierResolutionSupportLaneLabel: expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionSupportLaneLabel || '',
                  frontierResolutionSummaryLine: expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionSummaryLine || '',
                  chronicleSealStatus: expeditionMeta.seasonBoard.weekVerdictLedger.current.chronicleSealStatus || '',
                  chronicleSealLine: expeditionMeta.seasonBoard.weekVerdictLedger.current.chronicleSealLine || '',
                  councilResolutionLine: expeditionMeta.seasonBoard.weekVerdictLedger.current.councilResolutionLine || '',
                  frontierResolutionSubmittedAt: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.weekVerdictLedger.current.frontierResolutionSubmittedAt) || 0))
                }
              } : null,
              verificationOrders: Array.isArray(expeditionMeta.seasonBoard.verificationOrders) ? expeditionMeta.seasonBoard.verificationOrders.map(entry => ({
                id: entry?.id || '',
                type: entry?.type || '',
                role: entry?.role || '',
                label: entry?.label || '',
                summaryLine: entry?.summaryLine || '',
                detailLine: entry?.detailLine || '',
                hintLine: entry?.hintLine || '',
                statusLine: entry?.statusLine || '',
                anchorSection: entry?.anchorSection || '',
                priority: Math.max(1, Math.floor(Number(entry?.priority) || 1)),
                resultStatus: entry?.resultStatus || '',
                writebackMode: entry?.writebackMode || '',
                writebackLine: entry?.writebackLine || '',
                sourceMode: entry?.sourceMode || '',
                sourceModeLabel: entry?.sourceModeLabel || '',
                resolvedRunId: entry?.resolvedRunId || '',
                chapterIndex: Math.max(0, Math.floor(Number(entry?.chapterIndex) || 0)),
                proofQuality: entry?.proofQuality || '',
                lineageStyle: entry?.lineageStyle || '',
                carryIntoNextWeek: !!entry?.carryIntoNextWeek
              })) : [],
              verificationArchive: expeditionMeta.seasonBoard.verificationArchive ? {
                available: !!expeditionMeta.seasonBoard.verificationArchive.available,
                weekTag: expeditionMeta.seasonBoard.verificationArchive.weekTag || '',
                weekLabel: expeditionMeta.seasonBoard.verificationArchive.weekLabel || '',
                totalRecords: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.totalRecords) || 0)),
                verifiedCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.verifiedCount) || 0)),
                failedCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.failedCount) || 0)),
                deferredCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.deferredCount) || 0)),
                pendingCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.pendingCount) || 0)),
                summaryLine: expeditionMeta.seasonBoard.verificationArchive.summaryLine || '',
                detailLine: expeditionMeta.seasonBoard.verificationArchive.detailLine || '',
                progressText: expeditionMeta.seasonBoard.verificationArchive.progressText || '',
                latestEntry: expeditionMeta.seasonBoard.verificationArchive.latestEntry ? {
                  recordId: expeditionMeta.seasonBoard.verificationArchive.latestEntry.recordId || '',
                  weekTag: expeditionMeta.seasonBoard.verificationArchive.latestEntry.weekTag || '',
                  weekLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.weekLabel || '',
                  role: expeditionMeta.seasonBoard.verificationArchive.latestEntry.role || '',
                  roleLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.roleLabel || '',
                  sourceMode: expeditionMeta.seasonBoard.verificationArchive.latestEntry.sourceMode || '',
                  sourceModeLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.sourceModeLabel || '',
                  resultStatus: expeditionMeta.seasonBoard.verificationArchive.latestEntry.resultStatus || '',
                  resultLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.resultLabel || '',
                  writebackMode: expeditionMeta.seasonBoard.verificationArchive.latestEntry.writebackMode || '',
                  writebackLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.writebackLabel || '',
                  phaseId: expeditionMeta.seasonBoard.verificationArchive.latestEntry.phaseId || '',
                  phaseLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.phaseLabel || '',
                  settlementOutcomeId: expeditionMeta.seasonBoard.verificationArchive.latestEntry.settlementOutcomeId || '',
                  settlementOutcomeLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.settlementOutcomeLabel || '',
                  settlementSource: expeditionMeta.seasonBoard.verificationArchive.latestEntry.settlementSource || '',
                  debtStatus: expeditionMeta.seasonBoard.verificationArchive.latestEntry.debtStatus || '',
                  deferCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.latestEntry.deferCount) || 0)),
                  carryIntoWeekTag: expeditionMeta.seasonBoard.verificationArchive.latestEntry.carryIntoWeekTag || '',
                  carryIntoNextWeek: !!expeditionMeta.seasonBoard.verificationArchive.latestEntry.carryIntoNextWeek,
                  summaryLine: expeditionMeta.seasonBoard.verificationArchive.latestEntry.summaryLine || '',
                  detailLine: expeditionMeta.seasonBoard.verificationArchive.latestEntry.detailLine || '',
                  writebackLine: expeditionMeta.seasonBoard.verificationArchive.latestEntry.writebackLine || '',
                  statusLine: expeditionMeta.seasonBoard.verificationArchive.latestEntry.statusLine || '',
                  noteLine: expeditionMeta.seasonBoard.verificationArchive.latestEntry.noteLine || '',
                  kicker: expeditionMeta.seasonBoard.verificationArchive.latestEntry.kicker || '',
                  tagLine: expeditionMeta.seasonBoard.verificationArchive.latestEntry.tagLine || '',
                  lineageStyle: expeditionMeta.seasonBoard.verificationArchive.latestEntry.lineageStyle || '',
                  chapterIndex: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.latestEntry.chapterIndex) || 0)),
                  anchorSection: expeditionMeta.seasonBoard.verificationArchive.latestEntry.anchorSection || '',
                  actionType: expeditionMeta.seasonBoard.verificationArchive.latestEntry.actionType || '',
                  actionValue: expeditionMeta.seasonBoard.verificationArchive.latestEntry.actionValue || '',
                  ctaLabel: expeditionMeta.seasonBoard.verificationArchive.latestEntry.ctaLabel || '',
                  createdAt: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.latestEntry.createdAt) || 0)),
                  updatedAt: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.verificationArchive.latestEntry.updatedAt) || 0))
                } : null,
                entries: Array.isArray(expeditionMeta.seasonBoard.verificationArchive.entries) ? expeditionMeta.seasonBoard.verificationArchive.entries.map(entry => ({
                  recordId: entry?.recordId || '',
                  weekTag: entry?.weekTag || '',
                  weekLabel: entry?.weekLabel || '',
                  role: entry?.role || '',
                  roleLabel: entry?.roleLabel || '',
                  sourceMode: entry?.sourceMode || '',
                  sourceModeLabel: entry?.sourceModeLabel || '',
                  resultStatus: entry?.resultStatus || '',
                  resultLabel: entry?.resultLabel || '',
                  writebackMode: entry?.writebackMode || '',
                  writebackLabel: entry?.writebackLabel || '',
                  phaseId: entry?.phaseId || '',
                  phaseLabel: entry?.phaseLabel || '',
                  settlementOutcomeId: entry?.settlementOutcomeId || '',
                  settlementOutcomeLabel: entry?.settlementOutcomeLabel || '',
                  settlementSource: entry?.settlementSource || '',
                  debtStatus: entry?.debtStatus || '',
                  deferCount: Math.max(0, Math.floor(Number(entry?.deferCount) || 0)),
                  carryIntoWeekTag: entry?.carryIntoWeekTag || '',
                  carryIntoNextWeek: !!entry?.carryIntoNextWeek,
                  summaryLine: entry?.summaryLine || '',
                  detailLine: entry?.detailLine || '',
                  writebackLine: entry?.writebackLine || '',
                  statusLine: entry?.statusLine || '',
                  noteLine: entry?.noteLine || '',
                  kicker: entry?.kicker || '',
                  tagLine: entry?.tagLine || '',
                  lineageStyle: entry?.lineageStyle || '',
                  chapterIndex: Math.max(0, Math.floor(Number(entry?.chapterIndex) || 0)),
                  anchorSection: entry?.anchorSection || '',
                  actionType: entry?.actionType || '',
                  actionValue: entry?.actionValue || '',
                  ctaLabel: entry?.ctaLabel || '',
                  createdAt: Math.max(0, Math.floor(Number(entry?.createdAt) || 0)),
                  updatedAt: Math.max(0, Math.floor(Number(entry?.updatedAt) || 0))
                })) : []
              } : null,
              laneRewards: Array.isArray(expeditionMeta.seasonBoard.laneRewards) ? expeditionMeta.seasonBoard.laneRewards.map(reward => serializeSeasonBoardLaneReward(reward)).filter(Boolean) : [],
              laneRewardSummary: expeditionMeta.seasonBoard.laneRewardSummary ? {
                readyCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.laneRewardSummary.readyCount) || 0)),
                claimableCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.laneRewardSummary.claimableCount) || 0)),
                claimedCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.laneRewardSummary.claimedCount) || 0)),
                totalCount: Math.max(0, Math.floor(Number(expeditionMeta.seasonBoard.laneRewardSummary.totalCount) || 0))
              } : null,
              frontier: serializeSeasonBoardFrontier(expeditionMeta.seasonBoard.frontier),
              chapterArc: serializeSeasonBoardChapterArc(expeditionMeta.seasonBoard.chapterArc),
              nextTask: expeditionMeta.seasonBoard.nextTask ? {
                laneId: expeditionMeta.seasonBoard.nextTask.laneId || '',
                laneLabel: expeditionMeta.seasonBoard.nextTask.laneLabel || '',
                id: expeditionMeta.seasonBoard.nextTask.id || '',
                label: expeditionMeta.seasonBoard.nextTask.label || '',
                progressText: expeditionMeta.seasonBoard.nextTask.progressText || '',
                hintLine: expeditionMeta.seasonBoard.nextTask.hintLine || '',
                statusLine: expeditionMeta.seasonBoard.nextTask.statusLine || '',
                anchorSection: expeditionMeta.seasonBoard.nextTask.anchorSection || '',
                actionType: expeditionMeta.seasonBoard.nextTask.actionType || '',
                actionValue: expeditionMeta.seasonBoard.nextTask.actionValue || '',
                ctaLabel: expeditionMeta.seasonBoard.nextTask.ctaLabel || '',
                source: expeditionMeta.seasonBoard.nextTask.source || '',
                sourceId: expeditionMeta.seasonBoard.nextTask.sourceId || '',
                taskSource: expeditionMeta.seasonBoard.nextTask.taskSource || '',
                taskSourceId: expeditionMeta.seasonBoard.nextTask.taskSourceId || ''
              } : null,
              nextWeekGoal: expeditionMeta.seasonBoard.nextWeekGoal ? {
                title: expeditionMeta.seasonBoard.nextWeekGoal.title || '',
                note: expeditionMeta.seasonBoard.nextWeekGoal.note || '',
                action: expeditionMeta.seasonBoard.nextWeekGoal.action || '',
                value: expeditionMeta.seasonBoard.nextWeekGoal.value || '',
                buttonLabel: expeditionMeta.seasonBoard.nextWeekGoal.buttonLabel || '',
                source: expeditionMeta.seasonBoard.nextWeekGoal.source || '',
                sourceId: expeditionMeta.seasonBoard.nextWeekGoal.sourceId || '',
                taskSource: expeditionMeta.seasonBoard.nextWeekGoal.taskSource || '',
                taskSourceId: expeditionMeta.seasonBoard.nextWeekGoal.taskSourceId || '',
                taskId: expeditionMeta.seasonBoard.nextWeekGoal.taskId || '',
                laneId: expeditionMeta.seasonBoard.nextWeekGoal.laneId || '',
                anchorSection: expeditionMeta.seasonBoard.nextWeekGoal.anchorSection || ''
              } : null,
              lanes: Array.isArray(expeditionMeta.seasonBoard.lanes) ? expeditionMeta.seasonBoard.lanes.map(lane => ({
                id: lane?.id || '',
                label: lane?.label || '',
                icon: lane?.icon || '',
                summaryLine: lane?.summaryLine || '',
                completedCount: Math.max(0, Math.floor(Number(lane?.completedCount) || 0)),
                totalCount: Math.max(0, Math.floor(Number(lane?.totalCount) || 0)),
                reward: serializeSeasonBoardLaneReward(lane?.reward),
                tasks: Array.isArray(lane?.tasks) ? lane.tasks.map(task => ({
                  id: task?.id || '',
                  label: task?.label || '',
                  icon: task?.icon || '',
                  progress: Math.max(0, Math.floor(Number(task?.progress) || 0)),
                  target: Math.max(0, Math.floor(Number(task?.target) || 0)),
                  progressText: task?.progressText || '',
                  completed: !!task?.completed,
                  hintLine: task?.hintLine || '',
                  statusLine: task?.statusLine || '',
                  anchorSection: task?.anchorSection || ''
                })) : []
              })) : []
            } : null,
            lineage: expeditionMeta.lineage ? {
              summaryLine: expeditionMeta.lineage.summaryLine || '',
              detailLine: expeditionMeta.lineage.detailLine || '',
              currentFocusLine: expeditionMeta.lineage.currentFocusLine || '',
              styleLabel: expeditionMeta.lineage.styleLabel || '',
              characterLabel: expeditionMeta.lineage.characterLabel || '',
              nodeLabel: expeditionMeta.lineage.nodeLabel || '',
              researchLabel: expeditionMeta.lineage.researchLabel || ''
            } : null,
            aftereffects: expeditionMeta.aftereffects ? {
              summaryLine: expeditionMeta.aftereffects.summaryLine || '',
              detailLine: expeditionMeta.aftereffects.detailLine || '',
              guideLine: expeditionMeta.aftereffects.guideLine || '',
              currentStatusLine: expeditionMeta.aftereffects.currentStatusLine || '',
              activeCount: Math.max(0, Math.floor(Number(expeditionMeta.aftereffects.activeCount) || 0)),
              pendingCount: Math.max(0, Math.floor(Number(expeditionMeta.aftereffects.pendingCount) || 0)),
              primary: expeditionMeta.aftereffects.primary ? {
                recordId: expeditionMeta.aftereffects.primary.recordId || '',
                icon: expeditionMeta.aftereffects.primary.icon || '',
                name: expeditionMeta.aftereffects.primary.name || '',
                templateId: expeditionMeta.aftereffects.primary.templateId || '',
                templateLabel: expeditionMeta.aftereffects.primary.templateLabel || '',
                outcomeId: expeditionMeta.aftereffects.primary.outcomeId || '',
                outcomeLabel: expeditionMeta.aftereffects.primary.outcomeLabel || '',
                sourceLine: expeditionMeta.aftereffects.primary.sourceLine || '',
                positiveLine: expeditionMeta.aftereffects.primary.positiveLine || '',
                negativeLine: expeditionMeta.aftereffects.primary.negativeLine || '',
                summaryLine: expeditionMeta.aftereffects.primary.summaryLine || '',
                detailLine: expeditionMeta.aftereffects.primary.detailLine || '',
                status: expeditionMeta.aftereffects.primary.status || '',
                statusLabel: expeditionMeta.aftereffects.primary.statusLabel || '',
                statusLine: expeditionMeta.aftereffects.primary.statusLine || '',
                remainingChapters: Math.max(0, Math.floor(Number(expeditionMeta.aftereffects.primary.remainingChapters) || 0)),
                durationChapters: Math.max(1, Math.floor(Number(expeditionMeta.aftereffects.primary.durationChapters) || 1)),
                activationChapterIndex: Math.max(0, Math.floor(Number(expeditionMeta.aftereffects.primary.activationChapterIndex) || 0))
              } : null,
              records: Array.isArray(expeditionMeta.aftereffects.records) ? expeditionMeta.aftereffects.records.map(entry => ({
                recordId: entry?.recordId || '',
                icon: entry?.icon || '',
                name: entry?.name || '',
                templateId: entry?.templateId || '',
                templateLabel: entry?.templateLabel || '',
                outcomeId: entry?.outcomeId || '',
                outcomeLabel: entry?.outcomeLabel || '',
                sourceLine: entry?.sourceLine || '',
                positiveLine: entry?.positiveLine || '',
                negativeLine: entry?.negativeLine || '',
                summaryLine: entry?.summaryLine || '',
                detailLine: entry?.detailLine || '',
                status: entry?.status || '',
                statusLabel: entry?.statusLabel || '',
                statusLine: entry?.statusLine || '',
                remainingChapters: Math.max(0, Math.floor(Number(entry?.remainingChapters) || 0)),
                durationChapters: Math.max(1, Math.floor(Number(entry?.durationChapters) || 1)),
                activationChapterIndex: Math.max(0, Math.floor(Number(entry?.activationChapterIndex) || 0))
              })) : []
            } : null,
            agenda: expeditionMeta.agenda ? {
              agendaId: expeditionMeta.agenda.agendaId || '',
              icon: expeditionMeta.agenda.icon || '',
              name: expeditionMeta.agenda.name || '',
              outcome: expeditionMeta.agenda.outcome || '',
              outcomeLabel: expeditionMeta.agenda.outcomeLabel || '',
              outcomeTone: expeditionMeta.agenda.outcomeTone || '',
              progress: Math.max(0, Math.floor(Number(expeditionMeta.agenda.progress) || 0)),
              target: Math.max(0, Math.floor(Number(expeditionMeta.agenda.target) || 0)),
              ratingLabel: expeditionMeta.agenda.ratingLabel || '',
              summaryLine: expeditionMeta.agenda.summaryLine || '',
              reasonLine: expeditionMeta.agenda.reasonLine || '',
              grantedLine: expeditionMeta.agenda.grantedLine || '',
              selectedDecisionLabel: expeditionMeta.agenda.selectedDecisionLabel || '',
              selectedContractLabel: expeditionMeta.agenda.selectedContractLabel || '',
              contractSuccess: !!expeditionMeta.agenda.contractSuccess,
              contractResolutionLine: expeditionMeta.agenda.contractResolutionLine || '',
              recoveryEligible: !!expeditionMeta.agenda.recoveryEligible,
              recoveryLabel: expeditionMeta.agenda.recoveryLabel || '',
              recoveryTier: expeditionMeta.agenda.recoveryTier || '',
              recoveryTierLabel: expeditionMeta.agenda.recoveryTierLabel || '',
              recoveryLine: expeditionMeta.agenda.recoveryLine || '',
              recoveryHintLine: expeditionMeta.agenda.recoveryHintLine || '',
              recoveryReward: expeditionMeta.agenda.recoveryReward ? {
                insight: Math.max(0, Math.floor(Number(expeditionMeta.agenda.recoveryReward.insight) || 0)),
                karma: Math.max(0, Math.floor(Number(expeditionMeta.agenda.recoveryReward.karma) || 0)),
                ringExp: Math.max(0, Math.floor(Number(expeditionMeta.agenda.recoveryReward.ringExp) || 0))
              } : null,
              rewardTrackId: expeditionMeta.agenda.rewardTrackId || '',
              rewardTrackName: expeditionMeta.agenda.rewardTrackName || '',
              rewardTrackIcon: expeditionMeta.agenda.rewardTrackIcon || ''
            } : null,
            narrative: brief && brief.surface === 'expedition' ? {
              state: brief.state || 'tracking',
              kicker: brief.kicker || '章节归卷',
              title: brief.title || '',
              body: brief.body || '',
              foot: brief.foot || ''
            } : null
          };
        })(),
        runPath: this.lastRunPathRewardMeta ? {
          pathId: this.lastRunPathRewardMeta.pathId || null,
          name: this.lastRunPathRewardMeta.name || null,
          entryCount: Array.isArray(this.lastRunPathRewardMeta.entries) ? this.lastRunPathRewardMeta.entries.length : 0,
          completed: !!this.lastRunPathRewardMeta.completed,
          archive: this.lastRunPathRewardMeta.archive ? {
            id: this.lastRunPathRewardMeta.archive.id || null,
            recordName: this.lastRunPathRewardMeta.archive.recordName || this.lastRunPathRewardMeta.archive.name || '',
            note: this.lastRunPathRewardMeta.archive.note || '',
            clears: Math.max(0, Math.floor(Number(this.lastRunPathRewardMeta.archive.clears) || 0)),
            firstClear: !!this.lastRunPathRewardMeta.archive.firstClear
          } : null,
          entries: Array.isArray(this.lastRunPathRewardMeta.entries) ? this.lastRunPathRewardMeta.entries.map(entry => ({
            phaseId: entry.phaseId || null,
            phaseLabel: entry.phaseLabel || '',
            title: entry.title || '',
            rewardText: entry.rewardText || '',
            completed: !!entry.completed
          })) : [],
          narrative: (() => {
            const brief = this.rewardView ? this.rewardView.getRewardNarrativeBriefMeta() : null;
            if (!brief || brief.surface !== 'runPath') return null;
            return {
              state: brief.state || 'tracking',
              kicker: brief.kicker || '命盘档案',
              title: brief.title || '',
              body: brief.body || '',
              foot: brief.foot || ''
            };
          })()
        } : null
      } : null,
      pvp: pvpPayload,
      endless: this.ensureEndlessState(),
      endlessPhase: this.getEndlessPhaseProfile(),
      endlessTheme: this.getEndlessCycleThemeProfile(),
      endlessSeason: this.getEndlessSeasonProfile(),
      endlessDangerProfile: this.getEndlessDangerProfile(),
      encounter: this.ensureEncounterState(),
      perf: this.performanceStats
    };
    return JSON.stringify(payload);
  }
  shouldForceCloudLogin() {
    if (this.guestMode) return false;
    if (typeof AuthService === 'undefined') return false;
    if (!AuthService.isCloudEnabled || !AuthService.isCloudEnabled()) return false;
    return !AuthService.isLoggedIn();
  }
  getRunDestinyCatalog() {
    if (typeof RUN_DESTINIES === 'undefined' || !RUN_DESTINIES || typeof RUN_DESTINIES !== 'object') {
      return [];
    }
    return Object.values(RUN_DESTINIES).filter(item => item && item.id);
  }
  getRunDestinyMetaById(destinyId, tier = 1) {
    if (typeof destinyId !== 'string' || !destinyId || typeof RUN_DESTINIES === 'undefined' || !RUN_DESTINIES[destinyId]) {
      return null;
    }
    const base = RUN_DESTINIES[destinyId];
    const tiers = Array.isArray(base.tiers) ? base.tiers : [];
    const tierIndex = Math.max(0, Math.min(tiers.length - 1, Math.floor(Number(tier) || 1) - 1));
    const tierMeta = tiers[tierIndex] || tiers[0] || {};
    return {
      id: base.id,
      name: base.name,
      icon: base.icon || '✦',
      category: base.category || '命格',
      description: base.description || '',
      playstyle: base.playstyle || '',
      affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
      tier: Math.max(1, Math.floor(Number(tier) || 1)),
      tierLabel: tierMeta.label || `第 ${Math.max(1, Math.floor(Number(tier) || 1))} 阶`,
      summary: tierMeta.summary || base.description || '',
      effects: tierMeta.effects && typeof tierMeta.effects === 'object' ? {
        ...tierMeta.effects
      } : {}
    };
  }
  getRunVowCatalog() {
    if (typeof RUN_VOWS === 'undefined' || !RUN_VOWS || typeof RUN_VOWS !== 'object') {
      return [];
    }
    return Object.values(RUN_VOWS).filter(item => item && item.id);
  }
  getRunVowMetaById(vowId, tier = 1) {
    if (typeof vowId !== 'string' || !vowId || typeof RUN_VOWS === 'undefined' || !RUN_VOWS[vowId]) {
      return null;
    }
    const base = RUN_VOWS[vowId];
    const tiers = Array.isArray(base.tiers) ? base.tiers : [];
    const maxTier = Math.max(1, tiers.length || 1);
    const safeTier = Math.max(1, Math.min(maxTier, Math.floor(Number(tier) || 1)));
    const tierMeta = tiers[safeTier - 1] || tiers[0] || {};
    return {
      id: base.id,
      name: base.name,
      icon: base.icon || '✧',
      category: base.category || '誓约',
      tags: Array.isArray(base.tags) ? base.tags.slice() : [],
      description: base.description || '',
      playstyle: base.playstyle || '',
      routeHint: base.routeHint || '',
      buildFit: base.buildFit || '',
      counterplay: base.counterplay || '',
      source: base.source || '',
      uiMeta: base.uiMeta && typeof base.uiMeta === 'object' ? {
        ...base.uiMeta
      } : {},
      unlockRules: base.unlockRules && typeof base.unlockRules === 'object' ? JSON.parse(JSON.stringify(base.unlockRules)) : {},
      affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
      tier: safeTier,
      maxTier,
      tierLabel: tierMeta.label || `第 ${safeTier} 阶`,
      summary: tierMeta.summary || base.description || '',
      risk: tierMeta.risk || '',
      effects: tierMeta.effects && typeof tierMeta.effects === 'object' ? {
        ...tierMeta.effects
      } : {}
    };
  }
  shuffleList(values = []) {
    const list = Array.isArray(values) ? values.slice() : [];
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.shuffle === 'function') {
      try {
        return Utils.shuffle(list);
      } catch (error) {
        console.warn('shuffleList fallback due to Utils.shuffle error:', error);
      }
    }
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  draftRunDestiniesForCharacter(characterId) {
    const charId = typeof characterId === 'string' ? characterId : 'linFeng';
    const cached = this.pendingRunDestinyDrafts && Array.isArray(this.pendingRunDestinyDrafts[charId]) ? this.pendingRunDestinyDrafts[charId].slice() : null;
    if (cached && cached.length >= 3) return cached.slice(0, 3);
    const catalog = this.getRunDestinyCatalog();
    const affinityPool = this.shuffleList(catalog.filter(item => Array.isArray(item.affinities) && item.affinities.includes(charId)));
    const fallbackPool = this.shuffleList(catalog.filter(item => !Array.isArray(item.affinities) || !item.affinities.includes(charId)));
    const draft = [];
    while (affinityPool.length > 0 && draft.length < 2) {
      const next = affinityPool.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    while (fallbackPool.length > 0 && draft.length < 3) {
      const next = fallbackPool.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    while (affinityPool.length > 0 && draft.length < 3) {
      const next = affinityPool.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    this.pendingRunDestinyDrafts = this.pendingRunDestinyDrafts || {};
    this.pendingRunDestinyDrafts[charId] = draft.slice(0, 3);
    return this.pendingRunDestinyDrafts[charId].slice();
  }
  resolveDefaultRunDestinyId(characterId) {
    const charId = typeof characterId === 'string' ? characterId : 'linFeng';
    const draft = this.draftRunDestiniesForCharacter(charId);
    return draft[0] || this.getRunDestinyCatalog()[0] && this.getRunDestinyCatalog()[0].id || null;
  }
  getSpiritCompanionCatalog() {
    if (typeof SPIRIT_COMPANIONS === 'undefined' || !SPIRIT_COMPANIONS || typeof SPIRIT_COMPANIONS !== 'object') {
      return [];
    }
    return Object.keys(SPIRIT_COMPANIONS).map(id => this.getSpiritCompanionMetaById(id, 1)).filter(Boolean);
  }
  getSpiritCompanionMetaById(spiritId, tier = 1) {
    if (typeof spiritId !== 'string' || !spiritId || typeof SPIRIT_COMPANIONS === 'undefined' || !SPIRIT_COMPANIONS[spiritId]) {
      return null;
    }
    const base = SPIRIT_COMPANIONS[spiritId];
    const tiers = Array.isArray(base.tiers) ? base.tiers : [];
    const maxTier = Math.max(1, tiers.length || 1);
    const safeTier = Math.max(1, Math.min(maxTier, Math.floor(Number(tier) || 1)));
    const tierMeta = tiers[safeTier - 1] || tiers[0] || {};
    return {
      id: base.id,
      name: base.name,
      icon: base.icon || '✦',
      title: base.title || '',
      category: '灵契',
      description: base.description || '',
      playstyle: base.playstyle || '',
      story: base.story || '',
      affinities: Array.isArray(base.affinities) ? base.affinities.slice() : [],
      tier: safeTier,
      maxTier,
      tierLabel: tierMeta.label || `第 ${safeTier} 阶`,
      summary: tierMeta.summary || base.description || '',
      passiveLabel: tierMeta.passiveLabel || '灵契被动',
      passiveDesc: tierMeta.passiveDesc || '',
      activeLabel: tierMeta.activeLabel || '灵契主动',
      activeDesc: tierMeta.activeDesc || '',
      chargeMax: Math.max(1, Math.floor(Number(tierMeta.chargeMax) || 5)),
      passive: tierMeta.passive && typeof tierMeta.passive === 'object' ? {
        ...tierMeta.passive
      } : {},
      active: tierMeta.active && typeof tierMeta.active === 'object' ? {
        ...tierMeta.active
      } : {}
    };
  }
  draftSpiritCompanionsForCharacter(characterId) {
    const charId = typeof characterId === 'string' ? characterId : 'linFeng';
    const cached = this.pendingSpiritCompanionDrafts && Array.isArray(this.pendingSpiritCompanionDrafts[charId]) ? this.pendingSpiritCompanionDrafts[charId].slice() : null;
    if (cached && cached.length >= 3) return cached.slice(0, 3);
    const catalog = this.getSpiritCompanionCatalog();
    const affinityPool = this.shuffleList(catalog.filter(item => Array.isArray(item.affinities) && item.affinities.includes(charId)));
    const fallbackPool = this.shuffleList(catalog.filter(item => !Array.isArray(item.affinities) || !item.affinities.includes(charId)));
    const draft = [];
    while (affinityPool.length > 0 && draft.length < 2) {
      const next = affinityPool.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    while (fallbackPool.length > 0 && draft.length < 3) {
      const next = fallbackPool.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    while (affinityPool.length > 0 && draft.length < 3) {
      const next = affinityPool.shift();
      if (next && !draft.includes(next.id)) draft.push(next.id);
    }
    this.pendingSpiritCompanionDrafts = this.pendingSpiritCompanionDrafts || {};
    this.pendingSpiritCompanionDrafts[charId] = draft.slice(0, 3);
    return this.pendingSpiritCompanionDrafts[charId].slice();
  }
  resolveDefaultSpiritCompanionId(characterId) {
    const charId = typeof characterId === 'string' ? characterId : 'linFeng';
    const draft = this.draftSpiritCompanionsForCharacter(charId);
    return draft[0] || this.getSpiritCompanionCatalog()[0] && this.getSpiritCompanionCatalog()[0].id || null;
  }
  renderRunDestinySelection(characterId) {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.renderRunDestinySelection(characterId);
  }
  renderSpiritCompanionSelection(characterId) {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.renderSpiritCompanionSelection(characterId);
  }
  updateCharacterSelectionConfirmState() {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.updateCharacterSelectionConfirmState();
  }
  selectRunDestiny(destinyId) {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.selectRunDestiny(destinyId);
  }
  selectSpiritCompanion(spiritId) {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.selectSpiritCompanion(spiritId);
  }
  getRunPathCatalog() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getRunPathCatalog();
  }
  getRunPathMetaById(pathId) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getRunPathMetaById(pathId);
  }
  resolveRunPathBossMatchup(runPathMeta, options = {}) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.resolveRunPathBossMatchup(runPathMeta, options);
  }
  draftRunPathsForCharacter(characterId) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.draftRunPathsForCharacter(characterId);
  }
  resolveDefaultRunPathId(characterId) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.resolveDefaultRunPathId(characterId);
  }
  renderRunPathSelection(characterId) {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.renderRunPathSelection(characterId);
  }
  selectRunPath(pathId) {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.selectRunPath(pathId);
  }
  getRunPathTrackerState() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getRunPathTrackerState();
  }
  getRunPathMutationChoices(pathId = '') {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getRunPathMutationChoices(pathId);
  }
  shouldOfferRunPathMutationAfterRealm(realmCleared) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.shouldOfferRunPathMutationAfterRealm(realmCleared);
  }
  applyRunPathMutationSelection(mutationId, realmCleared = 0) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.applyRunPathMutationSelection(mutationId, realmCleared);
  }
  showRunPathMutationSelection(realmCleared, onDone = null) {
    if (!this.player || typeof this.player.getRunPathMeta !== 'function') {
      if (typeof onDone === 'function') onDone(null);
      return;
    }
    const runPathMeta = this.player.getRunPathMeta();
    const choices = runPathMeta ? this.getRunPathMutationChoices(runPathMeta.id) : [];
    if (!runPathMeta || choices.length === 0) {
      if (typeof onDone === 'function') onDone(null);
      return;
    }
    const {
      modal,
      titleEl,
      iconEl,
      descEl,
      choicesEl
    } = this.getEventModalRefs();
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      const applied = this.applyRunPathMutationSelection(choices[0].id, realmCleared);
      if (typeof onDone === 'function') onDone(applied);
      return;
    }
    const buildEffectTags = (effects = {}) => {
      const tags = [];
      if (Number(effects.openingBlock) > 0) tags.push(`开场护盾 +${Math.floor(Number(effects.openingBlock) || 0)}`);
      if (Number(effects.firstAttackBonusPerBattle) > 0) tags.push(`首击增伤 +${Math.floor(Number(effects.firstAttackBonusPerBattle) || 0)}`);
      if (Number(effects.firstSkillDrawPerTurn) > 0) tags.push(`首个技能抽牌 +${Math.floor(Number(effects.firstSkillDrawPerTurn) || 0)}`);
      if (effects.mapWeightShift && typeof effects.mapWeightShift === 'object') {
        const boosted = Object.keys(effects.mapWeightShift).filter(key => Number(effects.mapWeightShift[key]) > 0).slice(0, 2).map(key => this.getMapNodeTypeLabel ? this.getMapNodeTypeLabel(key) : key);
        if (boosted.length > 0) tags.push(`路线偏向 ${boosted.join(' / ')}`);
      }
      return tags.slice(0, 4);
    };
    titleEl.textContent = '命途裂变';
    iconEl.textContent = '🧭';
    descEl.innerHTML = `第 2 章已破，你必须决定这条【${runPathMeta.name}】要如何进入中盘。<br><span style="color:rgba(255,235,198,0.82)">当前命途：${runPathMeta.playstyle || runPathMeta.description}</span>`;
    this.applyEventModalPresentation({
      tone: 'omen',
      atmosphere: '中盘不会再只靠“继续变强”混过去，你必须选择这轮命途是继续极化、转修副轴，还是拿血线与容错去换高阶收益。',
      summaryLabel: '裂变摘要',
      summaryItems: ['触发点：第 2 章章末', `当前命途：${runPathMeta.name}`, '中盘身份会被永久改写', '即时收益与后续路线会同步改变']
    });
    choicesEl.innerHTML = '';
    choices.forEach(choice => {
      const tags = buildEffectTags(choice.effects || {});
      const btn = document.createElement('button');
      btn.className = 'event-choice run-vow-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${choice.icon || '✦'} ${choice.branchLabel || '裂变'} · ${choice.name}</span>
                    <span class="choice-rarity">${runPathMeta.name}</span>
                </div>
                <div class="choice-effect">${choice.summary || '改写这轮命途的中盘结构。'}</div>
                <div class="choice-effect" style="color:#f1c89d;">赌注：${choice.risk || '中盘节奏会被永久改写。'}</div>
                <div class="choice-effect" style="color:#d8f0ff;">玩法：${choice.playstyle || runPathMeta.playstyle || '围绕当前命途主线继续打磨。'}</div>
                <div class="choice-effect" style="color:#b9d7ff;">路线：${choice.routeHint || runPathMeta.routeHint || '后续地图权重会跟着变化。'}</div>
                <div class="choice-effect">${tags.map(tag => `· ${tag}`).join('<br>')}</div>
            `;
      btn.onclick = () => {
        const applied = this.applyRunPathMutationSelection(choice.id, realmCleared);
        modal.classList.remove('active');
        if (applied && applied.meta) {
          Utils.showBattleLog(`命途裂变：${runPathMeta.name} → ${applied.meta.branchLabel}·${applied.meta.name}`);
          this.showRewardModal('命途裂变', `${applied.meta.icon || '✦'} ${applied.meta.branchLabel || '裂变'} · ${applied.meta.name}\n${applied.meta.summary || ''}\n\n${applied.rewardLines.join(' / ') || '裂变已完成，后续路线已改写。'}\n\n赌注：${applied.meta.risk || '中盘会按这条裂变方向继续推进。'}`, applied.meta.icon || '🧭', () => {
            if (typeof onDone === 'function') onDone(applied);
          });
          return;
        }
        if (typeof onDone === 'function') onDone(applied);
      };
      choicesEl.appendChild(btn);
    });
    this.activateModal(modal);
  }
  getRunPathShopProfile() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getRunPathShopProfile();
  }
  injectRunPathShopServices(baseServices = [], tabId = 'base') {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.injectRunPathShopServices(baseServices, tabId);
  }
  awardRunPathPhaseRewards(pathMeta, phaseMeta) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.awardRunPathPhaseRewards(pathMeta, phaseMeta);
  }
  buildRunPathFeedbackEntry(pathMeta, phaseMeta, options = {}) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.buildRunPathFeedbackEntry(pathMeta, phaseMeta, options);
  }
  queueRunPathRewardMeta(pathMeta, phaseMeta, options = {}) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.queueRunPathRewardMeta(pathMeta, phaseMeta, options);
  }
  queueMapRunPathFeedback(pathMeta, phaseMeta, options = {}) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.queueMapRunPathFeedback(pathMeta, phaseMeta, options);
  }
  dismissRunPathMapFeedback() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.dismissRunPathMapFeedback();
  }
  handleRunPathProgress(eventType, amount = 1, context = {}) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.handleRunPathProgress(eventType, amount, context);
  }
  shouldOfferRunVowAfterRealm(realmCleared) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.shouldOfferRunVowAfterRealm(realmCleared);
  }
  draftRunVowChoices(realmCleared = null) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.draftRunVowChoices(realmCleared);
  }
  applyRunVowSelection(vowId) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.applyRunVowSelection(vowId);
  }
  showRunVowSelection(realmCleared, onDone = null) {
    const draftIds = this.draftRunVowChoices(realmCleared);
    if (!Array.isArray(draftIds) || draftIds.length === 0) {
      if (typeof onDone === 'function') onDone(null);
      return;
    }
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    const activeMetas = this.player && typeof this.player.getRunVowMetas === 'function' ? this.player.getRunVowMetas() : [];
    const chapterIndex = Math.max(1, Math.floor((Math.max(1, Math.floor(Number(realmCleared) || 1)) - 1) / 3) + 1);
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      const applied = this.applyRunVowSelection(draftIds[0]);
      if (typeof onDone === 'function') onDone(applied);
      return;
    }
    const activeSummary = activeMetas.length > 0 ? activeMetas.map(meta => `${meta.icon || '✧'} ${meta.name} ${meta.tierLabel}`).join(' / ') : '当前尚未立下誓约。';
    titleEl.textContent = '逆命誓约';
    iconEl.textContent = '⛓️';
    descEl.innerHTML = `第 ${chapterIndex} 章已破，你可在此改写后续命途。<br><span style="color:rgba(255,235,198,0.82)">当前誓约：${activeSummary}</span>`;
    this.applyEventModalPresentation({
      tone: 'oath',
      atmosphere: '誓约会同时改写收益、代价与路线偏好，签下之前必须看懂“这次到底在赌什么”。',
      summaryLabel: '誓约摘要',
      summaryItems: [`章节：第 ${chapterIndex} 章章末`, `当前誓约：${activeMetas.length}/${2} 条`, '收益与代价会同步写进后续地图', '路线提示会随誓约一起改变']
    });
    choicesEl.innerHTML = '';
    const buildEffectTags = (effects = {}) => {
      const tags = [];
      if (Number(effects.firstTurnDraw) > 0) tags.push(`首回合抽牌 +${Math.floor(Number(effects.firstTurnDraw) || 0)}`);
      if (Number(effects.firstTurnEnergy) > 0) tags.push(`首回合灵力 +${Math.floor(Number(effects.firstTurnEnergy) || 0)}`);
      if (Number(effects.openingBlock) > 0) tags.push(`开场护盾 +${Math.floor(Number(effects.openingBlock) || 0)}`);
      if (Number(effects.firstAttackBonusPerBattle) > 0) tags.push(`首击增伤 +${Math.floor(Number(effects.firstAttackBonusPerBattle) || 0)}`);
      if (Number(effects.onKillHeal) > 0) tags.push(`击杀回复 ${Math.floor(Number(effects.onKillHeal) || 0)}`);
      if (Number(effects.blockGainMultiplier) > 0) tags.push(`护盾效率 +${Math.round(Number(effects.blockGainMultiplier) * 100)}%`);
      if (Number(effects.rewardRareChance) > 0) tags.push('高稀有奖励倾向提升');
      if (Number(effects.commandCostDiscount) > 0) tags.push(`指令消耗 -${Math.floor(Number(effects.commandCostDiscount) || 0)}`);
      if (Number(effects.maxHpPenalty) > 0) tags.push(`生命上限 -${Math.floor(Number(effects.maxHpPenalty) || 0)}`);
      if (Number(effects.battleStartHpLoss) > 0) tags.push(`每战开场失血 ${Math.floor(Number(effects.battleStartHpLoss) || 0)}`);
      if (Number(effects.maxHandSizeOffset) < 0) tags.push(`手牌上限 ${Math.floor(Number(effects.maxHandSizeOffset) || 0)}`);
      if (Number(effects.shopPriceMul) > 1) tags.push(`商店涨价 ${Math.round((Number(effects.shopPriceMul) - 1) * 100)}%`);
      return tags.slice(0, 4);
    };
    draftIds.forEach(vowId => {
      const currentMeta = activeMetas.find(meta => meta.id === vowId) || null;
      const nextTier = currentMeta ? Math.min(currentMeta.maxTier, currentMeta.tier + 1) : 1;
      const meta = this.getRunVowMetaById(vowId, nextTier);
      if (!meta) return;
      const modeLabel = currentMeta ? `升阶 · ${currentMeta.tierLabel} → ${meta.tierLabel}` : `立誓 · ${meta.tierLabel}`;
      const tags = buildEffectTags(meta.effects || {});
      const btn = document.createElement('button');
      btn.className = 'event-choice run-vow-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${meta.icon || '✧'} ${meta.name}</span>
                    <span class="choice-rarity">${modeLabel}</span>
                </div>
                <div class="choice-effect">${meta.summary || meta.description}</div>
                <div class="choice-effect" style="color:#f1c89d;">赌注：${meta.risk || '誓约会改变后续资源与战斗节奏。'}</div>
                <div class="choice-effect" style="color:#d8f0ff;">适配：${meta.buildFit || meta.playstyle || '围绕当前 build 主轴放大收益。'}</div>
                <div class="choice-effect" style="color:#d2c7ff;">弱点：${meta.counterplay || '若没围绕它补齐短板，会被代价持续追债。'}</div>
                <div class="choice-effect" style="color:#b9d7ff;">路线：${meta.routeHint || '偏向高风险收益节点。'}</div>
                <div class="choice-effect">${tags.map(tag => `· ${tag}`).join('<br>')}</div>
            `;
      btn.onclick = () => {
        const applied = this.applyRunVowSelection(vowId);
        modal.classList.remove('active');
        if (applied && applied.meta) {
          const actionText = applied.type === 'upgrade' ? '誓约升阶' : '立下誓约';
          Utils.showBattleLog(`${actionText}：${applied.meta.name} ${applied.meta.tierLabel}`);
          this.showRewardModal(actionText, `${applied.meta.icon || '✧'} ${applied.meta.name}\n${applied.meta.summary}\n\n赌注：${applied.meta.risk || '命途已被改写。'}`, applied.meta.icon || '⛓️', () => {
            if (typeof onDone === 'function') onDone(applied);
          });
          return;
        }
        if (typeof onDone === 'function') onDone(applied);
      };
      choicesEl.appendChild(btn);
    });
    const skipBtn = document.createElement('button');
    skipBtn.className = 'event-choice';
    skipBtn.innerHTML = `
            <div>🚶 暂缓立誓</div>
            <div class="choice-effect">保留当前命途，直接踏入下一重天。</div>
        `;
    skipBtn.onclick = () => {
      modal.classList.remove('active');
      if (typeof onDone === 'function') onDone(null);
    };
    choicesEl.appendChild(skipBtn);
    this.activateModal(modal);
  }
  getEventModalRefs() {
    return Game.prototype.ensureEventManager.call(this).getEventModalRefs();
  }
  resetModalPresentation(modal) {
    return Game.prototype.ensureEventManager.call(this).resetModalPresentation(modal);
  }
  activateModal(modal) {
    if (!modal) return false;
    this.resetModalPresentation(modal);
    modal.classList.add('active');
    return true;
  }
  finishStrategicNode(node, title, message, icon = '✨') {
    const eventModal = document.getElementById('event-modal');
    if (eventModal) eventModal.classList.remove('active');
    this.showRewardModal(title, message, icon, () => {
      if (this.map && typeof this.map.completeNode === 'function' && node) {
        this.map.completeNode(node);
      }
      this.autoSave();
    });
  }
  grantFateRingExp(amount, reason = '') {
    const gained = Math.max(0, Math.floor(Number(amount) || 0));
    if (gained <= 0 || !this.player || !this.player.fateRing) return 0;
    this.player.fateRing.exp = Math.max(0, Math.floor(Number(this.player.fateRing.exp) || 0)) + gained;
    if (typeof this.player.checkFateRingLevelUp === 'function') {
      this.player.checkFateRingLevelUp();
    }
    if (reason) {
      Utils.showBattleLog(`${reason}：命环经验 +${gained}`);
    }
    return gained;
  }
  draftStrategicCards(options = {}) {
    const count = Math.max(1, Math.min(5, Math.floor(Number(options.count) || 3)));
    const rarityPool = Array.isArray(options.rarityPool) && options.rarityPool.length > 0 ? options.rarityPool.map(item => String(item || 'rare').toLowerCase()) : ['rare'];
    const preferArchetype = !!options.preferArchetype;
    const characterId = this.player?.characterId || null;
    const deck = Array.isArray(this.player?.deck) ? this.player.deck : [];
    const archetype = preferArchetype && typeof inferDeckArchetype === 'function' ? inferDeckArchetype(deck) : null;
    const cards = [];
    const seen = new Set();
    for (let i = 0; i < count; i += 1) {
      let picked = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const rarity = rarityPool[Math.floor(Math.random() * rarityPool.length)] || 'rare';
        if (archetype && typeof getRandomArchetypeCard === 'function' && Math.random() < 0.45) {
          picked = getRandomArchetypeCard(archetype, rarity, characterId);
        }
        if (!picked && typeof getRandomCard === 'function') {
          picked = getRandomCard(rarity, characterId);
        }
        if (!picked) continue;
        if (seen.has(picked.id) && attempt < 11) {
          picked = null;
          continue;
        }
        break;
      }
      if (picked) {
        cards.push(picked);
        seen.add(picked.id);
      }
    }
    return cards;
  }
  showStrategicCardDraftModal(config = {}) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showStrategicCardDraftModal(config);
  }
  getStrategicRouteForecasts() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.getStrategicRouteForecasts();
  }
  getStrategicRouteForecast(forecastId = 'utility') {
    const catalog = this.getStrategicRouteForecasts();
    return catalog[forecastId] || catalog.utility;
  }
  applyStrategicRouteForecast(forecastId = 'utility') {
    const forecast = this.getStrategicRouteForecast(forecastId);
    if (!forecast) return null;
    this.setNextRealmMapRumor(forecast.shift, forecast.label);
    return forecast;
  }
  advanceRunDestinyTier(reason = '') {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.advanceRunDestinyTier(reason);
  }
  advanceSpiritCompanionTier(reason = '') {
    const current = this.player && typeof this.player.normalizeSpiritCompanion === 'function' ? this.player.normalizeSpiritCompanion(this.player.spiritCompanion) : this.player ? this.player.spiritCompanion : null;
    if (!current || !current.id || typeof SPIRIT_COMPANIONS === 'undefined' || !SPIRIT_COMPANIONS[current.id]) {
      return null;
    }
    const tiers = Array.isArray(SPIRIT_COMPANIONS[current.id].tiers) ? SPIRIT_COMPANIONS[current.id].tiers : [];
    const maxTier = Math.max(1, tiers.length || 1);
    const previousTier = Math.max(1, Math.floor(Number(current.tier) || 1));
    const nextTier = Math.min(maxTier, previousTier + 1);
    const previousMeta = this.getSpiritCompanionMetaById(current.id, previousTier);
    if (nextTier === previousTier) {
      return {
        upgraded: false,
        previousTier,
        nextTier,
        maxTier,
        meta: previousMeta
      };
    }
    if (this.player && typeof this.player.setSpiritCompanion === 'function') {
      this.player.setSpiritCompanion(current.id, nextTier);
    } else if (this.player) {
      this.player.spiritCompanion = {
        id: current.id,
        tier: nextTier
      };
    }
    const meta = this.player && typeof this.player.getSpiritCompanionMeta === 'function' ? this.player.getSpiritCompanionMeta() : this.getSpiritCompanionMetaById(current.id, nextTier);
    if (reason && meta) {
      Utils.showBattleLog(`${reason}：${meta.name} ${meta.tierLabel}`);
    }
    return {
      upgraded: true,
      previousTier,
      nextTier,
      maxTier,
      meta
    };
  }
  showObservatoryNode(node) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showObservatoryNode(node);
  }
  showForbiddenAltarNode(node) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showForbiddenAltarNode(node);
  }
  showForbiddenAltarVowDraft(node, hpCost, draftIds = null) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showForbiddenAltarVowDraft(node, hpCost, draftIds);
  }
  showMemoryRiftNode(node) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showMemoryRiftNode(node);
  }
  showSpiritGrottoDraft(node, draftIds = null) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showSpiritGrottoDraft(node, draftIds);
  }
  showSpiritGrottoNode(node) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showSpiritGrottoNode(node);
  }
  loadGuideState() {
    const defaults = {
      mainMenuIntroSeen: false,
      firstBattleGuideSeen: false,
      battleLogHintSeen: false
    };
    if (typeof localStorage === 'undefined') return defaults;
    try {
      const raw = localStorage.getItem('theDefierGuideStateV1');
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      return {
        ...defaults,
        ...parsed
      };
    } catch (e) {
      console.warn('Guide state parse failed, fallback to defaults.', e);
      return defaults;
    }
  }
  saveGuideState() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('theDefierGuideStateV1', JSON.stringify(this.guideState || {}));
    } catch (e) {
      console.warn('Guide state save failed.', e);
    }
  }
  markGuideSeen(key) {
    if (!this.guideState) this.guideState = this.loadGuideState();
    if (!Object.prototype.hasOwnProperty.call(this.guideState, key) || this.guideState[key]) return;
    this.guideState[key] = true;
    this.saveGuideState();
  }
  getLegacyDefaults() {
    return {
      essence: 0,
      spent: 0,
      upgrades: {},
      lastPreset: null,
      secondaryPreset: null,
      endlessSeasonLedger: {
        seasonId: null,
        seasonWeekTag: '',
        seasonName: '',
        seasonIcon: '',
        lastSeasonDirectiveId: null,
        seasonBestCycle: 0,
        seasonCycleClears: 0,
        seasonBossDefeated: 0,
        seasonScore: 0,
        seasonArchive: {},
        seasonDirectiveSelection: {
          seasonId: null,
          weekTag: '',
          directiveId: null,
          source: 'auto'
        },
        seasonDirectiveClearCounts: {},
        seasonCollapseStats: {},
        lastSeasonCollapse: null
      }
    };
  }
  createDefaultEndlessState() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.createDefaultEndlessState();
  }
  createDefaultEncounterState() {
    return {
      battles: 0,
      wins: 0,
      currentStreakId: null,
      currentStreak: 0,
      maxStreak: 0,
      recentThemes: [],
      themeStats: {},
      totalBonusGold: 0,
      totalBonusExp: 0
    };
  }
  normalizeEncounterState(rawState = null) {
    const defaults = this.createDefaultEncounterState();
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const toInt = (value, fallback = 0) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.max(0, Math.floor(num));
    };
    const themeStats = {};
    const rawThemeStats = source.themeStats && typeof source.themeStats === 'object' ? source.themeStats : {};
    Object.keys(rawThemeStats).forEach(themeId => {
      if (typeof themeId !== 'string' || !themeId) return;
      const entry = rawThemeStats[themeId];
      const winCount = toInt(entry && entry.wins, 0);
      const seenCount = toInt(entry && entry.seen, 0);
      if (winCount <= 0 && seenCount <= 0) return;
      themeStats[themeId] = {
        seen: Math.max(seenCount, winCount),
        wins: Math.min(winCount, Math.max(seenCount, winCount)),
        bestTier: Math.max(1, Math.min(3, toInt(entry && entry.bestTier, 1) || 1))
      };
    });
    const currentStreak = toInt(source.currentStreak, 0);
    const normalized = {
      ...defaults,
      battles: toInt(source.battles, 0),
      wins: toInt(source.wins, 0),
      currentStreakId: typeof source.currentStreakId === 'string' && source.currentStreakId ? source.currentStreakId : null,
      currentStreak,
      maxStreak: Math.max(currentStreak, toInt(source.maxStreak, currentStreak)),
      recentThemes: Array.isArray(source.recentThemes) ? source.recentThemes.filter(id => typeof id === 'string' && id).slice(-10) : [],
      themeStats,
      totalBonusGold: toInt(source.totalBonusGold, 0),
      totalBonusExp: toInt(source.totalBonusExp, 0)
    };
    if (normalized.currentStreak <= 0) {
      normalized.currentStreak = 0;
      normalized.currentStreakId = null;
    }
    return normalized;
  }
  ensureEncounterState() {
    this.encounterState = this.normalizeEncounterState(this.encounterState);
    return this.encounterState;
  }
  registerEncounterThemeStart(themeId) {
    const state = this.ensureEncounterState();
    const id = typeof themeId === 'string' ? themeId : '';
    if (!id) return 1;
    state.battles += 1;
    if (state.currentStreakId === id) {
      state.currentStreak += 1;
    } else {
      state.currentStreakId = id;
      state.currentStreak = 1;
    }
    state.maxStreak = Math.max(state.maxStreak, state.currentStreak);
    state.recentThemes.push(id);
    if (state.recentThemes.length > 10) state.recentThemes.shift();
    const stats = state.themeStats[id] || {
      seen: 0,
      wins: 0,
      bestTier: 1
    };
    stats.seen = Math.max(0, Number(stats.seen) || 0) + 1;
    const stage = state.currentStreak >= 4 ? 3 : state.currentStreak >= 2 ? 2 : 1;
    stats.bestTier = Math.max(stats.bestTier || 1, stage);
    state.themeStats[id] = stats;
    return stage;
  }
  recordEncounterThemeVictory(summary) {
    if (!summary || typeof summary !== 'object') return;
    const state = this.ensureEncounterState();
    state.wins += 1;
    const id = typeof summary.themeId === 'string' ? summary.themeId : '';
    if (id) {
      const stats = state.themeStats[id] || {
        seen: 0,
        wins: 0,
        bestTier: 1
      };
      stats.wins = Math.max(0, Number(stats.wins) || 0) + 1;
      stats.seen = Math.max(stats.seen || 0, stats.wins);
      stats.bestTier = Math.max(stats.bestTier || 1, Math.max(1, Math.min(3, Math.floor(Number(summary.tierStage) || 1))));
      state.themeStats[id] = stats;
    }
    state.totalBonusGold += Math.max(0, Math.floor(Number(summary.goldBonus) || 0));
    state.totalBonusExp += Math.max(0, Math.floor(Number(summary.ringExpBonus) || 0));
  }
  normalizeEndlessState(rawState = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.normalizeEndlessState(rawState);
  }
  ensureEndlessState() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.ensureEndlessState();
  }
  isEndlessUnlocked() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.isEndlessUnlocked();
  }
  isEndlessActive() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.isEndlessActive();
  }
  getMapCacheKey(realm) {
    if (this.isEndlessActive()) {
      const state = this.ensureEndlessState();
      return `endless:${state.currentCycle}:realm:${realm}`;
    }
    return `realm:${realm}`;
  }
  getEndlessRealmForCycle(cycle = 0) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessRealmForCycle(cycle);
  }
  getDisplayRealmName(realm) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getDisplayRealmName(realm);
  }
  getChapterProfileCatalog() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getChapterProfileCatalog();
  }
  resolveChapterDangerProfile(chapterBase = null, stageIndex = 1) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.resolveChapterDangerProfile(chapterBase, stageIndex);
  }
  getChapterNemesisSnapshot(realm) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getChapterNemesisSnapshot(realm);
  }
  getChapterProfileForRealm(realm) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getChapterProfileForRealm(realm);
  }
  getChapterDisplaySnapshot(realm) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getChapterDisplaySnapshot(realm);
  }
  getCharacterIdentityProfile(characterId) {
    const charId = typeof characterId === 'string' && characterId ? characterId : null;
    if (!charId || typeof CHARACTERS === 'undefined' || !CHARACTERS[charId]) return null;
    const character = CHARACTERS[charId];
    const template = typeof getV6CharacterIdentityTemplate === 'function' ? getV6CharacterIdentityTemplate(charId) : null;
    const recommendedDestinies = (template?.recommendedDestinyIds || []).map(destinyId => this.getRunDestinyMetaById(destinyId, 1)).filter(Boolean);
    const recommendedSpirits = (template?.recommendedSpiritIds || []).map(spiritId => this.getSpiritCompanionMetaById(spiritId, 1)).filter(Boolean);
    return {
      id: charId,
      name: character.name,
      title: character.title,
      unlockLabel: template?.unlockLabel || '已解锁',
      unlockHint: template?.unlockHint || '可直接出阵',
      synopsis: template?.synopsis || character.description || '',
      identityHook: template?.identityHook || character.description || '',
      keywords: Array.isArray(template?.keywords) ? template.keywords.slice(0, 4) : [],
      recommendedDestinies,
      recommendedSpirits,
      recommendedDestinyText: recommendedDestinies.map(meta => meta.name).join('、') || '待推演',
      recommendedSpiritText: recommendedSpirits.map(meta => meta.name).join('、') || '待追索',
      exclusiveLine: template?.exclusiveLine || {
        title: '命线未定',
        summary: '更多剧情等待解锁。'
      },
      uiMeta: template?.uiMeta || {
        tone: 'identity',
        icon: '✦'
      }
    };
  }
  getSpiritStoryProfile(spiritId) {
    const safeSpiritId = typeof spiritId === 'string' && spiritId ? spiritId : null;
    if (!safeSpiritId) return null;
    const template = typeof getV6SpiritStoryTemplate === 'function' ? getV6SpiritStoryTemplate(safeSpiritId) : null;
    const spiritMeta = typeof this.getSpiritCompanionMetaById === 'function' ? this.getSpiritCompanionMetaById(safeSpiritId, 1) : null;
    if (!template && !spiritMeta) return null;
    return {
      id: safeSpiritId,
      source: template?.source || '灵契窟 / 章节事件',
      acquisitionTitle: template?.acquisitionTitle || '初见之契',
      acquisitionSummary: template?.acquisitionSummary || spiritMeta?.story || '',
      witnessTitle: template?.witnessTitle || '同行见证',
      witnessSummary: template?.witnessSummary || spiritMeta?.summary || spiritMeta?.description || '',
      growthGoal: template?.growthGoal || spiritMeta?.playstyle || '继续围绕它的护道方式补足构筑。',
      uiMeta: template?.uiMeta || {
        tone: 'spirit',
        icon: spiritMeta?.icon || '✦'
      }
    };
  }
  getChapterNarrativeProfile(chapterIndex) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getChapterNarrativeProfile(chapterIndex);
  }
  getWorldviewRecallCatalog() {
    if (typeof V6_WORLDVIEW_RECALL === 'undefined' || !Array.isArray(V6_WORLDVIEW_RECALL)) return [];
    try {
      return JSON.parse(JSON.stringify(V6_WORLDVIEW_RECALL));
    } catch (error) {
      return V6_WORLDVIEW_RECALL.slice();
    }
  }
  createDefaultChapterEventLedger() {
    return Game.prototype.ensureEventManager.call(this).createDefaultChapterEventLedger();
  }
  normalizeChapterEventLedger(rawLedger = null) {
    return Game.prototype.ensureEventManager.call(this).normalizeChapterEventLedger(rawLedger);
  }
  ensureChapterEventLedger() {
    return Game.prototype.ensureEventManager.call(this).ensureChapterEventLedger();
  }
  getChapterEventLedgerSaveState() {
    return Game.prototype.ensureEventManager.call(this).getChapterEventLedgerSaveState();
  }
  applyChapterEventLedgerSaveState(rawLedger = null) {
    return Game.prototype.ensureEventManager.call(this).applyChapterEventLedgerSaveState(rawLedger);
  }
  getChapterEventLedgerSnapshot(options = {}) {
    return Game.prototype.ensureEventManager.call(this).getChapterEventLedgerSnapshot(options);
  }
  getChapterEventComposerContext() {
    return Game.prototype.ensureEventManager.call(this).getChapterEventComposerContext();
  }
  recordChapterEventConsequence(payload = {}) {
    return Game.prototype.ensureEventManager.call(this).recordChapterEventConsequence(payload);
  }
  buildEventChoiceEffectSummary(choice = {}) {
    return Game.prototype.ensureEventManager.call(this).buildEventChoiceEffectSummary(choice);
  }
  getEventNarrativePresentation(event, node = null) {
    return Game.prototype.ensureEventManager.call(this).getEventNarrativePresentation(event, node);
  }
  applyEventModalPresentation(presentation = {}) {
    return Game.prototype.ensureEventManager.call(this).applyEventModalPresentation(presentation);
  }
  getEndlessMutatorPool() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessMutatorPool();
  }
  rollNextEndlessMutator() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.rollNextEndlessMutator();
  }
  getEndlessParanoiaBurdenPool() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessParanoiaBurdenPool();
  }
  getEndlessParanoiaBoonPool() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessParanoiaBoonPool();
  }
  getEndlessParanoiaEffects() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessParanoiaEffects();
  }
  getEndlessParanoiaTreasureSlotBonus() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessParanoiaTreasureSlotBonus();
  }
  getEndlessParanoiaHandLimitPenalty() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessParanoiaHandLimitPenalty();
  }
  getEndlessParanoiaEliteMutatorId(cycleOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessParanoiaEliteMutatorId(cycleOverride);
  }
  getEndlessActiveMutatorIds() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessActiveMutatorIds();
  }
  getEndlessParanoiaChoices() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessParanoiaChoices();
  }
  grantEndlessParanoiaBoonImmediate(boon) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.grantEndlessParanoiaBoonImmediate(boon);
  }
  applyEndlessParanoiaChoice(choice, cycleOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.applyEndlessParanoiaChoice(choice, cycleOverride);
  }
  showEndlessParanoiaSelection(cycleOverride = null, onDone = null) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showEndlessParanoiaSelection(cycleOverride, onDone);
  }
  getEndlessPhaseProfile(cycleOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessPhaseProfile(cycleOverride);
  }
  getEndlessCycleThemeProfile(cycleOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessCycleThemeProfile(cycleOverride);
  }
  getEndlessSeasonCatalog() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessSeasonCatalog();
  }
  getEndlessSeasonCollapseCatalog() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessSeasonCollapseCatalog();
  }
  getEndlessSeasonDirectiveRiskScore(directive = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessSeasonDirectiveRiskScore(directive);
  }
  getEndlessSeasonProgressSnapshot(seasonProfile = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessSeasonProgressSnapshot(seasonProfile);
  }
  getEndlessSeasonGoals(seasonProfile = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessSeasonGoals(seasonProfile);
  }
  persistEndlessSeasonLedger() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.persistEndlessSeasonLedger();
  }
  getEndlessWeekMeta(dateOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessWeekMeta(dateOverride);
  }
  getEndlessSeasonProfile(cycleOverride = null, dateOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessSeasonProfile(cycleOverride, dateOverride);
  }
  syncEndlessSeasonState(options = {}) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.syncEndlessSeasonState(options);
  }
  setEndlessSeasonDirective(directiveId = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.setEndlessSeasonDirective(directiveId);
  }
  getEndlessCollapseAnalysis() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessCollapseAnalysis();
  }
  recordEndlessSeasonCollapse() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.recordEndlessSeasonCollapse();
  }
  getEndlessModifiers(cycleOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessModifiers(cycleOverride);
  }
  getEndlessHealingMultiplier() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessHealingMultiplier();
  }
  getEndlessEventTuning() {
    return Game.prototype.ensureEventManager.call(this).getEndlessEventTuning();
  }
  getEndlessPressureBehaviorProfile(cycleOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessPressureBehaviorProfile(cycleOverride);
  }
  getSharedDangerAxisLibrary() {
    return {
      burst: {
        id: 'burst',
        label: '先手爆发',
        summary: '第一拍与瞬时爆发惩罚偏高，若起手没稳住会迅速掉血。',
        counterplay: '优先留开场护盾、首拍减伤与速杀手段，别让第一轮失血滚雪球。',
        reserveGuidance: '首章前建议至少保留 1 次硬减伤、护盾翻盘点或低费止损牌。'
      },
      attrition: {
        id: 'attrition',
        label: '拉锯压强',
        summary: '敌方血量、护盾或跨章耐压更高，越拖越容易被资源税反超。',
        counterplay: '把恢复、补件与法宝节奏提早，避免在中盘因资源税断档。',
        reserveGuidance: '建议每重结束时都保留恢复与补件预算，不要把灵石和补件机会花空。'
      },
      control: {
        id: 'control',
        label: '控场税负',
        summary: '弱化、易伤与压制会持续放大失误成本，容错窗口更窄。',
        counterplay: '预留净化、免控或稳态护盾，避免在 debuff 回合里空过关键输出窗。',
        reserveGuidance: '建议保留净化、低费防御或灵契主动来专门吃掉压制回合。'
      },
      execution: {
        id: 'execution',
        label: '执行门槛',
        summary: '固定季签、偏执抉择与深轮检定提高了路线与节拍执行要求。',
        counterplay: '优先按当前季签与轮段题面完成主轴，再追求额外收益，不要过早偏离样本。',
        reserveGuidance: '建议先把本轮主轴打稳，再去贪高压战、额外分数和高波动交易。'
      }
    };
  }
  getEndlessDangerProfile(cycleOverride = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessDangerProfile(cycleOverride);
  }
  buildEndlessPressurePatternVariant(pattern, profile, variantIndex = 0) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.buildEndlessPressurePatternVariant(pattern, profile, variantIndex);
  }
  getEndlessMapConfig(realm) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessMapConfig(realm);
  }
  getEndlessBoonPool() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessBoonPool();
  }
  getEndlessBoonChoices() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.getEndlessBoonChoices();
  }
  applyEndlessBoon(boonId) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.applyEndlessBoon(boonId);
  }
  showEndlessBoonSelection(onDone = null) {
    if (!this.strategicView) this.strategicView = new StrategicView(this);
    return this.strategicView.showEndlessBoonSelection(onDone);
  }
  applyEndlessPreBattleBonuses() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.applyEndlessPreBattleBonuses();
  }
  startEndlessMode() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.startEndlessMode();
  }
  handleEndlessRealmComplete() {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.handleEndlessRealmComplete();
  }
  getLegacyUpgradeCatalog() {
    return [{
      id: 'vitalitySeed',
      name: '命元传承',
      icon: '❤️',
      maxLevel: 3,
      costs: [4, 8, 12],
      desc: '每级使开局最大生命 +6',
      effects: {
        startMaxHp: 6
      }
    }, {
      id: 'spiritPouch',
      name: '灵石囊',
      icon: '💰',
      maxLevel: 3,
      costs: [3, 6, 9],
      desc: '每级使开局灵石 +30',
      effects: {
        startGold: 30
      }
    }, {
      id: 'battleInsight',
      name: '先天悟性',
      icon: '⚡',
      maxLevel: 2,
      costs: [7, 11],
      desc: '每级首回合额外抽 1 张牌',
      effects: {
        firstTurnDrawBonus: 1
      }
    }, {
      id: 'forgemind',
      name: '锻意共鸣',
      icon: '⚒️',
      maxLevel: 3,
      costs: [5, 9, 13],
      desc: '每级使锻炉消耗降低 6%',
      effects: {
        forgeCostDiscount: 0.06
      }
    }, {
      id: 'mindLibrary',
      name: '识海扩容',
      icon: '📖',
      maxLevel: 2,
      costs: [8, 12],
      desc: '每级使战斗抽牌基数 +1',
      effects: {
        startDraw: 1
      }
    }];
  }
  getLegacyPresetCatalog() {
    return [{
      id: 'survivor',
      name: '稳健守成',
      icon: '🛡️',
      desc: '优先血量与经济，保证开局容错。',
      priority: ['vitalitySeed', 'spiritPouch', 'mindLibrary', 'forgemind', 'battleInsight']
    }, {
      id: 'smith',
      name: '锻造流',
      icon: '⚒️',
      desc: '优先锻炉折扣与资源，强化中期成长。',
      priority: ['forgemind', 'spiritPouch', 'vitalitySeed', 'mindLibrary', 'battleInsight']
    }, {
      id: 'tempo',
      name: '速攻流',
      icon: '⚡',
      desc: '优先首回合节奏与抽牌压制。',
      priority: ['battleInsight', 'mindLibrary', 'spiritPouch', 'forgemind', 'vitalitySeed']
    }, {
      id: 'entropy',
      name: '湮律流',
      icon: '🌀',
      desc: '围绕弃牌触发与随机压制展开节奏。',
      priority: ['mindLibrary', 'battleInsight', 'forgemind', 'spiritPouch', 'vitalitySeed']
    }, {
      id: 'bulwark',
      name: '玄甲流',
      icon: '🛡️',
      desc: '通过护势共鸣滚动优势，稳态反击压垮对手。',
      priority: ['vitalitySeed', 'mindLibrary', 'battleInsight', 'forgemind', 'spiritPouch']
    }, {
      id: 'stormcraft',
      name: '霆策流',
      icon: '⚡',
      desc: '围绕易伤破窗与连锁追击展开爆发。',
      priority: ['battleInsight', 'mindLibrary', 'forgemind', 'spiritPouch', 'vitalitySeed']
    }, {
      id: 'vitalweave',
      name: '回脉流',
      icon: '💚',
      desc: '围绕治疗转化护阵与反击，构建持续战线。',
      priority: ['vitalitySeed', 'mindLibrary', 'spiritPouch', 'forgemind', 'battleInsight']
    }];
  }
  getLegacyRunDoctrineForPreset(presetId) {
    return Game.prototype.ensureRunManager.call(this).getLegacyRunDoctrineForPreset(presetId);
  }
  getLegacyMissionForPreset(presetId) {
    if (presetId === 'survivor') {
      return {
        presetId,
        id: 'survivor_guard',
        name: '守成试炼',
        desc: '本轮累计获得 40 点护盾',
        eventType: 'gainBlock',
        target: 40,
        progress: 0,
        completed: false,
        rewardEssence: 6,
        rewardGranted: false
      };
    }
    if (presetId === 'smith') {
      return {
        presetId,
        id: 'smith_forge',
        name: '锻意试炼',
        desc: '完成 1 次锻炉抉择',
        eventType: 'forgeComplete',
        target: 1,
        progress: 0,
        completed: false,
        rewardEssence: 6,
        rewardGranted: false
      };
    }
    if (presetId === 'tempo') {
      return {
        presetId,
        id: 'tempo_strike',
        name: '疾势试炼',
        desc: '触发 3 次首击增伤',
        eventType: 'tempoFirstStrike',
        target: 3,
        progress: 0,
        completed: false,
        rewardEssence: 6,
        rewardGranted: false
      };
    }
    if (presetId === 'entropy') {
      return {
        presetId,
        id: 'entropy_flux',
        name: '湮律试炼',
        desc: '触发 4 次弃牌共鸣',
        eventType: 'entropyDiscardProc',
        target: 4,
        progress: 0,
        completed: false,
        rewardEssence: 6,
        rewardGranted: false
      };
    }
    if (presetId === 'bulwark') {
      return {
        presetId,
        id: 'bulwark_guard',
        name: '玄甲试炼',
        desc: '触发 4 次护势共鸣',
        eventType: 'bulwarkBlockProc',
        target: 4,
        progress: 0,
        completed: false,
        rewardEssence: 6,
        rewardGranted: false
      };
    }
    if (presetId === 'stormcraft') {
      return {
        presetId,
        id: 'stormcraft_chain',
        name: '霆策试炼',
        desc: '触发 4 次易伤破窗追击',
        eventType: 'stormcraftVulnerableProc',
        target: 4,
        progress: 0,
        completed: false,
        rewardEssence: 6,
        rewardGranted: false
      };
    }
    if (presetId === 'vitalweave') {
      return {
        presetId,
        id: 'vitalweave_mend',
        name: '回脉试炼',
        desc: '触发 4 次回生织脉',
        eventType: 'vitalweaveHealProc',
        target: 4,
        progress: 0,
        completed: false,
        rewardEssence: 6,
        rewardGranted: false
      };
    }
    return null;
  }
  normalizeLegacyProgress(raw) {
    const defaults = this.getLegacyDefaults();
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalizeString = (value, maxLen = 64) => {
      if (typeof value !== 'string') return '';
      return value.trim().slice(0, Math.max(0, Math.floor(Number(maxLen) || 0)));
    };
    const normalizeInt = (value, fallback = 0) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.max(0, Math.floor(num));
    };
    const normalizeStatMap = (value, maxEntries = 16) => {
      const sourceMap = value && typeof value === 'object' ? value : {};
      const normalizedMap = {};
      Object.keys(sourceMap).filter(key => typeof key === 'string' && key).slice(0, Math.max(0, Math.floor(Number(maxEntries) || 0))).forEach(key => {
        normalizedMap[key.slice(0, 48)] = normalizeInt(sourceMap[key], 0);
      });
      return normalizedMap;
    };
    const normalized = {
      essence: normalizeInt(source.essence, 0),
      spent: normalizeInt(source.spent, 0),
      upgrades: {},
      lastPreset: null,
      secondaryPreset: null,
      endlessSeasonLedger: (() => {
        const ledger = source.endlessSeasonLedger && typeof source.endlessSeasonLedger === 'object' ? source.endlessSeasonLedger : {};
        const seasonArchiveRaw = ledger.seasonArchive && typeof ledger.seasonArchive === 'object' ? ledger.seasonArchive : {};
        const seasonArchive = {};
        Object.keys(seasonArchiveRaw).filter(key => typeof key === 'string' && key).slice(0, 16).forEach(key => {
          const entry = seasonArchiveRaw[key];
          if (!entry || typeof entry !== 'object') return;
          const safeKey = key.slice(0, 96);
          seasonArchive[safeKey] = {
            seasonId: normalizeString(entry.seasonId, 32) || normalizeString(safeKey.split(':')[0], 32) || null,
            weekTag: normalizeString(entry.weekTag, 24),
            seasonName: normalizeString(entry.seasonName, 32),
            icon: normalizeString(entry.icon, 4),
            bestCycle: normalizeInt(entry.bestCycle),
            clears: normalizeInt(entry.clears),
            bosses: normalizeInt(entry.bosses),
            score: normalizeInt(entry.score),
            lastDirectiveId: normalizeString(entry.lastDirectiveId, 48) || null,
            directiveClearCounts: normalizeStatMap(entry.directiveClearCounts, 12),
            collapseStats: normalizeStatMap(entry.collapseStats, 12),
            lastCollapseReasonId: normalizeString(entry.lastCollapseReasonId, 48) || null,
            lastCollapseLabel: normalizeString(entry.lastCollapseLabel, 32),
            updatedAt: Math.max(0, Math.floor(Number(entry.updatedAt) || 0))
          };
        });
        const selection = ledger.seasonDirectiveSelection && typeof ledger.seasonDirectiveSelection === 'object' ? ledger.seasonDirectiveSelection : {};
        const collapse = ledger.lastSeasonCollapse && typeof ledger.lastSeasonCollapse === 'object' ? ledger.lastSeasonCollapse : null;
        return {
          seasonId: normalizeString(ledger.seasonId, 32) || null,
          seasonWeekTag: normalizeString(ledger.seasonWeekTag, 24),
          seasonName: normalizeString(ledger.seasonName, 32),
          seasonIcon: normalizeString(ledger.seasonIcon, 4),
          lastSeasonDirectiveId: normalizeString(ledger.lastSeasonDirectiveId, 48) || null,
          seasonBestCycle: normalizeInt(ledger.seasonBestCycle),
          seasonCycleClears: normalizeInt(ledger.seasonCycleClears),
          seasonBossDefeated: normalizeInt(ledger.seasonBossDefeated),
          seasonScore: normalizeInt(ledger.seasonScore),
          seasonArchive,
          seasonDirectiveSelection: {
            seasonId: normalizeString(selection.seasonId, 32) || null,
            weekTag: normalizeString(selection.weekTag, 24),
            directiveId: normalizeString(selection.directiveId, 48) || null,
            source: selection.source === 'player' ? 'player' : 'auto'
          },
          seasonDirectiveClearCounts: normalizeStatMap(ledger.seasonDirectiveClearCounts, 12),
          seasonCollapseStats: normalizeStatMap(ledger.seasonCollapseStats, 12),
          lastSeasonCollapse: collapse && normalizeString(collapse.id, 48) && normalizeString(collapse.label, 32) ? {
            id: normalizeString(collapse.id, 48),
            label: normalizeString(collapse.label, 32),
            desc: normalizeString(collapse.desc, 160),
            cycle: normalizeInt(collapse.cycle),
            pressure: Math.max(0, Math.min(9, normalizeInt(collapse.pressure))),
            directiveId: normalizeString(collapse.directiveId, 48) || null,
            recordedAt: Math.max(0, Math.floor(Number(collapse.recordedAt) || 0))
          } : null
        };
      })()
    };
    const inputUpgrades = source.upgrades && typeof source.upgrades === 'object' ? source.upgrades : {};
    (this.legacyUpgradeCatalog || []).forEach(def => {
      const level = Math.max(0, Math.floor(Number(inputUpgrades[def.id]) || 0));
      normalized.upgrades[def.id] = Math.min(def.maxLevel, level);
    });
    if (normalized.spent > normalized.essence) {
      normalized.spent = normalized.essence;
    }
    const validPresetIds = (this.getLegacyPresetCatalog ? this.getLegacyPresetCatalog() : []).map(p => p.id);
    if (typeof source.lastPreset === 'string' && validPresetIds.includes(source.lastPreset)) {
      normalized.lastPreset = source.lastPreset;
    }
    if (typeof source.secondaryPreset === 'string' && validPresetIds.includes(source.secondaryPreset) && source.secondaryPreset !== normalized.lastPreset) {
      normalized.secondaryPreset = source.secondaryPreset;
    }
    return {
      ...defaults,
      ...normalized
    };
  }
  loadLegacyProgress() {
    const defaults = this.getLegacyDefaults();
    if (typeof localStorage === 'undefined') return defaults;
    try {
      const raw = localStorage.getItem(this.legacyStorageKey);
      if (!raw) return defaults;
      return this.normalizeLegacyProgress(JSON.parse(raw));
    } catch (e) {
      console.warn('Legacy progress parse failed.', e);
      return defaults;
    }
  }
  saveLegacyProgress() {
    if (!this.legacyProgress) this.legacyProgress = this.getLegacyDefaults();
    this.legacyProgress = this.normalizeLegacyProgress(this.legacyProgress);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.legacyStorageKey, JSON.stringify(this.legacyProgress));
    } catch (e) {
      console.warn('Legacy progress save failed.', e);
    }
  }
  getLegacyUpgradeById(upgradeId) {
    if (!Array.isArray(this.legacyUpgradeCatalog)) return null;
    return this.legacyUpgradeCatalog.find(u => u.id === upgradeId) || null;
  }
  getLegacyUpgradeLevel(upgradeId) {
    if (!this.legacyProgress || !this.legacyProgress.upgrades) return 0;
    return Math.max(0, Math.floor(Number(this.legacyProgress.upgrades[upgradeId]) || 0));
  }
  getLegacyUpgradeCost(upgradeId, targetLevel = null) {
    const def = this.getLegacyUpgradeById(upgradeId);
    if (!def) return 0;
    const currentLevel = this.getLegacyUpgradeLevel(upgradeId);
    const level = targetLevel === null ? currentLevel + 1 : targetLevel;
    if (level < 1 || level > def.maxLevel) return 0;
    return def.costs[level - 1] || 0;
  }
  getLegacyUnspentEssence() {
    if (!this.legacyProgress) return 0;
    return Math.max(0, (this.legacyProgress.essence || 0) - (this.legacyProgress.spent || 0));
  }
  getLegacyBonuses() {
    const bonuses = {
      startMaxHp: 0,
      startGold: 0,
      startDraw: 0,
      firstTurnDrawBonus: 0,
      forgeCostDiscount: 0
    };
    (this.legacyUpgradeCatalog || []).forEach(def => {
      const level = this.getLegacyUpgradeLevel(def.id);
      if (!level || !def.effects) return;
      Object.keys(def.effects).forEach(key => {
        bonuses[key] = (bonuses[key] || 0) + def.effects[key] * level;
      });
    });
    bonuses.forgeCostDiscount = Math.min(0.35, bonuses.forgeCostDiscount);
    return bonuses;
  }
  applyLegacyRunDoctrine(player, presetId = null, secondaryPresetId = null) {
    return Game.prototype.ensureRunManager.call(this).applyLegacyRunDoctrine(player, presetId, secondaryPresetId);
  }
  applyLegacyRunMission(player, presetId = null) {
    return Game.prototype.ensureRunManager.call(this).applyLegacyRunMission(player, presetId);
  }
  handleLegacyMissionProgress(eventType, amount = 1) {
    if (!this.player || !this.player.legacyRunMission) return false;
    const mission = this.player.legacyRunMission;
    if (mission.completed) return false;
    if (mission.eventType !== eventType) return false;
    const delta = Math.max(0, Number(amount) || 0);
    if (delta <= 0) return false;
    const beforeProgress = Math.max(0, Number(mission.progress) || 0);
    mission.progress = Math.min(mission.target, beforeProgress + delta);
    const target = Math.max(1, Number(mission.target) || 1);
    const checkpoints = [0.25, 0.5, 0.75];
    const beforeRatio = beforeProgress / target;
    const afterRatio = mission.progress / target;
    const shouldBroadcastProgress = target <= 5 || checkpoints.some(cp => beforeRatio < cp && afterRatio >= cp);
    if (shouldBroadcastProgress && !mission.completed && typeof Utils !== 'undefined' && Utils.showBattleLog) {
      Utils.showBattleLog(`传承试炼进度：${mission.name} ${mission.progress}/${mission.target}`);
    }
    if (mission.progress >= mission.target) {
      mission.completed = true;
      if (!mission.rewardGranted) {
        mission.rewardGranted = true;
        this.awardLegacyEssence(mission.rewardEssence || 0, `完成传承试炼：${mission.name}`);
        if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
          Utils.showBattleLog(`传承试炼达成：${mission.name}`);
        }
      }
    }
    if (typeof this.refreshLegacyMissionTrackers === 'function') {
      this.refreshLegacyMissionTrackers();
    }
    return true;
  }
  refreshLegacyMissionTrackers() {
    if (this.battle && this.currentScreen === 'battle-screen' && typeof this.battle.updateLegacyMissionTracker === 'function') {
      this.battle.updateLegacyMissionTracker();
    }
    if (this.map && this.currentScreen === 'map-screen' && typeof this.map.updateLegacyMissionTracker === 'function') {
      this.map.updateLegacyMissionTracker();
    }
  }
  applyLegacyBonusesToPlayer(player, bonuses = null) {
    if (!player) return;
    const finalBonuses = bonuses || this.getLegacyBonuses();
    player.legacyBonuses = {
      ...finalBonuses
    };
    if (typeof player.recalculateStats === 'function') {
      player.recalculateStats();
    }
    if (finalBonuses.startGold > 0) {
      player.gold += finalBonuses.startGold;
    }
    if (finalBonuses.startMaxHp > 0) {
      player.currentHp = player.maxHp;
    }
  }
  awardLegacyEssence(amount, reason = '轮回感悟', options = {}) {
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (gain <= 0) return 0;
    if (!this.legacyProgress) this.legacyProgress = this.getLegacyDefaults();
    this.legacyProgress.essence = (this.legacyProgress.essence || 0) + gain;
    this.lastLegacyGain = gain;
    this.saveLegacyProgress();
    if (!options.silent && typeof Utils !== 'undefined' && Utils.showBattleLog) {
      Utils.showBattleLog(`【传承】${reason}：轮回精粹 +${gain}`);
    }
    return gain;
  }
  buyLegacyUpgrade(upgradeId, options = {}) {
    if (!this.legacyProgress || typeof this.legacyProgress !== 'object') {
      this.legacyProgress = this.getLegacyDefaults();
    }
    if (!this.legacyProgress.upgrades || typeof this.legacyProgress.upgrades !== 'object') {
      this.legacyProgress.upgrades = {};
    }
    const def = this.getLegacyUpgradeById(upgradeId);
    if (!def) return false;
    const currentLevel = this.getLegacyUpgradeLevel(upgradeId);
    if (currentLevel >= def.maxLevel) return false;
    const cost = this.getLegacyUpgradeCost(upgradeId, currentLevel + 1);
    if (this.getLegacyUnspentEssence() < cost) return false;
    this.legacyProgress.upgrades[upgradeId] = currentLevel + 1;
    this.legacyProgress.spent = (this.legacyProgress.spent || 0) + cost;
    this.saveLegacyProgress();
    if (!options.silent && typeof Utils !== 'undefined' && Utils.showBattleLog) {
      Utils.showBattleLog(`传承提升：${def.name} Lv.${currentLevel + 1}`);
    }
    return true;
  }
  applyLegacyPreset(presetId, options = {}) {
    if (!this.legacyProgress || typeof this.legacyProgress !== 'object') {
      this.legacyProgress = this.getLegacyDefaults();
    }
    if (!this.legacyProgress.upgrades || typeof this.legacyProgress.upgrades !== 'object') {
      this.legacyProgress.upgrades = {};
    }
    const presets = this.getLegacyPresetCatalog();
    const preset = presets.find(p => p.id === presetId);
    if (!preset && presetId !== null) return {
      success: false,
      reason: 'preset_not_found',
      allocated: 0
    };
    const isSecondary = options.isSecondary;
    if (presetId === null) {
      if (isSecondary) this.legacyProgress.secondaryPreset = null;else this.legacyProgress.lastPreset = null;
    } else {
      if (isSecondary) {
        if (this.legacyProgress.lastPreset === preset.id) {
          this.legacyProgress.lastPreset = null; // Cannot be both
        }
        this.legacyProgress.secondaryPreset = preset.id;
      } else {
        if (this.legacyProgress.secondaryPreset === preset.id) {
          this.legacyProgress.secondaryPreset = null;
        }
        this.legacyProgress.lastPreset = preset.id;
      }
    }

    // P1 重构：根据主副道统重新分配精粹
    this.legacyProgress.spent = 0;
    this.legacyProgress.upgrades = {};
    const beforeSpent = 0;
    let changed = true;

    // 1. 先满足主道统
    const p1 = presets.find(p => p.id === this.legacyProgress.lastPreset);
    if (p1) {
      changed = true;
      while (changed) {
        changed = false;
        for (const upgradeId of p1.priority) {
          if (this.buyLegacyUpgrade(upgradeId, {
            silent: true
          })) changed = true;
        }
      }
    }

    // 2. 再满足副道统 (使用剩余精粹)
    const p2 = presets.find(p => p.id === this.legacyProgress.secondaryPreset);
    if (p2) {
      changed = true;
      while (changed) {
        changed = false;
        for (const upgradeId of p2.priority) {
          if (this.buyLegacyUpgrade(upgradeId, {
            silent: true
          })) changed = true;
        }
      }
    }
    this.saveLegacyProgress();
    const allocated = this.legacyProgress.spent || 0;
    if (typeof Utils !== 'undefined' && Utils.showBattleLog && preset) {
      Utils.showBattleLog(`已装备道统【${preset.name}】(${isSecondary ? '副' : '主'})，共投入 ${allocated} 精粹`);
    }
    return {
      success: true,
      allocated,
      preset
    };
  }
  resetLegacyUpgrades() {
    if (!this.legacyProgress || (this.legacyProgress.spent || 0) <= 0) return;
    this.showConfirmModal('重置传承将返还全部已投入精粹，是否继续？', () => {
      this.legacyProgress.spent = 0;
      this.legacyProgress.upgrades = {};
      this.saveLegacyProgress();
      this.initInheritanceScreen();
      if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
        Utils.showBattleLog('传承已重置，全部精粹已返还。');
      }
    });
  }
  showLegacyScreen() {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showLegacyScreen();
  }
  initInheritanceScreen() {
    if (!this.legacyProgress || typeof this.legacyProgress !== 'object') {
      this.legacyProgress = this.loadLegacyProgress();
    }
    this.legacyProgress = this.normalizeLegacyProgress(this.legacyProgress);
    const summary = document.getElementById('inheritance-summary');
    const presetsEl = document.getElementById('inheritance-presets');
    const grid = document.getElementById('inheritance-upgrade-grid');
    const note = document.getElementById('inheritance-run-note');
    if (!summary || !grid) return;
    const total = this.legacyProgress?.essence || 0;
    const spent = this.legacyProgress?.spent || 0;
    const unspent = this.getLegacyUnspentEssence();
    const bonuses = this.getLegacyBonuses();
    summary.innerHTML = `
            <div class="inheritance-stat">
                <span class="label">轮回精粹</span>
                <span class="value">${total}</span>
            </div>
            <div class="inheritance-stat">
                <span class="label">可分配</span>
                <span class="value highlight">${unspent}</span>
            </div>
            <div class="inheritance-stat">
                <span class="label">已投入</span>
                <span class="value">${spent}</span>
            </div>
        `;
    const activePresetId = this.legacyProgress?.lastPreset || null;
    const secondaryPresetId = this.legacyProgress?.secondaryPreset || null;
    const presetDefs = this.getLegacyPresetCatalog();
    const activePreset = presetDefs.find(p => p.id === activePresetId);
    const secondaryPreset = presetDefs.find(p => p.id === secondaryPresetId);
    if (note) {
      const presetText = activePreset ? `｜主道统：${activePreset.name}` : '';
      const secText = secondaryPreset ? `｜副道统：${secondaryPreset.name} (50%效能)` : '';
      const mission = this.getLegacyMissionForPreset(activePresetId);
      const missionText = mission ? `｜本轮试炼：${mission.desc}` : '';
      note.textContent = `当前加成：开局HP +${bonuses.startMaxHp}｜开局灵石 +${bonuses.startGold}｜抽牌 +${bonuses.startDraw}｜首回合额外抽牌 +${bonuses.firstTurnDrawBonus}｜锻炉减耗 ${Math.round((bonuses.forgeCostDiscount || 0) * 100)}%${presetText}${secText}${missionText}｜提示：右键可将道统装备为副道统`;
    }
    if (presetsEl) {
      presetsEl.innerHTML = '';
      presetDefs.forEach(preset => {
        const btn = document.createElement('button');
        const isPrimary = activePresetId === preset.id;
        const isSecondary = secondaryPresetId === preset.id;
        let activeClass = '';
        if (isPrimary) activeClass = 'active';
        if (isSecondary) activeClass = 'active secondary';
        btn.className = `inheritance-preset-btn ${activeClass}`;
        btn.innerHTML = `
                    <span class="icon">${preset.icon}</span>
                    <span class="name">${preset.name} ${isPrimary ? '(主)' : isSecondary ? '(副)' : ''}</span>
                    <span class="desc">${preset.desc}</span>
                `;
        btn.onclick = () => {
          this.showConfirmModal(`装备【${preset.name}】为主道统将重配当前传承投入，是否继续？`, () => {
            this.applyLegacyPreset(preset.id, {
              isSecondary: false
            });
            this.initInheritanceScreen();
          });
        };
        btn.oncontextmenu = event => {
          event.preventDefault();
          this.showConfirmModal(`装备【${preset.name}】为副道统（50%效能）将重配当前传承投入，是否继续？`, () => {
            this.applyLegacyPreset(preset.id, {
              isSecondary: true
            });
            this.initInheritanceScreen();
          });
        };
        presetsEl.appendChild(btn);
      });
    }
    grid.innerHTML = '';
    (this.legacyUpgradeCatalog || []).forEach(def => {
      const level = this.getLegacyUpgradeLevel(def.id);
      const canLevel = level < def.maxLevel;
      const nextCost = this.getLegacyUpgradeCost(def.id, level + 1);
      const affordable = canLevel && unspent >= nextCost;
      const card = document.createElement('div');
      card.className = `inheritance-card ${canLevel ? '' : 'maxed'}`;
      card.innerHTML = `
                <div class="inheritance-card-header">
                    <div class="icon">${def.icon}</div>
                    <div class="meta">
                        <div class="name">${def.name}</div>
                        <div class="level">Lv.${level}/${def.maxLevel}</div>
                    </div>
                </div>
                <div class="inheritance-desc">${def.desc}</div>
                <div class="inheritance-card-footer">
                    <span class="cost">${canLevel ? `消耗 ${nextCost}` : '已满级'}</span>
                    <button class="menu-btn small ${affordable ? 'primary' : ''}" ${canLevel ? '' : 'disabled'}>
                        ${canLevel ? '投入精粹' : '已圆满'}
                    </button>
                </div>
            `;
      const btn = card.querySelector('button');
      if (btn && canLevel) {
        if (affordable) {
          btn.onclick = () => {
            if (this.buyLegacyUpgrade(def.id)) {
              this.initInheritanceScreen();
            }
          };
        } else {
          btn.disabled = true;
        }
      }
      grid.appendChild(card);
    });
  }
  tryShowMainMenuGuide() {
    if (!this.guideState || this.guideState.mainMenuIntroSeen) return;
    this.markGuideSeen('mainMenuIntroSeen');
    setTimeout(() => {
      Utils.showBattleLog('新手提示：先点“新的轮回”进入选角，游客模式也可直接开局。', {
        category: 'system',
        duration: 3400
      });
    }, 400);
  }
  showFirstBattleGuide() {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showFirstBattleGuide();
  }

  // 继续游戏
  continueGame() {
    console.log('[Debug] continueGame called');
    // 云功能可用时才强制登录
    if (typeof AuthService === 'undefined') {
      console.error('[Debug] AuthService missing');
      alert('登录系统未就绪，请刷新重试！(AuthService missing)');
      return;
    }
    if (AuthService.isCloudEnabled && AuthService.isCloudEnabled() && !AuthService.isLoggedIn()) {
      console.log('[Debug] Not logged in, showing modal');
      this.showLoginModal();
      return;
    }
    console.log('[Debug] Logged in. loadGameResult:', this.loadGameResult);
    if (this.loadGameResult) {
      console.log('[Debug] Calling showScreen("map-screen")');
      this.showScreen('map-screen');
    } else {
      // 如果加载失败（比如存档被手动删了），刷新页面或提示
      console.warn('[Debug] loadGameResult false, reloading');
      window.location.reload();
    }
  }

  // 绑定全局事件
  bindGlobalEvents() {
    if (this.boundGlobalEvents) return;
    this.boundGlobalEvents = true;

    // ESC关闭模态框
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeModal();
        if (typeof Utils !== 'undefined' && Utils.toggleBattleLogPanel) {
          Utils.toggleBattleLogPanel(false);
        }
        return;
      }
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (this.currentScreen === 'battle-screen' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT' && this.battle && typeof this.battle.handleTacticalAdvisorHotkey === 'function') {
        const consumed = this.battle.handleTacticalAdvisorHotkey(e.key);
        if (consumed) {
          e.preventDefault();
          return;
        }
      }
      if ((e.key === 'l' || e.key === 'L') && typeof Utils !== 'undefined' && Utils.toggleBattleLogPanel) {
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        e.preventDefault();
        Utils.toggleBattleLogPanel();
      }
    });

    // 全局点击音效
    document.addEventListener('click', e => {
      const achievementClaimBtn = e.target.closest('[data-achievement-claim="true"]');
      if (achievementClaimBtn) {
        const achievementId = String(achievementClaimBtn.dataset.achievementId || '');
        if (achievementId) {
          this.claimAchievement(achievementId);
        }
        return;
      }
      const handoffBtn = e.target.closest('[data-season-board-handoff-cta="true"]');
      if (handoffBtn) {
        const sourceKey = String(handoffBtn.dataset.seasonBoardHandoffSourceKey || 'primary');
        this.followRewardSeasonBoardHandoff(sourceKey);
        return;
      }
      const laneRewardBtn = e.target.closest('[data-season-board-lane-reward-claim="true"]');
      if (laneRewardBtn) {
        const claimable = String(laneRewardBtn.dataset.seasonBoardLaneRewardClaimable || 'false') === 'true';
        if (!claimable) return;
        const laneId = String(laneRewardBtn.dataset.seasonBoardLaneRewardLaneId || '');
        this.claimSeasonBoardLaneReward(laneId);
        return;
      }
      // 如果点击的是按钮或包含在按钮内，或者是卡牌、菜单按钮、收藏项、角色卡片、关卡卡片
      if (e.target.closest('button') || e.target.closest('.card') || e.target.closest('.menu-btn') || e.target.closest('.collection-item') || e.target.closest('.character-card') || e.target.closest('.realm-card')) {
        // 如果没有被阻止传播
        if (typeof audioManager !== 'undefined') {
          // 重要按钮播放确认音效
          const targetBtn = e.target.closest('button');
          const targetRealm = e.target.closest('.realm-card');
          if (targetBtn && (targetBtn.id === 'new-game-btn' || targetBtn.id === 'confirm-character-btn' || targetBtn.id === 'end-turn-btn' || targetBtn.id === 'continue-game-btn' || targetBtn.classList.contains('primary')) || targetRealm) {
            audioManager.playSFX('confirm');
          } else {
            // 普通点击
            audioManager.playSFX('click');
          }
        }
      }
    });

    // 点击模态框背景关闭
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          // FIX: 禁止点击没景关闭事件弹窗，防止无限刷经验
          if (modal.id === 'event-modal') return;
          this.closeModal();
        }
      });
    });

    // 牌堆点击
    document.getElementById('deck-pile')?.addEventListener('click', () => {
      this.showDeckModal('draw');
    });
    document.getElementById('discard-pile')?.addEventListener('click', () => {
      this.showDeckModal('discard');
    });
  }

  // 初始化动态背景
  initDynamicBackground() {
    // 如果存在当前背景图，使用图片背景
    this.updateRealmBackground(this.player.realm || 1);
  }

  // 更新天域背景
  updateRealmBackground(realm) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.updateRealmBackground(realm);
  }

  // 保存游戏
  // 保存游戏
  saveGame() {
    if (!this.saveManager) {
      this.saveManager = new SaveManager(this);
    }
    return this.saveManager.saveGame();
  }
  migrateSaveData(rawSave) {
    const migrated = rawSave && typeof rawSave === 'object' ? rawSave : {};
    const buildDefaultEndless = () => {
      if (typeof this.createDefaultEndlessState === 'function') {
        return this.createDefaultEndlessState();
      }
      return {
        unlocked: false,
        active: false,
        currentCycle: 0,
        clearedCycles: 0,
        pressure: 0,
        totalBossDefeated: 0,
        totalEndlessScore: 0,
        activeMutators: [],
        lastMutatorId: null,
        lastPhaseId: null,
        lastThemeId: null,
        phaseHistory: [],
        themeHistory: [],
        boonHistory: [],
        paranoiaLevel: 0,
        activeParanoiaBurdens: [],
        activeParanoiaBoons: [],
        paranoiaHistory: [],
        lastParanoiaCycle: -1,
        boonRarePity: 0,
        boonRareGuaranteedEvery: 3,
        barterHeat: 0,
        seasonId: null,
        seasonWeekTag: '',
        seasonName: '',
        seasonIcon: '',
        lastSeasonDirectiveId: null,
        seasonBestCycle: 0,
        seasonCycleClears: 0,
        seasonBossDefeated: 0,
        seasonScore: 0,
        seasonArchive: {},
        boonStats: {
          rewardGoldMul: 0,
          rewardExpMul: 0,
          shopDiscountMul: 0,
          healMul: 0,
          battleFirstTurnDraw: 0,
          battleOpeningBlock: 0,
          battleFirstTurnEnergy: 0
        }
      };
    };
    const buildDefaultEncounter = () => {
      if (typeof this.createDefaultEncounterState === 'function') {
        return this.createDefaultEncounterState();
      }
      return {
        battles: 0,
        wins: 0,
        currentStreakId: null,
        currentStreak: 0,
        maxStreak: 0,
        recentThemes: [],
        themeStats: {},
        totalBonusGold: 0,
        totalBonusExp: 0
      };
    };
    const buildDefaultChapterLedger = () => {
      if (typeof this.createDefaultChapterEventLedger === 'function') {
        return this.createDefaultChapterEventLedger();
      }
      return {
        version: 1,
        updatedAt: 0,
        entries: [],
        counters: {
          short_gain_long_loss: 0,
          short_loss_long_gain: 0,
          defer: 0,
          other: 0
        },
        tagFrequency: {}
      };
    };
    const buildDefaultSanctumAgendaState = () => {
      if (typeof this.createDefaultSanctumAgendaState === 'function') {
        return this.createDefaultSanctumAgendaState();
      }
      return {
        version: 1,
        activeAgenda: null,
        lastResolved: null,
        history: [],
        totalCompleted: 0,
        totalFailed: 0
      };
    };
    const buildDefaultHeavenlyMandateState = () => {
      if (typeof this.createDefaultHeavenlyMandateState === 'function') {
        return this.createDefaultHeavenlyMandateState();
      }
      return {
        version: 1,
        weekTag: '',
        weekLabel: '',
        themeId: '',
        themeLabel: '',
        themeIcon: '',
        themeKicker: '',
        summaryLine: '',
        lanes: [],
        completedTaskCount: 0,
        totalTaskCount: 0,
        history: [],
        lastSyncedAt: 0
      };
    };
    const buildDefaultSeasonVerificationState = () => {
      if (typeof this.createDefaultSeasonVerificationState === 'function') {
        return this.createDefaultSeasonVerificationState();
      }
      return {
        version: 1,
        history: [],
        lastResolved: null,
        claimedLaneRewards: {}
      };
    };
    const buildDefaultFateAftereffectState = () => {
      if (typeof this.createDefaultFateAftereffectState === 'function') {
        return this.createDefaultFateAftereffectState();
      }
      return {
        version: 1,
        records: [],
        history: [],
        lastResolved: null
      };
    };
    const normalizeLegacy = source => {
      const progress = source && typeof source === 'object' ? source : {};
      const essence = Math.max(0, Math.floor(Number(progress.essence) || 0));
      const spent = Math.max(0, Math.floor(Number(progress.spent) || 0));
      const upgrades = progress.upgrades && typeof progress.upgrades === 'object' ? progress.upgrades : {};
      return {
        essence,
        spent: Math.min(spent, essence),
        upgrades
      };
    };
    if (!migrated.version) {
      migrated.version = '5.0.0';
    }
    const isLegacy = migrated.version < '5.1.0';
    if (isLegacy) {
      migrated.combatMeta = migrated.combatMeta || {
        stance: migrated.player && migrated.player.stance ? migrated.player.stance : 'neutral',
        ruleVersion: 'combat-v2',
        battleUIUpdates: 0
      };
      migrated.pvpMeta = migrated.pvpMeta || {
        ruleVersion: 'pvp-v2',
        lastKnownDivision: null,
        economy: null
      };
      migrated.legacyProgress = normalizeLegacy(migrated.legacyProgress);
      migrated.featureFlags = {
        ...(this.featureFlags || {}),
        ...(migrated.featureFlags || {})
      };
      migrated.endlessMeta = migrated.endlessMeta || buildDefaultEndless();
      migrated.encounterMeta = migrated.encounterMeta || buildDefaultEncounter();
      migrated.sanctumAgendaState = migrated.sanctumAgendaState || buildDefaultSanctumAgendaState();
      migrated.heavenlyMandateState = migrated.heavenlyMandateState || buildDefaultHeavenlyMandateState();
      migrated.seasonVerificationState = migrated.seasonVerificationState || buildDefaultSeasonVerificationState();
      migrated.fateAftereffectState = migrated.fateAftereffectState || buildDefaultFateAftereffectState();
      migrated.chapterEventLedger = migrated.chapterEventLedger || buildDefaultChapterLedger();
      migrated.schemaMigratedAt = Date.now();
      migrated.version = '5.1.0';
    } else {
      migrated.combatMeta = migrated.combatMeta || {};
      migrated.pvpMeta = migrated.pvpMeta || {};
      if (!Object.prototype.hasOwnProperty.call(migrated.pvpMeta, 'economy')) {
        migrated.pvpMeta.economy = null;
      }
      migrated.legacyProgress = normalizeLegacy(migrated.legacyProgress);
      migrated.featureFlags = {
        ...(this.featureFlags || {}),
        ...(migrated.featureFlags || {})
      };
      migrated.endlessMeta = migrated.endlessMeta || buildDefaultEndless();
      migrated.encounterMeta = migrated.encounterMeta || buildDefaultEncounter();
      migrated.sanctumAgendaState = migrated.sanctumAgendaState || buildDefaultSanctumAgendaState();
      migrated.heavenlyMandateState = migrated.heavenlyMandateState || buildDefaultHeavenlyMandateState();
      migrated.seasonVerificationState = migrated.seasonVerificationState || buildDefaultSeasonVerificationState();
      migrated.fateAftereffectState = migrated.fateAftereffectState || buildDefaultFateAftereffectState();
      migrated.chapterEventLedger = migrated.chapterEventLedger || buildDefaultChapterLedger();
      migrated.schemaMigratedAt = migrated.schemaMigratedAt || Date.now();
    }
    if (typeof this.normalizeEndlessState === 'function') {
      migrated.endlessMeta = this.normalizeEndlessState(migrated.endlessMeta);
    }
    if (typeof this.normalizeEncounterState === 'function') {
      migrated.encounterMeta = this.normalizeEncounterState(migrated.encounterMeta);
    }
    if (typeof this.normalizeSanctumAgendaState === 'function') {
      migrated.sanctumAgendaState = this.normalizeSanctumAgendaState(migrated.sanctumAgendaState);
    } else {
      migrated.sanctumAgendaState = migrated.sanctumAgendaState || buildDefaultSanctumAgendaState();
    }
    if (typeof this.normalizeHeavenlyMandateState === 'function') {
      migrated.heavenlyMandateState = this.normalizeHeavenlyMandateState(migrated.heavenlyMandateState);
    } else {
      migrated.heavenlyMandateState = migrated.heavenlyMandateState || buildDefaultHeavenlyMandateState();
    }
    if (typeof this.normalizeSeasonVerificationState === 'function') {
      migrated.seasonVerificationState = this.normalizeSeasonVerificationState(migrated.seasonVerificationState);
    } else {
      migrated.seasonVerificationState = migrated.seasonVerificationState || buildDefaultSeasonVerificationState();
    }
    if (typeof this.normalizeFateAftereffectState === 'function') {
      migrated.fateAftereffectState = this.normalizeFateAftereffectState(migrated.fateAftereffectState);
    } else {
      migrated.fateAftereffectState = migrated.fateAftereffectState || buildDefaultFateAftereffectState();
    }
    if (typeof this.normalizeChapterEventLedger === 'function') {
      migrated.chapterEventLedger = this.normalizeChapterEventLedger(migrated.chapterEventLedger);
    } else {
      migrated.chapterEventLedger = migrated.chapterEventLedger || buildDefaultChapterLedger();
    }
    return migrated;
  }

  // 加载游戏
  loadGame() {
    const savedData = localStorage.getItem('theDefierSave');
    if (!savedData) return false;
    try {
      let gameState = JSON.parse(savedData);
      gameState = this.migrateSaveData(gameState);
      this.legacyProgress = this.normalizeLegacyProgress(gameState.legacyProgress || this.legacyProgress);
      this.saveLegacyProgress();
      this.applyChapterEventLedgerSaveState(gameState.chapterEventLedger);

      // 版本检查
      const currentVersion = '5.1.0';
      if (!gameState.version || gameState.version < '2.2.0') {
        // 兼容2.2.0存档
        console.log('检测到旧版本存档，已清除');
        this.clearSave();
        return false;
      }

      // 检查生命值，如果是0或更低，说明是死亡存档，直接清除
      if (!gameState.player || gameState.player.currentHp <= 0) {
        console.log('检测到死亡存档，已清除');
        this.clearSave();
        return false;
      }

      // 验证牌组数据
      if (!gameState.player.deck || !Array.isArray(gameState.player.deck) || gameState.player.deck.length < 5) {
        console.log('存档牌组数据无效，已清除存档');
        this.clearSave();
        return false;
      }

      // === 兼容性迁移 ===
      // 修复：无欲角色的 'goldenBell' 曾与通用卡牌ID冲突，现更名为 'goldenBellSkill'
      if (gameState.player.characterId === 'wuYu') {
        gameState.player.deck.forEach(card => {
          if (card.id === 'goldenBell') {
            card.id = 'goldenBellSkill';
            console.log('Migration: Renamed Wu Yu goldenBell -> goldenBellSkill');
          }
        });
      }

      // 恢复玩家状态
      Object.assign(this.player, gameState.player);
      // 存档防篡改与边界修正：关键数值统一钳制
      const clampInt = (value, min, max, fallback = min) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.max(min, Math.min(max, Math.floor(num)));
      };
      this.player.maxHp = clampInt(this.player.maxHp, 1, 999999, 100);
      this.player.currentHp = clampInt(this.player.currentHp, 1, this.player.maxHp, this.player.maxHp);
      this.player.maxEnergy = clampInt(this.player.maxEnergy, 1, 99, 3);
      this.player.currentEnergy = clampInt(this.player.currentEnergy, 0, this.player.maxEnergy, this.player.maxEnergy);
      this.player.gold = clampInt(this.player.gold, 0, 999999999, 0);
      this.player.heavenlyInsight = clampInt(this.player.heavenlyInsight, 0, 999, 1);
      this.player.karma = clampInt(this.player.karma, 0, 999, 0);
      this.player.realm = clampInt(this.player.realm, 1, 18, 1);
      this.player.shopRumors = this.normalizeShopRumors(this.player.shopRumors);
      this.player.strategicEngineering = this.normalizeStrategicEngineering(this.player.strategicEngineering);
      if (!this.player.buffs || typeof this.player.buffs !== 'object') this.player.buffs = {};
      if (!Array.isArray(this.player.deck)) this.player.deck = [];
      if (!Array.isArray(this.player.hand)) this.player.hand = [];
      if (!Array.isArray(this.player.drawPile)) this.player.drawPile = [];
      if (!Array.isArray(this.player.discardPile)) this.player.discardPile = [];
      if (typeof this.player.normalizeRunDestiny === 'function') {
        this.player.normalizeRunDestiny(this.player.runDestiny);
      }
      if (typeof this.player.normalizeRunPath === 'function') {
        this.player.normalizeRunPath(this.player.runPath);
        if (!this.player.runPath && typeof this.resolveDefaultRunPathId === 'function' && typeof this.player.setRunPath === 'function') {
          const fallbackPathId = this.resolveDefaultRunPathId(this.player.characterId || 'linFeng');
          if (fallbackPathId) this.player.setRunPath(fallbackPathId);
        }
        if (typeof this.player.ensureRunPathProgress === 'function') {
          this.player.ensureRunPathProgress();
        }
        if (typeof this.player.normalizeRunPathMutationState === 'function') {
          this.player.normalizeRunPathMutationState(this.player.runPathMutationState);
        }
        if (!this.player.runPathBattleState || typeof this.player.runPathBattleState !== 'object') {
          this.player.resetRunPathBattleState?.();
        } else {
          this.player.runPathBattleState = {
            firstAttackBonusUsed: !!this.player.runPathBattleState.firstAttackBonusUsed,
            firstSkillDrawUsedThisTurn: !!this.player.runPathBattleState.firstSkillDrawUsedThisTurn
          };
        }
      }
      if (typeof this.player.normalizeRunVows === 'function') {
        this.player.normalizeRunVows(this.player.runVows);
      }
      if (typeof this.player.normalizeSpiritCompanion === 'function') {
        this.player.normalizeSpiritCompanion(this.player.spiritCompanion);
      }
      if (typeof this.player.ensureSpiritCompanionBattleState === 'function') {
        this.player.ensureSpiritCompanionBattleState();
      }
      if (!this.player.legacyBonuses || typeof this.player.legacyBonuses !== 'object') {
        this.player.legacyBonuses = {
          startMaxHp: 0,
          startGold: 0,
          startDraw: 0,
          firstTurnDrawBonus: 0,
          forgeCostDiscount: 0
        };
      }
      if (!this.player.legacyRunDoctrine || typeof this.player.legacyRunDoctrine !== 'object') {
        this.applyLegacyRunDoctrine(this.player, this.legacyProgress?.lastPreset || null, this.legacyProgress?.secondaryPreset || null);
      } else {
        this.applyLegacyRunDoctrine(this.player, this.player.legacyRunDoctrine.presetId || this.legacyProgress?.lastPreset || null, this.legacyProgress?.secondaryPreset || null);
        const normalizedDoctrine = this.player.legacyRunDoctrine || {};
        const mergedDoctrine = {
          ...normalizedDoctrine,
          ...this.player.legacyRunDoctrine,
          firstForgeBoostUsed: !!this.player.legacyRunDoctrine.firstForgeBoostUsed
        };
        mergedDoctrine.entropyLegacyProcEnabled = !!mergedDoctrine.entropyLegacyProcEnabled;
        mergedDoctrine.entropyProcUsedThisTurn = !!mergedDoctrine.entropyProcUsedThisTurn;
        mergedDoctrine.entropyBonusEnergyUsed = !!mergedDoctrine.entropyBonusEnergyUsed;
        mergedDoctrine.entropyLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.entropyLegacyDraw) || 0));
        mergedDoctrine.entropyLegacyDiscardDamage = Math.max(0, Math.floor(Number(mergedDoctrine.entropyLegacyDiscardDamage) || 0));
        mergedDoctrine.entropyBonusEnergyOnce = Math.max(0, Math.floor(Number(mergedDoctrine.entropyBonusEnergyOnce) || 0));
        mergedDoctrine.bulwarkLegacyProcEnabled = !!mergedDoctrine.bulwarkLegacyProcEnabled;
        mergedDoctrine.bulwarkProcUsedThisTurn = !!mergedDoctrine.bulwarkProcUsedThisTurn;
        mergedDoctrine.bulwarkLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.bulwarkLegacyDraw) || 0));
        mergedDoctrine.bulwarkLegacyCounterDamage = Math.max(0, Math.floor(Number(mergedDoctrine.bulwarkLegacyCounterDamage) || 0));
        mergedDoctrine.stormcraftLegacyProcEnabled = !!mergedDoctrine.stormcraftLegacyProcEnabled;
        mergedDoctrine.stormcraftProcUsedThisTurn = !!mergedDoctrine.stormcraftProcUsedThisTurn;
        mergedDoctrine.stormcraftLegacyBonusDamage = Math.max(0, Math.floor(Number(mergedDoctrine.stormcraftLegacyBonusDamage) || 0));
        mergedDoctrine.stormcraftLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.stormcraftLegacyDraw) || 0));
        mergedDoctrine.vitalweaveLegacyProcEnabled = !!mergedDoctrine.vitalweaveLegacyProcEnabled;
        mergedDoctrine.vitalweaveProcUsedThisTurn = !!mergedDoctrine.vitalweaveProcUsedThisTurn;
        mergedDoctrine.vitalweaveLegacyBlockRatio = Math.max(0, Math.min(2, Number(mergedDoctrine.vitalweaveLegacyBlockRatio) || 0));
        mergedDoctrine.vitalweaveLegacyBurstDamage = Math.max(0, Math.floor(Number(mergedDoctrine.vitalweaveLegacyBurstDamage) || 0));
        mergedDoctrine.vitalweaveLegacyDraw = Math.max(0, Math.floor(Number(mergedDoctrine.vitalweaveLegacyDraw) || 0));
        this.player.legacyRunDoctrine = mergedDoctrine;
      }
      if (!this.player.legacyRunMission || typeof this.player.legacyRunMission !== 'object') {
        this.applyLegacyRunMission(this.player, this.player.legacyRunDoctrine?.presetId || this.legacyProgress?.lastPreset || null);
      } else {
        const normalizedMission = this.getLegacyMissionForPreset(this.player.legacyRunMission.presetId || this.player.legacyRunDoctrine?.presetId || this.legacyProgress?.lastPreset || null);
        if (normalizedMission) {
          this.player.legacyRunMission = {
            ...normalizedMission,
            ...this.player.legacyRunMission,
            progress: Math.max(0, Math.min(normalizedMission.target, Number(this.player.legacyRunMission.progress) || 0)),
            completed: !!this.player.legacyRunMission.completed,
            rewardGranted: !!this.player.legacyRunMission.rewardGranted
          };
        } else {
          this.player.legacyRunMission = null;
        }
      }

      // 重新计算属性，确保版本更新后的加成生效
      // 并且防止旧存档中可能存在的错误叠加
      if (this.player.recalculateStats) {
        this.player.recalculateStats();
      }

      // 兼容性修复：确保法宝列表已初始化
      if (!this.player.treasures) {
        this.player.treasures = [];
      }
      if (!this.player.collectedLaws) {
        this.player.collectedLaws = [];
      } else {
        this.player.collectedLaws = this.player.collectedLaws.filter(Boolean);
      }

      // 数据修复
      if (isNaN(this.player.gold)) {
        this.player.gold = 100;
      }
      if (isNaN(this.player.currentHp) || this.player.currentHp <= 0) {
        this.player.currentHp = Math.floor(this.player.maxHp * 0.5);
      }

      // 恢复命环对象引用
      if (gameState.player.fateRing) {
        // Determine class based on type or character
        let RingClass = FateRing;
        if (gameState.player.fateRing.type === 'mutated') RingClass = MutatedRing;

        // ... logic handled by assign generally, but methods are lost.
        // ideally we re-instantiate, but for now assuming data structure is enough
        // as methods are on prototype. 
        // Wait, assign doesn't restore prototype. 
        // Currently code relies on this.player having methods, and we assign properties TO it.
        // So prototype methods are safe.

        // === 关键修复：数据解压与重建 (Rehydration) ===

        // 1. 重建卡牌 (Deck, Hand, Draw, Discard)
        const rebuildCard = savedCard => {
          if (!savedCard || typeof savedCard !== 'object') return null;
          const cardId = typeof savedCard.id === 'string' ? savedCard.id : null;
          const baseCard = cardId ? CARDS[cardId] : null;
          if (!baseCard) {
            console.warn('Dropped unknown card from save:', savedCard.id);
            return null;
          }
          const deepClone = value => JSON.parse(JSON.stringify(value));
          let card = deepClone(baseCard);
          const upgraded = !!savedCard.upgraded;
          if (upgraded) {
            if (typeof Utils.upgradeCard === 'function') {
              card = Utils.upgradeCard(deepClone(baseCard));
            } else if (typeof upgradeCard === 'function') {
              card = upgradeCard(deepClone(baseCard));
            } else {
              card.upgraded = true;
            }
          }

          // 仅恢复运行时安全字段，避免被存档注入任意卡牌数据
          if (savedCard.instanceId !== undefined && savedCard.instanceId !== null) {
            card.instanceId = savedCard.instanceId;
          }
          if (savedCard.retain === true) card.retain = true;
          if (savedCard.exhaust === true) card.exhaust = true;
          if (savedCard.isTemp === true) card.isTemp = true;
          if (savedCard.ethereal === true) card.ethereal = true;
          const safeCost = Number(savedCard.cost);
          if (Number.isFinite(safeCost)) {
            card.cost = Math.max(0, Math.min(10, Math.floor(safeCost)));
          }
          const safeBaseCost = Number(savedCard.baseCost);
          if (Number.isFinite(safeBaseCost)) {
            card.baseCost = Math.max(0, Math.min(10, Math.floor(safeBaseCost)));
          }
          if (card.instanceId === undefined || card.instanceId === null) {
            card.instanceId = this.player.generateCardId ? this.player.generateCardId() : `${card.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          }
          return card;
        };
        const hydrateCards = list => {
          if (!Array.isArray(list)) return [];
          return list.map(rebuildCard).filter(Boolean);
        };
        this.player.deck = hydrateCards(this.player.deck);
        this.player.hand = hydrateCards(this.player.hand);
        this.player.drawPile = hydrateCards(this.player.drawPile);
        this.player.discardPile = hydrateCards(this.player.discardPile);
        if (this.player.deck.length < 5) {
          throw new Error('存档卡组校验失败：有效卡牌不足');
        }

        // 2. 重建法宝
        if (this.player.treasures) {
          this.player.treasures = this.player.treasures.map(t => {
            if (t.name) return t; // Old format
            const baseT = TREASURES[t.id];
            if (!baseT) return t;
            return {
              ...baseT,
              ...t
            };
          });
        }

        // 3. 重建法则
        if (this.player.collectedLaws) {
          this.player.collectedLaws = this.player.collectedLaws.map(l => {
            if (l.name) return l; // Old format
            const baseL = LAWS[l.id];
            return baseL || l;
          });
        }
        if (gameState.player.fateRing.type === 'sealed') RingClass = SealedRing;
        if (gameState.player.fateRing.type === 'karma') RingClass = KarmaRing;
        if (gameState.player.fateRing.type === 'analysis') RingClass = AnalysisRing;

        // Migration: Fix permBuffs typo from old saves
        if (gameState.player.permBuffs && !gameState.player.permaBuffs) {
          this.player.permaBuffs = gameState.player.permBuffs;
        }

        // Re-instantiate
        this.player.fateRing = new RingClass(this.player);
        this.player.fateRing.loadFromJSON(gameState.player.fateRing);

        // Check level up or initialization
        if (this.player.fateRing.checkLevelUp) {
          this.player.fateRing.checkLevelUp();
        }

        // === 4. 重建法宝系统 (New System) ===
        // 初始化数组
        this.player.collectedTreasures = [];
        this.player.equippedTreasures = [];

        // 恢复收集库 (Collected)
        const hydrateTreasure = savedT => {
          const baseT = TREASURES[savedT.id];
          if (!baseT) {
            console.warn('Unknown treasure:', savedT.id);
            return savedT; // 未知法宝，保留原样
          }
          // 基础数据优先，只保留存档中的运行时数据
          return {
            ...baseT,
            // 基础定义（icon, name, description, callbacks等）
            id: savedT.id,
            obtainedAt: savedT.obtainedAt || Date.now(),
            data: savedT.data || (baseT.data ? {
              ...baseT.data
            } : {})
          };
        };
        if (gameState.player.collectedTreasures) {
          const hydrated = gameState.player.collectedTreasures.map(hydrateTreasure);
          // 去重：保留最后获得的或者是第一个？应该根据ID去重
          const uniqueMap = new Map();
          hydrated.forEach(t => {
            if (!uniqueMap.has(t.id)) {
              uniqueMap.set(t.id, t);
            } else {
              // 如果已存在，可以检查是否需要合并数据的逻辑，但目前法宝没有复杂数据
              // 简单的保留第一个即可
              console.log(`Removed duplicate treasure: ${t.id}`);
            }
          });
          this.player.collectedTreasures = Array.from(uniqueMap.values());
        } else if (gameState.player.treasures) {
          // 兼容旧存档：旧treasures视为"已收集且已装备"
          const hydrated = gameState.player.treasures.map(hydrateTreasure);
          // 同样去重
          const uniqueMap = new Map();
          hydrated.forEach(t => {
            if (!uniqueMap.has(t.id)) uniqueMap.set(t.id, t);
          });
          this.player.collectedTreasures = Array.from(uniqueMap.values());
        }

        // 恢复已装备 (Equipped)
        if (gameState.player.equippedTreasures) {
          // 新存档: 存储的是ID列表
          const uniqueEquippedIds = new Set(gameState.player.equippedTreasures);
          uniqueEquippedIds.forEach(tid => {
            // 兼容性：如果碰巧存的是对象（极其罕见），尝试取id
            const id = typeof tid === 'object' && tid.id ? tid.id : tid;
            const t = this.player.collectedTreasures.find(ct => ct.id === id);
            if (t) this.player.equippedTreasures.push(t);
          });
        } else if (gameState.player.treasures) {
          // 兼容旧存档：将所有法宝放入收集库，只装备前N个
          this.player.equippedTreasures = [...this.player.collectedTreasures];
        }

        // 修复：确保装备数量不超过槽位上限
        const maxSlots = this.player.getMaxTreasureSlots();
        if (this.player.equippedTreasures.length > maxSlots) {
          console.log(`载入存档：装备法宝超限 (${this.player.equippedTreasures.length}/${maxSlots})，已自动调整`);
          // 超出部分移回仓库（仍在 collectedTreasures 中，只是不在 equippedTreasures 中）
          this.player.equippedTreasures = this.player.equippedTreasures.slice(0, maxSlots);
        }

        // Sync references
        this.player.treasures = this.player.equippedTreasures;

        // Fix: Robust Max Realm Logic - Prevent Regression
        const savedMax = gameState.player.maxRealmReached || 1;
        const derivedMax = Math.max(...(gameState.unlockedRealms || [1]), 1);
        // Always take the HIGHER value to prevent progress loss
        this.player.maxRealmReached = Math.max(savedMax, derivedMax, this.player.maxRealmReached || 1);
      }

      // Retroactive Skill Unlock (Fix for existing saves)
      // 确保旧存档中通过了天劫的玩家能解锁对应技能
      if (this.player.realm >= 5) this.player.unlockUltimate(1);
      if (this.player.realm >= 10) this.player.unlockUltimate(2);
      if (this.player.realm >= 15) this.player.unlockUltimate(3);
      if (this.player.realm >= 18) this.player.unlockUltimate(4);

      // Fix: Global Force Sync for Card Data Persistence
      // 强制同步卡牌数据：使用最新代码中的数值覆盖存档中的旧数据，解决旧存档数值不更新的问题
      if (this.player.deck) {
        this.player.deck = this.player.deck.map(savedCard => {
          // 在最新卡牌库中查找定义
          // 如果是初始数据中不存在的卡牌（生成的？），CARDS中可能找不到
          const originalDef = CARDS[savedCard.id];

          // 如果找不到（可能是移除的卡牌或特殊卡牌），则保持原样
          if (!originalDef) return savedCard;

          // 创建新副本
          let newCard = JSON.parse(JSON.stringify(originalDef));

          // 恢复状态: 升级
          if (savedCard.upgraded) {
            try {
              // 重新执行升级逻辑，获取最新数值
              if (typeof Utils.upgradeCard === 'function') {
                newCard = Utils.upgradeCard(newCard);
              } else if (typeof upgradeCard === 'function') {
                newCard = upgradeCard(newCard);
              } else {
                newCard.upgraded = true;
              }
            } catch (e) {
              console.warn(`Card upgrade sync failed for ${savedCard.name}:`, e);
              return savedCard; // 出错则回退
            }
          }

          // 理论上如果后续有其他动态属性（如“临时卡牌”标记等），应在此处合并
          // 目前主要关注静态数值和升级状态

          return newCard;
        });
      }

      // 恢复地图状态
      this.map.nodes = gameState.map.nodes;
      this.map.currentNodeIndex = gameState.map.currentNodeIndex;
      this.map.completedNodes = gameState.map.completedNodes;

      // 恢复当前的存档位索引 (修复刷新后无法同步到正确槽位的问题)
      if (this.currentSaveSlot === null && gameState.saveSlot !== undefined) {
        this.currentSaveSlot = gameState.saveSlot;
        console.log(`Recovered Save Slot ID from save file: ${this.currentSaveSlot}`);
        // Re-persist for session
        sessionStorage.setItem('currentSaveSlot', this.currentSaveSlot);
        localStorage.setItem('lastSaveSlot', this.currentSaveSlot);
      }
      this.unlockedRealms = gameState.unlockedRealms || [1];

      // 恢复界面：如果是战斗或奖励界面，因为临时数据未保存，强制回退到地图
      let savedScreen = gameState.currentScreen || 'map-screen';
      if (['battle-screen', 'reward-screen', 'game-over-screen'].includes(savedScreen)) {
        savedScreen = 'map-screen';
      }
      this.savedScreen = savedScreen;
      if (gameState.combatMeta && gameState.combatMeta.stance) {
        this.player.stance = gameState.combatMeta.stance;
      } else {
        this.player.stance = this.player.stance || 'neutral';
      }
      if (gameState.pvpMeta && gameState.pvpMeta.economy && typeof PVPService !== 'undefined' && PVPService && typeof PVPService.setEconomySnapshot === 'function') {
        PVPService.setEconomySnapshot(gameState.pvpMeta.economy);
      }
      this.featureFlags = {
        ...this.featureFlags,
        ...(gameState.featureFlags || {})
      };
      this.endlessState = this.normalizeEndlessState(gameState.endlessMeta || this.endlessState);
      this.encounterState = this.normalizeEncounterState(gameState.encounterMeta || this.encounterState);
      this.sanctumAgendaState = this.normalizeSanctumAgendaState(gameState.sanctumAgendaState || this.sanctumAgendaState);
      this.heavenlyMandateState = this.normalizeHeavenlyMandateState(gameState.heavenlyMandateState || this.heavenlyMandateState);
      this.seasonVerificationState = this.normalizeSeasonVerificationState(gameState.seasonVerificationState || this.seasonVerificationState);
      this.fateAftereffectState = this.normalizeFateAftereffectState(gameState.fateAftereffectState || this.fateAftereffectState);
      if (this.player && typeof this.player.ensureAdventureBuffs === 'function') {
        this.player.ensureAdventureBuffs();
      }
      console.log('游戏已加载');
      return true;
    } catch (e) {
      console.error('加载存档失败:', e);
      this.clearSave();
      return false;
    }
  }

  // 清除存档
  clearSave(options = {}) {
    if (this.automationBootConfig) return;
    const preserveSeasonMeta = !!(options && options.preserveSeasonMeta);
    localStorage.removeItem('theDefierSave');
    if (preserveSeasonMeta) return;
    this.sanctumAgendaState = this.createDefaultSanctumAgendaState();
    this.heavenlyMandateState = this.createDefaultHeavenlyMandateState();
    this.seasonVerificationState = this.createDefaultSeasonVerificationState();
    this.fateAftereffectState = this.createDefaultFateAftereffectState();
  }

  // 自动保存
  autoSave() {
    if (this.automationBootConfig) return;
    this.saveGame();
  }
  showCollection() {
    if (!this.inventoryView) this.inventoryView = new InventoryView(this);
    this.inventoryView.showCollection();
  }
  showChallengeHub(tab = 'daily') {
    const safeTab = ['daily', 'weekly', 'global'].includes(tab) ? tab : 'daily';
    if (this.challengeHub && typeof this.challengeHub.showChallengeHub === 'function') {
      return Promise.resolve(this.challengeHub.showChallengeHub(safeTab));
    }
    // Preserve immediate route/tab observability while the hub module loads lazily.
    this.challengeHubState = this.challengeHubState && typeof this.challengeHubState === 'object'
      ? {
          ...this.challengeHubState,
          tab: safeTab
        }
      : {
          tab: safeTab
        };
    this.showScreen('challenge-screen');
    return this.ensureChallengeHubLoaded().then(hub => {
      if (hub && typeof hub.showChallengeHub === 'function') {
        hub.showChallengeHub(safeTab);
      }
      return hub;
    });
  }
  initChallengeHub() {
    if (this.challengeHub && typeof this.challengeHub.initChallengeHub === 'function') {
      return Promise.resolve(this.challengeHub.initChallengeHub());
    }
    return this.ensureChallengeHubLoaded().then(hub => {
      if (hub && typeof hub.initChallengeHub === 'function') {
        hub.initChallengeHub();
      }
      return hub;
    });
  }
  renderExpeditionMapPanels() {
    if (this.expeditionHub && typeof this.expeditionHub.renderExpeditionMapPanels === 'function') {
      return this.expeditionHub.renderExpeditionMapPanels();
    }
    return undefined;
  }

  // 初始化图鉴

  getLawElementLabel(element) {
    const map = {
      thunder: '雷',
      fire: '火',
      sword: '剑',
      space: '空间',
      time: '时间',
      void: '虚空',
      chaos: '混沌',
      blood: '血',
      earth: '土',
      wind: '风',
      ice: '冰',
      life: '生命',
      metal: '金',
      karma: '因果',
      reversal: '逆转',
      wood: '木'
    };
    return map[element] || element || '未知';
  }
  getLawRarityText(rarity) {
    const map = {
      common: '凡品法则',
      rare: '灵品法则',
      epic: '神品法则',
      legendary: '仙品法则',
      mythic: '无上法则'
    };
    return map[rarity] || '未知品级';
  }
  getLawSource(law) {
    const rarity = law?.rarity || 'rare';
    switch (rarity) {
      case 'common':
        return '战斗结算中的法则盗取 · 低阶试炼敌人残响';
      case 'rare':
        return '战斗结算中的法则盗取 · 精英敌人与遭遇词缀更易携带';
      case 'epic':
        return '高阶战斗结算中的法则盗取 · 精英/Boss 残响更容易显化';
      case 'legendary':
      case 'mythic':
        return '高压战局中的法则盗取 · 需围绕强敌或特殊轮段反复尝试';
      default:
        return '战斗结算中的法则盗取';
    }
  }
  getLawRelatedResonances(law) {
    if (!law || typeof LAW_RESONANCES === 'undefined' || !LAW_RESONANCES) return [];
    return Object.values(LAW_RESONANCES).filter(resonance => Array.isArray(resonance.laws) && resonance.laws.includes(law.id));
  }
  getLawResonanceAvailability(law) {
    const relatedResonances = this.getLawRelatedResonances(law);
    const collectedIds = new Set(Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.map(entry => entry?.id).filter(Boolean) : []);
    const socketedIds = new Set(this.player?.fateRing && typeof this.player.fateRing.getSocketedLaws === 'function' ? this.player.fateRing.getSocketedLaws().filter(Boolean) : []);
    return relatedResonances.map(resonance => {
      const requiredLaws = Array.isArray(resonance?.laws) ? resonance.laws.filter(Boolean) : [];
      const missingCollected = requiredLaws.filter(lawId => !collectedIds.has(lawId));
      const missingSocketed = requiredLaws.filter(lawId => !socketedIds.has(lawId));
      let state = 'locked';
      let label = '未成型';
      let detail = '当前尚未收齐共鸣所需法则。';
      if (missingSocketed.length === 0 && requiredLaws.length > 0) {
        state = 'active';
        label = '已激活';
        detail = '当前命环已装配完整组件，可直接享受这条共鸣。';
      } else if (missingCollected.length === 0 && requiredLaws.length > 0) {
        state = 'ready';
        label = '待装配';
        detail = missingSocketed.length === 1 ? '已收齐共鸣组件，只差 1 枚法则装入命环。' : `已收齐共鸣组件，仍有 ${missingSocketed.length} 枚法则未装入命环。`;
      } else if (missingCollected.length === 1) {
        state = 'near';
        label = '差 1 枚';
        detail = `只差 ${LAWS?.[missingCollected[0]]?.name || missingCollected[0]}，即可形成完整共鸣。`;
      } else if (missingCollected.length > 1) {
        label = `差 ${missingCollected.length} 枚`;
        detail = `仍需补齐 ${missingCollected.map(lawId => LAWS?.[lawId]?.name || lawId).join('、')}。`;
      }
      return {
        resonance,
        requiredLaws,
        missingCollected,
        missingSocketed,
        state,
        label,
        detail
      };
    });
  }
  getLawReadinessActions(entry) {
    if (!entry || !entry.resonance) return [];
    const actions = [];
    if (entry.state === 'active' || entry.state === 'ready') {
      actions.push({
        type: 'ring',
        resonanceId: entry.resonance.id,
        label: entry.state === 'active' ? '定位命环共鸣' : '前往命环装配'
      });
    }
    entry.missingCollected.forEach(lawId => {
      actions.push({
        type: 'law',
        lawId,
        label: `查看${LAWS?.[lawId]?.name || lawId}`
      });
    });
    return actions;
  }
  handleLawReadinessAction(actionType, resonanceId = '', lawId = '') {
    if (actionType === 'law' && lawId && typeof LAWS !== 'undefined' && LAWS?.[lawId]) {
      const law = LAWS[lawId];
      const collected = Array.isArray(this.player?.collectedLaws) ? this.player.collectedLaws.some(entry => entry?.id === lawId) : false;
      this.showLawDetail(law, collected);
      return;
    }
    if (actionType === 'ring' && resonanceId) {
      this.closeModal();
      this.showFateRing();
      this.focusRingResonance(resonanceId);
    }
  }
  getLawById(lawId = '') {
    const safeLawId = String(lawId || '').trim();
    if (!safeLawId || typeof LAWS === 'undefined' || !LAWS?.[safeLawId]) return null;
    return LAWS[safeLawId];
  }
  getLawResonanceById(resonanceId = '') {
    const safeResonanceId = String(resonanceId || '').trim();
    if (!safeResonanceId || typeof LAW_RESONANCES === 'undefined' || !LAW_RESONANCES?.[safeResonanceId]) return null;
    return LAW_RESONANCES[safeResonanceId];
  }
  focusRingResonance(resonanceId = '') {
    if (!resonanceId || typeof LAW_RESONANCES === 'undefined' || !LAW_RESONANCES?.[resonanceId]) return false;
    const resonance = LAW_RESONANCES[resonanceId];
    const modal = document.getElementById('ring-modal');
    if (!modal) return false;
    const resonanceTab = modal.querySelector('.panel-tabs .tab:nth-child(2)');
    if (resonanceTab) {
      this.switchRingTab(resonanceTab, 'resonance');
    }
    document.querySelectorAll('.resonance-card.focus-target').forEach(card => card.classList.remove('focus-target'));
    const targetCard = document.querySelector(`.resonance-card[data-resonance-id="${resonanceId}"]`);
    if (targetCard) {
      targetCard.classList.add('focus-target');
      targetCard.scrollIntoView({
        block: 'center',
        behavior: 'auto'
      });
    }
    document.querySelectorAll('.ring-slot-3d.focus-target, .law-item-row.focus-target').forEach(el => el.classList.remove('focus-target'));
    const ring = this.player?.fateRing;
    if (!ring || !Array.isArray(ring.slots)) return true;
    const socketed = typeof ring.getSocketedLaws === 'function' ? ring.getSocketedLaws() : [];
    const missingSocketed = (resonance.laws || []).filter(lawId => !socketed.includes(lawId));
    let targetSlotIndex = -1;
    if (missingSocketed.length > 0) {
      targetSlotIndex = ring.slots.findIndex(slot => slot?.unlocked && !slot?.law);
    }
    if (targetSlotIndex === -1) {
      targetSlotIndex = ring.slots.findIndex(slot => resonance.laws.includes(slot?.law));
    }
    if (targetSlotIndex >= 0) {
      this.selectedRingSlot = targetSlotIndex;
      this.updateUIState(ring);
      const slotEl = document.getElementById(`ring-slot-${targetSlotIndex}`);
      if (slotEl) {
        slotEl.classList.add('focus-target');
        slotEl.scrollIntoView({
          block: 'center',
          behavior: 'auto'
        });
      }
    }
    return true;
  }
  showLawDetail(law, isCollected = false) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.showLawDetail(law, isCollected);
  }
  buildPlayerDeckProfile() {
    const deck = Array.isArray(this.player?.deck) ? this.player.deck : [];
    const counts = {
      attack: 0,
      defense: 0,
      law: 0,
      chance: 0,
      energy: 0,
      other: 0
    };
    const lawTypeCounts = {};
    let totalCost = 0;
    deck.forEach(card => {
      const type = counts[card?.type] !== undefined ? card.type : 'other';
      counts[type] += 1;
      totalCost += Number(card?.cost) || 0;
      if (card?.lawType) lawTypeCounts[card.lawType] = (lawTypeCounts[card.lawType] || 0) + 1;
    });
    const dominantType = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
    const dominantLawType = Object.entries(lawTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return {
      size: deck.length,
      counts,
      lawTypeCounts,
      dominantType,
      dominantLawType,
      avgCost: deck.length > 0 ? totalCost / deck.length : 0,
      ratio(type) {
        return deck.length > 0 ? (counts[type] || 0) / deck.length : 0;
      }
    };
  }
  evaluateShopCardDeckFit(card) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.evaluateShopCardDeckFit(card);
  }
  evaluateShopServiceFit(service) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.evaluateShopServiceFit(service);
  }
  getMapNodeTypeLabel(type = '') {
    const map = {
      enemy: '普通战',
      elite: '精英战',
      boss: 'Boss 战',
      rest: '营地',
      event: '事件',
      shop: '商店',
      trial: '试炼碑',
      forge: '炼器坊',
      ghost_duel: '幻影决斗'
    };
    return map[type] || type || '未知节点';
  }
  getShopNextNodeForecast() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.getShopNextNodeForecast();
  }
  getShopEconomyOutlook() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.getShopEconomyOutlook();
  }
  buildShopSpendRecommendation() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.buildShopSpendRecommendation();
  }
  // 辅助：格式化共鸣效果描述
  formattingResonanceEffect(effect) {
    if (!effect) return '';
    const terms = {
      'burn': '灼烧',
      'weak': '虚弱',
      'vulnerable': '易伤',
      'poison': '中毒',
      'stun': '眩晕',
      'freeze': '冰冻',
      'slow': '减速',
      'random': '随机效果',
      'thunder': '雷',
      'fire': '火',
      'ice': '冰',
      'wind': '风',
      'earth': '土',
      'costReduce': '减费',
      'draw': '抽牌'
    };
    const t = k => terms[k] || k;
    switch (effect.type) {
      case 'damageBoostVsDebuff':
        return `对[${t(effect.debuff)}]敌人伤害+${Math.floor(effect.percent * 100)}%`;
      case 'dodgeDraw':
        return `闪避时抽${effect.value}张牌`;
      case 'stunDebuff':
        return `眩晕时施加${effect.value}层${t(effect.buffType)}`;
      case 'shieldHeal':
        return `回合结束若有护盾，恢复护盾值${Math.floor(effect.percent * 100)}%的生命`;
      case 'penetrateBonus':
        return `穿透伤害+${Math.floor(effect.percent * 100)}%`;
      case 'shuffleDamage':
        return `洗牌造成${effect.value}伤害+${t(effect.debuff)}`;
      case 'elementalReaction':
        return `${t(effect.trigger)}伤触发${Math.floor(effect.damagePercent * 100)}%生命爆炸`;
      case 'cardPlayTrigger':
        return `每${effect.count}张牌触发${effect.damage}点${t(effect.element)}伤`;
      case 'turnStartGamble':
        return `回合开始：50%几率随机3张牌耗能-1，或抽2张牌`;
      case 'healOverlowDamage':
        return `溢出治疗转伤害 (+${Math.floor(effect.healBonus * 100)}%治疗)`;
      case 'resurrect':
        return `死亡复活 (${Math.floor(effect.percent * 100)}%血)`;
      case 'persistentBlock':
        return `护盾不消失`;
      case 'penetrateParalysis':
        return `穿透施加${effect.value}层麻痹`;
      default:
        return '特殊效果';
    }
  }

  // 初始化成就界面
  initAchievements() {
    const container = document.getElementById('achievements-container');
    if (!container) return;
    container.innerHTML = '';
    const achievements = this.achievementSystem.getAchievementsList();
    const categories = {};

    // 按分类分组
    for (const achievement of achievements) {
      const cat = achievement.category;
      if (!categories[cat]) {
        categories[cat] = [];
      }
      categories[cat].push(achievement);
    }

    // 1. 渲染进度部分 (Cultivation Progress)
    const progress = this.achievementSystem.getProgress();
    const progressPercent = Math.floor(progress.completed / progress.total * 100);
    const progressSection = document.createElement('div');
    progressSection.className = 'achievements-header-stats';
    progressSection.innerHTML = `
            <div class="achievement-progress-card">
                <div class="progress-label">修行进度</div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="progress-text">${progressPercent}%</div>
            </div>
        `;
    container.appendChild(progressSection);

    // 2. 渲染每个分类
    for (const catId in categories) {
      const catInfo = ACHIEVEMENT_CATEGORIES[catId];
      const catAchievements = categories[catId];
      const catEl = document.createElement('div');
      catEl.className = 'achievement-category';
      catEl.innerHTML = `
                <div class="category-header">
                    <h3>${catInfo.icon} ${catInfo.name}</h3>
                    <div class="ink-decoration"></div>
                </div>
                <div class="achievement-grid">
                    ${catAchievements.map(a => {
        const statusClass = a.unlocked ? 'unlocked' : 'locked';
        const rewardText = getAchievementRewardText(a);

        // Condition Met but Reward Not Claimed
        const canClaim = a.unlocked && !a.claimed;
        const isClaimed = a.claimed;
        let actionHtml = '';
        if (canClaim) {
          actionHtml = `
                                <button class="claim-btn pulse" data-achievement-claim="true" data-achievement-id="${a.id}">
                                    <span class="btn-text">领取奖励</span>
                                </button>
                            `;
        } else if (isClaimed) {
          actionHtml = `<div class="claimed-badge">已领取</div>`;
        }
        return `
                        <div class="achievement-card ${statusClass} ${isClaimed ? 'claimed' : ''}">
                            ${isClaimed ? '<div class="achievement-status-icon">✓</div>' : ''}
                            <div class="achievement-icon-wrapper">
                                ${a.icon}
                            </div>
                            <div class="achievement-content">
                                <div class="achievement-title">${a.name}</div>
                                <div class="achievement-desc">${a.description}</div>
                                ${a.unlocked ? `<div class="achievement-reward-tag">${rewardText}</div>` : ''}
                                ${actionHtml}
                            </div>
                        </div>
                        `;
      }).join('')}
                </div>
            `;
      container.appendChild(catEl);
    }
  }

  // Claim Achievement Wrapper
  claimAchievement(id) {
    const result = this.achievementSystem.claimReward(id);
    if (result.success) {
      // Re-render UI to show "Claimed" status
      this.initAchievements();
      // Optional: Play Sound
      // this.audio.play('success');

      // Show toast or something?
      // The AchievementSystem already queues a popup for "Claimed" if we want,
      // or we can implement a specific visual here.
      this.achievementSystem.queuePopup(ACHIEVEMENTS[id], 'claimed');
    } else {
      console.warn('Cannot claim:', result.reason);
    }
  }

  // 显示成就界面
  showAchievements() {
    this.initAchievements();
    this.showScreen('achievements-screen');
  }

  // 渲染法宝
  renderTreasures(containerId = 'map-treasures') {
    if (!this.hudView) this.hudView = new HUDView(this);
    return this.hudView.renderTreasures(containerId);
  }

  // 初始化关卡选择界面 (Refactored for Ink & Gold UI)
  // 初始化关卡选择界面 (Refactored for Ink & Gold UI - Spirit Tablets)
  initRealmSelect() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.initRealmSelect();
  }

  // 选择天域
  selectRealm(realmId) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.selectRealm(realmId);
  }

  // 更新预览面板 (Cloud Mirror)
  updateRealmPreview(realmId) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.updateRealmPreview(realmId);
  }

  // 获取天域Boss信息
  getRealmBossInfo(realm) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.getRealmBossInfo(realm);
  }

  // 开始指定关卡
  startRealm(realmLevel, isReplay = false) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.startRealm(realmLevel, isReplay);
  }

  // 显示界面
  resetScreenScrollPosition(screen) {
    if (!screen) return;
    const scrollTargets = [screen, ...Array.from(screen.querySelectorAll(['.map-scroll-container', '.codex-scroll-container', '.treasure-compendium-layout', '.ink-scroll-container', '.shop-container', '.reward-shell', '.challenge-scroll-container'].join(',')))];
    try {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo(0, 0);
      }
      scrollTargets.forEach(target => {
        target.scrollTop = 0;
        target.scrollLeft = 0;
        if (typeof target.scrollTo === 'function') {
          target.scrollTo({
            top: 0,
            left: 0,
            behavior: 'auto'
          });
        }
      });
    } catch (error) {
      console.warn('[UI] Failed to reset screen scroll position:', error);
    }
  }
  dismissBattleOverlaysForScreen(screenId) {
    if (screenId === 'battle-screen') return;
    const log = document.getElementById('battle-log');
    if (log) {
      log.classList.remove('show', 'log-damage', 'log-status', 'log-system', 'log-reward', 'log-warning');
    }
    const panel = document.getElementById('battle-log-panel');
    if (panel) {
      panel.classList.remove('active');
    }
    if (typeof Utils !== 'undefined' && Utils && Utils._logTimer) {
      clearTimeout(Utils._logTimer);
      Utils._logTimer = null;
    }
  }
  resetScreenAmbientState(screenId) {
    if (screenId !== 'realm-select-screen') return;
    const bg = document.getElementById('dynamic-bg');
    if (bg) {
      bg.remove();
    }
  }
  showScreen(screenId) {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showScreen(screenId);
  }

  // 更新角色信息界面
  updateCharacterInfo() {
    document.getElementById('char-hp').textContent = this.player.maxHp;
    document.getElementById('char-energy').textContent = this.player.baseEnergy;
    document.getElementById('char-draw').textContent = this.player.drawCount;
    const charId = this.player.characterId || 'linFeng';
    const char = typeof CHARACTERS !== 'undefined' && CHARACTERS[charId] ? CHARACTERS[charId] : {
      avatar: '👤'
    };
    const cosmetic = this.getEquippedCosmeticsProfile();
    const titleEl = document.getElementById('info-char-title');
    const avatarEl = document.getElementById('info-char-avatar');
    const descEl = document.getElementById('info-char-desc');
    if (titleEl) {
      if (cosmetic && cosmetic.title && cosmetic.title.name) {
        const titleName = String(cosmetic.title.name).replace(/^称号·/, '');
        titleEl.textContent = `称号·${titleName}`;
      } else {
        titleEl.textContent = '逆命印记';
      }
      titleEl.className = 'imprint-badge';
    }
    if (avatarEl) {
      const skinIcon = cosmetic && cosmetic.skin ? cosmetic.skin.icon || '👘' : null;
      avatarEl.textContent = skinIcon || char.avatar || '👤';
      avatarEl.classList.toggle('pvp-skin-avatar', !!skinIcon);
    }
    if (descEl) {
      const baseDesc = char.description || descEl.textContent || '';
      if (cosmetic && cosmetic.skin && cosmetic.skin.name) {
        const skinName = String(cosmetic.skin.name).replace(/^法相·/, '');
        descEl.textContent = `${baseDesc}（当前法相：${skinName}）`;
      } else {
        descEl.textContent = baseDesc.replace(/（当前法相：.*?）$/, '');
      }
    }

    // 显示力量 (永久)
    const permaStrength = this.player.permaBuffs && this.player.permaBuffs.strength ? this.player.permaBuffs.strength : 0;
    const charStrEl = document.getElementById('char-strength');
    if (charStrEl) charStrEl.textContent = permaStrength;
    const ringName = this.player.fateRing.name;
    // Fix: ID mismatch, HTML uses 'ring-level'
    const ringLevelEl = document.getElementById('ring-level');
    if (ringLevelEl) ringLevelEl.textContent = ringName;
    let loadedCount = 0;
    let totalSlots = 0;

    // different logic for Class instance vs simple object (fallback/legacy)
    if (typeof this.player.fateRing.getSocketedLaws === 'function') {
      loadedCount = this.player.fateRing.getSocketedLaws().length;
      totalSlots = this.player.fateRing.maxSlots;
    } else {
      loadedCount = this.player.fateRing.loadedLaws ? this.player.fateRing.loadedLaws.length : 0;
      totalSlots = this.player.fateRing.slots;
    }
    const loadedLawsSpan = document.getElementById('loaded-laws');
    if (loadedLawsSpan) loadedLawsSpan.textContent = `${loadedCount}/${totalSlots}`;
  }
  getEquippedCosmeticsProfile() {
    if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getEquippedCosmetics === 'function') {
      try {
        return PVPService.getEquippedCosmetics();
      } catch (e) {
        console.warn('Read equipped cosmetics failed:', e);
      }
    }
    return {
      skin: null,
      title: null
    };
  }

  // 显示角色选择界面
  showCharacterSelection() {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.showCharacterSelection();
  }

  // 选择角色
  selectCharacter(charId) {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.selectCharacter(charId);
  }

  // 确认选择
  confirmCharacterSelection() {
    Game.prototype.ensureCharacterSelectView.call(this);
    return this.characterSelectView.confirmCharacterSelection();
  }

  // 开始新游戏
  startNewGame(characterId = 'linFeng', options = {}) {
    // 游客模式下允许离线开始，不强制登录
    if (this.shouldForceCloudLogin()) {
      this.showLoginModal();
      return;
    }
    this.player.reset(characterId);
    const resolvedRunDestinyId = options && typeof options.runDestinyId === 'string' && options.runDestinyId ? options.runDestinyId : this.resolveDefaultRunDestinyId(characterId);
    if (resolvedRunDestinyId && typeof this.player.setRunDestiny === 'function') {
      this.player.setRunDestiny(resolvedRunDestinyId, Math.max(1, Math.floor(Number(options.runDestinyTier) || 1)));
    }
    const resolvedSpiritCompanionId = options && typeof options.spiritCompanionId === 'string' && options.spiritCompanionId ? options.spiritCompanionId : this.resolveDefaultSpiritCompanionId(characterId);
    if (resolvedSpiritCompanionId && typeof this.player.setSpiritCompanion === 'function') {
      this.player.setSpiritCompanion(resolvedSpiritCompanionId, Math.max(1, Math.floor(Number(options.spiritCompanionTier) || 1)));
    }
    const resolvedRunPathId = options && typeof options.runPathId === 'string' && options.runPathId ? options.runPathId : this.resolveDefaultRunPathId(characterId);
    if (resolvedRunPathId && typeof this.player.setRunPath === 'function') {
      this.player.setRunPath(resolvedRunPathId);
    }
    this.player.realm = 1;
    this.player.floor = 0;
    this.comboCount = 0;
    this.lastCardType = null;
    this.runStartTime = Date.now();
    this.currentBattleNode = null;
    this.rewardCardSelected = false;
    this.encounterState = this.createDefaultEncounterState();
    this.chapterEventLedger = this.createDefaultChapterEventLedger();
    this.currentEventRuntimeMeta = null;
    this.currentEvent = null;
    this.eventResults = [];
    if (typeof this.resetSanctumAgendaRunState === 'function') {
      this.resetSanctumAgendaRunState('new_run');
    }

    // 恢复解锁进度（如果从旧存档继承）
    if (this.tempPreservedRealms && Array.isArray(this.tempPreservedRealms)) {
      this.unlockedRealms = this.tempPreservedRealms;
      this.tempPreservedRealms = null; // Consume
      console.log('Restored unlocked realms from previous save:', this.unlockedRealms);
    } else {
      // 否则初始为1
      this.unlockedRealms = [1];
    }

    // Initialize Registration Time if new run
    if (!this.player.registerTime) {
      this.player.registerTime = Date.now();
    }

    // 应用局外传承加成（仅影响新的一轮）
    const legacyBonuses = this.getLegacyBonuses();
    this.applyLegacyBonusesToPlayer(this.player, legacyBonuses);
    this.applyLegacyRunDoctrine(this.player, this.legacyProgress?.lastPreset || null, this.legacyProgress?.secondaryPreset || null);
    this.applyLegacyRunMission(this.player, this.legacyProgress?.lastPreset || null);

    // 应用永久起始加成
    const bonuses = this.achievementSystem.loadStartBonuses();
    if (bonuses.maxHp) {
      this.player.maxHp += bonuses.maxHp;
      this.player.currentHp = this.player.maxHp;
    }
    if (bonuses.strength) this.player.buffs.strength = bonuses.strength;
    if (bonuses.gold) this.player.gold += bonuses.gold;
    if (bonuses.draw) this.player.drawCount += bonuses.draw;

    // 清空地图数据，确保startRealm不会误判为继续游戏
    if (this.map) {
      this.map.nodes = [];
      this.map.bossNode = null;
    }

    // 不直接生成地图，而是去选关界面
    this.showScreen('realm-select-screen');
    this.autoSave();
  }

  // 显示角色详情（主菜单）
  showPlayerInfo() {
    if (!this.hudView) this.hudView = new HUDView(this);
    return this.hudView.showPlayerInfo();
  }

  // 更新界面上的玩家显示（名字、头像等）
  updatePlayerDisplay() {
    if (!this.hudView) this.hudView = new HUDView(this);
    return this.hudView.updatePlayerDisplay();
  }
  prepareEnemyForEndlessBattle(enemy, modifiers) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.prepareEnemyForEndlessBattle(enemy, modifiers);
  }
  applyEndlessCounterplayAffix(enemy, pressureProfile = null) {
    Game.prototype.ensureEndlessManager.call(this);
    return this.endlessManager.applyEndlessCounterplayAffix(enemy, pressureProfile);
  }

  // 开始战斗 - 保存当前节点
  startBattle(enemies, node = null) {
    const rawEnemyList = Array.isArray(enemies) ? enemies : [enemies];
    const enemyList = rawEnemyList.filter(Boolean);
    const isPvpBattle = enemyList.some(e => e && e.isGhost);
    this.mode = isPvpBattle ? 'pvp' : 'pve';
    this.pvpResultReview = null;
    if (!isPvpBattle) {
      this.pvpOpponentRank = null;
      this.pvpMatchTicket = null;
      this.pvpDangerProfile = null;
      this.pvpMatchIntent = null;
      this.pvpResultReview = null;
      if (typeof PVPService !== 'undefined' && typeof PVPService.clearActiveMatch === 'function') {
        PVPService.clearActiveMatch();
      }
    }
    let battleEnemies = enemyList;
    if (!isPvpBattle && this.isEndlessActive()) {
      const mods = this.getEndlessModifiers();
      battleEnemies = enemyList.map(enemy => this.prepareEnemyForEndlessBattle(enemy, mods));
      this.applyEndlessPreBattleBonuses();
    }
    this.currentEnemies = battleEnemies;
    this.currentBattleNode = node;
    this.stealAttempted = false;
    this.rewardCardSelected = false;
    this.lastExpeditionRewardMeta = null;
    this.lastRunPathRewardMeta = null;
    this.dismissRunPathMapFeedback();
    this.comboCount = 0;
    this.lastCardType = null;
    this.showScreen('battle-screen');
    this.battle.init(battleEnemies);

    // 隐藏连击显示
    this.hideCombo();
  }

  // 处理连击
  handleCombo(cardType) {
    if (cardType === 'attack') {
      if (this.lastCardType === 'attack') {
        this.comboCount++;
        this.showCombo();
      } else {
        this.comboCount = 1;
        this.hideCombo();
      }
    } else {
      this.comboCount = 0;
      this.hideCombo();
    }
    this.lastCardType = cardType;

    // 更新成就统计
    this.achievementSystem.updateStat('maxCombo', this.comboCount, 'max');
  }

  // 获取连击加成
  getComboBonus() {
    if (this.comboCount < 2) return 0;
    if (this.comboCount === 2) return 0.1;
    if (this.comboCount === 3) return 0.25;
    return 0.5;
  }

  // 显示连击
  showCombo() {
    if (!this.hudView) this.hudView = new HUDView(this);
    return this.hudView.showCombo();
  }

  // 隐藏连击
  hideCombo() {
    const display = document.getElementById('combo-display');
    if (display) {
      display.classList.remove('show');
    }
  }

  // 战斗胜利
  async onBattleWon(enemies) {
    if (this.mode === 'pvp') {
      await this.handlePVPVictory();
      return;
    }
    this.lastBattleRewardMeta = null;
    const enemyList = Array.isArray(enemies) ? enemies.filter(Boolean) : [enemies].filter(Boolean);
    const isBossBattle = enemyList.some(enemy => !!enemy && !!enemy.isBoss);
    const battleNodeType = this.currentBattleNode && typeof this.currentBattleNode.type === 'string' ? this.currentBattleNode.type : '';
    const endlessMods = this.isEndlessActive() ? this.getEndlessModifiers() : null;
    this.player.enemiesDefeated += enemyList.length;
    if (typeof this.handleRunPathProgress === 'function') {
      this.handleRunPathProgress('battleWin', 1, {
        nodeType: battleNodeType
      });
      if (['elite', 'trial', 'ghost_duel'].includes(battleNodeType)) {
        this.handleRunPathProgress('eliteOrTrialWin', 1, {
          nodeType: battleNodeType
        });
      }
      if (isBossBattle || battleNodeType === 'boss') {
        this.handleRunPathProgress('bossWin', 1, {
          nodeType: 'boss'
        });
      }
    }

    // 命环获得经验
    let ringExp = enemyList.reduce((sum, e) => sum + (e.ringExp || 10), 0);

    // 重玩收益减半
    if (this.player.isReplay) {
      ringExp = Math.floor(ringExp * 0.5);
    }
    const paranoiaEffects = this.isEndlessActive() ? this.getEndlessParanoiaEffects() : null;
    if (paranoiaEffects && this.currentBattleNode && this.currentBattleNode.type === 'enemy' && Number(paranoiaEffects.normalBattleExpMul || 1) < 1) {
      ringExp = Math.max(1, Math.floor(ringExp * Math.max(0.35, Number(paranoiaEffects.normalBattleExpMul) || 1)));
      Utils.showBattleLog('轮回偏执：普通战命环经验受到压制。');
    }

    // 遗物：逆命之环（额外获得25%经验）
    if (this.player.relic && this.player.relic.id === 'fateRing') {
      ringExp = Math.floor(ringExp * 1.10);
    }

    // 新节点：试炼节点额外收益
    if (this.currentBattleNode && this.currentBattleNode.type === 'trial') {
      ringExp = Math.floor(ringExp * 1.5);
      const trialGoldMultiplier = endlessMods ? Math.max(1, endlessMods.rewardGoldMul) : 1;
      const trialGold = Math.floor((80 + this.player.realm * 15) * trialGoldMultiplier);
      this.player.gold += trialGold;
      Utils.showBattleLog(`试炼胜利！额外获得 ${trialGold} 灵石`);
    }

    // 试炼挑战检测 (Trial Challenge)
    if (this.activeTrial) {
      const trialSuccess = this.evaluateActiveTrialSuccess();
      const trialName = this.trialData?.name || '试炼';
      if (trialSuccess) {
        Utils.showBattleLog(`⚡ 试炼完成【${trialName}】！获得额外奖励！`);
        if (this.trialData.rewardMultiplier) {
          ringExp = Math.floor(ringExp * this.trialData.rewardMultiplier);
          Utils.showBattleLog(`奖励倍率提升至 x${Number(this.trialData.rewardMultiplier).toFixed(2)}`);
        }
        const rewardResult = this.grantTrialChallengeReward();
        if (rewardResult.rewardText) {
          Utils.showBattleLog(`试炼碑赐赏：${rewardResult.rewardText}`);
        }
      } else {
        Utils.showBattleLog(`试炼未达成【${trialName}】条件。`);
      }
      // Clear trial state
      this.activeTrial = null;
      this.trialData = null;
      this.trialMode = null;
    }
    if (endlessMods) {
      const prevExp = ringExp;
      ringExp = Math.max(1, Math.floor(ringExp * Math.max(1, endlessMods.rewardExpMul)));
      if (ringExp > prevExp) {
        Utils.showBattleLog(`无尽轮回：命环经验倍率生效（x${endlessMods.rewardExpMul.toFixed(2)}）`);
      }
    }
    const rewardMeta = {
      encounter: null,
      squad: null
    };
    const encounterVictory = this.battle && typeof this.battle.consumeEncounterVictoryBonusSummary === 'function' ? this.battle.consumeEncounterVictoryBonusSummary() : null;
    if (encounterVictory) {
      const bonusGold = Math.max(0, Math.floor(Number(encounterVictory.goldBonus) || 0));
      const bonusExp = Math.max(0, Math.floor(Number(encounterVictory.ringExpBonus) || 0));
      if (bonusGold > 0) {
        this.player.gold += bonusGold;
        Utils.showBattleLog(`遭遇战利·${encounterVictory.themeName}：额外获得 ${bonusGold} 灵石`);
      }
      if (bonusExp > 0) {
        ringExp += bonusExp;
        Utils.showBattleLog(`遭遇战利·${encounterVictory.themeName}：命环经验 +${bonusExp}`);
      }
      if (Array.isArray(encounterVictory.adventureBuffRewards) && this.player && typeof this.player.grantAdventureBuff === 'function') {
        encounterVictory.adventureBuffRewards.forEach(item => {
          if (!item || !item.id) return;
          const ok = this.player.grantAdventureBuff(item.id, item.charges || 1);
          if (ok) {
            const shownCharges = Math.max(1, Math.floor(Number(item.charges) || 1));
            Utils.showBattleLog(`遭遇馈赠：${item.label || item.id} x${shownCharges}`);
          }
        });
      }
      if (typeof this.recordEncounterThemeVictory === 'function') {
        this.recordEncounterThemeVictory(encounterVictory);
      }
      rewardMeta.encounter = {
        themeId: encounterVictory.themeId || 'encounter',
        themeName: encounterVictory.themeName || '遭遇奖励',
        tierStage: Math.max(1, Math.min(3, Math.floor(Number(encounterVictory.tierStage) || 1))),
        goldBonus: bonusGold,
        ringExpBonus: bonusExp
      };
    }
    const squadVictory = this.battle && typeof this.battle.consumeSquadEcologyVictoryBonusSummary === 'function' ? this.battle.consumeSquadEcologyVictoryBonusSummary() : null;
    if (squadVictory) {
      const bonusGold = Math.max(0, Math.floor(Number(squadVictory.goldBonus) || 0));
      const bonusExp = Math.max(0, Math.floor(Number(squadVictory.ringExpBonus) || 0));
      if (bonusGold > 0) {
        this.player.gold += bonusGold;
        Utils.showBattleLog(`敌阵战利·${squadVictory.squadName}：额外获得 ${bonusGold} 灵石`);
      }
      if (bonusExp > 0) {
        ringExp += bonusExp;
        Utils.showBattleLog(`敌阵战利·${squadVictory.squadName}：命环经验 +${bonusExp}`);
      }
      if (Array.isArray(squadVictory.adventureBuffRewards) && this.player && typeof this.player.grantAdventureBuff === 'function') {
        squadVictory.adventureBuffRewards.forEach(item => {
          if (!item || !item.id) return;
          const ok = this.player.grantAdventureBuff(item.id, item.charges || 1);
          if (ok) {
            const shownCharges = Math.max(1, Math.floor(Number(item.charges) || 1));
            Utils.showBattleLog(`编队启示：${item.label || item.id} x${shownCharges}`);
          }
        });
      }
      if (squadVictory.synergy && squadVictory.synergy.themeName) {
        Utils.showBattleLog(`轮段协同：${squadVictory.synergy.themeName} 与敌阵共振，战利额外提升`);
      }
      rewardMeta.squad = {
        squadId: squadVictory.squadId || 'squad',
        squadName: squadVictory.squadName || '敌阵战利',
        goldBonus: bonusGold,
        ringExpBonus: bonusExp,
        synergyThemeName: squadVictory.synergy && squadVictory.synergy.themeName ? squadVictory.synergy.themeName : ''
      };
    }
    if (rewardMeta.encounter || rewardMeta.squad) {
      this.lastBattleRewardMeta = rewardMeta;
    }
    const adventureGoldBonus = this.player && typeof this.player.consumeAdventureVictoryGoldBoost === 'function' ? this.player.consumeAdventureVictoryGoldBoost(40 + this.player.realm * 12) : 0;
    if (adventureGoldBonus > 0) {
      this.player.gold += adventureGoldBonus;
      Utils.showBattleLog(`悬赏契约：额外获得 ${adventureGoldBonus} 灵石`);
    }
    const adventureExpBonus = this.player && typeof this.player.consumeAdventureRingExpBoost === 'function' ? this.player.consumeAdventureRingExpBoost(ringExp) : 0;
    if (adventureExpBonus > 0) {
      ringExp += adventureExpBonus;
      Utils.showBattleLog(`行旅悟境：本场命环经验额外 +${adventureExpBonus}`);
    }
    if (this.player.currentHp < this.player.maxHp) {
      const adventureHealBonus = this.player && typeof this.player.consumeAdventureVictoryHealBoost === 'function' ? this.player.consumeAdventureVictoryHealBoost(this.player.maxHp) : 0;
      if (adventureHealBonus > 0) {
        const hpBefore = this.player.currentHp;
        this.player.heal(adventureHealBonus);
        const restored = this.player.currentHp - hpBefore;
        if (restored > 0) {
          Utils.showBattleLog(`战地医护：战后恢复 ${restored} 生命`);
        }
      }
    }
    this.player.fateRing.exp += ringExp;
    const levelUp = this.player.checkFateRingLevelUp();
    if (levelUp) {
      // 命环升级触发微弱的法则波动，虽然现在还不足以引来天罚者，但随着等级提升...
      Utils.showBattleLog("命环突破！法则波动引起了未知的注视...");
      // 将来可以在这里根据level触发特定事件或对话
    }

    // 非Boss节点即时完成；Boss改由 handleBossDefeated 统一处理，避免双重结算。
    if (this.currentBattleNode && !isBossBattle) {
      this.map.completeNode(this.currentBattleNode);
    }
    if (!isBossBattle) {
      // 自动保存
      this.autoSave();
    }

    // 更新成就统计
    this.achievementSystem.updateStat('enemiesDefeated', enemyList.length);
    if (isBossBattle) {
      const bossEnemy = enemyList.find(enemy => enemy && enemy.isBoss) || enemyList[0] || null;
      await this.handleBossDefeated(bossEnemy, enemyList, ringExp);
      return;
    }

    // 正常显示奖励
    this.showScreen('reward-screen');
    this.rewardView.generateRewards(enemyList, ringExp);
  }
  async handleBossDefeated(bossEnemy = null, enemyList = [], ringExp = 0) {
    const bossName = bossEnemy && bossEnemy.name ? bossEnemy.name : '天劫主宰';
    if (ringExp > 0) {
      Utils.showBattleLog(`击破 ${bossName}，命环经验 +${ringExp}`);
    } else {
      Utils.showBattleLog(`击破 ${bossName}！`);
    }
    const node = this.currentBattleNode;
    if (node && !node.completed) {
      this.map.completeNode(node);
    } else if (!node) {
      // 兜底：若节点丢失则仍推进关卡，避免卡死在战斗界面
      this.onRealmComplete();
    }
    this.currentBattleNode = null;
    if (!this.isEndlessActive()) {
      this.autoSave();
    }
  }

  // === PVP Result Handlers ===

  buildPVPResultReview(result = {}, didWin = true) {
    if (typeof PVPService === 'undefined' || !PVPService || typeof PVPService.getPvpResultReview !== 'function') {
      return null;
    }
    const delta = result && result.delta !== undefined ? result.delta : result && result.ratingChange || 0;
    return PVPService.getPvpResultReview({
      didWin,
      dangerProfile: this.pvpDangerProfile,
      ratingDelta: delta,
      coinsAwarded: result && result.coinsAwarded,
      opponent: this.pvpOpponentRank
    });
  }
  renderPVPResultReview(review = null) {
    if (!this.pvpResultView) this.pvpResultView = new PVPResultView(this);
    return this.pvpResultView.renderPVPResultReview(review);
  }
  async handlePVPVictory() {
    console.log('PVP Victory!');
    const overlay = document.getElementById('pvp-result-overlay');
    const title = document.getElementById('pvp-result-title');
    const scoreVal = document.getElementById('pvp-current-score');
    const deltaVal = document.getElementById('pvp-score-delta');
    const oppName = document.getElementById('pvp-result-opponent');
    const oppScore = document.getElementById('pvp-result-opp-score');
    const resolvedMatchTicket = this.pvpMatchTicket;

    // Report
    let result = {
      newRating: typeof PVPService !== 'undefined' && PVPService.currentRankData ? PVPService.currentRankData.score || 1000 : 1000,
      delta: 0,
      coinsAwarded: 0
    };
    try {
      if (typeof PVPService !== 'undefined') {
        result = await PVPService.reportMatchResult(true, this.pvpOpponentRank, this.pvpMatchTicket);
      }
    } catch (e) {
      console.error('PVP Report Failed:', e);
    } finally {
      this.pvpMatchTicket = null;
    }

    // Update UI
    if (overlay) {
      overlay.className = 'screen pvp-result-overlay victory'; // Add victory class
      overlay.style.display = 'flex';
      title.textContent = '问道成功';
      scoreVal.textContent = result.newRating;
      // Fix: EloCalculator returns 'delta', not 'ratingChange'
      const change = result.delta !== undefined ? result.delta : result.ratingChange || 0;
      deltaVal.textContent = change >= 0 ? `+${change}` : `${change}`;
      if (this.pvpOpponentRank && this.pvpOpponentRank.user) {
        oppName.textContent = this.pvpOpponentRank.user.username || '未知对手';
        oppScore.textContent = this.pvpOpponentRank.score || 1000;
      }
    }
    this.renderPVPResultReview(this.buildPVPResultReview(result, true));
    if (result && Number(result.coinsAwarded) > 0) {
      Utils.showBattleLog(`天道币 +${Math.floor(Number(result.coinsAwarded))}`);
    }
    if (result && result.rejected) {
      Utils.showBattleLog('PVP 结算校验未通过，本场积分未变动。');
    } else if (typeof this.recordSeasonVerificationResult === 'function') {
      let pvpSeasonMeta = null;
      const weekMeta = typeof this.getHeavenlyMandateWeekMeta === 'function' ? this.getHeavenlyMandateWeekMeta() : null;
      if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getCurrentSeasonMeta === 'function') {
        try {
          pvpSeasonMeta = PVPService.getCurrentSeasonMeta();
        } catch (error) {
          pvpSeasonMeta = null;
        }
      }
      const boardBeforeVerification = typeof this.getSeasonBoardSnapshot === 'function' ? this.getSeasonBoardSnapshot() : null;
      const pendingDebt = ['open', 'deferred'].includes(String(boardBeforeVerification?.debtPack?.status || '').trim());
      const opponentName = this.pvpOpponentRank?.user?.username || '';
      const delta = Math.floor(Number(result?.delta !== undefined ? result.delta : result?.ratingChange) || 0);
      this.recordSeasonVerificationResult({
        recordId: `season_verification_${String(weekMeta?.weekTag || 'current').trim()}_primary_pvp`,
        weekTag: String(weekMeta?.weekTag || '').trim(),
        weekLabel: String(weekMeta?.weekLabel || '').trim(),
        role: 'primary',
        sourceMode: 'pvp',
        sourceModeLabel: '天道榜',
        sourceLabel: `${pvpSeasonMeta?.name || '天道榜'}${opponentName ? ` · 对手 ${opponentName}` : ''}`,
        label: '天道榜账本验证',
        resultStatus: 'verified',
        writebackMode: pendingDebt ? 'clear_debt' : 'upgrade_verdict',
        writebackLine: pendingDebt ? '天道榜主验证通过，欠卷会在季盘上清账。' : '天道榜主验证通过，本周押卷会升级为正卷。',
        resolvedRunId: String(result?.matchId || resolvedMatchTicket?.id || pvpSeasonMeta?.id || '').trim(),
        chapterIndex: Math.max(0, Math.floor(Number(boardBeforeVerification?.settlement?.chapterIndex || 0) || 0)),
        proofQuality: Math.abs(delta) >= 24 ? 'decisive' : 'solid',
        lineageStyle: '镜战压强',
        summaryLine: `${pvpSeasonMeta?.name || '天道榜'} 对局验证通过${opponentName ? `，已击穿 ${opponentName}` : '。'}`,
        detailLine: [delta ? `积分 ${delta >= 0 ? `+${delta}` : `${delta}`}` : '', Number(result?.coinsAwarded) > 0 ? `天道币 +${Math.floor(Number(result.coinsAwarded) || 0)}` : '', pendingDebt ? '这场胜局会优先清掉季盘欠卷。' : '这场胜局会把本周押卷往正卷推进。'].filter(Boolean).join('｜'),
        statusLine: '天道榜 · 通过',
        anchorSection: 'pvp',
        priority: 1
      });
    }
    this.autoSave();
  }
  async handlePVPDefeat() {
    console.log('PVP Defeat...');
    const overlay = document.getElementById('pvp-result-overlay');
    const title = document.getElementById('pvp-result-title');
    const scoreVal = document.getElementById('pvp-current-score');
    const deltaVal = document.getElementById('pvp-score-delta');
    const oppName = document.getElementById('pvp-result-opponent');
    const oppScore = document.getElementById('pvp-result-opp-score');
    const resolvedMatchTicket = this.pvpMatchTicket;

    // Report
    let result = {
      newRating: typeof PVPService !== 'undefined' && PVPService.currentRankData ? PVPService.currentRankData.score || 1000 : 1000,
      delta: 0,
      coinsAwarded: 0
    };
    try {
      if (typeof PVPService !== 'undefined') {
        result = await PVPService.reportMatchResult(false, this.pvpOpponentRank, this.pvpMatchTicket);
      }
    } catch (e) {
      console.error('PVP Report Failed:', e);
    } finally {
      this.pvpMatchTicket = null;
    }

    // Update UI
    if (overlay) {
      overlay.className = 'screen pvp-result-overlay defeat'; // Add defeat class
      overlay.style.display = 'flex';
      title.textContent = '道心受损';
      scoreVal.textContent = result.newRating;
      const change = result.delta !== undefined ? result.delta : result.ratingChange || 0;
      deltaVal.textContent = `${change}`; // Usually negative

      if (this.pvpOpponentRank && this.pvpOpponentRank.user) {
        oppName.textContent = this.pvpOpponentRank.user.username || '未知对手';
        oppScore.textContent = this.pvpOpponentRank.score || 1000;
      }
    }
    this.renderPVPResultReview(this.buildPVPResultReview(result, false));
    if (result && Number(result.coinsAwarded) > 0) {
      Utils.showBattleLog(`天道币 +${Math.floor(Number(result.coinsAwarded))}`);
    }
    if (result && result.rejected) {
      Utils.showBattleLog('PVP 结算校验未通过，本场积分未变动。');
    } else if (typeof this.recordSeasonVerificationResult === 'function') {
      let pvpSeasonMeta = null;
      const weekMeta = typeof this.getHeavenlyMandateWeekMeta === 'function' ? this.getHeavenlyMandateWeekMeta() : null;
      if (typeof PVPService !== 'undefined' && PVPService && typeof PVPService.getCurrentSeasonMeta === 'function') {
        try {
          pvpSeasonMeta = PVPService.getCurrentSeasonMeta();
        } catch (error) {
          pvpSeasonMeta = null;
        }
      }
      const opponentName = this.pvpOpponentRank?.user?.username || '';
      const delta = Math.floor(Number(result?.delta !== undefined ? result.delta : result?.ratingChange) || 0);
      this.recordSeasonVerificationResult({
        recordId: `season_verification_${String(weekMeta?.weekTag || 'current').trim()}_primary_pvp`,
        weekTag: String(weekMeta?.weekTag || '').trim(),
        weekLabel: String(weekMeta?.weekLabel || '').trim(),
        role: 'primary',
        sourceMode: 'pvp',
        sourceModeLabel: '天道榜',
        sourceLabel: `${pvpSeasonMeta?.name || '天道榜'}${opponentName ? ` · 对手 ${opponentName}` : ''}`,
        label: '天道榜反证',
        resultStatus: 'failed',
        writebackMode: 'degrade',
        writebackLine: '天道榜给出了反证，本周押卷会先转入险卷/反例处理。',
        resolvedRunId: String(result?.matchId || resolvedMatchTicket?.id || pvpSeasonMeta?.id || '').trim(),
        proofQuality: 'thin',
        lineageStyle: '镜战压强',
        summaryLine: `${pvpSeasonMeta?.name || '天道榜'} 对局失利${opponentName ? `，${opponentName} 给出了当前主轴的反证。` : '，当前主轴需要重新复核。'}`,
        detailLine: [delta ? `积分 ${delta}` : '', Number(result?.coinsAwarded) > 0 ? `天道币 +${Math.floor(Number(result.coinsAwarded) || 0)}` : '', '先收紧路线，再决定是否继续冲主验证。'].filter(Boolean).join('｜'),
        statusLine: '天道榜 · 反证已入账',
        anchorSection: 'pvp',
        priority: 1
      });
    }
    this.autoSave();
  }
  closePVPResult() {
    const overlay = document.getElementById('pvp-result-overlay');
    if (overlay) overlay.style.display = 'none';
    this.mode = 'pve';
    this.pvpMatchTicket = null;
    this.pvpOpponentRank = null;
    this.pvpDangerProfile = null;
    this.pvpMatchIntent = null;
    this.renderPVPResultReview(null);
    this.pvpResultReview = null;
    if (typeof PVPService !== 'undefined' && typeof PVPService.clearActiveMatch === 'function') {
      PVPService.clearActiveMatch();
    }

    // Return to PVP Screen
    this.showScreen('pvp-screen');
    // Refresh Rank
    if (PVPScene && typeof PVPScene.loadRankings === 'function') {
      PVPScene.loadRankings();
    } else if (PVPScene && typeof PVPScene.loadRanking === 'function') {
      // Fallback/Correction just in case
      PVPScene.loadRanking();
    } else {
      // Direct call if available globally or assume standard name
      if (typeof PVPScene !== 'undefined') PVPScene.loadRankings();
    }
  }

  // 显示奖励界面
  getRewardCardsForCurrentRun(count = 2) {
    const safeCount = Math.max(1, Math.floor(Number(count) || 2));
    if (!this.player) return getRewardCards(safeCount, null, []);
    const endlessMods = this.isEndlessActive() ? this.getEndlessModifiers() : null;
    const rumorRareBonus = this.consumeRewardRumorBoost();
    const vowEffects = this.player && typeof this.player.getRunVowEffects === 'function' ? this.player.getRunVowEffects() : {};
    const rareBonus = Math.max(0, Number(endlessMods?.rewardRareChance) || 0) + Math.max(0, rumorRareBonus) + Math.max(0, Number(vowEffects.rewardRareChance) || 0);
    if (rareBonus <= 0) {
      return getRewardCards(safeCount, this.player.characterId, this.player.deck);
    }
    const picked = [];
    const seen = new Set();
    const archetype = typeof inferDeckArchetype === 'function' ? inferDeckArchetype(this.player.deck) : null;
    for (let i = 0; i < safeCount; i += 1) {
      let card = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const forceRare = Math.random() < Math.min(0.86, 0.18 + rareBonus);
        const forceEpic = forceRare && Math.random() < 0.18;
        if (forceRare) {
          card = getRandomCard(forceEpic ? 'epic' : 'rare', this.player.characterId);
        } else if (archetype && typeof getRandomArchetypeCard === 'function' && Math.random() < 0.55) {
          card = getRandomArchetypeCard(archetype, null, this.player.characterId);
        } else {
          card = getRandomCard(null, this.player.characterId);
        }
        if (!card) continue;
        if (seen.has(card.id) && attempt < 9) continue;
        break;
      }
      if (!card) {
        const fallback = getRewardCards(1, this.player.characterId, this.player.deck);
        card = Array.isArray(fallback) ? fallback[0] : null;
      }
      if (card) {
        picked.push(card);
        seen.add(card.id);
      }
    }
    return picked;
  }
  showRewardScreen(gold, canSteal, stealEnemy, ringExp = 0, strategicGain = null) {
    Game.prototype.ensureRewardView.call(this);
    this.rewardView.showRewardScreen(gold, canSteal, stealEnemy, ringExp, strategicGain);
  }

  // 选择奖励卡牌

  // 跳过奖励卡牌（扣除灵石）

  // 尝试盗取法则

  // 奖励后继续 - 修复关卡推进bug

  // 显示事件弹窗
  showEventModal(event, node) {
    return Game.prototype.ensureEventManager.call(this).showEventModal(event, node);
  }
  getTrialChallengeCatalog() {
    const realm = Math.max(1, Math.floor(Number(this.player?.realm) || 1));
    return [{
      id: 'speedKill',
      name: '逐光试斩',
      icon: '⚡',
      desc: '要求你在 4 回合内结束战斗。敌方生命与攻击同时提升。',
      conditions: {
        maxTurns: 4
      },
      rewardMultiplier: 1.55,
      reward: 'law',
      bonusGold: 60 + realm * 6,
      enemyHpMul: 1.18,
      enemyAtkMul: 1.12
    }, {
      id: 'noDamage',
      name: '无伤镜湖',
      icon: '🪞',
      desc: '本场不可失去生命。敌方开场获得护盾，并追加控场节奏。',
      conditions: {
        noDamage: true
      },
      rewardMultiplier: 1.4,
      reward: 'rare_card',
      bonusGold: 45 + realm * 5,
      enemyHpMul: 1.1,
      enemyAtkMul: 1.08,
      enemyOpeningBlock: 10,
      enemyDebuff: {
        type: 'weak',
        value: 1
      }
    }, {
      id: 'oathMirror',
      name: '双誓并压',
      icon: '☯️',
      desc: '5 回合内取胜且本场不可失去生命。敌方生命、护盾与压制节奏进一步强化。',
      conditions: {
        maxTurns: 5,
        noDamage: true
      },
      rewardMultiplier: 1.72,
      reward: 'law',
      bonusGold: 90 + realm * 8,
      enemyHpMul: 1.24,
      enemyAtkMul: 1.14,
      enemyOpeningBlock: 12,
      enemyDebuff: {
        type: 'vulnerable',
        value: 1
      }
    }];
  }
  armTrialChallenge(config = {}) {
    if (!config || typeof config !== 'object') return null;
    const conditions = config.conditions && typeof config.conditions === 'object' ? config.conditions : {};
    const maxTurns = Math.max(0, Math.floor(Number(config.maxTurns != null ? config.maxTurns : config.rounds != null ? config.rounds : conditions.maxTurns) || 0));
    const noDamage = !!(config.noDamage != null ? config.noDamage : conditions.noDamage);
    const normalized = {
      id: String(config.id || config.trialType || 'trialChallenge'),
      name: String(config.name || config.label || config.trialType || '试炼挑战'),
      icon: String(config.icon || '⚖️'),
      desc: String(config.desc || config.description || '通过额外条件换取更高回报。'),
      conditions: {
        maxTurns,
        noDamage
      },
      rounds: maxTurns,
      rewardMultiplier: Math.max(1, Number(config.rewardMultiplier) || 1),
      reward: String(config.reward || 'law'),
      bonusGold: Math.max(0, Math.floor(Number(config.bonusGold) || 0)),
      enemyHpMul: Math.max(1, Number(config.enemyHpMul) || 1),
      enemyAtkMul: Math.max(1, Number(config.enemyAtkMul) || 1),
      enemyOpeningBlock: Math.max(0, Math.floor(Number(config.enemyOpeningBlock) || 0)),
      enemyDebuff: config.enemyDebuff && typeof config.enemyDebuff === 'object' ? {
        type: String(config.enemyDebuff.type || ''),
        value: Math.max(0, Math.floor(Number(config.enemyDebuff.value) || 0))
      } : null
    };
    this.activeTrial = normalized.id;
    this.trialData = normalized;
    this.trialMode = {
      type: normalized.id,
      rounds: normalized.rounds,
      rewardMultiplier: normalized.rewardMultiplier,
      reward: normalized.reward
    };
    return normalized;
  }
  evaluateActiveTrialSuccess() {
    const trial = this.trialData && typeof this.trialData === 'object' ? this.trialData : null;
    if (!trial) return false;
    const conditions = trial.conditions && typeof trial.conditions === 'object' ? trial.conditions : {};
    if (Number(conditions.maxTurns) > 0 && this.battle && Number(this.battle.turnNumber) > Number(conditions.maxTurns)) {
      return false;
    }
    if (conditions.noDamage && this.battle && this.battle.playerTookDamage) {
      return false;
    }
    return true;
  }
  grantTrialChallengeReward() {
    const trial = this.trialData && typeof this.trialData === 'object' ? this.trialData : null;
    if (!trial) return {
      rewardText: ''
    };
    const rewardLines = [];
    const bonusGold = Math.max(0, Math.floor(Number(trial.bonusGold) || 0));
    if (bonusGold > 0) {
      this.player.gold += bonusGold;
      rewardLines.push(`额外灵石 +${bonusGold}`);
    }
    if (trial.reward === 'law' && typeof LAWS !== 'undefined' && LAWS && typeof LAWS === 'object') {
      const lawKeys = Object.keys(LAWS);
      if (lawKeys.length > 0) {
        const randomLawKey = lawKeys[Math.floor(Math.random() * lawKeys.length)];
        const law = LAWS[randomLawKey];
        if (this.player.collectLaw(law)) {
          rewardLines.push(`领悟法则：${law.name}`);
          if (this.achievementSystem && typeof this.achievementSystem.updateStat === 'function') {
            this.achievementSystem.updateStat('lawsCollected', 1);
          }
        } else {
          this.player.gold += 100;
          rewardLines.push('法则重复，转化为 100 灵石');
        }
      }
    } else if (trial.reward === 'rare_card' && typeof getRandomCard === 'function') {
      const card = getRandomCard('rare', this.player?.characterId || null);
      if (card && typeof this.player.addCardToDeck === 'function') {
        this.player.addCardToDeck(card);
        rewardLines.push(`获得稀有卡：${card.name}`);
      }
    }
    return {
      rewardText: rewardLines.join('｜')
    };
  }
  showTrialChallengeSelection(node) {
    return Game.prototype.ensureEventManager.call(this).showTrialChallengeSelection(node);
  }
  showForgeChoiceModal(node, costs = {}) {
    return Game.prototype.ensureEventManager.call(this).showForgeChoiceModal(node, costs);
  }
  showForgeCardDraft(node, costs = {}) {
    return Game.prototype.ensureEventManager.call(this).showForgeCardDraft(node, costs);
  }
  describeTreasureWorkshopStatus(treasure) {
    return Game.prototype.ensureEventManager.call(this).describeTreasureWorkshopStatus(treasure);
  }
  showForgeTreasureDraft(node, mode = 'reforge', costs = {}) {
    return Game.prototype.ensureEventManager.call(this).showForgeTreasureDraft(node, mode, costs);
  }

  // 选择事件选项
  selectEventChoice(choiceIndex) {
    const choice = this.currentEvent.choices[choiceIndex];
    if (!choice) return;

    // 收集效果结果用于显示
    this.eventResults = [];
    let flowInterrupted = false;
    const ledgerEntry = this.recordChapterEventConsequence({
      event: this.currentEvent,
      choice,
      choiceIndex,
      runtimeId: this.currentEventRuntimeMeta?.eventRuntimeId,
      chapterIndex: this.currentEventRuntimeMeta?.chapterIndex,
      chapterName: this.currentEventRuntimeMeta?.chapterName
    });
    if (ledgerEntry) {
      const shortEcho = String(ledgerEntry.echoText || ledgerEntry.longTermText || '后果已记录').slice(0, 36);
      this.eventResults.push(`🧭 命盘入账：${shortEcho}`);
      if (typeof Utils !== 'undefined' && Utils.showBattleLog) {
        Utils.showBattleLog(`命盘后果已记录：${ledgerEntry.choiceText || '事件抉择'}`);
      }
    }

    // 执行效果
    if (choice.effects && choice.effects.length > 0) {
      for (const effect of choice.effects) {
        if (this.executeEventEffect(effect)) {
          flowInterrupted = true;
          break;
        }
      }
    }

    // 某些效果（如战斗/试炼/升级界面）会切换流程，不再渲染“继续”按钮
    if (flowInterrupted) {
      return;
    }

    // 在弹窗中显示结果
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!descEl || !choicesEl) {
      const modal = document.getElementById('event-modal');
      if (modal) modal.classList.remove('active');
      this.onEventComplete();
      return;
    }
    if (this.eventResults.length > 0) {
      descEl.innerHTML = `<div style="color: var(--accent-gold); font-size: 1.1rem;">✨ 结果</div>`;
      descEl.innerHTML += this.eventResults.map(r => `<div style="margin-top: 8px;">${r}</div>`).join('');
    } else if (choice.effects && choice.effects.length === 0) {
      descEl.innerHTML = `<div style="color: var(--text-muted);">你转身离开了...</div>`;
    }

    // 隐藏选项，显示继续按钮
    choicesEl.innerHTML = '';
    const continueBtn = document.createElement('button');
    continueBtn.className = 'event-choice';
    continueBtn.innerHTML = '<div>▶ 继续</div>';
    continueBtn.onclick = () => {
      document.getElementById('event-modal').classList.remove('active');
      this.onEventComplete();
    };
    choicesEl.appendChild(continueBtn);
  }

  // 执行事件效果
  executeEventEffect(effect) {
    return Game.prototype.ensureEventManager.call(this).executeEventEffect(effect);
  }
  getTemporaryEventShopOffers(effect = {}) {
    return Game.prototype.ensureEventManager.call(this).getTemporaryEventShopOffers(effect);
  }
  applyTemporaryEventShopOffer(offer) {
    return Game.prototype.ensureEventManager.call(this).applyTemporaryEventShopOffer(offer);
  }
  showTemporaryEventShop(effect = {}) {
    return Game.prototype.ensureEventManager.call(this).showTemporaryEventShop(effect);
  }

  // 事件中升级卡牌 (Revised with Preview)
  showEventUpgradeCard() {
    return Game.prototype.ensureEventManager.call(this).showEventUpgradeCard();
  }

  // 事件完成
  onEventComplete() {
    return Game.prototype.ensureEventManager.call(this).onEventComplete();
  }

  // 战斗失败
  async onBattleLost() {
    if (this.mode === 'pvp') {
      await this.handlePVPDefeat();
      return;
    }
    const encounterState = this.ensureEncounterState();
    encounterState.currentStreak = 0;
    encounterState.currentStreakId = null;
    if (this.isEndlessActive()) {
      const state = this.ensureEndlessState();
      const collapse = this.recordEndlessSeasonCollapse();
      state.active = false;
      const collapseText = collapse ? ` 崩盘主因：${collapse.label}。` : '';
      Utils.showBattleLog(`无尽轮回中断：已坚持到第 ${state.currentCycle + 1} 轮。${collapseText}`);
    }
    const reachRealm = this.player && this.player.realm ? this.player.realm : 1;
    const lossEssence = this.awardLegacyEssence(Math.max(1, Math.floor((reachRealm - 1) / 2)), '败中悟道', {
      silent: true
    });

    // 清除存档，防止死亡后还能继续
    // this.clearSave(); // 改为仅在选择重新开始或退出时清除？或者保留存档但标记为已死亡
    // 为了支持重修此界，我们暂时保留内存中的数据，但清除硬盘上的进度以防刷新作弊
    // 只有当玩家选择“重修此界”时，才会重新写入存档（扣钱后的）
    this.clearSave({
      preserveSeasonMeta: this.isEndlessActive()
    });

    // 标记玩家已死亡，即使被非法恢复，也会在加载时被拦截
    this.player.currentHp = 0;

    // --- P1: 异步 PVP 残影上传 ---
    if (typeof AuthService !== 'undefined' && AuthService.uploadGhostData) {
      // 将最后一刻的残影数据上传
      AuthService.uploadGhostData(this.player, this.player.realm).catch(e => console.error(e));
    }
    document.getElementById('game-over-title').textContent = '陨落...';
    document.getElementById('game-over-title').classList.remove('victory');
    if (this.endlessState && this.endlessState.lastSeasonCollapse && this.endlessState.lastSeasonCollapse.label) {
      document.getElementById('game-over-text').textContent = `逆命之路，暂时中断｜崩盘主因：${this.endlessState.lastSeasonCollapse.label}`;
    } else {
      document.getElementById('game-over-text').textContent = '逆命之路，暂时中断';
    }
    document.getElementById('stat-floor').textContent = this.map.getRealmName(this.player.realm);
    document.getElementById('stat-enemies').textContent = this.player.enemiesDefeated;
    document.getElementById('stat-laws').textContent = this.player.collectedLaws.length;
    const legacyStat = document.getElementById('stat-legacy');
    if (legacyStat) {
      legacyStat.textContent = `+${lossEssence}（库存 ${this.legacyProgress.essence}）`;
    }

    // 显示重修此界按钮 (仅在非第一层或有一定进度时？为了体验，总是显示)
    const restartBtn = document.getElementById('restart-realm-btn');
    if (restartBtn) {
      restartBtn.style.display = 'inline-block';
      restartBtn.title = '保留当前属性和牌组，重新挑战本重天域';
    }
    this.showScreen('game-over-screen');
  }

  // 重修此界 (Restart Realm)
  restartRealm() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.restartRealm();
  }
  advanceToNextRealm(clearEssence = 0) {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.advanceToNextRealm(clearEssence);
  }

  // 天域完成
  onRealmComplete() {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.onRealmComplete();
  }

  // 显示胜利界面
  showVictoryScreen() {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showVictoryScreen();
  }

  // 显示牌组
  showDeck() {
    if (!this.inventoryView) {
      this.inventoryView = new InventoryView(this);
    }
    this.inventoryView.showDeck();
  }

  // 显示牌组模态框
  showDeckModal(type) {
    if (!this.inventoryView) {
      this.inventoryView = new InventoryView(this);
    }
    this.inventoryView.showDeckModal(type);
  }

  // 渲染法宝栏
  renderTreasures() {
    if (!this.hudView) this.hudView = new HUDView(this);
    return this.hudView.renderTreasures();
  }

  // 调试模式开关
  toggleDebug() {
    this.debugMode = !this.debugMode;
    localStorage.setItem('theDefierDebug', this.debugMode);
    this.updateDebugUI();
    console.log(`Debug Mode: ${this.debugMode ? 'ON' : 'OFF'}`);
    return this.debugMode ? 'Debug ON' : 'Debug OFF';
  }
  updateDebugUI() {
    const btns = document.querySelectorAll('.cheat-btn');
    btns.forEach(btn => {
      btn.style.display = this.debugMode ? 'inline-block' : 'none';
    });

    // 可以在这里控制其他调试元素的显隐
  }

  // 显示命环
  // 作弊功能
  cheat() {
    this.showConfirmModal('确定要启用作弊模式吗？\n这是测试功能，可能会破坏游戏体验。', () => this._performCheat());
  }
  _performCheat() {
    // 1. 暴富
    this.player.gold += 10000000;

    // 2. 命环满级
    if (typeof FATE_RING !== 'undefined') {
      const maxLevel = 10;
      this.player.fateRing.level = maxLevel;
      this.player.fateRing.exp = 999999; // 确保是满经验

      // 确保槽位解锁
      if (this.player.fateRing.type === 'sealed') {
        this.player.fateRing.maxSlots = 12;
      } else if (this.player.fateRing.type === 'mutated') {
        this.player.fateRing.maxSlots = 4;
        if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
      } else {
        if (FATE_RING.levels[10]) this.player.fateRing.maxSlots = FATE_RING.levels[10].slots;
      }
      if (this.player.fateRing.initSlots) {
        this.player.fateRing.initSlots();
      }
    }

    // 3. 获得所有法则
    if (typeof LAWS !== 'undefined') {
      this.player.collectedLaws = [];
      for (const key in LAWS) {
        this.player.collectedLaws.push(JSON.parse(JSON.stringify(LAWS[key])));
      }
      this.player.lawsCollected = this.player.collectedLaws.length;
    }

    // 4. 获得所有法宝
    if (typeof TREASURES !== 'undefined') {
      // 清空并重新收集所有法宝
      this.player.collectedTreasures = [];
      this.player.equippedTreasures = [];
      for (const key in TREASURES) {
        const treasure = TREASURES[key];
        // 深拷贝法宝数据
        const treasureCopy = JSON.parse(JSON.stringify(treasure));
        // 确保图标等属性被复制
        treasureCopy.icon = treasure.icon;
        treasureCopy.callbacks = treasure.callbacks;
        treasureCopy.getDesc = treasure.getDesc;
        this.player.collectedTreasures.push(treasureCopy);
      }
      Utils.showBattleLog(`【天道馈赠】获得所有 ${this.player.collectedTreasures.length} 个法宝！`);
    }

    // 5. 解锁所有技能（如果有冷却重置）
    if (this.player.skillCooldown !== undefined) {
      this.player.skillCooldown = 0;
    }

    // 6. 解锁所有关卡
    this.player.maxRealm = 14;
    if (typeof RealmManager !== 'undefined') {
      RealmManager.unlockAll();
    }

    // 7. 打开怪物调试面板
    this.showCheatMonsterSelector();
    this.updateUI();
    Utils.showBattleLog('【作弊生效】富可敌国，神功大成，万界通行！');
  }

  // 作弊：怪物选择器
  showCheatMonsterSelector() {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showCheatMonsterSelector();
  }
  startDebugBattle(realm, type) {
    const characterId = typeof this.player?.characterId === 'string' && this.player.characterId ? this.player.characterId : 'linFeng';
    if (this.player && typeof this.player.getRunDestinyMeta === 'function' && !this.player.getRunDestinyMeta() && typeof this.player.setRunDestiny === 'function') {
      const runDestinyId = this.selectedRunDestinyId || this.resolveDefaultRunDestinyId(characterId);
      if (runDestinyId) this.player.setRunDestiny(runDestinyId, 1);
    }
    if (this.player && typeof this.player.getSpiritCompanionMeta === 'function' && !this.player.getSpiritCompanionMeta() && typeof this.player.setSpiritCompanion === 'function') {
      const spiritCompanionId = this.selectedSpiritCompanionId || this.resolveDefaultSpiritCompanionId(characterId);
      if (spiritCompanionId) this.player.setSpiritCompanion(spiritCompanionId, 1);
    }
    if (this.player && typeof this.player.getRunPathMeta === 'function' && !this.player.getRunPathMeta() && typeof this.player.setRunPath === 'function') {
      const runPathId = this.selectedRunPathId || this.resolveDefaultRunPathId(characterId);
      if (runPathId) this.player.setRunPath(runPathId);
    }

    // 1. 切换环境
    this.player.realm = realm;
    this.updateRealmBackground(); // 确保背景切换

    // 2. 获取敌人数据
    let enemyData;
    if (type === 'boss') {
      // 尝试查找特定境界 Boss，找不到则随机
      const bosses = Object.values(ENEMIES).filter(e => e.isBoss && (e.realm === realm || !e.realm));
      enemyData = bosses.length > 0 ? Utils.deepClone(bosses[0]) : Utils.deepClone(ENEMIES.boss_generic || ENEMIES.boss_1);
      // 强制修正名字以显示测试
      enemyData.name = `(Test) ${enemyData.name}`;
    } else {
      // 随机小怪
      const minions = Object.values(ENEMIES).filter(e => !e.isBoss && (e.realm === realm || !e.realm));
      enemyData = minions.length > 0 ? Utils.deepClone(minions[Math.floor(Math.random() * minions.length)]) : Utils.deepClone(ENEMIES.basic_soldier);
    }

    // 3. 开始战斗
    this.showScreen('battle-screen');
    this.lastExpeditionRewardMeta = null;
    this.lastRunPathRewardMeta = null;
    this.dismissRunPathMapFeedback();
    if (this.battle) {
      this.battle.init([enemyData]);
    }

    // 6. 恢复满血
    this.player.currentHp = this.player.maxHp;

    // 7. 更新UI
    this.player.recalculateStats();
    if (this.currentScreen === 'map-screen' && this.map) {
      this.map.updateStatusBar();
    }
    const lawCount = this.player.collectedLaws ? this.player.collectedLaws.length : 0;
    const treasureCount = this.player.collectedTreasures ? this.player.collectedTreasures.length : 0;
    Utils.showBattleLog(`【天道崩塌】作弊成功！已获得：千万灵石、满级命环、${lawCount}个法则、${treasureCount}个法宝！`);

    // 自动保存并同步云端
    this.saveGame();
  }
  showFateRing() {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.showFateRing();
  }

  // Optimized UI Updater (Full State Refresh without Re-render)
  updateUIState(ring) {
    // 1. Update Slots
    ring.slots.forEach((slot, index) => {
      const slotEl = document.getElementById(`ring-slot-${index}`);
      if (!slotEl) return;

      // Update Classes
      slotEl.className = `ring-slot-3d ${!slot.unlocked ? 'locked' : ''} ${this.selectedRingSlot === index ? 'active' : ''}`;

      // Update Content
      const law = slot.law ? LAWS[slot.law] : null;
      const subLaw = slot.subLaw ? LAWS[slot.subLaw] : null;
      let content = '';
      if (law) {
        if (subLaw) {
          content = `
                        <div class="slot-inner-icon main">${law.icon}</div>
                        <div class="slot-fusion-icon" style="position:absolute; bottom:-10px; right:-10px; font-size:1rem; background:#000; border-radius:50%; border:1px solid gold; width:25px; height:25px; display:flex; justify-content:center; align-items:center;">${subLaw.icon}</div>
                     `;
        } else {
          content = `<div class="slot-inner-icon">${law.icon}</div>`;
        }
      } else if (!slot.unlocked) {
        content = `<div class="slot-inner-icon" style="font-size:1.2rem; filter: grayscale(1);">🔒</div>`;
      } else {
        content = `<div class="slot-inner-icon" style="opacity:0.2; font-size: 2rem;">+</div>`;
      }
      if (slotEl.innerHTML !== content) slotEl.innerHTML = content;
    });

    // 2. Update Library Items
    const equippedLaws = ring.getSocketedLaws();
    const libraryItems = document.querySelectorAll('.law-item-row');
    libraryItems.forEach(item => {
      const lawId = item.dataset.id;
      const isEquipped = equippedLaws.includes(lawId);
      const statusIcon = item.querySelector('.law-status-icon');
      if (isEquipped) {
        item.classList.add('equipped');
        // statusIcon content managed via CSS 'content' but we can safeguard here or leave it generic
      } else {
        item.classList.remove('equipped');
      }
    });

    // 3. Update Stats (Left Panel) - Lightweight enough to re-render
    const statsList = document.getElementById('modal-ring-stats');
    if (statsList) {
      statsList.innerHTML = '';
      const bonus = ring.getStatsBonus();
      if (bonus.maxHp) statsList.innerHTML += this.createStatRow('生命上限', `+${bonus.maxHp}`, '❤️');
      if (bonus.energy) statsList.innerHTML += this.createStatRow('基础灵力', `+${bonus.energy}`, '⚡');
      if (bonus.draw) statsList.innerHTML += this.createStatRow('每回合抽牌', `+${bonus.draw}`, '🎴');
    }
  }

  // Tab Switcher
  switchRingTab(tabEl, tabName) {
    document.querySelectorAll('.panel-tabs .tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-content-${tabName}`).classList.add('active');
  }
  getRandomRune() {
    const runes = ['⚡', '🔥', '❄️', '🌪️', '👁️', '⚔️', '🛡️', '🔮', '🌙', '☀️', '☯️', '📜'];
    return runes[Math.floor(Math.random() * runes.length)];
  }
  createStatRow(label, value, icon) {
    return `
            <div class="stat-row-3d">
                <span style="color:#aaa"><span style="margin-right:5px">${icon}</span>${label}</span>
                <span style="color:#fff; font-weight:bold">${value}</span>
            </div>
        `;
  }
  handleSlotClick(index, e) {
    e.stopPropagation();
    const ring = this.player.fateRing;
    const slotData = ring.slots[index];
    if (!slotData.unlocked) {
      if (ring.type === 'sealed' && ring.canUnseal && ring.canUnseal(index)) {
        this.showConfirmModal(`该槽位被【逆生咒】封印。\n强制血契解封将永久扣除当前最大生命值的30%！\n是否解封并获得灵力与抽牌增益？`, () => {
          if (ring.sacrificeUnseal) {
            const success = ring.sacrificeUnseal(index);
            if (success) {
              this.showFateRing(); // Structure change needs full refresh
              this.autoSave();
            }
          } else {
            ring.unseal(index);
            this.showFateRing();
            this.autoSave();
          }
        });
      } else {
        Utils.showBattleLog('该槽位尚未解锁');
      }
      return;
    }

    // Click Logic:
    // 1. If slot has law -> Unload it
    // 2. If slot empty -> Select it
    if (slotData.law) {
      // Mutated Ring Special: If fusion, remove subLaw first?
      if (ring.type === 'mutated' && slotData.subLaw) {
        slotData.subLaw = null;
        Utils.showBattleLog('融合法则已移除');
      } else {
        ring.socketLaw(index, null);
        Utils.showBattleLog('法则已卸载');
      }
      this.player.recalculateStats();
      this.updateUIState(ring); // Optimized update
      this.autoSave();
    } else {
      this.selectedRingSlot = this.selectedRingSlot === index ? undefined : index;
      this.updateUIState(ring); // Optimized update
    }
  }

  // Removed bindRingDragEvents (Interaction removed per user request)

  // Updated bindLibraryEvents for optimized updates
  bindLibraryEvents() {
    return Game.prototype.ensureEventManager.call(this).bindLibraryEvents();
  }

  // 渲染当前路径信息
  renderCurrentPathInfo(ring) {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.renderCurrentPathInfo(ring);
  }

  // 渲染角色专属面板
  renderCharacterSpecifics(ring) {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.renderCharacterSpecifics(ring);
  }

  // 渲染进化按钮（如果有）
  renderEvolveButton(ring) {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.renderEvolveButton(ring);
  }

  // 渲染法则库列表 (Redesigned)
  renderLawLibrary(ring) {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.renderLawLibrary(ring);
  }

  // 渲染法则共鸣 (Redesigned)
  renderResonances(ring) {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.renderResonances(ring);
  }

  // 绑定命环界面事件
  bindRingEvents() {
    return Game.prototype.ensureEventManager.call(this).bindRingEvents();
  }

  // 显示进化选项（为了复用之前的逻辑，这里把之前的 showFateRing 里的进化部分提出来）
  showEvolveOptions() {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.showEvolveOptions();
  }

  // 进化命环
  evolveFateRing(pathId) {
    const path = FATE_RING.paths[pathId];
    if (!path) return;

    // 记录之前的路径
    if (!this.player.fateRing.unlockedPaths) {
      this.player.fateRing.unlockedPaths = [];
    }
    if (this.player.fateRing.path && this.player.fateRing.path !== 'crippled') {
      this.player.fateRing.unlockedPaths.push(this.player.fateRing.path);
    }

    // 设置新路径
    this.player.fateRing.path = pathId;

    // 应用路径加成
    this.applyPathBonus(path);
    Utils.showBattleLog(`命环进化！获得【${path.name}】！`);

    // 关闭并重新打开以刷新UI
    this.closeModal();
    setTimeout(() => this.showFateRing(), 100);
    this.autoSave();
  }

  // 应用路径加成
  applyPathBonus(path) {
    if (!path.bonus) return;
    switch (path.bonus.type) {
      case 'hpBonus':
        this.player.maxHp += path.bonus.value;
        this.player.currentHp += path.bonus.value;
        break;
      case 'energyBonus':
        this.player.baseEnergy += path.bonus.value;
        break;
      case 'drawBonus':
        this.player.drawCount += path.bonus.value;
        break;
      case 'damageBonus':
        // Store permanent damage bonus from Fate Ring
        this.player.fateRingDamageBonus = (this.player.fateRingDamageBonus || 0) + path.bonus.value;
        break;
      case 'ultimate':
        // Defiance: 免疫一次致死
        if (this.player.fateRing) {
          this.player.fateRing.deathImmunityCount = (this.player.fateRing.deathImmunityCount || 0) + 1;
        }
        break;
    }
  }

  // 显示游戏介绍（v7.0 开发线）
  // 切换游戏介绍标签页
  switchIntroTab(tabId) {
    const nextTab = ['overview', 'mechanics', 'controls', 'updates'].includes(tabId) ? tabId : 'overview';
    document.querySelectorAll('.intro-tab-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === nextTab) btn.classList.add('active');
    });
    const contentPanel = document.getElementById('intro-tab-content');
    if (contentPanel) {
      contentPanel.innerHTML = this.introTabContent && this.introTabContent[nextTab] || '';
      contentPanel.dataset.activeTab = nextTab;
      contentPanel.classList.add('active');
    }
    const scrollArea = document.querySelector('.intro-content-area');
    if (scrollArea) {
      scrollArea.scrollTop = 0;
    }
  }
  showGameIntro() {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showGameIntro();
  }

  // 卡牌使用效果
  playCardEffect(targetEl, cardType) {
    if (typeof particles !== 'undefined') {
      particles.playCardEffect(targetEl, cardType);
    }
  }
  closeRewardModal(options = {}) {
    const modal = document.getElementById('reward-modal');
    if (!modal || !modal.classList || !modal.classList.contains('active')) return false;
    modal.classList.remove('active');
    const callback = modal.onCloseCallback;
    modal.onCloseCallback = null;
    if (options.invokeCallback !== false && typeof callback === 'function') {
      callback();
    }
    return true;
  }

  // 关闭模态框
  closeModal(options = {}) {
    const invokeRewardCallback = options.invokeRewardCallback !== false;
    this.closeRewardModal({
      invokeCallback: invokeRewardCallback
    });
    document.querySelectorAll('.modal').forEach(modal => {
      if (modal.id === 'reward-modal') return;
      modal.classList.remove('active');
      modal.classList.remove('upgrade-mode'); // Clean up upgrade UI overrides
    });

    // Specific Modals (lacking generic class)
    const purification = document.getElementById('purification-modal');
    if (purification) purification.classList.remove('active');
  }

  // ========== 商店功能 ==========

  shopNode = null;
  shopItems = []; // 卡牌商品
  shopServices = []; // 特殊服务/道具

  // 显示商店
  showShop(node) {
    this.shopNode = node;
    this.shopCatalog = this.generateShopCatalog();
    this.shopActiveTab = this.shopActiveTab || 'base';
    this.syncActiveShopTab();
    this.renderShop();
    this.showScreen('shop-screen');
  }

  // 生成商店数据
  generateShopData() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.generateShopData();
  }

  // 获取加权随机法宝
  getWeightedRandomTreasure() {
    if (typeof TREASURES === 'undefined') return null;
    const unowned = Object.values(TREASURES).filter(t => !this.player.hasTreasure(t.id));
    if (unowned.length === 0) return null;

    // Weights
    const weights = {
      common: 60,
      uncommon: 30,
      rare: 10,
      epic: 5,
      legendary: 2
    };
    const totalWeight = unowned.reduce((sum, t) => sum + (weights[t.rarity] || 10), 0);
    let roll = Math.random() * totalWeight;
    for (const t of unowned) {
      roll -= weights[t.rarity] || 10;
      if (roll <= 0) return t;
    }
    return unowned[0];
  }

  // 生成商店卡牌 (封装以便刷新使用)
  generateShopCards(count = 5) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.generateShopCards(count);
  }

  // 更新UI
  updateUI() {
    if (this.currentScreen === 'map-screen') {
      this.map.render();
      this.updatePlayerDisplay();
    } else if (this.currentScreen === 'battle-screen') {
      this.updatePlayerDisplay();
      if (this.battle) {
        this.battle.updateBattleUI();
        this.updateActiveSkillUI();
      }
    }
  }

  // 更新主动技能UI
  updateActiveSkillUI() {
    const btn = document.getElementById('active-skill-btn');
    if (!btn) return;
    const skill = this.player.activeSkill;
    if (!skill || this.player.skillLevel === 0) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'flex';

    // Icon
    const iconEl = btn.querySelector('.skill-icon');
    if (iconEl) iconEl.textContent = skill.icon;

    // Tooltip
    const nameEl = btn.querySelector('.skill-name');
    const descEl = btn.querySelector('.skill-desc');
    if (nameEl) nameEl.textContent = skill.name + (this.player.skillLevel > 1 ? ` Lv.${this.player.skillLevel} ` : '');
    if (descEl) {
      if (skill.getDescription) {
        descEl.textContent = skill.getDescription(this.player.skillLevel);
      } else {
        descEl.textContent = skill.description;
      }
    }

    // Cooldown - Color Recovery Progress
    const overlay = btn.querySelector('.skill-cooldown-overlay');
    const text = btn.querySelector('.skill-cooldown-text');
    const loreEl = btn.querySelector('.skill-lore');
    if (this.player.skillCooldown > 0) {
      // 计算恢复进度 (0-1，0表示完全冷却，1表示即将可用)
      const progress = 1 - this.player.skillCooldown / this.player.maxCooldown;

      // 不显示CD文本
      text.textContent = '';
      text.style.display = 'none';

      // 通过颜色恢复表示进度
      // 灰度从100%逐渐降低到0%
      const grayscale = (1 - progress) * 100;
      // 透明度从0.5逐渐增加到1
      const opacity = 0.5 + progress * 0.5;
      btn.style.filter = `grayscale(${grayscale}%)`;
      btn.style.opacity = opacity;

      // Overlay不再使用，设为0
      overlay.style.height = '0%';
      btn.classList.add('cooldown');
      btn.classList.remove('ready');

      // 在lore位置显示CD信息（仅tooltip可见）
      if (loreEl) {
        loreEl.textContent = `冷却中: ${this.player.skillCooldown} 回合`;
      }
    } else {
      overlay.style.height = '0%';
      text.textContent = '';
      text.style.display = 'none';
      btn.style.filter = 'none';
      btn.style.opacity = '1';
      btn.classList.remove('cooldown');
      btn.classList.add('ready');

      // 恢复lore文本
      if (loreEl) {
        loreEl.textContent = '"逆乱阴阳，颠倒乾坤。"';
      }
    }
  }

  // 激活主动技能 - 点击按钮触发
  // 激活主动技能 - 点击按钮触发
  activatePlayerSkill() {
    if (this.currentScreen !== 'battle-screen') return;
    if (this.battle.currentTurn !== 'player') {
      Utils.showBattleLog('现在不是你的回合！');
      return;
    }

    // 预检查：是否冷却中
    if (this.player.skillCooldown > 0) {
      Utils.showBattleLog(`技能冷却中(${this.player.skillCooldown})`);
      return;
    }

    // 直接通过验证，执行技能
    if (this.player.activateSkill(this.battle)) {
      this.updateActiveSkillUI();
      this.battle.updateBattleUI();
      // 增强反馈
      const btn = document.getElementById('active-skill-btn');
      if (btn) {
        Utils.addShakeEffect(btn);
        btn.classList.remove('ready');

        // Add particle effect customization here if needed
      }

      // Visual Flash
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,255,255,0.3);pointer-events:none;z-index:9999;transition:opacity 0.5s;';
      document.body.appendChild(flash);
      setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 500);
      }, 50);
      if (typeof audioManager !== 'undefined') audioManager.playSFX('buff');
    }
  }

  // 显示技能确认弹窗
  showSkillConfirmModal() {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showSkillConfirmModal();
  }

  // 确认释放技能
  confirmActivateSkill() {
    this.closeModal(); // 关闭弹窗

    if (this.player.activateSkill(this.battle)) {
      this.updateActiveSkillUI();
      this.battle.updateBattleUI();
      // 增强反馈
      const btn = document.getElementById('active-skill-btn');
      if (btn) {
        Utils.addShakeEffect(btn);
        btn.classList.remove('ready');

        // Add particle effect logic if present, omitted for brevity/safety
        if (typeof particles !== 'undefined') {
          // particles.createBurst(btn);
        }
      }

      // Visual Flash
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,255,255,0.3);pointer-events:none;z-index:9999;transition:opacity 0.5s;';
      document.body.appendChild(flash);
      setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 500);
      }, 50);
      if (typeof audioManager !== 'undefined') audioManager.playSFX('buff');
    }
  }

  // 显示奖励弹窗
  showRewardModal(title, message, icon = '🎁', onClose = null) {
    Game.prototype.ensureRewardView.call(this);
    this.rewardView.showRewardModal(title, message, icon, onClose);
  }

  // 显示通用确认弹窗
  showConfirmModal(message, onConfirm, onCancel = null) {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showConfirmModal(message, onConfirm, onCancel);
  }

  // 显示通用提示弹窗 (Alert)
  showAlertModal(message, title = '提示', onOk = null) {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showAlertModal(message, title, onOk);
  }

  // 获取卡牌基础价格
  getCardPrice(card) {
    const rarityPrices = {
      basic: 0,
      common: 60,
      uncommon: 100,
      rare: 180,
      epic: 300,
      legendary: 500
    };
    return rarityPrices[card.rarity] || 60;
  }
  getCardRarityLabel(rarity = 'common') {
    const normalized = String(rarity || 'common').toLowerCase();
    const map = {
      basic: '基础',
      common: '普通',
      uncommon: '优秀',
      rare: '稀有',
      epic: '史诗',
      legendary: '传说'
    };
    return map[normalized] || map.common;
  }
  normalizeShopRumors(rumors = null) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.normalizeShopRumors(rumors);
  }
  ensureShopRumors() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.ensureShopRumors();
  }
  getStrategicEngineeringCatalog() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getStrategicEngineeringCatalog();
  }
  createDefaultStrategicEngineeringState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.createDefaultStrategicEngineeringState();
  }
  resolveStrategicEngineeringTier(progress = 0, thresholds = []) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.resolveStrategicEngineeringTier(progress, thresholds);
  }
  normalizeStrategicEngineering(source = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeStrategicEngineering(source);
  }
  ensureStrategicEngineeringState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.ensureStrategicEngineeringState();
  }
  getStrategicEngineeringTrackSnapshot(trackId = '', sourceState = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getStrategicEngineeringTrackSnapshot(trackId, sourceState);
  }
  getStrategicEngineeringSnapshot() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getStrategicEngineeringSnapshot();
  }
  getStrategicEngineeringWeightShift() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getStrategicEngineeringWeightShift();
  }
  getStrategicEngineeringEventBiasProfile() {
    return Game.prototype.ensureEventManager.call(this).getStrategicEngineeringEventBiasProfile();
  }
  createDefaultHeavenlyMandateState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.createDefaultHeavenlyMandateState();
  }
  normalizeHeavenlyMandateTask(source = null, index = 0, laneId = 'expedition') {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeHeavenlyMandateTask(source, index, laneId);
  }
  normalizeHeavenlyMandateFocusTask(source = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeHeavenlyMandateFocusTask(source);
  }
  buildHeavenlyMandateDebtFocusTask(debtPack = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.buildHeavenlyMandateDebtFocusTask(debtPack);
  }
  normalizeHeavenlyMandateLane(source = null, index = 0) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeHeavenlyMandateLane(source, index);
  }
  normalizeHeavenlyMandateHistoryEntry(source = null, index = 0) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeHeavenlyMandateHistoryEntry(source, index);
  }
  normalizeHeavenlyMandateState(source = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeHeavenlyMandateState(source);
  }
  ensureHeavenlyMandateState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.ensureHeavenlyMandateState();
  }
  createDefaultSeasonVerificationState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.createDefaultSeasonVerificationState();
  }
  normalizeSeasonBoardClaimedLaneRewards(source = null) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardClaimedLaneRewards(source);
  }
  normalizeSeasonVerificationRecord(source = null, index = 0) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeSeasonVerificationRecord(source, index);
  }
  normalizeSeasonVerificationState(source = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeSeasonVerificationState(source);
  }
  ensureSeasonVerificationState(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.ensureSeasonVerificationState(options);
  }
  getSeasonVerificationSaveState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getSeasonVerificationSaveState();
  }
  recordSeasonVerificationResult(source = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.recordSeasonVerificationResult(source);
  }
  getSeasonVerificationSnapshot(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getSeasonVerificationSnapshot(options);
  }
  getCommittedSeasonBoardFrontierResolution(options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getCommittedSeasonBoardFrontierResolution(options);
  }
  getSeasonBoardFrontierResolutionArchiveRecords(options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getSeasonBoardFrontierResolutionArchiveRecords(options);
  }
  buildSeasonBoardFrontierChronicleArchive(frontier = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardFrontierChronicleArchive(frontier, context);
  }
  normalizeSeasonBoardFrontierChronicleArchive(source = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardFrontierChronicleArchive(source, context);
  }
  buildSeasonBoardChapterArc(context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardChapterArc(context);
  }
  normalizeSeasonBoardChapterArc(source = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardChapterArc(source, context);
  }
  getSeasonVerificationActionMeta(anchorSection = '', options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getSeasonVerificationActionMeta(anchorSection, options);
  }
  normalizeSeasonVerificationArchiveEntry(source = null, index = 0) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeSeasonVerificationArchiveEntry(source, index);
  }
  normalizeSeasonVerificationArchiveSnapshot(source = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeSeasonVerificationArchiveSnapshot(source);
  }
  buildSeasonVerificationArchiveSnapshot(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.buildSeasonVerificationArchiveSnapshot(options);
  }
  getSeasonVerificationArchiveSnapshot(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getSeasonVerificationArchiveSnapshot(options);
  }
  jumpToSeasonVerificationAnchor(anchorSection = '', options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.jumpToSeasonVerificationAnchor(anchorSection, options);
  }
  followSeasonVerificationRecord(recordId = '') {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.followSeasonVerificationRecord(recordId);
  }
  followSeasonBoardTask(taskId = '') {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.followSeasonBoardTask(taskId);
  }
  jumpToHeavenlyMandateAnchor(anchorSection = '', options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.jumpToHeavenlyMandateAnchor(anchorSection, options);
  }
  followHeavenlyMandateTask(taskId = '') {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.followHeavenlyMandateTask(taskId);
  }
  createDefaultFateAftereffectState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.createDefaultFateAftereffectState();
  }
  normalizeFateAftereffectRecord(source = null, index = 0) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeFateAftereffectRecord(source, index);
  }
  normalizeFateAftereffectState(source = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.normalizeFateAftereffectState(source);
  }
  ensureFateAftereffectState(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.ensureFateAftereffectState(options);
  }
  getFateAftereffectSaveState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getFateAftereffectSaveState();
  }
  getFateAftereffectCurrentChapterIndex(context = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getFateAftereffectCurrentChapterIndex(context);
  }
  getFateAftereffectRuntimeRecord(source = null, context = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getFateAftereffectRuntimeRecord(source, context);
  }
  createFateAftereffectFromSanctumAgenda(resolved = null, context = {}) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.createFateAftereffectFromSanctumAgenda(resolved, context);
  }
  getFateAftereffectSnapshot(context = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getFateAftereffectSnapshot(context);
  }
  getFateAftereffectWeightShift() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getFateAftereffectWeightShift();
  }
  getHeavenlyMandateWeekMeta(dateOverride = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getHeavenlyMandateWeekMeta(dateOverride);
  }
  getHeavenlyMandateSignalSnapshot(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getHeavenlyMandateSignalSnapshot(options);
  }
  getHeavenlyMandateThemeMeta(snapshot = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getHeavenlyMandateThemeMeta(snapshot);
  }
  buildHeavenlyMandateBoard(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.buildHeavenlyMandateBoard(options);
  }
  syncHeavenlyMandateState(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.syncHeavenlyMandateState(options);
  }
  getHeavenlyMandateSaveState() {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getHeavenlyMandateSaveState();
  }
  getHeavenlyMandateExpeditionSnapshot(options = {}) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.getHeavenlyMandateExpeditionSnapshot(options);
  }
  getSeasonBoardSignalSnapshot(options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getSeasonBoardSignalSnapshot(options);
  }
  getSeasonBoardPhaseMeta(snapshot = null) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getSeasonBoardPhaseMeta(snapshot);
  }
  normalizeSeasonBoardSettlement(source = null) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardSettlement(source);
  }
  normalizeSeasonBoardDebtPack(source = null) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardDebtPack(source);
  }
  normalizeSeasonBoardVerificationOrder(source = null, index = 0) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardVerificationOrder(source, index);
  }
  normalizeSeasonBoardWeekVerdictLedger(source = null) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardWeekVerdictLedger(source);
  }
  buildSeasonBoardSettlementState(signals = {}, phase = null) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardSettlementState(signals, phase);
  }
  getSeasonBoardLaneRewardDefinition(laneId = '') {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getSeasonBoardLaneRewardDefinition(laneId);
  }
  formatSeasonBoardLaneRewardGainLine(gains = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.formatSeasonBoardLaneRewardGainLine(gains);
  }
  getSeasonBoardLaneRewardClaim(weekTag = '', laneId = '') {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getSeasonBoardLaneRewardClaim(weekTag, laneId);
  }
  buildSeasonBoardLaneRewards(lanes = [], context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardLaneRewards(lanes, context);
  }
  buildSeasonBoardFrontier(lanes = [], context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardFrontier(lanes, context);
  }
  buildSeasonBoardFrontierDecree(frontier = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardFrontierDecree(frontier, context);
  }
  buildSeasonBoardFrontierChronicle(frontier = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardFrontierChronicle(frontier, context);
  }
  buildSeasonBoardFrontierCouncil(frontier = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardFrontierCouncil(frontier, context);
  }
  buildSeasonBoardFrontierResolution(frontier = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardFrontierResolution(frontier, context);
  }
  normalizeSeasonBoardFrontierDecree(source = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardFrontierDecree(source, context);
  }
  normalizeSeasonBoardFrontierChronicle(source = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardFrontierChronicle(source, context);
  }
  normalizeSeasonBoardFrontierCouncil(source = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardFrontierCouncil(source, context);
  }
  normalizeSeasonBoardFrontierResolution(source = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardFrontierResolution(source, context);
  }
  normalizeSeasonBoardFrontier(source = null, context = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardFrontier(source, context);
  }
  commitSeasonBoardFrontierResolution(choiceId = '', options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.commitSeasonBoardFrontierResolution(choiceId, options);
  }
  claimSeasonBoardLaneReward(laneId = '', options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.claimSeasonBoardLaneReward(laneId, options);
  }
  normalizeSeasonBoardSnapshot(source = null) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.normalizeSeasonBoardSnapshot(source);
  }
  buildSeasonBoardRouteDirective(options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.buildSeasonBoardRouteDirective(options);
  }
  getSeasonBoardSnapshot(options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getSeasonBoardSnapshot(options);
  }
  getSeasonBoardWeightShift(options = {}) {
    if (!this.seasonBoardManager) this.seasonBoardManager = new SeasonBoardManager(this);
    return this.seasonBoardManager.getSeasonBoardWeightShift(options);
  }
  createDefaultSanctumAgendaState() {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.createDefaultSanctumAgendaState();
  }
  normalizeSanctumAgendaNodeTypes(list = [], limit = 4) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.normalizeSanctumAgendaNodeTypes(list, limit);
  }
  inferSanctumAgendaNodeTypes(values = [], fallbackThemeKey = '') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.inferSanctumAgendaNodeTypes(values, fallbackThemeKey);
  }
  getSanctumAgendaNodeMeta(nodeType = '') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.getSanctumAgendaNodeMeta(nodeType);
  }
  formatSanctumAgendaNodeLine(nodeTypes = [], prefix = '优先节点') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.formatSanctumAgendaNodeLine(nodeTypes, prefix);
  }
  formatSanctumAgendaCurrencyLine(cost = null, emptyLabel = '无需额外代价') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.formatSanctumAgendaCurrencyLine(cost, emptyLabel);
  }
  sanitizeSanctumAgendaWeightShift(value = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.sanitizeSanctumAgendaWeightShift(value);
  }
  mergeSanctumAgendaWeightShifts(...values) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.mergeSanctumAgendaWeightShifts(...values);
  }
  normalizeSanctumAgendaDecisionOptions(list = [], agendaName = '洞府议程') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.normalizeSanctumAgendaDecisionOptions(list, agendaName);
  }
  normalizeSanctumAgendaContractOptions(list = [], agendaName = '洞府议程') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.normalizeSanctumAgendaContractOptions(list, agendaName);
  }
  resolveSanctumAgendaPhase(record = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.resolveSanctumAgendaPhase(record);
  }
  normalizeSanctumAgendaRecord(source = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.normalizeSanctumAgendaRecord(source);
  }
  normalizeSanctumAgendaState(source = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.normalizeSanctumAgendaState(source);
  }
  ensureSanctumAgendaState() {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.ensureSanctumAgendaState();
  }
  getSanctumAgendaSaveState() {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.getSanctumAgendaSaveState();
  }
  resetSanctumAgendaRunState(reason = 'new_run') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.resetSanctumAgendaRunState(reason);
  }
  getSanctumAgendaSourceSnapshot() {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.getSanctumAgendaSourceSnapshot();
  }
  buildSanctumAgendaCatalog() {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.buildSanctumAgendaCatalog();
  }
  getSanctumAgendaDashboard() {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.getSanctumAgendaDashboard();
  }
  activateSanctumAgenda(agendaId = '') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.activateSanctumAgenda(agendaId);
  }
  applySanctumAgendaDecisionChoice(activeAgenda = null, decisionOption = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.applySanctumAgendaDecisionChoice(activeAgenda, decisionOption);
  }
  chooseSanctumAgendaDecision(optionId = '') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.chooseSanctumAgendaDecision(optionId);
  }
  applySanctumAgendaContractChoice(activeAgenda = null, contractOption = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.applySanctumAgendaContractChoice(activeAgenda, contractOption);
  }
  chooseSanctumAgendaContract(optionId = '') {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.chooseSanctumAgendaContract(optionId);
  }
  getSanctumAgendaWeightShift() {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.getSanctumAgendaWeightShift();
  }
  recordSanctumAgendaNodeProgress(nodeType = '', context = {}) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.recordSanctumAgendaNodeProgress(nodeType, context);
  }
  applySanctumAgendaOutcomeReward(resolution = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.applySanctumAgendaOutcomeReward(resolution);
  }
  formatSanctumAgendaRecoveryHint(reasonId = '', agenda = null, context = {}) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.formatSanctumAgendaRecoveryHint(reasonId, agenda, context);
  }
  buildSanctumAgendaFailureRecovery(activeAgenda = null, context = {}) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.buildSanctumAgendaFailureRecovery(activeAgenda, context);
  }
  applySanctumAgendaFailureRecovery(resolution = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.applySanctumAgendaFailureRecovery(resolution);
  }
  buildSanctumAgendaFailureRecoveryNotice(resolution = null) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.buildSanctumAgendaFailureRecoveryNotice(resolution);
  }
  resolveSanctumAgenda(reason = 'realm_clear', context = {}) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.resolveSanctumAgenda(reason, context);
  }
  getSanctumAgendaExpeditionSnapshot(context = {}) {
    if (!this.sanctumAgendaManager) this.sanctumAgendaManager = new SanctumAgendaManager(this);
    return this.sanctumAgendaManager.getSanctumAgendaExpeditionSnapshot(context);
  }
  applyStrategicEngineeringMilestoneReward(track = null) {
    if (!this.metaProgressionManager) this.metaProgressionManager = new MetaProgressionManager(this);
    return this.metaProgressionManager.applyStrategicEngineeringMilestoneReward(track);
  }
  recordStrategicNodeEngineering(nodeType = '', context = {}) {
    const trackId = String(nodeType || '').trim();
    const catalog = this.getStrategicEngineeringCatalog();
    if (!catalog[trackId] || !this.player) return null;
    const state = this.ensureStrategicEngineeringState();
    const before = this.getStrategicEngineeringTrackSnapshot(trackId, state);
    const trackState = state.tracks[trackId];
    trackState.progress = Math.max(0, Math.floor(Number(trackState.progress) || 0)) + 1;
    trackState.lastRealm = Number.isFinite(Number(context.realm)) ? Math.max(0, Math.floor(Number(context.realm))) : Math.max(0, Math.floor(Number(this.player.realm) || 0));
    trackState.tier = this.resolveStrategicEngineeringTier(trackState.progress, catalog[trackId].thresholds);
    const after = this.getStrategicEngineeringTrackSnapshot(trackId, state);
    const advanced = !!after && !!before && after.tier > before.tier;
    if (advanced) {
      state.lastAdvancedTrackId = trackId;
      const rewardSummary = this.applyStrategicEngineeringMilestoneReward(after);
      const historyLine = `${after.icon} ${after.name}推进至 ${after.tierLabel}：${after.effectSummary}${rewardSummary ? `｜${rewardSummary}` : ''}`;
      state.history.push(historyLine);
      state.history = state.history.slice(-8);
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog(`【${after.name}】推进至 ${after.tierLabel}：${after.effectSummary}${rewardSummary ? `（${rewardSummary}）` : ''}`);
      }
    } else if (after) {
      state.history.push(`${after.icon} ${after.name}推进 ${after.progress}${after.nextTarget != null ? ` / ${after.nextTarget}` : ''} · ${after.nextTarget != null ? `距${after.nextTierLabel}还需 ${after.remaining} 次${after.nodeLabel}` : '当前已达最高工事阶'}`);
      state.history = state.history.slice(-8);
    }
    return {
      trackId,
      before,
      after,
      advanced
    };
  }
  pushShopRumorHistory(entry) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.pushShopRumorHistory(entry);
  }
  getStrategicCurrencyAmount(currency = 'gold') {
    if (!this.player) return 0;
    switch (currency) {
      case 'insight':
        return Math.max(0, Math.floor(Number(this.player.heavenlyInsight) || 0));
      case 'karma':
        return Math.max(0, Math.floor(Number(this.player.karma) || 0));
      case 'gold':
      default:
        return Math.max(0, Math.floor(Number(this.player.gold) || 0));
    }
  }
  getStrategicCurrencyLabel(currency = 'gold') {
    switch (currency) {
      case 'insight':
        return '天机';
      case 'karma':
        return '业果';
      case 'gold':
      default:
        return '灵石';
    }
  }
  getStrategicCurrencyIcon(currency = 'gold') {
    switch (currency) {
      case 'insight':
        return '🔮';
      case 'karma':
        return '🜂';
      case 'gold':
      default:
        return '💰';
    }
  }
  formatShopPrice(item = null) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.formatShopPrice(item);
  }
  canAffordShopItem(item = null) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.canAffordShopItem(item);
  }
  spendShopPrice(item = null) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.spendShopPrice(item);
  }
  updateShopCurrencyDisplays() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.updateShopCurrencyDisplays();
  }
  getShopPriceMultiplier(scalePerRealm = 0.15) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.getShopPriceMultiplier(scalePerRealm);
  }
  generateContractShopServices() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.generateContractShopServices();
  }
  generateRumorShopServices() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.generateRumorShopServices();
  }
  generateShopCatalog() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.generateShopCatalog();
  }
  syncActiveShopTab() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.syncActiveShopTab();
  }
  switchShopTab(tabId = 'base') {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.switchShopTab(tabId);
  }
  getShopRumorSummaryText() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.getShopRumorSummaryText();
  }
  grantStrategicCurrencies(gains = {}, reason = '') {
    if (!this.player) return {
      insight: 0,
      karma: 0
    };
    const insight = Math.max(0, Math.floor(Number(gains.insight) || 0));
    const karma = Math.max(0, Math.floor(Number(gains.karma) || 0));
    if (insight > 0) {
      this.player.heavenlyInsight = this.getStrategicCurrencyAmount('insight') + insight;
    }
    if (karma > 0) {
      this.player.karma = this.getStrategicCurrencyAmount('karma') + karma;
    }
    if ((insight > 0 || karma > 0) && reason) {
      const detail = [];
      if (insight > 0) detail.push(`天机 +${insight}`);
      if (karma > 0) detail.push(`业果 +${karma}`);
      Utils.showBattleLog(`${reason}：${detail.join('，')}`);
    }
    return {
      insight,
      karma
    };
  }
  getBattleStrategicCurrencyRewards(nodeType = '') {
    const normalized = String(nodeType || '').toLowerCase();
    const result = {
      insight: 0,
      karma: 0
    };
    if (normalized === 'elite') {
      result.insight += 1;
      result.karma += 1;
    } else if (normalized === 'boss') {
      result.insight += 2;
      result.karma += 1;
    } else if (normalized === 'trial') {
      result.insight += 1;
    } else if (normalized === 'ghost_duel') {
      result.insight += 1;
      result.karma += 1;
    }
    if (this.player && this.player.maxHp > 0 && this.player.currentHp <= this.player.maxHp * 0.4 && ['elite', 'boss', 'ghost_duel'].includes(normalized)) {
      result.karma += 1;
    }
    return result;
  }
  consumeRewardRumorBoost() {
    const rumors = this.ensureShopRumors();
    if (rumors.rewardRareCharges <= 0 || rumors.rewardRareBonus <= 0) return 0;
    rumors.rewardRareCharges = Math.max(0, rumors.rewardRareCharges - 1);
    if (rumors.rewardRareCharges === 0) rumors.rewardRareBonus = 0;
    return Number(rumors.rewardRareBonus) || 0;
  }
  consumeTreasureRumorBoost(nodeType = '') {
    const normalized = String(nodeType || '').toLowerCase();
    const rumors = this.ensureShopRumors();
    if (!['elite', 'boss', 'ghost_duel'].includes(normalized)) return 0;
    if (rumors.treasureCharges <= 0 || rumors.treasureChanceBonus <= 0) return 0;
    rumors.treasureCharges = Math.max(0, rumors.treasureCharges - 1);
    if (rumors.treasureCharges === 0) rumors.treasureChanceBonus = 0;
    return Number(rumors.treasureChanceBonus) || 0;
  }
  setNextRealmMapRumor(shift, label = '') {
    Game.prototype.ensureRunManager.call(this);
    return this.runManager.setNextRealmMapRumor(shift, label);
  }
  getPendingRouteRumorProfile(realm = null) {
    const rumors = this.ensureShopRumors();
    const target = realm == null ? rumors.nextRealmTarget : Math.max(1, Math.floor(Number(realm) || 1));
    if (!rumors.nextRealmMapShift || !rumors.nextRealmTarget || target !== rumors.nextRealmTarget) return null;
    return {
      shift: {
        ...rumors.nextRealmMapShift
      },
      label: rumors.nextRealmLabel || '未知倾向',
      target: rumors.nextRealmTarget
    };
  }
  consumePendingRouteRumorProfile(realm = null) {
    const rumors = this.ensureShopRumors();
    const target = realm == null ? rumors.nextRealmTarget : Math.max(1, Math.floor(Number(realm) || 1));
    if (!rumors.nextRealmTarget || target !== rumors.nextRealmTarget) return;
    rumors.nextRealmMapShift = null;
    rumors.nextRealmLabel = '';
    rumors.nextRealmTarget = null;
  }

  // 渲染商店
  renderShop() {
    const activeTab = this.syncActiveShopTab();
    this.updateShopCurrencyDisplays();
    const tabBar = document.getElementById('shop-tab-bar');
    if (tabBar) {
      tabBar.innerHTML = '';
      Object.values(this.shopCatalog || {}).forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `shop-tab-btn ${tab.id === this.shopActiveTab ? 'active' : ''}`;
        btn.type = 'button';
        btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span>${tab.label}</span>`;
        btn.onclick = () => this.switchShopTab(tab.id);
        tabBar.appendChild(btn);
      });
    }
    const summaryEl = document.getElementById('shop-tab-summary');
    if (summaryEl) {
      const rumors = this.ensureShopRumors();
      const advice = this.buildShopSpendRecommendation();
      const runPathProfile = typeof this.getRunPathShopProfile === 'function' ? this.getRunPathShopProfile() : null;
      let summaryText = activeTab?.summary || '暂无摘要。';
      if (this.shopActiveTab === 'contract') {
        summaryText = `以业果换取高波动收益。当前业果：${this.getStrategicCurrencyAmount('karma')}。`;
      } else if (this.shopActiveTab === 'rumor') {
        summaryText = rumors.nextRealmLabel ? `已锁定第 ${rumors.nextRealmTarget || '?'} 重路线：${rumors.nextRealmLabel}` : runPathProfile ? `花费天机锁定未来奖励与下一重天路线倾向。当前命途「${runPathProfile.name}」提供专属情报。` : '花费天机锁定未来奖励与下一重天路线倾向。';
      }
      const history = Array.isArray(rumors.history) && rumors.history.length > 0 ? `<div class="shop-summary-history">最近锁定：${rumors.history.slice(-2).join(' ｜ ')}</div>` : '';
      summaryEl.innerHTML = `
                <div class="shop-summary-title">${activeTab?.icon || '🏪'} ${activeTab?.label || '基础页'}</div>
                <div class="shop-summary-text">${summaryText}</div>
                <div class="shop-spend-advice tone-${advice.tone || 'save'}">
                    <span class="shop-advice-badge">${advice.action}</span>
                    <div class="shop-advice-text">${advice.reason}</div>
                    ${advice.forecast?.summary ? `<div class="shop-advice-forecast ${advice.forecast.danger || 'low'}">${advice.forecast.summary}</div>` : ''}
                    ${advice.economy ? `
                        <div class="shop-advice-economy">
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">预算 ${advice.economy.budget}</span>
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">储备线 ${advice.economy.reserveTarget}</span>
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">建议单次 ≤ ${advice.economy.spendCeiling}</span>
                            <span class="shop-economy-chip ${advice.economy.status || 'tight'}">${advice.economy.statusLabel}</span>
                        </div>
                        <div class="shop-advice-note">${advice.economy.note}</div>
                    ` : ''}
                    <div class="shop-advice-meta">
                        <span>最佳卡牌：${advice.bestCard?.item?.card?.name || '暂无'}</span>
                        <span>最佳服务：${advice.bestService?.item?.name || '暂无'}</span>
                    </div>
                </div>
                ${history}
            `;
    }
    const cardSection = document.getElementById('shop-card-section');
    const cardTitle = document.getElementById('shop-card-section-title');
    const cardContainer = document.getElementById('shop-cards');
    if (cardTitle) cardTitle.textContent = activeTab?.cardTitle || '📜 卡牌出售';
    if (cardSection) cardSection.style.display = this.shopActiveTab === 'base' ? 'block' : 'none';
    if (cardContainer) {
      cardContainer.innerHTML = '';
      this.shopItems.forEach((item, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'shop-card-wrapper';
        const cardEl = Utils.createCardElement(item.card, index);
        cardEl.classList.add(`rarity-${item.card.rarity || 'common'}`);
        if (item.sold) cardEl.classList.add('sold');
        cardEl.style.cursor = 'zoom-in';
        cardEl.addEventListener('click', () => {
          const fit = this.evaluateShopCardDeckFit(item.card);
          Utils.showCardDetail(item.card, {
            sectionLabel: '商店详情',
            sourceLabel: activeTab?.label || '基础页',
            priceText: item.sold ? '已售出' : this.formatShopPrice(item),
            availabilityText: item.sold ? '已售出' : this.canAffordShopItem(item) ? '可购买' : '资源不足',
            usageHint: fit.reason,
            extraSummaryRows: fit.summaryRows,
            closeLabel: '返回商店'
          });
        });
        const priceBtn = document.createElement('div');
        priceBtn.className = `card-price ${this.canAffordShopItem(item) && !item.sold ? '' : 'cannot-afford'}`.trim();
        priceBtn.innerHTML = item.sold ? '已售出' : this.formatShopPrice(item);
        if (!item.sold) {
          priceBtn.addEventListener('click', () => this.buyItem('card', index));
          priceBtn.style.cursor = 'pointer';
        }
        wrapper.appendChild(cardEl);
        wrapper.appendChild(priceBtn);
        cardContainer.appendChild(wrapper);
      });
    }
    const serviceTitle = document.getElementById('shop-service-section-title');
    if (serviceTitle) serviceTitle.textContent = activeTab?.serviceTitle || '✨ 特殊服务';
    const serviceContainer = document.getElementById('shop-services-container');
    if (!serviceContainer) return;
    serviceContainer.innerHTML = '';
    if (!Array.isArray(this.shopServices) || this.shopServices.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'shop-empty-state';
      emptyState.textContent = '此页暂无可交易项目。';
      serviceContainer.appendChild(emptyState);
      return;
    }
    this.shopServices.forEach((service, index) => {
      const el = document.createElement('div');
      const currency = service.currency || 'gold';
      const isAffordable = this.canAffordShopItem(service);
      const fit = this.evaluateShopServiceFit(service);
      el.className = `shop-service currency-${currency}${service.riskLabel ? ' is-risky' : ''}`;
      el.id = `service-${service.id}`;
      if (service.sold) el.style.opacity = '0.5';
      const tags = [service.tagLabel ? {
        value: service.tagLabel,
        className: ''
      } : null, service.riskLabel ? {
        value: service.riskLabel,
        className: ''
      } : null, fit?.label ? {
        value: fit.label,
        className: `fit-${fit.label === '高适配' ? 'high' : fit.label === '中适配' ? 'mid' : 'low'}`
      } : null].filter(Boolean).map(entry => `<span class="shop-service-tag ${entry.className}">${entry.value}</span>`).join('');
      el.innerHTML = `
                <div class="service-icon">${service.icon}</div>
                <div class="service-info">
                    <div class="service-name-row">
                        <div class="service-name">${service.name}</div>
                        <div class="service-tags">${tags}</div>
                    </div>
                    <div class="service-desc">${service.desc}</div>
                    <div class="service-fit-note">${fit.reason}</div>
                </div>
                <button class="buy-btn ${isAffordable && !service.sold ? '' : 'disabled'}">
                    <span class="price">${service.sold ? '已售出' : this.formatShopPrice(service)}</span>
                </button>
            `;
      if (!service.sold) {
        const btn = el.querySelector('.buy-btn');
        btn.addEventListener('click', () => this.buyItem('service', index));
      }
      serviceContainer.appendChild(el);
    });
  }

  // 统一购买逻辑
  buyItem(type, index) {
    const item = type === 'card' ? this.shopItems[index] : this.shopServices[index];
    if (!item || item.sold) return;
    if (!this.canAffordShopItem(item)) {
      Utils.showBattleLog(`${this.getStrategicCurrencyLabel(item.currency || 'gold')}不足！`);
      return;
    }
    if (type === 'card') {
      this.player.addCardToDeck(item.card);
      Utils.showBattleLog(`购买了 ${item.card.name}`);
      if (!this.spendShopPrice(item)) return;
      item.sold = true;
    } else {
      const result = this.applyServiceEffect(item);
      if (!result) return;
      if (result === 'deferred') return;
      if (!this.spendShopPrice(item)) {
        Utils.showBattleLog(`${this.getStrategicCurrencyLabel(item.currency || 'gold')}结算失败。`);
        return;
      }
      if (result !== 'repeatable') {
        item.sold = true;
      }
    }
    this.updateShopCurrencyDisplays();
    this.renderShop();
    this.saveGame();
  }

  // 显示命环进化选择
  showEvolutionSelection(targetTier) {
    if (!this.fateRingView) this.fateRingView = new FateRingView(this);
    return this.fateRingView.showEvolutionSelection(targetTier);
  }

  // 应用服务效果
  applyServiceEffect(service) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.applyServiceEffect(service);
  }
  applyRunPathShopServiceEffect(service) {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.applyRunPathShopServiceEffect(service);
  }
  showShopEndlessBlessingSelection(serviceItem) {
    if (!serviceItem) return;
    if (!this.isEndlessActive()) {
      Utils.showBattleLog('当前并非无尽轮回，无法执行轮回祷告。');
      return;
    }
    if (!this.canAffordShopItem(serviceItem)) {
      Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
      return;
    }
    const choices = this.getEndlessBoonChoices();
    const picks = Array.isArray(choices) ? choices.slice(0, 2) : [];
    if (picks.length < 2) {
      const fallbackPool = this.getEndlessBoonPool();
      for (let i = 0; i < fallbackPool.length && picks.length < 2; i += 1) {
        const boon = fallbackPool[i];
        if (!boon || picks.some(item => item.id === boon.id)) continue;
        picks.push(boon);
      }
    }
    if (picks.length === 0) {
      Utils.showBattleLog('轮回祷告失败：暂无可用赐福。');
      return;
    }
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) {
      const fallback = picks[0];
      const applied = fallback ? this.applyEndlessBoon(fallback.id) : null;
      if (!applied) return;
      if (!this.spendShopPrice(serviceItem)) return;
      serviceItem.sold = true;
      this.updateShopCurrencyDisplays();
      this.renderShop();
      this.saveGame();
      return;
    }
    titleEl.textContent = '轮回祷告';
    iconEl.textContent = '🕯️';
    descEl.innerHTML = `支付 <span style=\"color:var(--accent-gold)\">${this.formatShopPrice(serviceItem)}</span>，从 2 项赐福中选择 1 项。`;
    choicesEl.innerHTML = '';
    picks.slice(0, 2).forEach(boon => {
      const rarityTag = boon.rarity === 'rare' ? '<span style="color:#ffb866;">【稀有】</span> ' : '';
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div>${rarityTag}${boon.name}</div>
                <div class="choice-effect">${boon.desc}</div>
            `;
      btn.onclick = () => {
        const applied = this.applyEndlessBoon(boon.id);
        if (!applied) return;
        this.player.gold -= serviceItem.price;
        serviceItem.sold = true;
        this.closeModal();
        Utils.showBattleLog(`轮回祷告：获得赐福【${applied.name}】`);
        this.showRewardModal('轮回祷告成功', `你获得了赐福：${applied.name}\n${applied.desc}`, '🕯️');
        const goldEl = document.getElementById('shop-gold-display');
        if (goldEl) goldEl.textContent = this.player.gold;
        this.renderShop();
        this.saveGame();
      };
      choicesEl.appendChild(btn);
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'event-choice';
    cancelBtn.innerHTML = `
            <div>🚶 取消祷告</div>
            <div class="choice-effect">保留灵石，返回商店</div>
        `;
    cancelBtn.onclick = () => this.closeModal();
    choicesEl.appendChild(cancelBtn);
    modal.classList.add('active');
  }
  showShopCardDraft(serviceItem) {
    if (!serviceItem) return;
    if (!this.canAffordShopItem(serviceItem)) {
      Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
      return;
    }
    const rarityPool = ['common', 'uncommon', 'uncommon', 'rare'];
    const cards = [];
    for (let i = 0; i < 3; i += 1) {
      const rarity = rarityPool[Math.floor(Math.random() * rarityPool.length)];
      const card = getRandomCard(rarity, this.player.characterId);
      if (card) cards.push(card);
    }
    if (cards.length === 0) {
      Utils.showBattleLog('补给包空空如也，交易取消。');
      return;
    }
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) return;
    titleEl.textContent = '侦巡补给包';
    iconEl.textContent = '🎒';
    descEl.innerHTML = `支付 <span style=\"color:var(--accent-gold)\">${this.formatShopPrice(serviceItem)}</span>，选择 1 张补给卡牌。`;
    choicesEl.innerHTML = '';
    cards.forEach(card => {
      const rarityKey = String(card.rarity || 'common').toLowerCase();
      const rarityLabel = this.getCardRarityLabel(rarityKey);
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${card.icon || '🃏'} ${card.name}</span>
                    <span class="choice-rarity rarity-${rarityKey}">【${rarityLabel}】</span>
                </div>
                <div class="choice-effect">${card.description || '获得这张卡牌'}</div>
            `;
      btn.onclick = () => {
        if (!this.spendShopPrice(serviceItem)) return;
        this.player.addCardToDeck(card);
        serviceItem.sold = true;
        this.closeModal();
        Utils.showBattleLog(`补给采购完成：获得【${card.name}】`);
        this.updateShopCurrencyDisplays();
        this.renderShop();
        this.saveGame();
      };
      choicesEl.appendChild(btn);
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 取消采购</div>
            <div class="choice-effect">保留灵石，返回商店</div>
        `;
    leaveBtn.onclick = () => this.closeModal();
    choicesEl.appendChild(leaveBtn);
    modal.classList.add('active');
  }
  showShopForbiddenDraft(serviceItem) {
    if (!serviceItem) return;
    if (!this.canAffordShopItem(serviceItem)) {
      Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
      return;
    }
    if (this.player.maxHp <= 18) {
      Utils.showBattleLog('根基过于虚弱，无法承受禁术血契。');
      return;
    }
    const rarityPool = ['rare', 'rare', 'epic'];
    const cards = [];
    for (let i = 0; i < 3; i += 1) {
      const rarity = rarityPool[Math.floor(Math.random() * rarityPool.length)];
      const card = getRandomCard(rarity, this.player.characterId);
      if (card) cards.push(card);
    }
    if (cards.length === 0) {
      Utils.showBattleLog('禁术卷轴暂未显化，交易取消。');
      return;
    }
    const modal = document.getElementById('event-modal');
    const titleEl = document.getElementById('event-title');
    const iconEl = document.getElementById('event-icon');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    if (!modal || !titleEl || !iconEl || !descEl || !choicesEl) return;
    titleEl.textContent = '逆命血契';
    iconEl.textContent = '🩸';
    descEl.innerHTML = `支付 <span style="color:var(--accent-gold)">${this.formatShopPrice(serviceItem)}</span>，并永久失去 6 点生命上限，从 3 张禁术卡中选择 1 张。`;
    choicesEl.innerHTML = '';
    cards.forEach(card => {
      const rarityKey = String(card.rarity || 'rare').toLowerCase();
      const rarityLabel = this.getCardRarityLabel(rarityKey);
      const btn = document.createElement('button');
      btn.className = 'event-choice';
      btn.innerHTML = `
                <div class="choice-title">
                    <span class="choice-name">${card.icon || '🃏'} ${card.name}</span>
                    <span class="choice-rarity rarity-${rarityKey}">【${rarityLabel}】</span>
                </div>
                <div class="choice-effect">${card.description || '获得这张卡牌'}</div>
            `;
      btn.onclick = () => {
        if (!this.spendShopPrice(serviceItem)) return;
        this.player.maxHp = Math.max(16, this.player.maxHp - 6);
        this.player.currentHp = Math.min(this.player.currentHp, this.player.maxHp);
        this.player.addCardToDeck(card);
        serviceItem.sold = true;
        this.closeModal();
        Utils.showBattleLog(`逆命血契：获得【${card.name}】，最大生命降至 ${this.player.maxHp}`);
        this.showRewardModal('逆命血契完成', `获得卡牌：${card.name}
最大生命降至 ${this.player.maxHp}。`, '🩸');
        this.updateShopCurrencyDisplays();
        this.renderShop();
        this.saveGame();
      };
      choicesEl.appendChild(btn);
    });
    const leaveBtn = document.createElement('button');
    leaveBtn.className = 'event-choice';
    leaveBtn.innerHTML = `
            <div>🚶 暂缓血契</div>
            <div class="choice-effect">保留业果，返回商店</div>
        `;
    leaveBtn.onclick = () => this.closeModal();
    choicesEl.appendChild(leaveBtn);
    modal.classList.add('active');
  }

  // 显示移除卡牌界面 (Refactored: Ink & Gold Purification UI)
  showRemoveCard(serviceItem) {
    if (!this.canAffordShopItem(serviceItem)) {
      Utils.showBattleLog(`${this.getStrategicCurrencyLabel(serviceItem.currency || 'gold')}不足！`);
      return;
    }

    // Close other modals
    this.closeModal();
    const modal = document.getElementById('purification-modal');
    const grid = document.getElementById('purification-grid');
    const costDisplay = document.getElementById('purification-cost-display');
    const confirmBtn = document.getElementById('purification-confirm-btn');
    if (!modal || !grid) {
      console.error('Purification UI elements missing!');
      return;
    }

    // Reset State
    grid.innerHTML = '';
    modal.classList.add('active');
    costDisplay.textContent = `消耗: ${this.formatShopPrice(serviceItem)}`;
    confirmBtn.disabled = true;
    confirmBtn.onclick = null; // Clear previous listeners

    let selectedIndex = -1;

    // Render Cards
    this.player.deck.forEach((card, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'purification-card-wrapper';

      // Create standard card element
      const cardEl = Utils.createCardElement(card, index);
      // Disable default hover/click behaviors if they conflict, though CSS handles most
      wrapper.appendChild(cardEl);

      // Delete Intent Overlay (Visual)
      const overlay = document.createElement('div');
      overlay.className = 'delete-intent-overlay';
      overlay.innerHTML = '<span class="delete-icon">🔥</span>';
      wrapper.appendChild(overlay);

      // Selection Logic
      wrapper.addEventListener('click', () => {
        // Deselect others
        document.querySelectorAll('.purification-card-wrapper').forEach(el => el.classList.remove('selected'));
        if (selectedIndex === index) {
          // Deselect if clicking same
          selectedIndex = -1;
          confirmBtn.disabled = true;
          confirmBtn.textContent = '确认移除 (Confirm)';
        } else {
          // Select new
          selectedIndex = index;
          wrapper.classList.add('selected');
          confirmBtn.disabled = false;
          confirmBtn.textContent = `确认焚毁 (Burn)`;

          // Sound effect if available
          if (typeof audioManager !== 'undefined') {
            audioManager.playSFX('click');
          }
        }
      });
      grid.appendChild(wrapper);
    });

    // Confirm Action
    confirmBtn.onclick = () => {
      if (selectedIndex === -1) return;
      const cardName = this.player.deck[selectedIndex].name;
      const targetWrapper = grid.children[selectedIndex];

      // Visual Burn Effect
      const burn = document.createElement('div');
      burn.className = 'card-burn-effect';
      targetWrapper.appendChild(burn);

      // Audio
      if (typeof audioManager !== 'undefined') {
        audioManager.playSFX('fire'); // Assuming 'fire' exists, or 'buff'
      }

      // Delay actual removal for animation
      setTimeout(() => {
        // Remove from deck
        if (!this.spendShopPrice(serviceItem)) return;
        this.player.deck.splice(selectedIndex, 1);

        // Update Logic
        this.player.removeCount = (this.player.removeCount || 0) + 1;
        serviceItem.sold = true;

        // Close UI
        modal.classList.remove('active');

        // Feedback
        Utils.showBattleLog(`【${cardName}】已化为灰烬...`);

        // Refresh shop UI to show sold status
        this.updateShopCurrencyDisplays();
        this.renderShop();
      }, 800);
    };
  }

  // 剩下的 buyRingExp 等旧方法可以删除，因为已经集成到 applyServiceEffect 中了

  // 关闭商店
  closeShop() {
    if (!this.shopManager) this.shopManager = new ShopManager(this);
    return this.shopManager.closeShop();
  }

  // ========== 营地功能 ==========

  campfireNode = null;

  // 显示营地选项
  showCampfire(node) {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.showCampfire(node);
  }

  // 营地休息
  campfireRest() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireRest();
  }
  campfireDrill() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireDrill();
  }
  campfireWard() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireWard();
  }
  campfireBounty() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireBounty();
  }
  campfirePulse() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfirePulse();
  }
  campfireMedic() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireMedic();
  }
  campfireInsight(costHp = 8) {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireInsight(costHp);
  }

  // 显示升级卡牌界面 (Refactored: Ink & Gold Edition)
  showCampfireUpgrade() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.showCampfireUpgrade();
  }

  // Helper: Update Preview Panel
  updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn) {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.updateUpgradePreview(card, placeholder, contentArea, cardContainer, diffBox, confirmBtn);
  }

  // 升级选中的卡牌
  campfireUpgradeCard(index) {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireUpgradeCard(index);
  }

  // 显示移除卡牌界面（营地版 - Ink & Gold Refactor）
  showCampfireRemove() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.showCampfireRemove();
  }

  // 移除选中的卡牌（营地版 - 逻辑处理）
  campfireRemoveCard(index) {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.campfireRemoveCard(index);
  }

  // 完成营地
  completeCampfire() {
    if (!this.campfireView) this.campfireView = new CampfireView(this);
    return this.campfireView.completeCampfire();
  }
  // --- Auth System ---
  showLoginModal() {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showLoginModal();
  }
  async handleLogin() {
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    const messageEl = document.getElementById('auth-message');
    if (!usernameInput || !passwordInput || !messageEl) return;
    if (this.isAuthBusy) return;
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
      messageEl.innerText = '请输入账号和密码';
      return;
    }
    messageEl.innerText = '登录中...';
    this.isAuthBusy = true;
    try {
      const result = await AuthService.login(username, password);
      if (result.success) {
        await this.onLoginSuccess(messageEl, '登录成功！');
      } else {
        messageEl.innerText = result.message || '登录失败';
        messageEl.style.color = '#ff6b6b';
      }
    } catch (error) {
      console.error('handleLogin failed:', error);
      messageEl.innerText = '登录失败，请稍后再试';
      messageEl.style.color = '#ff6b6b';
    } finally {
      this.isAuthBusy = false;
    }
  }

  // 打开存档选择界面 (同步云端)
  async openSaveSlotsWithSync() {
    if (this.isSyncingSlots) return;
    const cloudEnabled = !AuthService.isCloudEnabled || AuthService.isCloudEnabled();
    if (!cloudEnabled) {
      this.guestMode = true;
      Utils.showBattleLog('云存档未配置，已进入离线开局');
      this.showCharacterSelection();
      return;
    }
    if (!AuthService.isLoggedIn()) {
      this.showConfirmModal('尚未登录，是否先登录以同步云端存档？', () => {
        this.guestMode = false;
        this.showLoginModal();
      }, () => {
        // Guest mode
        this.guestMode = true;
        this.showCharacterSelection();
      });
      return;
    }
    this.guestMode = false;
    const msgBtn = document.getElementById('new-game-btn');
    const originalText = msgBtn ? msgBtn.innerHTML : '';
    if (msgBtn) msgBtn.innerText = '同步中...';
    this.isSyncingSlots = true;
    try {
      const res = await AuthService.getCloudData();
      if (msgBtn) msgBtn.innerHTML = originalText;
      let slots = [null, null, null, null];
      if (res.success && res.slots) {
        slots = res.slots;
      } else if (res.isLegacy && res.slots) {
        slots = res.slots;
        // Auto-migrate legacy if needed? Already returned as slot 0 format
      }

      // Update cache
      this.cachedSlots = slots;
      this.renderSaveSlots(slots);
    } catch (e) {
      console.error('Sync failed', e);
      if (msgBtn) msgBtn.innerHTML = originalText;
      alert('获取云端存档失败，请检查网络');
    } finally {
      this.isSyncingSlots = false;
    }
  }

  // 统一的登录成功逻辑
  async onLoginSuccess(messageEl, successMsg) {
    messageEl.innerText = successMsg;
    messageEl.style.color = '#4ff';
    this.guestMode = false;
    setTimeout(async () => {
      this.closeModal();
      this.checkLoginStatus();

      // 登录成功后，获取云端存档列表并展示选择界面
      let res = {
        success: false,
        slots: [null, null, null, null],
        isEmpty: true
      };
      try {
        res = await AuthService.getCloudData();
      } catch (error) {
        console.error('Fetch cloud data after login failed:', error);
      }

      // 检查本地旧存档
      const localSave = localStorage.getItem('theDefierSave');
      let localData = null;
      if (localSave) {
        try {
          localData = JSON.parse(localSave);
        } catch (e) {}
      }
      let slots = [null, null, null, null];
      if (res.success && res.slots) {
        slots = res.slots;
      }

      // 修正：如果云端虽然返回成功，但存档全空（新注册账号），也应该尝试绑定旧存档
      const isCloudEmpty = res.isEmpty || slots && slots.every(s => s === null);
      if (isCloudEmpty && localData) {
        // 如果云端是新的（空），但本地有数据，自动帮用户填入 Slot 0
        slots[0] = localData;
        AuthService.saveCloudData(localData, 0).catch(err => {
          console.warn('Auto bind local save failed:', err);
        });
        Utils.showBattleLog('检测到旧存档，已自动绑定至 存档 1');
      }
      this.cachedSlots = slots;
      this.renderSaveSlots(slots);
    }, 500);
  }

  // 显示存档位选择模态框 (Spirit Tablet Style)
  renderSaveSlots(slots) {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.renderSaveSlots(slots);
  }

  // 选择存档位操作
  selectSlot(index, mode) {
    this.currentSaveSlot = index;
    // 持久化存储，防止刷新丢失
    sessionStorage.setItem('currentSaveSlot', index);
    localStorage.setItem('lastSaveSlot', String(index));
    const modal = document.getElementById('save-slots-modal');
    if (mode === 'load') {
      const cloudData = this.cachedSlots[index];
      if (cloudData) {
        // 移除冲突检测，直接加载选中的存档
        // 用户要求点击继续时不跳出提醒

        const doLoad = () => {
          try {
            localStorage.setItem('theDefierSave', JSON.stringify(cloudData));
            sessionStorage.setItem('justLoadedSave', 'true'); // Prevent loop

            Utils.showBattleLog(`已加载 存档 ${index + 1} `);
            modal.classList.remove('active');
            setTimeout(() => window.location.reload(), 500);
          } catch (e) {
            console.error('Load Save Failed:', e);
            alert('加载存档失败：本地存储可能已满，请清理浏览器缓存后重试。');
          }
        };
        doLoad();
      }
    } else if (mode === 'new' || mode === 'overwrite') {
      const doOverwrite = () => {
        this.tempPreservedRealms = null;
        localStorage.removeItem('theDefierSave');
        this.currentSaveSlot = index;
        modal.classList.remove('active');

        // If we treat "New Game" as "Go to Character Select":
        this.showCharacterSelection();
        sessionStorage.setItem('currentSaveSlot', index);
        localStorage.setItem('lastSaveSlot', String(index));
      };
      if (mode === 'overwrite') {
        this.showConfirmModal('确定要覆盖此存档吗？旧进度将丢失！', doOverwrite);
      } else {
        doOverwrite();
      }
    }
  }
  async handleRegister() {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const msg = document.getElementById('auth-message');
    if (!msg) return;
    if (this.isAuthBusy) return;
    if (!username || !password) {
      msg.innerText = '请输入账号和密码';
      return;
    }
    msg.innerText = '注册中...';
    this.isAuthBusy = true;
    try {
      const result = await AuthService.register(username, password);
      if (result.success) {
        // Auto login logic reuse
        const loginRes = await AuthService.login(username, password);
        if (loginRes.success) {
          // 使用统一的成功处理逻辑，这会自动将本地旧存档上传到新注册的空账号中
          await this.onLoginSuccess(msg, '注册成功！已绑定旧存档');
        }
      } else {
        if (result.error && result.error.code === 202) {
          msg.innerText = '该用户名已被使用，请换一个';
        } else {
          msg.innerText = result.message || '注册失败';
        }
      }
    } finally {
      this.isAuthBusy = false;
    }
  }
  checkLoginStatus() {
    const btn = document.getElementById('login-btn');
    if (!btn) return;
    const cloudEnabled = !AuthService.isCloudEnabled || AuthService.isCloudEnabled();
    if (cloudEnabled && AuthService.isLoggedIn()) {
      const user = AuthService.getCurrentUser();
      // Change button to show name or Logout
      const username = user && user.username ? user.username : '已登录';
      btn.innerHTML = `
                <div class="talisman-paper"></div>
                <div class="talisman-content">
                    <span class="btn-icon">👤</span>
                    <span class="btn-text" style="font-size:0.8rem">${username}</span>
                </div>
            `;
      btn.onclick = () => {
        // Muted/Audio handling (delayed slightly for feel)
        setTimeout(() => {
          this.showConfirmModal('确定要退出登录吗？\n(退出前将自动上传当前进度)', async () => {
            // 退出前强制尝试上传一次本地存档
            const localSave = localStorage.getItem('theDefierSave');
            // Fix: Check if we have a valid slot before syncing
            if (localSave && this.currentSaveSlot !== null && this.currentSaveSlot !== undefined) {
              try {
                const data = JSON.parse(localSave);
                await AuthService.saveCloudData(data, this.currentSaveSlot);
                console.log('Logout sync complete');
              } catch (e) {
                console.error('Logout sync failed', e);
              }
            }
            AuthService.logout();
            this.checkLoginStatus();
            location.reload();
          });
        }, 50);
      };
    } else {
      btn.innerHTML = `
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-icon">☁️</span>
                        <span class="btn-text">登入轮回</span>
                    </div>
                `;
      btn.onclick = () => this.showLoginModal();
      if (!cloudEnabled) {
        btn.innerHTML = `
                    <div class="talisman-paper"></div>
                    <div class="talisman-content">
                        <span class="btn-icon">☁️</span>
                        <span class="btn-text">离线模式</span>
                    </div>
                `;
        btn.onclick = () => {
          Utils.showBattleLog('云存档未配置，当前为离线模式');
        };
      }
    }
  }
  async checkForCloudSave() {
    // 如果是刚刚手动加载的存档，跳过冲突检测，并清除标记
    if (sessionStorage.getItem('justLoadedSave') === 'true') {
      sessionStorage.removeItem('justLoadedSave');
      console.log('Skipping conflict check (Manual load)');
      return;
    }

    // This is now handled within handleLogin's flow logic, but kept as fallback or for manual checks
    const res = await AuthService.getCloudData();
    if (res.success && Array.isArray(res.slots)) {
      const cloudData = res.slots[this.currentSaveSlot || 0];
      const cloudTime = res.serverTime ? new Date(res.serverTime).toLocaleString() : '未知时间';
      // If we are strictly checking, we might want to show the full modal
      const localSave = localStorage.getItem('theDefierSave');
      let localData = null;
      if (localSave) {
        try {
          localData = JSON.parse(localSave);
        } catch (e) {}
      }
      this.showSaveConflictModal(localData, cloudData, res.serverTime);
    }
  }

  // 显示存档冲突弹窗
  showSaveConflictModal(localData, cloudData, cloudTime) {
    if (!this.systemView) this.systemView = new SystemView(this);
    return this.systemView.showSaveConflictModal(localData, cloudData, cloudTime);
  }

  // 解决存档冲突
  resolveSaveConflict(choice) {
    const modal = document.getElementById('save-conflict-modal');
    if (choice === 'local') {
      // Keep Local -> Upload to Cloud
      const localSave = localStorage.getItem('theDefierSave');
      if (localSave) {
        try {
          const data = JSON.parse(localSave);
          const targetSlot = Number.isInteger(this.currentSaveSlot) ? this.currentSaveSlot : 0;
          if (targetSlot === undefined || targetSlot === null) {
            alert('错误：无法确定存档位，请先进入游戏选择存档位后再尝试同步。');
            return;
          }
          AuthService.saveCloudData(data, targetSlot).then(res => {
            if (res.success) {
              Utils.showBattleLog(`本地存档已覆盖云端！(Slot ${targetSlot + 1})`);
              modal.classList.remove('active');
              // Update cache
              if (this.cachedSlots) this.cachedSlots[targetSlot] = data;
            } else {
              alert('云端同步失败：' + (res.message || '未知错误'));
            }
          });
        } catch (e) {
          console.error('Resolve conflict error:', e);
          alert('存档数据异常，无法上传');
        }
      }
    } else if (choice === 'cloud') {
      // Keep Cloud -> Overwrite Local
      if (this.tempCloudData) {
        localStorage.setItem('theDefierSave', JSON.stringify(this.tempCloudData));
        alert('已从云端恢复存档！');
        modal.classList.remove('active');
        window.location.reload(); // Reload to apply
      } else {
        alert('云端数据读取异常');
      }
    }
  }

  // 加载云端存档 (无本地时)
  // 加载云端存档 (Legacy -> Redirect to Slots)
  loadCloudGame() {
    AuthService.getCloudData().then(res => {
      const slot = Number.isInteger(this.currentSaveSlot) ? this.currentSaveSlot : 0;
      if (res.success && Array.isArray(res.slots) && res.slots[slot]) {
        localStorage.setItem('theDefierSave', JSON.stringify(res.slots[slot]));
        Utils.showBattleLog('已拉取云端存档');
        setTimeout(() => window.location.reload(), 500);
      }
    });
  }

  // 打开法宝囊
  showTreasureBag() {
    if (!this.inventoryView) {
      this.inventoryView = new InventoryView(this);
    }
    this.inventoryView.showTreasureBag();
  }

  // 更新法宝囊界面
  updateTreasureBagUI() {
    if (!this.inventoryView) {
      this.inventoryView = new InventoryView(this);
    }
    this.inventoryView.updateTreasureBagUI();
  }

  // 获取法宝获取途径
  getTreasureSource(t) {
    // 特殊法宝的详细来源
    const specificSources = {
      // 普通法宝
      'vitality_stone': '商店购买 (第1重起) · 精英敌人掉落',
      'sharp_whetstone': '商店购买 (第1重起) · 普通敌人掉落',
      'pressure_talisman': '商店购买 (第1重起) · 击败山寨头目掉落',
      'soul_jade': '商店购买 (第1重起) · 击败妖狼王掉落',
      'qi_gourd': '商店购买 (第1重起) · 奇遇事件奖励',
      'spirit_stone': '商店购买 (第1重起) · 营地供奉获得',
      'blood_orb': '商店购买 (第2重起) · 精英敌人掉落',
      'iron_talisman': '商店购买 (第1重起) · 普通敌人掉落',
      // 稀有法宝
      'soul_banner': '商店购买 (第2重起) · 精英敌人掉落',
      'spirit_bead': '商店购买 (第2重起) · 奇遇事件奖励',
      'ice_spirit_bead': '第3重商店解锁 · 击败丹尊掉落 · 第10重Boss掉落',
      'heart_mirror': '商店购买 (第2重起) · 击败仙门长老掉落',
      'seal_soul_bead': '第4重商店解锁 · 击败上古遗灵掉落',
      'space_anchor': '第5重商店解锁 · 击败化神大能掉落',
      'wind_bead': '第10重商店解锁 · 击败风暴唤灵者掉落',
      'ward_jade': '商店购买 (第2重起) · 精英毒蛇敌人掉落',
      'diamond_amulet': '第3重商店解锁 · 奇遇事件奖励',
      'phoenix_feather': '第3重商店解锁 · 火焰地带奇遇',
      'tortoise_shell': '第4重商店解锁 · 击败精英敌人',
      // 传说法宝
      'flying_dagger': '第5重商店解锁 · Boss首杀奖励',
      'yin_yang_mirror': '第6重商店解锁 · 奇遇事件奖励',
      'void_mirror': '第11重商店解锁 · 击败三首金龙掉落',
      'soul_severing_blade': '第14重商店解锁 · 击败虚空吞噬者掉落',
      'spirit_turtle_shell': '第6重商店解锁 · 击败合体天尊掉落',
      'cloud_boots': '第7重商店解锁 · 击败大乘至尊掉落',
      'thunder_ward': '第8重商店解锁 · 击败飞升主宰掉落 · 雷劫奇遇',
      'truth_mirror': '第12重商店解锁 · 击败心魔镜像掉落',
      'clarity_bead': '第13重商店解锁 · 击败混沌之眼掉落',
      'nine_sword_case': '第9重商店解锁 · 剑冢奇遇事件',
      // 神话法宝
      'stabilizer_pin': '第16重商店解锁 · 击败因果裁决者掉落 · 隐藏成就奖励',
      'five_element_bead': '第15重商店解锁 · 击败五行长老掉落',
      'karma_wheel': '第16重商店解锁 · 击败因果裁决者掉落',
      'heaven_shard': '仅第17-18重 · 击败天道终焉掉落 · 终极挑战奖励'
    };
    if (specificSources[t.id]) {
      return specificSources[t.id];
    }

    // 通用稀有度判断（fallback）
    const unlockRealm = TREASURE_CONFIG?.unlockRealm?.[t.id] || 1;
    switch (t.rarity) {
      case 'common':
        return `商店购买 (第${unlockRealm}重起) · 普通/精英敌人掉落`;
      case 'rare':
        return `商店购买 (第${unlockRealm}重起) · 精英/Boss敌人掉落`;
      case 'legendary':
        return `第${unlockRealm}重商店解锁 · Boss首杀奖励 · 奇遇事件`;
      case 'mythic':
        return `第${unlockRealm}重解锁 · Boss掉落 · 隐藏挑战奖励`;
      default:
        return '未知来源';
    }
  }

  // --- 新增：加权随机获取未拥有法宝 ---
  getWeightedRandomTreasure() {
    // 1. 确定当前层级的稀有度权重
    const realm = this.player.realm || 1;
    let weights = {
      common: 100,
      rare: 0,
      legendary: 0,
      mythic: 0
    };
    if (realm <= 3) {
      weights = {
        common: 90,
        rare: 9,
        legendary: 1,
        mythic: 0
      };
    } else if (realm <= 6) {
      weights = {
        common: 60,
        rare: 35,
        legendary: 5,
        mythic: 0
      };
    } else if (realm <= 10) {
      weights = {
        common: 30,
        rare: 50,
        legendary: 19,
        mythic: 1
      };
    } else {
      weights = {
        common: 10,
        rare: 40,
        legendary: 45,
        mythic: 5
      };
    }

    // 2. 筛选未拥有的法宝
    const unowned = Object.keys(TREASURES).map(k => TREASURES[k]).filter(t => !this.player.hasTreasure(t.id));
    if (unowned.length === 0) return null;

    // 3. 尝试按权重抽取稀有度
    const roll = Math.random() * 100;
    let targetRarity = 'common';
    let cumulative = 0;
    if ((cumulative += weights.common) > roll) targetRarity = 'common';else if ((cumulative += weights.rare) > roll) targetRarity = 'rare';else if ((cumulative += weights.legendary) > roll) targetRarity = 'legendary';else targetRarity = 'mythic';

    // 4. 在该稀有度中随机选择
    let candidates = unowned.filter(t => (t.rarity || 'common') === targetRarity);

    // 如果该稀有度没有未获得的（或者根本没定义该稀有度的法宝），回退到全局随机
    if (candidates.length === 0) {
      return unowned[Math.floor(Math.random() * unowned.length)];
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // 辅助：获取品质名称和颜色
  getRarityLabel(rarity) {
    switch (rarity) {
      case 'common':
        return '<span style="color:#9e9e9e">【凡品】</span>';
      case 'rare':
        return '<span style="color:#4fc3f7">【灵品】</span>';
      case 'legendary':
        return '<span style="color:#e040fb">【神品】</span>';
      // Legendary -> Mythic (Purple)
      case 'mythic':
        return '<span style="color:#ffab00">【仙品】</span>';
      // Mythic -> Immortal (Orange)
      default:
        return '<span style="color:#9e9e9e">【凡品】</span>';
    }
  }

  // 显示法宝图鉴 (重构版)
  showTreasureCompendium() {
    return Game.prototype.ensureInventoryView.call(this).showTreasureCompendium();
  }
  normalizeTreasureCompendiumFilterState(rawState = null) {
    return Game.prototype.ensureInventoryView.call(this).normalizeTreasureCompendiumFilterState(rawState);
  }
  getTreasureCompendiumFilterState() {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumFilterState();
  }
  getTreasureCompendiumQuickFilterValue() {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumQuickFilterValue();
  }
  getTreasureCompendiumFilterLabels(state = null) {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumFilterLabels(state);
  }
  setTreasureCompendiumFilter(value = 'all') {
    return Game.prototype.ensureInventoryView.call(this).setTreasureCompendiumFilter(value);
  }
  setTreasureCompendiumSort(value = 'rarity_desc') {
    return Game.prototype.ensureInventoryView.call(this).setTreasureCompendiumSort(value);
  }
  setTreasureCompendiumSearchQuery(query = '') {
    return Game.prototype.ensureInventoryView.call(this).setTreasureCompendiumSearchQuery(query);
  }
  getTreasureCompendiumSearchQuery() {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumSearchQuery();
  }
  toggleTreasureCompendiumFilterChip(group, value) {
    return Game.prototype.ensureInventoryView.call(this).toggleTreasureCompendiumFilterChip(group, value);
  }
  getTreasureCompendiumPresetStorageKey() {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumPresetStorageKey();
  }
  serializeTreasureCompendiumFilterState(state = null, sort = null) {
    return Game.prototype.ensureInventoryView.call(this).serializeTreasureCompendiumFilterState(state, sort);
  }
  getTreasureCompendiumPresets() {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumPresets();
  }
  persistTreasureCompendiumPresets() {
    return Game.prototype.ensureInventoryView.call(this).persistTreasureCompendiumPresets();
  }
  getTreasureCompendiumPresetSummary(state = null, query = '') {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumPresetSummary(state, query);
  }
  saveTreasureCompendiumPreset(slot = 0) {
    return Game.prototype.ensureInventoryView.call(this).saveTreasureCompendiumPreset(slot);
  }
  applyTreasureCompendiumPreset(slot = 0) {
    return Game.prototype.ensureInventoryView.call(this).applyTreasureCompendiumPreset(slot);
  }
  clearTreasureCompendiumFilters() {
    return Game.prototype.ensureInventoryView.call(this).clearTreasureCompendiumFilters();
  }
  isTreasureCompendiumPresetActive(slot = 0) {
    return Game.prototype.ensureInventoryView.call(this).isTreasureCompendiumPresetActive(slot);
  }
  getTreasureCompendiumPresetLabel(slot = 0) {
    return Game.prototype.ensureInventoryView.call(this).getTreasureCompendiumPresetLabel(slot);
  }
  passesTreasureCompendiumFilter(item) {
    return Game.prototype.ensureInventoryView.call(this).passesTreasureCompendiumFilter(item);
  }
  setLawCodexSearchQuery(query = '') {
    return Game.prototype.ensureInventoryView.call(this).setLawCodexSearchQuery(query);
  }
  setLawCodexStatusFilter(value = 'all') {
    return Game.prototype.ensureInventoryView.call(this).setLawCodexStatusFilter(value);
  }
  setLawCodexElementFilter(value = 'all') {
    return Game.prototype.ensureInventoryView.call(this).setLawCodexElementFilter(value);
  }
  setLawCodexResonanceFilter(value = 'all') {
    return Game.prototype.ensureInventoryView.call(this).setLawCodexResonanceFilter(value);
  }
  attemptSteal() {
    return Game.prototype.ensureRewardView.call(this).attemptSteal();
  }
  continueAfterReward() {
    return Game.prototype.ensureRewardView.call(this).continueAfterReward();
  }
  followRewardSeasonBoardHandoff(sourceKey = 'primary') {
    return Game.prototype.ensureRewardView.call(this).followRewardSeasonBoardHandoff(sourceKey);
  }
  updateRewardHeaderCopy() {
    return Game.prototype.ensureRewardView.call(this).updateRewardHeaderCopy();
  }
  renderRewardBattleMeta() {
    return Game.prototype.ensureRewardView.call(this).renderRewardBattleMeta();
  }
  renderRewardNarrativeBrief() {
    return Game.prototype.ensureRewardView.call(this).renderRewardNarrativeBrief();
  }
  renderRewardExpeditionMeta() {
    return Game.prototype.ensureRewardView.call(this).renderRewardExpeditionMeta();
  }
  renderRewardRunPathMeta() {
    return Game.prototype.ensureRewardView.call(this).renderRewardRunPathMeta();
  }

  // 显示法宝详情 (新版)
} // 全局游戏实例
export let game = null;

// 页面加载完成后初始化；若脚本在 DOM 已就绪后才加载，则立即启动，避免自动化场景漏挂 window.game。
function initializeGameInstance() {
  try {
    console.log('Initializing Game...');
    if (game) {
      console.warn('Game instance already exists, skip duplicate init.');
      return;
    }
    game = new Game();
    window.game = game; // Expose to window for tests and console debugging
    console.log('Game Initialized:', game);
  } catch (error) {
    console.error('Game Initialization Failed:', error);
    if (typeof Utils !== 'undefined' && Utils && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog('游戏初始化失败，请检查控制台');
    }
    if (typeof alert === 'function') {
      alert('游戏初始化失败: ' + error.message);
    }
  }
}
const canAutoInitializeGame = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.addEventListener === 'function' && typeof document.readyState === 'string' && typeof Game === 'function';
if (canAutoInitializeGame) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGameInstance, {
      once: true
    });
  } else {
    window.setTimeout(initializeGameInstance, 0);
  }
}
