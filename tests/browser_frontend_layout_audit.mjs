import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-frontend-layout-audit';
fs.mkdirSync(outDir, { recursive: true });

const screenshotMode = String(
  process.env.FRONTEND_LAYOUT_SCREENSHOT_MODE || (process.env.CI ? 'skip' : 'playwright'),
).toLowerCase();
const captureScreenshots = !['0', 'false', 'off', 'none', 'skip'].includes(screenshotMode);
const preferCdpScreenshots = screenshotMode === 'cdp';
const screenshotTimeoutMs = Number.parseInt(process.env.FRONTEND_LAYOUT_SCREENSHOT_TIMEOUT_MS || '8000', 10);
const cdpScreenshotTimeoutMs = Number.parseInt(process.env.FRONTEND_LAYOUT_CDP_SCREENSHOT_TIMEOUT_MS || '5000', 10);
const reportLogMode = String(
  process.env.FRONTEND_LAYOUT_REPORT_LOG || (process.env.CI ? 'summary' : 'full'),
).toLowerCase();

function filterAuditItems(items, envValue) {
  const requested = String(envValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (requested.length === 0) return items;
  const requestedIds = new Set(requested);
  return items.filter((item) => requestedIds.has(item.id));
}

const viewports = filterAuditItems([
  { id: 'desktop', width: 1440, height: 960, isMobile: false },
  { id: 'short', width: 1366, height: 720, isMobile: false },
  { id: 'mobile-375', width: 375, height: 812, isMobile: true },
  { id: 'mobile-390', width: 390, height: 844, isMobile: true },
  { id: 'mobile-412', width: 412, height: 915, isMobile: true },
  { id: 'tablet-portrait-768', width: 768, height: 1024, isMobile: true },
  { id: 'tablet-landscape-1024', width: 1024, height: 768, isMobile: true },
], process.env.FRONTEND_LAYOUT_VIEWPORTS);

const scenarios = filterAuditItems([
  { id: 'main-menu', root: '#main-menu', title: 'Main Menu' },
  { id: 'pvp-screen', root: '#pvp-screen', title: 'PVP Hub' },
  { id: 'character-selection-screen', root: '#character-selection-screen', title: 'Character Selection' },
  { id: 'character-select', root: '#character-select', title: 'Character Info' },
  { id: 'collection-laws', root: '#collection', title: 'Collection Laws' },
  { id: 'collection-spirits', root: '#collection', title: 'Collection Spirits' },
  { id: 'collection-chapters', root: '#collection', title: 'Collection Chapters' },
  { id: 'collection-enemies', root: '#collection', title: 'Collection Enemies' },
  { id: 'collection-bosses', root: '#collection', title: 'Collection Bosses' },
  { id: 'collection-builds', root: '#collection', title: 'Collection Builds' },
  { id: 'collection-slates', root: '#collection', title: 'Collection Slates' },
  { id: 'collection-sanctum', root: '#collection', title: 'Collection Sanctum' },
  { id: 'challenge-daily', root: '#challenge-screen', title: 'Challenge Daily' },
  { id: 'challenge-weekly', root: '#challenge-screen', title: 'Challenge Weekly' },
  { id: 'challenge-global', root: '#challenge-screen', title: 'Challenge Global' },
  { id: 'treasure-compendium', root: '#treasure-compendium', title: 'Treasure Compendium' },
  { id: 'realm-select-screen', root: '#realm-select-screen', title: 'Realm Select' },
  { id: 'map-screen', root: '#map-screen', title: 'Map' },
  { id: 'map-screen-tools', root: '#map-screen', title: 'Map Tools Open' },
  { id: 'map-screen-intel-toggle', root: '#map-screen', title: 'Map Intel Toggle' },
  { id: 'map-screen-tools-toggle', root: '#map-screen', title: 'Map Tools Toggle' },
  { id: 'map-screen-expedition-intel-click', root: '#map-screen', title: 'Map Expedition Intel Clickability' },
  { id: 'battle-screen', root: '#battle-screen', title: 'Battle' },
  { id: 'horizon-barter-modal', root: '#horizon-barter-modal', title: 'Horizon Barter Modal' },
  { id: 'resonance-matrix-modal', root: '#resonance-matrix-modal', title: 'Resonance Matrix Modal' },
  { id: 'reward-screen', root: '#reward-screen', title: 'Reward' },
  { id: 'shop-screen', root: '#shop-screen', title: 'Shop' },
  { id: 'achievements-screen', root: '#achievements-screen', title: 'Achievements' },
  { id: 'inheritance-screen', root: '#inheritance-screen', title: 'Inheritance' },
  { id: 'game-over-screen', root: '#game-over-screen', title: 'Game Over' },
  { id: 'pvp-result-overlay', root: '#pvp-result-overlay', title: 'PVP Result Overlay' },
  { id: 'event-modal', root: '#event-modal', title: 'Event Modal' },
  { id: 'endless-paranoia-modal', root: '#event-modal', title: 'Endless Paranoia Modal' },
  { id: 'remove-card-modal', root: '#remove-card-modal', title: 'Remove Card Modal' },
  { id: 'settings-modal', root: '#settings-modal', title: 'Settings Modal' },
  { id: 'auth-modal', root: '#auth-modal', title: 'Auth Modal' },
  { id: 'save-conflict-modal', root: '#save-conflict-modal', title: 'Save Conflict Modal' },
  { id: 'save-slots-modal', root: '#save-slots-modal', title: 'Save Slots Modal' },
  { id: 'deck-modal', root: '#deck-modal', title: 'Deck Modal' },
  { id: 'treasure-bag-modal', root: '#treasure-bag-modal', title: 'Treasure Bag Modal' },
  { id: 'card-modal', root: '#card-modal', title: 'Card Detail Modal' },
  { id: 'dynamic-card-detail-modal', root: '#card-detail-modal', title: 'Dynamic Card Detail Modal' },
  { id: 'shop-service-detail-modal', root: '#card-detail-modal', title: 'Shop Service Detail Modal' },
  { id: 'skill-confirm-modal', root: '#skill-confirm-modal', title: 'Skill Confirm Modal' },
  { id: 'treasure-detail-modal', root: '#treasure-detail-modal', title: 'Treasure Detail Modal' },
  { id: 'law-detail-modal', root: '#law-detail-modal', title: 'Law Detail Modal' },
  { id: 'ring-modal', root: '#ring-modal', title: 'Fate Ring Modal' },
  { id: 'reward-modal', root: '#reward-modal', title: 'Reward Popup Modal' },
  { id: 'confirm-modal', root: '#generic-confirm-modal', title: 'Confirm Modal' },
  { id: 'alert-modal', root: '#generic-alert-modal', title: 'Alert Modal' },
  { id: 'treasure-bag-alert-modal', root: '#generic-alert-modal', title: 'Treasure Bag Alert Stack' },
  { id: 'purification-modal', root: '#purification-modal', title: 'Purification Modal' },
], process.env.FRONTEND_LAYOUT_SCENARIOS);

if (viewports.length === 0) throw new Error('FRONTEND_LAYOUT_VIEWPORTS did not match any configured viewport');
if (scenarios.length === 0) throw new Error('FRONTEND_LAYOUT_SCENARIOS did not match any configured scenario');

const realBattleResolverScenarios = new Set([
  'horizon-barter-modal',
  'resonance-matrix-modal',
]);

const findings = [];
const consoleErrors = [];

function add(viewport, scenario, pass, detail = '') {
  findings.push({
    viewport,
    scenario,
    pass,
    detail,
  });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_(CLOSED|RESET)/.test(message)) return;
  if (/Failed to load resource: net::ERR_FILE_NOT_FOUND/.test(message)) return;
  consoleErrors.push(message);
}

function screenshotName(viewportId, scenarioId) {
  return `${viewportId}-${scenarioId}.png`.replace(/[^a-z0-9_.-]/gi, '-');
}

async function captureFrontendLayoutScreenshot(page, screenshotPath, label) {
  if (!captureScreenshots) return false;
  return safeAuditScreenshot(page, screenshotPath, label, {
    fullPage: false,
    timeout: screenshotTimeoutMs,
    cdpTimeout: cdpScreenshotTimeoutMs,
    preferCdp: preferCdpScreenshots,
    fallbackToPlaywright: !preferCdpScreenshots,
  });
}

async function waitForPaint(page) {
  await page.waitForTimeout(120);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function closeWithTimeout(closeFn, label, timeoutMs = 5000) {
  let timer;
  try {
    await Promise.race([
      closeFn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} close timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    console.warn(`[frontend-layout] ${err?.message || String(err)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function prepareScenario(page, scenarioId) {
  return page.evaluate(async (id) => {
    const safeText = (value) => String(value ?? '');
    const allCards = () => (typeof CARDS !== 'undefined' && CARDS) ? Object.values(CARDS) : [];
    const allLaws = () => (typeof LAWS !== 'undefined' && LAWS) ? Object.values(LAWS) : [];
    const allTreasures = () => (typeof TREASURES !== 'undefined' && TREASURES) ? Object.values(TREASURES) : [];
    const allEvents = () => (typeof EVENTS !== 'undefined' && EVENTS) ? Object.values(EVENTS) : [];
    const auditTreasureSamples = () => [
      {
        id: 'layout_aegis_relic',
        name: '玄甲镇符',
        icon: '🛡️',
        rarity: 'legendary',
        description: '获得护盾时额外稳住节奏，用于检查已装备法宝卡片的多行布局。',
      },
      {
        id: 'layout_star_compass',
        name: '星衡罗盘',
        icon: '✨',
        rarity: 'rare',
        description: '回合开始校准灵力与抽牌节奏，用于检查短描述与按钮不互相遮挡。',
      },
      {
        id: 'layout_rift_blade',
        name: '裂脉短刃',
        icon: '🩸',
        rarity: 'mythic',
        description: '命中流血目标时追加斩击，并保留足够长的仓库描述压力样本。',
      },
      {
        id: 'layout_wuxing_charm',
        name: '五行净符',
        icon: '☯️',
        rarity: 'common',
        description: '若本回合完成净化则抽牌，否则获得灵力，测试仓库卡片换行。',
      },
    ];
    const auditLawSample = () => ({
      id: 'layout_law_starlight',
      name: '星衡归律',
      icon: '✨',
      rarity: 'legendary',
      element: 'fire',
      description: '每回合首次完成调序后获得护盾，并把下一张技能牌费用降低；用于检查法则详情弹窗在移动端的长文案、状态标签与关闭按钮。',
      passive: {
        type: 'damageBonus',
        value: 4,
      },
      unlockCards: ['观星', '星轨改写'],
    });
    const isRealTreasureSample = (treasure) => {
      if (!treasure || typeof treasure !== 'object') return false;
      const name = String(treasure.name || '').trim();
      const description = String(treasure.description || '').trim();
      return name && name !== '法宝名称' && description.length >= 12;
    };
    const isRealLawSample = (law) => {
      if (!law || typeof law !== 'object') return false;
      const name = String(law.name || '').trim();
      const description = String(law.description || '').trim();
      return name && name !== '法则名称' && description.length >= 12 && !!law.passive?.type;
    };
    const treasureSamples = () => {
      const source = allTreasures().filter(isRealTreasureSample);
      const samples = source.length >= 4 ? source : auditTreasureSamples();
      return samples.map((treasure, index) => ({
        ...treasure,
        id: treasure.id || `layout_treasure_${index}`,
      }));
    };

    const deactivateModal = (modal) => {
      if (!modal) return;
      modal.classList.remove('active', 'upgrade-mode');
      if (modal.id === 'pvp-result-overlay') modal.style.display = 'none';
      if (modal.id === 'treasure-bag-modal') modal.style.display = 'none';
    };

    const cleanup = async () => {
      document.querySelectorAll('#horizon-barter-cancel, #resonance-matrix-cancel').forEach((button) => {
        if (button instanceof HTMLButtonElement) button.click();
      });
      const pendingBattleCommandModal = window.__layoutPendingBattleCommandModal;
      window.__layoutPendingBattleCommandModal = null;
      if (pendingBattleCommandModal && typeof pendingBattleCommandModal.then === 'function') {
        try {
          await Promise.race([
            pendingBattleCommandModal,
            new Promise((resolve) => setTimeout(resolve, 250)),
          ]);
        } catch (_) {}
      }
      document.querySelectorAll('.modal').forEach(deactivateModal);
      document.querySelectorAll('.modal-overlay').forEach((modal) => {
        modal.classList.remove('active');
        modal.style.display = 'none';
      });
      const purification = document.getElementById('purification-modal');
      if (purification) {
        purification.classList.remove('active');
        purification.style.display = '';
      }
      const pvpResult = document.getElementById('pvp-result-overlay');
      if (pvpResult) {
        pvpResult.className = 'screen pvp-result-overlay';
        pvpResult.style.display = '';
      }
      const battleLog = document.getElementById('battle-log');
      if (battleLog) {
        battleLog.classList.remove('show', 'log-damage', 'log-status', 'log-system', 'log-reward', 'log-warning');
      }
      const battleLogPanel = document.getElementById('battle-log-panel');
      if (battleLogPanel) battleLogPanel.classList.remove('active');
      const dynamicBg = document.getElementById('dynamic-bg');
      if (dynamicBg) dynamicBg.remove();
      document.body.classList.remove('modal-open');
    };

    const ensureGame = () => {
      if (!window.game) return null;
      game.guestMode = true;
      if (typeof game.shouldForceCloudLogin === 'function') {
        game.shouldForceCloudLogin = () => false;
      }
      if (!game.player || !game.player.characterId) {
        game.startNewGame('linFeng');
      }
      seedRichState();
      return game;
    };

    const seedRichState = () => {
      if (!window.game || !game.player) return;
      const player = game.player;
      player.gold = Math.max(999, Number(player.gold) || 0);
      player.insight = Math.max(18, Number(player.insight) || 0);
      player.karma = Math.max(8, Number(player.karma) || 0);
      player.currentHp = Math.max(1, Number(player.currentHp) || Number(player.maxHp) || 80);
      player.maxHp = Math.max(Number(player.maxHp) || 0, player.currentHp, 80);
      if (typeof player.setRunDestiny === 'function' && typeof game.resolveDefaultRunDestinyId === 'function') {
        player.setRunDestiny(game.resolveDefaultRunDestinyId(player.characterId || 'linFeng'), 1);
      }
      if (typeof player.setSpiritCompanion === 'function' && typeof game.resolveDefaultSpiritCompanionId === 'function') {
        player.setSpiritCompanion(game.resolveDefaultSpiritCompanionId(player.characterId || 'linFeng'), 1);
      }
      if (typeof player.setRunPath === 'function' && typeof game.resolveDefaultRunPathId === 'function') {
        player.setRunPath(game.resolveDefaultRunPathId(player.characterId || 'linFeng'));
      }

      const cards = allCards().slice(0, 14).map((card) => ({ ...card }));
      if (cards.length) {
        player.deck = cards.map((card, index) => ({ ...card, id: card.id || `audit_card_${index}` }));
        player.drawPile = player.deck.slice(0, 8);
        player.discardPile = player.deck.slice(8, 12);
        player.hand = player.deck.slice(0, 5);
      }

      const laws = allLaws().slice(0, 18).map((law, index) => ({ ...law, id: law.id || Object.keys(LAWS || {})[index] }));
      if (laws.length) player.collectedLaws = laws;
      const treasures = treasureSamples().slice(0, 12);
      if (treasures.length) player.collectedTreasures = treasures;

      if (typeof game.normalizeRunSlateArchive === 'function') {
        game.runSlateArchive = game.normalizeRunSlateArchive([
          {
            id: 'layout_audit_slate_1',
            chapterIndex: 6,
            chapterName: '第 6 章·星镜归档',
            endingId: 'alliance',
            endingName: '星图合卷',
            endingIcon: '🔭',
            score: 256,
            branchName: '观测锁线',
            tags: ['课题·推演控场', '答卷·天象合卷'],
            timestamp: Date.now() - 2000,
            answerReview: {
              ratingLabel: '天象合卷',
              ratingTone: 'completed',
              trainingAdvice: '继续沿观测锁线压路线贴合与控场节奏。',
              highlightLine: '本章答卷已经压成可复盘的观测样本。',
            },
          },
        ]);
      }
      if (typeof game.createDefaultSeasonVerificationState === 'function') {
        game.seasonVerificationState = game.createDefaultSeasonVerificationState();
      }
    };

    const runWithWebdriverDisabled = (callback) => {
      const ownDescriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
      const proto = Object.getPrototypeOf(navigator);
      const protoDescriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'webdriver') : null;
      let overrideApplied = false;
      try {
        Object.defineProperty(navigator, 'webdriver', {
          configurable: true,
          get: () => false,
        });
        overrideApplied = true;
      } catch (error) {
        try {
          if (proto) {
            Object.defineProperty(proto, 'webdriver', {
              configurable: true,
              get: () => false,
            });
            overrideApplied = true;
          }
        } catch (_) {
          overrideApplied = false;
        }
      }
      try {
        return { overrideApplied, result: callback() };
      } finally {
        if (overrideApplied) {
          try {
            if (ownDescriptor) {
              Object.defineProperty(navigator, 'webdriver', ownDescriptor);
            } else {
              delete navigator.webdriver;
              if (proto && protoDescriptor) Object.defineProperty(proto, 'webdriver', protoDescriptor);
            }
          } catch (_) {
            try {
              if (proto && protoDescriptor) Object.defineProperty(proto, 'webdriver', protoDescriptor);
            } catch (_) {}
          }
        }
      }
    };

    const showCollectionSection = (section) => {
      ensureGame();
      if (typeof game.showCollection === 'function') game.showCollection(section);
      if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection(section);
    };

    const showChallengeTab = (tab) => {
      ensureGame();
      if (typeof game.showChallengeHub === 'function') game.showChallengeHub(tab);
      else game.showScreen('challenge-screen');
    };

    const showRewardProbe = () => {
      ensureGame();
      game.guestMode = true;
      if (typeof game.startNewGame === 'function') game.startNewGame('linFeng');
      if (typeof game.startRealm === 'function') game.startRealm(1, false);
      if (typeof game.createDefaultSeasonVerificationState === 'function') {
        game.seasonVerificationState = game.createDefaultSeasonVerificationState();
      } else if (game.seasonVerificationState && typeof game.seasonVerificationState === 'object') {
        game.seasonVerificationState.claimedLaneRewards = {};
      }
      game.player?.setRunPath?.('insight');
      game.player?.setRunDestiny?.('rebelScale', 1);
      if (game.player) game.player.getStealBonus = () => 0;
      game.currentBattleNode = { type: 'elite', id: 880101, completed: false };
      game.stealAttempted = false;
      const rewardLineageSlate = {
        id: 'layout_reward_cta_probe',
        chapterIndex: 6,
        chapterName: '第 6 章·星镜归档',
        endingId: 'alliance',
        endingName: '星图合卷',
        endingIcon: '🔭',
        score: 256,
        branchName: '观测锁线',
        tags: ['课题·推演控场', '答卷·天象合卷'],
        answerReview: {
          ratingLabel: '天象合卷',
          ratingTone: 'completed',
          trainingAdvice: '继续沿观测锁线压路线贴合与控场节奏。',
          highlightLine: '本章答卷已经压成可复盘的观测样本。',
        },
        practiceTopic: {
          id: 'layout_reward_cta_topic',
          sourceRecordId: 'layout_reward_cta_guide',
          sourceTitle: '星镜试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定'],
          goalLines: ['先走观星线再补事件收益'],
        },
        observatoryLink: {
          sourceRecordId: 'layout_reward_cta_guide',
          sourceTitle: '星镜试锋',
          sourceThemeKey: 'oracle',
          sourceThemeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定'],
          drillObjective: '连续两次走观星相关节点并维持控场稳定。',
        },
        timestamp: Date.now(),
      };
      if (typeof game.normalizeRunSlateArchive === 'function') {
        game.runSlateArchive = game.normalizeRunSlateArchive([rewardLineageSlate]);
      } else {
        game.runSlateArchive = [rewardLineageSlate];
      }
      if (typeof game.buildObservatoryTrainingFocusFromSlate === 'function' && typeof game.setObservatoryTrainingFocus === 'function') {
        const focus = game.buildObservatoryTrainingFocusFromSlate(rewardLineageSlate);
        if (focus) game.setObservatoryTrainingFocus(focus, { silent: true });
      }
      if (typeof game.buildRewardExpeditionMeta === 'function') {
        game.lastExpeditionRewardMeta = game.buildRewardExpeditionMeta(rewardLineageSlate);
      }
      if (typeof game.getSeasonBoardSnapshot === 'function' && typeof game.normalizeSeasonBoardSnapshot === 'function') {
        const originalGetSeasonBoardSnapshot = game.getSeasonBoardSnapshot.bind(game);
        const rewardLaneBoard = originalGetSeasonBoardSnapshot({ latestSlate: rewardLineageSlate });
        const completeLane = (lane) => ({
          ...lane,
          tasks: (Array.isArray(lane?.tasks) ? lane.tasks : []).map((task) => {
            const target = Math.max(1, Math.floor(Number(task?.target) || 1));
            return {
              ...task,
              progress: target,
              target,
              completed: true,
              progressText: `${target}/${target}`,
            };
          }),
        });
        const rewardLaneBoardSource = rewardLaneBoard
          ? {
              ...rewardLaneBoard,
              lanes: (rewardLaneBoard.lanes || []).map((lane) => lane.id === 'training' ? completeLane(lane) : lane),
            }
          : null;
        if (rewardLaneBoardSource) {
          game.getSeasonBoardSnapshot = () => game.normalizeSeasonBoardSnapshot(rewardLaneBoardSource);
          game.lastExpeditionRewardMeta = {
            ...(game.lastExpeditionRewardMeta || {}),
            seasonBoard: game.getSeasonBoardSnapshot(),
          };
        }
      }
      game.lastBattleRewardMeta = {
        encounter: { themeName: '轮段·反制晶格', tierStage: 2, goldBonus: 18, ringExpBonus: 9 },
        squad: { squadName: '咒织链阵', goldBonus: 14, ringExpBonus: 11 },
      };
      game.lastRunPathRewardMeta = {
        pathId: 'insight',
        name: '窥命流',
        icon: '🪞',
        completed: false,
        entries: [
          {
            phaseId: 'insight_mid',
            phaseLabel: '化境',
            title: '窥盘校谱',
            rewardText: '命环经验 +45',
            nextPhaseLabel: '登峰',
            nextPhaseTitle: '命盘问真',
            completed: false,
          },
        ],
      };
      const law = allLaws()[0] || null;
      game.showRewardScreen(145, true, { stealLaw: law?.id || 'thunder', stealChance: 1 }, 32, { insight: 8, karma: 3 });
    };

    const showShopProbe = () => {
      ensureGame();
      if (typeof game.showShop === 'function') {
        game.showShop({ id: 'layout_shop_node', type: 'shop', completed: false });
      } else {
        game.showScreen('shop-screen');
      }
    };

    const settleMapViewport = async () => {
      const normalize = () => {
        const scroller = document.querySelector('#map-scroll-container');
        if (scroller) {
          scroller.style.scrollBehavior = 'auto';
          if (typeof scroller.scrollTo === 'function') {
            scroller.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          }
          scroller.scrollTop = 0;
          scroller.scrollLeft = 0;
        }
      };
      for (const delayMs of [140, 120, 180, 240]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        normalize();
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      normalize();
    };

    const showMapProbe = async () => {
      ensureGame();
      if (typeof game.startRealm === 'function') {
        game.startRealm(1, false);
      } else {
        game.showScreen('map-screen');
      }
      await settleMapViewport();
    };

    const showMapToolsProbe = async () => {
      await showMapProbe();
      const shell = document.querySelector('#map-screen .map-screen-v3');
      if (shell) {
        shell.classList.add('show-map-tools');
        const toolsButton = shell.querySelector('[data-map-action="toggle-map-tools"]');
        const footer = shell.querySelector('#map-footer');
        if (toolsButton) {
          toolsButton.textContent = '收起工具';
          toolsButton.setAttribute('aria-expanded', 'true');
        }
        if (footer) footer.setAttribute('aria-hidden', 'false');
      }
    };

    const showMapExpeditionIntelProbe = async () => {
      ensureGame();
      if (typeof game.initializeExpeditionForRealm === 'function') {
        game.initializeExpeditionForRealm(game.player?.realm || 1, true);
      }
      game.showScreen('map-screen');
      await settleMapViewport();
      const container = document.getElementById('map-screen');
      const shell = container?.querySelector('.map-screen-v3');
      if (shell) {
        delete shell.dataset.mapIntelUserToggled;
        shell.classList.remove('show-map-intel', 'show-map-tools');
        if (window.game?.mapView && typeof game.mapView.syncMapChrome === 'function') {
          game.mapView.syncMapChrome(container);
        }
      }
      if (typeof game.renderExpeditionMapPanels === 'function') {
        game.renderExpeditionMapPanels();
      }
      const panels = container?.querySelector('#map-expedition-panels');
      const button = container?.querySelector('[data-map-action="toggle-map-intel"]');
      const panelVisible = !!panels
        && getComputedStyle(panels).display !== 'none'
        && panels.getAttribute('aria-hidden') === 'false';
      return {
        ok: !!container && !!shell && !!panels && !!button && shell.classList.contains('show-map-intel') && panelVisible,
        rootSelector: '#map-screen',
        shellClass: shell?.className || '',
        panelHidden: panels?.getAttribute('aria-hidden') || '',
        panelCount: panels?.querySelectorAll('.expedition-panel-card, .expedition-overview-card, .expedition-choice-card').length || 0,
        buttonExpanded: button?.getAttribute('aria-expanded') || '',
        userToggled: shell?.dataset?.mapIntelUserToggled || ''
      };
    };

    const clickMapHeaderToggle = async (action) => {
      await showMapProbe();
      const container = document.getElementById('map-screen');
      const shell = container?.querySelector('.map-screen-v3');
      if (!container || !shell) return { ok: false, reason: 'missing_map_shell', action };
      shell.classList.remove('show-map-intel', 'show-map-tools');
      if (window.game?.mapView && typeof game.mapView.syncMapChrome === 'function') {
        game.mapView.syncMapChrome(container);
      }
      const button = container.querySelector(`[data-map-action="${action}"]`);
      if (!button) return { ok: false, reason: 'missing_toggle_button', action };
      button.click();
      const openClass = action === 'toggle-map-intel' ? 'show-map-intel' : 'show-map-tools';
      const target = action === 'toggle-map-intel'
        ? container.querySelector('#map-expedition-panels')
        : container.querySelector('#map-footer');
      const expanded = button.getAttribute('aria-expanded') === 'true';
      const targetVisible = target && target.getAttribute('aria-hidden') === 'false';
      return {
        ok: shell.classList.contains(openClass) && expanded && targetVisible,
        action,
        shellClass: shell.className,
        expanded: button.getAttribute('aria-expanded'),
        targetHidden: target?.getAttribute('aria-hidden') || '',
      };
    };

    const showBattleProbe = () => {
      ensureGame();
      if (typeof game.startDebugBattle === 'function') {
        game.startDebugBattle(1, 'boss');
      } else {
        game.showScreen('battle-screen');
      }
      if (game.battle && typeof game.battle.updateBattleUI === 'function') {
        game.battle.updateBattleUI();
      }
    };

    const createBattleCommandModal = ({
      modalId,
      title,
      subtitle,
      recommend,
      choiceContainerId,
      cancelId,
      cancelTitle,
      cancelDesc,
      zIndex,
      profiles,
      activation = 'synthetic-fallback',
    }) => {
      const oldModal = document.getElementById(modalId);
      if (oldModal && oldModal.parentElement) oldModal.parentElement.removeChild(oldModal);
      const modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal';
      modal.style.zIndex = String(zIndex);

      const content = document.createElement('div');
      content.className = 'modal-content';
      content.style.maxWidth = modalId === 'resonance-matrix-modal' ? '460px' : '440px';
      content.style.textAlign = 'center';
      content.style.padding = '24px';

      const heading = document.createElement('h2');
      heading.style.marginBottom = '10px';
      heading.textContent = title;
      content.appendChild(heading);

      const subtitleEl = document.createElement('p');
      subtitleEl.style.opacity = '.85';
      subtitleEl.style.marginBottom = recommend ? '6px' : '14px';
      subtitleEl.textContent = subtitle;
      content.appendChild(subtitleEl);

      if (recommend) {
        const recommendEl = document.createElement('p');
        recommendEl.style.opacity = '.7';
        recommendEl.style.marginBottom = '14px';
        recommendEl.textContent = recommend;
        content.appendChild(recommendEl);
      }

      const choices = document.createElement('div');
      choices.id = choiceContainerId;
      choices.style.display = 'flex';
      choices.style.flexDirection = 'column';
      choices.style.gap = '8px';
      profiles.forEach((profile) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'event-choice battle-command-choice';
        const label = document.createElement('div');
        label.textContent = profile.label || profile.id || '战术选项';
        const desc = document.createElement('div');
        desc.className = 'choice-effect';
        desc.textContent = profile.desc || '选择本次战斗指令的执行方式。';
        btn.append(label, desc);
        choices.appendChild(btn);
      });
      content.appendChild(choices);

      const cancel = document.createElement('button');
      cancel.id = cancelId;
      cancel.type = 'button';
      cancel.className = 'event-choice';
      cancel.style.marginTop = '10px';
      const cancelLabel = document.createElement('div');
      cancelLabel.textContent = cancelTitle;
      const cancelEffect = document.createElement('div');
      cancelEffect.className = 'choice-effect';
      cancelEffect.textContent = cancelDesc;
      cancel.append(cancelLabel, cancelEffect);
      content.appendChild(cancel);

      modal.appendChild(content);
      document.body.appendChild(modal);
      modal.classList.add('active');
      return { ok: true, modalId, profileCount: profiles.length, activation };
    };

    const activateRealBattleCommandModal = (kind) => {
      showBattleProbe();
      const battle = game.battle;
      if (!battle) return { ok: false, reason: 'missing_battle' };
      const modalId = kind === 'matrix' ? 'resonance-matrix-modal' : 'horizon-barter-modal';
      const methodName = kind === 'matrix' ? 'resolveResonanceMatrixMode' : 'resolveHorizonBarterMode';
      if (typeof battle[methodName] !== 'function') return { ok: false, reason: `missing_${methodName}` };
      try {
        const openResult = runWithWebdriverDisabled(() => {
          if (kind === 'matrix') {
            return battle.resolveResonanceMatrixMode(null, {
              needDefend: true,
              needBreak: false,
              needCleanse: false,
            });
          }
          return battle.resolveHorizonBarterMode();
        });
        const pending = openResult?.result;
        if (pending && typeof pending.then === 'function') {
          window.__layoutPendingBattleCommandModal = pending.catch(() => null);
        }
        const modal = document.getElementById(modalId);
        const choices = modal?.querySelectorAll('.event-choice').length || 0;
        return {
          ok: !!modal,
          modalId,
          activation: 'real-battle-resolver',
          webdriverOverrideApplied: !!openResult?.overrideApplied,
          choiceElementCount: choices,
        };
      } catch (error) {
        return {
          ok: false,
          reason: 'real_resolver_failed',
          message: error?.message || String(error),
        };
      }
    };

    const activateHorizonBarterModal = () => {
      const real = activateRealBattleCommandModal('horizon');
      if (real.ok) return real;
      const profiles = game.battle && typeof game.battle.getHorizonBarterModeProfiles === 'function'
        ? game.battle.getHorizonBarterModeProfiles()
        : {
            conservative: { id: 'conservative', label: '保守交易', desc: '低投入，稳定续航，优先过牌与控压。' },
            balanced: { id: 'balanced', label: '均衡交易', desc: '均衡收益，攻防两端都可接受。' },
            aggressive: { id: 'aggressive', label: '激进交易', desc: '高投入高爆发，空转会引发更强反噬。' },
          };
      return createBattleCommandModal({
        modalId: 'horizon-barter-modal',
        title: '界隙交易',
        subtitle: '选择本次交易档位',
        choiceContainerId: 'horizon-barter-choices',
        cancelId: 'horizon-barter-cancel',
        cancelTitle: '取消交易',
        cancelDesc: '不发动本次指令',
        zIndex: 10040,
        profiles: [profiles.conservative, profiles.balanced, profiles.aggressive].filter(Boolean),
        activation: 'synthetic-fallback',
      });
    };

    const activateResonanceMatrixModal = () => {
      const real = activateRealBattleCommandModal('matrix');
      if (real.ok) return real;
      const profiles = game.battle && typeof game.battle.getResonanceMatrixModeProfiles === 'function'
        ? game.battle.getResonanceMatrixModeProfiles()
        : {
            auto: { id: 'auto', label: '自适应回路', desc: '根据敌我态势自动选择守势/破阵/净域/歼灭。' },
            guard: { id: 'guard', label: '守势优先', desc: '强制优先触发守势回路，稳住血线与减益。' },
            break: { id: 'break', label: '破阵优先', desc: '强制优先触发破阵回路，先拆盾再开口。' },
            cleanse: { id: 'cleanse', label: '净域优先', desc: '强制优先触发净域回路，优先解控与稳压。' },
            burst: { id: 'burst', label: '歼灭优先', desc: '强制优先触发歼灭回路，抢节奏打爆发。' },
          };
      return createBattleCommandModal({
        modalId: 'resonance-matrix-modal',
        title: '命环共振',
        subtitle: '选择本次回路策略',
        recommend: `战术建议：${profiles.guard?.label || '守势优先'}`,
        choiceContainerId: 'resonance-matrix-choices',
        cancelId: 'resonance-matrix-cancel',
        cancelTitle: '取消指令',
        cancelDesc: '不发动本次命环共振',
        zIndex: 10042,
        profiles: [profiles.auto, profiles.guard, profiles.break, profiles.cleanse, profiles.burst].filter(Boolean),
      });
    };

    const showGameOverProbe = () => {
      ensureGame();
      game.showScreen('game-over-screen');
      const title = document.getElementById('game-over-title');
      const text = document.getElementById('game-over-text');
      const floor = document.getElementById('stat-floor');
      const enemies = document.getElementById('stat-enemies');
      const laws = document.getElementById('stat-laws');
      const legacy = document.getElementById('stat-legacy');
      if (title) title.textContent = '陨落于第九重天';
      if (text) text.textContent = '本轮逆命暂时中断，但洞府、图鉴与传承会保留关键进度。';
      if (floor) floor.textContent = '第 9 重天 · 第 3 节';
      if (enemies) enemies.textContent = '27';
      if (laws) laws.textContent = String(game.player?.collectedLaws?.length || 0);
      if (legacy) legacy.textContent = '+120';
    };

    const activateEventModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      const event = allEvents()[0] || {
        title: '命途裂隙',
        icon: '🪞',
        desc: '裂隙里回放着上一轮失败的路线。选择一条线索，把这次远征推向更清晰的方向。',
        choices: [
          { text: '追踪观测线', description: '获得天机，并让下一次事件更偏向路线情报。' },
          { text: '稳住战斗线', description: '恢复生命，并让下一场战斗获得开场护盾。' },
          { text: '撕开裂隙', description: '获得高额奖励，但下一层遭遇更危险。' },
        ],
      };
      if (typeof game.showEventModal === 'function') game.showEventModal(event, { id: 'layout_event_node', type: 'event' });
      else {
        const modal = document.getElementById('event-modal');
        if (modal) modal.classList.add('active');
      }
    };

    const activateEndlessParanoiaModal = () => {
      ensureGame();
      if (typeof game.isEndlessActive === 'function' && !game.isEndlessActive() && typeof game.startEndlessMode === 'function') {
        game.startEndlessMode();
      }
      if (typeof game.ensureEndlessState !== 'function') return { ok: false, reason: 'missing_ensureEndlessState' };
      if (typeof game.showEndlessParanoiaSelection !== 'function') return { ok: false, reason: 'missing_showEndlessParanoiaSelection' };
      const state = game.ensureEndlessState();
      state.currentCycle = 26;
      state.activeParanoiaBurdens = ['withered_mend'];
      state.activeParanoiaBoons = ['rare_surge'];
      state.paranoiaLevel = 1;
      state.paranoiaHistory = [{ burdenId: 'withered_mend', boonId: 'rare_surge', cycle: 13 }];
      if (typeof game.showScreen === 'function') game.showScreen('map-screen');
      game.showEndlessParanoiaSelection(26);
      const modal = document.getElementById('event-modal');
      const title = document.getElementById('event-title')?.textContent?.trim() || '';
      const desc = document.getElementById('event-desc')?.textContent?.trim() || '';
      const choices = Array.from(document.querySelectorAll('#event-choices .event-choice.endless-paranoia-choice'));
      return {
        ok: !!modal && modal.classList.contains('active') && title === '轮回偏执' && choices.length === 3,
        activation: 'real-endless-paranoia-selection',
        rootSelector: '#event-modal',
        active: !!modal?.classList.contains('active'),
        title,
        desc,
        choiceCount: choices.length,
      };
    };

    const activateRemoveCardModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      const modal = document.getElementById('remove-card-modal');
      const list = document.getElementById('remove-card-list');
      if (list) {
        list.innerHTML = '';
        (game.player?.deck || allCards()).slice(0, 10).forEach((card, index) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'collection-card remove-card-option';
          item.innerHTML = `<strong>${safeText(card.icon || '🃏')} ${safeText(card.name || `卡牌 ${index + 1}`)}</strong><span>${safeText(card.description || card.desc || '选择后会从牌组中移除。')}</span>`;
          list.appendChild(item);
        });
      }
      if (modal) modal.classList.add('active');
    };

    const activateSettingsModal = () => {
      ensureGame();
      game.showScreen('main-menu');
      if (typeof game.showGameIntro === 'function') game.showGameIntro();
      else document.getElementById('settings-modal')?.classList.add('active');
    };

    const activateAuthModal = () => {
      ensureGame();
      game.showScreen('main-menu');
      const modal = document.getElementById('auth-modal');
      if (modal) modal.classList.add('active');
    };

    const activateSaveConflictModal = () => {
      ensureGame();
      game.showScreen('main-menu');
      const localData = {
        timestamp: Date.now() - 42 * 60000,
        player: {
          realm: 7,
          currentHp: 79,
          gold: 8700,
        },
        layoutMarker: 'layout-local-save-conflict',
      };
      const cloudTime = Date.now() - 5 * 60000;
      const cloudData = {
        timestamp: cloudTime,
        player: {
          realm: 5,
          currentHp: 93,
          gold: 5100,
        },
        layoutMarker: 'layout-cloud-save-conflict',
      };
      if (typeof game.showSaveConflictModal === 'function') {
        game.showSaveConflictModal(localData, cloudData, cloudTime);
        return { ok: true, activation: 'real-show-save-conflict-modal' };
      }
      return { ok: false, reason: 'missing showSaveConflictModal' };
    };

    const activateSaveSlotsModal = () => {
      ensureGame();
      game.showScreen('main-menu');
      const sample = {
        timestamp: Date.now() - 3600000,
        player: {
          characterId: 'linFeng',
          realm: 6,
          currentHp: 72,
          registerTime: Date.now() - 86400000,
        },
        unlockedRealms: [1, 2, 3, 4, 5, 6],
      };
      if (typeof game.renderSaveSlots === 'function') {
        game.renderSaveSlots([sample, null, { ...sample, player: { ...sample.player, characterId: 'wuYu', currentHp: 58 } }, null]);
      } else {
        document.getElementById('save-slots-modal')?.classList.add('active');
      }
    };

    const activateDeckModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      if (typeof game.showDeck === 'function') game.showDeck();
      else document.getElementById('deck-modal')?.classList.add('active');
    };

    const activateTreasureBagModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      const treasures = treasureSamples().slice(0, 10);
      if (treasures.length && game.player) {
        game.player.collectedTreasures = treasures;
        game.player.equippedTreasures = treasures.slice(0, Math.min(2, treasures.length));
        game.player.treasures = game.player.equippedTreasures;
      }
      if (game.inventoryView && typeof game.inventoryView.showTreasureBag === 'function') {
        game.inventoryView.showTreasureBag();
      } else if (typeof game.showTreasureBag === 'function') {
        game.showTreasureBag();
      } else {
        const modal = document.getElementById('treasure-bag-modal');
        if (modal) modal.style.display = 'flex';
      }
    };

    const activateCardModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      const card = game.player?.deck?.[0] || allCards()[0];
      const modal = document.getElementById('card-modal');
      const target = document.getElementById('modal-card');
      if (target && card) {
        if (typeof game.createCardElement === 'function') {
          const cardEl = game.createCardElement(card);
          target.innerHTML = '';
          target.appendChild(cardEl);
        } else {
          target.innerHTML = `<div class="card"><div class="card-name">${safeText(card.name || '测试卡牌')}</div><div class="card-desc">${safeText(card.description || card.desc || '卡牌描述')}</div></div>`;
        }
      }
      if (modal) modal.classList.add('active');
    };

    const activateDynamicCardDetailModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      const sourceCard = game.player?.deck?.find(card => Array.isArray(card.effects) && card.effects.length >= 2)
        || allCards().find(card => Array.isArray(card.effects) && card.effects.length >= 2)
        || game.player?.deck?.[0]
        || allCards()[0]
        || {
          id: 'layout_dynamic_card_detail',
          name: '星镜归卷·长名压力样本',
          icon: '🔭',
          type: 'skill',
          rarity: 'legendary',
          cost: 2,
          description: '检视当前手牌、抽牌堆与弃牌堆，把下一次关键抉择压成可复盘样本；这段说明用于检查动态详情弹窗在移动端不会遮挡、裁切或压住关闭按钮。',
          lore: '史卷会记下每一次犹豫，但只奖励真正看懂题面的人。',
          effects: [
            { type: 'draw', value: 2 },
            { type: 'block', value: 8 },
            { type: 'energy', value: 1 },
          ],
        };
      const card = {
        ...sourceCard,
        name: sourceCard.name || '星镜归卷·长名压力样本',
        icon: sourceCard.icon || '🔭',
        type: sourceCard.type || 'skill',
        rarity: sourceCard.rarity || 'legendary',
        cost: typeof sourceCard.cost === 'number' ? sourceCard.cost : 2,
        description: sourceCard.description || sourceCard.desc || '检视当前手牌、抽牌堆与弃牌堆，把下一次关键抉择压成可复盘样本；这段说明用于检查动态详情弹窗在移动端不会遮挡、裁切或压住关闭按钮。',
        lore: sourceCard.lore || '史卷会记下每一次犹豫，但只奖励真正看懂题面的人。',
        effects: Array.isArray(sourceCard.effects) && sourceCard.effects.length
          ? sourceCard.effects
          : [
              { type: 'draw', value: 2 },
              { type: 'block', value: 8 },
              { type: 'energy', value: 1 },
            ],
      };
      if (typeof Utils !== 'undefined' && typeof Utils.showCardDetail === 'function') {
        Utils.showCardDetail(card, {
          sectionLabel: '布局审计·动态详情',
          priceText: '300 天道币',
          availabilityText: '可预览',
          sourceLabel: 'PVP 商店 / 图鉴详情',
          usageHint: '先确认费用与效果数，再阅读卡面说明；移动端必须保持关闭按钮和摘要信息可见。',
          extraSummaryRows: [
            { label: '测试锚点', value: 'card-detail-modal' },
            { label: '来源', value: '动态创建' },
          ],
        });
      } else {
        let modal = document.getElementById('card-detail-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'card-detail-modal';
          modal.className = 'modal-overlay card-detail-overlay';
          document.body.appendChild(modal);
        }
        modal.innerHTML = `<div class="card-detail-container"><button data-card-detail-close="true">关闭界面</button><div class="card"><div class="card-name">${safeText(card.name)}</div><div class="card-desc">${safeText(card.description)}</div></div></div>`;
        modal.style.display = 'flex';
      }
    };

    const activateShopServiceDetailModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      if (game.player) {
        game.player.gold = Math.max(Number(game.player.gold) || 0, 180);
        game.player.maxHp = Math.max(Number(game.player.maxHp) || 1, 96);
        game.player.currentHp = Math.max(1, Math.floor(game.player.maxHp * 0.58));
      }
      const service = {
        id: 'layoutServiceDecision',
        type: 'service',
        name: '万里商路决策单·长名压力样本',
        icon: '🧾',
        tagLabel: '布局审计',
        riskLabel: '买前检查',
        desc: '打开这项服务时，玩家需要同时看到买后剩余、储备线、建议单次与下一节点预判；这段长说明用于检查服务详情弹窗在短屏和移动端不会裁切关键按钮。',
        price: 96,
        sold: false,
      };
      let meta = {
        sectionLabel: '服务详情',
        sourceLabel: '布局审计页',
        priceText: '💰 96 灵石',
        availabilityText: '可购买',
        usageHint: '先看买后剩余和储备线，再决定是否立刻购买这项服务。',
        fitLabel: '中适配',
        economyNote: '当前可支配约 84 灵石，可优先买下真正高适配的卡牌或关键服务。',
        forecastText: '下一批节点：精英战 / 营地',
        extraSummaryRows: [
          { label: '适配度', value: '中适配' },
          { label: '买后剩余', value: '84 灵石' },
          { label: '储备线', value: '54 灵石' },
          { label: '建议单次', value: '≤ 126 灵石' },
          { label: '当前血线', value: '58%' },
        ],
        closeLabel: '返回商店',
      };
      if (typeof game.buildShopServiceDetailMeta === 'function') {
        meta = {
          ...game.buildShopServiceDetailMeta(service, { label: '布局审计页' }),
          sectionLabel: '服务详情',
          sourceLabel: '布局审计页',
          closeLabel: '返回商店',
        };
      }
      if (typeof Utils !== 'undefined' && typeof Utils.showShopServiceDetail === 'function') {
        Utils.showShopServiceDetail(service, meta);
      } else {
        let modal = document.getElementById('card-detail-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.id = 'card-detail-modal';
          modal.className = 'modal-overlay card-detail-overlay';
          document.body.appendChild(modal);
        }
        modal.innerHTML = `<div class="card-detail-container"><button data-card-detail-close="true">返回商店</button><div class="service-detail-main">${safeText(service.desc)}</div><div class="service-detail-side">买后剩余 储备线 建议单次</div></div>`;
        modal.style.display = 'flex';
      }
    };

    const activateSkillConfirmModal = () => {
      ensureGame();
      game.showScreen('battle-screen');
      if (!game.player.activeSkill) {
        game.player.activeSkill = {
          name: '破界雷令',
          icon: '⚡',
          description: '立即对敌方造成伤害，并为下一回合保留一次反制窗口。',
          getDescription: () => '立即对敌方造成伤害，并为下一回合保留一次反制窗口。'
        };
      }
      if (typeof game.showSkillConfirmModal === 'function') {
        game.showSkillConfirmModal();
      } else {
        const modal = document.getElementById('skill-confirm-modal');
        const titleEl = document.getElementById('skill-confirm-title');
        const iconEl = document.getElementById('skill-confirm-icon');
        const descEl = document.getElementById('skill-confirm-desc');
        if (titleEl) titleEl.textContent = game.player.activeSkill.name;
        if (iconEl) iconEl.textContent = game.player.activeSkill.icon || '⚡';
        if (descEl) descEl.textContent = game.player.activeSkill.description || '';
        if (modal) modal.classList.add('active');
      }
    };

    const activateTreasureDetailModal = () => {
      ensureGame();
      game.showScreen('treasure-compendium');
      const treasure = treasureSamples()[0];
      if (treasure && game.inventoryView && typeof game.inventoryView.showTreasureDetail === 'function') game.inventoryView.showTreasureDetail(treasure, true);
      else if (treasure && typeof game.showTreasureDetail === 'function') game.showTreasureDetail(treasure, true);
      else document.getElementById('treasure-detail-modal')?.classList.add('active');
    };

    const activateLawDetailModal = () => {
      ensureGame();
      game.showScreen('collection');
      const law = allLaws().find(isRealLawSample) || auditLawSample();
      if (law && typeof game.showLawDetail === 'function') game.showLawDetail(law, true);
      else document.getElementById('law-detail-modal')?.classList.add('active');
    };

    const activateRingModal = () => {
      ensureGame();
      game.showScreen('map-screen');
      if (typeof game.showFateRing === 'function') game.showFateRing();
      else document.getElementById('ring-modal')?.classList.add('active');
    };

    const activateRewardPopup = () => {
      ensureGame();
      game.showScreen('map-screen');
      if (typeof game.showRewardModal === 'function') {
        game.showRewardModal(
          '观测样本归档',
          '本轮路线已经记录为可复盘样本。\n获得：天机 +3 / 灵石 +120 / 命环经验 +45。\n下一轮可在洞府训练中继续追踪这条观测线。',
          '🔭'
        );
      }
    };

    const activateConfirmModal = () => {
      ensureGame();
      game.showScreen('inheritance-screen');
      if (typeof game.showConfirmModal === 'function') {
        game.showConfirmModal('确认重配当前传承投入？这会返还全部精粹并按新道统重新分配。', () => {});
      }
    };

    const activateAlertModal = () => {
      ensureGame();
      game.showScreen('main-menu');
      if (typeof game.showAlertModal === 'function') {
        game.showAlertModal(
          '云端已有更新，本地存档未覆盖云端。\n请回到存档位重新选择保留本地或读取云端；这段长提示用于检查移动端通用提示弹窗的换行、按钮和关闭控件不会互相遮挡。',
          '云同步提示'
        );
      } else if (game.systemView && typeof game.systemView.showAlertModal === 'function') {
        game.systemView.showAlertModal('云端已有更新，本地存档未覆盖云端。', '云同步提示');
      }
    };

    const activateTreasureBagAlertStack = () => {
      activateTreasureBagModal();
      if (typeof game.showAlertModal === 'function') {
        game.showAlertModal(
          '法宝槽位已满，请先卸下一件已装备法宝再继续操作。\n这条提示覆盖在法宝囊之上，必须保持标题、正文、确定按钮和关闭按钮都可见可点。',
          '无法装备'
        );
      } else if (game.systemView && typeof game.systemView.showAlertModal === 'function') {
        game.systemView.showAlertModal('法宝槽位已满，请先卸下一件已装备法宝再继续操作。', '无法装备');
      }
    };

    const activatePurificationModal = () => {
      ensureGame();
      game.showScreen('shop-screen');
      const modal = document.getElementById('purification-modal');
      const grid = document.getElementById('purification-grid');
      if (grid) {
        grid.innerHTML = '';
        (game.player?.deck || allCards()).slice(0, 8).forEach((card, index) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'purification-card-option';
          item.innerHTML = `<strong>${safeText(card.name || `卡牌 ${index + 1}`)}</strong><span>${safeText(card.description || card.desc || '用于净化测试的卡牌。')}</span>`;
          grid.appendChild(item);
        });
      }
      const cost = document.getElementById('purification-cost-display');
      if (cost) cost.textContent = '消耗: 100 灵石';
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
    };

    await cleanup();

    if (!window.game) return { ok: false, reason: 'missing_game', rootSelector: 'body' };

    let setupResult = {};

    switch (id) {
      case 'main-menu':
        game.showScreen('main-menu');
        break;
      case 'pvp-screen':
        ensureGame();
        game.showScreen('pvp-screen');
        if (window.PVPScene && typeof PVPScene.onShow === 'function') PVPScene.onShow();
        break;
      case 'character-selection-screen':
        ensureGame();
        if (typeof game.showCharacterSelection === 'function') {
          game.showCharacterSelection();
          if (typeof game.selectCharacter === 'function') game.selectCharacter('linFeng');
        } else game.showScreen('character-selection-screen');
        break;
      case 'character-select':
        ensureGame();
        if (typeof game.showPlayerInfo === 'function') game.showPlayerInfo();
        else game.showScreen('character-select');
        break;
      case 'collection-laws':
        showCollectionSection('laws');
        break;
      case 'collection-spirits':
        showCollectionSection('spirits');
        break;
      case 'collection-chapters':
        showCollectionSection('chapters');
        break;
      case 'collection-enemies':
        showCollectionSection('enemies');
        break;
      case 'collection-bosses':
        showCollectionSection('bosses');
        break;
      case 'collection-builds':
        showCollectionSection('builds');
        break;
      case 'collection-slates':
        showCollectionSection('slates');
        break;
      case 'collection-sanctum':
        showCollectionSection('sanctum');
        break;
      case 'challenge-daily':
        showChallengeTab('daily');
        break;
      case 'challenge-weekly':
        showChallengeTab('weekly');
        break;
      case 'challenge-global':
        showChallengeTab('global');
        break;
      case 'treasure-compendium':
        ensureGame();
        if (typeof game.showTreasureCompendium === 'function') game.showTreasureCompendium();
        else game.showScreen('treasure-compendium');
        break;
      case 'realm-select-screen':
        ensureGame();
        game.unlockedRealms = Array.from({ length: 18 }, (_, index) => index + 1);
        game.showScreen('realm-select-screen');
        if (typeof game.initRealmSelect === 'function') game.initRealmSelect();
        break;
      case 'map-screen':
        await showMapProbe();
        break;
      case 'map-screen-tools':
        await showMapToolsProbe();
        break;
      case 'map-screen-intel-toggle':
        setupResult = await clickMapHeaderToggle('toggle-map-intel');
        if (!setupResult.ok) return setupResult;
        break;
      case 'map-screen-tools-toggle':
        setupResult = await clickMapHeaderToggle('toggle-map-tools');
        if (!setupResult.ok) return setupResult;
        break;
      case 'map-screen-expedition-intel-click':
        setupResult = await showMapExpeditionIntelProbe();
        if (!setupResult.ok) return setupResult;
        break;
      case 'battle-screen':
        showBattleProbe();
        break;
      case 'horizon-barter-modal':
        setupResult = activateHorizonBarterModal();
        if (!setupResult.ok) return setupResult;
        break;
      case 'resonance-matrix-modal':
        setupResult = activateResonanceMatrixModal();
        if (!setupResult.ok) return setupResult;
        break;
      case 'reward-screen':
        showRewardProbe();
        break;
      case 'shop-screen':
        showShopProbe();
        break;
      case 'achievements-screen':
        ensureGame();
        if (typeof game.showAchievements === 'function') game.showAchievements();
        else game.showScreen('achievements-screen');
        break;
      case 'inheritance-screen':
        ensureGame();
        game.showScreen('inheritance-screen');
        break;
      case 'game-over-screen':
        showGameOverProbe();
        break;
      case 'pvp-result-overlay': {
        ensureGame();
        game.showScreen('pvp-screen');
        const overlay = document.getElementById('pvp-result-overlay');
        if (overlay) {
          overlay.className = 'screen pvp-result-overlay victory active';
          overlay.style.display = 'flex';
        }
        const title = document.getElementById('pvp-result-title');
        const score = document.getElementById('pvp-current-score');
        const delta = document.getElementById('pvp-score-delta');
        const opponent = document.getElementById('pvp-result-opponent');
        const review = document.getElementById('pvp-result-review-summary');
        if (title) title.textContent = '问道成功';
        if (score) score.textContent = '1325';
        if (delta) delta.textContent = '+28';
        if (opponent) opponent.textContent = '天榜试炼者·长名压力测试';
        if (review) review.textContent = '本局通过提前识别对手爆发窗口，把防御与反制压在同一回合，节奏保持可控。';
        break;
      }
      case 'event-modal':
        activateEventModal();
        break;
      case 'endless-paranoia-modal':
        setupResult = activateEndlessParanoiaModal();
        if (!setupResult.ok) return setupResult;
        break;
      case 'remove-card-modal':
        activateRemoveCardModal();
        break;
      case 'settings-modal':
        activateSettingsModal();
        break;
      case 'auth-modal':
        activateAuthModal();
        break;
      case 'save-conflict-modal':
        setupResult = activateSaveConflictModal();
        if (!setupResult.ok) return setupResult;
        break;
      case 'save-slots-modal':
        activateSaveSlotsModal();
        break;
      case 'deck-modal':
        activateDeckModal();
        break;
      case 'treasure-bag-modal':
        activateTreasureBagModal();
        break;
      case 'card-modal':
        activateCardModal();
        break;
      case 'dynamic-card-detail-modal':
        activateDynamicCardDetailModal();
        break;
      case 'shop-service-detail-modal':
        activateShopServiceDetailModal();
        break;
      case 'skill-confirm-modal':
        activateSkillConfirmModal();
        break;
      case 'treasure-detail-modal':
        activateTreasureDetailModal();
        break;
      case 'law-detail-modal':
        activateLawDetailModal();
        break;
      case 'ring-modal':
        activateRingModal();
        break;
      case 'reward-modal':
        activateRewardPopup();
        break;
      case 'confirm-modal':
        activateConfirmModal();
        break;
      case 'alert-modal':
        activateAlertModal();
        break;
      case 'treasure-bag-alert-modal':
        activateTreasureBagAlertStack();
        break;
      case 'purification-modal':
        activatePurificationModal();
        break;
      default:
        game.showScreen('main-menu');
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { ok: true, ...setupResult };
  }, scenarioId);
}

async function inspectLayout(page, rootSelector, scenarioId) {
  return page.evaluate(({ rootSelector, scenarioId }) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.querySelector(rootSelector);
    const issues = [];
    const warnings = [];

    const rectObj = (rect) => ({
      left: Math.round(rect.left * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    });

    const selectorFor = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList || []).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };

    const hasHiddenAncestor = (el) => {
      let node = el;
      while (node && node instanceof Element) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
        node = node.parentElement;
      }
      return false;
    };

    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (hasHiddenAncestor(el)) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 2 && rect.height >= 2;
    };

    const isScrollable = (el, axis = 'y') => {
      if (!el || !(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      const overflow = axis === 'x' ? style.overflowX : style.overflowY;
      return /(auto|scroll|overlay)/.test(overflow);
    };

    const clipsOverflow = (el, axis = 'y') => {
      if (!el || !(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      const overflow = axis === 'x' ? style.overflowX : style.overflowY;
      return /(auto|scroll|overlay|hidden|clip)/.test(overflow);
    };

    const hasScrollableAncestor = (el, axis = 'y') => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        if (isScrollable(node, axis)) return true;
        node = node.parentElement;
      }
      return false;
    };

    const clippedRectFor = (el) => {
      const rect = el.getBoundingClientRect();
      const clip = {
        left: 0,
        top: 0,
        right: viewport.width,
        bottom: viewport.height,
      };
      let node = el.parentElement;
      while (node && node !== document.body && node !== document.documentElement) {
        const nodeRect = node.getBoundingClientRect();
        if (clipsOverflow(node, 'x')) {
          clip.left = Math.max(clip.left, nodeRect.left);
          clip.right = Math.min(clip.right, nodeRect.right);
        }
        if (clipsOverflow(node, 'y')) {
          clip.top = Math.max(clip.top, nodeRect.top);
          clip.bottom = Math.min(clip.bottom, nodeRect.bottom);
        }
        node = node.parentElement;
      }
      return {
        left: Math.max(rect.left, clip.left),
        top: Math.max(rect.top, clip.top),
        right: Math.min(rect.right, clip.right),
        bottom: Math.min(rect.bottom, clip.bottom),
      };
    };

    const hasVisibleArea = (rect) => rect.right - rect.left >= 2 && rect.bottom - rect.top >= 2;

    const isIntentionallyClamped = (el) => {
      const style = getComputedStyle(el);
      return style.textOverflow === 'ellipsis'
        || Number.parseInt(style.webkitLineClamp || '0', 10) > 0
        || el.classList.contains('enemy-intent-label')
        || el.classList.contains('challenge-run-focus')
        || el.classList.contains('card-desc');
    };

    const textLabel = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const selectorMatches = (selector = '', patterns = []) => patterns.some((pattern) => selector.includes(pattern));
    const isViewportVisible = (el) => hasVisibleArea(clippedRectFor(el));
    const buildWarning = (type, el, extra = {}) => ({
      type,
      selector: selectorFor(el),
      text: textLabel(el),
      rect: rectObj(el.getBoundingClientRect()),
      ...extra,
    });
    const isBattleHandCard = (el) => !!el.closest('#hand-cards, .hand-area, .battle-hand, .battle-hand-area');
    const isCollectionToolbar = (el) => (
      el.matches('.compendium-toolbar, .codex-toolbar, .compendium-toolbar.codex-toolbar')
      && /^(collection-|treasure-compendium)/.test(scenarioId)
    );
    const isRootLikeScroller = (el) => (
      el.clientWidth >= viewport.width - 8
      && el.clientHeight >= viewport.height - 8
      && el.scrollHeight > el.clientHeight + 120
    );
    const isWarningNoise = (warning) => {
      const selector = warning.selector || '';
      return selectorMatches(selector, ['.char-header', '.ring-scene-container', '#realm-preview-panel'])
        || selector === rootSelector
        || selectorMatches(selector, ['.map-screen-v3'])
        || warning.noise === true;
    };
    const shouldPromoteWarning = (warning) => {
      const selector = warning.selector || '';
      const rect = warning.rect || {};
      const visibleEnough = rect.width >= 24 && rect.height >= 24;
      const severeVerticalClip = (warning.scrollHeight || 0) > (warning.clientHeight || 0) + 24;
      if (warning.promote !== undefined) return warning.promote;
      if (!visibleEnough) return false;
      if (selectorMatches(selector, ['.event-choice', '#battle-tactical-advisor', '.modal-content.event-view', '.fate-ring-info-panel'])) {
        return true;
      }
      if (selector.includes('.card')) {
        return !warning.battleHandCard;
      }
      if (isCollectionToolbar(document.querySelector(selector))) {
        return severeVerticalClip;
      }
      return false;
    };

    if (!root) {
      return {
        ok: false,
        rootMissing: true,
        issues: [{ type: 'missing-root', selector: rootSelector }],
        warnings,
        viewport,
      };
    }

    if (!isVisible(root)) {
      issues.push({ type: 'hidden-root', selector: rootSelector });
    }

    const rootRect = root.getBoundingClientRect();
    const rootStyle = getComputedStyle(root);
    if (
      isVisible(root)
      && !isScrollable(root, 'y')
      && rootStyle.position !== 'fixed'
      && (rootRect.bottom > viewport.height + 2 || rootRect.top < -2)
    ) {
      issues.push({ type: 'root-outside-viewport', selector: rootSelector, rect: rectObj(rootRect) });
    }

    if (/^map-screen/.test(scenarioId) && viewport.width <= 520) {
      const mapScroller = root.querySelector('#map-scroll-container');
      const rows = Array.from(root.querySelectorAll('.node-row-v3')).filter(isVisible);
      if (mapScroller && rows.length) {
        const scrollerRect = mapScroller.getBoundingClientRect();
        const fullRows = rows.filter((row) => {
          const rowRect = row.getBoundingClientRect();
          return rowRect.top >= scrollerRect.top + 2
            && rowRect.bottom <= scrollerRect.bottom - 2
            && rowRect.height >= 72;
        });
        if (fullRows.length === 0) {
          issues.push({
            type: 'mobile-map-has-no-full-visible-node-row',
            selector: '#map-scroll-container',
            rect: rectObj(scrollerRect),
            rowCount: rows.length,
          });
        }
        if (mapScroller.scrollHeight > mapScroller.clientHeight + 8 && !isScrollable(mapScroller, 'y')) {
          issues.push({
            type: 'mobile-map-scroll-container-not-scrollable',
            selector: '#map-scroll-container',
            rect: rectObj(scrollerRect),
            scrollHeight: mapScroller.scrollHeight,
            clientHeight: mapScroller.clientHeight,
          });
        }
      }
    }

    const candidateSelector = [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '.card',
      '.character-card',
      '.realm-card',
      '.reward-card',
      '.shop-service',
      '.save-slot',
      '.collection-card',
      '.collection-section-card',
      '.collection-detail-shell',
      '.codex-shell',
      '.challenge-shell',
      '.treasure-compendium-shell',
      '.reward-shell',
      '.shop-container',
      '.game-over-container',
      '.pvp-result-container',
      '.card-detail-container',
      '.modal-content',
      '.ring-scene-container',
      '.purification-container',
      '.boss-act-panel',
      '#battle-command-panel',
      '#hand-cards .card',
      '.enemy',
      '.event-choice',
      '.achievement-card',
      '.inheritance-card',
      '.pvp-panel',
      '.pvp-card',
      '.treasure-slot',
      '.inventory-item',
    ].join(',');

    const candidates = Array.from(root.querySelectorAll(candidateSelector)).filter(isVisible);
    let treasureBagProbe = null;
    let alertModalProbe = null;
    let treasureBagAlertProbe = null;
    let dynamicCardDetailProbe = null;
    let shopServiceDetailProbe = null;
    let battleCommandModalProbe = null;
    let endlessParanoiaModalProbe = null;
    let saveSlotsModalProbe = null;
    let saveConflictModalProbe = null;
    let authModalProbe = null;
    let confirmModalProbe = null;
    let rewardExpeditionCtaProbe = null;
    let skillConfirmModalProbe = null;
    let treasureDetailModalProbe = null;
    let lawDetailModalProbe = null;
    let rewardModalProbe = null;
    let pvpLiveMobileProbe = null;
    let collectionLawsMobileProbe = null;
    const readHitState = (element) => {
      const rect = element ? element.getBoundingClientRect() : null;
      const point = rect ? {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      } : null;
      const inViewport = !!(point && point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height);
      const top = inViewport ? document.elementFromPoint(point.x, point.y) : null;
      return {
        rect: rect ? rectObj(rect) : null,
        point,
        inViewport,
        topSelector: selectorFor(top),
        topHit: !!(element && top && (top === element || element.contains(top))),
      };
    };
    const readHitStateAfterScroll = (element) => {
      const initial = readHitState(element);
      let final = initial;
      if (element && !initial.topHit && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        final = readHitState(element);
      }
      return { initial, final };
    };
    const rectFitsViewport = (rect, tolerance = 1) => !!(rect
      && rect.left >= -tolerance
      && rect.top >= -tolerance
      && rect.right <= viewport.width + tolerance
      && rect.bottom <= viewport.height + tolerance);
    if (scenarioId === 'treasure-bag-modal') {
      const filledSlots = Array.from(root.querySelectorAll('.treasure-slot.filled')).filter(isVisible);
      const inventoryItems = Array.from(root.querySelectorAll('.inventory-item')).filter(isVisible);
      const emptyInventory = root.querySelector('.empty-inventory');
      const equippedCountText = root.querySelector('#equipped-count')?.textContent?.trim() || '';
      treasureBagProbe = {
        filledSlotCount: filledSlots.length,
        inventoryItemCount: inventoryItems.length,
        equippedCountText,
        emptyInventoryText: emptyInventory ? textLabel(emptyInventory) : '',
      };
      if (filledSlots.length < 1) {
        issues.push({
          type: 'treasure-bag-missing-filled-slot',
          selector: '.treasure-slot.filled',
          detail: treasureBagProbe,
        });
      }
      if (inventoryItems.length < 1) {
        issues.push({
          type: 'treasure-bag-missing-inventory-item',
          selector: '.inventory-item',
          detail: treasureBagProbe,
        });
      }
    }
    if (scenarioId === 'alert-modal' || scenarioId === 'treasure-bag-alert-modal') {
      const title = root.querySelector('#generic-alert-title');
      const message = root.querySelector('#generic-alert-message');
      const okButton = root.querySelector('#generic-alert-btn');
      alertModalProbe = {
        title: title ? textLabel(title) : '',
        messageLength: message ? textLabel(message).length : 0,
        okButtonVisible: !!(okButton && isVisible(okButton)),
        closeButtonVisible: !!(root.querySelector('.modal-close') && isVisible(root.querySelector('.modal-close'))),
      };
      if (!alertModalProbe.title || alertModalProbe.messageLength < 24 || !alertModalProbe.okButtonVisible) {
        issues.push({
          type: 'alert-modal-missing-content',
          selector: '#generic-alert-modal',
          detail: alertModalProbe,
        });
      }
    }
    if (scenarioId === 'treasure-bag-alert-modal') {
      const treasureBag = document.getElementById('treasure-bag-modal');
      const alertContent = root.querySelector('.modal-content');
      const okButton = root.querySelector('#generic-alert-btn');
      const okRect = okButton ? okButton.getBoundingClientRect() : null;
      const okPoint = okRect ? {
        x: Math.round(okRect.left + okRect.width / 2),
        y: Math.round(okRect.top + okRect.height / 2),
      } : null;
      const topAtOk = okPoint ? document.elementFromPoint(okPoint.x, okPoint.y) : null;
      const alertZ = Number.parseInt(getComputedStyle(root).zIndex || '0', 10) || 0;
      const bagZ = treasureBag ? (Number.parseInt(getComputedStyle(treasureBag).zIndex || '0', 10) || 0) : 0;
      const initialTreasureBagVisible = !!(treasureBag && isVisible(treasureBag));
      const initialAlertContentVisible = !!(alertContent && isVisible(alertContent));
      const initialOkButtonVisible = !!(okButton && isVisible(okButton));
      const initialOkButtonTopHit = !!(okButton && topAtOk && (topAtOk === okButton || okButton.contains(topAtOk)));
      let dismissChain = null;
      if (okButton) {
        okButton.click();
        const bagCloseButton = treasureBag?.querySelector('[data-inventory-action="close-treasure-bag"]');
        const closeButtonHit = readHitState(bagCloseButton);
        const afterOk = {
          alertVisible: isVisible(root),
          alertActive: root.classList.contains('active'),
          treasureBagVisible: !!(treasureBag && isVisible(treasureBag)),
          treasureBagDisplay: treasureBag ? getComputedStyle(treasureBag).display : '',
          closeButtonTopHit: closeButtonHit.topHit,
          closeButtonTopAt: closeButtonHit.topSelector,
        };
        if (bagCloseButton) bagCloseButton.click();
        dismissChain = {
          afterOk,
          afterClose: {
            alertVisible: isVisible(root),
            alertActive: root.classList.contains('active'),
            treasureBagVisible: !!(treasureBag && isVisible(treasureBag)),
            treasureBagDisplay: treasureBag ? getComputedStyle(treasureBag).display : '',
          },
        };
      }
      treasureBagAlertProbe = {
        treasureBagVisible: initialTreasureBagVisible,
        alertContentVisible: initialAlertContentVisible,
        okButtonVisible: initialOkButtonVisible,
        okButtonTopHit: initialOkButtonTopHit,
        alertZ,
        bagZ,
        topAtOk: selectorFor(topAtOk),
        dismissChain,
      };
      if (!treasureBagAlertProbe.treasureBagVisible
        || !treasureBagAlertProbe.alertContentVisible
        || !treasureBagAlertProbe.okButtonVisible
        || !treasureBagAlertProbe.okButtonTopHit
        || alertZ <= bagZ
        || !dismissChain
        || dismissChain.afterOk.alertVisible
        || dismissChain.afterOk.alertActive
        || !dismissChain.afterOk.treasureBagVisible
        || !dismissChain.afterOk.closeButtonTopHit
        || dismissChain.afterClose.alertVisible
        || dismissChain.afterClose.alertActive
        || dismissChain.afterClose.treasureBagVisible) {
        issues.push({
          type: 'treasure-bag-alert-stack-invalid',
          selector: '#generic-alert-modal',
          detail: treasureBagAlertProbe,
        });
      }
    }
    if (scenarioId === 'dynamic-card-detail-modal') {
      const container = root.querySelector('.card-detail-container');
      const previewCard = root.querySelector('.big-preview.card, .card.big-preview, .card-detail-container .card');
      const closeButton = root.querySelector('[data-card-detail-close="true"]');
      const summaryRows = Array.from(root.querySelectorAll('.cd-summary-row')).filter(isVisible);
      const statusChips = Array.from(root.querySelectorAll('.detail-status-chip')).filter(isVisible);
      const closeButtonHit = readHitStateAfterScroll(closeButton);
      const summaryRowHit = readHitStateAfterScroll(summaryRows[0]);
      dynamicCardDetailProbe = {
        containerVisible: !!(container && isVisible(container)),
        previewCardVisible: !!(previewCard && isVisible(previewCard)),
        closeButtonVisible: !!(closeButton && isVisible(closeButton)),
        closeButtonInitiallyTopHit: closeButtonHit.initial.topHit,
        closeButtonTopHit: closeButtonHit.final.topHit,
        closeButtonRect: closeButtonHit.final.rect,
        summaryRowCount: summaryRows.length,
        summaryRowInitiallyTopHit: summaryRowHit.initial.topHit,
        summaryRowTopHit: summaryRowHit.final.topHit,
        summaryRowRect: summaryRowHit.final.rect,
        statusChipCount: statusChips.length,
        title: textLabel(root.querySelector('.cd-header h2') || root.querySelector('.card-name')),
      };
      if (!dynamicCardDetailProbe.containerVisible || !dynamicCardDetailProbe.previewCardVisible || !dynamicCardDetailProbe.closeButtonVisible || dynamicCardDetailProbe.summaryRowCount < 2) {
        issues.push({
          type: 'dynamic-card-detail-missing-content',
          selector: '#card-detail-modal',
          detail: dynamicCardDetailProbe,
        });
      }
      if (!dynamicCardDetailProbe.closeButtonTopHit || !dynamicCardDetailProbe.summaryRowTopHit) {
        issues.push({
          type: 'dynamic-card-detail-unreachable-content',
          selector: '#card-detail-modal',
          detail: dynamicCardDetailProbe,
        });
      }
    }
    if (scenarioId === 'shop-service-detail-modal') {
      const container = root.querySelector('.card-detail-container');
      const main = root.querySelector('.service-detail-main');
      const side = root.querySelector('.service-detail-side');
      const closeButton = root.querySelector('[data-card-detail-close="true"]');
      const summaryRows = Array.from(root.querySelectorAll('.cd-summary-row')).filter(isVisible);
      const statusChips = Array.from(root.querySelectorAll('.detail-status-chip')).filter(isVisible);
      const tipPanel = root.querySelector('.detail-tip-panel');
      const modalText = textLabel(root);
      const closeButtonHit = readHitStateAfterScroll(closeButton);
      const summaryRowHit = readHitStateAfterScroll(summaryRows[0]);
      shopServiceDetailProbe = {
        containerVisible: !!(container && isVisible(container)),
        mainVisible: !!(main && isVisible(main)),
        sideVisible: !!(side && isVisible(side)),
        closeButtonVisible: !!(closeButton && isVisible(closeButton)),
        closeButtonInitiallyTopHit: closeButtonHit.initial.topHit,
        closeButtonTopHit: closeButtonHit.final.topHit,
        closeButtonRect: closeButtonHit.final.rect,
        summaryRowCount: summaryRows.length,
        summaryRowInitiallyTopHit: summaryRowHit.initial.topHit,
        summaryRowTopHit: summaryRowHit.final.topHit,
        summaryRowRect: summaryRowHit.final.rect,
        statusChipCount: statusChips.length,
        tipPanelVisible: !!(tipPanel && isVisible(tipPanel)),
        hasEconomyText: /买后剩余/.test(root.textContent || '') && /储备线/.test(root.textContent || '') && /建议单次/.test(root.textContent || ''),
        title: textLabel(root.querySelector('.cd-header h2') || root.querySelector('h2')),
        modalText,
      };
      if (!shopServiceDetailProbe.containerVisible || !shopServiceDetailProbe.mainVisible || !shopServiceDetailProbe.sideVisible || !shopServiceDetailProbe.closeButtonVisible || shopServiceDetailProbe.summaryRowCount < 4 || !shopServiceDetailProbe.hasEconomyText) {
        issues.push({
          type: 'shop-service-detail-modal-missing-content',
          selector: '#card-detail-modal',
          detail: shopServiceDetailProbe,
        });
      }
      if (!shopServiceDetailProbe.closeButtonTopHit || !shopServiceDetailProbe.summaryRowTopHit) {
        issues.push({
          type: 'shop-service-detail-modal-unreachable-content',
          selector: '#card-detail-modal',
          detail: shopServiceDetailProbe,
        });
      }
    }
    if (scenarioId === 'skill-confirm-modal') {
      const content = root.querySelector('.modal-content');
      const title = root.querySelector('#skill-confirm-title');
      const icon = root.querySelector('#skill-confirm-icon');
      const desc = root.querySelector('#skill-confirm-desc');
      const closeButton = root.querySelector('.modal-close');
      const actionButtons = Array.from(root.querySelectorAll('button')).filter(isVisible);
      const releaseButton = actionButtons.find((button) => /释放技能/.test(textLabel(button))) || null;
      const cancelButton = actionButtons.find((button) => /取消/.test(textLabel(button))) || null;
      const closeHit = readHitStateAfterScroll(closeButton);
      const releaseHit = readHitStateAfterScroll(releaseButton);
      const cancelHit = readHitStateAfterScroll(cancelButton);
      const contentRect = content ? content.getBoundingClientRect() : null;
      const clippedWarnings = warnings.filter((warning) => [
        'text-may-be-clipped',
        'non-scrollable-content-clipped',
      ].includes(warning.type));
      skillConfirmModalProbe = {
        title: title ? textLabel(title) : '',
        icon: icon ? textLabel(icon) : '',
        descriptionLength: desc ? textLabel(desc).length : 0,
        contentVisible: !!(content && isVisible(content)),
        contentRectFitsViewport: rectFitsViewport(contentRect ? rectObj(contentRect) : null),
        releaseVisible: !!(releaseButton && isVisible(releaseButton)),
        cancelVisible: !!(cancelButton && isVisible(cancelButton)),
        closeVisible: !!(closeButton && isVisible(closeButton)),
        releaseTopHit: releaseHit.final.topHit,
        cancelTopHit: cancelHit.final.topHit,
        closeTopHit: closeHit.final.topHit,
        topAtRelease: releaseHit.final.topSelector,
        topAtCancel: cancelHit.final.topSelector,
        topAtClose: closeHit.final.topSelector,
        releaseRect: releaseHit.final.rect,
        cancelRect: cancelHit.final.rect,
        closeRect: closeHit.final.rect,
        clippedWarningCount: clippedWarnings.length,
      };
      if (
        skillConfirmModalProbe.title.length < 2
        || skillConfirmModalProbe.descriptionLength < 16
        || !skillConfirmModalProbe.contentVisible
        || !skillConfirmModalProbe.contentRectFitsViewport
        || !skillConfirmModalProbe.releaseVisible
        || !skillConfirmModalProbe.cancelVisible
        || !skillConfirmModalProbe.closeVisible
        || !skillConfirmModalProbe.releaseTopHit
        || !skillConfirmModalProbe.cancelTopHit
        || !skillConfirmModalProbe.closeTopHit
        || skillConfirmModalProbe.clippedWarningCount > 0
      ) {
        issues.push({
          type: 'skill-confirm-modal-actions-invalid',
          selector: '#skill-confirm-modal',
          detail: skillConfirmModalProbe,
        });
      }
    }
    if (scenarioId === 'treasure-detail-modal') {
      const content = root.querySelector('.treasure-detail-view');
      const layout = root.querySelector('.treasure-detail-layout');
      const title = root.querySelector('#detail-name');
      const desc = root.querySelector('#detail-desc');
      const lore = root.querySelector('#detail-lore');
      const closeButton = root.querySelector('.modal-close');
      const footerCloseButton = root.querySelector('.cd-close-btn');
      const statusChips = Array.from(root.querySelectorAll('.detail-status-chip')).filter(isVisible);
      const closeHit = readHitStateAfterScroll(closeButton);
      const footerCloseHit = readHitStateAfterScroll(footerCloseButton);
      const titleHit = readHitStateAfterScroll(title);
      const contentRect = content ? content.getBoundingClientRect() : null;
      const clippedWarnings = warnings.filter((warning) => [
        'text-may-be-clipped',
        'non-scrollable-content-clipped',
      ].includes(warning.type));
      treasureDetailModalProbe = {
        title: title ? textLabel(title) : '',
        descriptionLength: desc ? textLabel(desc).length : 0,
        loreLength: lore ? textLabel(lore).length : 0,
        contentVisible: !!(content && isVisible(content)),
        layoutVisible: !!(layout && isVisible(layout)),
        contentRectFitsViewport: rectFitsViewport(contentRect ? rectObj(contentRect) : null),
        statusChipCount: statusChips.length,
        closeVisible: !!(closeButton && isVisible(closeButton)),
        footerCloseVisible: !!(footerCloseButton && isVisible(footerCloseButton)),
        titleTopHit: titleHit.final.topHit,
        closeTopHit: closeHit.final.topHit,
        footerCloseTopHit: footerCloseHit.final.topHit,
        topAtTitle: titleHit.final.topSelector,
        topAtClose: closeHit.final.topSelector,
        topAtFooterClose: footerCloseHit.final.topSelector,
        contentRect: contentRect ? rectObj(contentRect) : null,
        closeRect: closeHit.final.rect,
        footerCloseRect: footerCloseHit.final.rect,
        clippedWarningCount: clippedWarnings.length,
      };
      if (
        treasureDetailModalProbe.title.length < 2
        || treasureDetailModalProbe.descriptionLength < 16
        || treasureDetailModalProbe.loreLength < 8
        || !treasureDetailModalProbe.contentVisible
        || !treasureDetailModalProbe.layoutVisible
        || !treasureDetailModalProbe.contentRectFitsViewport
        || treasureDetailModalProbe.statusChipCount < 2
        || !treasureDetailModalProbe.closeVisible
        || !treasureDetailModalProbe.footerCloseVisible
        || !treasureDetailModalProbe.titleTopHit
        || !treasureDetailModalProbe.closeTopHit
        || !treasureDetailModalProbe.footerCloseTopHit
        || treasureDetailModalProbe.clippedWarningCount > 0
      ) {
        issues.push({
          type: 'treasure-detail-modal-actions-invalid',
          selector: '#treasure-detail-modal',
          detail: treasureDetailModalProbe,
        });
      }
    }
    if (scenarioId === 'law-detail-modal') {
      const content = root.querySelector('.law-detail-view');
      const layout = root.querySelector('.law-detail-layout');
      const title = root.querySelector('#law-detail-name');
      const desc = root.querySelector('#law-detail-desc');
      const passive = root.querySelector('#law-detail-passive');
      const readiness = root.querySelector('#law-detail-readiness');
      const closeButton = root.querySelector('.modal-close');
      const footerCloseButton = root.querySelector('.cd-close-btn');
      const statusChips = Array.from(root.querySelectorAll('#law-detail-chips .detail-status-chip, #law-detail-chips > *')).filter(isVisible);
      const closeHit = readHitStateAfterScroll(closeButton);
      const footerCloseHit = readHitStateAfterScroll(footerCloseButton);
      const titleHit = readHitStateAfterScroll(title);
      const contentRect = content ? content.getBoundingClientRect() : null;
      const clippedWarnings = warnings.filter((warning) => [
        'text-may-be-clipped',
        'non-scrollable-content-clipped',
      ].includes(warning.type));
      lawDetailModalProbe = {
        title: title ? textLabel(title) : '',
        descriptionLength: desc ? textLabel(desc).length : 0,
        passiveLength: passive ? textLabel(passive).length : 0,
        readinessLength: readiness ? textLabel(readiness).length : 0,
        contentVisible: !!(content && isVisible(content)),
        layoutVisible: !!(layout && isVisible(layout)),
        contentRectFitsViewport: rectFitsViewport(contentRect ? rectObj(contentRect) : null),
        statusChipCount: statusChips.length,
        closeVisible: !!(closeButton && isVisible(closeButton)),
        footerCloseVisible: !!(footerCloseButton && isVisible(footerCloseButton)),
        titleTopHit: titleHit.final.topHit,
        closeTopHit: closeHit.final.topHit,
        footerCloseTopHit: footerCloseHit.final.topHit,
        topAtTitle: titleHit.final.topSelector,
        topAtClose: closeHit.final.topSelector,
        topAtFooterClose: footerCloseHit.final.topSelector,
        contentRect: contentRect ? rectObj(contentRect) : null,
        closeRect: closeHit.final.rect,
        footerCloseRect: footerCloseHit.final.rect,
        clippedWarningCount: clippedWarnings.length,
      };
      if (
        lawDetailModalProbe.title.length < 2
        || lawDetailModalProbe.descriptionLength < 16
        || lawDetailModalProbe.passiveLength < 8
        || lawDetailModalProbe.readinessLength < 8
        || !lawDetailModalProbe.contentVisible
        || !lawDetailModalProbe.layoutVisible
        || !lawDetailModalProbe.contentRectFitsViewport
        || lawDetailModalProbe.statusChipCount < 1
        || !lawDetailModalProbe.closeVisible
        || !lawDetailModalProbe.footerCloseVisible
        || !lawDetailModalProbe.titleTopHit
        || !lawDetailModalProbe.closeTopHit
        || !lawDetailModalProbe.footerCloseTopHit
        || lawDetailModalProbe.clippedWarningCount > 0
      ) {
        issues.push({
          type: 'law-detail-modal-actions-invalid',
          selector: '#law-detail-modal',
          detail: lawDetailModalProbe,
        });
      }
    }
    if (scenarioId === 'reward-modal') {
      const content = root.querySelector('.modal-content');
      const title = root.querySelector('#reward-title');
      const icon = root.querySelector('#reward-icon');
      const message = root.querySelector('#reward-message');
      const confirmButton = root.querySelector('#reward-confirm-btn');
      const confirmHit = readHitStateAfterScroll(confirmButton);
      const contentRect = content ? content.getBoundingClientRect() : null;
      const clippedWarnings = warnings.filter((warning) => [
        'text-may-be-clipped',
        'non-scrollable-content-clipped',
      ].includes(warning.type));
      const zIndex = Number.parseInt(getComputedStyle(root).zIndex || '0', 10) || 0;
      rewardModalProbe = {
        title: title ? textLabel(title) : '',
        icon: icon ? textLabel(icon) : '',
        messageLength: message ? textLabel(message).length : 0,
        contentVisible: !!(content && isVisible(content)),
        contentRectFitsViewport: rectFitsViewport(contentRect ? rectObj(contentRect) : null),
        confirmVisible: !!(confirmButton && isVisible(confirmButton)),
        confirmTopHit: confirmHit.final.topHit,
        topAtConfirm: confirmHit.final.topSelector,
        confirmRect: confirmHit.final.rect,
        contentRect: contentRect ? rectObj(contentRect) : null,
        clippedWarningCount: clippedWarnings.length,
        zIndex,
      };
      if (
        rewardModalProbe.title.length < 4
        || rewardModalProbe.messageLength < 30
        || !rewardModalProbe.contentVisible
        || !rewardModalProbe.contentRectFitsViewport
        || !rewardModalProbe.confirmVisible
        || !rewardModalProbe.confirmTopHit
        || rewardModalProbe.clippedWarningCount > 0
        || rewardModalProbe.zIndex < 10000
      ) {
        issues.push({
          type: 'reward-modal-actions-invalid',
          selector: '#reward-modal',
          detail: rewardModalProbe,
        });
      }
    }
    if (scenarioId === 'auth-modal') {
      const content = root.querySelector('.modal-content');
      const title = root.querySelector('#auth-title');
      const username = root.querySelector('#auth-username');
      const password = root.querySelector('#auth-password');
      const loginButton = root.querySelector('#login-btn-modal');
      const registerButton = root.querySelector('#register-btn-modal');
      const closeButton = root.querySelector('.modal-close');
      const usernameHit = readHitStateAfterScroll(username);
      const passwordHit = readHitStateAfterScroll(password);
      const loginHit = readHitStateAfterScroll(loginButton);
      const registerHit = readHitStateAfterScroll(registerButton);
      const closeHit = readHitStateAfterScroll(closeButton);
      authModalProbe = {
        title: title ? textLabel(title) : '',
        contentVisible: !!(content && isVisible(content)),
        usernameVisible: !!(username && isVisible(username)),
        passwordVisible: !!(password && isVisible(password)),
        loginVisible: !!(loginButton && isVisible(loginButton)),
        registerVisible: !!(registerButton && isVisible(registerButton)),
        closeVisible: !!(closeButton && isVisible(closeButton)),
        usernameTopHit: usernameHit.final.topHit,
        passwordTopHit: passwordHit.final.topHit,
        loginTopHit: loginHit.final.topHit,
        registerTopHit: registerHit.final.topHit,
        closeTopHit: closeHit.final.topHit,
        topAtUsername: usernameHit.final.topSelector,
        topAtPassword: passwordHit.final.topSelector,
        topAtLogin: loginHit.final.topSelector,
        topAtRegister: registerHit.final.topSelector,
        topAtClose: closeHit.final.topSelector,
        loginRect: loginHit.final.rect,
        registerRect: registerHit.final.rect,
      };
      if (
        authModalProbe.title !== '登入轮回'
        || !authModalProbe.contentVisible
        || !authModalProbe.usernameVisible
        || !authModalProbe.passwordVisible
        || !authModalProbe.loginVisible
        || !authModalProbe.registerVisible
        || !authModalProbe.closeVisible
        || !authModalProbe.usernameTopHit
        || !authModalProbe.passwordTopHit
        || !authModalProbe.loginTopHit
        || !authModalProbe.registerTopHit
        || !authModalProbe.closeTopHit
      ) {
        issues.push({
          type: 'auth-modal-actions-invalid',
          selector: '#auth-modal',
          detail: authModalProbe,
        });
      }
    }
    if (scenarioId === 'confirm-modal') {
      const content = root.querySelector('.modal-content');
      const title = root.querySelector('#generic-confirm-title');
      const message = root.querySelector('#generic-confirm-message');
      const confirmButton = root.querySelector('#generic-confirm-btn');
      const cancelButton = root.querySelector('#generic-cancel-btn');
      const closeButton = root.querySelector('.modal-close');
      const confirmHit = readHitStateAfterScroll(confirmButton);
      const cancelHit = readHitStateAfterScroll(cancelButton);
      const closeHit = readHitStateAfterScroll(closeButton);
      const zIndex = Number.parseInt(getComputedStyle(root).zIndex || '0', 10) || 0;
      confirmModalProbe = {
        title: title ? textLabel(title) : '',
        message: message ? textLabel(message) : '',
        contentVisible: !!(content && isVisible(content)),
        confirmVisible: !!(confirmButton && isVisible(confirmButton)),
        cancelVisible: !!(cancelButton && isVisible(cancelButton)),
        closeVisible: !!(closeButton && isVisible(closeButton)),
        confirmTopHit: confirmHit.final.topHit,
        cancelTopHit: cancelHit.final.topHit,
        closeTopHit: closeHit.final.topHit,
        topAtConfirm: confirmHit.final.topSelector,
        topAtCancel: cancelHit.final.topSelector,
        topAtClose: closeHit.final.topSelector,
        confirmRect: confirmHit.final.rect,
        cancelRect: cancelHit.final.rect,
        zIndex,
      };
      if (
        confirmModalProbe.title !== '提示'
        || confirmModalProbe.message.length < 20
        || !confirmModalProbe.contentVisible
        || !confirmModalProbe.confirmVisible
        || !confirmModalProbe.cancelVisible
        || !confirmModalProbe.closeVisible
        || !confirmModalProbe.confirmTopHit
        || !confirmModalProbe.cancelTopHit
        || !confirmModalProbe.closeTopHit
        || confirmModalProbe.zIndex < 10000
      ) {
        issues.push({
          type: 'confirm-modal-actions-invalid',
          selector: '#generic-confirm-modal',
          detail: confirmModalProbe,
        });
      }
    }
    if (scenarioId === 'reward-screen') {
      const panel = root.querySelector('#reward-expedition-meta');
      const sideColumn = root.querySelector('.reward-side-column');
      const laneRewardButton = panel?.querySelector('[data-season-board-lane-reward-claim="true"]') || null;
      const handoffButton = panel?.querySelector('[data-season-board-action-reward="true"] [data-season-board-handoff-cta="true"]') || null;
      const laneRewardHit = readHitStateAfterScroll(laneRewardButton);
      const handoffHit = readHitStateAfterScroll(handoffButton);
      const panelRect = panel ? panel.getBoundingClientRect() : null;
      const sideRect = sideColumn ? sideColumn.getBoundingClientRect() : null;
      rewardExpeditionCtaProbe = {
        panelVisible: !!(panel && isVisible(panel)),
        sideColumnVisible: !!(sideColumn && isVisible(sideColumn)),
        laneRewardVisible: !!(laneRewardButton && isVisible(laneRewardButton)),
        handoffVisible: !!(handoffButton && isVisible(handoffButton)),
        laneRewardText: laneRewardButton ? textLabel(laneRewardButton) : '',
        handoffText: handoffButton ? textLabel(handoffButton) : '',
        laneRewardClaimable: laneRewardButton?.dataset?.seasonBoardLaneRewardClaimable || '',
        handoffAction: handoffButton?.dataset?.seasonBoardHandoffAction || '',
        handoffValue: handoffButton?.dataset?.seasonBoardHandoffValue || '',
        laneRewardInitiallyTopHit: laneRewardHit.initial.topHit,
        laneRewardTopHit: laneRewardHit.final.topHit,
        handoffInitiallyTopHit: handoffHit.initial.topHit,
        handoffTopHit: handoffHit.final.topHit,
        laneRewardHitTargetOk: !!laneRewardHit.final.rect
          && laneRewardHit.final.rect.height >= 44
          && laneRewardHit.final.rect.width >= 96,
        handoffHitTargetOk: !!handoffHit.final.rect
          && handoffHit.final.rect.height >= 44
          && handoffHit.final.rect.width >= 96,
        laneRewardRectFitsViewport: rectFitsViewport(laneRewardHit.final.rect),
        handoffRectFitsViewport: rectFitsViewport(handoffHit.final.rect),
        topAtLaneReward: laneRewardHit.final.topSelector,
        topAtHandoff: handoffHit.final.topSelector,
        laneRewardRect: laneRewardHit.final.rect,
        handoffRect: handoffHit.final.rect,
        panelRect: panelRect ? rectObj(panelRect) : null,
        sideRect: sideRect ? rectObj(sideRect) : null,
        panelScrollWidth: panel?.scrollWidth || 0,
        panelClientWidth: panel?.clientWidth || 0,
      };
      if (
        !rewardExpeditionCtaProbe.panelVisible
        || !rewardExpeditionCtaProbe.sideColumnVisible
        || !rewardExpeditionCtaProbe.laneRewardVisible
        || !rewardExpeditionCtaProbe.handoffVisible
        || rewardExpeditionCtaProbe.laneRewardClaimable !== 'true'
        || !/领取|已领取|未结题/.test(rewardExpeditionCtaProbe.laneRewardText)
        || rewardExpeditionCtaProbe.handoffAction.length < 3
        || rewardExpeditionCtaProbe.handoffValue.length < 3
        || !rewardExpeditionCtaProbe.laneRewardTopHit
        || !rewardExpeditionCtaProbe.handoffTopHit
        || !rewardExpeditionCtaProbe.laneRewardHitTargetOk
        || !rewardExpeditionCtaProbe.handoffHitTargetOk
        || !rewardExpeditionCtaProbe.laneRewardRectFitsViewport
        || !rewardExpeditionCtaProbe.handoffRectFitsViewport
        || rewardExpeditionCtaProbe.panelScrollWidth > rewardExpeditionCtaProbe.panelClientWidth + 2
      ) {
        issues.push({
          type: 'reward-expedition-cta-invalid',
          selector: '#reward-expedition-meta',
          detail: rewardExpeditionCtaProbe,
        });
      }
    }
    if (scenarioId === 'pvp-screen' && viewport.width <= 520) {
      const header = document.querySelector('#pvp-screen .screen-header');
      const nav = document.querySelector('#pvp-screen .pvp-nav-sidebar');
      const statusCard = root.querySelector('.pvp-live-status-card');
      const joinQueueButton = root.querySelector('[data-live-action="join-queue"]');
      const headerRect = header ? header.getBoundingClientRect() : null;
      const navRect = nav ? nav.getBoundingClientRect() : null;
      const statusRect = statusCard ? statusCard.getBoundingClientRect() : null;
      const joinQueueHit = readHitState(joinQueueButton);
      const topChromeTop = Math.min(
        headerRect?.top ?? Number.POSITIVE_INFINITY,
        navRect?.top ?? Number.POSITIVE_INFINITY,
      );
      const topChromeBottom = Math.max(
        headerRect?.bottom ?? Number.NEGATIVE_INFINITY,
        navRect?.bottom ?? Number.NEGATIVE_INFINITY,
      );
      const topChromeFootprint = Number.isFinite(topChromeTop) && Number.isFinite(topChromeBottom)
        ? Math.round((topChromeBottom - topChromeTop) * 10) / 10
        : null;
      pvpLiveMobileProbe = {
        headerRect: headerRect ? rectObj(headerRect) : null,
        navRect: navRect ? rectObj(navRect) : null,
        statusRect: statusRect ? rectObj(statusRect) : null,
        joinQueueRect: joinQueueHit.rect,
        joinQueueVisible: !!(joinQueueButton && isVisible(joinQueueButton)),
        joinQueueInViewport: rectFitsViewport(joinQueueHit.rect, 2),
        joinQueueTopHit: joinQueueHit.topHit,
        joinQueueTopAt: joinQueueHit.topSelector,
        joinQueueBeforeStatus: !!(joinQueueHit.rect && statusRect && joinQueueHit.rect.bottom <= statusRect.top + 2),
        topChromeFootprint,
        topChromeMax: Math.round(viewport.height * 0.34 * 10) / 10,
      };
      if (
        !pvpLiveMobileProbe.headerRect
        || !pvpLiveMobileProbe.navRect
        || !pvpLiveMobileProbe.statusRect
        || !pvpLiveMobileProbe.joinQueueVisible
        || !pvpLiveMobileProbe.joinQueueInViewport
        || !pvpLiveMobileProbe.joinQueueTopHit
        || !pvpLiveMobileProbe.joinQueueBeforeStatus
        || !Number.isFinite(pvpLiveMobileProbe.topChromeFootprint)
        || pvpLiveMobileProbe.topChromeFootprint > pvpLiveMobileProbe.topChromeMax
      ) {
        issues.push({
          type: 'pvp-live-mobile-entry-visibility-invalid',
          selector: '[data-live-pvp-root]',
          detail: pvpLiveMobileProbe,
        });
      }
    }
    if (scenarioId === 'collection-laws' && viewport.width <= 520) {
      const tabBar = root.querySelector('.collection-tab-bar');
      const toggle = root.querySelector('.codex-filter-toggle[aria-expanded]');
      const disclosure = root.querySelector('.codex-filter-disclosure');
      const options = root.querySelector('#law-codex-filter-options.codex-filter-options');
      const toolbar = root.querySelector('.codex-toolbar');
      const firstSection = root.querySelector('[data-collection-panel="laws"].active .codex-section, .collection-tab-panel.active .codex-section');
      const tabButtons = Array.from(root.querySelectorAll('.collection-tab-bar .collection-tab-btn')).filter(isVisible);
      const toggleHit = readHitState(toggle);
      const tabButtonRects = tabButtons.map((button) => button.getBoundingClientRect());
      const tabButtonTops = tabButtonRects.map((rect) => Math.round(rect.top * 10) / 10);
      const tabBarStyle = tabBar ? getComputedStyle(tabBar) : null;
      const initialOptionsVisible = !!(options && isVisible(options));
      const initialExpanded = toggle?.getAttribute('aria-expanded') || '';
      const firstSectionRect = firstSection ? firstSection.getBoundingClientRect() : null;
      const initial = {
        tabBarRect: tabBar ? rectObj(tabBar.getBoundingClientRect()) : null,
        tabBarScrollWidth: tabBar?.scrollWidth || 0,
        tabBarClientWidth: tabBar?.clientWidth || 0,
        tabBarScrollHeight: tabBar?.scrollHeight || 0,
        tabBarClientHeight: tabBar?.clientHeight || 0,
        tabBarOverflowX: tabBarStyle?.overflowX || '',
        tabBarFlexWrap: tabBarStyle?.flexWrap || '',
        tabButtonCount: tabButtons.length,
        tabButtonTops,
        disclosureVisible: !!(disclosure && isVisible(disclosure)),
        toggleVisible: !!(toggle && isVisible(toggle)),
        toggleTopHit: toggleHit.topHit,
        toggleTopAt: toggleHit.topSelector,
        toggleAriaExpanded: initialExpanded,
        optionsPresent: !!options,
        optionsVisible: initialOptionsVisible,
        optionsOpenClass: !!options?.classList.contains('is-open'),
        firstSectionRect: firstSectionRect ? rectObj(firstSectionRect) : null,
        firstSectionTopOk: !!(firstSectionRect && firstSectionRect.top >= -2 && firstSectionRect.top <= viewport.height * 0.82),
      };

      let expanded = null;
      if (toggle) toggle.click();

      const interactiveControls = Array.from(options?.querySelectorAll('input, select, button, [role="button"]') || [])
        .filter(isVisible);
      const controlProbes = interactiveControls.map((control) => {
        const hit = readHitState(control);
        return {
          selector: selectorFor(control),
          rect: hit.rect,
          topHit: hit.topHit,
          topAt: hit.topSelector,
          scrollWidth: control.scrollWidth,
          clientWidth: control.clientWidth,
        };
      });
      expanded = {
        toggleAriaExpanded: toggle?.getAttribute('aria-expanded') || '',
        optionsVisible: !!(options && isVisible(options)),
        optionsOpenClass: !!options?.classList.contains('is-open'),
        optionsRect: options ? rectObj(options.getBoundingClientRect()) : null,
        optionsScrollWidth: options?.scrollWidth || 0,
        optionsClientWidth: options?.clientWidth || 0,
        toolbarRect: toolbar ? rectObj(toolbar.getBoundingClientRect()) : null,
        toolbarScrollWidth: toolbar?.scrollWidth || 0,
        toolbarClientWidth: toolbar?.clientWidth || 0,
        controls: controlProbes,
      };

      collectionLawsMobileProbe = {
        initial,
        expanded,
      };
      const tabBarSingleLine = tabButtonTops.length > 0 && Math.max(...tabButtonTops) - Math.min(...tabButtonTops) <= 8;
      const tabBarHorizontalScroll = !!tabBar
        && /(auto|scroll|overlay)/.test(initial.tabBarOverflowX)
        && initial.tabBarFlexWrap === 'nowrap'
        && initial.tabBarScrollWidth > initial.tabBarClientWidth + 8;
      const expandedControlsOk = expanded.controls.length >= 4
        && expanded.controls.every((control) => control.topHit && control.scrollWidth <= control.clientWidth + 2);
      if (
        !initial.tabBarRect
        || !tabBarSingleLine
        || !tabBarHorizontalScroll
        || !initial.disclosureVisible
        || !initial.toggleVisible
        || !initial.toggleTopHit
        || initial.toggleAriaExpanded !== 'false'
        || !initial.optionsPresent
        || initial.optionsVisible
        || initial.optionsOpenClass
        || !initial.firstSectionTopOk
        || expanded.toggleAriaExpanded !== 'true'
        || !expanded.optionsVisible
        || !expanded.optionsOpenClass
        || expanded.optionsScrollWidth > expanded.optionsClientWidth + 2
        || expanded.toolbarScrollWidth > expanded.toolbarClientWidth + 2
        || !expandedControlsOk
      ) {
        issues.push({
          type: 'collection-laws-mobile-filter-disclosure-invalid',
          selector: '#collection',
          detail: collectionLawsMobileProbe,
        });
      }
    }
    if (scenarioId === 'save-slots-modal') {
      const content = root.querySelector('.modal-content');
      const slots = Array.from(root.querySelectorAll('.save-slot')).filter(isVisible);
      const filledSlots = slots.filter((slot) => !slot.classList.contains('empty'));
      const emptySlots = slots.filter((slot) => slot.classList.contains('empty'));
      const lastFilledSlot = filledSlots[filledSlots.length - 1] || null;
      const loadButton = lastFilledSlot?.querySelector('[data-system-action="select-slot"][data-slot-mode="load"]') || null;
      const overwriteButton = lastFilledSlot?.querySelector('[data-system-action="select-slot"][data-slot-mode="overwrite"]') || null;
      const cancelButton = root.querySelector('.modal-footer button');
      const loadHit = readHitStateAfterScroll(loadButton);
      const overwriteHit = readHitStateAfterScroll(overwriteButton);
      const cancelHit = readHitStateAfterScroll(cancelButton);
      saveSlotsModalProbe = {
        contentVisible: !!(content && isVisible(content)),
        slotCount: slots.length,
        filledSlotCount: filledSlots.length,
        emptySlotCount: emptySlots.length,
        lastFilledSlotText: lastFilledSlot ? textLabel(lastFilledSlot) : '',
        loadVisible: !!(loadButton && isVisible(loadButton)),
        overwriteVisible: !!(overwriteButton && isVisible(overwriteButton)),
        cancelVisible: !!(cancelButton && isVisible(cancelButton)),
        loadText: loadButton ? textLabel(loadButton) : '',
        overwriteText: overwriteButton ? textLabel(overwriteButton) : '',
        loadInitiallyTopHit: loadHit.initial.topHit,
        loadTopHit: loadHit.final.topHit,
        overwriteInitiallyTopHit: overwriteHit.initial.topHit,
        overwriteTopHit: overwriteHit.final.topHit,
        cancelTopHit: cancelHit.final.topHit,
        topAtLoad: loadHit.final.topSelector,
        topAtOverwrite: overwriteHit.final.topSelector,
        loadRect: loadHit.final.rect,
        overwriteRect: overwriteHit.final.rect,
        cancelRect: cancelHit.final.rect,
      };
      if (
        !saveSlotsModalProbe.contentVisible
        || saveSlotsModalProbe.slotCount !== 4
        || saveSlotsModalProbe.filledSlotCount !== 2
        || saveSlotsModalProbe.emptySlotCount !== 2
        || !saveSlotsModalProbe.loadVisible
        || !saveSlotsModalProbe.overwriteVisible
        || !saveSlotsModalProbe.cancelVisible
        || !/继续/.test(saveSlotsModalProbe.loadText)
        || !/覆盖/.test(saveSlotsModalProbe.overwriteText)
        || !saveSlotsModalProbe.loadTopHit
        || !saveSlotsModalProbe.overwriteTopHit
        || !saveSlotsModalProbe.cancelTopHit
      ) {
        issues.push({
          type: 'save-slots-modal-actions-invalid',
          selector: '#save-slots-modal',
          detail: saveSlotsModalProbe,
        });
      }
    }
    if (scenarioId === 'save-conflict-modal') {
      const content = root.querySelector('.modal-content');
      const title = root.querySelector('h2');
      const localInfo = root.querySelector('#local-save-info');
      const cloudInfo = root.querySelector('#cloud-save-info');
      const statusInfo = root.querySelector('#save-conflict-status');
      const buttons = Array.from(root.querySelectorAll('button')).filter(isVisible);
      const localButton = buttons.find((button) => /保留本地/.test(textLabel(button))) || null;
      const cloudButton = buttons.find((button) => /保留云端/.test(textLabel(button))) || null;
      const localHit = readHitStateAfterScroll(localButton);
      const cloudHit = readHitStateAfterScroll(cloudButton);
      saveConflictModalProbe = {
        title: title ? textLabel(title) : '',
        contentVisible: !!(content && isVisible(content)),
        localInfoVisible: !!(localInfo && isVisible(localInfo)),
        cloudInfoVisible: !!(cloudInfo && isVisible(cloudInfo)),
        localInfoText: localInfo ? textLabel(localInfo) : '',
        cloudInfoText: cloudInfo ? textLabel(cloudInfo) : '',
        statusText: statusInfo ? textLabel(statusInfo) : '',
        tempCloudMarker: window.game?.tempCloudData?.layoutMarker || '',
        localButtonVisible: !!(localButton && isVisible(localButton)),
        cloudButtonVisible: !!(cloudButton && isVisible(cloudButton)),
        localButtonText: localButton ? textLabel(localButton) : '',
        cloudButtonText: cloudButton ? textLabel(cloudButton) : '',
        localButtonInitiallyTopHit: localHit.initial.topHit,
        localButtonTopHit: localHit.final.topHit,
        cloudButtonInitiallyTopHit: cloudHit.initial.topHit,
        cloudButtonTopHit: cloudHit.final.topHit,
        topAtLocalButton: localHit.final.topSelector,
        topAtCloudButton: cloudHit.final.topSelector,
        localButtonRect: localHit.final.rect,
        cloudButtonRect: cloudHit.final.rect,
      };
      if (
        saveConflictModalProbe.title !== '检测到存档冲突'
        || !saveConflictModalProbe.contentVisible
        || !saveConflictModalProbe.localInfoVisible
        || !saveConflictModalProbe.cloudInfoVisible
        || saveConflictModalProbe.localInfoText.length < 16
        || saveConflictModalProbe.cloudInfoText.length < 16
        || !/第 7 重天/.test(saveConflictModalProbe.localInfoText)
        || !/8700/.test(saveConflictModalProbe.localInfoText)
        || !/第 5 重天/.test(saveConflictModalProbe.cloudInfoText)
        || !/5100/.test(saveConflictModalProbe.cloudInfoText)
        || saveConflictModalProbe.statusText !== ''
        || saveConflictModalProbe.tempCloudMarker !== 'layout-cloud-save-conflict'
        || !saveConflictModalProbe.localButtonVisible
        || !saveConflictModalProbe.cloudButtonVisible
        || !/保留本地/.test(saveConflictModalProbe.localButtonText)
        || !/保留云端/.test(saveConflictModalProbe.cloudButtonText)
        || !saveConflictModalProbe.localButtonTopHit
        || !saveConflictModalProbe.cloudButtonTopHit
      ) {
        issues.push({
          type: 'save-conflict-modal-actions-invalid',
          selector: '#save-conflict-modal',
          detail: saveConflictModalProbe,
        });
      }
    }
    const battleCommandModalConfigs = {
      'horizon-barter-modal': {
        title: '界隙交易',
        choices: '#horizon-barter-choices',
        cancel: '#horizon-barter-cancel',
        expectedChoices: 3,
        minZ: 10040,
      },
      'resonance-matrix-modal': {
        title: '命环共振',
        choices: '#resonance-matrix-choices',
        cancel: '#resonance-matrix-cancel',
        expectedChoices: 5,
        minZ: 10042,
      },
    };
    const battleCommandConfig = battleCommandModalConfigs[scenarioId] || null;
    if (battleCommandConfig) {
      const title = root.querySelector('h2');
      const content = root.querySelector('.modal-content');
      const choicesContainer = root.querySelector(battleCommandConfig.choices);
      const choiceButtons = Array.from(choicesContainer?.querySelectorAll('.event-choice') || []).filter(isVisible);
      const effectLines = Array.from(root.querySelectorAll('.choice-effect')).filter(isVisible);
      const cancelButton = root.querySelector(battleCommandConfig.cancel);
      const readHitState = (element) => {
        const rect = element ? element.getBoundingClientRect() : null;
        const point = rect ? {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        } : null;
        const inViewport = !!(point && point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height);
        const top = inViewport ? document.elementFromPoint(point.x, point.y) : null;
        return {
          rect: rect ? rectObj(rect) : null,
          point,
          inViewport,
          top,
          topSelector: selectorFor(top),
          topHit: !!(element && top && (top === element || element.contains(top))),
        };
      };
      const initialCancelHit = readHitState(cancelButton);
      let finalCancelHit = initialCancelHit;
      if (cancelButton && !initialCancelHit.topHit && typeof cancelButton.scrollIntoView === 'function') {
        cancelButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        finalCancelHit = readHitState(cancelButton);
      }
      const zIndex = Number.parseInt(getComputedStyle(root).zIndex || '0', 10) || 0;
      battleCommandModalProbe = {
        title: title ? textLabel(title) : '',
        contentVisible: !!(content && isVisible(content)),
        choiceCount: choiceButtons.length,
        effectLineCount: effectLines.length,
        cancelVisible: !!(cancelButton && isVisible(cancelButton)),
        cancelInitiallyTopHit: initialCancelHit.topHit,
        cancelTopHit: finalCancelHit.topHit,
        zIndex,
        topAtCancel: finalCancelHit.topSelector,
        initialTopAtCancel: initialCancelHit.topSelector,
        cancelRect: finalCancelHit.rect,
        choiceLabels: choiceButtons.map(textLabel),
      };
      if (
        battleCommandModalProbe.title !== battleCommandConfig.title
        || !battleCommandModalProbe.contentVisible
        || battleCommandModalProbe.choiceCount !== battleCommandConfig.expectedChoices
        || battleCommandModalProbe.effectLineCount < battleCommandConfig.expectedChoices + 1
        || !battleCommandModalProbe.cancelVisible
        || !battleCommandModalProbe.cancelTopHit
        || battleCommandModalProbe.zIndex < battleCommandConfig.minZ
      ) {
        issues.push({
          type: 'battle-command-modal-invalid',
          selector: `#${scenarioId}`,
          detail: battleCommandModalProbe,
        });
      }
    }
    if (scenarioId === 'endless-paranoia-modal') {
      const title = root.querySelector('#event-title');
      const desc = root.querySelector('#event-desc');
      const choices = Array.from(root.querySelectorAll('#event-choices .event-choice.endless-paranoia-choice')).filter(isVisible);
      const effectLines = Array.from(root.querySelectorAll('#event-choices .event-choice.endless-paranoia-choice .choice-effect')).filter(isVisible);
      const readHitState = (element) => {
        const rect = element ? element.getBoundingClientRect() : null;
        const point = rect ? {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        } : null;
        const inViewport = !!(point && point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height);
        const top = inViewport ? document.elementFromPoint(point.x, point.y) : null;
        return {
          rect: rect ? rectObj(rect) : null,
          point,
          inViewport,
          topSelector: selectorFor(top),
          topHit: !!(element && top && (top === element || element.contains(top))),
        };
      };
      const initialChoiceHit = readHitState(choices[0]);
      let finalChoiceHit = initialChoiceHit;
      if (choices[0] && !initialChoiceHit.topHit && typeof choices[0].scrollIntoView === 'function') {
        choices[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        finalChoiceHit = readHitState(choices[0]);
      }
      endlessParanoiaModalProbe = {
        title: title ? textLabel(title) : '',
        desc: desc ? textLabel(desc) : '',
        choiceCount: choices.length,
        effectLineCount: effectLines.length,
        firstChoiceTopHit: finalChoiceHit.topHit,
        topAtFirstChoice: finalChoiceHit.topSelector,
        firstChoiceRect: finalChoiceHit.rect,
        choiceLabels: choices.map(textLabel),
      };
      if (
        endlessParanoiaModalProbe.title !== '轮回偏执'
        || !/大轮回/.test(endlessParanoiaModalProbe.desc)
        || endlessParanoiaModalProbe.choiceCount !== 3
        || endlessParanoiaModalProbe.effectLineCount !== 3
        || !endlessParanoiaModalProbe.choiceLabels.every((label) => /【负】/.test(label) && /【偿】/.test(label))
        || !endlessParanoiaModalProbe.firstChoiceTopHit
      ) {
        issues.push({
          type: 'endless-paranoia-modal-invalid',
          selector: '#event-modal',
          detail: endlessParanoiaModalProbe,
        });
      }
    }

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const visibleRect = clippedRectFor(el);
      const style = getComputedStyle(el);
      const selector = selectorFor(el);
      const intersectsViewport = hasVisibleArea(visibleRect);
      const isInteractive = el.matches('button, a[href], input, select, textarea, [role="button"]');
      const isCard = el.matches('.card, .character-card, .realm-card, .reward-card, .shop-service, .save-slot, .event-choice, .achievement-card, .inheritance-card, .treasure-slot, .inventory-item');
      const isShell = el.matches('.codex-shell, .challenge-shell, .treasure-compendium-shell, .reward-shell, .shop-container, .game-over-container, .pvp-result-container, .card-detail-container, .modal-content, .ring-scene-container, .purification-container');

      if (intersectsViewport && (isInteractive || isCard || isShell)) {
        const outLeft = rect.left < -2;
        const outRight = rect.right > viewport.width + 2;
        const outTop = rect.top < -2;
        const outBottom = rect.bottom > viewport.height + 2 && !hasScrollableAncestor(el, 'y');
        const clippedWithinAncestor = visibleRect.left > rect.left + 1
          || visibleRect.right < rect.right - 1
          || visibleRect.top > rect.top + 1
          || visibleRect.bottom < rect.bottom - 1;
        if ((outLeft || outRight || outTop || outBottom) && !clippedWithinAncestor) {
          issues.push({
            type: 'visible-element-outside-viewport',
            selector,
            text: textLabel(el),
            rect: rectObj(rect),
            reason: { outLeft, outRight, outTop, outBottom },
          });
        }
      }

      if ((isInteractive || isCard) && intersectsViewport) {
        const points = [
          [visibleRect.left + (visibleRect.right - visibleRect.left) / 2, visibleRect.top + (visibleRect.bottom - visibleRect.top) / 2],
          [visibleRect.left + Math.min(12, (visibleRect.right - visibleRect.left) / 2), visibleRect.top + Math.min(12, (visibleRect.bottom - visibleRect.top) / 2)],
          [visibleRect.right - Math.min(12, (visibleRect.right - visibleRect.left) / 2), visibleRect.bottom - Math.min(12, (visibleRect.bottom - visibleRect.top) / 2)],
        ].filter(([x, y]) => x >= 0 && y >= 0 && x <= viewport.width && y <= viewport.height);
        for (const [x, y] of points) {
          const stack = document.elementsFromPoint(x, y).filter((node) => {
            if (!(node instanceof Element)) return false;
            const nodeStyle = getComputedStyle(node);
            return nodeStyle.pointerEvents !== 'none' && nodeStyle.visibility !== 'hidden';
          });
          const top = stack[0];
          const blocked = top && top !== el && !el.contains(top) && !top.contains(el);
          if (blocked) {
            issues.push({
              type: 'interactive-element-obscured',
              selector,
              text: textLabel(el),
              by: selectorFor(top),
              rect: rectObj(rect),
              point: { x: Math.round(x), y: Math.round(y) },
            });
            break;
          }
        }
      }

      if (isInteractive && intersectsViewport && style.overflow !== 'visible' && !isIntentionallyClamped(el)) {
        const clippedX = el.scrollWidth > el.clientWidth + 3;
        const clippedY = el.scrollHeight > el.clientHeight + 3 && !isScrollable(el, 'y');
        if (clippedX || clippedY) {
          issues.push({
            type: 'interactive-text-clipped',
            selector,
            text: textLabel(el),
            rect: rectObj(rect),
            scroll: {
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
            },
            reason: { clippedX, clippedY },
          });
        }
      }
    }

    const textCandidates = Array.from(root.querySelectorAll('h1,h2,h3,p,span,strong,small,li,div'))
      .filter((el) => isVisible(el) && textLabel(el).length >= 8)
      .filter((el) => !el.querySelector('h1,h2,h3,p,span,strong,small,li,button,input,select,textarea'));

    for (const el of textCandidates.slice(0, 500)) {
      if (isIntentionallyClamped(el)) continue;
      const style = getComputedStyle(el);
      const overflowHidden = /(hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`);
      if (!overflowHidden) continue;
      const clippedX = el.scrollWidth > el.clientWidth + 3;
      const clippedY = el.scrollHeight > el.clientHeight + 3 && !isScrollable(el, 'y');
      if (clippedX || clippedY) {
        warnings.push(buildWarning('text-may-be-clipped', el, {
          reason: { clippedX, clippedY },
        }));
      }
    }

    const scrollLocks = Array.from(root.querySelectorAll('*')).filter(isVisible).filter((el) => {
      if (el === root) return false;
      const style = getComputedStyle(el);
      const verticalClip = /(hidden|clip)/.test(style.overflowY);
      return verticalClip && el.scrollHeight > el.clientHeight + 8 && !isIntentionallyClamped(el);
    }).slice(0, 20).map((el) => buildWarning('non-scrollable-content-clipped', el, {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      noise: !isViewportVisible(el)
        || el.matches('.char-header, .ring-scene-container')
        || isRootLikeScroller(el),
      promote: (
        isViewportVisible(el)
        && (
          el.matches('.event-choice, #battle-tactical-advisor, .modal-content.event-view, .fate-ring-info-panel')
          || el.matches('.modal-content.deck-view, #map-scroll-container')
          || el.matches('.map-v3-header')
          || (el.matches('.card') && !isBattleHandCard(el))
          || isCollectionToolbar(el)
        )
      ),
      battleHandCard: el.matches('.card') && isBattleHandCard(el),
    }));
    warnings.push(...scrollLocks);

    if (scenarioId === 'dynamic-card-detail-modal') {
      const clippedWarnings = warnings.filter((warning) => [
        'text-may-be-clipped',
        'non-scrollable-content-clipped',
      ].includes(warning.type));
      if (clippedWarnings.length > 0) {
        issues.push({
          type: 'dynamic-card-detail-clipped-content',
          selector: '#card-detail-modal',
          warnings: clippedWarnings,
        });
      }
    }
    if (scenarioId === 'shop-service-detail-modal') {
      const clippedWarnings = warnings.filter((warning) => [
        'text-may-be-clipped',
        'non-scrollable-content-clipped',
      ].includes(warning.type));
      if (clippedWarnings.length > 0) {
        issues.push({
          type: 'shop-service-detail-modal-clipped-content',
          selector: '#card-detail-modal',
          warnings: clippedWarnings,
        });
      }
    }
    const probedModalClippedWarnings = warnings.filter((warning) => [
      'text-may-be-clipped',
      'non-scrollable-content-clipped',
    ].includes(warning.type));
    const modalClipProbes = {
      'skill-confirm-modal': { probe: skillConfirmModalProbe, issueType: 'skill-confirm-modal-clipped-content', selector: '#skill-confirm-modal' },
      'treasure-detail-modal': { probe: treasureDetailModalProbe, issueType: 'treasure-detail-modal-clipped-content', selector: '#treasure-detail-modal' },
      'law-detail-modal': { probe: lawDetailModalProbe, issueType: 'law-detail-modal-clipped-content', selector: '#law-detail-modal' },
      'reward-modal': { probe: rewardModalProbe, issueType: 'reward-modal-clipped-content', selector: '#reward-modal' },
    };
    const modalClipProbe = modalClipProbes[scenarioId];
    if (modalClipProbe?.probe) {
      modalClipProbe.probe.clippedWarningCount = probedModalClippedWarnings.length;
      if (probedModalClippedWarnings.length > 0) {
        issues.push({
          type: modalClipProbe.issueType,
          selector: modalClipProbe.selector,
          warnings: probedModalClippedWarnings,
        });
      }
    }

    const previewPanel = root.querySelector('#realm-preview-panel');
    if (previewPanel) {
      const previewBody = previewPanel.querySelector('.preview-scroll-body');
      const enterRealmButton = previewPanel.querySelector('#enter-realm-btn') || document.getElementById('enter-realm-btn');
      if (previewBody && isVisible(previewBody) && previewBody.scrollHeight > previewBody.clientHeight + 8 && !isScrollable(previewBody, 'y')) {
        issues.push({
          type: 'realm-preview-body-not-scrollable',
          selector: selectorFor(previewBody),
          rect: rectObj(previewBody.getBoundingClientRect()),
          scrollHeight: previewBody.scrollHeight,
          clientHeight: previewBody.clientHeight,
        });
      }
      if (enterRealmButton && !isVisible(enterRealmButton)) {
        issues.push({
          type: 'realm-preview-enter-button-hidden',
          selector: selectorFor(enterRealmButton),
          rect: rectObj(enterRealmButton.getBoundingClientRect()),
        });
      }
    }

    const reportedWarnings = warnings.filter((warning) => !isWarningNoise(warning));
    const promotedWarnings = reportedWarnings.filter(shouldPromoteWarning);
    for (const warning of promotedWarnings) {
      issues.push({
        type: 'promoted-layout-warning',
        warningType: warning.type,
        selector: warning.selector,
        text: warning.text,
        rect: warning.rect,
        reason: warning.reason,
        scrollHeight: warning.scrollHeight,
        clientHeight: warning.clientHeight,
      });
    }

    return {
      ok: issues.length === 0,
      issues,
      warnings: reportedWarnings,
      viewport,
      scenarioId,
      candidateCount: candidates.length,
      treasureBagProbe,
      alertModalProbe,
      treasureBagAlertProbe,
      dynamicCardDetailProbe,
      shopServiceDetailProbe,
      battleCommandModalProbe,
      endlessParanoiaModalProbe,
      saveSlotsModalProbe,
      saveConflictModalProbe,
      authModalProbe,
      confirmModalProbe,
      rewardExpeditionCtaProbe,
      skillConfirmModalProbe,
      treasureDetailModalProbe,
      lawDetailModalProbe,
      rewardModalProbe,
      pvpLiveMobileProbe,
      collectionLawsMobileProbe,
      rootRect: rectObj(rootRect),
    };
  }, { rootSelector, scenarioId });
}

async function inspectBattleLogStress(page, rootSelector, scenarioId) {
  const stressScenarios = new Set([
    'realm-select-screen',
    'pvp-screen',
    'battle-screen',
    'map-screen',
    'map-screen-expedition-intel-click',
    'reward-screen',
  ]);
  if (!stressScenarios.has(scenarioId)) {
    return { ok: true, skipped: true };
  }

  await page.evaluate((id) => {
    if (typeof Utils === 'undefined' || typeof Utils.showBattleLog !== 'function') return;
    const message = id === 'battle-screen'
      ? '布局压力测试：这是一条较长的战斗提示，用于确认移动端不会压住手牌、牌堆和结束回合按钮。'
      : '布局压力测试：非战斗反馈不应遮挡当前界面的关键操作按钮。';
    Utils.showBattleLog(message, { category: 'system', duration: 6000 });
  }, scenarioId);
  await waitForPaint(page);

  return page.evaluate(({ rootSelector, scenarioId }) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const issues = [];
    const root = document.querySelector(rootSelector);
    const log = document.getElementById('battle-log');

    const rectObj = (rect) => ({
      left: Math.round(rect.left * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    });

    const selectorFor = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList || []).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };

    const hasHiddenAncestor = (el) => {
      let node = el;
      while (node && node instanceof Element) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
        node = node.parentElement;
      }
      return false;
    };

    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (hasHiddenAncestor(el)) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 2
        && rect.height >= 2
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < viewport.width
        && rect.top < viewport.height;
    };

    const overlapArea = (a, b) => {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return width * height;
    };

    if (!root) {
      return {
        ok: false,
        issues: [{ type: 'missing-root', selector: rootSelector }],
        scenarioId,
      };
    }

    if (!isVisible(log)) {
      return {
        ok: true,
        skipped: false,
        logVisible: false,
        scenarioId,
      };
    }

    const logRect = log.getBoundingClientRect();
    const targetSelector = scenarioId === 'battle-screen'
      ? '#hand-cards,.hand-area,#deck-pile,#discard-pile,#end-turn-btn,#battle-command-panel'
      : 'button,a[href],input,select,textarea,[role="button"]';
    const targets = Array.from(root.querySelectorAll(targetSelector)).filter(isVisible);

    for (const target of targets) {
      const targetRect = target.getBoundingClientRect();
      const area = overlapArea(logRect, targetRect);
      if (area > 12) {
        issues.push({
          type: 'battle-log-overlaps-critical-ui',
          scenarioId,
          target: selectorFor(target),
          targetText: (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          logRect: rectObj(logRect),
          targetRect: rectObj(targetRect),
          overlapArea: Math.round(area),
        });
      }
    }

    return {
      ok: issues.length === 0,
      skipped: false,
      logVisible: true,
      scenarioId,
      issues,
      logRect: rectObj(logRect),
      targetCount: targets.length,
    };
  }, { rootSelector, scenarioId });
}

async function inspectPvpTabMobileSurface(page, scenarioId) {
  if (scenarioId !== 'pvp-screen') {
    return { ok: true, skipped: true };
  }

  return page.evaluate(async () => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (viewport.width > 520) {
      return { ok: true, skipped: true, viewport };
    }
    if (!window.PVPScene || typeof window.PVPScene.switchTab !== 'function') {
      return {
        ok: false,
        skipped: false,
        viewport,
        issues: [{ type: 'missing-pvp-scene-switch-tab' }],
      };
    }

    const issues = [];
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const waitForMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rectObj = (rect) => ({
      left: Math.round(rect.left * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    });
    const selectorFor = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList || []).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };
    const hasHiddenAncestor = (el) => {
      let node = el;
      while (node && node instanceof Element) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
        node = node.parentElement;
      }
      return false;
    };
    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (hasHiddenAncestor(el)) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 2
        && rect.height >= 2
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < viewport.width
        && rect.top < viewport.height;
    };
    const rectFitsViewport = (rect, tolerance = 2) => !!(rect
      && rect.left >= -tolerance
      && rect.top >= -tolerance
      && rect.right <= viewport.width + tolerance
      && rect.bottom <= viewport.height + tolerance);
    const overlapArea = (a, b) => {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return width * height;
    };
    const readHitState = (element) => {
      const rect = element ? element.getBoundingClientRect() : null;
      const point = rect ? {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      } : null;
      const inViewport = !!(point && point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height);
      const top = inViewport ? document.elementFromPoint(point.x, point.y) : null;
      return {
        rect: rect ? rectObj(rect) : null,
        point,
        inViewport,
        topSelector: selectorFor(top),
        topHit: !!(element && top && (top === element || element.contains(top))),
      };
    };
    const showBattleOverlays = () => {
      if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
        Utils.showBattleLog('移动端分页切换压力测试：日志不应遮挡排名、实时论道、护山阵或诸天阁入口。', {
          category: 'system',
          duration: 6000,
        });
      }
      if (typeof Utils !== 'undefined' && typeof Utils.toggleBattleLogPanel === 'function') {
        Utils.toggleBattleLogPanel(true);
      }
    };
    const getCriticalTargets = (tab, pane) => {
      if (!pane) return [];
      const selectorsByTab = {
        ranking: ['[data-pvp-legacy-practice]'],
        live: ['[data-live-action="join-queue"]'],
        defense: ['.ink-btn-large', '#guardian-formation', '.dao-card'],
        shop: ['.shop-category', '.buy-overlay', '.talisman-card'],
      };
      const selectors = selectorsByTab[tab] || [];
      const seen = new Set();
      const targets = [];
      for (const selector of selectors) {
        for (const element of Array.from(pane.querySelectorAll(selector))) {
          if (!isVisible(element) || seen.has(element)) continue;
          seen.add(element);
          targets.push(element);
        }
      }
      return targets;
    };
    const tabs = ['ranking', 'live', 'defense', 'shop'];
    const tabProbes = [];
    const rankingTab = document.querySelector('.rune-tab[data-pvp-tab="ranking"]');
    const liveTab = document.querySelector('.rune-tab[data-pvp-tab="live"]');
    window.PVPScene.switchTab('ranking');
    await waitForPaint();
    rankingTab?.focus();
    rankingTab?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    }));
    await waitForPaint();
    const keyboardProbe = {
      activeTab: window.PVPScene.activeTab || '',
      focusedTab: document.activeElement?.dataset?.pvpTab || '',
      rankingTabIndex: rankingTab?.getAttribute('tabindex') || '',
      rankingSelected: rankingTab?.getAttribute('aria-selected') || '',
      liveTabIndex: liveTab?.getAttribute('tabindex') || '',
      liveSelected: liveTab?.getAttribute('aria-selected') || '',
    };
    if (keyboardProbe.activeTab !== 'live'
      || keyboardProbe.focusedTab !== 'live'
      || keyboardProbe.rankingTabIndex !== '-1'
      || keyboardProbe.rankingSelected !== 'false'
      || keyboardProbe.liveTabIndex !== '0'
      || keyboardProbe.liveSelected !== 'true') {
      issues.push({ type: 'pvp-tab-keyboard-navigation-invalid', detail: keyboardProbe });
    }

    for (const tab of tabs) {
      showBattleOverlays();
      await waitForPaint();
      await window.PVPScene.switchTab(tab);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await waitForPaint();
        await waitForMs(40);
        const pane = document.getElementById(`tab-${tab}`);
        const tabButton = document.querySelector(`.rune-tab[data-pvp-tab="${tab}"]`);
        const paneStyle = pane ? getComputedStyle(pane) : null;
        const paneOpacity = paneStyle ? Number.parseFloat(paneStyle.opacity || '1') : 0;
        const tabReady = !!pane
          && pane.classList.contains('active')
          && !!tabButton?.classList.contains('active')
          && paneStyle?.display !== 'none'
          && paneOpacity >= 0.95;
        if (tabReady) break;
      }

      const pane = document.getElementById(`tab-${tab}`);
      const paneStyle = pane ? getComputedStyle(pane) : null;
      const paneVisible = !!(pane
        && pane.classList.contains('active')
        && paneStyle?.display !== 'none'
        && Number.parseFloat(paneStyle.opacity || '1') >= 0.95
        && isVisible(pane));
      const criticalTargets = getCriticalTargets(tab, pane);
      const log = document.getElementById('battle-log');
      const panel = document.querySelector('.battle-log-panel') || document.getElementById('battle-log-panel');
      const logVisible = isVisible(log);
      const panelVisible = isVisible(panel);
      const overlayStates = [
        { id: 'battle-log', element: log, visible: logVisible },
        { id: 'battle-log-panel', element: panel, visible: panelVisible },
      ].map((overlay) => {
        const rect = overlay.visible ? overlay.element.getBoundingClientRect() : null;
        const blockedTargets = [];
        if (overlay.visible && rect) {
          for (const target of criticalTargets) {
            const targetRect = target.getBoundingClientRect();
            const hit = readHitState(target);
            const area = overlapArea(rect, targetRect);
            if (area > 12 || !hit.topHit) {
              blockedTargets.push({
                selector: selectorFor(target),
                text: (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                rect: rectObj(targetRect),
                overlapArea: Math.round(area),
                topHit: hit.topHit,
                topAt: hit.topSelector,
              });
            }
          }
        }
        return {
          id: overlay.id,
          visible: overlay.visible,
          rect: rect ? rectObj(rect) : null,
          blockedTargets,
        };
      });

      const tabProbe = {
        tab,
        paneVisible,
        paneRect: pane ? rectObj(pane.getBoundingClientRect()) : null,
        criticalTargets: criticalTargets.map((element) => {
          const hit = readHitState(element);
          return {
            selector: selectorFor(element),
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
            rect: hit.rect,
            topHit: hit.topHit,
            topAt: hit.topSelector,
          };
        }),
        overlayStates,
      };

      if (!paneVisible) {
        issues.push({ type: 'pvp-tab-pane-not-visible', tab, detail: tabProbe });
      }
      for (const overlayState of overlayStates) {
        if (overlayState.blockedTargets.length > 0) {
          issues.push({
            type: 'pvp-tab-battle-overlay-blocks-target',
            tab,
            overlay: overlayState.id,
            blockedTargets: overlayState.blockedTargets,
          });
        }
      }

      if (tab === 'ranking') {
        const rankingCta = pane?.querySelector('[data-pvp-legacy-practice]') || null;
        const rankingHit = readHitState(rankingCta);
        tabProbe.rankingCta = {
          visible: !!(rankingCta && isVisible(rankingCta)),
          rect: rankingHit.rect,
          inViewport: rectFitsViewport(rankingHit.rect, 2),
          topHit: rankingHit.topHit,
          topAt: rankingHit.topSelector,
          text: rankingCta ? (rankingCta.textContent || '').replace(/\s+/g, ' ').trim() : '',
        };
        if (!tabProbe.rankingCta.visible || !tabProbe.rankingCta.inViewport || !tabProbe.rankingCta.topHit) {
          issues.push({
            type: 'pvp-ranking-mirror-practice-cta-invalid',
            tab,
            detail: tabProbe.rankingCta,
          });
        }
      }

      if (tab === 'shop') {
        const categories = Array.from(pane?.querySelectorAll('.shop-category') || []).filter(isVisible);
        const firstItem = pane?.querySelector('.talisman-card') || null;
        const firstOverlay = pane?.querySelector('.buy-overlay') || null;
        const firstOverlayHit = readHitState(firstOverlay);
        const overflowNodes = Array.from(pane?.querySelectorAll('*') || [])
          .filter((element) => isVisible(element))
          .filter((element) => {
            const style = getComputedStyle(element);
            return style.overflowX !== 'hidden' && element.scrollWidth > element.clientWidth + 2;
          })
          .slice(0, 12)
          .map((element) => ({
            selector: selectorFor(element),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          }));
        tabProbe.shop = {
          categories: categories.map((element) => {
            const hit = readHitState(element);
            return {
              selector: selectorFor(element),
              tagName: element.tagName.toLowerCase(),
              type: element.getAttribute('type') || '',
              ariaPressed: element.getAttribute('aria-pressed') || '',
              rect: hit.rect,
              topHit: hit.topHit,
              topAt: hit.topSelector,
              text: (element.textContent || '').replace(/\s+/g, ' ').trim(),
            };
          }),
          firstItemRect: firstItem ? rectObj(firstItem.getBoundingClientRect()) : null,
          firstItemFullyVisible: firstItem ? rectFitsViewport(rectObj(firstItem.getBoundingClientRect()), 2) : false,
          firstOverlayVisible: !!(firstOverlay && isVisible(firstOverlay)),
          firstOverlayRect: firstOverlayHit.rect,
          firstOverlayTopHit: firstOverlayHit.topHit,
          firstOverlayTopAt: firstOverlayHit.topSelector,
          firstOverlayText: firstOverlay ? (firstOverlay.textContent || '').replace(/\s+/g, ' ').trim() : '',
          paneScrollWidth: pane?.scrollWidth || 0,
          paneClientWidth: pane?.clientWidth || 0,
          documentScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: viewport.width,
          overflowNodes,
        };
        const categoriesOk = tabProbe.shop.categories.length >= 4
          && tabProbe.shop.categories.every((entry) => entry.tagName === 'button' && entry.type === 'button' && entry.ariaPressed !== '' && entry.topHit);
        const noHorizontalOverflow = tabProbe.shop.documentScrollWidth <= viewport.width + 2
          && tabProbe.shop.paneScrollWidth <= tabProbe.shop.paneClientWidth + 2
          && tabProbe.shop.overflowNodes.length === 0;
        if (!categoriesOk
          || !noHorizontalOverflow
          || !tabProbe.shop.firstItemFullyVisible
          || !tabProbe.shop.firstOverlayVisible
          || !tabProbe.shop.firstOverlayTopHit) {
          issues.push({
            type: 'pvp-shop-mobile-surface-invalid',
            tab,
            detail: tabProbe.shop,
          });
        }
      }

      tabProbes.push(tabProbe);
    }

    return {
      ok: issues.length === 0,
      skipped: false,
      viewport,
      keyboardProbe,
      tabProbes,
      issues,
    };
  });
}

async function inspectPvpDesktopShopSurface(page, scenarioId) {
  if (scenarioId !== 'pvp-screen') {
    return { ok: true, skipped: true };
  }

  return page.evaluate(async () => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (viewport.width <= 520) {
      return { ok: true, skipped: true, viewport };
    }
    if (!window.PVPScene || typeof window.PVPScene.switchTab !== 'function') {
      return { ok: false, skipped: false, viewport, issues: [{ type: 'missing-pvp-scene-switch-tab' }] };
    }

    window.PVPScene.switchTab('shop');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 80));

    const pane = document.getElementById('tab-shop');
    const categories = Array.from(pane?.querySelectorAll('.shop-category') || []);
    const firstItem = pane?.querySelector('.talisman-card') || null;
    const buyButton = firstItem?.querySelector('.buy-overlay') || null;
    const rect = buyButton?.getBoundingClientRect() || null;
    const buttonInViewport = !!rect
      && rect.left >= 0
      && rect.right <= viewport.width
      && rect.top >= 0
      && rect.bottom <= viewport.height;
    const hit = buttonInViewport
      ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      : null;
    buyButton?.focus({ preventScroll: true });
    const categoryStyles = categories.map((category) => {
      const style = getComputedStyle(category);
      return {
        tagName: category.tagName.toLowerCase(),
        type: category.getAttribute('type') || '',
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        color: style.color,
      };
    });
    const issues = [];
    const categoryButtonsValid = categoryStyles.length >= 4
      && categoryStyles.every((entry) => entry.tagName === 'button'
        && entry.type === 'button'
        && !['rgb(239, 239, 239)', 'rgb(255, 255, 255)'].includes(entry.backgroundColor));
    const buyButtonValid = !!buyButton
      && buyButton.tagName === 'BUTTON'
      && !!rect
      && rect.width >= 44
      && rect.height >= 44
      && rect.left >= 0
      && rect.right <= viewport.width
      && getComputedStyle(buyButton).display !== 'none'
      && getComputedStyle(buyButton).visibility !== 'hidden'
      && Number(getComputedStyle(buyButton).opacity) > 0
      && (!buttonInViewport || (!!hit && (hit === buyButton || buyButton.contains(hit))))
      && document.activeElement === buyButton;
    if (!categoryButtonsValid) {
      issues.push({ type: 'pvp-shop-desktop-category-button-style-invalid', detail: categoryStyles });
    }
    if (!buyButtonValid) {
      issues.push({
        type: 'pvp-shop-desktop-buy-button-invalid',
        detail: {
          tagName: buyButton?.tagName || '',
          rect: rect ? {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          } : null,
          focused: document.activeElement === buyButton,
          buttonInViewport,
          hit: !buttonInViewport || (!!hit && !!buyButton && (hit === buyButton || buyButton.contains(hit))),
        },
      });
    }

    return {
      ok: issues.length === 0,
      skipped: false,
      viewport,
      categoryStyles,
      categoryButtonsValid,
      buyButtonValid,
      issues,
    };
  });
}

async function inspectSettingsModalLayering(page, scenarioId) {
  if (scenarioId !== 'settings-modal') {
    return { ok: true, skipped: true };
  }

  return page.evaluate(async () => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (viewport.width > 520) {
      return { ok: true, skipped: true, viewport };
    }

    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rectObj = (rect) => ({
      left: Math.round(rect.left * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    });
    const selectorFor = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList || []).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    };
    const hasHiddenAncestor = (el) => {
      let node = el;
      while (node && node instanceof Element) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true;
        node = node.parentElement;
      }
      return false;
    };
    const isVisible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (hasHiddenAncestor(el)) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 2
        && rect.height >= 2
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < viewport.width
        && rect.top < viewport.height;
    };
    const readHitState = (element) => {
      const rect = element ? element.getBoundingClientRect() : null;
      const point = rect ? {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      } : null;
      const inViewport = !!(point && point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height);
      const top = inViewport ? document.elementFromPoint(point.x, point.y) : null;
      return {
        rect: rect ? rectObj(rect) : null,
        point,
        inViewport,
        topSelector: selectorFor(top),
        topHit: !!(element && top && (top === element || element.contains(top))),
      };
    };

    if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog('设置面板层级压力测试：关闭按钮必须压过战斗日志。', {
        category: 'system',
        duration: 6000,
      });
    }
    if (typeof Utils !== 'undefined' && typeof Utils.toggleBattleLogPanel === 'function') {
      Utils.toggleBattleLogPanel(true);
    }
    await waitForPaint();

    const modal = document.getElementById('settings-modal');
    const content = modal?.querySelector('.modal-content') || null;
    const closeButton = modal?.querySelector('.modal-close') || null;
    const log = document.getElementById('battle-log');
    const panel = document.querySelector('.battle-log-panel') || document.getElementById('battle-log-panel');
    const closeHit = readHitState(closeButton);
    const modalZ = Number.parseInt(getComputedStyle(modal || document.body).zIndex || '0', 10) || 0;
    const contentZ = Number.parseInt(getComputedStyle(content || modal || document.body).zIndex || '0', 10) || 0;
    const logZ = log ? (Number.parseInt(getComputedStyle(log).zIndex || '0', 10) || 0) : 0;
    const panelZ = panel ? (Number.parseInt(getComputedStyle(panel).zIndex || '0', 10) || 0) : 0;
    const detail = {
      viewport,
      modalVisible: !!(modal && isVisible(modal)),
      contentVisible: !!(content && isVisible(content)),
      closeVisible: !!(closeButton && isVisible(closeButton)),
      closeRect: closeHit.rect,
      closeTopHit: closeHit.topHit,
      closeTopAt: closeHit.topSelector,
      battleLogVisible: !!(log && isVisible(log)),
      battleLogRect: log && isVisible(log) ? rectObj(log.getBoundingClientRect()) : null,
      battleLogPanelVisible: !!(panel && isVisible(panel)),
      battleLogPanelRect: panel && isVisible(panel) ? rectObj(panel.getBoundingClientRect()) : null,
      modalZ,
      contentZ,
      battleLogZ: logZ,
      battleLogPanelZ: panelZ,
    };
    const issues = [];
    if (!detail.modalVisible || !detail.contentVisible) {
      issues.push({ type: 'settings-modal-not-visible', detail });
    }
    if (!detail.closeVisible || !detail.closeTopHit) {
      issues.push({ type: 'settings-modal-close-unreachable', detail });
    }
    if (Math.max(modalZ, contentZ) <= logZ || Math.max(modalZ, contentZ) <= panelZ) {
      issues.push({ type: 'settings-modal-zindex-not-above-battle-log', detail });
    }
    if (detail.battleLogVisible || detail.battleLogPanelVisible) {
      issues.push({ type: 'battle-log-visible-over-settings-modal', detail });
    }
    return {
      ok: issues.length === 0,
      skipped: false,
      issues,
      detail,
    };
  });
}

async function inspectMapNodeClickability(page, scenarioId) {
  if (!['map-screen', 'map-screen-expedition-intel-click'].includes(scenarioId)) {
    return { ok: true, skipped: true };
  }

  const selector = '#map-screen .map-node-v3.available:not(.completed):not(.locked), #map-screen .map-node-v3.current:not(.completed):not(.locked), #map-screen .map-node-v3:not(.completed):not(.locked)';
  try {
    const shouldCloseMobileIntel = await page.evaluate(() => window.innerWidth <= 768
      && !!document.querySelector('#map-screen .map-screen-v3.show-map-intel'));
    if (shouldCloseMobileIntel) {
      const intelToggle = page.locator('#map-screen [data-map-action="toggle-map-intel"]');
      await intelToggle.waitFor({ state: 'visible', timeout: 3000 });
      await intelToggle.click();
      await waitForPaint(page);
      const mobileIntelClosed = await page.evaluate(() => {
        const shell = document.querySelector('#map-screen .map-screen-v3');
        const drawer = document.getElementById('map-intel-drawer');
        return !!shell
          && !shell.classList.contains('show-map-intel')
          && drawer?.getAttribute('aria-hidden') === 'true';
      });
      if (!mobileIntelClosed) {
        return {
          ok: false,
          skipped: false,
          issues: [{ type: 'map-mobile-intel-drawer-did-not-close-before-node-click' }],
        };
      }
    }
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 3000 });
    await page.evaluate((nodeSelector) => {
      const node = document.querySelector(nodeSelector);
      if (!node || typeof node.scrollIntoView !== 'function') return;
      node.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = node.getBoundingClientRect();
      const scroller = document.getElementById('map-scroll-container');
      if (scroller && rect.left < 0) scroller.scrollLeft += rect.left - 16;
      if (scroller && rect.right > window.innerWidth) scroller.scrollLeft += rect.right - window.innerWidth + 16;
    }, selector);
    await waitForPaint(page);
    const target = await page.evaluate((nodeSelector) => {
      const node = document.querySelector(nodeSelector);
      if (!node) return { ok: false, issue: { type: 'map-node-not-found' } };
      const rect = node.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const point = {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
      const rectObj = (value) => ({
        left: Math.round(value.left * 10) / 10,
        top: Math.round(value.top * 10) / 10,
        right: Math.round(value.right * 10) / 10,
        bottom: Math.round(value.bottom * 10) / 10,
        width: Math.round(value.width * 10) / 10,
        height: Math.round(value.height * 10) / 10,
      });
      const selectorFor = (el) => {
        if (!el) return '';
        if (el.id) return `#${el.id}`;
        const classes = Array.from(el.classList || []).slice(0, 3).join('.');
        return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
      };
      if (point.x < 0 || point.x > viewport.width || point.y < 0 || point.y > viewport.height) {
        return {
          ok: false,
          issue: {
            type: 'map-node-center-outside-viewport',
            node: selectorFor(node),
            point,
            rect: rectObj(rect),
            viewport,
          },
        };
      }
      const stack = document.elementsFromPoint(point.x, point.y).filter((entry) => {
        if (!(entry instanceof Element)) return false;
        const style = getComputedStyle(entry);
        return style.pointerEvents !== 'none' && style.visibility !== 'hidden';
      });
      const top = stack[0] || null;
      if (top && top !== node && !node.contains(top) && !top.contains(node)) {
        return {
          ok: false,
          issue: {
            type: 'map-node-obscured',
            by: selectorFor(top),
            node: selectorFor(node),
            point,
          },
        };
      }
      return {
        ok: true,
        point,
        nodeId: String(node.dataset.nodeId || ''),
        node: selectorFor(node),
        top: selectorFor(top),
      };
    }, selector);
    if (!target.ok) {
      return {
        ok: false,
        skipped: false,
        issues: [target.issue || { type: 'map-node-click-target-invalid' }],
      };
    }
    const before = await page.evaluate(() => ({
      mode: document.body?.dataset?.currentScreen || window.game?.currentScreen || '',
      activeScreen: document.querySelector('[id$="-screen"].active')?.id || '',
      currentNodeIndex: window.game?.map?.currentNodeIndex ?? null,
      eventOpen: !!document.querySelector('#event-modal.active'),
      battleActive: !!document.querySelector('#battle-screen.active'),
    }));
    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 768) {
      await page.touchscreen.tap(target.point.x, target.point.y);
    } else {
      await page.mouse.click(target.point.x, target.point.y);
    }
    await waitForPaint(page);
    const after = await page.evaluate(() => ({
      mode: document.body?.dataset?.currentScreen || window.game?.currentScreen || '',
      activeScreen: document.querySelector('[id$="-screen"].active')?.id || '',
      currentNodeIndex: window.game?.map?.currentNodeIndex ?? null,
      eventOpen: !!document.querySelector('#event-modal.active'),
      battleActive: !!document.querySelector('#battle-screen.active'),
    }));
    const selectedTarget = target.nodeId !== '' && String(after.currentNodeIndex) === target.nodeId;
    const stateTransitioned = String(before.currentNodeIndex) !== String(after.currentNodeIndex)
      || before.mode !== after.mode
      || before.activeScreen !== after.activeScreen
      || before.eventOpen !== after.eventOpen
      || before.battleActive !== after.battleActive;
    if (!selectedTarget || !stateTransitioned) {
      return {
        ok: false,
        skipped: false,
        issues: [{
          type: 'map-node-click-no-state-transition',
          target,
          before,
          after,
          selectedTarget,
          stateTransitioned,
        }],
      };
    }
    return {
      ok: true,
      skipped: false,
      target,
      before,
      after,
      closedMobileIntelForClick: shouldCloseMobileIntel,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      issues: [
        {
          type: 'map-node-dom-click-failed',
          message: error?.message || String(error),
        },
      ],
    };
  }
}

async function inspectMapExpeditionIntelPersistence(page, scenarioId) {
  if (scenarioId !== 'map-screen-expedition-intel-click') {
    return { ok: true, skipped: true };
  }
  return page.evaluate(() => {
    const container = document.getElementById('map-screen');
    const shell = container?.querySelector('.map-screen-v3');
    const panels = container?.querySelector('#map-expedition-panels');
    const button = container?.querySelector('[data-map-action="toggle-map-intel"]');
    if (!container || !shell || !panels || !button) {
      return { ok: false, skipped: false, issues: [{ type: 'missing-expedition-intel-controls' }] };
    }

    const readState = () => ({
      open: shell.classList.contains('show-map-intel'),
      expanded: button.getAttribute('aria-expanded') === 'true',
      panelVisible: panels.getAttribute('aria-hidden') === 'false' && getComputedStyle(panels).display !== 'none',
      userToggled: shell.dataset.mapIntelUserToggled || '',
    });

    const initial = readState();
    button.click();
    const closed = readState();
    if (window.game && typeof game.renderExpeditionMapPanels === 'function') {
      game.renderExpeditionMapPanels();
    }
    if (window.game?.mapView && typeof game.mapView.syncMapChrome === 'function') {
      game.mapView.syncMapChrome(container);
    }
    const afterRerender = readState();
    button.click();
    const reopened = readState();
    const issues = [];
    if (!initial.open || !initial.expanded || !initial.panelVisible) issues.push({ type: 'expedition-intel-not-auto-open', initial });
    if (closed.open || closed.expanded || closed.panelVisible) issues.push({ type: 'expedition-intel-did-not-close', closed });
    if (afterRerender.open || afterRerender.expanded || afterRerender.panelVisible) issues.push({ type: 'expedition-intel-reopened-after-user-close', afterRerender });
    if (!reopened.open || !reopened.expanded || !reopened.panelVisible) issues.push({ type: 'expedition-intel-did-not-reopen-for-clickability-check', reopened });
    return {
      ok: issues.length === 0,
      skipped: false,
      initial,
      closed,
      afterRerender,
      reopened,
      issues,
    };
  });
}

async function inspectBattleOverlaySwitchGuard(page) {
  const prepareResult = await prepareScenario(page, 'battle-screen');
  await waitForPaint(page);
  const result = await page.evaluate((prepareResult) => {
    if (!window.game || typeof game.showScreen !== 'function') {
      return {
        ok: false,
        issues: [{ type: 'game-unavailable' }],
      };
    }

    if (typeof Utils !== 'undefined' && typeof Utils.showBattleLog === 'function') {
      Utils.showBattleLog('布局压力测试：切屏时应清理这条战斗提示。', { category: 'system', duration: 8000 });
    }
    if (typeof Utils !== 'undefined' && typeof Utils.toggleBattleLogPanel === 'function') {
      Utils.toggleBattleLogPanel(true);
    }

    game.unlockedRealms = [1];
    game.selectedRealmId = null;
    game.lastSelectedRealmId = 1;
    game.showScreen('realm-select-screen');
    if (typeof game.selectRealm === 'function') {
      game.selectRealm(1);
    }

    const log = document.getElementById('battle-log');
    const panel = document.getElementById('battle-log-panel');
    const logVisible = !!log && log.classList.contains('show') && getComputedStyle(log).display !== 'none';
    const panelVisible = !!panel && panel.classList.contains('active') && getComputedStyle(panel).display !== 'none';
    const currentScreen = document.body?.dataset?.currentScreen || game.currentScreen || '';
    const selectedRealmId = game.selectedRealmId;
    const activeRealmId = document.querySelector('.realm-card.active')?.dataset?.id || '';
    const dynamicBg = document.getElementById('dynamic-bg');
    const dynamicBgStyle = dynamicBg ? getComputedStyle(dynamicBg) : null;
    const dynamicBgVisible = !!dynamicBg
      && dynamicBgStyle.display !== 'none'
      && dynamicBgStyle.visibility !== 'hidden'
      && Number(dynamicBgStyle.opacity) !== 0;
    const parseRgbColors = (value = '') => {
      const colors = [];
      const pattern = /rgba?\(([^)]+)\)/g;
      let match = pattern.exec(value);
      while (match) {
        const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
        if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
          colors.push({ r: parts[0], g: parts[1], b: parts[2] });
        }
        match = pattern.exec(value);
      }
      return colors;
    };
    const isRedDominant = (color) => (
      color.r >= 90
      && color.r > color.g * 1.45
      && color.r > color.b * 1.2
      && color.g < 120
    );
    const inspectSurface = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      const cssText = [
        style.background,
        style.backgroundColor,
        style.backgroundImage,
        style.borderColor,
        style.boxShadow,
      ].join(' ');
      return {
        selector,
        redDominant: parseRgbColors(cssText).some(isRedDominant),
        background: style.background,
        borderColor: style.borderColor,
      };
    };
    const surfaceChecks = [
      'body',
      '#realm-select-screen',
      '#realm-select-screen .screen-header',
      '#realm-select-screen .realm-select-layout',
      '#realm-preview-panel',
    ].map(inspectSurface).filter(Boolean);
    const redSurfaces = surfaceChecks.filter((surface) => surface.redDominant);
    const issues = [];

    if (logVisible) issues.push({ type: 'battle-log-visible-after-non-battle-switch' });
    if (panelVisible) issues.push({ type: 'battle-log-panel-visible-after-non-battle-switch' });
    if (dynamicBgVisible) issues.push({ type: 'dynamic-background-visible-after-realm-select-switch' });
    if (String(selectedRealmId) !== '1' || activeRealmId !== '1') {
      issues.push({ type: 'realm-select-switch-guard-not-deterministic', selectedRealmId, activeRealmId });
    }
    if (redSurfaces.length > 0) {
      issues.push({ type: 'red-dominant-surface-after-battle-switch', surfaces: redSurfaces.map((surface) => surface.selector) });
    }
    if (currentScreen !== 'realm-select-screen') {
      issues.push({ type: 'unexpected-current-screen', currentScreen });
    }

    return {
      ok: issues.length === 0,
      issues,
      prepareResult,
      currentScreen,
      logVisible,
      panelVisible,
      dynamicBgVisible,
      selectedRealmId,
      activeRealmId,
      surfaceChecks,
    };
  }, prepareResult);
  await waitForPaint(page);
  return result;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });

  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') recordConsoleError(`[${viewport.id}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => recordConsoleError(`[${viewport.id}] ${String(err)}`));

    await page.addInitScript(() => {
      try {
        localStorage.setItem('theDefierDebug', 'true');
        localStorage.setItem('theDefierLegacyV1', JSON.stringify({
          essence: 120,
          spent: 0,
          upgrades: {},
          lastPreset: 'tempo',
          secondaryPreset: 'survival',
        }));
      } catch {}
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);

    for (const scenario of scenarios) {
      const scenarioStart = Date.now();
      console.log(`[frontend-layout] START ${viewport.id}/${scenario.id}`);
      let prepareResult = null;
      try {
        prepareResult = await prepareScenario(page, scenario.id);
        await waitForPaint(page);
      } catch (err) {
        add(viewport.id, scenario.id, false, JSON.stringify({
          type: 'setup-error',
          message: err?.message || String(err),
        }));
        console.log(`[frontend-layout] END ${viewport.id}/${scenario.id} pass=0 duration=${Date.now() - scenarioStart}ms setup-error`);
        continue;
      }

      const screenshotPath = path.join(outDir, screenshotName(viewport.id, scenario.id));
      const screenshotCaptured = await captureFrontendLayoutScreenshot(
        page,
        screenshotPath,
        `frontend-layout-${viewport.id}-${scenario.id}`,
      );

      const rootSelector = prepareResult?.rootSelector || scenario.root;
      const result = await inspectLayout(page, rootSelector, scenario.id);
      const overlayStress = await inspectBattleLogStress(page, rootSelector, scenario.id);
      const pvpTabMobileSurface = await inspectPvpTabMobileSurface(page, scenario.id);
      const pvpDesktopShopSurface = await inspectPvpDesktopShopSurface(page, scenario.id);
      const settingsModalLayering = await inspectSettingsModalLayering(page, scenario.id);
      const mapExpeditionIntel = await inspectMapExpeditionIntelPersistence(page, scenario.id);
      const mapNodeClick = await inspectMapNodeClickability(page, scenario.id);
      let overlayStressScreenshot = null;
      if (!overlayStress.skipped) {
        const overlayScreenshotPath = path.join(outDir, screenshotName(viewport.id, `${scenario.id}-battle-log-stress`));
        const overlayScreenshotCaptured = await captureFrontendLayoutScreenshot(
          page,
          overlayScreenshotPath,
          `frontend-layout-${viewport.id}-${scenario.id}-battle-log-stress`,
        );
        overlayStressScreenshot = overlayScreenshotCaptured
          ? path.relative(process.cwd(), overlayScreenshotPath).replace(/\\/g, '/')
          : null;
      }
      const detail = {
        title: scenario.title,
        setup: prepareResult,
        screenshot: screenshotCaptured ? path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/') : null,
        screenshotMode,
        overlayStress,
        pvpTabMobileSurface,
        pvpDesktopShopSurface,
        settingsModalLayering,
        mapExpeditionIntel,
        mapNodeClick,
        overlayStressScreenshot,
        ...result,
      };
      const realBattleResolverRequired = realBattleResolverScenarios.has(scenario.id);
      const realBattleResolverOk = !realBattleResolverRequired
        || (
          prepareResult?.activation === 'real-battle-resolver'
          && prepareResult?.webdriverOverrideApplied === true
        );
      const pass = !!prepareResult?.ok
        && realBattleResolverOk
        && !!result?.ok
        && !!overlayStress?.ok
        && !!pvpTabMobileSurface?.ok
        && !!pvpDesktopShopSurface?.ok
        && !!settingsModalLayering?.ok
        && !!mapExpeditionIntel?.ok
        && !!mapNodeClick?.ok;
      add(
        viewport.id,
        scenario.id,
        pass,
        JSON.stringify({
          ...detail,
          realBattleResolverRequired,
          realBattleResolverOk,
        }),
      );
      console.log(`[frontend-layout] END ${viewport.id}/${scenario.id} pass=${pass ? 1 : 0} duration=${Date.now() - scenarioStart}ms`);
    }

    try {
      const switchGuardStart = Date.now();
      const switchGuard = await inspectBattleOverlaySwitchGuard(page);
      const screenshotPath = path.join(outDir, screenshotName(viewport.id, 'battle-overlay-switch-guard'));
      const screenshotCaptured = await captureFrontendLayoutScreenshot(
        page,
        screenshotPath,
        `frontend-layout-${viewport.id}-battle-overlay-switch-guard`,
      );
      add(viewport.id, 'battle-overlay-switch-guard', !!switchGuard?.ok, JSON.stringify({
        title: 'Battle Overlay Switch Guard',
        screenshot: screenshotCaptured ? path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/') : null,
        screenshotMode,
        ...switchGuard,
      }));
      console.log(`[frontend-layout] END ${viewport.id}/battle-overlay-switch-guard pass=${switchGuard?.ok ? 1 : 0} duration=${Date.now() - switchGuardStart}ms`);
    } catch (err) {
      add(viewport.id, 'battle-overlay-switch-guard', false, JSON.stringify({
        title: 'Battle Overlay Switch Guard',
        type: 'setup-error',
        message: err?.message || String(err),
      }));
      console.log(`[frontend-layout] END ${viewport.id}/battle-overlay-switch-guard pass=0 setup-error`);
    }

    await closeWithTimeout(() => page.close(), `page:${viewport.id}`, 3000);
  }

  const report = {
    url,
    generatedAt: new Date().toISOString(),
    findings,
    consoleErrors,
    summary: {
      total: findings.length,
      failed: findings.filter((finding) => !finding.pass).length,
      consoleErrors: consoleErrors.length,
    },
  };

  const reportPath = path.join(outDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  await closeWithTimeout(() => browser.close(), 'browser', 5000);

  if (reportLogMode === 'full') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify({
      url,
      generatedAt: report.generatedAt,
      report: path.relative(process.cwd(), reportPath).replace(/\\/g, '/'),
      screenshotMode,
      summary: report.summary,
    }, null, 2));
  }

  process.exit(report.summary.failed > 0 || report.summary.consoleErrors > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
