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
    };
  });
  add(
    'map screen exposes expedition panels and mirrors them into render_game_to_text',
    !!initialProbe &&
      initialProbe.mode === 'map-screen' &&
      initialProbe.panelVisible &&
      initialProbe.panelCount === 4 &&
      initialProbe.branchButtons >= 6 &&
      initialProbe.factionCards === 3 &&
      initialProbe.expedition?.branchOptions?.length === 3 &&
      initialProbe.expedition?.bountyDraft?.length === 3 &&
      initialProbe.expedition?.factions?.length === 3 &&
      /裂界远征/.test(initialProbe.overviewText || '') &&
      !!initialProbe.nemesisName,
    JSON.stringify(initialProbe || null)
  );
  await safeScreenshot(page, path.join(outDir, 'expedition-panels-initial.png'));

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
