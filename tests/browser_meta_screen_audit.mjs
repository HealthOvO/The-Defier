import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-meta-screen-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_(CLOSED|RESET)/.test(message)) return;
  consoleErrors.push(message);
}

function rectObj(rect) {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  page.on('pageerror', (err) => {
    recordConsoleError(String(err));
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem('theDefierLegacyV1', JSON.stringify({
        essence: 40,
        spent: 0,
        upgrades: {},
        lastPreset: null,
      }));
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const rewardProbe = await page.evaluate(async () => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    if (typeof game.createDefaultSeasonVerificationState === 'function') {
      game.seasonVerificationState = game.createDefaultSeasonVerificationState();
    } else if (game.seasonVerificationState && typeof game.seasonVerificationState === 'object') {
      game.seasonVerificationState.claimedLaneRewards = {};
    }
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player?.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    if (game.player) {
      game.player.getStealBonus = () => 0;
    }
    const rewardLineageSlate = {
      id: 'reward_lineage_probe',
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
        highlightLine: '本章答卷已经压成可复盘的观测样本。'
      },
      practiceTopic: {
        id: 'reward_lineage_probe_topic',
        sourceRecordId: 'reward_lineage_probe_guide',
        sourceTitle: '星镜试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        goalLines: ['先走观星线再补事件收益']
      },
      observatoryLink: {
        sourceRecordId: 'reward_lineage_probe_guide',
        sourceTitle: '星镜试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        drillObjective: '连续两次走观星相关节点并维持控场稳定。'
      },
      timestamp: Date.now()
    };
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive([rewardLineageSlate]);
    } else {
      game.runSlateArchive = [rewardLineageSlate];
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    if (typeof game.recordRunPathBossSample === 'function' && typeof game.player?.getRunPathMeta === 'function') {
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'danZun',
        name: '丹尊',
        icon: '🗿',
        realm: 6
      }, {
        characterId: 'linFeng',
        turns: 4,
        completedAt: Date.now() - 1000
      });
    }
    if (typeof game.buildObservatoryTrainingFocusFromSlate === 'function' && typeof game.setObservatoryTrainingFocus === 'function') {
      const focus = game.buildObservatoryTrainingFocusFromSlate(rewardLineageSlate);
      if (focus) game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    if (typeof game.normalizeFateAftereffectState === 'function') {
      game.fateAftereffectState = game.normalizeFateAftereffectState({
        records: [
          {
            recordId: 'reward_aftereffect_pending',
            icon: '🧭',
            name: '星镜余痕',
            sourceRunId: rewardLineageSlate.id,
            sourceAgendaId: 'reward_aftereffect_agenda',
            sourceLabel: '星镜稳线',
            sourceContractLabel: '星镜锁线',
            templateId: 'route_bias',
            outcomeId: 'contract_success',
            chapterIndex: rewardLineageSlate.chapterIndex,
            chapterName: rewardLineageSlate.chapterName,
            durationChapters: 2,
            positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
            negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
            summaryLine: '星镜余痕：契约兑现后，观星锁线会继续牵引下一章路线。',
            detailLine: '来源：星镜稳线 · 契约「星镜锁线」｜正向：观星 / 事件 / 裂隙更容易连成同轴路线。｜代价：战斗与营地窗口会略少，路线更容易被细线样本牵走。',
            createdAt: Date.now() - 600
          }
        ],
        history: [],
        lastResolved: {
          recordId: 'reward_aftereffect_pending',
          icon: '🧭',
          name: '星镜余痕',
          sourceRunId: rewardLineageSlate.id,
          sourceAgendaId: 'reward_aftereffect_agenda',
          sourceLabel: '星镜稳线',
          sourceContractLabel: '星镜锁线',
          templateId: 'route_bias',
          outcomeId: 'contract_success',
          chapterIndex: rewardLineageSlate.chapterIndex,
          chapterName: rewardLineageSlate.chapterName,
          durationChapters: 2,
          positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
          negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
          summaryLine: '星镜余痕：契约兑现后，观星锁线会继续牵引下一章路线。',
          detailLine: '来源：星镜稳线 · 契约「星镜锁线」｜正向：观星 / 事件 / 裂隙更容易连成同轴路线。｜代价：战斗与营地窗口会略少，路线更容易被细线样本牵走。',
          createdAt: Date.now() - 600
        }
      });
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
            progressText: `${target}/${target}`
          };
        })
      });
      const rewardLaneBoardSource = rewardLaneBoard
        ? {
          ...rewardLaneBoard,
          lanes: (rewardLaneBoard.lanes || []).map((lane) => lane.id === 'training' ? completeLane(lane) : lane)
        }
        : null;
      if (rewardLaneBoardSource) {
        game.getSeasonBoardSnapshot = () => game.normalizeSeasonBoardSnapshot(rewardLaneBoardSource);
        game.lastExpeditionRewardMeta = {
          ...(game.lastExpeditionRewardMeta || {}),
          seasonBoard: game.getSeasonBoardSnapshot()
        };
      }
    }
    game.currentBattleNode = { type: 'elite', id: 990001, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_counter_lattice',
        themeName: '轮段·反制晶格',
        tierStage: 2,
        goldBonus: 18,
        ringExpBonus: 9,
      },
      squad: {
        squadId: 'squad_hex_weave',
        squadName: '咒织链阵',
        goldBonus: 14,
        ringExpBonus: 11,
        synergyThemeName: '轮段·反制晶格',
      },
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
    game.showRewardScreen(145, true, { stealLaw: lawId, stealChance: 1 }, 32, { insight: 8, karma: 3 });

    const screen = document.getElementById('reward-screen');
    const layout = document.querySelector('.reward-layout');
    const main = document.querySelector('.reward-main-column');
    const side = document.querySelector('.reward-side-column');
    const actions = document.querySelector('.reward-actions');
    const summary = document.querySelector('.reward-summary-card');
    const narrative = document.getElementById('reward-narrative-brief');
    const title = document.querySelector('#reward-screen .reward-title');
    const subtitle = document.querySelector('#reward-screen .reward-subtitle');
    const expeditionPanel = document.getElementById('reward-expedition-meta');
    const cards = Array.from(document.querySelectorAll('#reward-cards .card'));
    const skipBtn = document.querySelector('.skip-reward-btn');
    const expectedSkipCost = typeof game.getRewardSkipCost === 'function'
      ? game.getRewardSkipCost()
      : 50 * Math.max(1, Math.floor(Number(game.player?.realm) || 1));

    if (!screen || !layout || !main || !side || !actions || !summary || cards.length < 2 || !skipBtn) {
      return { ok: false, reason: 'missing_reward_nodes' };
    }

    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const nodeText = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const viewportWidth = window.innerWidth;
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    const summaryRect = toRect(summary);
    const actionsRect = toRect(actions);
    const cardRects = cards.map((card) => toRect(card));
    const cardsInsideMain = cardRects.every((rect) => rect.left >= mainRect.left - 4 && rect.right <= mainRect.right + 4);
    const cardsAboveActions = cardRects.every((rect) => rect.bottom < actionsRect.bottom);
    const rewardExpeditionText = expeditionPanel?.textContent?.replace(/\s+/g, ' ').trim() || '';
    let rewardPayload = {};
    try {
      rewardPayload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      rewardPayload = {};
    }
    const rewardLineage = rewardPayload?.reward?.expedition?.lineage || null;
    const rewardAftereffects = rewardPayload?.reward?.expedition?.aftereffects || null;
    const rewardSeasonBoard = rewardPayload?.reward?.expedition?.seasonBoard || null;
    const rewardAftereffectText = (document.querySelector('[data-fate-aftereffect-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardAftereffectChipText = Array.from(document.querySelectorAll('[data-fate-aftereffect-reward-chip]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const rewardHeaderOutcome = screen?.dataset?.rewardHeaderOutcome || '';
    const rewardNextActionSource = screen?.dataset?.rewardNextActionSource || '';
    const rewardSeasonBoardActionCount = expeditionPanel?.querySelectorAll('[data-season-board-action-reward="true"]').length || 0;
    const rewardSeasonBoardText = (document.querySelector('[data-season-board-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardSettlementText = (document.querySelector('[data-season-board-settlement-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardActionText = (document.querySelector('[data-season-board-action-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardVerificationText = (document.querySelector('[data-season-board-verification-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardNextTaskText = (document.querySelector('[data-season-board-next-task-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierText = (document.querySelector('[data-season-board-frontier-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierDecreeText = (document.querySelector('[data-season-board-frontier-decree-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierChronicleText = (document.querySelector('[data-season-board-frontier-chronicle-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierCouncilText = (document.querySelector('[data-season-board-frontier-council-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardNextChipText = (expeditionPanel?.querySelector('[data-season-board-chip="next"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierChipText = (expeditionPanel?.querySelector('[data-season-board-chip="frontier"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierDecreeChipText = (expeditionPanel?.querySelector('[data-season-board-chip="frontier-decree"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierChronicleChipText = (expeditionPanel?.querySelector('[data-season-board-chip="frontier-chronicle"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierCouncilChipText = (expeditionPanel?.querySelector('[data-season-board-chip="frontier-council"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFrontierNodeCount = expeditionPanel?.querySelectorAll('[data-season-board-frontier-reward="true"]').length || 0;
    const rewardSeasonBoardFrontierDecreeNodeCount = expeditionPanel?.querySelectorAll('[data-season-board-frontier-decree-reward="true"]').length || 0;
    const rewardSeasonBoardFrontierChronicleNodeCount = expeditionPanel?.querySelectorAll('[data-season-board-frontier-chronicle-reward="true"]').length || 0;
    const rewardSeasonBoardFrontierCouncilNodeCount = expeditionPanel?.querySelectorAll('[data-season-board-frontier-council-reward="true"]').length || 0;
    const rewardSeasonBoardLaneRewardNodes = Array.from(expeditionPanel?.querySelectorAll('[data-season-board-lane-reward="true"]') || []);
    const rewardSeasonBoardLaneRewardButtons = Array.from(expeditionPanel?.querySelectorAll('[data-season-board-lane-reward-claim="true"]') || []);
    const rewardSeasonBoardLaneRewardText = rewardSeasonBoardLaneRewardNodes.map(nodeText).join(' ').trim();
    const rewardSeasonBoardLaneRewardChipText = (expeditionPanel?.querySelector('[data-season-board-chip="lane-reward"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardLaneRewardClaimableCount = Math.max(0, Math.floor(Number(expeditionPanel?.dataset?.seasonBoardLaneRewardClaimableCount) || 0));
    const rewardSeasonBoardTrainingRewardNode = expeditionPanel?.querySelector('[data-season-board-lane-reward="true"][data-season-board-lane-reward-lane-id="training"]') || null;
    const rewardSeasonBoardTrainingRewardButton = rewardSeasonBoardTrainingRewardNode?.querySelector('[data-season-board-lane-reward-claim="true"]') || null;
    const rewardPrimaryHandoff = expeditionPanel?.querySelector('[data-season-board-action-reward="true"] [data-season-board-handoff-cta="true"]') || null;
    const rewardHandoffButtonCount = expeditionPanel?.querySelectorAll('[data-season-board-handoff-cta="true"]').length || 0;
    const rewardPrimaryHandoffText = (rewardPrimaryHandoff?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardChipText = Array.from(expeditionPanel?.querySelectorAll('[data-season-board-chip]') || [])
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const expeditionSeasonBoard = rewardPayload?.expedition?.seasonBoard || null;
    const chapterSeasonBoard = rewardPayload?.map?.chapter?.seasonBoard || null;
    const rewardSeasonBoardTrainingReward = (rewardSeasonBoard?.laneRewards || []).find((reward) => reward?.laneId === 'training') || null;
    const rewardSeasonBoardExpeditionReward = (rewardSeasonBoard?.laneRewards || []).find((reward) => reward?.laneId === 'expedition') || null;
    const rewardLaneRewardInsightBefore = Math.max(0, Math.floor(Number(game.player?.heavenlyInsight) || 0));
    const rewardLaneRewardRingExpBefore = Math.max(0, Math.floor(Number(game.player?.fateRing?.exp) || 0));
    if (rewardSeasonBoardTrainingRewardButton) {
      rewardSeasonBoardTrainingRewardButton.click();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    let rewardPayloadAfterLaneRewardClaim = {};
    try {
      rewardPayloadAfterLaneRewardClaim = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      rewardPayloadAfterLaneRewardClaim = {};
    }
    const rewardLaneRewardClaim = game.lastSeasonBoardLaneRewardClaim || null;
    const rewardSeasonBoardAfterLaneRewardClaim = rewardPayloadAfterLaneRewardClaim?.reward?.expedition?.seasonBoard || null;
    const expeditionSeasonBoardAfterLaneRewardClaim = rewardPayloadAfterLaneRewardClaim?.expedition?.seasonBoard || null;
    const chapterSeasonBoardAfterLaneRewardClaim = rewardPayloadAfterLaneRewardClaim?.map?.chapter?.seasonBoard || null;
    const rewardSeasonBoardTrainingRewardAfterClaim = (rewardSeasonBoardAfterLaneRewardClaim?.laneRewards || []).find((reward) => reward?.laneId === 'training') || null;
    const rewardSeasonBoardTrainingRewardNodeAfterClaim = expeditionPanel?.querySelector('[data-season-board-lane-reward="true"][data-season-board-lane-reward-lane-id="training"]') || null;
    const rewardSeasonBoardTrainingRewardButtonAfterClaim = rewardSeasonBoardTrainingRewardNodeAfterClaim?.querySelector('[data-season-board-lane-reward-claim="true"]') || null;
    const rewardLaneRewardInsightAfter = Math.max(0, Math.floor(Number(game.player?.heavenlyInsight) || 0));
    const rewardLaneRewardRingExpAfter = Math.max(0, Math.floor(Number(game.player?.fateRing?.exp) || 0));

    return {
      ok:
        screen.dataset.stealState === 'ready' &&
        mainRect.left < sideRect.left &&
        sideRect.width >= 320 &&
        summaryRect.bottom <= actionsRect.top + 24 &&
        cardsInsideMain &&
        cardsAboveActions &&
        /赛季裁定|章节归卷|命盘档案|命盘问真/.test(narrative?.textContent || '') &&
        /赛季裁定|章节归卷/.test(title?.textContent || '') &&
        /清账回流|外场验证|扩样|锁线|主练方向|答卷评级|训练建议/.test(subtitle?.textContent || '') &&
        /命盘谱系/.test(rewardExpeditionText) &&
        /谱系留痕|谱系校准/.test(rewardExpeditionText) &&
        /界痕后效/.test(rewardExpeditionText) &&
        /赛季天道盘/.test(rewardExpeditionText) &&
        rewardAftereffectText.length > 0 &&
        rewardSeasonBoardText.length > 0 &&
        rewardSeasonBoardSettlementText.length > 0 &&
        rewardSeasonBoardActionText.length > 0 &&
        rewardSeasonBoardFrontierText.length > 0 &&
        rewardSeasonBoardFrontierDecreeText.length > 0 &&
        rewardSeasonBoardFrontierChronicleText.length > 0 &&
        rewardSeasonBoardFrontierCouncilText.length > 0 &&
        rewardSeasonBoardLaneRewardText.length > 0 &&
        /后效|状态|生效/.test(rewardAftereffectChipText) &&
        /阶段|主轴|进度|行动|战线|法旨|史卷|会审/.test(rewardSeasonBoardChipText) &&
        /战线/.test(rewardSeasonBoardFrontierChipText) &&
        /法旨/.test(rewardSeasonBoardFrontierDecreeChipText) &&
        /史卷/.test(rewardSeasonBoardFrontierChronicleChipText) &&
        /会审/.test(rewardSeasonBoardFrontierCouncilChipText) &&
        /分线结题赏/.test(rewardSeasonBoardChipText) &&
        !!rewardLineage &&
        !!rewardLineage.summaryLine &&
        !!rewardAftereffects &&
        !!rewardAftereffects.summaryLine &&
        !!rewardAftereffects.currentStatusLine &&
        !!rewardAftereffects.primary &&
        !!rewardAftereffects.primary.templateLabel &&
        !!rewardSeasonBoard &&
        !!rewardSeasonBoard.summaryLine &&
        !!rewardSeasonBoard.settlement &&
        !!rewardSeasonBoard.settlement.outcomeLabel &&
        !!rewardSeasonBoard.progress &&
        !!rewardSeasonBoard.progress.progressText &&
        !!rewardSeasonBoard.nextTask &&
        rewardSeasonBoard.settlement.outcomeId === 'locking_sheet' &&
        rewardSeasonBoard.nextTask.id === 'season_commitment' &&
        rewardSeasonBoard.nextTask.anchorSection === 'sanctum' &&
        rewardSeasonBoard.nextTask.source === 'settlement' &&
        rewardSeasonBoard.nextTask.sourceId === rewardSeasonBoard.settlement.id &&
        rewardSeasonBoard.nextTask.taskSource === 'lane' &&
        rewardSeasonBoard.nextTask.taskSourceId === rewardSeasonBoard.nextTask.id &&
        rewardSeasonBoard.nextTask.actionType === 'collection' &&
        rewardSeasonBoard.nextTask.actionValue === 'sanctum' &&
        !!rewardSeasonBoard.frontier &&
        rewardSeasonBoard.frontier.primaryFrontId === 'expedition' &&
        rewardSeasonBoard.frontier.primaryFrontLabel &&
        rewardSeasonBoard.frontier.statusId &&
        rewardSeasonBoard.frontier.actionLaneId === rewardSeasonBoard.frontier.primaryFrontId &&
        !!rewardSeasonBoard.frontier.actionTargetLabel &&
        !!rewardSeasonBoard.frontier.actionLine &&
        !!rewardSeasonBoard.frontier.decree &&
        rewardSeasonBoard.frontier.decree.laneId === rewardSeasonBoard.frontier.primaryFrontId &&
        rewardSeasonBoard.frontier.decree.actionLaneId === rewardSeasonBoard.frontier.actionLaneId &&
        rewardSeasonBoard.frontier.decree.actionTargetLabel === rewardSeasonBoard.frontier.actionTargetLabel &&
        rewardSeasonBoard.frontier.decree.statusId === rewardSeasonBoard.frontier.statusId &&
        !!rewardSeasonBoard.frontier.decree.summaryLine &&
        !!rewardSeasonBoard.frontier.decree.constraintLine &&
        !!rewardSeasonBoard.frontier.decree.successLine &&
        !!rewardSeasonBoard.frontier.chronicle &&
        rewardSeasonBoard.frontier.chronicle.laneId === rewardSeasonBoard.frontier.primaryFrontId &&
        rewardSeasonBoard.frontier.chronicle.actionLaneId === rewardSeasonBoard.frontier.actionLaneId &&
        rewardSeasonBoard.frontier.chronicle.actionTargetLabel === rewardSeasonBoard.frontier.actionTargetLabel &&
        rewardSeasonBoard.frontier.chronicle.statusId === rewardSeasonBoard.frontier.statusId &&
        !!rewardSeasonBoard.frontier.chronicle.summaryLine &&
        !!rewardSeasonBoard.frontier.chronicle.currentEntryLine &&
        !!rewardSeasonBoard.frontier.chronicle.progressLine &&
        !!rewardSeasonBoard.frontier.council &&
        rewardSeasonBoard.frontier.council.laneId === rewardSeasonBoard.frontier.primaryFrontId &&
        rewardSeasonBoard.frontier.council.statusId === rewardSeasonBoard.frontier.statusId &&
        !!rewardSeasonBoard.frontier.council.summaryLine &&
        !!rewardSeasonBoard.frontier.council.verdictLine &&
        Array.isArray(rewardSeasonBoard.frontier.council.laneOpinions) &&
        rewardSeasonBoard.frontier.council.laneOpinions.length === 3 &&
        !Object.prototype.hasOwnProperty.call(rewardSeasonBoard.frontier.council, 'actionType') &&
        !Object.prototype.hasOwnProperty.call(rewardSeasonBoard.frontier.council, 'actionValue') &&
        !Object.prototype.hasOwnProperty.call(rewardSeasonBoard.frontier.council, 'ctaLabel') &&
        Array.isArray(rewardSeasonBoard.frontier.items) &&
        rewardSeasonBoard.frontier.items.length === 3 &&
        rewardSeasonBoardFrontierNodeCount === 1 &&
        rewardSeasonBoardFrontierDecreeNodeCount === 1 &&
        rewardSeasonBoardFrontierChronicleNodeCount === 1 &&
        rewardSeasonBoardFrontierCouncilNodeCount === 1 &&
        rewardSeasonBoardFrontierText.includes(rewardSeasonBoard.frontier.primaryFrontShortLabel || rewardSeasonBoard.frontier.primaryFrontLabel || '') &&
        rewardSeasonBoardFrontierDecreeText.includes(rewardSeasonBoard.frontier.decree.laneLabel || rewardSeasonBoard.frontier.primaryFrontShortLabel || '') &&
        rewardSeasonBoardFrontierChronicleText.includes(rewardSeasonBoard.frontier.chronicle.laneLabel || rewardSeasonBoard.frontier.primaryFrontShortLabel || '') &&
        rewardSeasonBoardFrontierCouncilText.includes(rewardSeasonBoard.frontier.council.laneLabel || rewardSeasonBoard.frontier.primaryFrontShortLabel || '') &&
        expeditionPanel?.dataset?.seasonBoardFrontierDecree === rewardSeasonBoard.frontier.decree.id &&
        expeditionPanel?.dataset?.seasonBoardFrontierChronicle === rewardSeasonBoard.frontier.chronicle.id &&
        expeditionPanel?.dataset?.seasonBoardFrontierCouncil === rewardSeasonBoard.frontier.council.id &&
        expeditionPanel?.dataset?.seasonBoardFrontier === rewardSeasonBoard.frontier.primaryFrontId &&
        expeditionPanel?.dataset?.seasonBoardFrontierPressure === rewardSeasonBoard.frontier.statusId &&
        Array.isArray(rewardSeasonBoard.laneRewards) &&
        rewardSeasonBoard.laneRewards.length === 3 &&
        rewardSeasonBoard.laneRewardSummary?.totalCount === rewardSeasonBoard.laneRewards.length &&
        rewardSeasonBoard.laneRewardSummary?.readyCount === 1 &&
        rewardSeasonBoard.laneRewardSummary?.claimableCount === 1 &&
        rewardSeasonBoard.laneRewardSummary?.claimedCount === 0 &&
        rewardSeasonBoardLaneRewardNodes.length === rewardSeasonBoard.laneRewardSummary.totalCount &&
        rewardSeasonBoardLaneRewardButtons.length === rewardSeasonBoard.laneRewardSummary.totalCount &&
        rewardSeasonBoardLaneRewardClaimableCount === rewardSeasonBoard.laneRewardSummary.claimableCount &&
        rewardSeasonBoardTrainingReward?.claimable === true &&
        rewardSeasonBoardTrainingReward?.claimed === false &&
        rewardSeasonBoardTrainingReward?.status === 'claimable' &&
        /天机 \+1/.test(rewardSeasonBoardTrainingReward?.rewardLine || '') &&
        /命环经验 \+8/.test(rewardSeasonBoardTrainingReward?.rewardLine || '') &&
        rewardSeasonBoardExpeditionReward?.claimable === false &&
        rewardSeasonBoardTrainingRewardNode?.dataset?.seasonBoardLaneRewardStatus === 'claimable' &&
        rewardSeasonBoardTrainingRewardButton?.dataset?.seasonBoardLaneRewardClaimable === 'true' &&
        rewardSeasonBoardTrainingRewardButton?.disabled === false &&
        rewardSeasonBoardLaneRewardText.includes(rewardSeasonBoardTrainingReward?.laneLabel || '') &&
        rewardSeasonBoardLaneRewardText.includes(rewardSeasonBoardTrainingReward?.rewardLine || '') &&
        rewardSeasonBoardLaneRewardChipText.includes('1/3') &&
        rewardLaneRewardClaim?.ok === true &&
        rewardLaneRewardClaim?.laneId === 'training' &&
        rewardLaneRewardClaim?.gains?.insight === 1 &&
        rewardLaneRewardClaim?.gains?.ringExp === 8 &&
        rewardLaneRewardInsightAfter === rewardLaneRewardInsightBefore + 1 &&
        rewardLaneRewardRingExpAfter >= rewardLaneRewardRingExpBefore + 8 &&
        rewardSeasonBoardTrainingRewardAfterClaim?.claimed === true &&
        rewardSeasonBoardTrainingRewardAfterClaim?.claimable === false &&
        rewardSeasonBoardTrainingRewardAfterClaim?.status === 'claimed' &&
        rewardSeasonBoardAfterLaneRewardClaim?.laneRewardSummary?.claimableCount === 0 &&
        rewardSeasonBoardAfterLaneRewardClaim?.laneRewardSummary?.claimedCount === 1 &&
        rewardSeasonBoardTrainingRewardNodeAfterClaim?.dataset?.seasonBoardLaneRewardStatus === 'claimed' &&
        rewardSeasonBoardTrainingRewardButtonAfterClaim?.dataset?.seasonBoardLaneRewardClaimable === 'false' &&
        rewardSeasonBoardTrainingRewardButtonAfterClaim?.disabled === true &&
        JSON.stringify(rewardSeasonBoardAfterLaneRewardClaim?.laneRewards || []) === JSON.stringify(expeditionSeasonBoardAfterLaneRewardClaim?.laneRewards || []) &&
        JSON.stringify(rewardSeasonBoardAfterLaneRewardClaim?.laneRewards || []) === JSON.stringify(chapterSeasonBoardAfterLaneRewardClaim?.laneRewards || []) &&
        JSON.stringify(rewardSeasonBoardAfterLaneRewardClaim?.laneRewardSummary || null) === JSON.stringify(expeditionSeasonBoardAfterLaneRewardClaim?.laneRewardSummary || null) &&
        JSON.stringify(rewardSeasonBoardAfterLaneRewardClaim?.laneRewardSummary || null) === JSON.stringify(chapterSeasonBoardAfterLaneRewardClaim?.laneRewardSummary || null) &&
        rewardSeasonBoard.nextTask.ctaLabel === rewardSeasonBoard.nextWeekGoal?.buttonLabel &&
        rewardSeasonBoard.nextWeekGoal?.source === rewardSeasonBoard.nextTask.source &&
        rewardSeasonBoard.nextWeekGoal?.sourceId === rewardSeasonBoard.nextTask.sourceId &&
        rewardSeasonBoard.nextWeekGoal?.taskSource === rewardSeasonBoard.nextTask.taskSource &&
        rewardSeasonBoard.nextWeekGoal?.taskSourceId === rewardSeasonBoard.nextTask.taskSourceId &&
        rewardSeasonBoard.nextWeekGoal?.action === rewardSeasonBoard.nextTask.actionType &&
        rewardSeasonBoard.nextWeekGoal?.value === rewardSeasonBoard.nextTask.actionValue &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffSourceKey === 'nextTask' &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffAction === rewardSeasonBoard.nextWeekGoal?.action &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffValue === rewardSeasonBoard.nextWeekGoal?.value &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffSource === rewardSeasonBoard.nextWeekGoal?.source &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffSourceId === rewardSeasonBoard.nextWeekGoal?.sourceId &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffTaskId === rewardSeasonBoard.nextWeekGoal?.taskId &&
        rewardPrimaryHandoffText === rewardSeasonBoard.nextWeekGoal?.buttonLabel &&
        rewardHandoffButtonCount === 1 &&
        rewardHeaderOutcome === rewardSeasonBoard.settlement.outcomeId &&
        rewardNextActionSource === 'nextTask' &&
        expeditionPanel?.dataset?.seasonBoardOutcome === 'locking_sheet' &&
        expeditionPanel?.dataset?.seasonBoardActionSource === 'nextTask' &&
        expeditionPanel?.dataset?.seasonBoardVerificationVisible === 'false' &&
        rewardSeasonBoardActionCount === 1 &&
        Array.isArray(rewardSeasonBoard.verificationOrders) &&
        rewardSeasonBoard.verificationOrders.length >= 1 &&
        rewardSeasonBoardText.includes(rewardSeasonBoard.settlement.outcomeLabel) &&
        rewardSeasonBoardSettlementText.includes(rewardSeasonBoard.settlement.outcomeLabel) &&
        rewardSeasonBoardActionText.includes(
          rewardSeasonBoard.nextTask?.hintLine
            || rewardSeasonBoard.nextTask?.label
            || ''
        ) &&
        rewardSeasonBoardNextTaskText.length > 0 &&
        rewardSeasonBoardNextChipText.includes(
          rewardSeasonBoard.nextTask?.label
            || ''
        ) &&
        !rewardSeasonBoardVerificationText &&
        !expeditionPanel?.querySelector('[data-season-board-chip="verification"]') &&
        !expeditionPanel?.querySelector('[data-season-board-chip="debt"]') &&
        !!expeditionSeasonBoard &&
        !!chapterSeasonBoard &&
        JSON.stringify(rewardSeasonBoard.nextTask || null) === JSON.stringify(expeditionSeasonBoard.nextTask || null) &&
        JSON.stringify(rewardSeasonBoard.nextTask || null) === JSON.stringify(chapterSeasonBoard.nextTask || null) &&
        JSON.stringify(rewardSeasonBoard.nextWeekGoal || null) === JSON.stringify(expeditionSeasonBoard.nextWeekGoal || null) &&
        JSON.stringify(rewardSeasonBoard.nextWeekGoal || null) === JSON.stringify(chapterSeasonBoard.nextWeekGoal || null) &&
        JSON.stringify(rewardSeasonBoard.settlement || null) === JSON.stringify(expeditionSeasonBoard.settlement || null) &&
        JSON.stringify(rewardSeasonBoard.settlement || null) === JSON.stringify(chapterSeasonBoard.settlement || null) &&
        rewardSeasonBoard.progress?.progressText === expeditionSeasonBoard.progress?.progressText &&
        rewardSeasonBoard.progress?.progressText === chapterSeasonBoard.progress?.progressText &&
        JSON.stringify(rewardSeasonBoard.verificationOrders || []) === JSON.stringify(expeditionSeasonBoard.verificationOrders || []) &&
        JSON.stringify(rewardSeasonBoard.verificationOrders || []) === JSON.stringify(chapterSeasonBoard.verificationOrders || []) &&
        JSON.stringify(rewardSeasonBoard.frontier || null) === JSON.stringify(expeditionSeasonBoard.frontier || null) &&
        JSON.stringify(rewardSeasonBoard.frontier || null) === JSON.stringify(chapterSeasonBoard.frontier || null) &&
        JSON.stringify(rewardSeasonBoard.frontier?.decree || null) === JSON.stringify(expeditionSeasonBoard.frontier?.decree || null) &&
        JSON.stringify(rewardSeasonBoard.frontier?.decree || null) === JSON.stringify(chapterSeasonBoard.frontier?.decree || null) &&
        JSON.stringify(rewardSeasonBoard.frontier?.chronicle || null) === JSON.stringify(expeditionSeasonBoard.frontier?.chronicle || null) &&
        JSON.stringify(rewardSeasonBoard.frontier?.chronicle || null) === JSON.stringify(chapterSeasonBoard.frontier?.chronicle || null) &&
        JSON.stringify(rewardSeasonBoard.frontier?.council || null) === JSON.stringify(expeditionSeasonBoard.frontier?.council || null) &&
        JSON.stringify(rewardSeasonBoard.frontier?.council || null) === JSON.stringify(chapterSeasonBoard.frontier?.council || null) &&
        JSON.stringify(rewardSeasonBoard.laneRewards || []) === JSON.stringify(expeditionSeasonBoard.laneRewards || []) &&
        JSON.stringify(rewardSeasonBoard.laneRewards || []) === JSON.stringify(chapterSeasonBoard.laneRewards || []) &&
        JSON.stringify(rewardSeasonBoard.laneRewardSummary || null) === JSON.stringify(expeditionSeasonBoard.laneRewardSummary || null) &&
        JSON.stringify(rewardSeasonBoard.laneRewardSummary || null) === JSON.stringify(chapterSeasonBoard.laneRewardSummary || null) &&
        mainRect.right < viewportWidth &&
        sideRect.right <= viewportWidth &&
        (skipBtn.textContent || '').includes(`扣${expectedSkipCost}灵石`),
      stealState: screen.dataset.stealState || '',
      mainRect,
      sideRect,
      summaryRect,
      actionsRect,
      cardRects,
      titleText: title?.textContent?.replace(/\s+/g, ' ').trim() || '',
      narrativeText: narrative?.textContent?.replace(/\s+/g, ' ').trim() || '',
      subtitleText: subtitle?.textContent?.replace(/\s+/g, ' ').trim() || '',
      rewardHeaderOutcome,
      rewardNextActionSource,
      rewardSeasonBoardActionCount,
      rewardExpeditionText,
      rewardLineage,
      rewardAftereffects,
      rewardSeasonBoard,
      expeditionSeasonBoard,
      chapterSeasonBoard,
      rewardAftereffectText,
      rewardAftereffectChipText,
      rewardSeasonBoardText,
      rewardSeasonBoardSettlementText,
      rewardSeasonBoardActionText,
      rewardSeasonBoardVerificationText,
      rewardSeasonBoardNextTaskText,
      rewardSeasonBoardFrontierText,
      rewardSeasonBoardFrontierDecreeText,
      rewardSeasonBoardFrontierChronicleText,
      rewardSeasonBoardFrontierCouncilText,
      rewardSeasonBoardNextChipText,
      rewardSeasonBoardFrontierChipText,
      rewardSeasonBoardFrontierDecreeChipText,
      rewardSeasonBoardFrontierChronicleChipText,
      rewardSeasonBoardFrontierCouncilChipText,
      rewardSeasonBoardFrontierNodeCount,
      rewardSeasonBoardFrontierDecreeNodeCount,
      rewardSeasonBoardFrontierChronicleNodeCount,
      rewardSeasonBoardFrontierCouncilNodeCount,
      rewardSeasonBoardLaneRewardText,
      rewardSeasonBoardLaneRewardChipText,
      rewardSeasonBoardLaneRewardClaimableCount,
      rewardSeasonBoardTrainingReward,
      rewardSeasonBoardExpeditionReward,
      rewardSeasonBoardTrainingRewardButtonDataset: rewardSeasonBoardTrainingRewardButton ? { ...rewardSeasonBoardTrainingRewardButton.dataset } : null,
      rewardLaneRewardClaim,
      rewardSeasonBoardAfterLaneRewardClaim,
      rewardSeasonBoardTrainingRewardAfterClaim,
      rewardSeasonBoardTrainingRewardButtonAfterClaim: rewardSeasonBoardTrainingRewardButtonAfterClaim ? {
        dataset: { ...rewardSeasonBoardTrainingRewardButtonAfterClaim.dataset },
        text: nodeText(rewardSeasonBoardTrainingRewardButtonAfterClaim),
        disabled: rewardSeasonBoardTrainingRewardButtonAfterClaim.disabled
      } : null,
      rewardLaneRewardResources: {
        before: {
          insight: rewardLaneRewardInsightBefore,
          ringExp: rewardLaneRewardRingExpBefore
        },
        after: {
          insight: rewardLaneRewardInsightAfter,
          ringExp: rewardLaneRewardRingExpAfter
        }
      },
      rewardPrimaryHandoffDataset: rewardPrimaryHandoff ? { ...rewardPrimaryHandoff.dataset } : null,
      rewardPrimaryHandoffText,
      rewardHandoffButtonCount,
      rewardSeasonBoardChipText,
      skipText: skipBtn.textContent || '',
      expectedSkipCost,
    };
  });
  add(
    'reward screen keeps card stage and summary rail separated on desktop',
    !!rewardProbe?.ok,
    JSON.stringify(rewardProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.evaluate(() => {
    window.__auditOriginalRandom = Math.random;
    Math.random = () => 0;
  });
  await page.click('#steal-btn', { force: true });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    if (window.__auditOriginalRandom) Math.random = window.__auditOriginalRandom;
  });
  const rewardResolveProbe = await page.evaluate(() => {
    const screen = document.getElementById('reward-screen');
    const text = document.getElementById('steal-text')?.textContent || '';
    const btn = document.getElementById('steal-btn');
    return {
      state: screen?.dataset?.stealState || '',
      disabled: !!btn?.disabled,
      text,
      ok: (screen?.dataset?.stealState === 'success') && !!btn?.disabled && /盗取成功|已经掌握/.test(text),
    };
  });
  add(
    'reward steal panel resolves into success state with localized feedback',
    !!rewardResolveProbe?.ok,
    JSON.stringify(rewardResolveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-layout-after-steal.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const rewardSeasonHandoffSelector = '#reward-expedition-meta [data-season-board-action-reward="true"] [data-season-board-handoff-cta="true"]';
  const rewardSeasonHandoffButton = page.locator(rewardSeasonHandoffSelector).first();
  let rewardSeasonHandoffClickProbe = null;
  if ((await rewardSeasonHandoffButton.count()) < 1) {
    rewardSeasonHandoffClickProbe = { ok: false, reason: 'missing_reward_handoff_button' };
  } else {
    try {
      const rewardSeasonHandoffBefore = await rewardSeasonHandoffButton.evaluate((btn) => {
        const rect = btn.getBoundingClientRect();
        return {
          currentScreen: window.game?.currentScreen || '',
          section: window.game?.collectionHubState?.section || '',
          dataset: { ...btn.dataset },
          text: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
          visible: rect.width > 0 && rect.height > 0,
        };
      });
      await rewardSeasonHandoffButton.scrollIntoViewIfNeeded({ timeout: 5000 });
      await rewardSeasonHandoffButton.click({ timeout: 5000 });
      await page.waitForFunction(
        (expectedSection) => window.game?.currentScreen === 'collection'
          && window.game?.collectionHubState?.section === expectedSection,
        rewardSeasonHandoffBefore.dataset.seasonBoardHandoffValue,
        { timeout: 5000 }
      );
      await page.waitForFunction(
        () => window.game?.pendingRewardSeasonBoardHandoffNotice === null
          && !!window.game?.lastRewardSeasonBoardHandoffArrivalNotice
          && !!document.querySelector('[data-season-board-handoff-arrival="true"]'),
        null,
        { timeout: 5000 }
      );
      const rewardSeasonHandoffFocusButton = page.locator('[data-season-board-handoff-focus="true"]').first();
      if ((await rewardSeasonHandoffFocusButton.count()) < 1) {
        throw new Error('missing_reward_handoff_focus_button');
      }
      const rewardSeasonHandoffFocusBefore = await rewardSeasonHandoffFocusButton.evaluate((btn) => ({
        dataset: { ...btn.dataset },
        text: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
      }));
      await rewardSeasonHandoffFocusButton.click({ timeout: 5000 });
      await page.waitForFunction(
        () => window.game?.lastRewardSeasonBoardHandoffArrivalFocus?.ok === true
          && !!document.querySelector('[data-season-board-handoff-focused="true"]'),
        null,
        { timeout: 5000 }
      );
      rewardSeasonHandoffClickProbe = await page.evaluate(({ before, focusBefore }) => {
        const last = game.lastRewardSeasonBoardHandoff || null;
        const pending = game.pendingRewardSeasonBoardHandoffNotice || null;
        const arrival = game.lastRewardSeasonBoardHandoffArrivalNotice || null;
        const focus = game.lastRewardSeasonBoardHandoffArrivalFocus || null;
        const notice = document.querySelector('[data-season-board-handoff-arrival="true"]');
        const focusButton = document.querySelector('[data-season-board-handoff-focus="true"]');
        const focused = document.querySelector('[data-season-board-handoff-focused="true"]');
        const actionTarget = document.querySelector('[data-season-board-handoff-action-target="true"]');
        const noticeText = (notice?.textContent || '').replace(/\s+/g, ' ').trim();
        const focusedText = (focused?.textContent || '').replace(/\s+/g, ' ').trim();
        const focusedDataset = focused?.dataset || {};
        const focusTaskMatched = !arrival?.taskId
          || focusedDataset.seasonBoardGoalTaskId === arrival.taskId
          || focusedDataset.seasonBoardResearchTaskId === arrival.taskId
          || focusedDataset.seasonBoardTaskId === arrival.taskId
          || focusedText.includes(arrival.title || '');
        return {
          ok:
            before.visible === true &&
            game.currentScreen === 'collection' &&
            game.collectionHubState?.section === before.dataset.seasonBoardHandoffValue &&
            last?.sourceKey === before.dataset.seasonBoardHandoffSourceKey &&
            last?.action === before.dataset.seasonBoardHandoffAction &&
            last?.value === before.dataset.seasonBoardHandoffValue &&
            last?.source === before.dataset.seasonBoardHandoffSource &&
            last?.sourceId === before.dataset.seasonBoardHandoffSourceId &&
            pending === null &&
            arrival?.value === before.dataset.seasonBoardHandoffValue &&
            arrival?.source === before.dataset.seasonBoardHandoffSource &&
            notice?.dataset?.seasonBoardHandoffArrival === 'true' &&
            notice?.dataset?.seasonBoardHandoffValue === before.dataset.seasonBoardHandoffValue &&
            notice?.dataset?.seasonBoardHandoffSource === before.dataset.seasonBoardHandoffSource &&
            noticeText.includes(before.text) &&
            noticeText.includes('已定位到') &&
            focusBefore.text === (arrival?.focusLabel || '') &&
            focusButton?.dataset?.seasonBoardHandoffFocus === 'true' &&
            focusButton?.dataset?.seasonBoardHandoffTaskId === (arrival?.taskId || '') &&
            focus?.ok === true &&
            ['goal', 'research', 'task', 'lane'].includes(focus?.kind || '') &&
            focused?.dataset?.seasonBoardHandoffFocused === 'true' &&
            focused?.dataset?.seasonBoardHandoffFocusSourceKey === before.dataset.seasonBoardHandoffSourceKey &&
            focusTaskMatched &&
            (!!actionTarget || ['task', 'lane'].includes(focus?.kind || '')),
          before,
          focusBefore,
          after: {
            currentScreen: game.currentScreen || '',
            section: game.collectionHubState?.section || '',
            last,
            pending,
            arrival,
            focus,
            notice: notice ? { dataset: { ...notice.dataset }, text: noticeText } : null,
            focused: focused ? { dataset: { ...focused.dataset }, text: focusedText } : null,
            actionTarget: actionTarget ? { dataset: { ...actionTarget.dataset }, text: (actionTarget.textContent || '').replace(/\s+/g, ' ').trim() } : null,
          },
        };
      }, { before: rewardSeasonHandoffBefore, focusBefore: rewardSeasonHandoffFocusBefore });
    } catch (error) {
      rewardSeasonHandoffClickProbe = {
        ok: false,
        reason: 'playwright_reward_handoff_click_failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  add(
    'reward season-board handoff CTA clicks through, renders arrival feedback, and focuses the next action',
    !!rewardSeasonHandoffClickProbe?.ok,
    JSON.stringify(rewardSeasonHandoffClickProbe || null)
  );

  const mapSeasonFrontierProbe = await page.evaluate(() => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!window.game) return { ok: false, reason: 'no_game' };
    if (typeof game.showScreen === 'function') game.showScreen('map-screen');
    if (game.map && typeof game.map.updateChapterBriefPanel === 'function') {
      game.map.updateChapterBriefPanel();
    }
    let payload = {};
    try {
      payload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      payload = {};
    }
    const chapterSeasonBoard = payload?.map?.chapter?.seasonBoard || null;
    const frontier = chapterSeasonBoard?.frontier || null;
    const decree = frontier?.decree || null;
    const chronicle = frontier?.chronicle || null;
    const council = frontier?.council || null;
    const mapFrontier = document.querySelector('#map-chapter-brief [data-map-season-board-frontier="true"]');
    const mapFrontierChip = document.querySelector('#map-chapter-brief [data-map-season-board-chip="frontier"]');
    const mapFrontierDecree = document.querySelector('#map-chapter-brief [data-map-season-board-frontier-decree="true"]');
    const mapFrontierDecreeChip = document.querySelector('#map-chapter-brief [data-map-season-board-chip="frontier-decree"]');
    const mapFrontierChronicle = document.querySelector('#map-chapter-brief [data-map-season-board-frontier-chronicle="true"]');
    const mapFrontierChronicleChip = document.querySelector('#map-chapter-brief [data-map-season-board-chip="frontier-chronicle"]');
    const mapFrontierCouncil = document.querySelector('#map-chapter-brief [data-map-season-board-frontier-council="true"]');
    const mapFrontierCouncilChip = document.querySelector('#map-chapter-brief [data-map-season-board-chip="frontier-council"]');
    const mapFrontierActionCount = document.querySelectorAll('#map-chapter-brief [data-season-board-frontier-action="true"]').length;
    return {
      ok:
        game.currentScreen === 'map-screen' &&
        !!frontier &&
        frontier.primaryFrontId &&
        frontier.actionLaneId === frontier.primaryFrontId &&
        !!frontier.actionTargetLabel &&
        !!decree &&
        decree.laneId === frontier.primaryFrontId &&
        decree.actionTargetLabel === frontier.actionTargetLabel &&
        !!chronicle &&
        chronicle.laneId === frontier.primaryFrontId &&
        chronicle.actionTargetLabel === frontier.actionTargetLabel &&
        chronicle.statusId === frontier.statusId &&
        !!council &&
        council.laneId === frontier.primaryFrontId &&
        council.statusId === frontier.statusId &&
        Array.isArray(council.laneOpinions) &&
        council.laneOpinions.length === 3 &&
        !!mapFrontier &&
        !!mapFrontierChip &&
        !!mapFrontierDecree &&
        !!mapFrontierDecreeChip &&
        !!mapFrontierChronicle &&
        !!mapFrontierChronicleChip &&
        !!mapFrontierCouncil &&
        !!mapFrontierCouncilChip &&
        mapFrontier.dataset.seasonBoardFrontierId === frontier.primaryFrontId &&
        mapFrontier.dataset.seasonBoardFrontierPressure === frontier.statusId &&
        mapFrontier.dataset.seasonBoardFrontierActionLaneId === frontier.actionLaneId &&
        mapFrontier.dataset.seasonBoardFrontierActionTarget === frontier.actionTargetLabel &&
        mapFrontierDecree.dataset.seasonBoardFrontierDecreeId === decree.id &&
        mapFrontierDecree.dataset.seasonBoardFrontierDecreeLaneId === decree.laneId &&
        mapFrontierDecree.dataset.seasonBoardFrontierDecreeActionTarget === decree.actionTargetLabel &&
        mapFrontierChronicle.dataset.seasonBoardFrontierChronicleId === chronicle.id &&
        mapFrontierChronicle.dataset.seasonBoardFrontierChronicleLaneId === chronicle.laneId &&
        mapFrontierChronicle.dataset.seasonBoardFrontierChronicleActionTarget === chronicle.actionTargetLabel &&
        mapFrontierCouncil.dataset.seasonBoardFrontierCouncilId === council.id &&
        mapFrontierCouncil.dataset.seasonBoardFrontierCouncilLaneId === council.laneId &&
        text(mapFrontier).includes(frontier.primaryFrontShortLabel || frontier.primaryFrontLabel || '') &&
        text(mapFrontier).includes(frontier.actionTargetLabel || '') &&
        text(mapFrontierDecree).includes(decree.laneLabel || frontier.primaryFrontShortLabel || '') &&
        text(mapFrontierDecree).includes(decree.actionTargetLabel || '') &&
        text(mapFrontierChronicle).includes(chronicle.laneLabel || frontier.primaryFrontShortLabel || '') &&
        text(mapFrontierChronicle).includes(chronicle.actionTargetLabel || '') &&
        text(mapFrontierCouncil).includes(council.laneLabel || frontier.primaryFrontShortLabel || '') &&
        /诸界战线|战线/.test(text(mapFrontierChip)) &&
        /本周法旨|法旨/.test(text(mapFrontierDecreeChip)) &&
        /战役史卷|史卷/.test(text(mapFrontierChronicleChip)) &&
        /诸界会审|会审/.test(text(mapFrontierCouncilChip)) &&
        mapFrontierActionCount === 0,
      currentScreen: game.currentScreen || '',
      frontier,
      decree,
      chronicle,
      council,
      mapFrontierText: text(mapFrontier),
      mapFrontierChipText: text(mapFrontierChip),
      mapFrontierDecreeText: text(mapFrontierDecree),
      mapFrontierDecreeChipText: text(mapFrontierDecreeChip),
      mapFrontierChronicleText: text(mapFrontierChronicle),
      mapFrontierChronicleChipText: text(mapFrontierChronicleChip),
      mapFrontierCouncilText: text(mapFrontierCouncil),
      mapFrontierCouncilChipText: text(mapFrontierCouncilChip),
      mapFrontierDataset: mapFrontier ? { ...mapFrontier.dataset } : null,
      mapFrontierDecreeDataset: mapFrontierDecree ? { ...mapFrontierDecree.dataset } : null,
      mapFrontierChronicleDataset: mapFrontierChronicle ? { ...mapFrontierChronicle.dataset } : null,
      mapFrontierCouncilDataset: mapFrontierCouncil ? { ...mapFrontierCouncil.dataset } : null,
      mapFrontierActionCount
    };
  });
  add(
    'map chapter brief mirrors season-board frontier without adding a second action',
    !!mapSeasonFrontierProbe?.ok,
    JSON.stringify(mapSeasonFrontierProbe || null)
  );

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const sanctumLocklineProbe = await page.evaluate(async () => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    if (typeof game.createDefaultSeasonVerificationState === 'function') {
      game.seasonVerificationState = game.createDefaultSeasonVerificationState();
    } else if (game.seasonVerificationState && typeof game.seasonVerificationState === 'object') {
      game.seasonVerificationState.claimedLaneRewards = {};
    }
    const locklineSlate = {
      id: 'sanctum_lockline_probe',
      chapterIndex: 6,
      chapterName: '第 6 章·锁线归卷',
      endingId: 'alliance',
      endingName: '押卷中',
      endingIcon: '⚖️',
      score: 188,
      branchName: '洞府承诺',
      tags: ['课题·推演控场', '答卷·样本入档'],
      answerReview: {
        ratingLabel: '样本入档',
        ratingTone: 'selected',
        trainingAdvice: '沿洞府承诺继续压卷，不要提前把锁线样本当成已定榜答案。',
        highlightLine: '这轮只把样本锁进押卷，下一步仍要回洞府兑现承诺。'
      },
      practiceTopic: {
        id: 'sanctum_lockline_probe_topic',
        sourceRecordId: 'sanctum_lockline_probe_guide',
        sourceTitle: '锁线试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '先把当前押卷承诺补齐，再决定是否进高压验证。',
        trainingTags: ['路线贴合', '控场稳定'],
        goalLines: ['先回洞府确认押卷承诺']
      },
      observatoryLink: {
        sourceRecordId: 'sanctum_lockline_probe_guide',
        sourceTitle: '锁线试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '先回洞府确认押卷承诺。',
        trainingTags: ['路线贴合', '控场稳定'],
        drillObjective: '把锁线样本补成可继续推进的洞府承诺。'
      },
      timestamp: Date.now()
    };
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive([locklineSlate]);
    } else {
      game.runSlateArchive = [locklineSlate];
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    const focus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
      ? game.buildObservatoryTrainingFocusFromSlate(locklineSlate)
      : null;
    if (focus && typeof game.setObservatoryTrainingFocus === 'function') {
      game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    if (typeof game.getSeasonBoardSnapshot === 'function' && typeof game.normalizeSeasonBoardSnapshot === 'function') {
      const originalGetSeasonBoardSnapshot = game.getSeasonBoardSnapshot.bind(game);
      const rewardLaneBoard = originalGetSeasonBoardSnapshot({ latestSlate: locklineSlate });
      const completeLane = (lane) => ({
        ...lane,
        tasks: (Array.isArray(lane?.tasks) ? lane.tasks : []).map((task) => {
          const target = Math.max(1, Math.floor(Number(task?.target) || 1));
          return {
            ...task,
            progress: target,
            target,
            completed: true,
            progressText: `${target}/${target}`
          };
        })
      });
      const rewardLaneBoardSource = rewardLaneBoard
        ? {
          ...rewardLaneBoard,
          lanes: (rewardLaneBoard.lanes || []).map((lane) => lane.id === 'training' ? completeLane(lane) : lane)
        }
        : null;
      if (rewardLaneBoardSource) {
        game.getSeasonBoardSnapshot = () => game.normalizeSeasonBoardSnapshot(rewardLaneBoardSource);
      }
    }
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
    if (typeof game.initCollection === 'function') game.initCollection();

    const summaryText = text(document.getElementById('sanctum-summary'));
    const researchText = text(document.getElementById('sanctum-research-list'));
    const goalText = text(document.getElementById('sanctum-goal-list'));
    const guideText = text(document.getElementById('sanctum-guide'));
    const seasonBoardSummary = text(document.querySelector('#sanctum-summary [data-season-board-summary="true"]'));
    const seasonBoardSettlement = text(document.querySelector('#sanctum-summary [data-season-board-settlement="true"]'));
    const seasonBoardFrontierSummary = text(document.querySelector('#sanctum-summary [data-season-board-frontier="true"]'));
    const seasonBoardFrontierGuide = text(document.querySelector('#sanctum-guide [data-season-board-frontier-guide="true"]'));
    const seasonBoardFrontierChipText = text(document.querySelector('#sanctum-summary [data-season-board-chip="frontier"]'));
    const seasonBoardFrontierCardText = text(document.querySelector('#sanctum-summary [data-season-board-frontier-card="true"]'));
    const seasonBoardFrontierChronicleSummary = text(document.querySelector('#sanctum-summary [data-season-board-frontier-chronicle="true"]'));
    const seasonBoardFrontierChronicleGuide = text(document.querySelector('#sanctum-guide [data-season-board-frontier-chronicle-guide="true"]'));
    const seasonBoardFrontierChronicleChipText = text(document.querySelector('#sanctum-summary [data-season-board-chip="frontier-chronicle"]'));
    const seasonBoardFrontierChronicleCardText = text(document.querySelector('#sanctum-summary [data-season-board-frontier-chronicle-card="true"]'));
    const seasonBoardFrontierCouncilSummary = text(document.querySelector('#sanctum-summary [data-season-board-frontier-council="true"]'));
    const seasonBoardFrontierCouncilGuide = text(document.querySelector('#sanctum-guide [data-season-board-frontier-council-guide="true"]'));
    const seasonBoardFrontierCouncilChipText = text(document.querySelector('#sanctum-summary [data-season-board-chip="frontier-council"]'));
    const seasonBoardFrontierCouncilCardText = text(document.querySelector('#sanctum-summary [data-season-board-frontier-council-card="true"]'));
    const seasonBoardFrontierSummaryCount = document.querySelectorAll('#sanctum-summary [data-season-board-frontier="true"]').length;
    const seasonBoardFrontierChronicleCount = document.querySelectorAll('#sanctum-summary [data-season-board-frontier-chronicle="true"]').length;
    const seasonBoardFrontierCouncilCount = document.querySelectorAll('#sanctum-summary [data-season-board-frontier-council="true"]').length;
    const seasonBoardFrontierActionCount = document.querySelectorAll('[data-season-board-frontier-action="true"]').length;
    const seasonBoardVerification = text(document.querySelector('#sanctum-summary [data-season-board-verification="true"]'));
    const seasonBoardVerificationCard = document.querySelector('#sanctum-summary [data-season-board-verification-card="true"]');
    const seasonBoardVerificationChip = document.querySelector('#sanctum-summary [data-season-board-chip="verification"]');
    const seasonBoardVerificationOrderCount = document.querySelectorAll('#sanctum-summary [data-season-board-verification-order="true"]').length;
    const seasonBoardNextTaskGoalText = Array.from(document.querySelectorAll('#sanctum-goal-list [data-season-board-goal="true"]'))
      .map((node) => text(node))
      .find((value) => /当前季盘行动/.test(value)) || '';
    const seasonBoardLaneRewardChipText = text(document.querySelector('#sanctum-summary [data-season-board-chip="lane-reward"]'));
    const seasonBoardLaneRewardRows = Array.from(document.querySelectorAll('#sanctum-summary [data-season-board-lane-reward="true"]'));
    const seasonBoardTrainingLaneRewardRow = document.querySelector('#sanctum-summary [data-season-board-lane-reward="true"][data-season-board-lane-reward-lane-id="training"]');
    const seasonBoardTrainingLaneRewardButton = seasonBoardTrainingLaneRewardRow?.querySelector('[data-season-board-lane-reward-claim="true"]') || null;
    const seasonBoardLaneRewardResearchText = Array.from(document.querySelectorAll('#sanctum-research-list [data-season-board-research="true"]'))
      .map((node) => text(node))
      .filter((value) => /结题赏/.test(value))
      .join(' ');
    const seasonBoardLaneRewardGoalText = Array.from(document.querySelectorAll('#sanctum-goal-list [data-season-board-goal="true"]'))
      .map((node) => text(node))
      .filter((value) => /结题赏/.test(value))
      .join(' ');
    const seasonBoardVerificationGoalCount = Array.from(document.querySelectorAll('#sanctum-goal-list [data-season-board-goal="true"]'))
      .filter((node) => /verification/.test(String(node.getAttribute('data-season-board-goal-id') || '')))
      .length;
    const seasonBoardCommitmentTask = document.querySelector('#sanctum-summary [data-season-board-task-id="season_commitment"]');
    const seasonBoardCommitmentAction = seasonBoardCommitmentTask?.querySelector('[data-season-board-task-action="true"]') || null;
    const seasonBoardCommitmentTargetLabel = seasonBoardCommitmentAction?.dataset?.seasonBoardTaskTargetLabel || '';
    const seasonBoardCommitmentActionText = text(seasonBoardCommitmentAction);
    if (seasonBoardCommitmentAction) {
      seasonBoardCommitmentAction.click();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    const seasonBoardTaskFollow = game.lastSeasonBoardTaskFollow || null;
    const seasonBoardTaskArrivalNotice = game.lastSeasonBoardTaskFollowArrivalNotice || null;
    const seasonBoardTaskArrivalPending = game.pendingSeasonBoardTaskFollowNotice || null;
    const seasonBoardTaskArrival = document.querySelector('[data-season-board-task-arrival="true"]');
    const seasonBoardTaskArrivalFocus = document.querySelector('[data-season-board-task-arrival-focus="true"]');
    const seasonBoardTaskArrivalText = text(seasonBoardTaskArrival);
    const seasonBoardTaskArrivalFocusText = text(seasonBoardTaskArrivalFocus);
    if (seasonBoardTaskArrivalFocus) {
      seasonBoardTaskArrivalFocus.click();
    }
    const seasonBoardTaskArrivalFocusResult = game.lastSeasonBoardTaskFollowArrivalFocus || null;
    const seasonBoardTaskFocused = document.querySelector('[data-season-board-task-arrival-focused="true"]');
    const seasonBoardTaskActionTarget = document.querySelector('[data-season-board-task-arrival-action-target="true"]');

    let payload = {};
    try {
      payload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      payload = {};
    }
    const expeditionSeasonBoard = payload?.expedition?.seasonBoard || null;
    const chapterSeasonBoard = payload?.map?.chapter?.seasonBoard || null;
    const expeditionTrainingLaneReward = (expeditionSeasonBoard?.laneRewards || []).find((reward) => reward?.laneId === 'training') || null;
    const expeditionExpeditionLaneReward = (expeditionSeasonBoard?.laneRewards || []).find((reward) => reward?.laneId === 'expedition') || null;

    return {
      ok:
        !!expeditionSeasonBoard &&
        !!chapterSeasonBoard &&
        expeditionSeasonBoard.phaseId === 'lockline' &&
        expeditionSeasonBoard.settlement?.outcomeId === 'locking_sheet' &&
        expeditionSeasonBoard.nextTask?.id === 'season_commitment' &&
        expeditionSeasonBoard.nextTask?.anchorSection === 'sanctum' &&
        expeditionSeasonBoard.nextTask?.source === 'settlement' &&
        expeditionSeasonBoard.nextTask?.sourceId === expeditionSeasonBoard.settlement?.id &&
        expeditionSeasonBoard.nextTask?.taskSource === 'lane' &&
        expeditionSeasonBoard.nextTask?.taskSourceId === expeditionSeasonBoard.nextTask?.id &&
        expeditionSeasonBoard.nextWeekGoal?.source === expeditionSeasonBoard.nextTask?.source &&
        expeditionSeasonBoard.nextWeekGoal?.sourceId === expeditionSeasonBoard.nextTask?.sourceId &&
        expeditionSeasonBoard.nextWeekGoal?.taskSource === expeditionSeasonBoard.nextTask?.taskSource &&
        expeditionSeasonBoard.nextWeekGoal?.taskSourceId === expeditionSeasonBoard.nextTask?.taskSourceId &&
        expeditionSeasonBoard.nextWeekGoal?.action === expeditionSeasonBoard.nextTask?.actionType &&
        expeditionSeasonBoard.nextWeekGoal?.value === expeditionSeasonBoard.nextTask?.actionValue &&
        !!expeditionSeasonBoard.frontier &&
        expeditionSeasonBoard.frontier.primaryFrontId === 'expedition' &&
        expeditionSeasonBoard.frontier.primaryFrontLabel &&
        expeditionSeasonBoard.frontier.actionLaneId === expeditionSeasonBoard.frontier.primaryFrontId &&
        !!expeditionSeasonBoard.frontier.actionTargetLabel &&
        !!expeditionSeasonBoard.frontier.chronicle &&
        expeditionSeasonBoard.frontier.chronicle.laneId === expeditionSeasonBoard.frontier.primaryFrontId &&
        expeditionSeasonBoard.frontier.chronicle.actionTargetLabel === expeditionSeasonBoard.frontier.actionTargetLabel &&
        expeditionSeasonBoard.frontier.chronicle.statusId === expeditionSeasonBoard.frontier.statusId &&
        !!expeditionSeasonBoard.frontier.chronicle.progressLine &&
        !!expeditionSeasonBoard.frontier.council &&
        expeditionSeasonBoard.frontier.council.laneId === expeditionSeasonBoard.frontier.primaryFrontId &&
        expeditionSeasonBoard.frontier.council.statusId === expeditionSeasonBoard.frontier.statusId &&
        !!expeditionSeasonBoard.frontier.council.verdictLine &&
        Array.isArray(expeditionSeasonBoard.frontier.items) &&
        expeditionSeasonBoard.frontier.items.length === 3 &&
        JSON.stringify(expeditionSeasonBoard.frontier || null) === JSON.stringify(chapterSeasonBoard.frontier || null) &&
        Array.isArray(expeditionSeasonBoard.laneRewards) &&
        expeditionSeasonBoard.laneRewards.length === 3 &&
        expeditionSeasonBoard.laneRewardSummary?.readyCount === 1 &&
        expeditionSeasonBoard.laneRewardSummary?.claimableCount === 1 &&
        expeditionSeasonBoard.laneRewardSummary?.claimedCount === 0 &&
        expeditionTrainingLaneReward?.claimable === true &&
        expeditionTrainingLaneReward?.claimed === false &&
        expeditionExpeditionLaneReward?.claimable === false &&
        JSON.stringify(expeditionSeasonBoard.laneRewards || []) === JSON.stringify(chapterSeasonBoard.laneRewards || []) &&
        JSON.stringify(expeditionSeasonBoard.laneRewardSummary || null) === JSON.stringify(chapterSeasonBoard.laneRewardSummary || null) &&
        JSON.stringify(expeditionSeasonBoard.nextTask || null) === JSON.stringify(chapterSeasonBoard.nextTask || null) &&
        JSON.stringify(expeditionSeasonBoard.nextWeekGoal || null) === JSON.stringify(chapterSeasonBoard.nextWeekGoal || null) &&
        expeditionSeasonBoard.progress?.progressText === chapterSeasonBoard.progress?.progressText &&
        Array.isArray(expeditionSeasonBoard.verificationOrders) &&
        expeditionSeasonBoard.verificationOrders.length >= 1 &&
        JSON.stringify(expeditionSeasonBoard.verificationOrders || []) === JSON.stringify(chapterSeasonBoard.verificationOrders || []) &&
        seasonBoardSummary.length > 0 &&
        /季押卷/.test(seasonBoardSettlement) &&
        /押卷中/.test(`${summaryText} ${seasonBoardSettlement}`) &&
        !seasonBoardVerification &&
        !seasonBoardVerificationCard &&
        !seasonBoardVerificationChip &&
        seasonBoardVerificationOrderCount === 0 &&
        seasonBoardVerificationGoalCount === 0 &&
        !/结业验证状/.test(researchText) &&
        !/结业验证状/.test(goalText) &&
        seasonBoardFrontierSummaryCount === 1 &&
        seasonBoardFrontierActionCount === 0 &&
        seasonBoardFrontierSummary.includes(expeditionSeasonBoard.frontier.primaryFrontShortLabel || expeditionSeasonBoard.frontier.primaryFrontLabel || '') &&
        /战线/.test(seasonBoardFrontierChipText) &&
        seasonBoardFrontierGuide.includes(expeditionSeasonBoard.frontier.primaryFrontLabel || '') &&
        seasonBoardFrontierCardText.length > 0 &&
        seasonBoardFrontierChronicleCount === 1 &&
        seasonBoardFrontierChronicleSummary.includes(expeditionSeasonBoard.frontier.chronicle.laneLabel || expeditionSeasonBoard.frontier.primaryFrontShortLabel || '') &&
        /史卷/.test(seasonBoardFrontierChronicleChipText) &&
        seasonBoardFrontierChronicleGuide.includes(expeditionSeasonBoard.frontier.chronicle.laneLabel || '') &&
        seasonBoardFrontierChronicleCardText.length > 0 &&
        seasonBoardFrontierCouncilCount === 1 &&
        seasonBoardFrontierCouncilSummary.includes(expeditionSeasonBoard.frontier.council.laneLabel || expeditionSeasonBoard.frontier.primaryFrontShortLabel || '') &&
        /会审/.test(seasonBoardFrontierCouncilChipText) &&
        seasonBoardFrontierCouncilGuide.includes(expeditionSeasonBoard.frontier.council.laneLabel || '') &&
        seasonBoardFrontierCouncilCardText.length > 0 &&
        seasonBoardNextTaskGoalText.includes(expeditionSeasonBoard.nextTask?.label || '') &&
        seasonBoardLaneRewardChipText.includes('1/3') &&
        seasonBoardLaneRewardRows.length === 3 &&
        seasonBoardTrainingLaneRewardRow?.dataset?.seasonBoardLaneRewardStatus === 'claimable' &&
        seasonBoardTrainingLaneRewardButton?.dataset?.seasonBoardLaneRewardClaimable === 'true' &&
        seasonBoardTrainingLaneRewardButton?.disabled === false &&
        seasonBoardLaneRewardResearchText.includes(expeditionTrainingLaneReward?.laneLabel || '') &&
        seasonBoardLaneRewardResearchText.includes(expeditionTrainingLaneReward?.rewardLine || '') &&
        seasonBoardLaneRewardGoalText.includes(expeditionTrainingLaneReward?.laneLabel || '') &&
        seasonBoardLaneRewardGoalText.includes(expeditionTrainingLaneReward?.rewardLine || '') &&
        seasonBoardCommitmentTask?.dataset?.seasonBoardTaskId === expeditionSeasonBoard.nextTask?.id &&
        seasonBoardCommitmentTask?.dataset?.seasonBoardLaneId === expeditionSeasonBoard.nextTask?.laneId &&
        seasonBoardCommitmentTask?.dataset?.seasonBoardTaskActionType === expeditionSeasonBoard.nextTask?.actionType &&
        seasonBoardCommitmentTask?.dataset?.seasonBoardTaskActionValue === expeditionSeasonBoard.nextTask?.actionValue &&
        seasonBoardCommitmentAction?.dataset?.seasonBoardTaskAction === 'true' &&
        seasonBoardCommitmentAction?.dataset?.seasonBoardTaskActionId === expeditionSeasonBoard.nextTask?.id &&
        seasonBoardCommitmentAction?.dataset?.seasonBoardTaskActionType === expeditionSeasonBoard.nextTask?.actionType &&
        seasonBoardCommitmentAction?.dataset?.seasonBoardTaskActionValue === expeditionSeasonBoard.nextTask?.actionValue &&
        seasonBoardCommitmentTargetLabel === '洞府' &&
        seasonBoardCommitmentActionText === expeditionSeasonBoard.nextTask?.ctaLabel &&
        seasonBoardTaskFollow?.taskId === expeditionSeasonBoard.nextTask?.id &&
        seasonBoardTaskFollow?.laneId === expeditionSeasonBoard.nextTask?.laneId &&
        seasonBoardTaskFollow?.actionType === expeditionSeasonBoard.nextTask?.actionType &&
        seasonBoardTaskFollow?.actionValue === expeditionSeasonBoard.nextTask?.actionValue &&
        seasonBoardTaskFollow?.taskSource === expeditionSeasonBoard.nextTask?.taskSource &&
        seasonBoardTaskFollow?.taskSourceId === expeditionSeasonBoard.nextTask?.taskSourceId &&
        seasonBoardTaskArrivalNotice?.sourceKey === 'task' &&
        seasonBoardTaskArrivalNotice?.value === expeditionSeasonBoard.nextTask?.actionValue &&
        seasonBoardTaskArrivalNotice?.taskId === expeditionSeasonBoard.nextTask?.id &&
        seasonBoardTaskArrivalNotice?.laneId === expeditionSeasonBoard.nextTask?.laneId &&
        seasonBoardTaskArrivalNotice?.source === expeditionSeasonBoard.nextTask?.source &&
        seasonBoardTaskArrivalNotice?.sourceId === expeditionSeasonBoard.nextTask?.sourceId &&
        seasonBoardTaskArrivalPending === null &&
        seasonBoardTaskArrival?.dataset?.seasonBoardTaskArrival === 'true' &&
        seasonBoardTaskArrival?.dataset?.seasonBoardTaskValue === expeditionSeasonBoard.nextTask?.actionValue &&
        seasonBoardTaskArrival?.dataset?.seasonBoardTaskTaskId === expeditionSeasonBoard.nextTask?.id &&
        seasonBoardTaskArrival?.dataset?.seasonBoardTaskLaneId === expeditionSeasonBoard.nextTask?.laneId &&
        seasonBoardTaskArrivalText.includes('季盘任务已定位') &&
        seasonBoardTaskArrivalText.includes(expeditionSeasonBoard.nextTask?.label || '') &&
        seasonBoardTaskArrivalText.includes(seasonBoardCommitmentActionText || '') &&
        seasonBoardTaskArrivalFocus?.dataset?.seasonBoardTaskArrivalFocus === 'true' &&
        seasonBoardTaskArrivalFocus?.dataset?.seasonBoardTaskArrivalTaskId === expeditionSeasonBoard.nextTask?.id &&
        seasonBoardTaskArrivalFocusText === (seasonBoardTaskArrivalNotice?.focusLabel || '') &&
        seasonBoardTaskArrivalFocusResult?.ok === true &&
        seasonBoardTaskArrivalFocusResult?.kind === 'task' &&
        seasonBoardTaskArrivalFocusResult?.hasAction === true &&
        seasonBoardTaskFocused?.dataset?.seasonBoardTaskArrivalFocused === 'true' &&
        seasonBoardTaskFocused?.dataset?.seasonBoardTaskArrivalFocusSourceKey === 'task' &&
        seasonBoardTaskFocused?.dataset?.seasonBoardTaskId === expeditionSeasonBoard.nextTask?.id &&
        seasonBoardTaskFocused?.dataset?.seasonBoardLaneId === expeditionSeasonBoard.nextTask?.laneId &&
        seasonBoardTaskActionTarget?.dataset?.seasonBoardTaskArrivalActionTarget === 'true' &&
        game.currentScreen === 'collection' &&
        game.collectionHubState?.section === expeditionSeasonBoard.nextTask?.actionValue &&
        researchText.includes(expeditionSeasonBoard.nextTask?.label || '') &&
        guideText.includes('赛季天道盘') &&
        summaryText.includes('押卷中'),
      summaryText,
      researchText,
      goalText,
      guideText,
      seasonBoardSummary,
      seasonBoardSettlement,
      seasonBoardFrontierSummary,
      seasonBoardFrontierGuide,
      seasonBoardFrontierChipText,
      seasonBoardFrontierCardText,
      seasonBoardFrontierChronicleSummary,
      seasonBoardFrontierChronicleGuide,
      seasonBoardFrontierChronicleChipText,
      seasonBoardFrontierChronicleCardText,
      seasonBoardFrontierCouncilSummary,
      seasonBoardFrontierCouncilGuide,
      seasonBoardFrontierCouncilChipText,
      seasonBoardFrontierCouncilCardText,
      seasonBoardFrontierSummaryCount,
      seasonBoardFrontierChronicleCount,
      seasonBoardFrontierCouncilCount,
      seasonBoardFrontierActionCount,
      seasonBoardVerification,
      seasonBoardVerificationOrderCount,
      seasonBoardVerificationGoalCount,
      seasonBoardNextTaskGoalText,
      seasonBoardLaneRewardChipText,
      seasonBoardLaneRewardResearchText,
      seasonBoardLaneRewardGoalText,
      seasonBoardTrainingLaneRewardRow: seasonBoardTrainingLaneRewardRow ? { ...seasonBoardTrainingLaneRewardRow.dataset } : null,
      seasonBoardTrainingLaneRewardButton: seasonBoardTrainingLaneRewardButton ? { dataset: { ...seasonBoardTrainingLaneRewardButton.dataset }, text: text(seasonBoardTrainingLaneRewardButton), disabled: seasonBoardTrainingLaneRewardButton.disabled } : null,
      seasonBoardCommitmentTaskDataset: seasonBoardCommitmentTask ? { ...seasonBoardCommitmentTask.dataset } : null,
      seasonBoardCommitmentActionDataset: seasonBoardCommitmentAction ? { ...seasonBoardCommitmentAction.dataset } : null,
      seasonBoardCommitmentActionText,
      seasonBoardTaskFollow,
      seasonBoardTaskArrivalNotice,
      seasonBoardTaskArrivalPending,
      seasonBoardTaskArrival: seasonBoardTaskArrival ? { dataset: { ...seasonBoardTaskArrival.dataset }, text: seasonBoardTaskArrivalText } : null,
      seasonBoardTaskArrivalFocus: seasonBoardTaskArrivalFocus ? { dataset: { ...seasonBoardTaskArrivalFocus.dataset }, text: seasonBoardTaskArrivalFocusText } : null,
      seasonBoardTaskArrivalFocusResult,
      seasonBoardTaskFocused: seasonBoardTaskFocused ? { dataset: { ...seasonBoardTaskFocused.dataset }, text: text(seasonBoardTaskFocused) } : null,
      seasonBoardTaskActionTarget: seasonBoardTaskActionTarget ? { dataset: { ...seasonBoardTaskActionTarget.dataset }, text: text(seasonBoardTaskActionTarget) } : null,
      expeditionTrainingLaneReward,
      expeditionExpeditionLaneReward,
      expeditionSeasonBoard,
      chapterSeasonBoard
    };
  });
  add(
    'sanctum lockline keeps verification hidden while preserving next-task and payload mirrors',
    !!sanctumLocklineProbe?.ok,
    JSON.stringify(sanctumLocklineProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'sanctum-lockline-season-board.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const rewardDebtClearProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    if (typeof game.createDefaultSeasonVerificationState === 'function') {
      game.seasonVerificationState = game.createDefaultSeasonVerificationState();
    } else if (game.seasonVerificationState && typeof game.seasonVerificationState === 'object') {
      game.seasonVerificationState.claimedLaneRewards = {};
    }
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player?.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    if (game.player) {
      game.player.getStealBonus = () => 0;
    }
    const originalBuildChallengeBundle = typeof game.buildChallengeBundle === 'function'
      ? game.buildChallengeBundle.bind(game)
      : null;
    game.buildChallengeBundle = (mode, dateRef) => {
      if (mode !== 'weekly') {
        return originalBuildChallengeBundle ? originalBuildChallengeBundle(mode, dateRef) : null;
      }
      return {
        mode: 'weekly',
        meta: {
          title: '观星台 · 七日劫数',
          subtitle: '围绕同一套命盘反复冲分，把高分答卷压成观星档案。',
          label: '七日劫数',
          accentClass: 'weekly'
        },
        rule: {
          id: 'debt_probe_rule',
          name: '镜债补证劫数',
          objective: '围绕镜债补证反复冲分，先把欠卷补成可复盘的挑战旁证。',
          goalRealm: 3
        },
        rotationKey: '2026-W16',
        rotationLabel: '本周题面 · 镜债补证',
        seedSignature: 'W-DEBT-PROBE',
        progress: {
          completions: 1,
          bestScore: 180,
          totalScore: 180
        },
        records: [],
        rewards: [
          {
            id: 'debt_probe_rule_reward_1',
            label: '累计 180 分',
            target: 180,
            claimed: false
          }
        ]
      };
    };
    const debtRewardSlate = {
      id: 'reward_debt_probe',
      chapterIndex: 6,
      chapterName: '第 6 章·镜债归档',
      endingId: 'research_debt',
      endingName: '镜债回流',
      endingIcon: '📚',
      score: 202,
      branchName: '镜债校卷',
      tags: ['课题·推演控场', '答卷·留痕待补'],
      answerReview: {
        ratingLabel: '留痕待补',
        ratingTone: 'selected',
        trainingAdvice: '先把上一道押卷留下的债账补掉，再考虑冲更高压样本。',
        highlightLine: '这轮押卷没有真正结成，下一章需要优先清账。'
      },
      practiceTopic: {
        id: 'reward_debt_probe_topic',
        sourceRecordId: 'reward_debt_probe_guide',
        sourceTitle: '镜债试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '先确认残卷回收，再决定是否继续把主轴压成更高压样本。',
        trainingTags: ['清账回流', '控场稳定'],
        goalLines: ['先补一轮镜债验证，再决定是否继续冲榜']
      },
      observatoryLink: {
        sourceRecordId: 'reward_debt_probe_guide',
        sourceTitle: '镜债试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '先确认残卷回收，再决定是否继续把主轴压成更高压样本。',
        trainingTags: ['清账回流', '控场稳定'],
        drillObjective: '先补一轮镜债验证，再决定是否继续冲榜。'
      },
      timestamp: Date.now()
    };
    game.runSlateArchive = typeof game.normalizeRunSlateArchive === 'function'
      ? game.normalizeRunSlateArchive([debtRewardSlate])
      : [debtRewardSlate];
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    if (typeof game.buildObservatoryTrainingFocusFromSlate === 'function' && typeof game.setObservatoryTrainingFocus === 'function') {
      const focus = game.buildObservatoryTrainingFocusFromSlate(debtRewardSlate);
      if (focus) game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    if (typeof game.normalizeSanctumAgendaState === 'function') {
      game.sanctumAgendaState = game.normalizeSanctumAgendaState({
        lastResolved: {
          agendaId: 'reward_debt_probe_agenda',
          icon: '🧮',
          name: '镜债校卷',
          sourceRunId: debtRewardSlate.id,
          sourceTitle: '镜债试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          ratingLabel: '留痕待补',
          ratingTone: 'selected',
          trainingAdvice: '先把上一道押卷留下的债账补掉，再考虑冲更高压样本。',
          highlightLine: '这轮押卷没有真正结成，下一章需要优先清账。',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          focusNodeTypes: ['observatory', 'event', 'memory_rift'],
          focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
          progress: 1,
          target: 3,
          selectedDecisionLabel: '保卷回收',
          selectedDecisionLine: '先保住残卷，再找机会补押卷主轴。',
          selectedContractLabel: '镜债锁线',
          selectedContractLine: '锁住观星 / 事件 / 裂隙线路，但欠下一笔清账任务。',
          contractResolved: true,
          contractSuccess: false,
          contractResolutionLine: '锁线契约：镜债锁线未兑现 · 契押：🔮 1',
          contractSignCostLine: '🔮 1',
          outcome: 'failed',
          outcomeLabel: '研究未成',
          grantedLine: '',
          reasonLine: '本轮没有把锁线答卷真正补成卷，洞府改以债账方式追踪。',
          summaryLine: '镜债校卷没有结成，留下了一笔待清的研究债账。',
          recoveryEligible: true,
          recoveryLabel: '残卷回收',
          recoveryTier: 'partial',
          recoveryTierLabel: '轻回收',
          recoveryLine: '洞府已回收一部分残卷，但下一轮要优先补这笔镜债。',
          recoveryHintLine: '先去高压环境补一轮镜债验证，再决定要不要继续冲榜。',
          rewardTrackId: 'observatory',
          rewardTrackName: '命盘档案室',
          rewardTrackIcon: '🔭'
        },
        history: [],
        totalCompleted: 0,
        totalFailed: 1
      });
    }
    const endlessState = typeof game.ensureEndlessState === 'function' ? game.ensureEndlessState() : null;
    const weekMeta = typeof game.getHeavenlyMandateWeekMeta === 'function'
      ? game.getHeavenlyMandateWeekMeta()
      : null;
    if (endlessState) {
      endlessState.currentCycle = 1;
      endlessState.seasonWeekTag = weekMeta?.weekTag || endlessState.seasonWeekTag || '';
      endlessState.seasonCycleClears = 1;
      endlessState.seasonScore = 132;
    }
    if (typeof game.recordSeasonVerificationResult === 'function') {
      game.recordSeasonVerificationResult({
        recordId: `browser_reward_debt_clear_${weekMeta?.weekTag || 'current'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'primary',
        sourceMode: 'endless',
        sourceModeLabel: '无尽轮回',
        label: '无尽高压验证',
        resultStatus: 'verified',
        writebackMode: 'clear_debt',
        writebackLine: '无尽轮回主验证通过，欠卷会被清账并释放天命强目标。',
        resolvedRunId: 'browser_reward_debt_clear',
        chapterIndex: debtRewardSlate.chapterIndex,
        proofQuality: 'solid',
        lineageStyle: '长压试炼',
        summaryLine: '无尽通关已补齐主验证，这笔欠卷可以在季盘上清账。',
        detailLine: '无尽长压验证通过，说明旧债已经被真正消化。',
        statusLine: '无尽轮回 · 通过',
        anchorSection: 'endless',
        priority: 1
      });
    }
    if (typeof game.buildRewardExpeditionMeta === 'function') {
      game.lastExpeditionRewardMeta = game.buildRewardExpeditionMeta(debtRewardSlate);
    }
    game.currentBattleNode = { type: 'elite', id: 990003, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_debt_probe',
        themeName: '轮段·镜债回流',
        tierStage: 2,
        goldBonus: 14,
        ringExpBonus: 8,
      },
    };
    game.showRewardScreen(118, true, { stealLaw: lawId, stealChance: 1 }, 28, { insight: 6, karma: 2 });

    let rewardPayload = {};
    try {
      rewardPayload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      rewardPayload = {};
    }
    const screen = document.getElementById('reward-screen');
    const rewardSeasonBoard = rewardPayload?.reward?.expedition?.seasonBoard || null;
    const expeditionSeasonBoard = rewardPayload?.expedition?.seasonBoard || null;
    const chapterSeasonBoard = rewardPayload?.map?.chapter?.seasonBoard || null;
    const rewardSeasonBoardText = (document.querySelector('[data-season-board-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardChipText = Array.from(document.querySelectorAll('#reward-expedition-meta [data-season-board-chip]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const rewardSeasonBoardDebtText = (document.querySelector('[data-season-board-debt-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardVerificationText = (document.querySelector('[data-season-board-verification-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardActionText = (document.querySelector('[data-season-board-action-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFollowupText = (document.querySelector('[data-season-board-verification-followup="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardWeekVerdictLedger = rewardSeasonBoard?.weekVerdictLedger?.current || null;

    return {
      ok:
        !!rewardSeasonBoard &&
        rewardSeasonBoard?.settlement?.outcomeId === 'positive_sheet' &&
        rewardSeasonBoard?.settlement?.resolvedStatus === 'verified' &&
        rewardSeasonBoard?.debtPack?.status === 'cleared' &&
        rewardSeasonBoard?.debtPack?.occupiesStrongSlot === false &&
        Array.isArray(rewardSeasonBoard?.verificationOrders) &&
        rewardSeasonBoard.verificationOrders.length === 2 &&
        rewardSeasonBoard?.verificationOrders?.[0]?.resultStatus === 'verified' &&
        rewardSeasonBoard?.verificationOrders?.[0]?.writebackMode === 'clear_debt' &&
        rewardSeasonBoard?.verificationOrders?.[0]?.anchorSection === 'endless' &&
        rewardSeasonBoardText.includes(rewardSeasonBoard.debtPack.summaryLine) &&
        rewardSeasonBoardDebtText.includes(rewardSeasonBoard.debtPack.summaryLine) &&
        rewardSeasonBoardVerificationText.includes(
          rewardSeasonBoard?.verificationOrders?.[0]?.summaryLine
            || rewardSeasonBoard?.verificationOrders?.[0]?.hintLine
            || ''
        ) &&
        rewardSeasonBoardActionText.includes(
          rewardSeasonBoard?.verificationOrders?.[0]?.summaryLine
            || rewardSeasonBoard?.verificationOrders?.[0]?.hintLine
            || ''
        ) &&
        /旁验证|七日劫数/.test(rewardSeasonBoardFollowupText) &&
        rewardSeasonBoardChipText.includes('债账') &&
        rewardSeasonBoardChipText.includes('验证') &&
        screen?.dataset?.rewardHeaderOutcome === 'positive_sheet' &&
        screen?.dataset?.rewardNextActionSource === 'verification' &&
        rewardWeekVerdictLedger?.resolvedStatus === 'verified' &&
        rewardWeekVerdictLedger?.primaryVerificationResultStatus === 'verified' &&
        rewardWeekVerdictLedger?.primaryWritebackMode === 'clear_debt' &&
        JSON.stringify(rewardSeasonBoard?.debtPack || null) === JSON.stringify(expeditionSeasonBoard?.debtPack || null) &&
        JSON.stringify(rewardSeasonBoard?.debtPack || null) === JSON.stringify(chapterSeasonBoard?.debtPack || null) &&
        JSON.stringify(rewardSeasonBoard?.weekVerdictLedger || null) === JSON.stringify(expeditionSeasonBoard?.weekVerdictLedger || null) &&
        JSON.stringify(rewardSeasonBoard?.weekVerdictLedger || null) === JSON.stringify(chapterSeasonBoard?.weekVerdictLedger || null),
      rewardHeaderOutcome: screen?.dataset?.rewardHeaderOutcome || '',
      rewardNextActionSource: screen?.dataset?.rewardNextActionSource || '',
      rewardSeasonBoard,
      expeditionSeasonBoard,
      chapterSeasonBoard,
      rewardSeasonBoardText,
      rewardSeasonBoardChipText,
      rewardSeasonBoardDebtText,
      rewardSeasonBoardVerificationText,
      rewardSeasonBoardFollowupText,
      rewardSeasonBoardActionText,
      rewardWeekVerdictLedger,
    };
  });
  add(
    'reward screen surfaces explicit debt clear writeback across settlement, debt record and week ledger mirrors',
    !!rewardDebtClearProbe?.ok,
    JSON.stringify(rewardDebtClearProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-debt-clear-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const rewardDegradeProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player?.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    if (game.player) {
      game.player.getStealBonus = () => 0;
    }
    const originalBuildChallengeBundle = typeof game.buildChallengeBundle === 'function'
      ? game.buildChallengeBundle.bind(game)
      : null;
    game.buildChallengeBundle = (mode, dateRef) => {
      if (mode !== 'weekly') {
        return originalBuildChallengeBundle ? originalBuildChallengeBundle(mode, dateRef) : null;
      }
      return {
        mode: 'weekly',
        meta: {
          title: '观星台 · 七日劫数',
          subtitle: '围绕同一套命盘反复冲分，把高分答卷压成观星档案。',
          label: '七日劫数',
          accentClass: 'weekly'
        },
        rule: {
          id: 'degrade_probe_rule',
          name: '镜债反证劫数',
          objective: '围绕镜债反证反复冲分，确认这条旧债是否还值得继续压。',
          goalRealm: 3
        },
        rotationKey: '2026-W16',
        rotationLabel: '本周题面 · 镜债反证',
        seedSignature: 'W-DEGRADE-PROBE',
        progress: {
          completions: 1,
          bestScore: 212,
          totalScore: 212
        },
        records: [],
        rewards: [
          {
            id: 'degrade_probe_rule_reward_1',
            label: '累计 180 分',
            target: 180,
            claimed: false
          }
        ]
      };
    };
    const degradedRewardSlate = {
      id: 'reward_degrade_probe',
      chapterIndex: 6,
      chapterName: '第 6 章·镜债反证',
      endingId: 'research_debt',
      endingName: '镜债待清',
      endingIcon: '📚',
      score: 227,
      branchName: '镜债反证',
      tags: ['课题·推演控场', '答卷·镜债待清'],
      answerReview: {
        ratingLabel: '留痕待补',
        ratingTone: 'selected',
        trainingAdvice: '这笔镜债需要主验证给出明确结论，先别急着继续扩样。',
        highlightLine: '旧债还没清干净，先看高压验证会给出清账还是反证。'
      },
      practiceTopic: {
        id: 'reward_degrade_probe_topic',
        sourceRecordId: 'reward_degrade_probe_guide',
        sourceTitle: '镜债反证',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '先确认旧债是否能被真正修正，再决定要不要继续压这条主轴。',
        trainingTags: ['镜债回流', '反证筛查'],
        goalLines: ['先把主验证做完，再决定镜债是清账还是降级']
      },
      observatoryLink: {
        sourceRecordId: 'reward_degrade_probe_guide',
        sourceTitle: '镜债反证',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '先确认旧债是否能被真正修正，再决定要不要继续压这条主轴。',
        trainingTags: ['镜债回流', '反证筛查'],
        drillObjective: '先把主验证做完，再决定镜债是清账还是降级。'
      },
      timestamp: Date.now()
    };
    game.runSlateArchive = typeof game.normalizeRunSlateArchive === 'function'
      ? game.normalizeRunSlateArchive([degradedRewardSlate])
      : [degradedRewardSlate];
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    if (typeof game.buildObservatoryTrainingFocusFromSlate === 'function' && typeof game.setObservatoryTrainingFocus === 'function') {
      const focus = game.buildObservatoryTrainingFocusFromSlate(degradedRewardSlate);
      if (focus) game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    if (typeof game.normalizeSanctumAgendaState === 'function') {
      game.sanctumAgendaState = game.normalizeSanctumAgendaState({
        lastResolved: {
          agendaId: 'reward_degrade_probe_agenda',
          icon: '🧮',
          name: '镜债反证',
          sourceRunId: degradedRewardSlate.id,
          sourceTitle: '镜债反证',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          ratingLabel: '留痕待补',
          ratingTone: 'selected',
          trainingAdvice: '这笔镜债需要主验证给出明确结论，先别急着继续扩样。',
          highlightLine: '旧债还没清干净，先看高压验证会给出清账还是反证。',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          focusNodeTypes: ['observatory', 'event', 'memory_rift'],
          focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
          progress: 1,
          target: 3,
          selectedDecisionLabel: '保卷回收',
          selectedDecisionLine: '先保住残卷，再确认这条镜债主轴是否还值得继续压。',
          selectedContractLabel: '镜债锁线',
          selectedContractLine: '锁住观星 / 事件 / 裂隙线路，但欠下一笔清账任务。',
          contractResolved: true,
          contractSuccess: false,
          contractResolutionLine: '锁线契约：镜债锁线未兑现 · 契押：🔮 1',
          contractSignCostLine: '🔮 1',
          outcome: 'failed',
          outcomeLabel: '研究未成',
          grantedLine: '',
          reasonLine: '这笔镜债还没被真正修正，若高压验证继续失利，就该先转成反证处理。',
          summaryLine: '镜债反证说明旧债仍未真正清账。',
          recoveryEligible: true,
          recoveryLabel: '残卷回收',
          recoveryTier: 'partial',
          recoveryTierLabel: '轻回收',
          recoveryLine: '洞府已回收一部分残卷，但这笔镜债仍待主验证给出明确结论。',
          recoveryHintLine: '无尽或天道榜主验证通过前，这笔镜债都还不能释放强目标。',
          rewardTrackId: 'observatory',
          rewardTrackName: '命盘档案室',
          rewardTrackIcon: '🔭'
        },
        history: [],
        totalCompleted: 0,
        totalFailed: 1
      });
    }
    if (typeof game.normalizeFateAftereffectState === 'function') {
      game.fateAftereffectState = game.normalizeFateAftereffectState({
        records: [],
        history: [],
        lastResolved: {
          recordId: 'reward_degrade_probe_aftereffect',
          icon: '🩸',
          name: '镜债回流',
          sourceRunId: degradedRewardSlate.id,
          sourceAgendaId: 'reward_degrade_probe_agenda',
          sourceLabel: '镜债反证',
          templateId: 'risk_bias',
          outcomeId: 'recovery',
          chapterIndex: degradedRewardSlate.chapterIndex,
          chapterName: degradedRewardSlate.chapterName,
          durationChapters: 2,
          positiveLine: '先清账再扩线。',
          negativeLine: '若继续强压，会把旧债拖成跨周风险。',
          summaryLine: '镜债回流：旧债仍未真正清账。',
          detailLine: '研究债账仍在回流，需要主验证给出真正写回。',
          createdAt: Date.now() - (7 * 24 * 60 * 60 * 1000)
        }
      });
    }
    const endlessState = typeof game.ensureEndlessState === 'function' ? game.ensureEndlessState() : null;
    const weekMeta = typeof game.getHeavenlyMandateWeekMeta === 'function'
      ? game.getHeavenlyMandateWeekMeta()
      : null;
    if (endlessState) {
      endlessState.currentCycle = 1;
      endlessState.seasonWeekTag = weekMeta?.weekTag || endlessState.seasonWeekTag || '';
      endlessState.seasonCycleClears = 0;
      endlessState.seasonScore = 0;
    }
    if (typeof game.recordSeasonVerificationResult === 'function') {
      game.recordSeasonVerificationResult({
        recordId: `browser_reward_degrade_${weekMeta?.weekTag || 'current'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'primary',
        sourceMode: 'pvp',
        sourceModeLabel: '天道榜',
        label: '天道榜反证',
        resultStatus: 'failed',
        writebackMode: 'degrade',
        writebackLine: '天道榜给出了反证，本周押卷会先转入险卷/反例处理。',
        resolvedRunId: 'browser_reward_degrade',
        chapterIndex: degradedRewardSlate.chapterIndex,
        proofQuality: 'thin',
        lineageStyle: '镜战压强',
        summaryLine: '天道榜给出反证，这条旧债路线还不足以重新定榜。',
        detailLine: '镜战题面说明这条旧债路线还没完成真正修正。',
        statusLine: '天道榜 · 反证已入账',
        anchorSection: 'pvp',
        priority: 1
      });
    }
    if (typeof game.buildRewardExpeditionMeta === 'function') {
      game.lastExpeditionRewardMeta = game.buildRewardExpeditionMeta(degradedRewardSlate);
    }
    game.currentBattleNode = { type: 'elite', id: 990004, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_degrade_probe',
        themeName: '轮段·镜债反证',
        tierStage: 2,
        goldBonus: 16,
        ringExpBonus: 10,
      },
    };
    game.showRewardScreen(128, true, { stealLaw: lawId, stealChance: 1 }, 26, { insight: 7, karma: 2 });

    let rewardPayload = {};
    try {
      rewardPayload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      rewardPayload = {};
    }
    const screen = document.getElementById('reward-screen');
    const expeditionPanel = document.getElementById('reward-expedition-meta');
    const subtitle = document.querySelector('#reward-screen .reward-subtitle');
    const rewardSeasonBoard = rewardPayload?.reward?.expedition?.seasonBoard || null;
    const expeditionSeasonBoard = rewardPayload?.expedition?.seasonBoard || null;
    const chapterSeasonBoard = rewardPayload?.map?.chapter?.seasonBoard || null;
    const rewardSeasonBoardChipText = Array.from(document.querySelectorAll('#reward-expedition-meta [data-season-board-chip]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const rewardSeasonBoardActionCount = document.querySelectorAll('#reward-expedition-meta [data-season-board-action-reward="true"]').length;
    const rewardSeasonBoardActionText = (document.querySelector('[data-season-board-action-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardVerificationText = (document.querySelector('[data-season-board-verification-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardDebtText = (document.querySelector('[data-season-board-debt-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardNextTaskText = (document.querySelector('[data-season-board-next-task-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFollowupText = (document.querySelector('[data-season-board-verification-followup="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardWeekVerdictLedger = rewardSeasonBoard?.weekVerdictLedger?.current || null;

    return {
      ok:
        !!rewardSeasonBoard &&
        rewardSeasonBoard?.settlement?.outcomeId === 'risky_sheet' &&
        rewardSeasonBoard?.settlement?.resolvedStatus === 'failed' &&
        rewardSeasonBoard?.debtPack?.status === 'degraded' &&
        rewardSeasonBoard?.debtPack?.occupiesStrongSlot === false &&
        !!rewardSeasonBoard?.verificationOrders?.[0]?.summaryLine &&
        Array.isArray(rewardSeasonBoard?.verificationOrders) &&
        rewardSeasonBoard.verificationOrders.length === 2 &&
        rewardSeasonBoard?.verificationOrders?.[0]?.resultStatus === 'failed' &&
        rewardSeasonBoard?.verificationOrders?.[0]?.writebackMode === 'degrade' &&
        rewardSeasonBoard?.verificationOrders?.[0]?.anchorSection === 'pvp' &&
        rewardSeasonBoard.verificationOrders?.[1]?.anchorSection === 'challenge' &&
        screen?.dataset?.rewardHeaderOutcome === 'risky_sheet' &&
        screen?.dataset?.rewardNextActionSource === 'verification' &&
        expeditionPanel?.dataset?.seasonBoardOutcome === 'risky_sheet' &&
        expeditionPanel?.dataset?.seasonBoardActionSource === 'verification' &&
        expeditionPanel?.dataset?.seasonBoardVerificationVisible === 'true' &&
        rewardSeasonBoardActionCount === 1 &&
        /反证|险卷|验证/.test(subtitle?.textContent || '') &&
        rewardSeasonBoardActionText.includes(
          rewardSeasonBoard.verificationOrders?.[0]?.summaryLine
            || rewardSeasonBoard.verificationOrders?.[0]?.hintLine
            || ''
        ) &&
        rewardSeasonBoardDebtText.includes(rewardSeasonBoard.debtPack.summaryLine || '') &&
        rewardSeasonBoardVerificationText.includes(
          rewardSeasonBoard.verificationOrders?.[0]?.summaryLine
            || rewardSeasonBoard.verificationOrders?.[0]?.hintLine
            || ''
        ) &&
        rewardSeasonBoardChipText.includes('验证') &&
        rewardSeasonBoardChipText.includes('债账') &&
        /旁验证|七日劫数/.test(rewardSeasonBoardFollowupText) &&
        rewardSeasonBoardFollowupText.includes(
          rewardSeasonBoard.verificationOrders?.[1]?.label
          || rewardSeasonBoard.verificationOrders?.[1]?.summaryLine
          || '七日劫数'
        ) &&
        (
          !rewardSeasonBoard?.nextTask
          || rewardSeasonBoardNextTaskText.includes(
            rewardSeasonBoard.nextTask?.label
              || rewardSeasonBoard.nextTask?.hintLine
              || ''
          )
        ) &&
        rewardWeekVerdictLedger?.resolvedStatus === 'failed' &&
        rewardWeekVerdictLedger?.primaryVerificationResultStatus === 'failed' &&
        rewardWeekVerdictLedger?.primaryWritebackMode === 'degrade' &&
        JSON.stringify(rewardSeasonBoard?.debtPack || null) === JSON.stringify(expeditionSeasonBoard?.debtPack || null) &&
        JSON.stringify(rewardSeasonBoard?.debtPack || null) === JSON.stringify(chapterSeasonBoard?.debtPack || null),
      rewardHeaderOutcome: screen?.dataset?.rewardHeaderOutcome || '',
      rewardNextActionSource: screen?.dataset?.rewardNextActionSource || '',
      subtitleText: subtitle?.textContent?.replace(/\s+/g, ' ').trim() || '',
      rewardSeasonBoard,
      expeditionSeasonBoard,
      chapterSeasonBoard,
      rewardSeasonBoardChipText,
      rewardSeasonBoardActionCount,
      rewardSeasonBoardActionText,
      rewardSeasonBoardVerificationText,
      rewardSeasonBoardDebtText,
      rewardSeasonBoardNextTaskText,
      rewardSeasonBoardFollowupText,
      rewardWeekVerdictLedger,
    };
  });
  add(
    'reward screen surfaces failed primary writeback as a degraded debt record and risky settlement',
    !!rewardDegradeProbe?.ok,
    JSON.stringify(rewardDegradeProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-degrade-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const rewardSideVerificationProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player?.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    if (game.player) {
      game.player.getStealBonus = () => 0;
    }
    const originalBuildChallengeBundle = typeof game.buildChallengeBundle === 'function'
      ? game.buildChallengeBundle.bind(game)
      : null;
    game.buildChallengeBundle = (mode, dateRef) => {
      if (mode !== 'weekly') {
        return originalBuildChallengeBundle ? originalBuildChallengeBundle(mode, dateRef) : null;
      }
      return {
        mode: 'weekly',
        meta: {
          title: '观星台 · 七日劫数',
          subtitle: '围绕同一套命盘反复冲分，把高分答卷压成观星档案。',
          label: '七日劫数',
          accentClass: 'weekly'
        },
        rule: {
          id: 'side_verification_probe_rule',
          name: '险卷旁证劫数',
          objective: '围绕险卷旁证反复冲分，为当前主练补一张挑战旁证。',
          goalRealm: 4
        },
        rotationKey: '2026-W16',
        rotationLabel: '本周题面 · 险卷旁证',
        seedSignature: 'W-SIDE-VERIFICATION-PROBE',
        progress: {
          completions: 1,
          bestScore: 412,
          totalScore: 412
        },
        records: [],
        rewards: [
          {
            id: 'side_verification_probe_rule_reward_1',
            label: '累计 360 分',
            target: 360,
            claimed: false
          }
        ]
      };
    };
    const sideVerificationRewardSlate = {
      id: 'reward_side_verification_probe',
      chapterIndex: 6,
      chapterName: '第 6 章·险卷归档',
      endingId: 'risky_rank',
      endingName: '险卷待定',
      endingIcon: '⚖️',
      score: 241,
      branchName: '险卷旁证',
      tags: ['课题·推演控场', '答卷·险卷待证'],
      answerReview: {
        ratingLabel: '定榜样本',
        ratingTone: 'selected',
        trainingAdvice: '先给当前险卷补一张挑战旁证，但别把它当成主验证的替代品。',
        highlightLine: '路线已经成形，这周可以先补一张周挑战旁证稳住建议。'
      },
      practiceTopic: {
        id: 'reward_side_verification_probe_topic',
        sourceRecordId: 'reward_side_verification_probe_guide',
        sourceTitle: '险卷旁证',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：试炼 / 精英 / 战斗 / 禁术',
        compareHint: '先补一张不同节奏的挑战旁证，再决定要不要把主验证送去更高压环境。',
        trainingTags: ['旁证', '挑战复盘'],
        goalLines: ['先补旁证，再决定去无尽还是天道榜做主验证']
      },
      observatoryLink: {
        sourceRecordId: 'reward_side_verification_probe_guide',
        sourceTitle: '险卷旁证',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：试炼 / 精英 / 战斗 / 禁术',
        compareHint: '先补一张不同节奏的挑战旁证，再决定要不要把主验证送去更高压环境。',
        trainingTags: ['旁证', '挑战复盘'],
        drillObjective: '先补旁证，再决定去无尽还是天道榜做主验证。'
      },
      timestamp: Date.now()
    };
    game.runSlateArchive = typeof game.normalizeRunSlateArchive === 'function'
      ? game.normalizeRunSlateArchive([sideVerificationRewardSlate])
      : [sideVerificationRewardSlate];
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    if (typeof game.buildObservatoryTrainingFocusFromSlate === 'function' && typeof game.setObservatoryTrainingFocus === 'function') {
      const focus = game.buildObservatoryTrainingFocusFromSlate(sideVerificationRewardSlate);
      if (focus) game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    const endlessState = typeof game.ensureEndlessState === 'function' ? game.ensureEndlessState() : null;
    const weekMeta = typeof game.getHeavenlyMandateWeekMeta === 'function'
      ? game.getHeavenlyMandateWeekMeta()
      : null;
    if (endlessState) {
      endlessState.currentCycle = 1;
      endlessState.seasonWeekTag = weekMeta?.weekTag || endlessState.seasonWeekTag || '';
      endlessState.seasonCycleClears = 0;
      endlessState.seasonScore = 0;
    }
    if (typeof game.recordSeasonVerificationResult === 'function') {
      game.recordSeasonVerificationResult({
        recordId: `browser_reward_side_verification_${weekMeta?.weekTag || 'current'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'side',
        sourceMode: 'challenge',
        sourceModeLabel: '七日劫数',
        label: '七日劫数旁证',
        resultStatus: 'verified',
        writebackMode: 'boost_recommendation',
        writebackLine: '周挑战旁证已经回写，季盘会更偏向当前主修并给出更稳的复盘建议。',
        resolvedRunId: 'browser_reward_side_verification',
        chapterIndex: sideVerificationRewardSlate.chapterIndex,
        proofQuality: 'thin',
        lineageStyle: '推演控场',
        summaryLine: '七日劫数已经补上一张稳定旁证，这周主练不再只靠单一路线说话。',
        detailLine: '挑战旁证会强化赛季推荐，但不会直接替代主验证。',
        statusLine: '七日劫数 · 已归档 412 分',
        anchorSection: 'challenge',
        priority: 2
      });
    }
    if (typeof game.buildRewardExpeditionMeta === 'function') {
      game.lastExpeditionRewardMeta = game.buildRewardExpeditionMeta(sideVerificationRewardSlate);
    }
    game.currentBattleNode = { type: 'elite', id: 990005, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_side_verification_probe',
        themeName: '轮段·险卷旁证',
        tierStage: 3,
        goldBonus: 20,
        ringExpBonus: 12,
      },
    };
    game.showRewardScreen(156, true, { stealLaw: lawId, stealChance: 1 }, 34, { insight: 10, karma: 3 });

    let rewardPayload = {};
    try {
      rewardPayload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      rewardPayload = {};
    }
    const screen = document.getElementById('reward-screen');
    const expeditionPanel = document.getElementById('reward-expedition-meta');
    const subtitle = document.querySelector('#reward-screen .reward-subtitle');
    const rewardSeasonBoard = rewardPayload?.reward?.expedition?.seasonBoard || null;
    const expeditionSeasonBoard = rewardPayload?.expedition?.seasonBoard || null;
    const chapterSeasonBoard = rewardPayload?.map?.chapter?.seasonBoard || null;
    const rewardSeasonBoardChipText = Array.from(document.querySelectorAll('#reward-expedition-meta [data-season-board-chip]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const rewardSeasonBoardActionCount = document.querySelectorAll('#reward-expedition-meta [data-season-board-action-reward="true"]').length;
    const rewardSeasonBoardActionText = (document.querySelector('[data-season-board-action-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardVerificationText = (document.querySelector('[data-season-board-verification-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardDebtText = (document.querySelector('[data-season-board-debt-reward="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardSeasonBoardFollowupText = (document.querySelector('[data-season-board-verification-followup="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const rewardPrimaryHandoff = expeditionPanel?.querySelector('[data-season-board-verification-reward="true"] [data-season-board-handoff-cta="true"]') || null;
    const rewardSideHandoff = expeditionPanel?.querySelector('[data-season-board-verification-followup="true"] [data-season-board-handoff-cta="true"]') || null;
    const rewardWeekVerdictLedger = rewardSeasonBoard?.weekVerdictLedger?.current || null;

    return {
      ok:
        !!rewardSeasonBoard &&
        rewardSeasonBoard?.settlement?.outcomeId === 'risky_sheet' &&
        rewardSeasonBoard?.settlement?.resolvedStatus === 'reinforced' &&
        rewardSeasonBoard?.debtPack == null &&
        Array.isArray(rewardSeasonBoard?.verificationOrders) &&
        rewardSeasonBoard.verificationOrders.length === 2 &&
        rewardSeasonBoard?.verificationOrders?.[1]?.resultStatus === 'verified' &&
        rewardSeasonBoard?.verificationOrders?.[1]?.writebackMode === 'boost_recommendation' &&
        rewardSeasonBoard.verificationOrders?.[1]?.anchorSection === 'challenge' &&
        screen?.dataset?.rewardHeaderOutcome === 'risky_sheet' &&
        screen?.dataset?.rewardNextActionSource === 'verification' &&
        expeditionPanel?.dataset?.seasonBoardOutcome === 'risky_sheet' &&
        expeditionPanel?.dataset?.seasonBoardActionSource === 'verification' &&
        expeditionPanel?.dataset?.seasonBoardVerificationVisible === 'true' &&
        rewardSeasonBoardActionCount === 1 &&
        /旁证|险卷|验证/.test(subtitle?.textContent || '') &&
        rewardSeasonBoardActionText.includes(
          rewardSeasonBoard.verificationOrders?.[0]?.summaryLine
            || rewardSeasonBoard.verificationOrders?.[0]?.hintLine
            || ''
        ) &&
        rewardSeasonBoardVerificationText.includes(
          rewardSeasonBoard.verificationOrders?.[0]?.summaryLine
            || rewardSeasonBoard.verificationOrders?.[0]?.hintLine
            || ''
        ) &&
        rewardSeasonBoardChipText.includes('验证') &&
        !rewardSeasonBoardChipText.includes('债账') &&
        !rewardSeasonBoardDebtText &&
        /旁验证|七日劫数/.test(rewardSeasonBoardFollowupText) &&
        rewardSeasonBoardFollowupText.includes(
          rewardSeasonBoard.verificationOrders?.[1]?.summaryLine
          || rewardSeasonBoard.verificationOrders?.[1]?.label
          || '七日劫数'
        ) &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffSourceKey === 'verification' &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffAction === rewardSeasonBoard.nextWeekGoal?.action &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffValue === rewardSeasonBoard.nextWeekGoal?.value &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffSource === rewardSeasonBoard.nextWeekGoal?.source &&
        rewardPrimaryHandoff?.dataset?.seasonBoardHandoffSourceId === rewardSeasonBoard.nextWeekGoal?.sourceId &&
        rewardSideHandoff?.dataset?.seasonBoardHandoffSourceKey === 'sideVerification' &&
        rewardSideHandoff?.dataset?.seasonBoardHandoffAction === 'challenge' &&
        rewardSideHandoff?.dataset?.seasonBoardHandoffValue === 'weekly' &&
        rewardSideHandoff?.dataset?.seasonBoardHandoffSourceId === rewardSeasonBoard.verificationOrders?.[1]?.id &&
        rewardWeekVerdictLedger?.resolvedStatus === 'reinforced' &&
        rewardWeekVerdictLedger?.sideVerificationResultStatus === 'verified' &&
        rewardWeekVerdictLedger?.sideWritebackMode === 'boost_recommendation' &&
        JSON.stringify(rewardSeasonBoard?.weekVerdictLedger || null) === JSON.stringify(expeditionSeasonBoard?.weekVerdictLedger || null) &&
        JSON.stringify(rewardSeasonBoard?.weekVerdictLedger || null) === JSON.stringify(chapterSeasonBoard?.weekVerdictLedger || null),
      rewardHeaderOutcome: screen?.dataset?.rewardHeaderOutcome || '',
      rewardNextActionSource: screen?.dataset?.rewardNextActionSource || '',
      subtitleText: subtitle?.textContent?.replace(/\s+/g, ' ').trim() || '',
      rewardSeasonBoard,
      expeditionSeasonBoard,
      chapterSeasonBoard,
      rewardSeasonBoardChipText,
      rewardSeasonBoardActionCount,
      rewardSeasonBoardActionText,
      rewardSeasonBoardVerificationText,
      rewardSeasonBoardDebtText,
      rewardSeasonBoardFollowupText,
      rewardPrimaryHandoffDataset: rewardPrimaryHandoff ? { ...rewardPrimaryHandoff.dataset } : null,
      rewardSideHandoffDataset: rewardSideHandoff ? { ...rewardSideHandoff.dataset } : null,
      rewardWeekVerdictLedger,
    };
  });
  add(
    'reward screen surfaces side verification writeback as a reinforcement, not a replacement for primary proof',
    !!rewardSideVerificationProbe?.ok,
    JSON.stringify(rewardSideVerificationProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-side-verification-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const rewardMobileProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player?.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    if (game.player) {
      game.player.getStealBonus = () => 0;
    }
    const originalBuildChallengeBundle = typeof game.buildChallengeBundle === 'function'
      ? game.buildChallengeBundle.bind(game)
      : null;
    game.buildChallengeBundle = (mode, dateRef) => {
      if (mode !== 'weekly') {
        return originalBuildChallengeBundle ? originalBuildChallengeBundle(mode, dateRef) : null;
      }
      return {
        mode: 'weekly',
        meta: {
          title: '观星台 · 七日劫数',
          subtitle: '围绕同一套命盘反复冲分，把高分答卷压成观星档案。',
          label: '七日劫数',
          accentClass: 'weekly'
        },
        rule: {
          id: 'mobile_positive_probe_rule',
          name: '移动端周劫复盘',
          objective: '围绕移动端周劫复盘继续冲分，确认正卷旁验证在窄屏下也能完整消费。',
          goalRealm: 4
        },
        rotationKey: '2026-W16',
        rotationLabel: '本周题面 · 七日劫数旁证',
        seedSignature: 'W-MOBILE-PROBE',
        progress: {
          completions: 1,
          bestScore: 420,
          totalScore: 420
        },
        records: [],
        rewards: [
          {
            id: 'mobile_positive_probe_rule_reward_1',
            label: '累计 360 分',
            target: 360,
            claimed: false
          }
        ]
      };
    };
    const positiveRewardSlate = {
      id: 'reward_mobile_positive_probe',
      chapterIndex: 6,
      chapterName: '第 6 章·正卷归档',
      endingId: 'positive_rank',
      endingName: '正卷扩样',
      endingIcon: '🧾',
      score: 268,
      branchName: '正卷扩样',
      tags: ['课题·推演控场', '答卷·正卷扩样'],
      answerReview: {
        ratingLabel: '天象合卷',
        ratingTone: 'completed',
        trainingAdvice: '当前正卷已经站住脚，可以继续补更高分样本或开始冲定榜验证。',
        highlightLine: '这轮押卷已经过了第一条高压证明，接下来更适合扩样而不是补债。'
      },
      practiceTopic: {
        id: 'reward_mobile_positive_probe_topic',
        sourceRecordId: 'reward_mobile_positive_probe_guide',
        sourceTitle: '正卷试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 试炼 / 精英',
        compareHint: '先确认正卷已经站住，再决定继续冲榜还是补更高分样本。',
        trainingTags: ['扩样', '冲榜'],
        goalLines: ['继续扩大定榜样本，而不是回头清债']
      },
      observatoryLink: {
        sourceRecordId: 'reward_mobile_positive_probe_guide',
        sourceTitle: '正卷试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 试炼 / 精英',
        compareHint: '先确认正卷已经站住，再决定继续冲榜还是补更高分样本。',
        trainingTags: ['扩样', '冲榜'],
        drillObjective: '继续扩大定榜样本，而不是回头清债。'
      },
      timestamp: Date.now()
    };
    game.runSlateArchive = typeof game.normalizeRunSlateArchive === 'function'
      ? game.normalizeRunSlateArchive([positiveRewardSlate])
      : [positiveRewardSlate];
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    if (typeof game.buildObservatoryTrainingFocusFromSlate === 'function' && typeof game.setObservatoryTrainingFocus === 'function') {
      const focus = game.buildObservatoryTrainingFocusFromSlate(positiveRewardSlate);
      if (focus) game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    const endlessState = typeof game.ensureEndlessState === 'function' ? game.ensureEndlessState() : null;
    if (endlessState) {
      const weekMeta = typeof game.getHeavenlyMandateWeekMeta === 'function' ? game.getHeavenlyMandateWeekMeta() : null;
      endlessState.currentCycle = 1;
      endlessState.seasonWeekTag = weekMeta?.weekTag || endlessState.seasonWeekTag || '';
      endlessState.seasonCycleClears = 1;
      endlessState.seasonScore = 188;
    }
    if (typeof game.buildRewardExpeditionMeta === 'function') {
      game.lastExpeditionRewardMeta = game.buildRewardExpeditionMeta(positiveRewardSlate);
    }
    game.currentBattleNode = { type: 'elite', id: 990002, completed: false };
    game.stealAttempted = false;
    game.lastBattleRewardMeta = {
      encounter: {
        themeId: 'theme_mobile_positive_probe',
        themeName: '轮段·移动端正卷扩样',
        tierStage: 3,
        goldBonus: 18,
        ringExpBonus: 9,
      },
    };
    game.showRewardScreen(145, true, { stealLaw: lawId, stealChance: 1 }, 32, { insight: 8, karma: 3 });
    const main = document.querySelector('.reward-main-column');
    const side = document.querySelector('.reward-side-column');
    const actions = document.querySelector('.reward-actions');
    const expeditionPanel = document.getElementById('reward-expedition-meta');
    const cards = Array.from(document.querySelectorAll('#reward-cards .card'));
    const verificationCard = document.querySelector('[data-season-board-verification-reward="true"]');
    const verificationFollowup = document.querySelector('[data-season-board-verification-followup="true"]');
    const rewardScreen = document.getElementById('reward-screen');
    if (!main || !side || !actions || !expeditionPanel || cards.length < 2) return { ok: false, reason: 'missing_reward_mobile_nodes' };
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    const actionsRect = toRect(actions);
    const cardRects = cards.map((card) => toRect(card));
    const expeditionPanelRect = toRect(expeditionPanel);
    const verificationCardRect = verificationCard ? toRect(verificationCard) : null;
    const verificationFollowupRect = verificationFollowup ? toRect(verificationFollowup) : null;
    const verificationText = (verificationCard?.textContent || '').replace(/\s+/g, ' ').trim();
    const followupText = (verificationFollowup?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok:
        sideRect.top >= mainRect.bottom - 6 &&
        cardRects.every((rect) => rect.left >= mainRect.left - 4 && rect.right <= mainRect.right + 4) &&
        actionsRect.width <= sideRect.width + 2 &&
        rewardScreen?.dataset?.rewardNextActionSource === 'verification' &&
        expeditionPanel?.dataset?.seasonBoardVerificationVisible === 'true' &&
        !!verificationCard &&
        !!verificationFollowup &&
        /扩大本周定榜样本/.test(verificationText) &&
        /旁验证|七日劫数/.test(followupText) &&
        expeditionPanel.scrollWidth <= expeditionPanel.clientWidth + 2 &&
        main.scrollWidth <= main.clientWidth + 2 &&
        side.scrollWidth <= side.clientWidth + 2 &&
        verificationCardRect?.right <= expeditionPanelRect.right + 2 &&
        verificationFollowupRect?.right <= expeditionPanelRect.right + 2,
      mainRect,
      sideRect,
      actionsRect,
      cardRects,
      expeditionPanelRect,
      verificationCardRect,
      verificationFollowupRect,
      verificationText,
      followupText,
    };
  });
  add(
    'reward screen stacks into a single readable column on mobile',
    !!rewardMobileProbe?.ok,
    JSON.stringify(rewardMobileProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-layout-mobile.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.click('button[onclick="game.showAchievements()"]', { timeout: 5000, force: true });
  await page.waitForTimeout(400);
  const achievementsProbe = await page.evaluate(() => {
    const header = document.querySelector('#achievements-screen .screen-header');
    const container = document.getElementById('achievements-container');
    const firstCategory = document.querySelector('.achievement-category');
    const firstItem = document.querySelector('.achievement-card');
    if (!header || !container || !firstCategory || !firstItem) return { ok: false, reason: 'missing_achievement_nodes' };
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const headerRect = toRect(header);
    const containerRect = toRect(container);
    const firstItemRect = toRect(firstItem);
    return {
      ok:
        containerRect.top >= headerRect.bottom - 8 &&
        containerRect.width >= 1000 &&
        firstItemRect.left >= containerRect.left - 2 &&
        firstItemRect.right <= containerRect.right + 2,
      headerRect,
      containerRect,
      firstItemRect,
      categories: document.querySelectorAll('.achievement-category').length,
      items: document.querySelectorAll('.achievement-card').length,
    };
  });
  add(
    'achievements screen uses a centered container without clipping the first grid row',
    !!achievementsProbe?.ok,
    JSON.stringify(achievementsProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'achievements-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const realmSelectScrollProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.unlockedRealms = Array.from({ length: 18 }, (_, index) => index + 1);
    const endlessState = typeof game.ensureEndlessState === 'function' ? game.ensureEndlessState() : null;
    if (endlessState) {
      endlessState.unlocked = true;
      endlessState.active = false;
      endlessState.currentCycle = 1;
    }
    game.showScreen('realm-select-screen');
    if (typeof game.initRealmSelect === 'function') game.initRealmSelect();
    if (typeof game.selectRealm === 'function') game.selectRealm('endless');

    const layout = document.querySelector('#realm-select-screen .realm-select-layout');
    const list = document.getElementById('realm-list-container');
    const panel = document.getElementById('realm-preview-panel');
    const content = panel?.querySelector('.realm-preview-content');
    const enterBtn = document.getElementById('enter-realm-btn');
    if (!layout || !list || !panel || !content || !enterBtn) return { ok: false, reason: 'missing_realm_nodes' };

    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };

    const layoutRect = toRect(layout);
    const listRect = toRect(list);
    const panelRect = toRect(panel);
    const buttonRectBefore = toRect(enterBtn);
    const listScrollable = list.scrollHeight > list.clientHeight + 20;
    const panelScrollable = panel.scrollHeight > panel.clientHeight + 20;

    list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
    panel.scrollTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
    const listScrolled = list.scrollTop > 0;
    const panelScrolled = panel.scrollTop > 0;
    const buttonRectAfter = toRect(enterBtn);

    return {
      ok:
        layoutRect.bottom <= window.innerHeight + 2 &&
        listRect.bottom <= layoutRect.bottom + 2 &&
        panelRect.bottom <= layoutRect.bottom + 2 &&
        listScrollable &&
        panelScrollable &&
        listScrolled &&
        panelScrolled &&
        buttonRectAfter.bottom <= panelRect.bottom + 2,
      layoutRect,
      listRect,
      panelRect,
      buttonRectBefore,
      buttonRectAfter,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      listScrollTop: list.scrollTop,
      panelClientHeight: panel.clientHeight,
      panelScrollHeight: panel.scrollHeight,
      panelScrollTop: panel.scrollTop,
      activeRealm: document.querySelector('.realm-card.active')?.getAttribute('data-id') || null,
    };
  });
  add(
    'realm select screen keeps list and preview panel independently scrollable',
    !!realmSelectScrollProbe?.ok,
    JSON.stringify(realmSelectScrollProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'realm-select-scroll.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.click('button[onclick="game.showLegacyScreen()"]', { timeout: 5000, force: true });
  await page.waitForTimeout(450);
  const inheritanceProbe = await page.evaluate(() => {
    const header = document.querySelector('#inheritance-screen .screen-header');
    const container = document.querySelector('.inheritance-container');
    const summary = document.getElementById('inheritance-summary');
    const presets = document.getElementById('inheritance-presets');
    const grid = document.getElementById('inheritance-upgrade-grid');
    const actions = document.querySelector('.inheritance-actions');
    if (!header || !container || !summary || !presets || !grid || !actions) return { ok: false, reason: 'missing_inheritance_nodes' };
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const headerRect = toRect(header);
    const containerRect = toRect(container);
    const summaryRect = toRect(summary);
    const presetsRect = toRect(presets);
    const actionsRect = toRect(actions);
    return {
      ok:
        containerRect.top >= headerRect.bottom - 10 &&
        summaryRect.left >= containerRect.left - 2 &&
        presetsRect.left >= containerRect.left - 2 &&
        actionsRect.right <= containerRect.right + 2 &&
        document.querySelectorAll('.inheritance-preset-btn').length >= 4 &&
        document.querySelectorAll('.inheritance-card').length >= 4,
      headerRect,
      containerRect,
      summaryRect,
      presetsRect,
      actionsRect,
      presetCount: document.querySelectorAll('.inheritance-preset-btn').length,
      cardCount: document.querySelectorAll('.inheritance-card').length,
    };
  });
  add(
    'inheritance screen keeps summary, presets and upgrade grid inside a single readable shell',
    !!inheritanceProbe?.ok,
    JSON.stringify(inheritanceProbe || null)
  );
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const collectionProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    if (!game.player || !Array.isArray(game.player.collectedLaws)) {
      game.guestMode = true;
      game.startNewGame('linFeng');
    }
    if (typeof game.showCollection === 'function') game.showCollection();
    else {
      if (typeof game.initCollection === 'function') game.initCollection();
      game.showScreen('collection');
    }
    const main = document.querySelector('.codex-main-column');
    const side = document.querySelector('.codex-side-column');
    const summary = document.getElementById('law-codex-summary');
    const resonance = document.getElementById('law-codex-resonance-summary');
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!main || !side || !summary || !resonance) return { ok: false, reason: 'missing_codex_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    return {
      ok: mainRect.left < sideRect.left && sideRect.width >= 280 && /已收录/.test(summary.textContent || '') && /激活中/.test(resonance.textContent || ''),
      mainRect,
      sideRect,
      summaryText: (summary.textContent || '').replace(/\s+/g, ' ').trim(),
      resonanceText: (resonance.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'law codex uses reward-style main and side rails with live summary cards',
    !!collectionProbe?.ok,
    JSON.stringify(collectionProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'law-codex-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const lawCodexFilterProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    const fireLaw = typeof LAWS !== 'undefined' ? LAWS.flameTruth || Object.values(LAWS)[0] : null;
    const thunderLaw = typeof LAWS !== 'undefined' ? LAWS.thunderLaw || Object.values(LAWS)[1] : null;
    if (!fireLaw || !thunderLaw) return { ok: false, reason: 'missing_laws' };
    if (typeof game.player.collectLaw === 'function') {
      game.player.collectLaw(fireLaw);
      game.player.collectLaw(thunderLaw);
    }
    if (game.player?.fateRing) {
      game.player.fateRing.getSocketedLaws = () => [fireLaw.id, thunderLaw.id];
    }
    game.showCollection();
    if (typeof game.setLawCodexSearchQuery === 'function') game.setLawCodexSearchQuery('火');
    if (typeof game.setLawCodexStatusFilter === 'function') game.setLawCodexStatusFilter('owned');
    if (typeof game.setLawCodexElementFilter === 'function') game.setLawCodexElementFilter('fire');
    if (typeof game.setLawCodexResonanceFilter === 'function') game.setLawCodexResonanceFilter('active');
    const lawNames = Array.from(document.querySelectorAll('#law-archive-grid .law-item .law-name')).map((el) => (el.textContent || '').trim()).filter(Boolean);
    const resonanceNames = Array.from(document.querySelectorAll('#resonance-manual-list .resonance-title')).map((el) => (el.textContent || '').trim()).filter(Boolean);
    const summaryText = (document.getElementById('law-codex-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const resonanceText = (document.getElementById('law-codex-resonance-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const searchValue = document.getElementById('law-codex-search')?.value || '';
    return {
      ok:
        searchValue === '火' &&
        lawNames.length === 1 &&
        /火/.test(lawNames[0] || '') &&
        resonanceNames.length >= 1 &&
        /火属性/.test(summaryText) &&
        /已掌握/.test(summaryText) &&
        /当前结果/.test(resonanceText),
      searchValue,
      lawNames,
      resonanceNames,
      summaryText,
      resonanceText
    };
  });
  add(
    'law codex search and filters narrow visible laws and resonance chains',
    !!lawCodexFilterProbe?.ok,
    JSON.stringify(lawCodexFilterProbe || null)
  );

  const lawDetailProbe = await page.evaluate(() => {
    if (!window.game || !game.player) return { ok: false, reason: 'no_game' };
    const firstLaw = typeof LAWS !== 'undefined' ? LAWS.thunderLaw || Object.values(LAWS)[0] : null;
    const comboLaw = typeof LAWS !== 'undefined' ? LAWS.flameTruth || Object.values(LAWS)[1] : null;
    if (!firstLaw) return { ok: false, reason: 'no_law' };
    if (typeof game.player.collectLaw === 'function') {
      game.player.collectLaw(firstLaw);
      if (comboLaw) game.player.collectLaw(comboLaw);
    }
    if (game.player?.fateRing) {
      game.player.fateRing.getSocketedLaws = () => [firstLaw.id, comboLaw?.id].filter(Boolean);
    }
    if (typeof game.initCollection === 'function') game.initCollection();
    if (typeof game.showLawDetail === 'function') game.showLawDetail(firstLaw, true);
    const modal = document.getElementById('law-detail-modal');
    const main = modal ? modal.querySelector('.law-detail-main') : null;
    const side = modal ? modal.querySelector('.law-detail-side') : null;
    const passive = document.getElementById('law-detail-passive');
    const readiness = document.getElementById('law-detail-readiness');
    const readinessItems = readiness ? readiness.querySelectorAll('.law-readiness-item').length : 0;
    const chips = document.querySelectorAll('#law-detail-chips .detail-status-chip').length;
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!modal || !main || !side || !passive || !readiness) return { ok: false, reason: 'missing_law_modal_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    const actionButtons = readiness ? readiness.querySelectorAll('.law-readiness-btn').length : 0;
    const modalWasActive = modal.classList.contains('active');
    if (typeof game.handleLawReadinessAction === 'function') {
      game.handleLawReadinessAction('law', '', 'flameTruth');
    }
    const jumpedName = (document.getElementById('law-detail-name')?.textContent || '').trim();
    if (typeof game.handleLawReadinessAction === 'function') {
      game.handleLawReadinessAction('ring', 'plasmaOverload', '');
    }
    const ringActive = document.getElementById('ring-modal')?.classList.contains('active');
    return {
      ok:
        modalWasActive &&
        mainRect.left < sideRect.left &&
        chips >= 3 &&
        readinessItems >= 1 &&
        actionButtons >= 1 &&
        /已激活|待装配|差 1 枚/.test(readiness.textContent || '') &&
        /火/.test(jumpedName) &&
        !!ringActive &&
        (passive.textContent || '').trim().length > 0,
      mainRect,
      sideRect,
      chips,
      readinessItems,
      actionButtons,
      jumpedName,
      ringActive,
      passiveText: (passive.textContent || '').replace(/\s+/g, ' ').trim(),
      readinessText: (readiness.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'law detail modal uses the same main and side rail layout with passive and source summary',
    !!lawDetailProbe?.ok,
    JSON.stringify(lawDetailProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'law-detail-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const spiritCodexProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    game.selectedCharacterId = 'linFeng';
    if (typeof game.player.setSpiritCompanion === 'function') game.player.setSpiritCompanion('emberCrow', 1);
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('spirits');
    if (typeof game.setSpiritCodexSearchQuery === 'function') game.setSpiritCodexSearchQuery('烛鸦');
    if (typeof game.setSpiritCodexFocusFilter === 'function') game.setSpiritCodexFocusFilter('current');
    const activeTab = document.querySelector('#collection [data-collection-tab="spirits"]');
    const cards = document.querySelectorAll('#spirit-codex-grid .collection-card');
    const detailText = (document.getElementById('spirit-codex-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    const summaryText = (document.getElementById('spirit-codex-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const searchValue = document.getElementById('spirit-codex-search')?.value || '';
    return {
      ok:
        !!activeTab?.classList.contains('active') &&
        cards.length === 1 &&
        /烛鸦/.test(detailText) &&
        /血灯燎原|烬羽反啄/.test(detailText) &&
        /当前同行/.test(summaryText) &&
        searchValue === '烛鸦',
      cards: cards.length,
      searchValue,
      detailText,
      summaryText
    };
  });
  add(
    'spirit codex tab filters current spirit entries and renders detailed passive/active records',
    !!spiritCodexProbe?.ok,
    JSON.stringify(spiritCodexProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'spirit-codex-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const enemyCodexProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    game.player.maxRealmReached = Math.max(Number(game.player.maxRealmReached) || 1, 2);
    if (game.achievementSystem && typeof game.achievementSystem.updateStat === 'function') {
      game.achievementSystem.updateStat('realmCleared', 2, 'max');
    }
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('enemies');
    if (typeof game.setEnemyCodexSearchQuery === 'function') game.setEnemyCodexSearchQuery('墓羽鸦');
    if (typeof game.setEnemyCodexFocusFilter === 'function') game.setEnemyCodexFocusFilter('scouted');
    const cards = document.querySelectorAll('#enemy-codex-grid .collection-card');
    const detailText = (document.getElementById('enemy-codex-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    const summaryText = (document.getElementById('enemy-codex-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const searchValue = document.getElementById('enemy-codex-search')?.value || '';
    return {
      ok:
        cards.length === 1 &&
        /墓羽鸦/.test(detailText) &&
        /控场型/.test(detailText) &&
        /状态压制|净化|减益/.test(detailText) &&
        /敌影档案进度/.test(summaryText) &&
        searchValue === '墓羽鸦',
      cards: cards.length,
      searchValue,
      detailText,
      summaryText
    };
  });
  add(
    'enemy codex tab links tactical role, threat tags, and counterplay notes for scouted enemies',
    !!enemyCodexProbe?.ok,
    JSON.stringify(enemyCodexProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'enemy-codex-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const bossArchiveProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    if (game.achievementSystem && typeof game.achievementSystem.updateStat === 'function') {
      game.achievementSystem.updateStat('realmCleared', 12, 'max');
      game.achievementSystem.updateStat('bossesDefeated', 4, 'max');
    }
    if (typeof game.recordBossMemoryResult === 'function') game.recordBossMemoryResult('danZun', 'victory', 6);
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.recordRunPathBossSample === 'function' && typeof game.player?.getRunPathMeta === 'function') {
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'danZun',
        name: '丹尊',
        icon: '🗿',
        realm: 6
      }, {
        characterId: 'linFeng',
        turns: 4,
        completedAt: Date.now() - 1000
      });
    }
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('bosses');
    if (typeof game.setBossArchiveSearchQuery === 'function') game.setBossArchiveSearchQuery('丹尊');
    if (typeof game.setBossArchiveFocusFilter === 'function') game.setBossArchiveFocusFilter('all');
    const cards = document.querySelectorAll('#boss-archive-grid .collection-card');
    const detailText = (document.getElementById('boss-archive-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    const summaryText = (document.getElementById('boss-archive-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok:
        cards.length === 1 &&
        /丹尊/.test(detailText) &&
        /玄冰珠/.test(detailText) &&
        /灼烧|净化|冰/.test(detailText) &&
        /当前命途解法|窥命流|适配评级|留冗余手牌/.test(detailText) &&
        /章节场域/.test(detailText) &&
        /记忆战|已留痕|最快 6 回合/.test(detailText) &&
        /通关样本对照/.test(detailText) &&
        /自动推荐摘要|推荐角色|推荐套装/.test(detailText) &&
        /林风|林枫/.test(detailText) &&
        /4 回合/.test(detailText) &&
        /记忆战留痕/.test(summaryText) &&
        /Boss 档案进度/.test(summaryText) &&
        /样本对照/.test(summaryText),
      cards: cards.length,
      detailText,
      summaryText
    };
  });
  add(
    'boss archive tab links chapter boss mechanics with counter treasures and break-window notes',
    !!bossArchiveProbe?.ok,
    JSON.stringify(bossArchiveProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'boss-archive-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const bossMemoryFlowProbe = await page.evaluate(async () => {
    if (!window.game || !game.player || typeof game.startBossMemoryBattle !== 'function') return { ok: false, reason: 'no_memory_battle' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    if (game.achievementSystem && typeof game.achievementSystem.updateStat === 'function') {
      game.achievementSystem.updateStat('realmCleared', 12, 'max');
      game.achievementSystem.updateStat('bossesDefeated', 4, 'max');
    }
    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('bosses');
    if (typeof game.setBossArchiveSearchQuery === 'function') game.setBossArchiveSearchQuery('丹尊');
    const memoryBtn = document.querySelector('#boss-archive-detail .collection-inline-btn');
    if (!memoryBtn) return { ok: false, reason: 'missing_memory_button' };
    memoryBtn.click();
    const startedMode = game.currentScreen;
    const startedNodeType = game.currentBattleNode?.type || '';
    const startedBossName = game.battle?.enemies?.[0]?.name || '';
    if (typeof game.onBattleLost === 'function') {
      await game.onBattleLost();
    }
    const returnedMode = game.currentScreen;
    const rewardText = (document.getElementById('reward-message')?.textContent || '').replace(/\s+/g, ' ').trim();
    const detailText = (document.getElementById('boss-archive-detail')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      ok:
        startedMode === 'battle-screen' &&
        startedNodeType === 'boss_memory' &&
        /记忆战/.test(startedBossName) &&
        returnedMode === 'collection' &&
        /失败不会污染主线|累计试作/.test(rewardText) &&
        /试作/.test(detailText),
      startedMode,
      startedNodeType,
      startedBossName,
      returnedMode,
      rewardText,
      detailText
    };
  });
  add(
    'boss archive can launch a boss memory battle and return to the archive with trial records intact',
    !!bossMemoryFlowProbe?.ok,
    JSON.stringify(bossMemoryFlowProbe || null)
  );
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });

  const buildAndSanctumProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showCollection !== 'function') return { ok: false, reason: 'no_game' };
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    const firstLaw = typeof LAWS !== 'undefined' ? LAWS.flameTruth || Object.values(LAWS)[0] : null;
    const secondLaw = typeof LAWS !== 'undefined' ? LAWS.thunderLaw || Object.values(LAWS)[1] : null;
    if (firstLaw && typeof game.player.collectLaw === 'function') game.player.collectLaw(firstLaw);
    if (secondLaw && typeof game.player.collectLaw === 'function') game.player.collectLaw(secondLaw);
    if (typeof game.player.addTreasure === 'function') {
      game.player.addTreasure('soul_jade');
      game.player.addTreasure('ice_spirit_bead');
    }
    if (typeof game.player.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    if (typeof game.player.setSpiritCompanion === 'function') game.player.setSpiritCompanion('emberCrow', 1);
    if (game.player?.fateRing) {
      game.player.fateRing.getSocketedLaws = () => [firstLaw?.id, secondLaw?.id].filter(Boolean);
    }
    if (game.achievementSystem && typeof game.achievementSystem.unlockAchievement === 'function') {
      const firstAchievementId = typeof ACHIEVEMENTS !== 'undefined' ? Object.keys(ACHIEVEMENTS)[0] : null;
      if (firstAchievementId) game.achievementSystem.unlockAchievement(firstAchievementId);
      if (typeof game.achievementSystem.updateStat === 'function') {
        game.achievementSystem.updateStat('maxCombo', 9, 'max');
        game.achievementSystem.updateStat('singleDamage', 48, 'max');
      }
    }
    if (typeof game.recordBossMemoryResult === 'function') game.recordBossMemoryResult('danZun', 'victory', 5);
    if (typeof game.recordRunPathBossSample === 'function' && typeof game.player?.getRunPathMeta === 'function') {
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'danZun',
        name: '丹尊',
        icon: '🗿',
        realm: 6
      }, {
        characterId: 'linFeng',
        turns: 4,
        completedAt: Date.now() - 2000
      });
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'heavenlyDao',
        name: '天道',
        icon: '☯',
        realm: 18
      }, {
        characterId: 'linFeng',
        turns: 8,
        completedAt: Date.now() - 1000
      });
    }
    if (typeof game.recordRunPathCompletion === 'function' && typeof game.player?.getRunPathMeta === 'function') {
      game.recordRunPathCompletion(game.player.getRunPathMeta(), {
        completedAt: Date.now() - 500,
        realm: 6,
        characterId: 'linFeng',
        phaseMeta: { id: 'insight_final', title: '命盘问真' },
        rewardText: '天机 +2 / 灵石 +80'
      });
    }
    const lineageSlate = {
      id: 'audit-fate-lineage-slate',
      chapterIndex: 6,
      chapterName: '第 6 章·星镜归档',
      endingId: 'alliance',
      endingName: '星图合卷',
      endingIcon: '🔭',
      score: 268,
      branchName: '观测锁线',
      tags: ['课题·推演控场', '答卷·天象合卷'],
      answerReview: {
        ratingLabel: '天象合卷',
        ratingTone: 'completed',
        trainingAdvice: '继续沿观测锁线压路线贴合与控场节奏。',
        highlightLine: '这章已经把观测样本写成完整答卷，下一轮继续按同轴复盘。'
      },
      practiceTopic: {
        id: 'audit-fate-lineage-topic',
        sourceRecordId: 'audit-fate-lineage-guide',
        sourceTitle: '星镜试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        goalLines: ['先走观星线再补事件收益']
      },
      observatoryLink: {
        sourceRecordId: 'audit-fate-lineage-guide',
        sourceTitle: '星镜试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        drillObjective: '连续两次走观星相关节点并维持控场稳定。'
      },
      timestamp: Date.now()
    };
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive([lineageSlate]);
    } else {
      game.runSlateArchive = [lineageSlate];
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    const trainingFocus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
      ? game.buildObservatoryTrainingFocusFromSlate(lineageSlate)
      : null;
    if (trainingFocus && typeof game.setObservatoryTrainingFocus === 'function') {
      game.setObservatoryTrainingFocus(trainingFocus, { silent: true });
    }
    const originalBuildChallengeBundle = typeof game.buildChallengeBundle === 'function'
      ? game.buildChallengeBundle.bind(game)
      : null;
    game.buildChallengeBundle = (mode, dateRef) => {
      if (mode !== 'weekly') {
        return originalBuildChallengeBundle ? originalBuildChallengeBundle(mode, dateRef) : null;
      }
      return {
        mode: 'weekly',
        meta: {
          title: '观星台 · 七日劫数',
          subtitle: '围绕同一套命盘反复冲分，把高分答卷压成观星档案。',
          label: '七日劫数',
          accentClass: 'weekly'
        },
        rule: {
          id: 'build_sanctum_probe_weekly',
          name: '周劫旁证校卷',
          objective: '围绕周劫旁证校卷继续冲分，验证 Sanctum 旁验证状会直达 weekly challenge。',
          goalRealm: 4
        },
        rotationKey: '2026-W16',
        rotationLabel: '本周题面 · 七日劫数复盘',
        seedSignature: 'W-SANCTUM-PROBE',
        progress: {
          completions: 1,
          bestScore: 420,
          totalScore: 420
        },
        records: [],
        rewards: [
          {
            id: 'build_sanctum_probe_weekly_reward_1',
            label: '累计 360 分',
            target: 360,
            claimed: false
          }
        ]
      };
    };
    const endlessState = typeof game.ensureEndlessState === 'function' ? game.ensureEndlessState() : null;
    if (endlessState) {
      const weekMeta = typeof game.getHeavenlyMandateWeekMeta === 'function' ? game.getHeavenlyMandateWeekMeta() : null;
      endlessState.currentCycle = 1;
      endlessState.seasonWeekTag = weekMeta?.weekTag || endlessState.seasonWeekTag || '';
      endlessState.seasonCycleClears = 1;
      endlessState.seasonScore = 188;
    }
    if (typeof game.normalizeSanctumAgendaState === 'function') {
      const now = Date.now();
      game.sanctumAgendaState = game.normalizeSanctumAgendaState({
        lastResolved: {
          agendaId: 'audit_lineage_steady',
          icon: '🧮',
          name: '星镜稳线',
          sourceRunId: lineageSlate.id,
          sourceTitle: '星镜试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          ratingLabel: '天象合卷',
          ratingTone: 'completed',
          trainingAdvice: '继续沿观测锁线压路线贴合与控场节奏。',
          highlightLine: '把星镜试锋压成可复用周样本。',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          focusNodeTypes: ['observatory', 'event', 'rift'],
          focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
          progress: 3,
          target: 3,
          selectedDecisionLabel: '加倍投入',
          selectedDecisionLine: '继续沿观星链路补齐收益兑现。',
          selectedContractLabel: '星镜锁线',
          selectedContractLine: '锁定观星 / 事件 / 裂隙线路。',
          contractResolved: true,
          contractSuccess: true,
          contractResolutionLine: '锁线契约：星镜锁线已兑现 · 契押：🔮 1',
          contractSignCostLine: '🔮 1',
          outcome: 'success',
          outcomeLabel: '结题成功',
          grantedLine: '洞府奖励：观星留痕 +1',
          summaryLine: '星镜稳线已结题，路线贴合与控场节奏进入长期记录。',
          rewardTrackId: 'observatory',
          rewardTrackName: '命盘档案室',
          rewardTrackIcon: '🔭',
          selectedAt: now - 2000,
          updatedAt: now - 1500
        },
        history: [
          {
            agendaId: 'audit_lineage_archive',
            icon: '🧮',
            name: '残卷归档',
            sourceRunId: 'audit_lineage_history',
            sourceTitle: '旧档归卷',
            themeKey: 'oracle',
            themeLabel: '答卷归档',
            routeFocusLine: '优先节点：观星 / 记忆裂隙 / 事件',
            focusNodeTypes: ['observatory', 'memory_rift', 'event'],
            focusNodeLine: '优先节点：观星 / 记忆裂隙 / 事件',
            progress: 2,
            target: 2,
            selectedDecisionLabel: '稳步归档',
            selectedDecisionLine: '优先把已成型样本收入洞府。',
            selectedContractLabel: '镜段封样',
            selectedContractLine: '优先观星 / 记忆裂隙 / 事件。',
            contractResolved: true,
            contractSuccess: true,
            contractResolutionLine: '锁线契约：镜段封样已兑现',
            outcome: 'success',
            outcomeLabel: '结题成功',
            summaryLine: '残卷归档稳定完成，研究侧开始保留长期存档偏好。',
            selectedAt: now - 6000,
            updatedAt: now - 5500
          }
        ],
        totalCompleted: 2,
        totalFailed: 0
      });
    }
    if (typeof game.normalizeFateAftereffectState === 'function') {
      const now = Date.now();
      game.fateAftereffectState = game.normalizeFateAftereffectState({
        records: [
          {
            recordId: 'audit_aftereffect_active',
            icon: '🧭',
            name: '星镜余痕',
            sourceRunId: lineageSlate.id,
            sourceAgendaId: 'audit_lineage_steady',
            sourceLabel: '星镜稳线',
            sourceContractLabel: '星镜锁线',
            templateId: 'route_bias',
            outcomeId: 'contract_success',
            chapterIndex: 5,
            chapterName: '第 5 章·镜湖回路',
            durationChapters: 2,
            positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
            negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
            summaryLine: '星镜余痕：契约兑现后，观星锁线会继续牵引下一章路线。',
            detailLine: '来源：星镜稳线 · 契约「星镜锁线」｜正向：观星 / 事件 / 裂隙更容易连成同轴路线。｜代价：战斗与营地窗口会略少，路线更容易被细线样本牵走。',
            createdAt: now - 2200
          },
          {
            recordId: 'audit_aftereffect_pending',
            icon: '🪞',
            name: '残卷旁辉',
            sourceRunId: lineageSlate.id,
            sourceAgendaId: 'audit_lineage_archive',
            sourceLabel: '残卷归档',
            sourceDecisionLabel: '稳步归档',
            templateId: 'archive_bias',
            outcomeId: 'recovery',
            chapterIndex: lineageSlate.chapterIndex,
            chapterName: lineageSlate.chapterName,
            durationChapters: 1,
            positiveLine: '仍会轻微偏向裂隙 / 观星，方便把回收到的残页补完整。',
            negativeLine: '代价较轻，但下章仍会多分一点心力给归档收束。',
            summaryLine: '残卷旁辉：残卷回收只留下轻量档案偏置，不会等同完整结题。',
            detailLine: '来源：残卷归档 · 处置「稳步归档」｜正向：仍会轻微偏向裂隙 / 观星，方便把回收到的残页补完整。｜代价：代价较轻，但下章仍会多分一点心力给归档收束。',
            createdAt: now - 1200
          }
        ],
        history: [
          {
            recordId: 'audit_aftereffect_history',
            icon: '🩸',
            name: '欠压追痕',
            sourceRunId: 'audit_aftereffect_history_run',
            sourceAgendaId: 'audit_aftereffect_history_agenda',
            sourceLabel: '血线校压',
            sourceContractLabel: '压线誓约',
            templateId: 'risk_bias',
            outcomeId: 'contract_miss',
            chapterIndex: 4,
            chapterName: '第 4 章·血环抄录',
            durationChapters: 1,
            positiveLine: '敌影与高压样本会更密，方便补完未收口的压强研究。',
            negativeLine: '休整窗口更稀，上一章欠下的高压代价会继续追着你。',
            summaryLine: '欠压追痕：未兑现的高压契约把风险继续压到了下一章。',
            detailLine: '来源：血线校压 · 契约「压线誓约」｜正向：敌影与高压样本会更密，方便补完未收口的压强研究。｜代价：休整窗口更稀，上一章欠下的高压代价会继续追着你。',
            createdAt: now - 5200
          }
        ],
        lastResolved: {
          recordId: 'audit_aftereffect_pending',
          icon: '🪞',
          name: '残卷旁辉',
          sourceRunId: lineageSlate.id,
          sourceAgendaId: 'audit_lineage_archive',
          sourceLabel: '残卷归档',
          sourceDecisionLabel: '稳步归档',
          templateId: 'archive_bias',
          outcomeId: 'recovery',
          chapterIndex: lineageSlate.chapterIndex,
          chapterName: lineageSlate.chapterName,
          durationChapters: 1,
          positiveLine: '仍会轻微偏向裂隙 / 观星，方便把回收到的残页补完整。',
          negativeLine: '代价较轻，但下章仍会多分一点心力给归档收束。',
          summaryLine: '残卷旁辉：残卷回收只留下轻量档案偏置，不会等同完整结题。',
          detailLine: '来源：残卷归档 · 处置「稳步归档」｜正向：仍会轻微偏向裂隙 / 观星，方便把回收到的残页补完整。｜代价：代价较轻，但下章仍会多分一点心力给归档收束。',
          createdAt: now - 1200
        }
      });
    }
    if (typeof game.recordObservatoryArchiveEntry === 'function') {
      game.recordObservatoryArchiveEntry({
        id: 'audit-observatory-record',
        type: 'challenge',
        mode: 'daily',
        modeLabel: '今日天机',
        rotationKey: '2026-03-14',
        rotationLabel: '2026.03.14',
        seedSignature: 'D-030314-AUDT',
        title: '星镜试锋',
        note: '完成 · 得分 420',
        icon: '🔭',
        score: 420,
        completed: true,
        at: Date.now(),
        reason: 'goal_reached',
        rule: {
          id: 'audit_rule',
          name: '星镜试锋',
          goalRealm: 3,
          characterId: 'linFeng',
          runDestinyId: 'rebelScale',
          spiritCompanionId: 'emberCrow'
        }
      });
    }

    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('builds');
    const buildSubtitle = (document.getElementById('collection-subtitle')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildHeroText = (document.getElementById('build-snapshot-hero')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildMetricCount = document.querySelectorAll('#build-snapshot-metrics .build-metric-card').length;
    const buildNotesText = (document.getElementById('build-snapshot-notes')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildGuideText = (document.getElementById('build-snapshot-guide')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildLineageCardText = (document.querySelector('[data-fate-lineage-card="build"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildLineageSummary = (document.querySelector('[data-fate-lineage-summary="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildLineageGuide = (document.querySelector('[data-fate-lineage-guide="build"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const buildLineageTrackCount = document.querySelectorAll('[data-fate-lineage-card="build"] [data-fate-lineage-track]').length;

    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
    const sanctumSubtitle = (document.getElementById('collection-subtitle')?.textContent || '').replace(/\s+/g, ' ').trim();
    const roomCards = document.querySelectorAll('#sanctum-room-grid .sanctum-room-card').length;
    const researchItems = document.querySelectorAll('#sanctum-research-list .sanctum-research-item').length;
    const goalItems = document.querySelectorAll('#sanctum-goal-list .sanctum-goal-item, #sanctum-goal-list .codex-empty-state').length;
    const unlockItems = document.querySelectorAll('#sanctum-unlock-feed .unlock-feed-item').length;
    const summaryText = (document.getElementById('sanctum-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const progressText = (document.getElementById('sanctum-progress')?.textContent || '').replace(/\s+/g, ' ').trim();
    const roomText = (document.getElementById('sanctum-room-grid')?.textContent || '').replace(/\s+/g, ' ').trim();
    const researchText = (document.getElementById('sanctum-research-list')?.textContent || '').replace(/\s+/g, ' ').trim();
    const goalText = (document.getElementById('sanctum-goal-list')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumGuideText = (document.getElementById('sanctum-guide')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumLineageDetail = (document.querySelector('[data-fate-lineage-detail="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumLineageProgress = (document.querySelector('[data-fate-lineage-progress-row="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumLineageGuide = (document.querySelector('[data-fate-lineage-guide="overview"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumLineageChipsText = Array.from(document.querySelectorAll('[data-fate-lineage-chip]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const sanctumLineageTrackCount = document.querySelectorAll('[data-fate-lineage-track]').length;
    const sanctumAftereffectSummary = (document.querySelector('[data-fate-aftereffect-summary="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumAftereffectDetail = (document.querySelector('[data-fate-aftereffect-detail="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumAftereffectProgress = (document.querySelector('[data-fate-aftereffect-progress-row="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumAftereffectGuide = (document.querySelector('[data-fate-aftereffect-guide="overview"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumAftereffectChipsText = Array.from(document.querySelectorAll('[data-fate-aftereffect-chip]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const sanctumAftereffectTrackCount = document.querySelectorAll('[data-fate-aftereffect-track]').length;
    const sanctumSeasonBoardSummary = (document.querySelector('#sanctum-summary [data-season-board-summary="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardDetail = (document.querySelector('#sanctum-summary [data-season-board-detail="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontier = (document.querySelector('#sanctum-summary [data-season-board-frontier="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierGuide = (document.querySelector('#sanctum-guide [data-season-board-frontier-guide="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierChipText = (document.querySelector('#sanctum-summary [data-season-board-chip="frontier"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierCardText = (document.querySelector('#sanctum-summary [data-season-board-frontier-card="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierDecree = (document.querySelector('#sanctum-summary [data-season-board-frontier-decree="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierDecreeGuide = (document.querySelector('#sanctum-guide [data-season-board-frontier-decree-guide="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierDecreeChipText = (document.querySelector('#sanctum-summary [data-season-board-chip="frontier-decree"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierDecreeCardText = (document.querySelector('#sanctum-summary [data-season-board-frontier-decree-card="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierChronicle = (document.querySelector('#sanctum-summary [data-season-board-frontier-chronicle="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierChronicleGuide = (document.querySelector('#sanctum-guide [data-season-board-frontier-chronicle-guide="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierChronicleChipText = (document.querySelector('#sanctum-summary [data-season-board-chip="frontier-chronicle"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierChronicleCardText = (document.querySelector('#sanctum-summary [data-season-board-frontier-chronicle-card="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierCouncil = (document.querySelector('#sanctum-summary [data-season-board-frontier-council="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierCouncilGuide = (document.querySelector('#sanctum-guide [data-season-board-frontier-council-guide="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierCouncilChipText = (document.querySelector('#sanctum-summary [data-season-board-chip="frontier-council"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierCouncilCardText = (document.querySelector('#sanctum-summary [data-season-board-frontier-council-card="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardFrontierCount = document.querySelectorAll('#sanctum-summary [data-season-board-frontier="true"]').length;
    const sanctumSeasonBoardFrontierDecreeCount = document.querySelectorAll('#sanctum-summary [data-season-board-frontier-decree="true"]').length;
    const sanctumSeasonBoardFrontierChronicleCount = document.querySelectorAll('#sanctum-summary [data-season-board-frontier-chronicle="true"]').length;
    const sanctumSeasonBoardFrontierCouncilCount = document.querySelectorAll('#sanctum-summary [data-season-board-frontier-council="true"]').length;
    const sanctumSeasonBoardFrontierActionCount = document.querySelectorAll('[data-season-board-frontier-action="true"]').length;
    const sanctumSeasonBoardSettlement = (document.querySelector('#sanctum-summary [data-season-board-settlement="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardVerification = (document.querySelector('#sanctum-summary [data-season-board-verification="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardProgress = (document.querySelector('#sanctum-progress [data-season-board-progress-row="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardGuide = (document.querySelector('#sanctum-guide [data-season-board-guide="overview"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardSettlementGuide = (document.querySelector('#sanctum-guide [data-season-board-guide="settlement"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardVerificationGuide = (document.querySelector('#sanctum-guide [data-season-board-guide="verification"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardChipsText = Array.from(document.querySelectorAll('#sanctum-summary [data-season-board-chip]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .join(' ')
      .trim();
    const sanctumSeasonBoardSettlementCardText = (document.querySelector('#sanctum-summary [data-season-board-settlement-card="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardVerificationCardText = (document.querySelector('#sanctum-summary [data-season-board-verification-card="true"]')?.textContent || '').replace(/\s+/g, ' ').trim();
    const sanctumSeasonBoardGoalCount = document.querySelectorAll('#sanctum-goal-list [data-season-board-goal="true"]').length;
    const sanctumSeasonBoardLaneCount = document.querySelectorAll('#sanctum-summary [data-season-board-lane="true"]').length;
    const sanctumSeasonBoardTaskCount = document.querySelectorAll('#sanctum-summary [data-season-board-task="true"]').length;
    const sanctumSeasonBoardTaskTexts = Array.from(document.querySelectorAll('#sanctum-summary [data-season-board-task="true"]'))
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const sanctumSeasonBoardVerificationCount = document.querySelectorAll('#sanctum-summary [data-season-board-verification-order="true"]').length;
    const sanctumSeasonBoardSideVerificationGoalCount = document.querySelectorAll('#sanctum-goal-list [data-season-board-goal-id^="season_board_side_verification_goal_"]').length;
    const sanctumSeasonBoardSideVerificationResearchCount = Array.from(document.querySelectorAll('#sanctum-research-list .sanctum-research-item'))
      .filter((el) => /旁验证状|七日劫数/.test((el.textContent || '').replace(/\s+/g, ' ').trim()))
      .length;
    const sanctumSeasonBoardSideVerificationText = [
      researchText,
      summaryText,
      goalText,
      sanctumSeasonBoardVerificationCardText,
      sanctumSeasonBoardVerificationGuide
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    let payload = {};
    try {
      payload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      payload = {};
    }
    const expeditionSeasonBoard = payload?.expedition?.seasonBoard || null;
    const chapterSeasonBoard = payload?.map?.chapter?.seasonBoard || null;
    const expeditionAftereffects = payload?.expedition?.aftereffects || null;
    const chapterAftereffects = payload?.map?.chapter?.aftereffects || null;
    return {
      ok:
        /实战样本/.test(buildSubtitle) &&
        /构筑画像|攻势抢拍|法则编织|护阵拖线|混成试作/.test(buildHeroText) &&
        buildMetricCount >= 4 &&
        /当前优势/.test(buildNotesText) &&
        /主要缺口/.test(buildNotesText) &&
        /下一轮补位|补件优先级队列/.test(buildNotesText) &&
        /界痕后效/.test(buildNotesText) &&
        /契约后效/.test(buildNotesText) &&
        /样本对照/.test(buildNotesText) &&
        /当前精选命盘|观星台/.test(buildGuideText) &&
        /自动推荐摘要|推荐角色|推荐套装/.test(buildNotesText) &&
        /章节适配|场域拟合分/.test(buildNotesText) &&
        /下一章风险镜像|下一章高危|高危·/.test(buildNotesText) &&
        /丹尊/.test(buildNotesText) &&
        /天道/.test(buildNotesText) &&
        /押卷|验证/.test(buildNotesText) &&
        /命盘档案/.test(sanctumSubtitle) &&
        roomCards >= 5 &&
        researchItems >= 11 &&
        goalItems >= 1 &&
        unlockItems >= 2 &&
        /命盘谱系/.test(buildLineageCardText) &&
        /长期主修|待沉淀/.test(buildLineageSummary) &&
        /长期主修|谱系校准|角色|流派|节点|研究/.test(buildLineageGuide) &&
        buildLineageTrackCount >= 4 &&
        /命盘档案室/.test(roomText) &&
        /远征命盘归档/.test(researchText) &&
        /实战样本对照榜/.test(researchText) &&
        /季押卷|结业验证状/.test(researchText) &&
        sanctumLineageDetail.length > 0 &&
        /命盘谱系：角色 .*流派 .*节点 .*研究 /.test(sanctumLineageProgress) &&
        /最近研究|角色谱系|流派谱系|节点谱系|研究谱系/.test(sanctumLineageGuide) &&
        /主修流派|研究倾向/.test(sanctumLineageChipsText) &&
        sanctumLineageTrackCount >= 4 &&
        sanctumSeasonBoardSummary.length > 0 &&
        sanctumSeasonBoardDetail.length > 0 &&
        sanctumSeasonBoardFrontier.length > 0 &&
        sanctumSeasonBoardFrontierGuide.length > 0 &&
        /战线/.test(sanctumSeasonBoardFrontierChipText) &&
        sanctumSeasonBoardFrontierCardText.length > 0 &&
        sanctumSeasonBoardFrontierDecree.length > 0 &&
        sanctumSeasonBoardFrontierDecreeGuide.length > 0 &&
        /法旨/.test(sanctumSeasonBoardFrontierDecreeChipText) &&
        sanctumSeasonBoardFrontierDecreeCardText.length > 0 &&
        sanctumSeasonBoardFrontierChronicle.length > 0 &&
        sanctumSeasonBoardFrontierChronicleGuide.length > 0 &&
        /史卷/.test(sanctumSeasonBoardFrontierChronicleChipText) &&
        sanctumSeasonBoardFrontierChronicleCardText.length > 0 &&
        sanctumSeasonBoardFrontierCouncil.length > 0 &&
        sanctumSeasonBoardFrontierCouncilGuide.length > 0 &&
        /会审/.test(sanctumSeasonBoardFrontierCouncilChipText) &&
        sanctumSeasonBoardFrontierCouncilCardText.length > 0 &&
        sanctumSeasonBoardFrontierCount === 1 &&
        sanctumSeasonBoardFrontierDecreeCount === 1 &&
        sanctumSeasonBoardFrontierChronicleCount === 1 &&
        sanctumSeasonBoardFrontierCouncilCount === 1 &&
        sanctumSeasonBoardFrontierActionCount === 0 &&
        /季押卷/.test(sanctumSeasonBoardSettlement) &&
        /结业验证/.test(sanctumSeasonBoardVerification) &&
        /赛季天道盘：.+ · (采样期|锁线期|定榜期) · /.test(sanctumSeasonBoardProgress) &&
        /赛季天道盘：/.test(sanctumSeasonBoardGuide) &&
        /季押卷/.test(sanctumSeasonBoardSettlementGuide) &&
        /结业验证/.test(sanctumSeasonBoardVerificationGuide) &&
        /季盘阶段|赛季主轴|季盘进度|季押卷|战线/.test(sanctumSeasonBoardChipsText) &&
        /法旨/.test(sanctumSeasonBoardChipsText) &&
        /史卷/.test(sanctumSeasonBoardChipsText) &&
        /会审/.test(sanctumSeasonBoardChipsText) &&
        /季押卷裁定/.test(sanctumSeasonBoardSettlementCardText) &&
        /结业验证状/.test(sanctumSeasonBoardVerificationCardText) &&
        sanctumSeasonBoardGoalCount >= 2 &&
        sanctumSeasonBoardLaneCount >= 3 &&
        sanctumSeasonBoardTaskCount >= 3 &&
        sanctumSeasonBoardTaskTexts.every((text) => !/(\d+\/\d+).+\1/.test(text)) &&
        sanctumSeasonBoardVerificationCount >= 2 &&
        sanctumSeasonBoardSideVerificationGoalCount >= 1 &&
        sanctumSeasonBoardSideVerificationResearchCount >= 1 &&
        /旁验证状|七日劫数/.test(sanctumSeasonBoardSideVerificationText) &&
        sanctumAftereffectSummary.length > 0 &&
        sanctumAftereffectDetail.length > 0 &&
        /界痕后效：生效 \d+ \/ 待生效 \d+/.test(sanctumAftereffectProgress) &&
        /后效|生效/.test(sanctumAftereffectGuide) &&
        /界痕类型|当前状态|偏置/.test(sanctumAftereffectChipsText) &&
        sanctumAftereffectTrackCount >= 1 &&
        /局外中枢进度/.test(summaryText) &&
        /观星留痕|炼器铭刻|三段套装/.test(summaryText) &&
        /样本对照/.test(summaryText) &&
        /法则：|法宝：|炼器研究：|套装共鸣：|炼器铭刻：|Boss 档案：|伏魔台记忆战：|样本对照：|观星留痕：|赛季天道盘：/.test(progressText) &&
        /界痕后效：生效 \d+ \/ 待生效 \d+/.test(progressText) &&
        /当前精选命盘|命盘档案|赛季天道盘：/.test(sanctumGuideText) &&
        !!expeditionSeasonBoard &&
        !!chapterSeasonBoard &&
        expeditionSeasonBoard.summaryLine === chapterSeasonBoard.summaryLine &&
        expeditionSeasonBoard.detailLine === chapterSeasonBoard.detailLine &&
        expeditionSeasonBoard.guideLine === chapterSeasonBoard.guideLine &&
        expeditionSeasonBoard.statusLine === chapterSeasonBoard.statusLine &&
        expeditionSeasonBoard.phaseLabel === chapterSeasonBoard.phaseLabel &&
        expeditionSeasonBoard.themeLabel === chapterSeasonBoard.themeLabel &&
        expeditionSeasonBoard.progress?.progressText === chapterSeasonBoard.progress?.progressText &&
        expeditionSeasonBoard.completedTaskCount === chapterSeasonBoard.completedTaskCount &&
        expeditionSeasonBoard.totalTaskCount === chapterSeasonBoard.totalTaskCount &&
        expeditionSeasonBoard.lanes?.length === chapterSeasonBoard.lanes?.length &&
        !!expeditionSeasonBoard.frontier &&
        expeditionSeasonBoard.frontier.actionLaneId === expeditionSeasonBoard.frontier.primaryFrontId &&
        !!expeditionSeasonBoard.frontier.actionTargetLabel &&
        !!expeditionSeasonBoard.frontier.decree &&
        expeditionSeasonBoard.frontier.decree.laneId === expeditionSeasonBoard.frontier.primaryFrontId &&
        expeditionSeasonBoard.frontier.decree.actionTargetLabel === expeditionSeasonBoard.frontier.actionTargetLabel &&
        !!expeditionSeasonBoard.frontier.chronicle &&
        expeditionSeasonBoard.frontier.chronicle.laneId === expeditionSeasonBoard.frontier.primaryFrontId &&
        expeditionSeasonBoard.frontier.chronicle.actionTargetLabel === expeditionSeasonBoard.frontier.actionTargetLabel &&
        expeditionSeasonBoard.frontier.chronicle.statusId === expeditionSeasonBoard.frontier.statusId &&
        !!expeditionSeasonBoard.frontier.council &&
        expeditionSeasonBoard.frontier.council.laneId === expeditionSeasonBoard.frontier.primaryFrontId &&
        expeditionSeasonBoard.frontier.council.statusId === expeditionSeasonBoard.frontier.statusId &&
        Array.isArray(expeditionSeasonBoard.frontier.council.laneOpinions) &&
        expeditionSeasonBoard.frontier.council.laneOpinions.length === 3 &&
        JSON.stringify(expeditionSeasonBoard.frontier || null) === JSON.stringify(chapterSeasonBoard.frontier || null) &&
        (expeditionSeasonBoard.totalTaskCount || 0) >= 3 &&
        !!expeditionAftereffects &&
        !!chapterAftereffects &&
        expeditionAftereffects.summaryLine === chapterAftereffects.summaryLine &&
        expeditionAftereffects.detailLine === chapterAftereffects.detailLine &&
        expeditionAftereffects.guideLine === chapterAftereffects.guideLine &&
        expeditionAftereffects.currentStatusLine === chapterAftereffects.currentStatusLine &&
        chapterAftereffects.activeCount === expeditionAftereffects.activeCount &&
        chapterAftereffects.pendingCount === expeditionAftereffects.pendingCount &&
        ((expeditionAftereffects.activeCount || 0) + (expeditionAftereffects.pendingCount || 0)) >= 1 &&
        chapterAftereffects.primary?.name === expeditionAftereffects.primary?.name &&
        chapterAftereffects.primary?.templateId === expeditionAftereffects.primary?.templateId &&
        chapterAftereffects.primary?.status === expeditionAftereffects.primary?.status &&
        chapterAftereffects.primary?.statusLine === expeditionAftereffects.primary?.statusLine,
      buildSubtitle,
      buildHeroText,
      buildMetricCount,
      buildNotesText,
      buildGuideText,
      buildLineageCardText,
      buildLineageSummary,
      buildLineageGuide,
      buildLineageTrackCount,
      sanctumSubtitle,
      roomCards,
      researchItems,
      goalItems,
      unlockItems,
      roomText,
      researchText,
      summaryText,
      progressText,
      sanctumGuideText,
      sanctumLineageDetail,
      sanctumLineageProgress,
      sanctumLineageGuide,
      sanctumLineageChipsText,
      sanctumLineageTrackCount,
      sanctumSeasonBoardSummary,
      sanctumSeasonBoardDetail,
      sanctumSeasonBoardFrontier,
      sanctumSeasonBoardFrontierGuide,
      sanctumSeasonBoardFrontierChipText,
      sanctumSeasonBoardFrontierCardText,
      sanctumSeasonBoardFrontierDecree,
      sanctumSeasonBoardFrontierDecreeGuide,
      sanctumSeasonBoardFrontierDecreeChipText,
      sanctumSeasonBoardFrontierDecreeCardText,
      sanctumSeasonBoardFrontierChronicle,
      sanctumSeasonBoardFrontierChronicleGuide,
      sanctumSeasonBoardFrontierChronicleChipText,
      sanctumSeasonBoardFrontierChronicleCardText,
      sanctumSeasonBoardFrontierCouncil,
      sanctumSeasonBoardFrontierCouncilGuide,
      sanctumSeasonBoardFrontierCouncilChipText,
      sanctumSeasonBoardFrontierCouncilCardText,
      sanctumSeasonBoardFrontierCount,
      sanctumSeasonBoardFrontierDecreeCount,
      sanctumSeasonBoardFrontierChronicleCount,
      sanctumSeasonBoardFrontierCouncilCount,
      sanctumSeasonBoardFrontierActionCount,
      sanctumSeasonBoardSettlement,
      sanctumSeasonBoardVerification,
      sanctumSeasonBoardProgress,
      sanctumSeasonBoardGuide,
      sanctumSeasonBoardSettlementGuide,
      sanctumSeasonBoardVerificationGuide,
      sanctumSeasonBoardChipsText,
      sanctumSeasonBoardSettlementCardText,
      sanctumSeasonBoardVerificationCardText,
      sanctumSeasonBoardGoalCount,
      sanctumSeasonBoardLaneCount,
      sanctumSeasonBoardTaskCount,
      sanctumSeasonBoardTaskTexts,
      sanctumSeasonBoardVerificationCount,
      sanctumSeasonBoardSideVerificationGoalCount,
      sanctumSeasonBoardSideVerificationResearchCount,
      sanctumSeasonBoardSideVerificationText,
      sanctumAftereffectSummary,
      sanctumAftereffectDetail,
      sanctumAftereffectProgress,
      sanctumAftereffectGuide,
      sanctumAftereffectChipsText,
      sanctumAftereffectTrackCount,
      expeditionSeasonBoard,
      chapterSeasonBoard,
      expeditionAftereffects,
      chapterAftereffects
    };
  });
  add(
    'build snapshot and sanctum tabs summarize deck identity, research goals, room overview and recent unlock history',
    !!buildAndSanctumProbe?.ok,
    JSON.stringify(buildAndSanctumProbe || null)
  );
  await page.evaluate(() => {
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
  });
  await safeAuditScreenshot(page, path.join(outDir, 'sanctum-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const reopenSanctumCollection = async () => {
    await page.evaluate(() => {
      if (!window.game || typeof game.showCollection !== 'function') return;
      game.showCollection();
      if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
      if (typeof game.initCollection === 'function') game.initCollection();
    });
    await page.waitForTimeout(250);
  };
  const runSanctumSideVerificationClickProbe = async ({ selector, missingReason, countKey, screenshotName }) => {
    const actionCount = await page.locator(selector).count();
    let probe = {
      ok: false,
      reason: missingReason,
      [countKey]: actionCount
    };
    if (actionCount <= 0) return probe;

    await page.click(selector, { timeout: 5000, force: true });
    try {
      await page.waitForFunction(() => {
        const titleText = (document.getElementById('challenge-hub-title')?.textContent || '').replace(/\s+/g, ' ').trim();
        const summaryText = (document.getElementById('challenge-hub-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
        return window.game?.currentScreen === 'challenge-screen' && titleText.length > 0 && summaryText.length > 0;
      }, { timeout: 5000 });
      probe = await page.evaluate(({ key, count }) => {
        const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
        const activeTab = document.querySelector('#challenge-screen [data-challenge-tab].active')?.getAttribute('data-challenge-tab') || '';
        const activeTabText = text(document.querySelector('#challenge-screen [data-challenge-tab].active'));
        const titleText = text(document.getElementById('challenge-hub-title'));
        const subtitleText = text(document.getElementById('challenge-hub-subtitle'));
        const scoreSummaryText = text(document.getElementById('challenge-hub-summary'));
        return {
          ok:
            game.currentScreen === 'challenge-screen' &&
            game.challengeHubState?.tab === 'weekly' &&
            activeTab === 'weekly' &&
            /七日劫数/.test(`${titleText} ${subtitleText} ${activeTabText}`) &&
            /周劫旁证校卷/.test(scoreSummaryText) &&
            /周累计积分|历史最高单次/.test(scoreSummaryText),
          currentScreen: game.currentScreen || '',
          challengeTab: game.challengeHubState?.tab || '',
          activeTab,
          activeTabText,
          titleText,
          subtitleText,
          scoreSummaryText,
          [key]: count
        };
      }, { key: countKey, count: actionCount });
    } catch (error) {
      probe = {
        ok: false,
        reason: 'challenge_hub_not_ready',
        [countKey]: actionCount,
        error: error?.message || String(error)
      };
    }
    await safeAuditScreenshot(page, path.join(outDir, screenshotName), 'browser_meta_screen_audit', { timeout: 9000 });
    return probe;
  };

  await reopenSanctumCollection();
  const sanctumSideVerificationGoalSelector = '#sanctum-goal-list [data-season-board-goal-id^="season_board_side_verification_goal_"] [data-season-board-action="true"]';
  const sanctumSideVerificationClickProbe = await runSanctumSideVerificationClickProbe({
    selector: sanctumSideVerificationGoalSelector,
    missingReason: 'missing_side_verification_goal_button',
    countKey: 'goalCount',
    screenshotName: 'challenge-side-verification-weekly.png'
  });
  add(
    'sanctum side verification goal clicks through to weekly challenge hub',
    !!sanctumSideVerificationClickProbe?.ok,
    JSON.stringify(sanctumSideVerificationClickProbe || null)
  );

  await reopenSanctumCollection();
  const sanctumSideVerificationResearchSelector = '#sanctum-research-list [data-season-board-research-id^="season_board_side_verification_"] [data-season-board-research-action="true"]';
  const sanctumSideVerificationResearchClickProbe = await runSanctumSideVerificationClickProbe({
    selector: sanctumSideVerificationResearchSelector,
    missingReason: 'missing_side_verification_research_button',
    countKey: 'researchCount',
    screenshotName: 'challenge-side-verification-research-weekly.png'
  });
  add(
    'sanctum side verification research clicks through to seeded weekly challenge hub',
    !!sanctumSideVerificationResearchClickProbe?.ok,
    JSON.stringify(sanctumSideVerificationResearchClickProbe || null)
  );

  const sanctumSeasonVerificationArchiveProbe = await page.evaluate(() => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!window.game || !game.player || typeof game.showCollection !== 'function') {
      return { ok: false, reason: 'no_game' };
    }
    const weekMeta = typeof game.getHeavenlyMandateWeekMeta === 'function'
      ? game.getHeavenlyMandateWeekMeta()
      : { weekTag: 'current', weekLabel: '本周轮转' };
    const now = Date.now();
    if (typeof game.recordSeasonVerificationResult === 'function') {
      game.recordSeasonVerificationResult({
        recordId: `browser_archive_weekly_${weekMeta?.weekTag || 'current'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'side',
        sourceMode: 'challenge',
        sourceModeLabel: '七日劫数',
        sourceLabel: '周劫旁证校卷',
        label: '周劫旁证校卷',
        resultStatus: 'verified',
        writebackMode: 'boost_recommendation',
        writebackLine: '周挑战旁证补上了第二份证明，当前主修的推荐权重会继续抬高。',
        resolvedRunId: 'browser_archive_weekly_record',
        chapterIndex: 6,
        proofQuality: 'thin',
        lineageStyle: '旁证补样',
        summaryLine: '周挑战样本已经补成旁验证，可继续回看这份周判。',
        detailLine: '这条旁验证会落入周判记录，并能直接带你回到周挑战复核。',
        statusLine: '七日劫数 · 通过',
        anchorSection: 'challenge',
        priority: 2,
        createdAt: now - 2000,
        updatedAt: now - 2000
      });
      game.recordSeasonVerificationResult({
        recordId: `browser_archive_pvp_${weekMeta?.weekTag || 'current'}`,
        weekTag: weekMeta?.weekTag || '',
        weekLabel: weekMeta?.weekLabel || '',
        role: 'primary',
        sourceMode: 'pvp',
        sourceModeLabel: '天道榜',
        sourceLabel: '天道榜 · 周判复核',
        label: '天道榜账本验证',
        resultStatus: 'verified',
        writebackMode: 'upgrade_verdict',
        writebackLine: '天道榜主验证通过，本周押卷会继续维持正卷结论。',
        resolvedRunId: 'browser_archive_pvp_record',
        chapterIndex: 6,
        proofQuality: 'solid',
        lineageStyle: '镜战压强',
        summaryLine: '天道榜主验证已经把当前主轴压成正卷，可以直接从周判记录跳回去复核。',
        detailLine: '这条周判记录会优先挂在 archive 顶部，并保留一键回到天道榜的入口。',
        statusLine: '天道榜 · 通过',
        anchorSection: 'pvp',
        priority: 1,
        createdAt: now - 1000,
        updatedAt: now - 1000
      });
    }
    game.showCollection('sanctum');
    if (typeof game.initCollection === 'function') game.initCollection();
    const archiveCard = document.querySelector('#sanctum-summary [data-season-board-archive-card="true"]');
    const archiveStatusText = text(document.querySelector('#sanctum-summary [data-season-board-archive-status="true"]'));
    const archiveEntries = Array.from(document.querySelectorAll('#sanctum-summary [data-season-board-archive-entry="true"]'));
    const archiveAnchors = archiveEntries.map((node) => String(node.getAttribute('data-season-board-archive-anchor') || ''));
    const archiveResearchButton = document.querySelector('#sanctum-research-list [data-season-board-research-id="season_board_verification_archive"] [data-season-board-research-action="true"]');
    const archiveSummaryText = text(archiveCard);
    const sanctumData = typeof game.getSanctumOverviewData === 'function'
      ? game.getSanctumOverviewData()
      : null;
    const archive = sanctumData?.seasonBoard?.verificationArchive || null;
    return {
      ok:
        !!archiveCard &&
        !!archiveResearchButton &&
        archiveEntries.length >= 2 &&
        archiveAnchors.includes('pvp') &&
        archiveAnchors.includes('challenge') &&
        archiveStatusText.length > 0 &&
        /周判记录/.test(archiveSummaryText) &&
        !!archive &&
        archive.totalRecords >= 2 &&
        archive.latestEntry?.anchorSection === 'pvp',
      archiveEntryCount: archiveEntries.length,
      archiveAnchors,
      archiveStatusText,
      archiveSummaryText,
      archiveTotal: archive?.totalRecords || 0,
      archiveLatestAnchor: archive?.latestEntry?.anchorSection || ''
    };
  });
  add(
    'sanctum surfaces a season verification archive card and research entry',
    !!sanctumSeasonVerificationArchiveProbe?.ok,
    JSON.stringify(sanctumSeasonVerificationArchiveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'sanctum-season-verification-archive.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const seasonVerificationArchiveResearchSelector = '#sanctum-research-list [data-season-board-research-id="season_board_verification_archive"] [data-season-board-research-action="true"]';
  const seasonVerificationArchiveResearchCount = await page.locator(seasonVerificationArchiveResearchSelector).count();
  let seasonVerificationArchiveWeeklyProbe = {
    ok: false,
    reason: 'missing_archive_research_button',
    researchCount: seasonVerificationArchiveResearchCount
  };
  if (seasonVerificationArchiveResearchCount > 0) {
    await page.click(seasonVerificationArchiveResearchSelector, { timeout: 5000, force: true });
    try {
      await page.waitForFunction(() => {
        const section = document.querySelector('[data-season-verification-archive="true"]');
        return window.game?.currentScreen === 'challenge-screen' && !!section;
      }, { timeout: 5000 });
      seasonVerificationArchiveWeeklyProbe = await page.evaluate(({ count }) => {
        const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
        const archiveSection = document.querySelector('[data-season-verification-archive="true"]');
        const archiveEntries = Array.from(document.querySelectorAll('[data-season-verification-archive-entry="true"]'));
        const archiveActions = Array.from(document.querySelectorAll('[data-season-verification-archive-action="true"]'));
        return {
          ok:
            game.currentScreen === 'challenge-screen' &&
            game.challengeHubState?.tab === 'weekly' &&
            !!archiveSection &&
            archiveEntries.length >= 2 &&
            archiveActions.length >= 2 &&
            /周判记录/.test(text(archiveSection)) &&
            /天道榜|七日劫数/.test(text(archiveSection)),
          currentScreen: game.currentScreen || '',
          challengeTab: game.challengeHubState?.tab || '',
          archiveSectionText: text(archiveSection),
          archiveEntryCount: archiveEntries.length,
          archiveActionCount: archiveActions.length,
          researchCount: count
        };
      }, { count: seasonVerificationArchiveResearchCount });
    } catch (error) {
      seasonVerificationArchiveWeeklyProbe = {
        ok: false,
        reason: 'weekly_archive_not_ready',
        researchCount: seasonVerificationArchiveResearchCount,
        error: error?.message || String(error)
      };
    }
  }
  add(
    'season verification archive research opens weekly challenge archive',
    !!seasonVerificationArchiveWeeklyProbe?.ok,
    JSON.stringify(seasonVerificationArchiveWeeklyProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'season-verification-archive-weekly.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await reopenSanctumCollection();
  const seasonVerificationArchivePvpSelector = '#sanctum-summary [data-season-board-archive-entry="true"][data-season-board-archive-anchor="pvp"] [data-season-board-archive-action="true"]';
  const seasonVerificationArchivePvpCount = await page.locator(seasonVerificationArchivePvpSelector).count();
  let seasonVerificationArchivePvpProbe = {
    ok: false,
    reason: 'missing_archive_pvp_button',
    actionCount: seasonVerificationArchivePvpCount
  };
  if (seasonVerificationArchivePvpCount > 0) {
    await page.click(seasonVerificationArchivePvpSelector, { timeout: 5000, force: true });
    try {
      await page.waitForFunction(() => window.game?.currentScreen === 'pvp-screen', { timeout: 5000 });
      seasonVerificationArchivePvpProbe = await page.evaluate(({ count }) => {
        const pvpScreen = document.getElementById('pvp-screen');
        const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          ok:
            game.currentScreen === 'pvp-screen' &&
            !!pvpScreen &&
            /天道榜|PVP/.test(text(pvpScreen)),
          currentScreen: game.currentScreen || '',
          pvpScreenText: text(pvpScreen).slice(0, 240),
          actionCount: count
        };
      }, { count: seasonVerificationArchivePvpCount });
    } catch (error) {
      seasonVerificationArchivePvpProbe = {
        ok: false,
        reason: 'pvp_screen_not_ready',
        actionCount: seasonVerificationArchivePvpCount,
        error: error?.message || String(error)
      };
    }
  }
  add(
    'season verification archive action can jump from sanctum to pvp review',
    !!seasonVerificationArchivePvpProbe?.ok,
    JSON.stringify(seasonVerificationArchivePvpProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'season-verification-archive-pvp.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const sanctumHeavenlyMandateProbe = await page.evaluate(() => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!window.game || !game.player || typeof game.showCollection !== 'function') {
      return { ok: false, reason: 'no_game' };
    }
    if (typeof game.player?.setRunPath === 'function') game.player.setRunPath('insight');
    if (typeof game.player?.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 1);
    const rawArchive = [
      {
        id: 'run_slate_mandate_probe_6',
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
          trainingAdvice: '继续沿观测锁线压路线贴合与控场节奏。'
        },
        timestamp: 256000
      }
    ];
    if (typeof game.recordRunPathBossSample === 'function' && typeof game.player?.getRunPathMeta === 'function') {
      game.recordRunPathBossSample(game.player.getRunPathMeta(), {
        id: 'danZun',
        name: '丹尊',
        icon: '🗿',
        realm: 6
      }, {
        characterId: 'linFeng',
        turns: 4,
        completedAt: Date.now() - 1000
      });
    }
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive(rawArchive);
    } else {
      game.runSlateArchive = rawArchive;
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    const focus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
      ? game.buildObservatoryTrainingFocusFromSlate(rawArchive[0])
      : null;
    if (focus && typeof game.setObservatoryTrainingFocus === 'function') {
      game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    if (typeof game.normalizeSanctumAgendaState === 'function') {
      game.sanctumAgendaState = game.normalizeSanctumAgendaState({
        lastResolved: {
          agendaId: 'audit_lineage_payload',
          icon: '🧮',
          name: '星镜稳线',
          sourceRunId: rawArchive[0].id,
          sourceTitle: '星镜试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          focusNodeTypes: ['observatory', 'event', 'rift'],
          focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
          progress: 3,
          target: 3,
          selectedDecisionLabel: '加倍投入',
          selectedDecisionLine: '继续沿观星链路补齐收益兑现。',
          selectedContractLabel: '星镜锁线',
          selectedContractLine: '锁定观星 / 事件 / 裂隙线路。',
          contractResolved: true,
          contractSuccess: true,
          contractResolutionLine: '锁线契约：星镜锁线已兑现',
          outcome: 'success',
          outcomeLabel: '结题成功',
          summaryLine: '星镜稳线已结题，路线贴合与控场节奏进入长期记录。',
          selectedAt: Date.now() - 2000,
          updatedAt: Date.now() - 1500
        },
        history: [],
        totalCompleted: 1,
        totalFailed: 0
      });
    }

    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
    if (typeof game.initCollection === 'function') game.initCollection();

    const subtitleText = text(document.getElementById('collection-subtitle'));
    const summaryText = text(document.getElementById('sanctum-summary'));
    const goalText = text(document.getElementById('sanctum-goal-list'));
    const guideText = text(document.getElementById('sanctum-guide'));
    const heavenlyMandateText = [
      text(document.querySelector('[data-heavenly-mandate-summary="true"]')),
      text(document.querySelector('[data-heavenly-mandate-guide="overview"]')),
      summaryText,
      goalText,
      guideText
    ].join(' ').trim();
    const focusAction = document.querySelector('[data-heavenly-mandate-focus-action="true"]');
    const runSlateAction = document.querySelector('[data-heavenly-mandate-task-action-id="weekly_run_slate"]');
    const challengeAction = document.querySelector('[data-heavenly-mandate-task-action-id="weekly_challenge_score"]');
    const goalAction = document.querySelector('#sanctum-goal-list [data-heavenly-mandate-action="true"]');
    const boardTaskTexts = Array.from(document.querySelectorAll('[data-heavenly-mandate-task="true"]'))
      .map((node) => text(node))
      .filter(Boolean);

    let payload = {};
    try {
      payload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      payload = {};
    }
    const expeditionMandate = payload?.expedition?.mandate || null;
    const chapterMandate = payload?.map?.chapter?.mandate || null;
    const expeditionLineage = payload?.expedition?.lineage || null;
    const chapterLineage = payload?.map?.chapter?.lineage || null;
    const mirroredNode = expeditionMandate?.focusTask?.id
      ? document.querySelector(`[data-heavenly-mandate-task-id="${expeditionMandate.focusTask.id}"]`)
      : null;
    const mirroredAction = mirroredNode?.querySelector?.('[data-heavenly-mandate-task-action="true"]') || null;
    const matchesMandateRoute = (route, task) => {
      if (!route || !task) return false;
      if (task.actionType === 'collection') {
        return route.currentScreen === 'collection' && route.section === task.actionValue;
      }
      if (task.actionType === 'challenge') {
        return route.currentScreen === 'challenge-screen' && route.challengeTab === task.actionValue;
      }
      if (task.actionType === 'screen') {
        return route.currentScreen === task.actionValue;
      }
      return false;
    };
    const routeResults = {};
    const restoreSanctum = () => {
      game.showCollection();
      if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
      if (typeof game.initCollection === 'function') game.initCollection();
    };
    if (runSlateAction) {
      runSlateAction.click();
      routeResults.runSlate = {
        currentScreen: game.currentScreen || '',
        section: typeof game.getCollectionHubState === 'function'
          ? (game.getCollectionHubState()?.section || '')
          : ''
      };
      restoreSanctum();
    }
    if (challengeAction) {
      challengeAction.click();
      routeResults.challenge = {
        currentScreen: game.currentScreen || '',
        challengeTab: game.challengeHubState?.tab || ''
      };
      restoreSanctum();
    }
    if (goalAction) {
      goalAction.click();
      routeResults.goal = {
        currentScreen: game.currentScreen || '',
        section: typeof game.getCollectionHubState === 'function'
          ? (game.getCollectionHubState()?.section || '')
          : '',
        challengeTab: game.challengeHubState?.tab || ''
      };
      restoreSanctum();
    }

    return {
      ok:
        /命盘档案/.test(subtitleText) &&
        /天道敕令/.test(heavenlyMandateText) &&
        !!expeditionMandate &&
        !!expeditionMandate.weekTag &&
        !!expeditionMandate.themeLabel &&
        !!expeditionMandate.focusTask &&
        !!expeditionMandate.focusTask.actionType &&
        !!expeditionMandate.focusTask.actionValue &&
        expeditionMandate.nextTask?.id === expeditionMandate.focusTask.id &&
        expeditionMandate.actionType === expeditionMandate.focusTask.actionType &&
        expeditionMandate.actionValue === expeditionMandate.focusTask.actionValue &&
        expeditionMandate.ctaLabel === expeditionMandate.focusTask.ctaLabel &&
        Array.isArray(expeditionMandate.lanes) &&
        expeditionMandate.lanes.length === 3 &&
        boardTaskTexts.length >= 3 &&
        !!focusAction &&
        !!runSlateAction &&
        !!challengeAction &&
        !!goalAction &&
        !!mirroredNode &&
        !!mirroredAction &&
        text(goalAction) === expeditionMandate.focusTask.ctaLabel &&
        text(focusAction) === expeditionMandate.focusTask.ctaLabel &&
        text(mirroredAction) === expeditionMandate.focusTask.ctaLabel &&
        routeResults.runSlate?.currentScreen === 'collection' &&
        routeResults.runSlate?.section === 'slates' &&
        routeResults.challenge?.currentScreen === 'challenge-screen' &&
        routeResults.challenge?.challengeTab === 'weekly' &&
        matchesMandateRoute(routeResults.goal, expeditionMandate.focusTask) &&
        !!expeditionLineage &&
        !!expeditionLineage.summaryLine &&
        Array.isArray(expeditionLineage.tracks) &&
        expeditionLineage.tracks.length >= 4 &&
        !!chapterMandate &&
        chapterMandate.weekTag === expeditionMandate.weekTag &&
        chapterMandate.themeId === expeditionMandate.themeId &&
        chapterMandate.focusTask?.id === expeditionMandate.focusTask?.id &&
        chapterMandate.focusTask?.actionType === expeditionMandate.focusTask?.actionType &&
        chapterMandate.focusTask?.actionValue === expeditionMandate.focusTask?.actionValue &&
        !!chapterLineage &&
        chapterLineage.summaryLine === expeditionLineage.summaryLine &&
        chapterLineage.detailLine === expeditionLineage.detailLine &&
        (chapterLineage.progress?.trackedCharacters || 0) === (expeditionLineage.progress?.trackedCharacters || 0) &&
        (chapterLineage.progress?.trackedStyles || 0) === (expeditionLineage.progress?.trackedStyles || 0) &&
        (chapterLineage.progress?.trackedNodes || 0) === (expeditionLineage.progress?.trackedNodes || 0) &&
        (chapterLineage.progress?.researchHistoryCount || 0) === (expeditionLineage.progress?.researchHistoryCount || 0),
      subtitleText,
      heavenlyMandateText,
      boardTaskTexts,
      routeResults,
      expeditionMandate,
      chapterMandate,
      expeditionLineage,
      chapterLineage
    };
  });
  add(
    'sanctum page surfaces heavenly mandate wording and payload mandate snapshots',
    !!sanctumHeavenlyMandateProbe?.ok,
    JSON.stringify(sanctumHeavenlyMandateProbe || null)
  );

  const sanctumHeavenlyMandateDebtProbe = await page.evaluate(() => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!window.game || !game.player || typeof game.showCollection !== 'function') {
      return { ok: false, reason: 'no_game' };
    }
    const currentWeekTag = typeof game.getHeavenlyMandateWeekMeta === 'function'
      ? String(game.getHeavenlyMandateWeekMeta().weekTag || '').trim()
      : '';
    const debtSlate = {
      id: 'audit_heavenly_mandate_debt_pack',
      chapterIndex: 5,
      chapterName: '第 5 章·镜债旧卷',
      endingId: 'debt_probe',
      endingName: '留痕待补',
      endingIcon: '📚',
      score: 204,
      branchName: '镜债锁线',
      tags: ['课题·镜债校卷', '答卷·留痕待补'],
      answerReview: {
        ratingLabel: '留痕待补',
        ratingTone: 'selected',
        trainingAdvice: '先把上一道押卷留下的债账补掉，再考虑冲更高压样本。'
      },
      timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000)
    };
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive([debtSlate]);
    } else {
      game.runSlateArchive = [debtSlate];
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    if (typeof game.normalizeSanctumAgendaState === 'function') {
      game.sanctumAgendaState = game.normalizeSanctumAgendaState({
        lastResolved: {
          agendaId: 'audit_heavenly_mandate_debt_agenda',
          icon: '🧮',
          name: '镜债校卷',
          sourceRunId: debtSlate.id,
          sourceTitle: '镜债试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          ratingLabel: '留痕待补',
          ratingTone: 'selected',
          trainingAdvice: '先把上一道押卷留下的债账补掉，再考虑冲更高压样本。',
          highlightLine: '这轮押卷没有真正结成，下一章需要优先清账。',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          focusNodeTypes: ['observatory', 'event', 'memory_rift'],
          focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
          progress: 1,
          target: 3,
          selectedDecisionLabel: '保卷回收',
          selectedDecisionLine: '先保住残卷，再找机会补押卷主轴。',
          selectedContractLabel: '镜债锁线',
          selectedContractLine: '锁住观星 / 事件 / 裂隙线路，但欠下一笔清账任务。',
          contractResolved: true,
          contractSuccess: false,
          contractResolutionLine: '锁线契约：镜债锁线未兑现 · 契押：🔮 1',
          contractSignCostLine: '🔮 1',
          outcome: 'failed',
          outcomeLabel: '研究未成',
          grantedLine: '',
          reasonLine: '本轮没有把锁线答卷真正补成卷，洞府改以债账方式追踪。',
          summaryLine: '镜债校卷没有结成，留下了一笔待清的研究债账。',
          recoveryEligible: true,
          recoveryLabel: '残卷回收',
          recoveryTier: 'partial',
          recoveryTierLabel: '轻回收',
          recoveryLine: '洞府已回收一部分残卷，但下一轮要优先补这笔镜债。',
          recoveryHintLine: '先去高压环境补一轮镜债验证，再决定要不要继续冲榜。',
          rewardTrackId: 'observatory',
          rewardTrackName: '命盘档案室',
          rewardTrackIcon: '🔭'
        },
        history: [],
        totalCompleted: 0,
        totalFailed: 1
      });
    }
    const endlessState = typeof game.ensureEndlessState === 'function'
      ? game.ensureEndlessState()
      : null;
    if (endlessState) {
      endlessState.currentCycle = 1;
      endlessState.seasonWeekTag = currentWeekTag;
      endlessState.seasonCycleClears = 1;
      endlessState.seasonScore = 128;
    }

    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
    if (typeof game.initCollection === 'function') game.initCollection();

    const heavenlyMandateText = [
      text(document.querySelector('[data-heavenly-mandate-summary="true"]')),
      text(document.querySelector('[data-heavenly-mandate-detail="true"]')),
      text(document.querySelector('[data-heavenly-mandate-guide="overview"]')),
      text(document.querySelector('[data-heavenly-mandate-guide="goal"]'))
    ].join(' ').trim();
    const boardTaskTexts = Array.from(document.querySelectorAll('[data-heavenly-mandate-task="true"]'))
      .map((node) => text(node))
      .filter(Boolean);
    const goalAction = document.querySelector('#sanctum-goal-list [data-heavenly-mandate-action="true"]');
    const focusAction = document.querySelector('[data-heavenly-mandate-focus-action="true"]');
    const taskActionTexts = Array.from(document.querySelectorAll('[data-heavenly-mandate-task-action="true"]'))
      .map((node) => text(node))
      .filter(Boolean);

    let payload = {};
    try {
      payload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      payload = {};
    }
    const expeditionMandate = payload?.expedition?.mandate || null;
    const chapterMandate = payload?.map?.chapter?.mandate || null;
    const occupiedTask = (expeditionMandate?.lanes || [])
      .flatMap((lane) => (Array.isArray(lane?.tasks) ? lane.tasks : []))
      .find((task) => task.id === expeditionMandate?.focusTask?.id) || null;
    const mirroredNode = expeditionMandate?.focusTask?.id
      ? document.querySelector(`[data-heavenly-mandate-task-id="${expeditionMandate.focusTask.id}"]`)
      : null;
    const mirroredAction = mirroredNode?.querySelector?.('[data-heavenly-mandate-task-action="true"]') || null;
    const captureMandateRoute = () => ({
      currentScreen: game.currentScreen || '',
      section: typeof game.getCollectionHubState === 'function'
        ? (game.getCollectionHubState()?.section || '')
        : '',
      challengeTab: game.challengeHubState?.tab || ''
    });
    const matchesMandateRoute = (route, task) => {
      if (!route || !task) return false;
      if (task.actionType === 'collection') {
        return route.currentScreen === 'collection' && route.section === task.actionValue;
      }
      if (task.actionType === 'challenge') {
        return route.currentScreen === 'challenge-screen' && route.challengeTab === task.actionValue;
      }
      if (task.actionType === 'screen') {
        return route.currentScreen === task.actionValue;
      }
      return false;
    };
    const restoreSanctum = () => {
      game.showCollection();
      if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
      if (typeof game.initCollection === 'function') game.initCollection();
    };
    const routeResults = {};
    if (goalAction) {
      goalAction.click();
      routeResults.goal = captureMandateRoute();
      restoreSanctum();
    }
    const focusActionNode = document.querySelector('[data-heavenly-mandate-focus-action="true"]');
    if (focusActionNode) {
      focusActionNode.click();
      routeResults.focus = captureMandateRoute();
      restoreSanctum();
    }
    const mirroredActionNode = expeditionMandate?.focusTask?.id
      ? document.querySelector(`[data-heavenly-mandate-task-id="${expeditionMandate.focusTask.id}"] [data-heavenly-mandate-task-action="true"]`)
      : null;
    if (mirroredActionNode) {
      mirroredActionNode.click();
      routeResults.mirrored = captureMandateRoute();
      restoreSanctum();
    }

    return {
      ok:
        /债|欠卷|清/.test(heavenlyMandateText) &&
        boardTaskTexts.some((line) => /债|欠卷|清/.test(line)) &&
        !!goalAction &&
        !!focusAction &&
        taskActionTexts.length > 0 &&
        !!expeditionMandate?.focusTask &&
        expeditionMandate.focusTask.source === 'seasonDebtPack' &&
        expeditionMandate.focusTask.isPlaceholder === false &&
        expeditionMandate.focusTask.occupiesStrongSlot === true &&
        expeditionMandate.actionType === expeditionMandate.focusTask.actionType &&
        expeditionMandate.actionValue === expeditionMandate.focusTask.actionValue &&
        expeditionMandate.ctaLabel === expeditionMandate.focusTask.ctaLabel &&
        text(goalAction) === expeditionMandate.focusTask.ctaLabel &&
        text(focusAction) === expeditionMandate.focusTask.ctaLabel &&
        taskActionTexts.includes(expeditionMandate.focusTask.ctaLabel) &&
        !!occupiedTask &&
        occupiedTask.id === expeditionMandate.focusTask.id &&
        occupiedTask.occupiesStrongSlot === true &&
        occupiedTask.actionType === expeditionMandate.focusTask.actionType &&
        occupiedTask.actionValue === expeditionMandate.focusTask.actionValue &&
        !!mirroredNode &&
        !!mirroredAction &&
        text(mirroredAction) === expeditionMandate.focusTask.ctaLabel &&
        matchesMandateRoute(routeResults.goal, expeditionMandate.focusTask) &&
        matchesMandateRoute(routeResults.focus, expeditionMandate.focusTask) &&
        matchesMandateRoute(routeResults.mirrored, expeditionMandate.focusTask) &&
        !!chapterMandate?.focusTask &&
        chapterMandate.focusTask.id === expeditionMandate.focusTask.id &&
        chapterMandate.focusTask.actionType === expeditionMandate.focusTask.actionType &&
        chapterMandate.focusTask.actionValue === expeditionMandate.focusTask.actionValue,
      heavenlyMandateText,
      boardTaskTexts,
      taskActionTexts,
      routeResults,
      expeditionMandate,
      chapterMandate,
      occupiedTask
    };
  });
  add(
    'sanctum page surfaces debt-clearing as a real heavenly mandate lane occupation',
    !!sanctumHeavenlyMandateDebtProbe?.ok,
    JSON.stringify(sanctumHeavenlyMandateDebtProbe || null)
  );

  const runSlateShelfProbe = await page.evaluate(() => {
    if (!window.game) return { ok: false, reason: 'no_game' };
    if (!game.player || !Array.isArray(game.player.collectedLaws)) {
      game.guestMode = true;
      game.startNewGame('linFeng');
    }

    const rawArchive = [
      {
        id: 'audit_run_slate_oracle',
        chapterIndex: 5,
        chapterName: '第 5 章·星穹回廊',
        endingId: 'alliance',
        endingName: '星图合卷',
        endingIcon: '🔭',
        score: 246,
        scoreBreakdown: [
          '章节答卷：天象合卷 · 3/3 项达成',
          '训练建议：继续沿观星链路把线索写满，再回事件节点补收益兑现'
        ],
        branchName: '观测锁线',
        bountyNames: ['星轨巡检'],
        factionSummary: ['星港议会·协力'],
        nemesisName: '镜池守望者',
        nemesisStatus: 'allied',
        nemesisStatusLabel: '已结盟',
        tags: ['课题·推演控场', '答卷·天象合卷', '训练·路线贴合'],
        practiceTopic: {
          id: 'topic_oracle_audit',
          sourceRecordId: 'guide_oracle_audit',
          sourceTitle: '星镜试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定']
        },
        observatoryLink: {
          sourceRecordId: 'guide_oracle_audit',
          sourceTitle: '星镜试锋',
          sourceThemeKey: 'oracle',
          sourceThemeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定'],
          drillObjective: '连续两次走观星相关节点并维持控场稳定。'
        },
        answerReview: {
          title: '章节观星回响',
          ratingLabel: '天象合卷',
          ratingTone: 'completed',
          trainingAdvice: '先沿观星链路把线索写满，再回事件节点补收益兑现。',
          highlightLine: '这章已经把观测样本写成完整答卷，下一轮继续按同轴复盘。'
        },
        themeKey: 'oracle',
        themeLabel: '推演控场',
        ratingLabel: '天象合卷',
        ratingTone: 'completed',
        timestamp: 246000
      },
      {
        id: 'audit_run_slate_assault',
        chapterIndex: 4,
        chapterName: '第 4 章·焚城试炼',
        endingId: 'hunt',
        endingName: '火线追猎',
        endingIcon: '🔥',
        score: 214,
        scoreBreakdown: [
          '章节答卷：贴题成卷 · 2/3 项达成',
          '训练建议：先抢前两手节奏，再把爆发资源留到高压段兑现'
        ],
        branchName: '火线突进',
        bountyNames: ['前锋清缴'],
        factionSummary: ['燎原盟·支援'],
        nemesisName: '炽烬追猎者',
        nemesisStatus: 'released',
        nemesisStatusLabel: '已解卷',
        tags: ['课题·前压爆发', '答卷·贴题成卷', '训练·稳血收官'],
        practiceTopic: {
          id: 'topic_assault_audit',
          sourceRecordId: 'guide_assault_audit',
          sourceTitle: '焚脉试锋',
          themeKey: 'assault',
          themeLabel: '前压爆发',
          routeFocusLine: '优先节点：战斗 / 精英 / 试炼',
          compareHint: '对比先手压制、收头效率与高压段处理。',
          trainingTags: ['稳血收官', '高压过线']
        },
        observatoryLink: {
          sourceRecordId: 'guide_assault_audit',
          sourceTitle: '焚脉试锋',
          sourceThemeKey: 'assault',
          sourceThemeLabel: '前压爆发',
          routeFocusLine: '优先节点：战斗 / 精英 / 试炼',
          compareHint: '对比先手压制、收头效率与高压段处理。',
          trainingTags: ['稳血收官', '高压过线'],
          drillObjective: '在第 2 次高压战前保留一段爆发或兜底。'
        },
        answerReview: {
          title: '章节观星回响',
          ratingLabel: '贴题成卷',
          ratingTone: 'completed',
          trainingAdvice: '先抢前两手节奏，再把爆发资源留到高压段兑现。',
          highlightLine: '前段答卷已经贴题，下一轮继续沿战斗稠密线补题。'
        },
        themeKey: 'assault',
        themeLabel: '前压爆发',
        ratingLabel: '贴题成卷',
        ratingTone: 'completed',
        timestamp: 214000
      }
    ];

    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive(rawArchive);
    } else {
      game.runSlateArchive = rawArchive;
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    if (typeof game.setObservatoryTrainingFocus === 'function') {
      game.setObservatoryTrainingFocus(null, { silent: true });
    }
    if (typeof game.ensureChallengeHubBootState === 'function') {
      game.ensureChallengeHubBootState();
    }
    if (game.challengeHubState && typeof game.challengeHubState === 'object') {
      game.challengeHubState.tab = 'daily';
    }

    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('slates');

    const slatesPanel = document.querySelector('#collection [data-collection-panel="slates"]');
    const activeTab = document.querySelector('#collection [data-collection-tab].active')?.getAttribute('data-collection-tab') || '';
    const activePanel = document.querySelector('#collection [data-collection-panel].active')?.getAttribute('data-collection-panel') || '';
    if (!slatesPanel) {
      return {
        ok: false,
        reason: 'missing_slates_panel',
        activeTab,
        activePanel,
        subtitleText: text(document.getElementById('collection-subtitle'))
      };
    }

    const panelText = text(slatesPanel);
    const selectedRunSlateIdBefore = game.selectedRunSlateId || '';
    let trainBtn = slatesPanel.querySelector('[data-run-slate-train-focus="true"]:not([disabled])');
    let reviewBtn = slatesPanel.querySelector('[data-run-slate-review-observatory="true"]');
    if ((!trainBtn || !reviewBtn) && slatesPanel.querySelectorAll) {
      const shelfCards = Array.from(slatesPanel.querySelectorAll('[data-run-slate-card="true"][data-run-slate-id]'));
      for (const card of shelfCards) {
        card.click();
        trainBtn = slatesPanel.querySelector('[data-run-slate-train-focus="true"]:not([disabled])');
        reviewBtn = slatesPanel.querySelector('[data-run-slate-review-observatory="true"]');
        if (trainBtn && reviewBtn) break;
      }
    }
    const selectedRunSlateId = String(
      trainBtn?.getAttribute('data-run-slate-id')
      || reviewBtn?.getAttribute('data-run-slate-id')
      || game.selectedRunSlateId
      || selectedRunSlateIdBefore
      || ''
    );
    const selectedSlate = rawArchive.find((entry) => entry.id === selectedRunSlateId) || null;
    const expectedThemeKey = String(
      selectedSlate?.themeKey
      || selectedSlate?.practiceTopic?.themeKey
      || selectedSlate?.observatoryLink?.sourceThemeKey
      || ''
    );
    const expectedThemeLabel = String(
      selectedSlate?.themeLabel
      || selectedSlate?.practiceTopic?.themeLabel
      || selectedSlate?.observatoryLink?.sourceThemeLabel
      || ''
    );
    const expectedRouteFocusLine = String(
      selectedSlate?.practiceTopic?.routeFocusLine
      || selectedSlate?.practiceTopic?.routeHint
      || selectedSlate?.observatoryLink?.routeFocusLine
      || ''
    );
    const expectedCompareHint = String(
      selectedSlate?.practiceTopic?.compareHint
      || selectedSlate?.observatoryLink?.compareHint
      || ''
    );
    const expectedTrainingTags = Array.from(new Set(
      [
        ...(Array.isArray(selectedSlate?.practiceTopic?.trainingTags) ? selectedSlate.practiceTopic.trainingTags : []),
        ...(Array.isArray(selectedSlate?.observatoryLink?.trainingTags) ? selectedSlate.observatoryLink.trainingTags : [])
      ].filter(Boolean)
    ));
    if (trainBtn) trainBtn.click();

    const focus = typeof game.getObservatoryTrainingFocus === 'function'
      ? game.getObservatoryTrainingFocus()
      : null;
    const slatesPanelAfterTrain = document.querySelector('#collection [data-collection-panel="slates"]');
    const reviewBtnAfterTrain = slatesPanelAfterTrain?.querySelector('[data-run-slate-review-observatory="true"]') || null;
    if (reviewBtnAfterTrain) reviewBtnAfterTrain.click();
    const challengeFilters = typeof game.getChallengeArchiveFilterState === 'function'
      ? game.getChallengeArchiveFilterState('daily')
      : null;
    const challengeScreen = game.currentScreen || '';
    const challengeTab = game.challengeHubState?.tab || '';

    game.showCollection();
    if (typeof game.switchCollectionSection === 'function') game.switchCollectionSection('sanctum');
    const archiveRoomCard = Array.from(document.querySelectorAll('#sanctum-room-grid .sanctum-room-card'))
      .find((card) => /命盘档案室/.test(card.textContent || ''));
    const archiveRoomButton = archiveRoomCard ? archiveRoomCard.querySelector('button') : null;
    if (archiveRoomButton) archiveRoomButton.click();

    const titleText = text(document.getElementById('collection-title'));
    const subtitleText = text(document.getElementById('collection-subtitle'));
    const activeTabAfterRoom = document.querySelector('#collection [data-collection-tab].active')?.getAttribute('data-collection-tab') || '';
    const activePanelAfterRoom = document.querySelector('#collection [data-collection-panel].active')?.getAttribute('data-collection-panel') || '';

    return {
      ok:
        activeTab === 'slates' &&
        activePanel === 'slates' &&
        /归卷书架/.test(titleText) &&
        /章节答卷|训练建议/.test(subtitleText) &&
        /章节答卷/.test(panelText) &&
        /训练建议/.test(panelText) &&
        /主题/.test(panelText) &&
        /章节/.test(panelText) &&
        /评级/.test(panelText) &&
        !!trainBtn &&
        !!reviewBtn &&
        typeof game.setRunSlateShelfThemeFilter === 'function' &&
        typeof game.setRunSlateShelfChapterFilter === 'function' &&
        typeof game.setRunSlateShelfRatingFilter === 'function' &&
        !!focus &&
        focus.sourceRunId === selectedRunSlateId &&
        focus.themeKey === expectedThemeKey &&
        focus.themeLabel === expectedThemeLabel &&
        focus.routeFocusLine === expectedRouteFocusLine &&
        focus.compareHint === expectedCompareHint &&
        expectedTrainingTags.every((tag) => (focus.trainingTags || []).includes(tag)) &&
        challengeScreen === 'challenge-screen' &&
        challengeTab === 'daily' &&
        challengeFilters?.themeKey === expectedThemeKey &&
        activeTabAfterRoom === 'slates' &&
        activePanelAfterRoom === 'slates',
      activeTab,
      activePanel,
      titleText,
      subtitleText,
      panelText,
      selectedRunSlateId,
      trainButtonText: trainBtn?.textContent || '',
      reviewButtonText: reviewBtnAfterTrain?.textContent || reviewBtn?.textContent || '',
      focus,
      challengeScreen,
      challengeTab,
      challengeFilters,
      activeTabAfterRoom,
      activePanelAfterRoom,
      archiveRoomText: text(archiveRoomCard)
    };
  });
  add(
    'run slate shelf exposes a dedicated slates tab with training reference action and sanctum jump-back',
    !!runSlateShelfProbe?.ok,
    JSON.stringify(runSlateShelfProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'run-slate-shelf-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const sanctumAgendaProbe = await page.evaluate(() => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!window.game || typeof game.showCollection !== 'function' || typeof game.switchCollectionSection !== 'function') {
      return { ok: false, reason: 'no_collection_game' };
    }
    if (!game.player) {
      game.guestMode = true;
      game.startNewGame('linFeng');
    }
    game.player.heavenlyInsight = Math.max(6, Number(game.player.heavenlyInsight) || 0);
    game.player.karma = Math.max(4, Number(game.player.karma) || 0);
    if (typeof game.resetSanctumAgendaRunState === 'function') {
      game.resetSanctumAgendaRunState('new_run');
    }
    const rawArchive = [
      {
        id: 'run_slate_oracle_6',
        chapterIndex: 6,
        chapterName: '第 6 章·星镜归档',
        endingId: 'alliance',
        endingName: '星图合卷',
        endingIcon: '🔭',
        score: 256,
        scoreBreakdown: [
          '章节答卷：天象合卷 · 3/3 项达成',
          '训练建议：继续沿观测锁线压路线贴合与控场节奏'
        ],
        branchName: '观测锁线',
        bountyNames: ['星轨巡检'],
        factionSummary: ['星港议会·协力'],
        nemesisName: '镜池守望者',
        nemesisStatus: 'allied',
        nemesisStatusLabel: '已结盟',
        tags: ['课题·推演控场', '答卷·天象合卷', '训练·路线贴合'],
        practiceTopic: {
          id: 'topic_oracle_6',
          sourceRecordId: 'guide_oracle_6',
          sourceTitle: '星镜试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定'],
          goalLines: ['先走观星线再补事件收益']
        },
        observatoryLink: {
          sourceRecordId: 'guide_oracle_6',
          sourceTitle: '星镜试锋',
          sourceThemeKey: 'oracle',
          sourceThemeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定'],
          drillObjective: '连续两次走观星相关节点并维持控场稳定。'
        },
        answerReview: {
          title: '章节观星回响',
          ratingLabel: '天象合卷',
          ratingTone: 'completed',
          trainingAdvice: '先沿观星链路把线索写满，再回事件节点补收益兑现。',
          highlightLine: '这章已经把观测样本写成完整答卷，下一轮继续按同轴复盘。',
          overviewLine: '章节答卷已稳定成卷。'
        },
        themeKey: 'oracle',
        themeLabel: '推演控场',
        ratingLabel: '天象合卷',
        ratingTone: 'completed',
        timestamp: 256000
      }
    ];
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive(rawArchive);
    } else {
      game.runSlateArchive = rawArchive;
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    const focus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
      ? game.buildObservatoryTrainingFocusFromSlate(rawArchive[0])
      : null;
    if (focus && typeof game.setObservatoryTrainingFocus === 'function') {
      game.setObservatoryTrainingFocus(focus, { silent: true });
    }

    game.showCollection();
    game.switchCollectionSection('sanctum');
    const beforeSummary = text(document.getElementById('sanctum-summary'));
    const candidateBtn = document.querySelector('#sanctum-research-list [data-sanctum-agenda-activate="true"]:not([disabled])');
    const candidateAgendaId = String(candidateBtn?.getAttribute('data-sanctum-agenda-id') || '');
    const candidateCardText = text(candidateBtn?.closest('.sanctum-research-item'));
    if (candidateBtn) candidateBtn.click();
    const dashboard = typeof game.getSanctumAgendaDashboard === 'function'
      ? game.getSanctumAgendaDashboard()
      : null;
    const focusNodeType = String(dashboard?.active?.focusNodeTypes?.[0] || 'observatory');
    const secondNodeType = String(dashboard?.active?.focusNodeTypes?.find((type) => type && type !== focusNodeType) || dashboard?.active?.focusNodeTypes?.[1] || focusNodeType);
    if (typeof game.recordSanctumAgendaNodeProgress === 'function' && dashboard?.active) {
      game.recordSanctumAgendaNodeProgress(focusNodeType, {
        nodeId: 'agenda_probe_node_a',
        chapterIndex: Number(dashboard.active.boundChapterIndex || game.getExpeditionState?.()?.chapterIndex || 0),
        realm: Number(game.player?.realm || 0),
        row: 1
      });
      if (typeof game.initCollection === 'function') game.initCollection();
    }
    const decisionBtn = document.querySelector('#sanctum-research-list [data-sanctum-agenda-decision="true"]:not([disabled])');
    const decisionId = String(decisionBtn?.getAttribute('data-sanctum-agenda-decision-id') || '');
    const decisionCardText = text(decisionBtn?.closest('.sanctum-research-item'));
    if (decisionBtn) decisionBtn.click();
    let dashboardAfterDecision = typeof game.getSanctumAgendaDashboard === 'function'
      ? game.getSanctumAgendaDashboard()
      : null;
    if (typeof game.recordSanctumAgendaNodeProgress === 'function' && dashboardAfterDecision?.active) {
      game.recordSanctumAgendaNodeProgress(secondNodeType, {
        nodeId: 'agenda_probe_node_b',
        chapterIndex: Number(dashboardAfterDecision.active.boundChapterIndex || game.getExpeditionState?.()?.chapterIndex || 0),
        realm: Number(game.player?.realm || 0),
        row: 2
      });
      if (typeof game.initCollection === 'function') game.initCollection();
      dashboardAfterDecision = typeof game.getSanctumAgendaDashboard === 'function'
        ? game.getSanctumAgendaDashboard()
        : null;
    }
    const contractBtn = document.querySelector('#sanctum-research-list [data-sanctum-agenda-contract="true"]:not([disabled])');
    const contractId = String(contractBtn?.getAttribute('data-sanctum-agenda-contract-id') || '');
    const contractCardText = text(contractBtn?.closest('.sanctum-research-item'));
    if (contractBtn) contractBtn.click();
    const dashboardAfterContract = typeof game.getSanctumAgendaDashboard === 'function'
      ? game.getSanctumAgendaDashboard()
      : null;
    const summaryText = text(document.getElementById('sanctum-summary'));
    const guideText = text(document.getElementById('sanctum-guide'));
    const researchText = text(document.getElementById('sanctum-research-list'));
    let payload = {};
    try {
      payload = JSON.parse(typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : '{}');
    } catch (error) {
      payload = {};
    }
    return {
      ok:
        !!candidateBtn &&
        !!dashboard?.active &&
        dashboard.active.agendaId === candidateAgendaId &&
        !!decisionBtn &&
        !!dashboardAfterDecision?.active &&
        dashboardAfterDecision.active.selectedDecisionId === decisionId &&
        !!contractBtn &&
        !!dashboardAfterContract?.active &&
        dashboardAfterContract.active.selectedContractId === contractId &&
        /契押/.test(contractCardText) &&
        /当前议程/.test(summaryText) &&
        /结题门槛/.test(guideText) &&
        /风险提醒/.test(guideText) &&
        /当前处置|章中处置|执行中/.test(guideText) &&
        /当前契约|锁线契约|待立契/.test(guideText) &&
        /契押代价|契约负担|契押/.test(guideText) &&
        /当前议程|稳线研究|高压研究|归卷研究/.test(researchText) &&
        payload?.expedition?.agenda?.active?.agendaId === candidateAgendaId &&
        payload?.expedition?.agenda?.active?.selectedDecisionId === decisionId &&
        payload?.expedition?.agenda?.active?.selectedContractId === contractId &&
        !!payload?.expedition?.agenda?.active?.contractSignCostLine &&
        payload?.map?.chapter?.agenda?.active?.selectedContractId === contractId,
      beforeSummary,
      candidateAgendaId,
      candidateCardText,
      decisionId,
      decisionCardText,
      contractId,
      contractCardText,
      summaryText,
      guideText,
      researchText,
      activeAgenda: dashboardAfterContract?.active || dashboardAfterDecision?.active || dashboard?.active || null,
      payloadAgenda: payload?.expedition?.agenda || null
    };
  });
  add(
    'sanctum agenda can be activated from dongfu, unlock a chapter decision and contract, and propagate into summary and render payload',
    !!sanctumAgendaProbe?.ok,
    JSON.stringify(sanctumAgendaProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'sanctum-agenda-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const sanctumAgendaFailureRecoveryProbe = await page.evaluate(async () => {
    const text = (value) => (value?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!window.game || typeof game.startNewGame !== 'function' || typeof game.startRealm !== 'function') {
      return { ok: false, reason: 'no_runtime_game' };
    }
    document.querySelectorAll('.achievement-popup').forEach((el) => el.remove());
    document.querySelectorAll('.modal.active, .card-detail-overlay.active').forEach((el) => el.classList.remove('active'));
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.player.heavenlyInsight = Math.max(6, Number(game.player.heavenlyInsight) || 0);
    game.player.karma = Math.max(6, Number(game.player.karma) || 0);
    if (typeof game.resetSanctumAgendaRunState === 'function') {
      game.resetSanctumAgendaRunState('new_run');
    }
    game.startRealm(1, false);
    const rawArchive = [
      {
        id: 'run_slate_oracle_6',
        chapterIndex: 6,
        chapterName: '第 6 章·星镜归档',
        endingId: 'alliance',
        endingName: '星图合卷',
        endingIcon: '🔭',
        score: 256,
        scoreBreakdown: [
          '章节答卷：天象合卷 · 3/3 项达成',
          '训练建议：继续沿观测锁线压路线贴合与控场节奏'
        ],
        branchName: '观测锁线',
        bountyNames: ['星轨巡检'],
        factionSummary: ['星港议会·协力'],
        nemesisName: '镜池守望者',
        nemesisStatus: 'allied',
        nemesisStatusLabel: '已结盟',
        tags: ['课题·推演控场', '答卷·天象合卷', '训练·路线贴合'],
        practiceTopic: {
          id: 'topic_oracle_6',
          sourceRecordId: 'guide_oracle_6',
          sourceTitle: '星镜试锋',
          themeKey: 'oracle',
          themeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定'],
          goalLines: ['先走观星线再补事件收益']
        },
        observatoryLink: {
          sourceRecordId: 'guide_oracle_6',
          sourceTitle: '星镜试锋',
          sourceThemeKey: 'oracle',
          sourceThemeLabel: '推演控场',
          routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
          compareHint: '对比观测收益、路线贴合与控场稳定。',
          trainingTags: ['路线贴合', '控场稳定'],
          drillObjective: '连续两次走观星相关节点并维持控场稳定。'
        },
        answerReview: {
          title: '章节观星回响',
          ratingLabel: '天象合卷',
          ratingTone: 'completed',
          trainingAdvice: '先沿观星链路把线索写满，再回事件节点补收益兑现。',
          highlightLine: '这章已经把观测样本写成完整答卷，下一轮继续按同轴复盘。',
          overviewLine: '章节答卷已稳定成卷。'
        },
        themeKey: 'oracle',
        themeLabel: '推演控场',
        ratingLabel: '天象合卷',
        ratingTone: 'completed',
        timestamp: 256000
      }
    ];
    if (typeof game.normalizeRunSlateArchive === 'function') {
      game.runSlateArchive = game.normalizeRunSlateArchive(rawArchive);
    } else {
      game.runSlateArchive = rawArchive;
    }
    if (typeof game.persistRunSlateArchive === 'function') game.persistRunSlateArchive();
    const focus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
      ? game.buildObservatoryTrainingFocusFromSlate(rawArchive[0])
      : null;
    if (focus && typeof game.setObservatoryTrainingFocus === 'function') {
      game.setObservatoryTrainingFocus(focus, { silent: true });
    }
    const active = typeof game.activateSanctumAgenda === 'function'
      ? game.activateSanctumAgenda('pressure_line')
      : null;
    const expeditionState = typeof game.getExpeditionState === 'function'
      ? game.getExpeditionState()
      : null;
    const chapterIndex = Number(expeditionState?.chapterIndex || active?.boundChapterIndex || 1);
    if (typeof game.recordSanctumAgendaNodeProgress === 'function' && active) {
      game.recordSanctumAgendaNodeProgress('elite', {
        nodeId: 'recovery_probe_elite',
        chapterIndex,
        realm: Number(game.player?.realm || 1),
        row: 1
      });
    }
    if (typeof game.onBattleLost === 'function') {
      await game.onBattleLost();
    }
    const rewardModal = document.getElementById('reward-modal');
    const rewardTitle = text(document.getElementById('reward-title'));
    const rewardMessage = text(document.getElementById('reward-message'));
    const gameOverText = text(document.getElementById('game-over-text'));
    const latestSlate = typeof game.getLatestRunSlate === 'function'
      ? game.getLatestRunSlate()
      : null;
    const agendaResolution = typeof game.getSanctumAgendaExpeditionSnapshot === 'function'
      ? game.getSanctumAgendaExpeditionSnapshot({ latestRunId: String(latestSlate?.id || '') })?.lastResolved || null
      : null;
    return {
      ok:
        game.currentScreen === 'game-over-screen' &&
        !!rewardModal?.classList?.contains('active') &&
        /残卷回收/.test(rewardTitle) &&
        /补卷提示/.test(rewardMessage) &&
        /洞府已执行残卷回收/.test(gameOverText) &&
        !!agendaResolution?.recoveryEligible,
      currentScreen: game.currentScreen,
      rewardTitle,
      rewardMessage,
      gameOverText,
      agendaResolution
    };
  });
  add(
    'battle lost expedition flow surfaces sanctum recovery immediately on the game-over route',
    !!sanctumAgendaFailureRecoveryProbe?.ok,
    JSON.stringify(sanctumAgendaFailureRecoveryProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'sanctum-agenda-failure-recovery.png'), 'browser_meta_screen_audit', { timeout: 9000 });
  await page.evaluate(() => {
    document.getElementById('reward-modal')?.classList.remove('active');
  });

  const treasureCompendiumProbe = await page.evaluate(() => {
    if (!window.game || typeof game.showTreasureCompendium !== 'function') return { ok: false, reason: 'no_compendium' };
    if (!game.player) {
      game.guestMode = true;
      game.startNewGame('linFeng');
    }
    game.showTreasureCompendium();
    const main = document.querySelector('.treasure-compendium-main');
    const side = document.querySelector('.treasure-compendium-side');
    const summary = document.getElementById('treasure-compendium-summary');
    const rarity = document.getElementById('treasure-compendium-rarity');
    const research = document.getElementById('treasure-compendium-research');
    const firstItem = document.querySelector('#treasure-compendium-grid .compendium-item');
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!main || !side || !summary || !rarity || !research || !firstItem) return { ok: false, reason: 'missing_compendium_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    return {
      ok:
        mainRect.left < sideRect.left &&
        sideRect.width >= 280 &&
        /已收录/.test(summary.textContent || '') &&
        /凡品|灵品|神品|仙品/.test(rarity.textContent || '') &&
        /炼器研究|核心件|套装/.test(research.textContent || ''),
      mainRect,
      sideRect,
      summaryText: (summary.textContent || '').replace(/\s+/g, ' ').trim(),
      rarityText: (rarity.textContent || '').replace(/\s+/g, ' ').trim(),
      researchText: (research.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'treasure compendium uses reward-style main and side rails with collection breakdown',
    !!treasureCompendiumProbe?.ok,
    JSON.stringify(treasureCompendiumProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'treasure-compendium-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const treasureFilterProbe = await page.evaluate(() => {
    if (!window.game || !game.player || typeof game.showTreasureCompendium !== 'function') return { ok: false, reason: 'no_game' };
    if (typeof game.player.addTreasure === 'function') {
      game.player.addTreasure('vitality_stone');
      game.player.addTreasure('soul_banner');
    }
    game.setTreasureCompendiumFilter('owned');
    game.treasureCompendiumSort = 'name_asc';
    if (typeof game.setTreasureCompendiumSearchQuery === 'function') game.setTreasureCompendiumSearchQuery('魂');
    game.showTreasureCompendium();
    const ownedCount = document.querySelectorAll('#treasure-compendium-grid .compendium-item').length;
    const firstOwnedName = (document.querySelector('#treasure-compendium-grid .compendium-name')?.textContent || '').trim();
    if (typeof game.toggleTreasureCompendiumFilterChip === 'function') {
      game.toggleTreasureCompendiumFilterChip('status', 'owned');
      game.toggleTreasureCompendiumFilterChip('rarity', 'rare');
      game.toggleTreasureCompendiumFilterChip('source', 'shop');
    }
    game.treasureCompendiumSort = 'realm_asc';
    if (typeof game.saveTreasureCompendiumPreset === 'function') game.saveTreasureCompendiumPreset(0);
    if (typeof game.clearTreasureCompendiumFilters === 'function') game.clearTreasureCompendiumFilters();
    if (typeof game.applyTreasureCompendiumPreset === 'function') game.applyTreasureCompendiumPreset(0);
    game.showTreasureCompendium();
    const comboCount = document.querySelectorAll('#treasure-compendium-grid .compendium-item').length;
    const summaryText = (document.getElementById('treasure-compendium-summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const activeChips = document.querySelectorAll('#treasure-compendium .compendium-chip.active').length;
    const presetText = (document.getElementById('treasure-preset-slot-0')?.textContent || '').trim();
    const searchValue = document.getElementById('treasure-search-input')?.value || '';
    return {
      ok:
        ownedCount >= 1 &&
        /魂/.test(firstOwnedName) &&
        comboCount >= 1 &&
        activeChips >= 2 &&
        /当前筛选结果/.test(summaryText) &&
        /灵品|商店/.test(summaryText) &&
        /关键词「魂」/.test(summaryText) &&
        /预设 1/.test(presetText) &&
        /搜「魂」/.test(presetText) &&
        searchValue === '魂',
      ownedCount,
      firstOwnedName,
      comboCount,
      activeChips,
      searchValue,
      presetText,
      summaryText
    };
  });
  add(
    'treasure compendium filter and sort controls reshape the visible archive list',
    !!treasureFilterProbe?.ok,
    JSON.stringify(treasureFilterProbe || null)
  );

  const treasureDetailProbe = await page.evaluate(() => {
    const modal = document.getElementById('treasure-detail-modal');
    const main = modal ? modal.querySelector('.treasure-detail-main') : null;
    const side = modal ? modal.querySelector('.treasure-detail-side') : null;
    const status = document.getElementById('detail-owned-state');
    const role = document.getElementById('detail-role-state');
    const infusion = document.getElementById('detail-infusion-state');
    const source = document.getElementById('detail-source');
    const setInfo = document.getElementById('detail-set');
    const buildFit = document.getElementById('detail-build-fit');
    const forgeStatus = document.getElementById('detail-forge-status');
    const firstOwned = (window.game && game.player)
      ? Object.values(TREASURES || {}).find((treasure) => game.player.hasTreasure(treasure.id)) || Object.values(TREASURES || {})[0]
      : null;
    if (firstOwned && window.game && typeof game.showTreasureDetail === 'function') {
      game.showTreasureDetail(firstOwned, !!(game.player && game.player.hasTreasure(firstOwned.id)));
    }
    const visibleMain = document.querySelector('#treasure-detail-modal.active .treasure-detail-main');
    const visibleSide = document.querySelector('#treasure-detail-modal.active .treasure-detail-side');
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!modal || !visibleMain || !visibleSide || !status || !role || !infusion || !source || !setInfo || !buildFit || !forgeStatus) return { ok: false, reason: 'missing_treasure_detail_nodes' };
    const mainRect = toRect(visibleMain);
    const sideRect = toRect(visibleSide);
    return {
      ok:
        modal.classList.contains('active') &&
        mainRect.left < sideRect.left &&
        /已收录|未收录/.test(status.textContent || '') &&
        (source.textContent || '').trim().length > 0 &&
        (role.textContent || '').trim().length > 0 &&
        /灌注|核心|基础/.test((infusion.textContent || '') + (role.textContent || '')) &&
        (setInfo.textContent || '').trim().length > 0 &&
        (buildFit.textContent || '').trim().length > 0 &&
        (forgeStatus.textContent || '').trim().length > 0,
      mainRect,
      sideRect,
      statusText: (status.textContent || '').trim(),
      roleText: (role.textContent || '').trim(),
      infusionText: (infusion.textContent || '').trim(),
      sourceText: (source.textContent || '').replace(/\s+/g, ' ').trim(),
      setText: (setInfo.textContent || '').replace(/\s+/g, ' ').trim(),
      buildFitText: (buildFit.textContent || '').replace(/\s+/g, ' ').trim(),
      forgeText: (forgeStatus.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'treasure detail modal follows the same main and side rail information hierarchy',
    !!treasureDetailProbe?.ok,
    JSON.stringify(treasureDetailProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'treasure-detail-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    game.startRealm(1, false);
    if (game.map) {
      game.map.getAccessibleNodes = () => [
        { id: 'elite_audit', row: 3, type: 'elite', accessible: true, completed: false },
        { id: 'rest_audit', row: 3, type: 'rest', accessible: true, completed: false }
      ];
    }
    game.showShop({ id: 'audit_shop_layout', type: 'shop', row: 2 });
  });
  await page.waitForTimeout(450);
  await page.click('#shop-cards .card', { force: true });
  await page.waitForTimeout(250);
  const shopDetailProbe = await page.evaluate(() => {
    const modal = document.getElementById('card-detail-modal');
    const main = modal ? modal.querySelector('.card-detail-main') : null;
    const side = modal ? modal.querySelector('.card-detail-side') : null;
    const summaryRows = modal ? modal.querySelectorAll('.cd-summary-row').length : 0;
    const badges = modal ? modal.querySelectorAll('.cd-badges .detail-status-chip').length : 0;
    const toRect = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    if (!modal || window.getComputedStyle(modal).display === 'none' || !main || !side) return { ok: false, reason: 'missing_card_detail_nodes' };
    const mainRect = toRect(main);
    const sideRect = toRect(side);
    return {
      ok: mainRect.left < sideRect.left && summaryRows >= 5 && badges >= 2 && /商店详情/.test(modal.textContent || '') && /高适配|中适配|低适配/.test(modal.textContent || ''),
      mainRect,
      sideRect,
      summaryRows,
      badges,
      textSample: (modal.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    };
  });
  add(
    'shop card detail modal uses the same main and side rail layout with pricing summary',
    !!shopDetailProbe?.ok,
    JSON.stringify(shopDetailProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'shop-card-detail-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  const shopAdviceProbe = await page.evaluate(() => {
    const summary = document.getElementById('shop-tab-summary');
    const adviceBadge = summary ? summary.querySelector('.shop-advice-badge') : null;
    const adviceText = summary ? summary.querySelector('.shop-advice-text') : null;
    const forecast = summary ? summary.querySelector('.shop-advice-forecast') : null;
    const economyChips = summary ? Array.from(summary.querySelectorAll('.shop-economy-chip')) : [];
    const economyNote = summary ? summary.querySelector('.shop-advice-note') : null;
    const serviceNote = document.querySelector('.service-fit-note');
    return {
      ok:
        !!summary &&
        !!adviceBadge &&
        !!adviceText &&
        !!forecast &&
        economyChips.length >= 3 &&
        !!economyNote &&
        /更适合买卡|更适合买服务|建议留钱/.test(adviceBadge.textContent || '') &&
        /下一批节点/.test(forecast.textContent || '') &&
        economyChips.some((chip) => /储备线/.test(chip.textContent || '')) &&
        economyChips.some((chip) => /建议单次/.test(chip.textContent || '')) &&
        (adviceText.textContent || '').trim().length > 0 &&
        /灵石|消费|预算/.test(economyNote.textContent || '') &&
        !!serviceNote &&
        (serviceNote.textContent || '').trim().length > 0,
      badgeText: (adviceBadge?.textContent || '').trim(),
      adviceText: (adviceText?.textContent || '').replace(/\s+/g, ' ').trim(),
      forecastText: (forecast?.textContent || '').replace(/\s+/g, ' ').trim(),
      economyText: economyChips.map((chip) => (chip.textContent || '').replace(/\s+/g, ' ').trim()),
      economyNote: (economyNote?.textContent || '').replace(/\s+/g, ' ').trim(),
      serviceNote: (serviceNote?.textContent || '').replace(/\s+/g, ' ').trim()
    };
  });
  add(
    'shop summary shows buy card or service guidance with economy reserve cues',
    !!shopAdviceProbe?.ok,
    JSON.stringify(shopAdviceProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'shop-strategy-advice-layout.png'), 'browser_meta_screen_audit', { timeout: 9000 });

  add('no console errors were emitted during meta-screen audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));
  const report = {
    url,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  await browser.close();

  if (findings.some((finding) => !finding.pass)) {
    process.exit(1);
  }
})();
