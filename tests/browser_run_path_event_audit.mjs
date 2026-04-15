import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-run-path-event-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_CLOSED/.test(message)) return;
  consoleErrors.push(message);
}

async function safeScreenshot(page, outPath) {
  try {
    await page.screenshot({ path: outPath, fullPage: true, timeout: 10000 });
  } catch (err) {
    console.warn(`[browser_run_path_event_audit] screenshot skipped: ${err?.message || err}`);
  }
}

async function runScenario(page, config) {
  await page.goto(`${baseUrl}?autotest=guest-map&character=${config.character}&destiny=${config.destiny}&spirit=${config.spirit}&path=${config.path}&realm=1`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForTimeout(1200);

  const probe = await page.evaluate((scenario) => {
    const eventCatalog = typeof EVENTS !== 'undefined' ? EVENTS : null;
    if (!window.game || !eventCatalog || typeof game.showEventModal !== 'function') {
      return { ok: false, reason: 'event_runtime_missing' };
    }

    if (game.player && typeof game.player.setRunPath === 'function') {
      game.player.setRunPath(scenario.path);
    }
    if (game.player) {
      if (scenario.mutationId) {
        game.player.runPathMutationState = {
          pathId: scenario.path,
          mutationId: scenario.mutationId,
          offeredAtRealm: Math.max(0, Number(game.player.realm || 1)),
          chosenAt: Date.now()
        };
      } else {
        game.player.runPathMutationState = null;
      }
    }
    const progress = game.player?.runPathProgress
      || (game.player && typeof game.player.ensureRunPathProgress === 'function'
        ? game.player.ensureRunPathProgress()
        : null);
    if (!progress) {
      return { ok: false, reason: 'progress_missing' };
    }

    if (game.player) {
      game.player.currentHp = scenario.hp;
      game.player.maxHp = Math.max(game.player.maxHp || scenario.hp, scenario.maxHp || scenario.hp);
      game.player.gold = scenario.gold;
      game.player.heavenlyInsight = scenario.heavenlyInsight;
      game.player.fateRing.exp = scenario.ringExp;
      game.player.adventureBuffs = {
        firstTurnDrawBoostBattles: 0,
        openingBlockBoostBattles: 0,
        victoryGoldBoostBattles: 0,
        firstTurnEnergyBoostBattles: 0,
        ringExpBoostBattles: 0,
        victoryHealBoostBattles: 0
      };
    }

    progress.pathId = scenario.path;
    progress.currentPhaseIndex = 0;
    progress.phaseProgress = 0;
    progress.completedPhases = [];
    progress.rewardHistory = [];
    progress.completed = false;
    progress.lastRewardText = '';
    game.lastRunPathMapFeedback = null;

    const before = {
      hp: game.player?.currentHp ?? null,
      gold: game.player?.gold ?? null,
      heavenlyInsight: game.player?.heavenlyInsight ?? null,
      ringExp: game.player?.fateRing?.exp ?? null,
      buffs: { ...(game.player?.adventureBuffs || {}) },
      phaseProgress: progress.phaseProgress
    };

    const event = eventCatalog[scenario.eventId];
    game.showEventModal(event, { id: 94000 + scenario.index, row: 2, type: 'event', completed: false, accessible: true });
    const modalTitle = document.getElementById('event-title')?.textContent?.trim() || '';
    const modalPayloadBefore = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;

    game.selectEventChoice(scenario.choiceIndex);

    const descText = document.getElementById('event-desc')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const payload = typeof window.render_game_to_text === 'function'
      ? JSON.parse(window.render_game_to_text())
      : null;
    const after = {
      hp: game.player?.currentHp ?? null,
      gold: game.player?.gold ?? null,
      heavenlyInsight: game.player?.heavenlyInsight ?? null,
      ringExp: game.player?.fateRing?.exp ?? null,
      buffs: { ...(game.player?.adventureBuffs || {}) },
      phaseProgress: game.player?.runPathProgress?.phaseProgress ?? null
    };

    return {
      ok: true,
      modalTitle,
      modalSummary: modalPayloadBefore?.eventModal?.summary || '',
      descText,
      before,
      after,
      flash: payload?.map?.runPathFlash || null
    };
  }, config);

  await safeScreenshot(page, path.join(outDir, `${config.eventId}.png`));
  return probe;
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  page.on('pageerror', (err) => {
    recordConsoleError(String(err));
  });

  const shatterProbe = await runScenario(page, {
    index: 0,
    eventId: 'runPathShatterBounty',
    choiceIndex: 0,
    path: 'shatter',
    character: 'linFeng',
    destiny: 'foldedEdge',
    spirit: 'swordWraith',
    hp: 80,
    maxHp: 80,
    gold: 100,
    heavenlyInsight: 0,
    ringExp: 0
  });

  add(
    'shatter dedicated event trades hp for bounty tempo and immediate run path progress',
    !!shatterProbe?.ok
      && shatterProbe.modalTitle === '断脉悬金榜'
      && /命途事件/.test(shatterProbe.modalSummary || '')
      && shatterProbe.after.hp < shatterProbe.before.hp
      && shatterProbe.after.gold > shatterProbe.before.gold
      && (shatterProbe.after.buffs?.victoryGoldBoostBattles || 0) > (shatterProbe.before.buffs?.victoryGoldBoostBattles || 0)
      && (shatterProbe.after.buffs?.firstTurnEnergyBoostBattles || 0) > (shatterProbe.before.buffs?.firstTurnEnergyBoostBattles || 0)
      && shatterProbe.after.phaseProgress === 1
      && /命途推进/.test(shatterProbe.descText || ''),
    JSON.stringify(shatterProbe || null)
  );

  const bulwarkProbe = await runScenario(page, {
    index: 1,
    eventId: 'runPathBulwarkSanctuary',
    choiceIndex: 0,
    path: 'bulwark',
    character: 'wuYu',
    destiny: 'foldedEdge',
    spirit: 'swordWraith',
    hp: 44,
    maxHp: 72,
    gold: 120,
    heavenlyInsight: 0,
    ringExp: 0
  });

  add(
    'bulwark dedicated event restores hp, grants defense logistics, and advances the active run path',
    !!bulwarkProbe?.ok
      && bulwarkProbe.modalTitle === '镇脉壁垒库'
      && /命途事件/.test(bulwarkProbe.modalSummary || '')
      && bulwarkProbe.after.hp > bulwarkProbe.before.hp
      && (bulwarkProbe.after.buffs?.openingBlockBoostBattles || 0) > (bulwarkProbe.before.buffs?.openingBlockBoostBattles || 0)
      && (bulwarkProbe.after.buffs?.victoryHealBoostBattles || 0) > (bulwarkProbe.before.buffs?.victoryHealBoostBattles || 0)
      && bulwarkProbe.after.phaseProgress === 1
      && /命途推进/.test(bulwarkProbe.descText || ''),
    JSON.stringify(bulwarkProbe || null)
  );

  const insightProbe = await runScenario(page, {
    index: 2,
    eventId: 'runPathInsightAstrolabe',
    choiceIndex: 0,
    path: 'insight',
    character: 'yanHan',
    destiny: 'foldedEdge',
    spirit: 'swordWraith',
    hp: 80,
    maxHp: 80,
    gold: 130,
    heavenlyInsight: 0,
    ringExp: 0
  });

  add(
    'insight dedicated event grants heavenly insight, ring exp, and pushes the current run path forward',
    !!insightProbe?.ok
      && insightProbe.modalTitle === '问真观星台'
      && /命途事件/.test(insightProbe.modalSummary || '')
      && insightProbe.after.heavenlyInsight > insightProbe.before.heavenlyInsight
      && insightProbe.after.ringExp > insightProbe.before.ringExp
      && insightProbe.after.phaseProgress === 1
      && /命途推进/.test(insightProbe.descText || ''),
    JSON.stringify(insightProbe || null)
  );

  const shatterMutationProbe = await runScenario(page, {
    index: 3,
    eventId: 'runPathShatterPivotLedger',
    choiceIndex: 0,
    mutationId: 'pivot',
    path: 'shatter',
    character: 'linFeng',
    destiny: 'foldedEdge',
    spirit: 'swordWraith',
    hp: 80,
    maxHp: 80,
    gold: 120,
    heavenlyInsight: 0,
    ringExp: 0
  });

  add(
    'shatter mutation event converts burst route into setup tempo while still pushing run path progress',
    !!shatterMutationProbe?.ok
      && shatterMutationProbe.modalTitle === '转修悬账簿'
      && /裂变事件/.test(shatterMutationProbe.modalSummary || '')
      && (shatterMutationProbe.after.ringExp || 0) > (shatterMutationProbe.before.ringExp || 0)
      && (shatterMutationProbe.after.buffs?.firstTurnDrawBoostBattles || 0) > (shatterMutationProbe.before.buffs?.firstTurnDrawBoostBattles || 0)
      && shatterMutationProbe.after.phaseProgress === 1
      && /命途推进/.test(shatterMutationProbe.descText || ''),
    JSON.stringify(shatterMutationProbe || null)
  );

  const bulwarkMutationProbe = await runScenario(page, {
    index: 4,
    eventId: 'runPathBulwarkPolarizeBastion',
    choiceIndex: 0,
    mutationId: 'polarize',
    path: 'bulwark',
    character: 'wuYu',
    destiny: 'foldedEdge',
    spirit: 'swordWraith',
    hp: 40,
    maxHp: 72,
    gold: 120,
    heavenlyInsight: 0,
    ringExp: 0
  });

  add(
    'bulwark mutation event reinforces bastion sustain and advances run path with fortified buffs',
    !!bulwarkMutationProbe?.ok
      && bulwarkMutationProbe.modalTitle === '固命垒心'
      && /裂变事件/.test(bulwarkMutationProbe.modalSummary || '')
      && (bulwarkMutationProbe.after.hp || 0) > (bulwarkMutationProbe.before.hp || 0)
      && (bulwarkMutationProbe.after.buffs?.openingBlockBoostBattles || 0) > (bulwarkMutationProbe.before.buffs?.openingBlockBoostBattles || 0)
      && bulwarkMutationProbe.after.phaseProgress === 1
      && /命途推进/.test(bulwarkMutationProbe.descText || ''),
    JSON.stringify(bulwarkMutationProbe || null)
  );

  const insightMutationProbe = await runScenario(page, {
    index: 5,
    eventId: 'runPathInsightSacrificeOracle',
    choiceIndex: 0,
    mutationId: 'sacrifice',
    path: 'insight',
    character: 'yanHan',
    destiny: 'foldedEdge',
    spirit: 'swordWraith',
    hp: 80,
    maxHp: 80,
    gold: 130,
    heavenlyInsight: 0,
    ringExp: 0
  });

  add(
    'insight mutation event trades hp for higher information payload and still records run path progression',
    !!insightMutationProbe?.ok
      && insightMutationProbe.modalTitle === '盲算祀台'
      && /裂变事件/.test(insightMutationProbe.modalSummary || '')
      && (insightMutationProbe.after.hp || 0) < (insightMutationProbe.before.hp || 0)
      && (insightMutationProbe.after.heavenlyInsight || 0) > (insightMutationProbe.before.heavenlyInsight || 0)
      && insightMutationProbe.after.phaseProgress === 1
      && /命途推进/.test(insightMutationProbe.descText || ''),
    JSON.stringify(insightMutationProbe || null)
  );

  const report = {
    baseUrl,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const failed = findings.filter((item) => !item.pass);
  await browser.close();
  if (failed.length > 0 || consoleErrors.length > 0) {
    process.exit(1);
  }
})();
