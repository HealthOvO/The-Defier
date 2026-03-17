import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-expedition-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 6000 });
  } catch (err) {
    console.warn(`[browser_expedition_audit] screenshot skipped: ${err?.message || err}`);
  }
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
    };
  });
  add(
    'map screen exposes expedition panels, observatory link options, and mirrors them into render_game_to_text',
    !!initialProbe &&
      initialProbe.mode === 'map-screen' &&
      initialProbe.panelVisible &&
      initialProbe.panelCount === 5 &&
      initialProbe.branchButtons >= 8 &&
      initialProbe.factionCards === 3 &&
      initialProbe.expedition?.branchOptions?.length === 3 &&
      initialProbe.expedition?.bountyDraft?.length === 3 &&
      initialProbe.expedition?.factions?.length === 3 &&
      !!initialProbe.expedition?.observatoryLink &&
      initialProbe.expedition?.observatoryLink?.bonusOptions?.length === 2 &&
      /裂界远征/.test(initialProbe.overviewText || '') &&
      /观星|精选命盘/.test(initialProbe.observatoryText || '') &&
      !!initialProbe.nemesisName,
    JSON.stringify(initialProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'expedition-panels-initial.png'));

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
  await safeScreenshot(page, path.join(outDir, 'expedition-observatory-link.png'));

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
  await safeScreenshot(page, path.join(outDir, 'expedition-branch-selected.png'));

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
  await safeScreenshot(page, path.join(outDir, 'expedition-nemesis-clue.png'));

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
  await safeScreenshot(page, path.join(outDir, 'expedition-bounties-selected.png'));

  const progressProbe = await page.evaluate(() => {
    if (!window.game || typeof game.getExpeditionState !== 'function') return { ok: false, reason: 'no_game' };
    const state = game.getExpeditionState();
    const route = state.bountyDraft.find((entry) => entry.condition?.type === 'visitNodeType' && state.activeBountyIds.includes(entry.id));
    if (!route) return { ok: false, reason: 'no_active_route_bounty' };
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
  await safeScreenshot(page, path.join(outDir, 'expedition-bounty-progressed.png'));

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
  await safeScreenshot(page, path.join(outDir, 'expedition-finalized.png'));

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
