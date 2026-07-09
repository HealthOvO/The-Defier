import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-reward-meta-mobile-audit';
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

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

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
    const toRect = (el) => {
      if (!el) return null;
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
    game.player?.setRunPath?.('insight');
    game.player?.setRunDestiny?.('rebelScale', 1);
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
    game.persistRunSlateArchive?.();

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

    const rewardScreen = document.getElementById('reward-screen');
    const main = document.querySelector('.reward-main-column');
    const side = document.querySelector('.reward-side-column');
    const actions = document.querySelector('.reward-actions');
    const summary = document.querySelector('.reward-summary-card');
    const expeditionPanel = document.getElementById('reward-expedition-meta');
    const cards = Array.from(document.querySelectorAll('#reward-cards .card'));
    const chapterArcNode = expeditionPanel?.querySelector('[data-season-board-chapter-arc-reward="true"]') || null;
    const laneRewardButton = expeditionPanel?.querySelector('[data-season-board-lane-reward-claim="true"]') || null;
    const handoffButton = expeditionPanel?.querySelector('[data-season-board-action-reward="true"] [data-season-board-handoff-cta="true"]') || null;

    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;

    return {
      ok: !!rewardScreen && !!main && !!side && !!actions && !!summary && !!expeditionPanel && cards.length >= 2,
      rewardHeaderOutcome: rewardScreen?.dataset?.rewardHeaderOutcome || '',
      rewardNextActionSource: rewardScreen?.dataset?.rewardNextActionSource || '',
      viewportWidth: window.innerWidth,
      screenScrollWidth: rewardScreen?.scrollWidth || 0,
      screenClientWidth: rewardScreen?.clientWidth || 0,
      mainScrollWidth: main?.scrollWidth || 0,
      mainClientWidth: main?.clientWidth || 0,
      sideScrollWidth: side?.scrollWidth || 0,
      sideClientWidth: side?.clientWidth || 0,
      panelScrollWidth: expeditionPanel?.scrollWidth || 0,
      panelClientWidth: expeditionPanel?.clientWidth || 0,
      mainRect: toRect(main),
      sideRect: toRect(side),
      summaryRect: toRect(summary),
      actionsRect: toRect(actions),
      expeditionPanelRect: toRect(expeditionPanel),
      chapterArcRect: toRect(chapterArcNode),
      laneRewardButtonRect: toRect(laneRewardButton),
      handoffButtonRect: toRect(handoffButton),
      cardRects: cards.map((card) => toRect(card)),
      titleText: document.querySelector('#reward-screen .reward-title')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      narrativeText: document.getElementById('reward-narrative-brief')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      frontierText: nodeText(document.querySelector('[data-season-board-frontier-reward="true"]')),
      decreeText: nodeText(document.querySelector('[data-season-board-frontier-decree-reward="true"]')),
      chronicleText: nodeText(document.querySelector('[data-season-board-frontier-chronicle-reward="true"]')),
      councilText: nodeText(document.querySelector('[data-season-board-frontier-council-reward="true"]')),
      chapterArcText: nodeText(chapterArcNode),
      laneRewardText: Array.from(expeditionPanel?.querySelectorAll('[data-season-board-lane-reward="true"]') || []).map(nodeText).join(' ').trim(),
      chipTexts: Array.from(expeditionPanel?.querySelectorAll('[data-season-board-chip]') || []).map(nodeText),
      laneRewardClaimableCount: Math.max(0, Math.floor(Number(expeditionPanel?.dataset?.seasonBoardLaneRewardClaimableCount) || 0)),
      seasonBoard: payload?.reward?.expedition?.seasonBoard || null,
      chapterSeasonBoard: payload?.map?.chapter?.seasonBoard || null,
    };
  });

  add(
    'reward mobile layout keeps expedition meta, season-board chips, and lane rewards inside one readable column',
    !!rewardProbe?.ok
      && ['settlement', 'locking_sheet'].includes(rewardProbe.rewardHeaderOutcome)
      && rewardProbe.rewardNextActionSource.length > 0
      && rewardProbe.screenScrollWidth <= rewardProbe.screenClientWidth + 2
      && rewardProbe.mainScrollWidth <= rewardProbe.mainClientWidth + 2
      && rewardProbe.sideScrollWidth <= rewardProbe.sideClientWidth + 2
      && rewardProbe.panelScrollWidth <= rewardProbe.panelClientWidth + 2
      && rewardProbe.mainRect?.left >= 0
      && rewardProbe.mainRect?.right <= rewardProbe.viewportWidth + 2
      && rewardProbe.sideRect?.left >= 0
      && rewardProbe.sideRect?.right <= rewardProbe.viewportWidth + 2
      && rewardProbe.actionsRect?.left >= 0
      && rewardProbe.actionsRect?.right <= rewardProbe.viewportWidth + 2
      && rewardProbe.summaryRect?.bottom <= rewardProbe.actionsRect?.top + 32
      && rewardProbe.cardRects.every((rect) => rect && rect.left >= rewardProbe.mainRect.left - 2 && rect.right <= rewardProbe.mainRect.right + 2)
      && rewardProbe.cardRects.every((rect) => rect && rect.bottom <= rewardProbe.actionsRect.bottom + 2)
      && /赛季裁定|章节归卷/.test(rewardProbe.titleText || '')
      && /赛季裁定|章节归卷|命盘档案|命盘问真/.test(rewardProbe.narrativeText || '')
      && /主战线|战线|主轴/.test(rewardProbe.frontierText || '')
      && /法旨|约束|焦点/.test(rewardProbe.decreeText || '')
      && /史卷|记录|封记/.test(rewardProbe.chronicleText || '')
      && /会审|意见|裁语/.test(rewardProbe.councilText || '')
      && /章程|三周|章节/.test(rewardProbe.chapterArcText || '')
      && /训练线/.test(rewardProbe.laneRewardText || '')
      && /领取结题赏/.test(rewardProbe.laneRewardText || '')
      && rewardProbe.chipTexts.length >= 6
      && rewardProbe.chipTexts.some((text) => /战线/.test(text || ''))
      && rewardProbe.chipTexts.some((text) => /法旨/.test(text || ''))
      && rewardProbe.chipTexts.some((text) => /史卷/.test(text || ''))
      && rewardProbe.chipTexts.some((text) => /会审/.test(text || ''))
      && rewardProbe.chipTexts.some((text) => /章程|章节/.test(text || ''))
      && rewardProbe.laneRewardClaimableCount >= 1
      && !!rewardProbe.seasonBoard?.frontier
      && !!rewardProbe.seasonBoard?.chapterArc
      && !!rewardProbe.chapterSeasonBoard?.chapterArc,
    JSON.stringify(rewardProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-mobile-390.png'), 'browser_reward_meta_mobile_audit', { timeout: 9000 });

  const rewardCtaViewportProbe = await page.evaluate(async () => {
    const toRect = (el) => {
      if (!el) return null;
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
    const inspectButtonReach = async (selector) => {
      const button = document.querySelector(selector);
      if (!button) return { ok: false, reason: 'missing_button', selector };
      const beforeRect = toRect(button);
      const beforeScrollY = Math.round(window.scrollY || 0);
      if (typeof button.scrollIntoView === 'function') {
        button.scrollIntoView({ block: 'center', inline: 'nearest' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      const afterRect = toRect(button);
      const centerX = afterRect ? Math.round(afterRect.left + (afterRect.width / 2)) : null;
      const centerY = afterRect ? Math.round(afterRect.top + (afterRect.height / 2)) : null;
      const centerInsideViewport = Number.isFinite(centerX)
        && Number.isFinite(centerY)
        && centerX >= 0
        && centerX <= window.innerWidth
        && centerY >= 0
        && centerY <= window.innerHeight;
      const safeBottomLimit = Math.min(
        window.innerHeight,
        Math.round((window.visualViewport?.height || window.innerHeight) - 12)
      );
      const safeAreaOk = !!afterRect
        && afterRect.top >= 0
        && afterRect.bottom <= safeBottomLimit
        && afterRect.left >= 0
        && afterRect.right <= window.innerWidth;
      const hit = centerInsideViewport ? document.elementFromPoint(centerX, centerY) : null;
      const hitMatches = !!hit && (hit === button || button.contains(hit));
      return {
        ok: !!afterRect && centerInsideViewport && safeAreaOk && hitMatches,
        selector,
        text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
        dataset: { ...button.dataset },
        beforeRect,
        afterRect,
        beforeScrollY,
        afterScrollY: Math.round(window.scrollY || 0),
        center: centerInsideViewport ? { x: centerX, y: centerY } : null,
        centerInsideViewport,
        safeBottomLimit,
        safeAreaOk,
        hitMatches,
        hitTag: hit?.tagName || null,
        hitText: hit ? (hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '',
      };
    };

    const laneReward = await inspectButtonReach('#reward-expedition-meta [data-season-board-lane-reward-claim="true"]');
    const handoff = await inspectButtonReach('#reward-expedition-meta [data-season-board-action-reward="true"] [data-season-board-handoff-cta="true"]');
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      laneReward,
      handoff,
    };
  });

  add(
    'reward mobile CTA buttons scroll into the 390x844 viewport and win center-point hit testing',
    !!rewardCtaViewportProbe?.laneReward?.ok
      && !!rewardCtaViewportProbe?.handoff?.ok,
    JSON.stringify(rewardCtaViewportProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-mobile-390-cta.png'), 'browser_reward_meta_mobile_audit', { timeout: 9000 });

  const laneRewardButton = page.locator('#reward-expedition-meta [data-season-board-lane-reward-claim="true"]').first();
  let laneRewardClickProbe = null;
  if ((await laneRewardButton.count()) < 1) {
    laneRewardClickProbe = { ok: false, reason: 'missing_lane_reward_button' };
  } else {
    try {
      const laneRewardBefore = await laneRewardButton.evaluate((button) => ({
        dataset: { ...button.dataset },
        text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
        rect: {
          left: Math.round(button.getBoundingClientRect().left),
          top: Math.round(button.getBoundingClientRect().top),
          right: Math.round(button.getBoundingClientRect().right),
          bottom: Math.round(button.getBoundingClientRect().bottom),
        },
      }));
      await laneRewardButton.scrollIntoViewIfNeeded({ timeout: 5000 });
      await laneRewardButton.click({ timeout: 5000 });
      await page.waitForTimeout(300);
      laneRewardClickProbe = await page.evaluate((before) => {
        const payload = typeof window.render_game_to_text === 'function'
          ? JSON.parse(window.render_game_to_text())
          : null;
        const expeditionPanel = document.getElementById('reward-expedition-meta');
        const seasonBoard = payload?.reward?.expedition?.seasonBoard || null;
        const trainingReward = (seasonBoard?.laneRewards || []).find((reward) => reward?.laneId === 'training') || null;
        const trainingRewardButton = expeditionPanel?.querySelector('[data-season-board-lane-reward-lane-id="training"] [data-season-board-lane-reward-claim="true"]') || null;
        const claimedLaneRewards = game?.seasonVerificationState?.claimedLaneRewards || null;
        return {
          ok:
            before.rect?.right > before.rect?.left &&
            seasonBoard?.laneRewardSummary?.claimableCount === 0 &&
            seasonBoard?.laneRewardSummary?.claimedCount >= 1 &&
            trainingReward?.claimed === true &&
            trainingReward?.claimable === false &&
            (!trainingRewardButton || /已领取/.test(trainingRewardButton.textContent || '')) &&
            !!claimedLaneRewards,
          before,
          after: {
            currentScreen: game?.currentScreen || '',
            laneRewardSummary: seasonBoard?.laneRewardSummary || null,
            trainingReward,
            trainingRewardButtonText: (trainingRewardButton?.textContent || '').replace(/\s+/g, ' ').trim(),
            claimedLaneRewards,
            rewardText: (expeditionPanel?.textContent || '').replace(/\s+/g, ' ').trim(),
          },
        };
      }, laneRewardBefore);
    } catch (error) {
      laneRewardClickProbe = {
        ok: false,
        reason: 'playwright_lane_reward_click_failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  add(
    'reward mobile lane reward CTA is clickable after scroll and updates claim state',
    !!laneRewardClickProbe?.ok,
    JSON.stringify(laneRewardClickProbe || null)
  );

  const rewardSeasonHandoffButton = page.locator('#reward-expedition-meta [data-season-board-action-reward="true"] [data-season-board-handoff-cta="true"]').first();
  let rewardSeasonHandoffClickProbe = null;
  if ((await rewardSeasonHandoffButton.count()) < 1) {
    rewardSeasonHandoffClickProbe = { ok: false, reason: 'missing_reward_handoff_button' };
  } else {
    try {
      const rewardSeasonHandoffBefore = await rewardSeasonHandoffButton.evaluate((btn) => ({
        dataset: { ...btn.dataset },
        text: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
        visible: btn.getBoundingClientRect().width > 0 && btn.getBoundingClientRect().height > 0,
      }));
      await rewardSeasonHandoffButton.scrollIntoViewIfNeeded({ timeout: 5000 });
      await rewardSeasonHandoffButton.click({ timeout: 5000 });
      await page.waitForTimeout(300);
      rewardSeasonHandoffClickProbe = await page.evaluate((before) => {
        const last = game?.lastRewardSeasonBoardHandoff || null;
        const arrival = game?.lastRewardSeasonBoardHandoffArrivalNotice || null;
        const notice = document.querySelector('[data-season-board-handoff-arrival="true"]');
        const noticeText = (notice?.textContent || '').replace(/\s+/g, ' ').trim();
        return {
          ok:
            before.visible === true &&
            game?.currentScreen === 'collection' &&
            game?.collectionHubState?.section === before.dataset.seasonBoardHandoffValue &&
            last?.sourceKey === before.dataset.seasonBoardHandoffSourceKey &&
            last?.action === before.dataset.seasonBoardHandoffAction &&
            last?.value === before.dataset.seasonBoardHandoffValue &&
            (!!arrival || !!notice) &&
            (!arrival || arrival?.value === before.dataset.seasonBoardHandoffValue) &&
            (!noticeText || noticeText.includes(before.text) || noticeText.includes('已定位到')),
          before,
          after: {
            currentScreen: game?.currentScreen || '',
            section: game?.collectionHubState?.section || '',
            last,
            arrival,
            notice: notice ? { dataset: { ...notice.dataset }, text: noticeText } : null,
          },
        };
      }, rewardSeasonHandoffBefore);
    } catch (error) {
      rewardSeasonHandoffClickProbe = {
        ok: false,
        reason: 'playwright_reward_handoff_click_failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  add(
    'reward mobile handoff CTA is clickable after scroll and routes into collection followup',
    !!rewardSeasonHandoffClickProbe?.ok,
    JSON.stringify(rewardSeasonHandoffClickProbe || null)
  );

  await page.evaluate(() => {
    if (!window.game || typeof game.showRewardScreen !== 'function') return;
    const lawId = typeof LAWS !== 'undefined' ? Object.keys(LAWS)[0] : null;
    game.showRewardScreen(145, true, { stealLaw: lawId, stealChance: 1 }, 32, { insight: 8, karma: 3 });
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(180);

  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(180);

  const narrowProbe = await page.evaluate(() => {
    const toRect = (el) => {
      if (!el) return null;
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

    const rewardScreen = document.getElementById('reward-screen');
    const main = document.querySelector('.reward-main-column');
    const side = document.querySelector('.reward-side-column');
    const expeditionPanel = document.getElementById('reward-expedition-meta');
    const chapterArcNode = expeditionPanel?.querySelector('[data-season-board-chapter-arc-reward="true"]') || null;
    const laneRewardButtons = Array.from(expeditionPanel?.querySelectorAll('[data-season-board-lane-reward-claim="true"]') || []);
    const handoffButtons = Array.from(expeditionPanel?.querySelectorAll('[data-season-board-handoff-cta="true"]') || []);
    return {
      viewportWidth: window.innerWidth,
      screenScrollWidth: rewardScreen?.scrollWidth || 0,
      screenClientWidth: rewardScreen?.clientWidth || 0,
      mainScrollWidth: main?.scrollWidth || 0,
      mainClientWidth: main?.clientWidth || 0,
      sideScrollWidth: side?.scrollWidth || 0,
      sideClientWidth: side?.clientWidth || 0,
      panelScrollWidth: expeditionPanel?.scrollWidth || 0,
      panelClientWidth: expeditionPanel?.clientWidth || 0,
      mainRect: toRect(main),
      sideRect: toRect(side),
      panelRect: toRect(expeditionPanel),
      chapterArcRect: toRect(chapterArcNode),
      laneRewardButtonRects: laneRewardButtons.map((button) => toRect(button)),
      handoffButtonRects: handoffButtons.map((button) => toRect(button)),
      chipTexts: Array.from(expeditionPanel?.querySelectorAll('[data-season-board-chip]') || []).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
      chapterArcText: chapterArcNode?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });

  add(
    'reward mobile narrow viewport keeps chips, chapter arc, verification followups, and CTA buttons reachable',
    !!narrowProbe
      && narrowProbe.screenScrollWidth <= narrowProbe.screenClientWidth + 2
      && narrowProbe.mainScrollWidth <= narrowProbe.mainClientWidth + 2
      && narrowProbe.sideScrollWidth <= narrowProbe.sideClientWidth + 2
      && narrowProbe.panelScrollWidth <= narrowProbe.panelClientWidth + 2
      && narrowProbe.mainRect?.right <= narrowProbe.viewportWidth + 2
      && narrowProbe.sideRect?.right <= narrowProbe.viewportWidth + 2
      && narrowProbe.panelRect?.right <= narrowProbe.viewportWidth + 2
      && narrowProbe.chapterArcRect?.right <= narrowProbe.viewportWidth + 2
      && narrowProbe.laneRewardButtonRects.every((rect) => rect && rect.left >= 0 && rect.right <= narrowProbe.viewportWidth + 2)
      && narrowProbe.handoffButtonRects.every((rect) => rect && rect.left >= 0 && rect.right <= narrowProbe.viewportWidth + 2)
      && narrowProbe.chipTexts.length >= 6
      && /章程|三周|章节/.test(narrowProbe.chapterArcText || ''),
    JSON.stringify(narrowProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'reward-mobile-360.png'), 'browser_reward_meta_mobile_audit', { timeout: 9000 });

  add('no console errors were emitted during reward/meta mobile audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const report = { url, findings, consoleErrors };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  const failed = findings.filter((item) => !item.pass);
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_reward_meta_mobile_audit passed');
  }

  await browser.close();
})();
