import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-frontend-layout-audit';
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { id: 'desktop', width: 1440, height: 960, isMobile: false },
  { id: 'short', width: 1366, height: 720, isMobile: false },
  { id: 'mobile', width: 390, height: 844, isMobile: true },
];

const scenarios = [
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
  { id: 'reward-screen', root: '#reward-screen', title: 'Reward' },
  { id: 'shop-screen', root: '#shop-screen', title: 'Shop' },
  { id: 'achievements-screen', root: '#achievements-screen', title: 'Achievements' },
  { id: 'inheritance-screen', root: '#inheritance-screen', title: 'Inheritance' },
  { id: 'game-over-screen', root: '#game-over-screen', title: 'Game Over' },
  { id: 'pvp-result-overlay', root: '#pvp-result-overlay', title: 'PVP Result Overlay' },
  { id: 'event-modal', root: '#event-modal', title: 'Event Modal' },
  { id: 'remove-card-modal', root: '#remove-card-modal', title: 'Remove Card Modal' },
  { id: 'settings-modal', root: '#settings-modal', title: 'Settings Modal' },
  { id: 'auth-modal', root: '#auth-modal', title: 'Auth Modal' },
  { id: 'save-conflict-modal', root: '#save-conflict-modal', title: 'Save Conflict Modal' },
  { id: 'save-slots-modal', root: '#save-slots-modal', title: 'Save Slots Modal' },
  { id: 'deck-modal', root: '#deck-modal', title: 'Deck Modal' },
  { id: 'treasure-bag-modal', root: '#treasure-bag-modal', title: 'Treasure Bag Modal' },
  { id: 'card-modal', root: '#card-modal', title: 'Card Detail Modal' },
  { id: 'dynamic-card-detail-modal', root: '#card-detail-modal', title: 'Dynamic Card Detail Modal' },
  { id: 'skill-confirm-modal', root: '#skill-confirm-modal', title: 'Skill Confirm Modal' },
  { id: 'treasure-detail-modal', root: '#treasure-detail-modal', title: 'Treasure Detail Modal' },
  { id: 'law-detail-modal', root: '#law-detail-modal', title: 'Law Detail Modal' },
  { id: 'ring-modal', root: '#ring-modal', title: 'Fate Ring Modal' },
  { id: 'reward-modal', root: '#reward-modal', title: 'Reward Popup Modal' },
  { id: 'confirm-modal', root: '#generic-confirm-modal', title: 'Confirm Modal' },
  { id: 'alert-modal', root: '#generic-alert-modal', title: 'Alert Modal' },
  { id: 'treasure-bag-alert-modal', root: '#generic-alert-modal', title: 'Treasure Bag Alert Stack' },
  { id: 'purification-modal', root: '#purification-modal', title: 'Purification Modal' },
];

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

async function waitForPaint(page) {
  await page.waitForTimeout(120);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
    const treasureSamples = () => {
      const source = allTreasures();
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

    const cleanup = () => {
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
      if (game.player) game.player.getStealBonus = () => 0;
      game.currentBattleNode = { type: 'elite', id: 880101, completed: false };
      game.stealAttempted = false;
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

    const showMapProbe = () => {
      ensureGame();
      if (typeof game.startRealm === 'function') {
        game.startRealm(1, false);
      } else {
        game.showScreen('map-screen');
      }
    };

    const showMapToolsProbe = () => {
      showMapProbe();
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

    const showMapExpeditionIntelProbe = () => {
      ensureGame();
      if (typeof game.initializeExpeditionForRealm === 'function') {
        game.initializeExpeditionForRealm(game.player?.realm || 1, true);
      }
      game.showScreen('map-screen');
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

    const clickMapHeaderToggle = (action) => {
      showMapProbe();
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
      const modal = document.getElementById('save-conflict-modal');
      const local = document.getElementById('local-save-info');
      const cloud = document.getElementById('cloud-save-info');
      if (local) local.textContent = '林风 · 第 7 重天 · 42 分钟前更新，法则 12 / 法宝 7。';
      if (cloud) cloud.textContent = '云端：无尽第 2 轮 · 道韵 1280 · 今日同步。';
      if (modal) modal.classList.add('active');
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
      const treasure = allTreasures()[0];
      if (treasure && typeof game.showTreasureDetail === 'function') game.showTreasureDetail(treasure, true);
      else document.getElementById('treasure-detail-modal')?.classList.add('active');
    };

    const activateLawDetailModal = () => {
      ensureGame();
      game.showScreen('collection');
      const law = allLaws()[0];
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

    cleanup();

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
        showMapProbe();
        break;
      case 'map-screen-tools':
        showMapToolsProbe();
        break;
      case 'map-screen-intel-toggle':
        setupResult = clickMapHeaderToggle('toggle-map-intel');
        if (!setupResult.ok) return setupResult;
        break;
      case 'map-screen-tools-toggle':
        setupResult = clickMapHeaderToggle('toggle-map-tools');
        if (!setupResult.ok) return setupResult;
        break;
      case 'map-screen-expedition-intel-click':
        setupResult = showMapExpeditionIntelProbe();
        if (!setupResult.ok) return setupResult;
        break;
      case 'battle-screen':
        showBattleProbe();
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
        activateSaveConflictModal();
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
      treasureBagAlertProbe = {
        treasureBagVisible: !!(treasureBag && isVisible(treasureBag)),
        alertContentVisible: !!(alertContent && isVisible(alertContent)),
        okButtonVisible: !!(okButton && isVisible(okButton)),
        okButtonTopHit: !!(okButton && topAtOk && (topAtOk === okButton || okButton.contains(topAtOk))),
        alertZ,
        bagZ,
        topAtOk: selectorFor(topAtOk),
      };
      if (!treasureBagAlertProbe.treasureBagVisible || !treasureBagAlertProbe.alertContentVisible || !treasureBagAlertProbe.okButtonVisible || !treasureBagAlertProbe.okButtonTopHit || alertZ <= bagZ) {
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
      dynamicCardDetailProbe = {
        containerVisible: !!(container && isVisible(container)),
        previewCardVisible: !!(previewCard && isVisible(previewCard)),
        closeButtonVisible: !!(closeButton && isVisible(closeButton)),
        summaryRowCount: summaryRows.length,
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

      if (isInteractive && style.overflow !== 'visible' && !isIntentionallyClamped(el)) {
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

async function inspectMapNodeClickability(page, scenarioId) {
  if (!['map-screen', 'map-screen-expedition-intel-click'].includes(scenarioId)) {
    return { ok: true, skipped: true };
  }

  const selector = '#map-screen .map-node-v3.current, #map-screen .map-node-v3.available, #map-screen .map-node-v3:not(.locked)';
  try {
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
      eventOpen: !!document.querySelector('#event-modal.active'),
      battleActive: !!document.querySelector('#battle-screen.active'),
    }));
    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 520) {
      await page.touchscreen.tap(target.point.x, target.point.y);
    } else {
      await page.mouse.click(target.point.x, target.point.y);
    }
    await waitForPaint(page);
    const after = await page.evaluate(() => ({
      mode: document.body?.dataset?.currentScreen || window.game?.currentScreen || '',
      eventOpen: !!document.querySelector('#event-modal.active'),
      battleActive: !!document.querySelector('#battle-screen.active'),
    }));
    return {
      ok: true,
      skipped: false,
      target,
      before,
      after,
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
      let prepareResult = null;
      try {
        prepareResult = await prepareScenario(page, scenario.id);
        await waitForPaint(page);
      } catch (err) {
        add(viewport.id, scenario.id, false, JSON.stringify({
          type: 'setup-error',
          message: err?.message || String(err),
        }));
        continue;
      }

      const screenshotPath = path.join(outDir, screenshotName(viewport.id, scenario.id));
      await safeAuditScreenshot(page, screenshotPath, `frontend-layout-${viewport.id}-${scenario.id}`, {
        fullPage: false,
        timeout: 8000,
      });

      const rootSelector = prepareResult?.rootSelector || scenario.root;
      const result = await inspectLayout(page, rootSelector, scenario.id);
      const overlayStress = await inspectBattleLogStress(page, rootSelector, scenario.id);
      const mapExpeditionIntel = await inspectMapExpeditionIntelPersistence(page, scenario.id);
      const mapNodeClick = await inspectMapNodeClickability(page, scenario.id);
      let overlayStressScreenshot = null;
      if (!overlayStress.skipped) {
        const overlayScreenshotPath = path.join(outDir, screenshotName(viewport.id, `${scenario.id}-battle-log-stress`));
        await safeAuditScreenshot(page, overlayScreenshotPath, `frontend-layout-${viewport.id}-${scenario.id}-battle-log-stress`, {
          fullPage: false,
          timeout: 8000,
        });
        overlayStressScreenshot = path.relative(process.cwd(), overlayScreenshotPath).replace(/\\/g, '/');
      }
      const detail = {
        title: scenario.title,
        setup: prepareResult,
        screenshot: path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/'),
        overlayStress,
        mapExpeditionIntel,
        mapNodeClick,
        overlayStressScreenshot,
        ...result,
      };
      add(viewport.id, scenario.id, !!prepareResult?.ok && !!result?.ok && !!overlayStress?.ok && !!mapExpeditionIntel?.ok && !!mapNodeClick?.ok, JSON.stringify(detail));
    }

    try {
      const switchGuard = await inspectBattleOverlaySwitchGuard(page);
      const screenshotPath = path.join(outDir, screenshotName(viewport.id, 'battle-overlay-switch-guard'));
      await safeAuditScreenshot(page, screenshotPath, `frontend-layout-${viewport.id}-battle-overlay-switch-guard`, {
        fullPage: false,
        timeout: 8000,
      });
      add(viewport.id, 'battle-overlay-switch-guard', !!switchGuard?.ok, JSON.stringify({
        title: 'Battle Overlay Switch Guard',
        screenshot: path.relative(process.cwd(), screenshotPath).replace(/\\/g, '/'),
        ...switchGuard,
      }));
    } catch (err) {
      add(viewport.id, 'battle-overlay-switch-guard', false, JSON.stringify({
        title: 'Battle Overlay Switch Guard',
        type: 'setup-error',
        message: err?.message || String(err),
      }));
    }

    await page.close();
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

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();

  if (report.summary.failed > 0 || report.summary.consoleErrors > 0) {
    process.exitCode = 1;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
