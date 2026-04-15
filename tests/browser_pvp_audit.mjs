import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/web-pvp-audit';
fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

async function safeScreenshot(page, outputPath) {
  try {
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }'
    }).catch(() => {});
    await page.screenshot({ path: outputPath, fullPage: true, timeout: 0, animations: 'disabled' });
  } catch (err) {
    console.warn(`[browser_pvp_audit] screenshot skipped: ${err?.message || err}`);
  }
}

async function safeElementScreenshot(page, selector, outputPath) {
  try {
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }'
    }).catch(() => {});
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: 5000 });
    const box = await target.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      await page.screenshot({ path: outputPath, clip: box, timeout: 0, animations: 'disabled' });
      return;
    }
    await target.screenshot({ path: outputPath, timeout: 0, animations: 'disabled' });
  } catch (err) {
    console.warn(`[browser_pvp_audit] element screenshot skipped (${selector}): ${err?.message || err}`);
    await safeScreenshot(page, outputPath);
  }
}

async function clickRuneTab(page, label) {
  const tab = page.locator('.rune-tab', { hasText: label }).first();
  await tab.click({ timeout: 5000, force: true });
}

(async () => {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const authActive = await page.evaluate(() => !!document.getElementById('auth-modal')?.classList.contains('active'));
  if (authActive) {
    await page.click('#auth-modal .modal-close', { timeout: 3000, force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }

  await page.click('#pvp-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(700);

  const pvpMode = await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  add('pvp screen is reachable', pvpMode === 'pvp-screen', `mode=${pvpMode}`);

  const rankingRows = await page.evaluate(() => document.querySelectorAll('#ranking-list .jade-slip-row').length);
  add('ranking list renders entries in guest/offline mode', rankingRows > 0, `rows=${rankingRows}`);

  const rankingDangerProbe = await page.evaluate(() => {
    const payload = JSON.parse(window.render_game_to_text());
    const brief = document.getElementById('pvp-ranking-brief');
    const lineEls = Array.from(brief?.querySelectorAll('.pvp-risk-line') || []);
    return {
      driText: brief?.querySelector('.pvp-risk-dri')?.textContent || '',
      summary: brief?.querySelector('.pvp-risk-summary')?.textContent || '',
      lines: lineEls.map((el) => el.textContent || ''),
      rowChipCount: document.querySelectorAll('#ranking-list .rank-risk-chip').length,
      payload: payload.pvp?.rankingFocus?.dangerProfile || null
    };
  });
  add(
    'pvp ranking focus card renders danger profile and row chips',
    /DRI\s*\d+/.test(rankingDangerProbe.driText)
      && rankingDangerProbe.summary.length > 0
      && rankingDangerProbe.lines.some((line) => /对策/.test(line))
      && rankingDangerProbe.lines.some((line) => /预留/.test(line))
      && rankingDangerProbe.rowChipCount >= rankingRows,
    JSON.stringify(rankingDangerProbe)
  );
  add(
    'render_game_to_text exposes pvp ranking focus danger profile',
    !!rankingDangerProbe.payload
      && /DRI/.test(rankingDangerProbe.payload.line || '')
      && Array.isArray(rankingDangerProbe.payload.axes)
      && rankingDangerProbe.payload.axes.length === 4
      && typeof rankingDangerProbe.payload.counterplay === 'string'
      && rankingDangerProbe.payload.counterplay.length > 0,
    JSON.stringify(rankingDangerProbe.payload)
  );

  const alternateRowId = await page.evaluate(() => {
    const focused = document.querySelector('#ranking-list .jade-slip-row.is-focused');
    const rows = Array.from(document.querySelectorAll('#ranking-list .jade-slip-row'));
    const next = rows.find((row) => row.dataset.rankId && row !== focused);
    return next?.dataset.rankId || null;
  });
  if (!alternateRowId) throw new Error('Unable to find alternate PVP ranking row for focus switch test');
  await page.click(`#ranking-list .jade-slip-row[data-rank-id="${alternateRowId}"]`, { timeout: 5000, force: true });
  await page.waitForTimeout(250);
  const focusSwitchProbe = await page.evaluate(() => {
    const payload = JSON.parse(window.render_game_to_text());
    const selectedRow = document.querySelector('#ranking-list .jade-slip-row.is-focused');
    const rowName = selectedRow?.querySelector('.rank-name')?.textContent?.trim() || '';
    const titleText = document.querySelector('#pvp-ranking-brief .pvp-risk-title')?.textContent?.trim() || '';
    const payloadName = payload.pvp?.rankingFocus?.rank?.user?.username || '';
    return { rowName, titleText, payloadName };
  });
  add(
    'clicking ranking row updates focus card and payload target',
    !!focusSwitchProbe.rowName
      && focusSwitchProbe.titleText.includes(focusSwitchProbe.rowName)
      && focusSwitchProbe.payloadName === focusSwitchProbe.rowName,
    JSON.stringify(focusSwitchProbe)
  );
  const focusDuelProbe = await page.evaluate(() => {
    const payload = JSON.parse(window.render_game_to_text());
    const duel = document.querySelector('#pvp-ranking-brief .pvp-duel-slip');
    const duelLines = Array.from(duel?.querySelectorAll('.pvp-duel-line') || []).map((el) => el.textContent || '');
    return {
      title: duel?.querySelector('.pvp-duel-slip-title')?.textContent || '',
      chip: duel?.querySelector('.pvp-duel-slip-chip')?.textContent || '',
      tags: Array.from(duel?.querySelectorAll('.pvp-duel-slip-tag') || []).map((el) => el.textContent || ''),
      duelLines,
      challengeIntent: document.getElementById('pvp-challenge-intent')?.textContent || '',
      payload: payload.pvp?.rankingFocus?.duelBrief || null
    };
  });
  add(
    'focus duel slip renders reward mode strategy and CTA hint',
    /冲榜|练手|避战/.test(focusDuelProbe.title)
      && /DRI/.test(focusDuelProbe.chip)
      && focusDuelProbe.duelLines.some((line) => /胜场/.test(line) && /天道币/.test(line))
      && focusDuelProbe.duelLines.some((line) => /败场/.test(line) && /道韵/.test(line))
      && focusDuelProbe.duelLines.some((line) => /模式/.test(line))
      && focusDuelProbe.duelLines.some((line) => /建议/.test(line))
      && /已锁定/.test(focusDuelProbe.challengeIntent),
    JSON.stringify(focusDuelProbe)
  );
  add(
    'render_game_to_text exposes focus duel brief payload',
    !!focusDuelProbe.payload
      && typeof focusDuelProbe.payload.modeLabel === 'string'
      && /直约|镜像/.test(focusDuelProbe.payload.modeLabel)
      && typeof focusDuelProbe.payload.engagementLabel === 'string'
      && /冲榜|练手|避战/.test(focusDuelProbe.payload.engagementLabel)
      && typeof focusDuelProbe.payload.winRewardText === 'string'
      && /天道币/.test(focusDuelProbe.payload.winRewardText || ''),
    JSON.stringify(focusDuelProbe.payload)
  );
  const focusDossierProbe = await page.evaluate(() => {
    const payload = JSON.parse(window.render_game_to_text());
    const dossier = document.querySelector('#pvp-ranking-brief .pvp-dossier');
    const clueCards = Array.from(dossier?.querySelectorAll('.pvp-dossier-card:not([data-dossier-card])') || []).map((card) => ({
      label: card.querySelector('.pvp-dossier-label')?.textContent || '',
      value: card.querySelector('.pvp-dossier-value')?.textContent || '',
      detail: card.querySelector('.pvp-dossier-detail')?.textContent || ''
    }));
    const readCard = (key) => {
      const card = dossier?.querySelector(`[data-dossier-card="${key}"]`);
      return {
        label: card?.querySelector('.pvp-dossier-label')?.textContent || '',
        value: card?.querySelector('.pvp-dossier-value')?.textContent || '',
        detail: card?.querySelector('.pvp-dossier-detail')?.textContent || '',
        tag: card?.querySelector('.pvp-dossier-mini-tag')?.textContent || '',
        chips: Array.from(card?.querySelectorAll('.pvp-dossier-inline-chip') || []).map((el) => el.textContent || '')
      };
    };
    return {
      line: dossier?.querySelector('.pvp-dossier-line')?.textContent || '',
      tags: Array.from(dossier?.querySelectorAll('.pvp-risk-chip') || []).map((el) => el.textContent || ''),
      clueCards,
      historyCard: readCard('history'),
      trendCard: readCard('trend'),
      ledgerCard: readCard('ledger'),
      payload: payload.pvp?.rankingFocus?.dossier || null
    };
  });
  add(
    'focus opponent dossier renders source route formation season segment comparison plus history/trend/ledger hints',
    /DRI/.test(focusDossierProbe.line)
      && focusDossierProbe.clueCards.length >= 6
      && focusDossierProbe.clueCards.some((item) => /档案来源/.test(item.label) && item.value.length > 0)
      && focusDossierProbe.clueCards.some((item) => /赛季题面/.test(item.label) && /赛季/.test(item.value))
      && focusDossierProbe.clueCards.some((item) => /分段标签/.test(item.label) && /同段|越段|守段|阵地/.test(item.value))
      && focusDossierProbe.clueCards.some((item) => /守阵形态/.test(item.label) && item.value.length > 0)
      && focusDossierProbe.clueCards.some((item) => /约战路径/.test(item.label) && /冲榜|练手|避战/.test(item.value))
      && focusDossierProbe.clueCards.some((item) => /跨场对照/.test(item.label) && item.value.length > 0)
      && /历史交手/.test(focusDossierProbe.historyCard.label)
      && focusDossierProbe.historyCard.value.length > 0
      && /多场趋势/.test(focusDossierProbe.trendCard.label)
      && focusDossierProbe.trendCard.value.length > 0
      && /赛季账本/.test(focusDossierProbe.ledgerCard.label)
      && /本季账本/.test(focusDossierProbe.ledgerCard.value)
      && focusDossierProbe.ledgerCard.chips.length >= 3
      && focusDossierProbe.tags.length >= 4,
    JSON.stringify(focusDossierProbe)
  );
  add(
    'render_game_to_text exposes focus opponent dossier history/trend/ledger payload',
    !!focusDossierProbe.payload
      && /DRI/.test(focusDossierProbe.payload.riskLine || '')
      && /榜差/.test(focusDossierProbe.payload.scoreLine || '')
      && /开天赛季/.test(focusDossierProbe.payload.seasonLine || '')
      && typeof focusDossierProbe.payload.segmentLabel === 'string'
      && focusDossierProbe.payload.segmentLabel.length > 0
      && typeof focusDossierProbe.payload.comparisonValue === 'string'
      && focusDossierProbe.payload.comparisonValue.length > 0
      && typeof focusDossierProbe.payload.historyValue === 'string'
      && focusDossierProbe.payload.historyValue.length > 0
      && typeof focusDossierProbe.payload.trendValue === 'string'
      && focusDossierProbe.payload.trendValue.length > 0
      && typeof focusDossierProbe.payload.ledgerValue === 'string'
      && /本季账本/.test(focusDossierProbe.payload.ledgerValue || '')
      && Array.isArray(focusDossierProbe.payload.ledgerChips)
      && focusDossierProbe.payload.ledgerChips.length >= 3
      && Array.isArray(focusDossierProbe.payload.clueCards)
      && focusDossierProbe.payload.clueCards.length >= 6
      && /直约|镜像/.test(focusDossierProbe.payload.routeValue || ''),
    JSON.stringify(focusDossierProbe.payload)
  );
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById('pvp-ranking-brief')?.scrollIntoView({ block: 'start', inline: 'nearest' });
  });
  await page.waitForTimeout(220);
  await safeElementScreenshot(page, '#pvp-screen .pvp-content-container', path.join(outDir, 'pvp-audit.png'));

  await page.click('#tab-ranking .challenge-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(1600);

  const battleProbe = await page.evaluate(() => {
    let mode = null;
    let payload = {};
    try {
      payload = JSON.parse(window.render_game_to_text());
      mode = payload.mode;
    } catch {}
    const enemy = window.game?.battle?.enemies?.[0] || null;
    return {
      mode,
      gameMode: window.game?.mode || null,
      ticket: window.game?.pvpMatchTicket || null,
      isGhost: !!(enemy && enemy.isGhost),
      enemyHp: enemy ? enemy.currentHp : null,
      dangerLine: payload.pvp?.activeMatch?.dangerProfile?.line || '',
      dangerIndex: payload.pvp?.activeMatch?.dangerProfile?.index || null,
      dominantAxis: payload.pvp?.activeMatch?.dangerProfile?.dominantAxisId || null,
      intentTarget: payload.pvp?.activeMatch?.intent?.targetName || '',
      intentMode: payload.pvp?.activeMatch?.intent?.modeLabel || '',
      intentWin: payload.pvp?.activeMatch?.intent?.winRewardText || ''
    };
  });
  add(
    'guest challenge starts pvp ghost battle',
    battleProbe.mode === 'battle-screen' && battleProbe.gameMode === 'pvp' && !!battleProbe.ticket && battleProbe.isGhost,
    JSON.stringify(battleProbe)
  );
  add(
    'pvp battle snapshot carries active match danger profile',
    /DRI/.test(battleProbe.dangerLine)
      && Number.isFinite(Number(battleProbe.dangerIndex))
      && typeof battleProbe.dominantAxis === 'string'
      && battleProbe.dominantAxis.length > 0,
    JSON.stringify(battleProbe)
  );
  add(
    'battle snapshot keeps focus duel intent after challenge starts',
    battleProbe.intentTarget === focusSwitchProbe.rowName
      && /直约|镜像/.test(battleProbe.intentMode)
      && /天道币/.test(battleProbe.intentWin),
    JSON.stringify({ focusSwitchProbe, battleProbe })
  );

  if (battleProbe.mode === 'battle-screen') {
    await page.evaluate(() => {
      if (!window.game || !game.battle || !Array.isArray(game.battle.enemies) || game.battle.enemies.length === 0) return;
      game.battle.enemies.forEach((e) => { e.currentHp = 0; });
      if (typeof game.battle.checkBattleEnd === 'function') game.battle.checkBattleEnd();
    });
  }

  await page.waitForTimeout(1300);
  const resultProbe = await page.evaluate(() => {
    const overlay = document.getElementById('pvp-result-overlay');
    const score = document.getElementById('pvp-current-score')?.textContent || '';
    const delta = document.getElementById('pvp-score-delta')?.textContent || '';
    let payload = {};
    try {
      payload = JSON.parse(window.render_game_to_text());
    } catch {}
    return {
      visible: !!overlay && overlay.style.display !== 'none',
      className: overlay ? overlay.className : '',
      score,
      delta,
      reviewTitle: document.getElementById('pvp-result-review-title')?.textContent || '',
      reviewChip: document.getElementById('pvp-result-review-chip')?.textContent || '',
      reviewSummary: document.getElementById('pvp-result-review-summary')?.textContent || '',
      reviewFocus: document.getElementById('pvp-result-review-focus-value')?.textContent || '',
      reviewNext: document.getElementById('pvp-result-review-next-value')?.textContent || '',
      reviewFoot: document.getElementById('pvp-result-review-foot')?.textContent || '',
      payloadReview: payload.pvp?.resultOverlay || null
    };
  });
  add(
    'pvp victory settlement overlay appears and shows rating change',
    resultProbe.visible && /victory/.test(resultProbe.className) && /\d/.test(resultProbe.score) && /[+-]?\d+/.test(resultProbe.delta),
    JSON.stringify(resultProbe)
  );
  add(
    'pvp settlement overlay renders review recap and exposes it in render_game_to_text',
    /DRI/.test(resultProbe.reviewChip)
      && resultProbe.reviewSummary.length > 0
      && resultProbe.reviewFocus.length > 0
      && resultProbe.reviewNext.length > 0
      && !!resultProbe.payloadReview
      && /DRI/.test(resultProbe.payloadReview.dangerLine || '')
      && typeof resultProbe.payloadReview.focusText === 'string'
      && resultProbe.payloadReview.focusText.length > 0,
    JSON.stringify(resultProbe)
  );
  await safeElementScreenshot(page, '#pvp-result-overlay .pvp-result-container', path.join(outDir, 'pvp-result.png'));

  if (resultProbe.visible) {
    await page.click('#pvp-result-overlay .result-actions .ink-btn-large', { timeout: 5000, force: true });
    await page.waitForTimeout(600);
  }

  const backToPvp = await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode);
  add('closing pvp result returns to pvp screen', backToPvp === 'pvp-screen', `mode=${backToPvp}`);
  const historyAfterBattleProbe = await page.evaluate(() => {
    const payload = JSON.parse(window.render_game_to_text());
    const dossier = document.querySelector('#pvp-ranking-brief .pvp-dossier');
    const historyCard = dossier?.querySelector('[data-dossier-card="history"]');
    const trendCard = dossier?.querySelector('[data-dossier-card="trend"]');
    return {
      focusName: payload.pvp?.rankingFocus?.rank?.user?.username || '',
      historyValue: historyCard?.querySelector('.pvp-dossier-value')?.textContent || '',
      historyDetail: historyCard?.querySelector('.pvp-dossier-detail')?.textContent || '',
      historyTag: historyCard?.querySelector('.pvp-dossier-mini-tag')?.textContent || '',
      trendValue: trendCard?.querySelector('.pvp-dossier-value')?.textContent || '',
      trendDetail: trendCard?.querySelector('.pvp-dossier-detail')?.textContent || '',
      trendTag: trendCard?.querySelector('.pvp-dossier-mini-tag')?.textContent || '',
      ledgerValue: dossier?.querySelector('[data-dossier-card="ledger"] .pvp-dossier-value')?.textContent || '',
      ledgerDetail: dossier?.querySelector('[data-dossier-card="ledger"] .pvp-dossier-detail')?.textContent || '',
      payload: payload.pvp?.rankingFocus?.dossier || null
    };
  });
  add(
    'accepted settlement feeds direct history trend and ledger back into the focused dossier',
    /近1场 1胜0负/.test(historyAfterBattleProbe.historyValue)
      && /最近一次/.test(historyAfterBattleProbe.historyDetail)
      && /首条样本偏稳|持续走稳|走势回暖/.test(historyAfterBattleProbe.trendValue)
      && /本季账本 1 场/.test(historyAfterBattleProbe.ledgerValue)
      && /当前可比样本 1 场/.test(historyAfterBattleProbe.ledgerDetail)
      && !!historyAfterBattleProbe.payload
      && Number(historyAfterBattleProbe.payload.historyCount) === 1
      && Number(historyAfterBattleProbe.payload.trendSampleCount) >= 1
      && Number(historyAfterBattleProbe.payload.ledgerSampleCount) >= 1,
    JSON.stringify(historyAfterBattleProbe)
  );
  await safeElementScreenshot(page, '#pvp-ranking-brief', path.join(outDir, 'pvp-history-brief.png'));

  const leakCheckRowId = await page.evaluate((currentRowId) => {
    const rows = Array.from(document.querySelectorAll('#ranking-list .jade-slip-row'));
    const next = rows.find((row) => row.dataset.rankId && row.dataset.rankId !== currentRowId);
    return next?.dataset.rankId || null;
  }, alternateRowId);
  if (!leakCheckRowId) throw new Error('Unable to find a second target for dossier leak check');
  await page.click(`#ranking-list .jade-slip-row[data-rank-id="${leakCheckRowId}"]`, { timeout: 5000, force: true });
  await page.waitForTimeout(250);
  const historyLeakProbe = await page.evaluate(() => {
    const payload = JSON.parse(window.render_game_to_text());
    const dossier = payload.pvp?.rankingFocus?.dossier || null;
    return {
      targetName: payload.pvp?.rankingFocus?.rank?.user?.username || '',
      historyValue: dossier?.historyValue || '',
      historyTag: dossier?.historyTag || '',
      historyCount: dossier?.historyCount ?? null,
      trendValue: dossier?.trendValue || ''
    };
  });
  add(
    'switching to another target does not leak direct history from the settled opponent',
    !!historyLeakProbe.targetName
      && Number(historyLeakProbe.historyCount) === 0
      && /暂无直接交手/.test(historyLeakProbe.historyValue)
      && /待补样本/.test(historyLeakProbe.historyTag || ''),
    JSON.stringify(historyLeakProbe)
  );

  await clickRuneTab(page, '诸天阁');
  await page.waitForTimeout(600);
  const shopBefore = await page.evaluate(() => {
    const wallet = Number(document.getElementById('shop-wallet-amount')?.textContent || 0);
    const cardOverlay = document.querySelector('.talisman-card[data-item-id="secret_manual_2"] .buy-overlay');
    const titleOverlay = document.querySelector('.talisman-card[data-item-id="title_supreme"] .buy-overlay');
    return {
      wallet,
      cardState: cardOverlay?.dataset.state || null,
      titleState: titleOverlay?.dataset.state || null
    };
  });
  add('shop wallet renders current pvp coin balance', Number.isFinite(shopBefore.wallet) && shopBefore.wallet > 0, JSON.stringify(shopBefore));
  add('high-cost title is locked by insufficient coins', shopBefore.titleState === 'insufficient', JSON.stringify(shopBefore));

  const shopAfter = await page.evaluate(() => {
    if (window.PVPScene && typeof window.PVPScene.purchaseShopItem === 'function') {
      window.PVPScene.purchaseShopItem('secret_manual_2');
    }
    const wallet = Number(document.getElementById('shop-wallet-amount')?.textContent || 0);
    const cardOverlay = document.querySelector('.talisman-card[data-item-id="secret_manual_2"] .buy-overlay');
    return {
      wallet,
      cardState: cardOverlay?.dataset.state || null,
      buttonText: cardOverlay?.querySelector('.buy-btn-text')?.textContent || ''
    };
  });
  add(
    'shop purchase deducts coins and updates item ownership state',
    shopAfter.wallet < shopBefore.wallet && (shopAfter.cardState === 'owned' || /已拥有/.test(shopAfter.buttonText)),
    JSON.stringify({ shopBefore, shopAfter })
  );

  const shopMetaProbe = await page.evaluate(() => {
    const rewardText = document.getElementById('shop-reward-status')?.textContent || '';
    const logs = Array.from(document.querySelectorAll('#shop-activity-log .shop-log-item')).map((el) => el.textContent || '');
    return { rewardText, logs };
  });
  add(
    'shop reward preview and transaction log are visible',
    /赛季/.test(shopMetaProbe.rewardText) && /预估/.test(shopMetaProbe.rewardText) && shopMetaProbe.logs.length > 0,
    JSON.stringify(shopMetaProbe)
  );

  const cosmeticProbe = await page.evaluate(() => {
    if (!window.PVPService || !window.PVPScene) return { ok: false, reason: 'services_missing' };
    const snap = window.PVPService.getEconomySnapshot();
    window.PVPService.setEconomySnapshot({
      ...snap,
      coins: 9000,
      totalEarned: Math.max(9000, snap.totalEarned || 0)
    });
    window.PVPScene.loadShop();
    window.PVPScene.purchaseShopItem('skin_void_walker');
    window.PVPScene.purchaseShopItem('title_supreme');
    const titleOverlay = document.querySelector('.talisman-card[data-item-id="title_supreme"] .buy-overlay');
    const skinOverlay = document.querySelector('.talisman-card[data-item-id="skin_void_walker"] .buy-overlay');
    const cosmeticText = document.getElementById('shop-cosmetic-status')?.textContent || '';
    return {
      ok: true,
      state: titleOverlay?.dataset.state || null,
      text: titleOverlay?.querySelector('.buy-btn-text')?.textContent || '',
      skinState: skinOverlay?.dataset.state || null,
      skinText: skinOverlay?.querySelector('.buy-btn-text')?.textContent || '',
      cosmeticText
    };
  });
  add(
    'title cosmetic purchase auto-equips and updates status banner',
    cosmeticProbe.ok
      && (cosmeticProbe.state === 'equipped' || /已佩戴/.test(cosmeticProbe.text))
      && (cosmeticProbe.skinState === 'equipped' || /已佩戴/.test(cosmeticProbe.skinText))
      && /独断万古/.test(cosmeticProbe.cosmeticText)
      && /虚空行者/.test(cosmeticProbe.cosmeticText),
    JSON.stringify(cosmeticProbe)
  );

  const characterTitleProbe = await page.evaluate(() => {
    if (!window.game || typeof window.game.showPlayerInfo !== 'function') return { ok: false, reason: 'game_unavailable' };
    window.game.showPlayerInfo();
    const mode = JSON.parse(window.render_game_to_text()).mode;
    const titleText = document.getElementById('info-char-title')?.textContent || '';
    return { ok: true, mode, titleText };
  });
  add(
    'equipped pvp title is reflected in character info panel',
    characterTitleProbe.ok && characterTitleProbe.mode === 'character-select' && /独断万古/.test(characterTitleProbe.titleText),
    JSON.stringify(characterTitleProbe)
  );

  await page.click('#character-select .back-btn', { timeout: 5000, force: true }).catch(() => {});
  await page.click('#pvp-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(300);

  await clickRuneTab(page, '天道榜');
  await page.waitForTimeout(300);
  await page.click('#tab-ranking .challenge-btn', { timeout: 5000, force: true });
  await page.waitForTimeout(1200);
  const skinBattleProbe = await page.evaluate(() => {
    let mode = null;
    try { mode = JSON.parse(window.render_game_to_text()).mode; } catch {}
    const badgeText = document.querySelector('.player-avatar .player-skin-badge')?.textContent || '';
    const faceClasses = document.getElementById('player-face-display')?.className || '';
    return { mode, badgeText, faceClasses };
  });
  add(
    'equipped skin is visible on battle avatar',
    skinBattleProbe.mode === 'battle-screen' && /虚空行者/.test(skinBattleProbe.badgeText) && /skin-equipped/.test(skinBattleProbe.faceClasses),
    JSON.stringify(skinBattleProbe)
  );
  if (skinBattleProbe.mode === 'battle-screen') {
    await page.evaluate(() => {
      if (!window.game || !game.battle || !Array.isArray(game.battle.enemies)) return;
      game.battle.enemies.forEach((e) => { e.currentHp = 0; });
      if (typeof game.battle.checkBattleEnd === 'function') game.battle.checkBattleEnd();
    });
    await page.waitForTimeout(900);
    await page.click('#pvp-result-overlay .result-actions .ink-btn-large', { timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(350);
  }

  await clickRuneTab(page, '护山阵');
  await page.waitForTimeout(500);
  await page.click('#tab-defense .ink-btn-large', { timeout: 5000, force: true });
  await page.waitForTimeout(700);
  const defenseProbe = await page.evaluate(() => {
    const time = document.getElementById('def-time')?.textContent || '';
    const power = document.getElementById('def-power-val')?.textContent || '';
    return { time, power };
  });
  add(
    'defense upload succeeds in offline fallback mode',
    !/无记录/.test(defenseProbe.time) && /\d/.test(defenseProbe.power),
    JSON.stringify(defenseProbe)
  );

  const report = {
    url,
    findings,
    consoleErrors,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const failed = findings.filter((item) => !item.pass);
  if (failed.length > 0 || consoleErrors.length > 0) {
    failed.forEach((item) => console.error(`FAIL: ${item.name}\n${item.detail}`));
    process.exitCode = 1;
  }

  await browser.close();
})();
