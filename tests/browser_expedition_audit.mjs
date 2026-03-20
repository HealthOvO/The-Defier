import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-expedition-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
const ENGINEERING_SNAPSHOTS = {
  observatory: {
    trackId: 'observatory',
    tier: 2,
    tierLabel: 'II阶',
    name: '观星工程',
    icon: '🔭',
    effectSummary: '观星、事件与裂隙联动抬升，常规战斗略降。'
  },
  forbidden_altar: {
    trackId: 'forbidden_altar',
    tier: 2,
    tierLabel: 'II阶',
    name: '禁术工程',
    icon: '🩸',
    effectSummary: '禁术、试炼与锻炉形成加速链，路线更偏冒险爆发。'
  }
};

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.addInitScript(() => {
    try {
      localStorage.removeItem('theDefierSave');
      localStorage.removeItem('theDefierActiveExpeditionStateV1');
      localStorage.removeItem('theDefierRunSlateArchiveV1');
      localStorage.removeItem('theDefierChallengeProgressV1');
      localStorage.removeItem('theDefierActiveChallengeRunV1');
      localStorage.removeItem('theDefierObservatoryArchiveV1');
      localStorage.removeItem('theDefierObservatoryGuideStateV1');
    } catch {}
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    ['auth-modal', 'save-slots-modal', 'generic-confirm-modal', 'save-conflict-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });
    if (!window.game) return;
    game.guestMode = true;
    game.startNewGame('linFeng');
    const bundle = typeof game.buildChallengeBundle === 'function' ? game.buildChallengeBundle('daily') : null;
    if (bundle && typeof game.applyChallengeRunStart === 'function') {
      game.applyChallengeRunStart(bundle);
      if (game.activeChallengeRun) {
        game.activeChallengeRun.progress.battleWins = 3;
        game.activeChallengeRun.progress.eliteWins = 1;
        game.activeChallengeRun.progress.realmClears = 1;
      }
      if (game.player) {
        game.player.currentHp = Math.min(game.player.maxHp || 80, 72);
      }
      if (typeof game.finalizeActiveChallengeRun === 'function') {
        game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
      }
    }
    if (typeof game.initializeExpeditionForRealm === 'function') {
      game.initializeExpeditionForRealm(game.player?.realm || 1, true);
    }
    if (typeof game.showScreen === 'function') {
      game.showScreen('map-screen');
    }
  });
  await page.waitForTimeout(1000);

  const initialProbe = await page.evaluate(() => {
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const panels = document.getElementById('map-expedition-panels');
    return {
      mode: payload?.mode || '',
      expedition: payload?.expedition || null,
      panelVisible: !!panels && getComputedStyle(panels).display !== 'none',
      panelCount: panels?.querySelectorAll('.expedition-panel-card').length || 0,
      branchButtons: panels?.querySelectorAll('.expedition-choice-card button').length || 0,
      factionCards: panels?.querySelectorAll('.expedition-faction-card').length || 0,
      nemesisName: panels?.querySelector('.expedition-nemesis-card strong')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      overviewText: panels?.querySelector('.expedition-overview-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      observatoryText: panels?.querySelector('.expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      signalText: panels?.querySelector('.expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasNemesisForecast: !!payload?.expedition?.nemesisForecast,
      recentNemesisLogCount: Array.isArray(payload?.expedition?.recentNemesisLogs) ? payload.expedition.recentNemesisLogs.length : 0,
    };
  });
  add(
    'map screen exposes expedition panels, observatory link options, and mirrors them into render_game_to_text',
    !!initialProbe &&
      initialProbe.mode === 'map-screen' &&
      initialProbe.panelVisible &&
      initialProbe.panelCount >= 6 &&
      initialProbe.branchButtons >= 8 &&
      initialProbe.factionCards === 3 &&
      initialProbe.expedition?.branchOptions?.length === 3 &&
      initialProbe.expedition?.bountyDraft?.length === 3 &&
      initialProbe.expedition?.factions?.length === 3 &&
      Array.isArray(initialProbe.expedition?.recentFactionLogs) &&
      Array.isArray(initialProbe.expedition?.recentNemesisLogs) &&
      Array.isArray(initialProbe.expedition?.bountyConflictWarnings) &&
      !!initialProbe.expedition?.observatoryLink &&
      initialProbe.hasNemesisForecast &&
      initialProbe.expedition?.observatoryLink?.bonusOptions?.length === 2 &&
      /裂界远征/.test(initialProbe.overviewText || '') &&
      /观星|精选命盘/.test(initialProbe.observatoryText || '') &&
      /最近势力变化/.test(initialProbe.signalText || '') &&
      /仇敌追猎链路/.test(initialProbe.signalText || '') &&
      /悬赏冲突提示/.test(initialProbe.signalText || '') &&
      !!initialProbe.nemesisName,
    JSON.stringify(initialProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-panels-initial.png'), 'browser_expedition_audit', { timeout: 9000 });

  const observatoryProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const observatory = state?.observatoryLink;
    const option = observatory?.bonusOptions?.find((entry) => entry.triggerType === 'node_visit') || observatory?.bonusOptions?.[0];
    if (!option) return { ok: false, reason: 'no_option' };
    game.selectExpeditionObservatoryBonus(option.id);
    if (option.triggerType === 'node_visit' && option.nodeTypes?.[0]) {
      game.recordExpeditionNodeVisit({ type: option.nodeTypes[0], accessible: true, completed: false });
    }
    const payload = JSON.parse(window.render_game_to_text());
    const observatoryText = document.querySelector('#map-expedition-panels .expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      ok: true,
      optionId: option.id,
      observatoryLink: payload?.expedition?.observatoryLink || null,
      observatoryText,
    };
  });
  add(
    'observatory panel can lock a bonus clue and sync its consumed state back into render_game_to_text',
    !!observatoryProbe &&
      observatoryProbe.ok &&
      observatoryProbe.observatoryLink?.selectedBonusId === observatoryProbe.optionId &&
      observatoryProbe.observatoryLink?.bonusOptions?.some((entry) => entry.id === observatoryProbe.optionId && entry.selected === true) &&
      (/当前线索|已触发/.test(observatoryProbe.observatoryText || '') || observatoryProbe.observatoryLink?.selectedBonusConsumed === true),
    JSON.stringify(observatoryProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-observatory-link.png'), 'browser_expedition_audit', { timeout: 9000 });

  const branchProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const branch = state?.branchOptions?.[0];
    if (!branch) return { ok: false, reason: 'no_branch' };
    game.selectExpeditionBranch(branch.id);
    const payload = JSON.parse(window.render_game_to_text());
    const note = document.querySelector('#map-expedition-panels .expedition-card-note')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const selectedCard = document.querySelector('#map-expedition-panels .expedition-choice-card.selected strong')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      ok: !!payload?.expedition?.selectedBranchId,
      branchId: branch.id,
      branchName: branch.name,
      payloadBranchId: payload?.expedition?.selectedBranchId || '',
      payloadBranchName: payload?.expedition?.selectedBranchName || '',
      note,
      selectedCard,
    };
  });
  add(
    'branch locking updates the panel highlight and render_game_to_text branch summary',
    !!branchProbe &&
      branchProbe.ok &&
      branchProbe.payloadBranchId === branchProbe.branchId &&
      branchProbe.payloadBranchName === branchProbe.branchName &&
      branchProbe.note.includes(branchProbe.branchName) &&
      branchProbe.selectedCard.includes(branchProbe.branchName),
    JSON.stringify(branchProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-branch-selected.png'), 'browser_expedition_audit', { timeout: 9000 });

  const clueProbe = await page.evaluate(() => {
    if (!window.game || typeof game.recordExpeditionNodeVisit !== 'function') return { ok: false, reason: 'no_game' };
    game.recordExpeditionNodeVisit({ type: 'event', accessible: true, completed: false });
    const payload = JSON.parse(window.render_game_to_text());
    const nemesisText = document.querySelector('#map-expedition-panels .expedition-nemesis-card')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    return {
      ok: !!payload?.expedition?.activeNemesis,
      activeNemesis: payload?.expedition?.activeNemesis || null,
      nemesisText,
    };
  });
  add(
    'nemesis panel reveals clue and richer status metadata once an event trail is explored',
    !!clueProbe &&
      clueProbe.ok &&
      typeof clueProbe.activeNemesis?.statusLabel === 'string' &&
      clueProbe.activeNemesis.statusLabel.length > 0 &&
      typeof clueProbe.activeNemesis?.clueLine === 'string' &&
      clueProbe.activeNemesis.clueLine.length > 0 &&
      (clueProbe.activeNemesis.clueRevealed === true || /线索/.test(clueProbe.nemesisText || '')),
    JSON.stringify(clueProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-nemesis-clue.png'), 'browser_expedition_audit', { timeout: 9000 });

  const bountyProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const route = state.bountyDraft.find((entry) => entry.condition?.type === 'visitNodeType') || state.bountyDraft[0];
    const battle = state.bountyDraft.find((entry) => entry.id !== route.id) || state.bountyDraft[1];
    game.toggleExpeditionBounty(route.id);
    if (battle) game.toggleExpeditionBounty(battle.id);
    const payload = JSON.parse(window.render_game_to_text());
    const selectedCount = document.querySelectorAll('#map-expedition-panels .expedition-choice-card.selected').length;
    const activeBountyNames = payload?.expedition?.activeBounties?.map((entry) => entry.name) || [];
    return {
      ok: activeBountyNames.length >= 1,
      routeId: route.id,
      routeNodeType: route.condition?.nodeType || '',
      activeBountyNames,
      activeBountyCount: payload?.expedition?.activeBounties?.length || 0,
      selectedCount,
    };
  });
  add(
    'bounty selection reflects active objectives in both UI cards and render_game_to_text',
    !!bountyProbe &&
      bountyProbe.ok &&
      bountyProbe.activeBountyCount >= 1 &&
      bountyProbe.selectedCount >= bountyProbe.activeBountyCount + 1,
    JSON.stringify(bountyProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-bounties-selected.png'), 'browser_expedition_audit', { timeout: 9000 });

  const signalProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const route = state.bountyDraft.find((entry) => entry.condition?.type === 'visitNodeType') || state.bountyDraft[0];
    const factionId = state.factions?.[0]?.id;
    if (!route || !factionId) return { ok: false, reason: 'missing_route_or_faction' };
    game.applyExpeditionFactionShift(factionId, -2, '审计：路线分歧正在加深。', { silent: true });
    const next = game.getExpeditionState();
    const targetFaction = next.factions.find((entry) => entry.id === factionId);
    if (!targetFaction) return { ok: false, reason: 'no_target_faction' };
    targetFaction.stance = -2;
    targetFaction.lastReason = '审计：该路线会继续刺激对立势力。';
    targetFaction.dislikes = [route.condition?.nodeType || 'observatory'];
    targetFaction.pressureNodeTypes = [route.condition?.nodeType || 'observatory'];
    next.activeBountyIds = Array.from(new Set([...(next.activeBountyIds || []), route.id]));
    game.expeditionState = next;
    game.persistActiveExpeditionState();
    game.refreshExpeditionProgress(true);
    game.renderExpeditionMapPanels();

    const payload = JSON.parse(window.render_game_to_text());
    const signalsText = document.querySelector('#map-expedition-panels .expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const routeCard = Array.from(document.querySelectorAll('#map-expedition-panels .expedition-choice-card')).find((card) =>
      card.textContent?.includes(route.name)
    );
    return {
      ok: true,
      routeId: route.id,
      recentFactionLogs: payload?.expedition?.recentFactionLogs || [],
      recentNemesisLogs: payload?.expedition?.recentNemesisLogs || [],
      nemesisForecast: payload?.expedition?.nemesisForecast || null,
      bountyConflicts: payload?.expedition?.bountyConflictWarnings || [],
      signalsText,
      routeCardText: routeCard?.textContent?.replace(/\s+/g, ' ').trim() || ''
    };
  });
  add(
    'signal panel and bounty cards surface recent faction logs plus concrete conflict prompts',
    !!signalProbe &&
      signalProbe.ok &&
      signalProbe.recentFactionLogs.length >= 1 &&
      signalProbe.recentNemesisLogs.length >= 1 &&
      !!signalProbe.nemesisForecast &&
      signalProbe.bountyConflicts.some((entry) => entry.bountyId === signalProbe.routeId) &&
      /最近势力变化/.test(signalProbe.signalsText || '') &&
      /仇敌追猎链路/.test(signalProbe.signalsText || '') &&
      /悬赏冲突提示/.test(signalProbe.signalsText || '') &&
      /路线分歧|刺激对立势力|审计|投靠势力|追猎/.test(signalProbe.signalsText || '') &&
      /势力牵制|关系反噬|尚未锁线|路线错位/.test(signalProbe.routeCardText || ''),
    JSON.stringify(signalProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-signals.png'), 'browser_expedition_audit', { timeout: 9000 });

  const observatoryEngineeringProbe = await page.evaluate((snapshot) => {
    if (!window.game || typeof game.initializeExpeditionForRealm !== 'function') return { ok: false, reason: 'no_game' };
    game.getStrategicEngineeringSnapshot = () => ({
      focusTrack: snapshot,
      activeTracks: [snapshot],
      allTracks: [snapshot],
      summary: `${snapshot.icon} ${snapshot.name} ${snapshot.tierLabel}`
    });
    game.initializeExpeditionForRealm(1, true);
    game.showScreen?.('map-screen');
    let state = game.getExpeditionState();
    const branch = state?.branchOptions?.find((entry) => Array.isArray(entry.nodeBias) && entry.nodeBias.includes('observatory')) || state?.branchOptions?.[0];
    if (!branch) return { ok: false, reason: 'no_branch' };
    game.selectExpeditionBranch(branch.id);
    state = game.getExpeditionState();
    const route = state?.bountyDraft?.find((entry) => entry.condition?.nodeType === 'observatory') || state?.bountyDraft?.[0];
    if (route && !state.activeBountyIds.includes(route.id)) {
      game.toggleExpeditionBounty(route.id);
    }
    game.renderExpeditionMapPanels();
    const payload = JSON.parse(window.render_game_to_text());
    return {
      ok: true,
      engineeringLink: payload?.expedition?.engineeringLink || null,
      observatoryLink: payload?.expedition?.observatoryLink || null,
      nemesisForecast: payload?.expedition?.nemesisForecast || null,
      chapterEngineering: payload?.map?.chapter?.expeditionEngineering || null,
      chapterNemesisForecast: payload?.map?.chapter?.nemesisForecast || null,
      overviewText: document.querySelector('#map-expedition-panels .expedition-overview-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      signalText: document.querySelector('#map-expedition-panels .expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      observatoryText: document.querySelector('#map-expedition-panels .expedition-observatory-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  }, ENGINEERING_SNAPSHOTS.observatory);
  add(
    'observatory engineering syncs route intel into overview, observatory, expedition payload, and chapter bridge',
    !!observatoryEngineeringProbe &&
      observatoryEngineeringProbe.ok &&
      observatoryEngineeringProbe.engineeringLink?.trackId === 'observatory' &&
      observatoryEngineeringProbe.observatoryLink?.engineeringTrackId === 'observatory' &&
      typeof observatoryEngineeringProbe.observatoryLink?.huntIntel === 'string' &&
      observatoryEngineeringProbe.observatoryLink.huntIntel.length > 0 &&
      observatoryEngineeringProbe.nemesisForecast?.engineeringTrackId === 'observatory' &&
      observatoryEngineeringProbe.nemesisForecast?.engineeringModifier === '观测锁线' &&
      observatoryEngineeringProbe.chapterEngineering?.trackId === 'observatory' &&
      observatoryEngineeringProbe.chapterNemesisForecast?.engineeringModifier === '观测锁线' &&
      /工程主轴|观星工程/.test(observatoryEngineeringProbe.overviewText || '') &&
      /工程联动|观测锁线/.test(observatoryEngineeringProbe.signalText || '') &&
      /工程情报|追猎窗口/.test(observatoryEngineeringProbe.observatoryText || ''),
    JSON.stringify(observatoryEngineeringProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-engineering-observatory.png'), 'browser_expedition_audit', { timeout: 9000 });

  const altarEngineeringProbe = await page.evaluate((snapshot) => {
    if (!window.game || typeof game.initializeExpeditionForRealm !== 'function') return { ok: false, reason: 'no_game' };
    game.getStrategicEngineeringSnapshot = () => ({
      focusTrack: snapshot,
      activeTracks: [snapshot],
      allTracks: [snapshot],
      summary: `${snapshot.icon} ${snapshot.name} ${snapshot.tierLabel}`
    });
    game.initializeExpeditionForRealm(13, true);
    game.showScreen?.('map-screen');
    let state = game.getExpeditionState();
    const branch = state?.branchOptions?.find((entry) => Array.isArray(entry.nodeBias) && entry.nodeBias.includes('forbidden_altar')) || state?.branchOptions?.[0];
    if (!branch) return { ok: false, reason: 'no_branch' };
    game.selectExpeditionBranch(branch.id);
    state = game.getExpeditionState();
    const targetBounty = state?.bountyDraft?.find((entry) => entry.condition?.nodeType === 'forbidden_altar')
      || state?.bountyDraft?.find((entry) => entry.type === 'battle' || entry.type === 'extreme')
      || state?.bountyDraft?.[0];
    if (!targetBounty) return { ok: false, reason: 'no_bounty' };
    if (!state.activeBountyIds.includes(targetBounty.id)) {
      game.toggleExpeditionBounty(targetBounty.id);
    }
    const next = game.getExpeditionState();
    if (next?.factions?.[0]) {
      next.factions[0].stance = -2;
      next.factions[0].lastReason = '审计：禁术压强正在逼近。';
      next.factions[0].dislikes = ['forbidden_altar', 'elite', 'trial'];
      next.factions[0].pressureNodeTypes = ['forbidden_altar', 'elite', 'trial'];
      game.expeditionState = next;
      game.persistActiveExpeditionState();
    }
    game.refreshExpeditionProgress?.(true);
    game.renderExpeditionMapPanels();
    const payload = JSON.parse(window.render_game_to_text());
    const activeCard = Array.from(document.querySelectorAll('#map-expedition-panels .expedition-choice-card')).find((card) =>
      card.textContent?.includes(targetBounty.name)
    );
    const branchPayload = payload?.expedition?.branchOptions?.find((entry) => entry.id === branch.id) || null;
    const bountyPayload = payload?.expedition?.bountyDraft?.find((entry) => entry.id === targetBounty.id) || null;
    return {
      ok: true,
      branchPayload,
      bountyPayload,
      engineeringLink: payload?.expedition?.engineeringLink || null,
      bountyConflicts: payload?.expedition?.bountyConflictWarnings || [],
      nemesisForecast: payload?.expedition?.nemesisForecast || null,
      chapterEngineering: payload?.map?.chapter?.expeditionEngineering || null,
      chapterNemesisForecast: payload?.map?.chapter?.nemesisForecast || null,
      signalText: document.querySelector('#map-expedition-panels .expedition-signals-card')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      activeCardText: activeCard?.textContent?.replace(/\s+/g, ' ').trim() || ''
    };
  }, ENGINEERING_SNAPSHOTS.forbidden_altar);
  add(
    'forbidden-altar engineering pushes branch bias, bounty conflict warnings, and nemesis pressure through UI and payload',
    !!altarEngineeringProbe &&
      altarEngineeringProbe.ok &&
      altarEngineeringProbe.engineeringLink?.trackId === 'forbidden_altar' &&
      altarEngineeringProbe.branchPayload?.engineeringTrackId === 'forbidden_altar' &&
      typeof altarEngineeringProbe.branchPayload?.pressureBias === 'string' &&
      altarEngineeringProbe.branchPayload.pressureBias.length > 0 &&
      altarEngineeringProbe.bountyPayload?.engineeringTrackId === 'forbidden_altar' &&
      typeof altarEngineeringProbe.bountyPayload?.engineeringNote === 'string' &&
      altarEngineeringProbe.bountyPayload.engineeringNote.length > 0 &&
      /工程牵引|禁术工程/.test(altarEngineeringProbe.bountyPayload?.signalLine || altarEngineeringProbe.bountyPayload?.engineeringNote || '') &&
      altarEngineeringProbe.nemesisForecast?.engineeringTrackId === 'forbidden_altar' &&
      altarEngineeringProbe.nemesisForecast?.engineeringModifier === '血契增压' &&
      altarEngineeringProbe.chapterEngineering?.trackId === 'forbidden_altar' &&
      altarEngineeringProbe.chapterNemesisForecast?.engineeringModifier === '血契增压' &&
      /工程联动|禁术压强|血契增压/.test(altarEngineeringProbe.signalText || '') &&
      /工程联动|禁术/.test(altarEngineeringProbe.activeCardText || ''),
    JSON.stringify(altarEngineeringProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-engineering-altar.png'), 'browser_expedition_audit', { timeout: 9000 });

  const progressProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    game.initializeExpeditionForRealm?.(1, true);
    game.showScreen?.('map-screen');
    let state = game.getExpeditionState();
    const branch = state?.branchOptions?.find((entry) => Array.isArray(entry.nodeBias) && entry.nodeBias.includes('observatory')) || state?.branchOptions?.[0];
    if (branch) {
      game.selectExpeditionBranch(branch.id);
    }
    state = game.getExpeditionState();
    const route = state.bountyDraft.find((entry) => entry.condition?.type === 'visitNodeType');
    if (!route) return { ok: false, reason: 'no_route_bounty' };
    if (!state.activeBountyIds.includes(route.id)) {
      game.toggleExpeditionBounty(route.id);
      state = game.getExpeditionState();
    }
    game.recordExpeditionNodeVisit({ type: route.condition.nodeType, accessible: true, completed: false });
    const payload = JSON.parse(window.render_game_to_text());
    const activeRoute = payload?.expedition?.activeBounties?.find((entry) => entry.id === route.id) || null;
    const routeCard = Array.from(document.querySelectorAll('#map-expedition-panels .expedition-choice-card')).find((card) =>
      card.textContent?.includes(route.name)
    );
    return {
      ok: !!activeRoute,
      routeName: route.name,
      activeRoute,
      routeCardCompleted: routeCard?.classList.contains('completed') || false,
    };
  });
  add(
    'route progression completes a bounty and syncs completion state back into the panel',
    !!progressProbe &&
      progressProbe.ok &&
      progressProbe.activeRoute.completed === true &&
      /1\/1|2\/2|3\/3/.test(progressProbe.activeRoute.progressText || '') &&
      progressProbe.routeCardCompleted === true,
    JSON.stringify(progressProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-bounty-progressed.png'), 'browser_expedition_audit', { timeout: 9000 });

  const finalizeProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const nodeType = state?.activeNemesis?.triggerNodeTypes?.[0];
    if (nodeType) {
      const enemies = game.applyExpeditionBattleModifiers([
        {
          id: 'audit_target',
          name: '校验敌影',
          hp: 80,
          maxHp: 80,
          patterns: [{ type: 'attack', value: 12, intent: '压测' }],
        }
      ], { type: nodeType });
      game.recordExpeditionBattleVictory({ type: nodeType }, enemies);
    }
    const buildBeforeFinalize = typeof game.getBuildSnapshotData === 'function' ? game.getBuildSnapshotData() : null;
    const slate = game.finalizeExpeditionChapter('realm_clear');
    const payload = JSON.parse(window.render_game_to_text());
    const panels = document.getElementById('map-expedition-panels');
    const sanctum = typeof game.getSanctumOverviewData === 'function' ? game.getSanctumOverviewData() : null;
    return {
      ok: !!slate,
      slate,
      payloadExpedition: payload?.expedition || null,
      panelHidden: !!panels && getComputedStyle(panels).display === 'none',
      buildHasExpedition: !!buildBeforeFinalize?.expedition,
      sanctumProgress: sanctum?.progress || null,
      sanctumRoomCount: sanctum?.rooms?.filter((room) => room.id === 'run_slate_archive').length || 0,
    };
  });
  add(
    'finalizing a chapter archives the run slate, hides live panels, and keeps archive data in render_game_to_text',
    !!finalizeProbe &&
      finalizeProbe.ok &&
      finalizeProbe.panelHidden &&
      finalizeProbe.buildHasExpedition &&
      finalizeProbe.payloadExpedition?.latestSlate?.id === finalizeProbe.slate.id &&
      finalizeProbe.sanctumProgress?.runSlateArchives >= 1 &&
      finalizeProbe.sanctumRoomCount === 1,
    JSON.stringify(finalizeProbe || null)
  );
  await safeAuditScreenshot(page, path.join(outDir, 'expedition-finalized.png'), 'browser_expedition_audit', { timeout: 9000 });

  add('no console errors were emitted during expedition audit', consoleErrors.length === 0, JSON.stringify(consoleErrors));

  const failed = findings.filter((item) => !item.pass);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url, findings, consoleErrors }, null, 2));
  if (failed.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  } else {
    console.log('browser_expedition_audit passed');
  }

  await browser.close();
})();
