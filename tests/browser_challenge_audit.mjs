import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-challenge-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('theDefierChallengeProgressV1');
      localStorage.removeItem('theDefierActiveChallengeRunV1');
      localStorage.removeItem('theDefierChallengeHubStateV1');
      localStorage.removeItem('theDefierObservatoryArchiveV1');
      localStorage.removeItem('theDefierObservatoryGuideStateV1');
      localStorage.removeItem('theDefierSave');
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    if (typeof AuthService !== 'undefined') {
      AuthService.cloudEnabled = false;
      AuthService.isInitialized = false;
      AuthService.currentUser = null;
    }
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (window.game && typeof game.showScreen === 'function') game.showScreen('main-menu');
  });
  await page.waitForTimeout(250);

  await page.click('button[onclick="game.showChallengeHub(\'daily\')"]', { timeout: 5000, force: true });
  await page.waitForTimeout(350);

  const challengeHubProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const title = document.getElementById('challenge-hub-title')?.textContent?.trim() || '';
    const subtitle = document.getElementById('challenge-hub-subtitle')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const summary = document.getElementById('challenge-hub-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const sideText = document.getElementById('challenge-hub-side')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const rewardCount = document.querySelectorAll('#challenge-hub-rewards .challenge-reward-card').length;
    const tabCount = document.querySelectorAll('#challenge-screen .challenge-tab-btn').length;
    const dangerChipCount = document.querySelectorAll('#challenge-hub-summary .challenge-danger-chip').length;
    return {
      mode: payload?.mode || '',
      challenge: payload?.challenge || null,
      title,
      subtitle,
      summary,
      sideText,
      rewardCount,
      tabCount,
      dangerChipCount
    };
  });
  add(
    'challenge hub opens from main menu and exposes daily rotation summary plus challenge danger profile',
    !!challengeHubProbe &&
      challengeHubProbe.mode === 'challenge-screen' &&
      /观星台/.test(challengeHubProbe.title || '') &&
      /观星样本|命盘|远征线索/.test(challengeHubProbe.subtitle || '') &&
      /第1章|完成线/.test(challengeHubProbe.summary || '') &&
      /试炼压强|DRI/.test(challengeHubProbe.summary || '') &&
      /难度同轴|主轴/.test(challengeHubProbe.sideText || '') &&
      challengeHubProbe.rewardCount >= 1 &&
      challengeHubProbe.tabCount === 3 &&
      challengeHubProbe.dangerChipCount === 4 &&
      challengeHubProbe.challenge?.hub?.activeTab === 'daily' &&
      (challengeHubProbe.challenge?.hub?.dangerProfile?.axes?.length || 0) === 4 &&
      (challengeHubProbe.challenge?.hub?.dangerProfile?.index || 0) >= 1 &&
      !!challengeHubProbe.challenge?.hub?.dangerProfile?.dominantAxisLabel,
    JSON.stringify(challengeHubProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-hub-desktop.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && typeof game.beginChallengeStart === 'function') {
      game.beginChallengeStart('daily');
    }
  });
  await page.waitForTimeout(300);

  const guestPromptVisible = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (guestPromptVisible) {
    await page.click('#generic-cancel-btn', { timeout: 3000, force: true });
    await page.waitForTimeout(450);
  }

  const selectionProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const bannerText = document.getElementById('challenge-selection-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const lockedCount = document.querySelectorAll('.character-card.challenge-card-locked').length;
    const selectedCount = document.querySelectorAll('.character-card.selected').length;
    const destinyCount = document.querySelectorAll('#run-destiny-selection .run-destiny-card').length;
    const spiritCount = document.querySelectorAll('#spirit-companion-selection .run-spirit-card').length;
    const confirmText = document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '';
    return {
      mode: payload?.mode || '',
      pending: payload?.challenge?.pending || null,
      bannerText,
      lockedCount,
      selectedCount,
      destinyCount,
      spiritCount,
      confirmText
    };
  });
  add(
    'challenge launch locks character selection and compresses destiny/spirit picks into fixed options',
    !!selectionProbe &&
      selectionProbe.mode === 'character-selection-screen' &&
      /今日天机|第1章/.test(selectionProbe.bannerText || '') &&
      /DRI|主轴/.test(selectionProbe.bannerText || '') &&
      selectionProbe.lockedCount >= 1 &&
      selectionProbe.selectedCount === 1 &&
      selectionProbe.destinyCount === 1 &&
      selectionProbe.spiritCount === 1 &&
      /开局/.test(selectionProbe.confirmText || '') &&
      selectionProbe.pending?.mode === 'daily' &&
      (selectionProbe.pending?.dangerProfile?.index || 0) >= 1,
    JSON.stringify(selectionProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-selection-locked.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.click('#confirm-character-btn', { timeout: 4000, force: true });
  await page.waitForTimeout(900);

  const mapProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-run-banner');
    const style = banner ? getComputedStyle(banner) : null;
    return {
      mode: payload?.mode || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerVisible: !!banner && !!style && style.display !== 'none' && style.visibility !== 'hidden',
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      runDestinyId: payload?.player?.runDestiny?.id || null,
      spiritId: payload?.player?.spiritCompanion?.id || null
    };
  });
  add(
    'daily challenge start jumps directly into run and surfaces active challenge banner with shared danger axis on map',
    !!mapProbe &&
      mapProbe.mode === 'map-screen' &&
      mapProbe.bannerVisible &&
      /今日天机|第 3 重|第1章/.test(mapProbe.bannerText || '') &&
      /DRI/.test(mapProbe.bannerText || '') &&
      mapProbe.activeRun?.mode === 'daily' &&
      mapProbe.activeRun?.goalRealm === 3 &&
      (mapProbe.activeRun?.dangerProfile?.index || 0) >= 1 &&
      !!mapProbe.runDestinyId &&
      !!mapProbe.spiritId,
    JSON.stringify(mapProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-map-banner.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && game.activeChallengeRun && typeof game.finalizeActiveChallengeRun === 'function') {
      game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
      if (typeof game.showChallengeHub === 'function') game.showChallengeHub('daily');
    }
  });
  await page.waitForTimeout(350);

  await page.evaluate(() => {
    if (!window.game || typeof game.buildChallengeBundle !== 'function' || typeof game.applyChallengeRunStart !== 'function') return;
    const bundle = game.buildChallengeBundle('daily');
    if (!bundle) return;
    game.applyChallengeRunStart(bundle);
    if (game.activeChallengeRun) {
      game.activeChallengeRun.progress.battleWins = 4;
      game.activeChallengeRun.progress.eliteWins = 2;
      game.activeChallengeRun.progress.realmClears = Math.max(1, game.activeChallengeRun.goalRealm || 3);
    }
    if (game.player) {
      game.player.currentHp = Math.max(18, Math.min(game.player.maxHp || 80, 44));
    }
    if (typeof game.finalizeActiveChallengeRun === 'function') {
      game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
    }
    const oracleRule = Array.isArray(window.CHALLENGE_RULES?.daily)
      ? window.CHALLENGE_RULES.daily.find((rule) => rule.id === 'daily_star_script')
      : null;
    if (oracleRule && typeof game.recordObservatoryArchiveEntry === 'function') {
      game.recordObservatoryArchiveEntry({
        id: 'browser_oracle_a',
        type: 'challenge',
        mode: 'daily',
        rotationKey: '2026-03-14',
        title: oracleRule.name,
        score: 166,
        completed: true,
        at: Date.now() + 1,
        seedSignature: 'D-ORACLE-A',
        reason: 'goal_reached',
        replayOnly: false,
        metrics: {
          hpRatio: 0.74,
          lawGains: 2,
          treasureGains: 1,
          battleWins: 3,
          eliteWins: 1,
          bossWins: 0,
          realmClears: 3,
        },
        preferredNodes: ['observatory', 'event', 'memory_rift'],
        rule: oracleRule,
      });
      game.recordObservatoryArchiveEntry({
        id: 'browser_oracle_b',
        type: 'challenge',
        mode: 'daily',
        rotationKey: '2026-03-14',
        title: oracleRule.name,
        score: 148,
        completed: true,
        at: Date.now() + 2,
        seedSignature: 'D-ORACLE-B',
        reason: 'goal_reached',
        replayOnly: false,
        metrics: {
          hpRatio: 0.61,
          lawGains: 1,
          treasureGains: 0,
          battleWins: 2,
          eliteWins: 0,
          bossWins: 0,
          realmClears: 2,
        },
        preferredNodes: ['observatory', 'event', 'memory_rift'],
        rule: oracleRule,
      });
    }
    const weeklyRule = Array.isArray(window.CHALLENGE_RULES?.weekly) ? window.CHALLENGE_RULES.weekly[0] : null;
    if (weeklyRule && typeof game.recordObservatoryArchiveEntry === 'function') {
      game.recordObservatoryArchiveEntry({
        id: 'browser_weekly_a',
        type: 'challenge',
        mode: 'weekly',
        rotationKey: '2026-W11',
        title: weeklyRule.name,
        score: 172,
        completed: true,
        at: Date.now() - 3600000,
        seedSignature: 'W-WEEKLY-A',
        reason: 'goal_reached',
        replayOnly: false,
        metrics: {
          hpRatio: 0.69,
          lawGains: 2,
          treasureGains: 1,
          battleWins: 4,
          eliteWins: 1,
          bossWins: 0,
          realmClears: 3,
        },
        preferredNodes: ['elite', 'trial', 'observatory'],
        rule: weeklyRule,
      });
    }
    if (typeof game.showChallengeHub === 'function') game.showChallengeHub('daily');
  });
  await page.waitForTimeout(350);

  await page.evaluate(() => {
    if (!window.game || typeof game.setObservatoryTrainingFocus !== 'function') return;
    const guide = typeof game.getSelectedObservatoryExpeditionGuide === 'function'
      ? game.getSelectedObservatoryExpeditionGuide({ silentSync: true })
      : null;
    if (!guide) return;
    game.setObservatoryTrainingFocus({
      sourceRunId: 'browser_training_focus',
      chapterName: '第 4 章',
      sourceTitle: guide.title || '当前精选命盘',
      guideRecordId: guide.id || '',
      themeKey: guide.themeKey || 'assault',
      themeLabel: guide.themeLabel || '前压爆发',
      ratingLabel: '贴题成卷',
      ratingTone: 'completed',
      trainingAdvice: `先按${guide.themeLabel || '当前样本'}样本补两段高分可回放答卷，再回去对照悬赏节奏。`,
      highlightLine: '上一章已经把主练方向交给观察站，这里应该直接显示给玩家。',
      routeFocusLine: guide.routeFocusLine || '优先节点：战斗 / 精英 / 试炼',
      compareHint: guide.compareHint || '对比先手压制、收头效率与能否稳定抢下前段节拍。',
      trainingTags: Array.isArray(guide.trainingTags) && guide.trainingTags.length > 0 ? guide.trainingTags : ['稳血收官'],
      goalHighlights: ['路线扣题：优先回到样本主轴', '样本实操：先补两段可回放高分样本'],
    }, { silent: true });
    if (typeof game.showChallengeHub === 'function') game.showChallengeHub('daily');
  });
  await page.waitForTimeout(250);

  const archiveProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const recordsText = document.getElementById('challenge-hub-records')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const replayButtons = document.querySelectorAll('#challenge-hub-records .challenge-record-actions .collection-inline-btn').length;
    const compareCards = document.querySelectorAll('#challenge-hub-records .challenge-compare-card').length;
    const insightCards = document.querySelectorAll('#challenge-hub-records .challenge-record-insight').length;
    const compareInsightCards = document.querySelectorAll('#challenge-hub-records .challenge-compare-card .challenge-record-insight').length;
    const sideInsightCards = document.querySelectorAll('#challenge-hub-side .challenge-record-insight').length;
    const summaryText = document.getElementById('challenge-hub-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const sideGuideText = document.querySelector('#challenge-hub-side .codex-side-card:last-child')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const compareAxisText = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-compare-card .challenge-record-insight-line'))
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean)
      .join(' | ');
    const archiveFilterSelectCount = document.querySelectorAll('#challenge-hub-records .challenge-archive-filter select').length;
    const archivePresetButtonCount = document.querySelectorAll('#challenge-hub-records [data-archive-preset-slot]').length;
    const trainingFocusBtn = document.querySelector('#challenge-hub-side [data-apply-training-focus="true"]');
    return {
      mode: payload?.mode || '',
      archive: payload?.challenge?.archive || null,
      hub: payload?.challenge?.hub || null,
      guide: payload?.challenge?.observatoryGuide || null,
      trainingFocus: payload?.challenge?.trainingFocus || null,
      recordsText,
      replayButtons,
      compareCards,
      insightCards,
      compareInsightCards,
      sideInsightCards,
      summaryText,
      sideGuideText,
      trainingFocusText: document.querySelector('#challenge-hub-side [data-observatory-training-focus="true"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      compareAxisText,
      archiveFilterSelectCount,
      archivePresetButtonCount,
      trainingFocusBtnText: trainingFocusBtn?.textContent?.replace(/\s+/g, ' ').trim() || '',
      trainingFocusBtnDisabled: !!trainingFocusBtn?.disabled,
    };
  });
  add(
    'challenge hub now surfaces seed signatures, drill tags, same-theme comparison axes, and replay sample insights after a completed run',
    !!archiveProbe &&
      archiveProbe.mode === 'challenge-screen' &&
      archiveProbe.archive?.totalRecords >= 1 &&
      archiveProbe.archive?.replayableCount >= 1 &&
      archiveProbe.archive?.featuredCount >= 1 &&
      /^D-/.test(archiveProbe.hub?.seedSignature || '') &&
      (archiveProbe.hub?.dangerProfile?.index || 0) >= 1 &&
      archiveProbe.hub?.comparisonCount >= 2 &&
      archiveProbe.replayButtons >= 1 &&
      archiveProbe.compareCards >= 2 &&
      archiveProbe.insightCards >= 2 &&
      archiveProbe.compareInsightCards >= 1 &&
      archiveProbe.sideInsightCards >= 1 &&
      archiveProbe.archiveFilterSelectCount >= 5 &&
      archiveProbe.archivePresetButtonCount >= 2 &&
      !!archiveProbe.guide?.title &&
      (archiveProbe.guide?.featuredTags?.length || 0) >= 2 &&
      (archiveProbe.guide?.trainingTags?.length || 0) >= 1 &&
      (archiveProbe.guide?.preferredNodes?.length || 0) >= 1 &&
      !!archiveProbe.trainingFocus?.trainingAdvice &&
      archiveProbe.trainingFocus?.guideRecordId === archiveProbe.guide?.id &&
      /优先节点/.test(archiveProbe.guide?.routeFocusLine || '') &&
      /对比/.test(archiveProbe.guide?.compareHint || '') &&
      !!archiveProbe.guide?.drillObjective &&
      !!archiveProbe.guide?.insight?.title &&
      /命盘签/.test(archiveProbe.summaryText || '') &&
      /观星留痕|复盘命盘|同主题对比|样本层|窗口|排序|预设/.test(archiveProbe.recordsText || '') &&
      /复刻重点|失手剖面|回放复刻|回放试错|演练目标/.test(archiveProbe.recordsText || '') &&
      /血线稳定|守阵容错|续航补件|前段节拍|收头效率|高压接战|补件速度|器灵换强|高压兑现|观测收益|路线贴合|控场稳定|连段续速|中盘滚动|资源衰减|跨章耐压|终盘完整度|高压答卷/.test(archiveProbe.compareAxisText || '') &&
      /优先节点|训练标签|演练目标|对比抓手/.test(archiveProbe.sideGuideText || '') &&
      /主练|样本/.test(archiveProbe.trainingFocusText || '') &&
      /按建议筛留痕/.test(archiveProbe.trainingFocusBtnText || '') &&
      archiveProbe.trainingFocusBtnDisabled === false,
    JSON.stringify(archiveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-archive-replay.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.click('#challenge-hub-side [data-apply-training-focus="true"]', { timeout: 4000, force: true });
  await page.waitForTimeout(350);

  const trainingFocusFilterProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const archiveSection = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-record-section'))
      .find((section) => /观星留痕/.test(section.querySelector('.challenge-record-section-head strong')?.textContent || ''));
    const filterChipText = Array.from(archiveSection?.querySelectorAll('.challenge-archive-summary-tags .challenge-tag') || [])
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean)
      .join(' | ');
    return {
      archive: payload?.challenge?.archive || null,
      trainingFocus: payload?.challenge?.trainingFocus || null,
      filterChipText,
      buttonDisabled: !!document.querySelector('#challenge-hub-side [data-apply-training-focus="true"]')?.disabled,
    };
  });
  add(
    'challenge side rail can jump archive filters into the persisted training focus view',
    !!trainingFocusFilterProbe &&
      trainingFocusFilterProbe.archive?.filterState?.scope === 'all' &&
      trainingFocusFilterProbe.archive?.filterState?.track === 'playable' &&
      trainingFocusFilterProbe.archive?.filterState?.outcome === 'all' &&
      trainingFocusFilterProbe.archive?.filterState?.themeKey === trainingFocusFilterProbe.trainingFocus?.themeKey &&
      trainingFocusFilterProbe.archive?.filterState?.sortBy === 'score_desc' &&
      /跨赛道|可回放|高分优先/.test(trainingFocusFilterProbe.filterChipText || '') &&
      trainingFocusFilterProbe.buttonDisabled === true,
    JSON.stringify(trainingFocusFilterProbe || null)
  );

  await page.selectOption('#challenge-hub-records select[data-archive-filter="scope"]', 'all');
  await page.waitForTimeout(250);
  await page.selectOption('#challenge-hub-records select[data-archive-filter="track"]', 'challenge');
  await page.waitForTimeout(250);
  await page.selectOption('#challenge-hub-records select[data-archive-filter="outcome"]', 'completed');
  await page.waitForTimeout(250);
  await page.selectOption('#challenge-hub-records select[data-archive-filter="theme"]', 'oracle');
  await page.waitForTimeout(250);
  await page.selectOption('#challenge-hub-records select[data-archive-filter="sort"]', 'score_desc');
  await page.waitForTimeout(350);

  const archiveFilterProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const archiveSection = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-record-section'))
      .find((section) => /观星留痕/.test(section.querySelector('.challenge-record-section-head strong')?.textContent || ''));
    const archiveCards = Array.from(archiveSection?.querySelectorAll('.challenge-record-item') || []);
    const archiveCardText = archiveCards
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean);
    const archiveCardScores = archiveCardText
      .map((text) => {
        const match = text.match(/得分\s+(\d+)/);
        return match ? Number(match[1]) : 0;
      });
    const filterChipText = Array.from(archiveSection?.querySelectorAll('.challenge-archive-summary-tags .challenge-tag') || [])
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean)
      .join(' | ');
    return {
      archive: payload?.challenge?.archive || null,
      archiveCardCount: archiveCards.length,
      archiveCardText,
      archiveCardScores,
      filterChipText,
      resetDisabled: !!archiveSection?.querySelector('[data-reset-archive-filters]')?.disabled,
      presetLabels: Array.from(archiveSection?.querySelectorAll('[data-archive-preset-slot]') || [])
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() || '')
        .filter(Boolean),
    };
  });
  add(
    'challenge observatory archive filter bar supports cross-scope theme retrieval and serializes the active筛面',
    !!archiveFilterProbe &&
      archiveFilterProbe.archive?.filterState?.scope === 'all' &&
      archiveFilterProbe.archive?.filterState?.track === 'challenge' &&
      archiveFilterProbe.archive?.filterState?.outcome === 'completed' &&
      archiveFilterProbe.archive?.filterState?.themeKey === 'oracle' &&
      archiveFilterProbe.archive?.filterState?.sortBy === 'score_desc' &&
      (archiveFilterProbe.archive?.filteredCount || 0) >= 2 &&
      (archiveFilterProbe.archive?.scopeTotalCount || 0) > (archiveFilterProbe.archive?.filteredCount || 0) &&
      (archiveFilterProbe.archive?.filteredReplayableCount || 0) >= 2 &&
      archiveFilterProbe.archiveCardCount >= 2 &&
      archiveFilterProbe.archiveCardScores[0] >= archiveFilterProbe.archiveCardScores[1] &&
      archiveFilterProbe.archiveCardText.every((text) => /推演控场|daily_star_script|星/.test(text || '')) &&
      archiveFilterProbe.archiveCardText.every((text) => !/观星预兆/.test(text || '')) &&
      /跨赛道|挑战成绩|完成答卷|高分优先/.test(archiveFilterProbe.filterChipText || '') &&
      /推演控场|当前主题/.test(archiveFilterProbe.filterChipText || '') &&
      archiveFilterProbe.resetDisabled === false,
    JSON.stringify(archiveFilterProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-archive-filtered.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.click('#challenge-hub-records [data-save-archive-preset-slot="0"]', { timeout: 4000, force: true });
  await page.waitForTimeout(350);

  const archivePresetSaveProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      archive: payload?.challenge?.archive || null,
      presetLabel: document.querySelector('#challenge-hub-records [data-archive-preset-slot="0"]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  add(
    'challenge observatory archive preset can save the current filtered and sorted training view',
    !!archivePresetSaveProbe &&
      Array.isArray(archivePresetSaveProbe.archive?.presetLabels) &&
      /预设 1/.test(archivePresetSaveProbe.archive?.presetLabels?.[0] || '') &&
      /高分优先/.test(archivePresetSaveProbe.archive?.presetLabels?.[0] || '') &&
      /推演控场/.test(archivePresetSaveProbe.archive?.presetLabels?.[0] || '') &&
      /预设 1/.test(archivePresetSaveProbe.presetLabel || ''),
    JSON.stringify(archivePresetSaveProbe || null)
  );

  await page.click('#challenge-hub-records [data-reset-archive-filters="true"]', { timeout: 4000, force: true });
  await page.waitForTimeout(350);

  const archiveFilterResetProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      archive: payload?.challenge?.archive || null,
      resetDisabled: !!document.querySelector('#challenge-hub-records [data-reset-archive-filters="true"]')?.disabled,
    };
  });
  add(
    'archive filter reset returns observatory history view to default playable same-lane state',
    !!archiveFilterResetProbe &&
      archiveFilterResetProbe.archive?.filterState?.scope === 'mode' &&
      archiveFilterResetProbe.archive?.filterState?.track === 'playable' &&
      archiveFilterResetProbe.archive?.filterState?.outcome === 'all' &&
      archiveFilterResetProbe.archive?.filterState?.themeKey === 'all' &&
      archiveFilterResetProbe.archive?.filterState?.sortBy === 'recent' &&
      (archiveFilterResetProbe.archive?.filteredCount || 0) >= 3 &&
      archiveFilterResetProbe.resetDisabled === true,
    JSON.stringify(archiveFilterResetProbe || null)
  );

  await page.click('#challenge-hub-records [data-archive-preset-slot="0"]', { timeout: 4000, force: true });
  await page.waitForTimeout(350);

  const archivePresetApplyProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const archiveSection = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-record-section'))
      .find((section) => /观星留痕/.test(section.querySelector('.challenge-record-section-head strong')?.textContent || ''));
    const archiveCardText = Array.from(archiveSection?.querySelectorAll('.challenge-record-item') || [])
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean);
    const archiveCardScores = archiveCardText
      .map((text) => {
        const match = text.match(/得分\s+(\d+)/);
        return match ? Number(match[1]) : 0;
      });
    const presetBtn = archiveSection?.querySelector('[data-archive-preset-slot="0"]');
    return {
      archive: payload?.challenge?.archive || null,
      archiveCardText,
      archiveCardScores,
      presetBtnText: presetBtn?.textContent?.replace(/\s+/g, ' ').trim() || '',
      presetBtnClass: presetBtn?.className || '',
    };
  });
  add(
    'saved archive preset reapplies oracle high-score training view after reset',
    !!archivePresetApplyProbe &&
      archivePresetApplyProbe.archive?.filterState?.scope === 'all' &&
      archivePresetApplyProbe.archive?.filterState?.track === 'challenge' &&
      archivePresetApplyProbe.archive?.filterState?.outcome === 'completed' &&
      archivePresetApplyProbe.archive?.filterState?.themeKey === 'oracle' &&
      archivePresetApplyProbe.archive?.filterState?.sortBy === 'score_desc' &&
      Array.isArray(archivePresetApplyProbe.archive?.activePresetSlots) &&
      archivePresetApplyProbe.archive.activePresetSlots.includes(0) &&
      archivePresetApplyProbe.archiveCardScores[0] >= archivePresetApplyProbe.archiveCardScores[1] &&
      archivePresetApplyProbe.archiveCardText.every((text) => /推演控场|星录推演/.test(text || '')) &&
      /active|secondary/.test(archivePresetApplyProbe.presetBtnClass || ''),
    JSON.stringify(archivePresetApplyProbe || null)
  );

  const guideSwitchTarget = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const currentGuideId = payload?.challenge?.observatoryGuide?.id || '';
    const target = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-compare-card [data-guide-record-id]'))
      .find((btn) => /设为远征线索/.test(btn.textContent || '') && (btn.getAttribute('data-guide-record-id') || '') !== currentGuideId);
    return {
      currentGuideId,
      targetGuideId: target?.getAttribute('data-guide-record-id') || '',
    };
  });
  if (guideSwitchTarget?.targetGuideId) {
    await page.click(`[data-guide-record-id="${guideSwitchTarget.targetGuideId}"]`, { timeout: 4000, force: true });
    await page.waitForTimeout(350);
  }

  const guideSwitchProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    return {
      archive: payload?.challenge?.archive || null,
      guide: payload?.challenge?.observatoryGuide || null,
      selectedCompareCardIds: Array.from(document.querySelectorAll('#challenge-hub-records .challenge-compare-card.selected'))
        .map((el) => el.getAttribute('data-record-id') || '')
        .filter(Boolean),
      currentGuideButtonIds: Array.from(document.querySelectorAll('#challenge-hub-records [data-guide-record-id]'))
        .filter((btn) => /当前远征线索/.test(btn.textContent || ''))
        .map((btn) => btn.getAttribute('data-guide-record-id') || '')
        .filter(Boolean),
      sideGuideText: document.querySelector('#challenge-hub-side .codex-side-card:last-child')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  add(
    'switching an alternate observatory guide updates current expedition clue state in hub payload and UI',
    !!guideSwitchTarget?.targetGuideId &&
      guideSwitchTarget.targetGuideId !== guideSwitchTarget.currentGuideId &&
      guideSwitchProbe.archive?.selectedGuideId === guideSwitchTarget.targetGuideId &&
      guideSwitchProbe.guide?.id === guideSwitchTarget.targetGuideId &&
      guideSwitchProbe.selectedCompareCardIds.includes(guideSwitchTarget.targetGuideId) &&
      guideSwitchProbe.currentGuideButtonIds.includes(guideSwitchTarget.targetGuideId) &&
      /当前远征线索|优先节点|演练目标/.test(guideSwitchProbe.sideGuideText || ''),
    JSON.stringify({ guideSwitchTarget, guideSwitchProbe })
  );

  await page.evaluate(() => {
    const btn = document.querySelector('#challenge-hub-records [data-replay-record-id]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(350);

  const replayGuestPromptVisible = await page.locator('#generic-confirm-modal.active #generic-cancel-btn').isVisible().catch(() => false);
  if (replayGuestPromptVisible) {
    await page.click('#generic-cancel-btn', { timeout: 3000, force: true });
    await page.waitForTimeout(450);
  }

  const replaySelectionProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const bannerText = document.getElementById('challenge-selection-banner')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const insightText = document.querySelector('#challenge-selection-banner .challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const confirmText = document.querySelector('#confirm-character-btn .btn-text')?.textContent?.trim() || '';
    return {
      mode: payload?.mode || '',
      pending: payload?.challenge?.pending || null,
      bannerText,
      insightText,
      confirmText
    };
  });
  add(
    'replaying an archived observatory record re-enters locked selection in replay-only mode with explicit sample training focus',
    !!replaySelectionProbe &&
      replaySelectionProbe.mode === 'character-selection-screen' &&
      replaySelectionProbe.pending?.replayOnly === true &&
      /^D-/.test(replaySelectionProbe.pending?.seedSignature || '') &&
      /观星回放/.test(replaySelectionProbe.bannerText || '') &&
      !!replaySelectionProbe.pending?.archiveInsight?.title &&
      /回放复刻|回放试错/.test(replaySelectionProbe.insightText || '') &&
      /演练目标|稳血收官|高压过线|补件断档/.test(replaySelectionProbe.insightText || '') &&
      /回放命盘/.test(replaySelectionProbe.confirmText || ''),
    JSON.stringify(replaySelectionProbe || null)
  );

  await page.click('#confirm-character-btn', { timeout: 4000, force: true });
  await page.waitForTimeout(900);

  const replayMapProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const banner = document.getElementById('challenge-run-banner');
    const focusText = banner?.querySelector('.challenge-run-focus')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      mode: payload?.mode || '',
      activeRun: payload?.challenge?.activeRun || null,
      bannerText: banner?.textContent?.replace(/\s+/g, ' ').trim() || '',
      focusText
    };
  });
  add(
    'archived replay starts a replay-only run whose banner keeps seed signature, non-reward state, and training focus visible',
    !!replayMapProbe &&
      replayMapProbe.mode === 'map-screen' &&
      replayMapProbe.activeRun?.replayOnly === true &&
      /^D-/.test(replayMapProbe.activeRun?.seedSignature || '') &&
      /观星回放/.test(replayMapProbe.bannerText || '') &&
      /命盘签/.test(replayMapProbe.bannerText || '') &&
      /不计奖励/.test(replayMapProbe.bannerText || '') &&
      !!replayMapProbe.activeRun?.archiveInsight?.title &&
      /训练重点/.test(replayMapProbe.focusText || ''),
    JSON.stringify(replayMapProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-replay-banner.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && game.activeChallengeRun && typeof game.finalizeActiveChallengeRun === 'function') {
      game.finalizeActiveChallengeRun({ completed: false, reason: 'battle_lost' });
      if (typeof game.showChallengeHub === 'function') game.showChallengeHub('daily');
    }
  });
  await page.waitForTimeout(350);

  const replayFailureProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const recordsText = document.getElementById('challenge-hub-records')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const archiveSideCard = Array.from(document.querySelectorAll('#challenge-hub-side .codex-side-card'))
      .find((card) => /观星留痕/.test(card.textContent || ''));
    const latestInsightText = archiveSideCard?.querySelector('.challenge-record-insight')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      mode: payload?.mode || '',
      archive: payload?.challenge?.archive || null,
      recordsText,
      latestInsightText
    };
  });
  add(
    'failed replay returns to challenge hub while preserved training preset still surfaces retry-oriented insight',
    !!replayFailureProbe &&
      replayFailureProbe.mode === 'challenge-screen' &&
      replayFailureProbe.archive?.filterState?.scope === 'all' &&
      replayFailureProbe.archive?.filterState?.track === 'challenge' &&
      replayFailureProbe.archive?.filterState?.outcome === 'completed' &&
      replayFailureProbe.archive?.filterState?.themeKey === 'oracle' &&
      replayFailureProbe.archive?.filterState?.sortBy === 'score_desc' &&
      Array.isArray(replayFailureProbe.archive?.activePresetSlots) &&
      replayFailureProbe.archive.activePresetSlots.includes(0) &&
      /回放试错|补救建议|资源缺口/.test(replayFailureProbe.latestInsightText || '') &&
      /回放试错/.test(replayFailureProbe.archive?.latestInsight?.title || replayFailureProbe.archive?.latestInsightTitle || ''),
    JSON.stringify(replayFailureProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-replay-failure-hub.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  const mobileArchiveProbe = await page.evaluate(() => {
    const shell = document.querySelector('.challenge-shell');
    const scroll = document.querySelector('.challenge-scroll-container');
    const records = document.getElementById('challenge-hub-records');
    const root = document.documentElement;
    const lineRects = Array.from(document.querySelectorAll('#challenge-hub-records .challenge-record-insight-line')).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });
    return {
      shellWidth: Math.round(shell?.getBoundingClientRect().width || 0),
      scrollWidth: Math.round(scroll?.getBoundingClientRect().width || 0),
      recordsWidth: Math.round(records?.getBoundingClientRect().width || 0),
      docScrollWidth: Math.round(root?.scrollWidth || 0),
      insightCount: lineRects.length,
      widestInsightLine: lineRects.reduce((max, rect) => Math.max(max, Math.round(rect.width || 0)), 0),
      ok:
        !!shell &&
        !!scroll &&
        !!records &&
        lineRects.length >= 3 &&
        (root?.scrollWidth || 0) <= window.innerWidth + 8 &&
        lineRects.every((rect) => rect.left >= 0 && rect.right <= window.innerWidth - 4)
    };
  });
  add(
    'challenge archive insights remain readable on mobile without horizontal overflow',
    !!mobileArchiveProbe &&
      mobileArchiveProbe.ok &&
      mobileArchiveProbe.shellWidth > 300 &&
      mobileArchiveProbe.scrollWidth > 300 &&
      mobileArchiveProbe.recordsWidth > 250,
    JSON.stringify(mobileArchiveProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-archive-mobile.png'), 'browser_challenge_audit', { timeout: 9000 });

  await page.evaluate(() => {
    if (window.game && typeof game.showChallengeHub === 'function') game.showChallengeHub('weekly');
  });
  await page.waitForTimeout(300);

  const mobileProbe = await page.evaluate(() => {
    const shell = document.querySelector('.challenge-shell');
    const scroll = document.querySelector('.challenge-scroll-container');
    const tabs = Array.from(document.querySelectorAll('.challenge-tab-btn')).map((el) => el.getBoundingClientRect().width);
    const launchBtn = document.querySelector('#challenge-hub-launch .challenge-launch-btn');
    return {
      shellWidth: Math.round(shell?.getBoundingClientRect().width || 0),
      scrollWidth: Math.round(scroll?.getBoundingClientRect().width || 0),
      tabWidths: tabs,
      launchWidth: Math.round(launchBtn?.getBoundingClientRect().width || 0)
    };
  });
  add(
    'challenge hub remains readable on mobile with stacked layout and reachable CTA',
    !!mobileProbe &&
      mobileProbe.shellWidth > 300 &&
      mobileProbe.scrollWidth > 300 &&
      mobileProbe.tabWidths.length === 3 &&
      mobileProbe.tabWidths.every((width) => width > 80) &&
      mobileProbe.launchWidth > 250,
    JSON.stringify(mobileProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'challenge-hub-mobile.png'), 'browser_challenge_audit', { timeout: 9000 });

  add('no console errors were emitted during challenge audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const result = { url, findings, consoleErrors, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  const failed = findings.filter((item) => !item.pass);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
