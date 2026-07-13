import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-season-ops-audit';
const reportPath = path.join(outDir, 'report.json');
fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(reportPath, { force: true });

const findings = [];
const consoleErrors = [];

function add(name, pass, detail = '') {
  findings.push({ name, pass: !!pass, detail: String(detail || '') });
}

function recordConsoleError(value) {
  const message = String(value || '');
  if (/favicon|ERR_CONNECTION_(CLOSED|RESET)/i.test(message)) return;
  consoleErrors.push(message);
}

async function installSeasonOpsMock(page) {
  return page.evaluate(async () => {
    const services = window.__THE_DEFIER_SERVICES__;
    if (!services?.BackendClient || !services?.AuthService || !window.game) {
      return { success: false, reason: 'debug_services_unavailable' };
    }
    const user = { objectId: 'season-browser-user-a', username: '卷宗测试者' };
    const now = Date.now();
    const dashboard = {
      success: true,
      reportVersion: 'season-ops-dashboard-v1',
      protocolVersion: 'season-ops-v1',
      generatedAt: now,
      season: {
        seasonId: 's1-genesis',
        title: '开天赛季',
        ruleVersion: 'season-ops-v1-s1',
        catalogVersion: 'season-ops-catalog-v1',
        startsAt: Date.UTC(2026, 6, 6),
        endsAt: Date.UTC(2026, 7, 17),
        graceEndsAt: Date.UTC(2026, 7, 24),
        rewardCurrency: 'renown',
        rewardImpact: 'cosmetic_only',
        state: 'active',
        isActive: true,
        isGrace: false,
        isEnded: false,
        boundary: '正式榜单只接收服务端权威真人结算。',
      },
      wallet: {
        currency: 'renown',
        balance: 1280,
        lifetimeEarned: 2160,
        lifetimeSpent: 880,
        spendPolicy: 'cosmetic_only',
        updatedAt: now,
      },
      objectives: [
        {
          objectiveId: 'daily_battle_wins',
          title: '三战热身',
          scope: 'daily',
          cycleId: 'daily:2026-07-11',
          current: 3,
          target: 3,
          completed: true,
          claimable: true,
          claimed: false,
          trustRequirement: 'client_observed',
          reward: { currency: 'renown', amount: 30, rewardImpact: 'cosmetic_only' },
        },
        {
          objectiveId: 'weekly_activity_completions',
          title: '七日历练',
          scope: 'weekly',
          cycleId: 'weekly:2026-07-06',
          current: 3,
          target: 5,
          completed: false,
          claimable: false,
          claimed: false,
          trustRequirement: 'client_observed',
          reward: { currency: 'renown', amount: 100, rewardImpact: 'cosmetic_only' },
        },
        {
          objectiveId: 'season_live_pvp_matches',
          title: '天道应战',
          scope: 'season',
          cycleId: 'season:s1-genesis',
          current: 7,
          target: 10,
          completed: false,
          claimable: false,
          claimed: false,
          trustRequirement: 'server_authoritative',
          reward: { currency: 'renown', amount: 260, rewardImpact: 'cosmetic_only' },
        },
      ],
      entitlements: [
        { entitlementId: 'ent-owned-0001', entitlementKey: 'badge.genesis_witness', entitlementType: 'badge', seasonId: 's1-genesis', grantedAt: now - 5000 },
      ],
      offers: [
        {
          offerId: 'offer-genesis-badge',
          seasonId: 's1-genesis',
          title: '开天见证徽记',
          offerType: 'badge',
          entitlementType: 'badge',
          entitlementKey: 'badge.genesis_witness',
          price: { currency: 'renown', amount: 180 },
          purchaseLimit: 1,
          owned: true,
          available: true,
          rewardImpact: 'cosmetic_only',
        },
        {
          offerId: 'offer-path-walker-title',
          seasonId: 's1-genesis',
          title: '诸途行者称号',
          offerType: 'title',
          entitlementType: 'title',
          entitlementKey: 'title.path_walker',
          price: { currency: 'renown', amount: 360 },
          purchaseLimit: 1,
          owned: false,
          available: true,
          rewardImpact: 'cosmetic_only',
        },
      ],
      leaderboard: [
        { rank: 1, userName: '问道者', score: 1160, wins: 6, losses: 2, rankedGames: 8, division: '潜龙榜', authoritativeParticipant: true, updatedAt: now - 3000 },
        { rank: 2, userName: '卷宗测试者', score: 1088, wins: 4, losses: 3, rankedGames: 7, division: '潜龙榜', authoritativeParticipant: true, updatedAt: now - 2000 },
      ],
      self: { rank: 2, userName: '卷宗测试者', score: 1088, wins: 4, losses: 3, rankedGames: 7, division: '潜龙榜', authoritativeParticipant: true, updatedAt: now - 2000 },
      ledger: [
        { entryId: 'ledger-reward-0001', currency: 'renown', delta: 100, balanceAfter: 1280, reason: '契约奖励', rewardImpact: 'cosmetic_only', createdAt: now - 1000 },
        { entryId: 'ledger-purchase-0001', currency: 'renown', delta: -180, balanceAfter: 1180, reason: '商店购买', rewardImpact: 'cosmetic_only', createdAt: now - 2000 },
      ],
      ledgerNextCursor: '100:season-ledger-cursor-0001',
    };
    const secondaryDashboard = {
      ...structuredClone(dashboard),
      wallet: { ...structuredClone(dashboard.wallet), balance: 77, lifetimeEarned: 77, lifetimeSpent: 0 },
      objectives: [{
        objectiveId: 'daily_secondary_account',
        title: '换卷账号契约',
        scope: 'daily',
        cycleId: 'daily:2026-07-11',
        current: 0,
        target: 1,
        completed: false,
        claimable: false,
        claimed: false,
        trustRequirement: 'client_observed',
        reward: { currency: 'renown', amount: 10, rewardImpact: 'cosmetic_only' },
      }],
      entitlements: [],
      offers: [],
      leaderboard: [],
      self: null,
      ledger: [{ entryId: 'ledger-secondary-0001', currency: 'renown', delta: 77, balanceAfter: 77, reason: '换卷账号账本', rewardImpact: 'cosmetic_only', createdAt: now }],
      ledgerNextCursor: null,
    };

    let currentUser = user;
    let dashboardMode = 'ready';
    let deferNextDashboard = false;
    let deferNextLedger = false;
    const dashboardsByUserId = new Map([
      ['season-browser-user-a', dashboard],
      ['season-browser-user-b', secondaryDashboard],
    ]);
    window.__seasonOpsPurchaseCalls = 0;
    window.__seasonOpsRequestedUsers = [];
    window.__seasonOpsMutationUsers = [];
    window.__seasonOpsReadMockAccount = userId => structuredClone(dashboardsByUserId.get(userId) || null);
    window.__seasonOpsSetDashboardMode = mode => { dashboardMode = mode; };
    window.__seasonOpsDeferNextDashboard = () => { deferNextDashboard = true; };
    window.__seasonOpsDeferNextLedger = () => { deferNextLedger = true; };
    window.__seasonOpsSwitchUser = nextUser => {
      currentUser = nextUser;
      window.dispatchEvent(new StorageEvent('storage', { key: 'theDefierServerSession' }));
    };
    services.AuthService.getCurrentUser = () => currentUser;
    services.AuthService.isLoggedIn = () => true;
    services.BackendClient.getCurrentUser = () => currentUser;
    services.BackendClient.getSeasonOpsDashboard = async ({ expectedUserId } = {}) => {
      window.__seasonOpsRequestedUsers.push(expectedUserId || '');
      const activeUserId = currentUser?.objectId || '';
      if (!expectedUserId || expectedUserId !== activeUserId) {
        return { success: false, reason: 'season_ops_account_changed', message: '账号已变化' };
      }
      const accountDashboard = dashboardsByUserId.get(expectedUserId);
      if (!accountDashboard) {
        return { success: false, reason: 'season_ops_account_changed', message: '账号已变化' };
      }
      if (deferNextDashboard) {
        deferNextDashboard = false;
        const snapshot = structuredClone(accountDashboard);
        return new Promise(resolve => {
          window.__seasonOpsResolveDashboard = () => {
            window.__seasonOpsResolveDashboard = null;
            resolve(snapshot);
          };
        });
      }
      if (dashboardMode === 'error') {
        return { success: false, reason: 'season_ops_test_error', message: '卷宗测试错误' };
      }
      if (dashboardMode === 'empty') {
        return {
          ...structuredClone(accountDashboard),
          objectives: [],
          offers: [],
          leaderboard: [],
          self: null,
          ledger: [],
          ledgerNextCursor: null,
        };
      }
      return structuredClone(accountDashboard);
    };
    services.BackendClient.getSeasonOpsLedger = async ({ expectedUserId } = {}) => {
      if (!expectedUserId || expectedUserId !== currentUser?.objectId) {
        return { success: false, reason: 'season_ops_account_changed', message: '账号已变化' };
      }
      const response = {
        success: true,
        entries: [
          { entryId: 'ledger-old-0001', currency: 'renown', delta: 40, balanceAfter: 1060, reason: '赛季结算', rewardImpact: 'cosmetic_only', createdAt: now - 9000 },
        ],
        nextCursor: null,
      };
      if (!deferNextLedger) return response;
      deferNextLedger = false;
      return new Promise(resolve => {
        window.__seasonOpsResolveLedger = () => {
          window.__seasonOpsResolveLedger = null;
          resolve(response);
        };
      });
    };
    services.BackendClient.claimProgressionReward = async (objectiveId) => {
      const requestUserId = currentUser?.objectId || '';
      const accountDashboard = dashboardsByUserId.get(requestUserId);
      if (!accountDashboard) {
        return { success: false, reason: 'season_ops_account_changed', message: '账号已变化' };
      }
      window.__seasonOpsMutationUsers.push(`claim:${requestUserId}`);
      const objective = accountDashboard.objectives.find(entry => entry.objectiveId === objectiveId);
      const amount = Number(objective?.reward?.amount || 0);
      accountDashboard.wallet = {
        ...accountDashboard.wallet,
        balance: accountDashboard.wallet.balance + amount,
        lifetimeEarned: accountDashboard.wallet.lifetimeEarned + amount,
        updatedAt: now,
      };
      if (objective) {
        objective.claimable = false;
        objective.claimed = true;
        objective.claimedAt = now;
      }
      accountDashboard.ledger.unshift({
        entryId: 'claim-browser-0001',
        currency: 'renown',
        delta: amount,
        balanceAfter: accountDashboard.wallet.balance,
        reason: '契约奖励',
        rewardImpact: 'cosmetic_only',
        createdAt: now,
      });
      return {
        success: true,
        claim: { claimId: 'claim-browser-0001', amount, claimedAt: now },
        balance: structuredClone(accountDashboard.wallet),
      };
    };
    services.BackendClient.purchaseSeasonOpsOffer = async (offerId, seasonId, options) => {
      window.__seasonOpsPurchaseCalls += 1;
      if (!options?.expectedUserId || options.expectedUserId !== currentUser?.objectId || !options?.mutationId) {
        return { success: false, reason: 'season_ops_account_changed', message: '账号已变化', mutationId: options?.mutationId };
      }
      const accountDashboard = dashboardsByUserId.get(options.expectedUserId);
      if (!accountDashboard) {
        return { success: false, reason: 'season_ops_account_changed', message: '账号已变化', mutationId: options?.mutationId };
      }
      window.__seasonOpsMutationUsers.push(`purchase:${options.expectedUserId}`);
      const offer = accountDashboard.offers.find(entry => entry.offerId === offerId);
      const price = Number(offer?.price?.amount || 0);
      accountDashboard.wallet = {
        ...accountDashboard.wallet,
        balance: accountDashboard.wallet.balance - price,
        lifetimeSpent: accountDashboard.wallet.lifetimeSpent + price,
        updatedAt: now,
      };
      if (offer) offer.owned = true;
      accountDashboard.entitlements.unshift({
        entitlementId: 'ent-browser-0002',
        entitlementKey: 'title.path_walker',
        entitlementType: 'title',
        seasonId,
        grantedAt: now,
      });
      accountDashboard.ledger.unshift({
        entryId: 'purchase-browser-0001',
        currency: 'renown',
        delta: -price,
        balanceAfter: accountDashboard.wallet.balance,
        reason: '商店购买',
        rewardImpact: 'cosmetic_only',
        createdAt: now,
      });
      return {
        success: true,
        purchaseId: 'purchase-browser-0001',
        mutationId: options?.mutationId,
        seasonId,
        offerId,
        wallet: structuredClone(accountDashboard.wallet),
        entitlement: { entitlementId: 'ent-browser-0002', entitlementKey: 'title.path_walker', entitlementType: 'title', grantedAt: now },
        purchasedAt: now,
      };
    };

    const authoritativePanel = window.game.seasonOpsView?.authoritativeRunPanel;
    const authoritativeService = authoritativePanel?.service;
    let authoritativeRun = null;
    let authoritativeRunOwnerId = '';
    let authoritativeRunCounter = 0;
    let authoritativeVersion = 0;
    window.__authoritativeBrowserCalls = [];
    const buildAuthoritativeProjection = phase => ({
      schemaVersion: 2,
      protocolVersion: 'authoritative-run-v2',
      contentVersion: 'authoritative-trials-v2',
      contentHash: 'aa18ac01c39d1c1c38d0c26fe3d83d92a3b34035b25305628e00a96a42bdd281',
      runId: authoritativeRun?.runId || '',
      mode: 'pve',
      runStatus: authoritativeRun?.status || 'active',
      version: authoritativeVersion,
      phase,
      allowedCommands: phase === 'route'
        ? ['select_node', 'abandon']
        : phase === 'battle'
          ? ['play_card', 'end_turn', 'abandon']
          : phase === 'reward'
            ? ['choose_reward', 'abandon']
            : [],
      scenario: {
        scenarioId: 'pve-balanced-trial',
        title: '平衡试炼',
        description: '浏览器审计权威试炼',
        turnBudget: 0,
        betweenEncounterHeal: 0,
      },
      player: {
        hp: 42,
        maxHp: 50,
        block: phase === 'battle' ? 4 : 0,
        energy: 2,
        hand: phase === 'battle'
          ? [{ instanceId: 'browser-card-strike-01', cardId: 'strike', name: '破势', description: '造成 8 点伤害。', cost: 1 }]
          : [],
        drawPileCount: 7,
        discardPileCount: 2,
        deckSize: 10,
      },
      route: {
        stage: phase === 'completed' ? 3 : 1,
        totalStages: 3,
        choices: phase === 'route'
          ? [{ nodeId: 'browser-node-01', stage: 1, type: 'enemy', enemyId: 'ink_scout', name: '墨影斥候', threat: '普通', maxHp: 18, boss: false }]
          : [],
        completedNodes: phase === 'completed'
          ? [{ nodeId: 'browser-node-01', nodeType: 'enemy', enemyId: 'ink_scout', boss: false }]
          : [],
      },
      battle: phase === 'battle' ? {
        nodeId: 'browser-node-01',
        nodeType: 'enemy',
        turn: 1,
        enemy: {
          enemyId: 'ink_scout',
          name: '墨影斥候',
          hp: 8,
          maxHp: 18,
          block: 0,
          vulnerable: 0,
          intent: { type: 'attack', amount: 6, label: '墨刃 6' },
        },
      } : null,
      reward: phase === 'reward' ? {
        choices: [{ rewardId: 'browser-reward-heal', kind: 'heal', name: '调息', description: '回复 10 点生命。' }],
      } : null,
      summary: phase === 'completed' ? {
        result: 'completed',
        reason: 'boss_defeated',
        score: 588,
        grade: 'A',
        mode: 'pve',
        scenarioId: 'pve-balanced-trial',
        encountersWon: 3,
        bossWins: 1,
        turns: 9,
        cardsPlayed: 14,
        damageDealt: 82,
        damageTaken: 8,
        remainingHp: 42,
        maxHp: 50,
      } : null,
    });
    const buildAuthoritativeRun = phase => ({
      runId: authoritativeRun.runId,
      clientRunId: authoritativeRun.clientRunId,
      mode: 'pve',
      status: authoritativeRun.status,
      protocolVersion: 'authoritative-run-v2',
      contentVersion: 'authoritative-trials-v2',
      contentHash: 'aa18ac01c39d1c1c38d0c26fe3d83d92a3b34035b25305628e00a96a42bdd281',
      authorityLevel: 'server',
      trustTier: 'server_authoritative',
      stateVersion: authoritativeVersion,
      actionCount: Math.max(0, authoritativeVersion - 1),
      startedAt: now,
      expiresAt: now + 86_400_000,
      completedAt: phase === 'completed' ? now + 10_000 : 0,
      settledAt: authoritativeRun.status === 'settled' ? now + 11_000 : 0,
      updatedAt: now + authoritativeVersion,
      integrity: {
        stateHash: `browser-state-${authoritativeVersion}`,
        chainHead: `browser-chain-${authoritativeVersion}`,
        snapshotInterval: 8,
        fullyReplayRequiredForSettlement: true,
      },
      recovery: { recoveryCount: 1, resumable: authoritativeRun.status === 'active' || authoritativeRun.status === 'completed' },
      receipt: authoritativeRun.receipt || null,
      projection: buildAuthoritativeProjection(phase),
    });
    const successEnvelope = (phase, extra = {}) => ({
      success: true,
      reportVersion: 'authoritative-browser-mock-v1',
      run: buildAuthoritativeRun(phase),
      ...extra,
    });
    if (authoritativeService) {
      authoritativeService.current = async ({ mode, expectedUserId } = {}) => {
        window.__authoritativeBrowserCalls.push(`current:${mode}:${expectedUserId}`);
        if (expectedUserId !== currentUser?.objectId
          || expectedUserId !== authoritativeRunOwnerId
          || mode !== 'pve'
          || !authoritativeRun) return { success: true, run: null };
        return successEnvelope(authoritativeRun.phase);
      };
      authoritativeService.get = async ({ runId, expectedUserId } = {}) => {
        window.__authoritativeBrowserCalls.push(`get:${runId}:${expectedUserId}`);
        if (!authoritativeRun
          || runId !== authoritativeRun.runId
          || expectedUserId !== currentUser?.objectId
          || expectedUserId !== authoritativeRunOwnerId) {
          return { success: false, reason: 'authoritative_run_not_found', message: '权威卷面不存在' };
        }
        return successEnvelope(authoritativeRun.phase);
      };
      authoritativeService.begin = async ({ mode, forceNew = false, expectedUserId } = {}) => {
        window.__authoritativeBrowserCalls.push(`begin:${mode}:${forceNew}:${expectedUserId}`);
        if (expectedUserId !== currentUser?.objectId) return { success: false, reason: 'authoritative_run_account_changed', message: '账号已变化' };
        if (!authoritativeRun || forceNew) {
          authoritativeRunCounter += 1;
          authoritativeVersion = 1;
          authoritativeRun = {
            runId: `browser-authoritative-run-${authoritativeRunCounter}`,
            clientRunId: `browser-authoritative-client-${authoritativeRunCounter}`,
            phase: 'route',
            status: 'active',
            receipt: null,
          };
          authoritativeRunOwnerId = expectedUserId;
        }
        return successEnvelope(authoritativeRun.phase);
      };
      authoritativeService.action = async ({ runId, command, expectedVersion, expectedUserId } = {}) => {
        window.__authoritativeBrowserCalls.push(`action:${command}:${expectedVersion}:${expectedUserId}`);
        if (!authoritativeRun
          || runId !== authoritativeRun.runId
          || expectedUserId !== currentUser?.objectId
          || expectedUserId !== authoritativeRunOwnerId) {
          return { success: false, reason: 'authoritative_run_not_found', message: '权威卷面不存在' };
        }
        authoritativeVersion += 1;
        if (command === 'select_node') authoritativeRun.phase = 'battle';
        else if (command === 'play_card') authoritativeRun.phase = 'reward';
        else if (command === 'choose_reward') {
          authoritativeRun.phase = 'completed';
          authoritativeRun.status = 'completed';
        }
        return successEnvelope(authoritativeRun.phase, {
          action: { command, acceptedAt: now + authoritativeVersion, events: [{ type: command === 'play_card' ? 'card_played' : command }] },
        });
      };
      authoritativeService.settle = async ({ runId, expectedVersion, expectedUserId } = {}) => {
        window.__authoritativeBrowserCalls.push(`settle:${runId}:${expectedVersion}:${expectedUserId}`);
        if (!authoritativeRun
          || runId !== authoritativeRun.runId
          || expectedUserId !== currentUser?.objectId
          || expectedUserId !== authoritativeRunOwnerId
          || authoritativeRun.phase !== 'completed') {
          return { success: false, reason: 'authoritative_run_not_completed', message: '权威试炼尚未完成' };
        }
        authoritativeRun.status = 'settled';
        authoritativeRun.receipt = {
          receiptId: 'browser-authoritative-receipt-01',
          settledAt: now + 11_000,
          progressDelta: { battleWins: 3, bossWins: 1, activityCompletions: 1 },
          integrity: { fullReplayPassed: true },
        };
        return successEnvelope('completed', { receipt: structuredClone(authoritativeRun.receipt) });
      };
    }
    await window.game.showSeasonOps('contracts');
    return { success: true };
  });
}

async function readLayout(page) {
  return page.evaluate(() => {
    const root = document.getElementById('season-ops-screen');
    const header = root.querySelector('.season-ops-header');
    const body = root.querySelector('.season-ops-body');
    const headerRect = header.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const headerContentBottom = Math.max(
      headerRect.bottom,
      ...[...header.querySelectorAll('*')].map(element => element.getBoundingClientRect().bottom),
    );
    const visibleButtons = [...root.querySelectorAll('button')].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const narrowButtons = visibleButtons
      .map(element => ({ label: element.getAttribute('aria-label') || element.textContent.trim(), ...element.getBoundingClientRect().toJSON() }))
      .filter(rect => rect.width < 40 || rect.height < 40);
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      narrowButtons,
      active: root.classList.contains('active'),
      phase: root.querySelector('[data-season-ops-phase]')?.getAttribute('data-season-ops-phase') || '',
      headerBottom: Math.round(headerRect.bottom),
      headerContentBottom: Math.round(headerContentBottom),
      bodyTop: Math.round(bodyRect.top),
      headerOverlapsBody: headerContentBottom > bodyRect.top + 1,
    };
  });
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('console', message => {
    if (message.type() === 'error') recordConsoleError(message.text());
  });
  page.on('pageerror', error => recordConsoleError(error));
  await page.addInitScript(({ origin }) => {
    localStorage.setItem('theDefierDebug', 'true');
    localStorage.setItem('theDefierServerConfig', JSON.stringify({
      baseUrl: origin,
      authPathPrefix: '/api/auth',
      savePathPrefix: '/api/saves',
      userPathPrefix: '/api/user',
      ghostPathPrefix: '/api/ghosts',
      pvpPathPrefix: '/api/pvp',
      progressionPathPrefix: '/api/progression',
      seasonOpsPathPrefix: '/api/season-ops',
    }));
  }, { origin: new URL(baseUrl).origin });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.querySelector('button[aria-label="赛季司"]'));
  await page.waitForTimeout(1400);
  const seasonEntry = page.locator('#main-menu.active button[aria-label="赛季司"]');
  await seasonEntry.click({ force: true });
  await page.waitForSelector('#season-ops-screen.active [data-season-ops-phase="not_logged_in"]');
  add('guest entry opens season ops', true);
  add('guest state exposes login action', await page.locator('[data-season-ops-action="login"]').isVisible());
  await safeAuditScreenshot(page, path.join(outDir, 'season-ops-guest-desktop.png'), 'browser_season_ops_audit', { timeout: 9000 });

  const mock = await installSeasonOpsMock(page);
  add('debug mock installed', mock.success, mock.reason || '');
  await page.waitForSelector('#season-ops-screen [data-season-ops-phase="ready"]');
  add('five tabs render', await page.locator('[data-season-ops-action="switch-tab"]').count() === 5);
  add('contracts render all cycles', await page.locator('.season-ops-section-card').count() >= 3);
  const desktopLayout = await readLayout(page);
  add('desktop has no horizontal overflow', desktopLayout.documentScrollWidth === desktopLayout.viewportWidth && desktopLayout.rootScrollWidth === desktopLayout.rootClientWidth, JSON.stringify(desktopLayout));
  add('desktop header does not overlap content', desktopLayout.headerOverlapsBody === false, JSON.stringify(desktopLayout));
  add('desktop controls meet touch target', desktopLayout.narrowButtons.length === 0, JSON.stringify(desktopLayout.narrowButtons));
  add('tablist exposes five semantic tabs', await page.locator('#season-ops-screen [role="tablist"] [role="tab"]').count() === 5);
  add('active tab exposes aria-selected', await page.locator('#season-ops-screen [role="tab"][aria-selected="true"]').getAttribute('data-tab-id') === 'contracts');
  await page.locator('#season-ops-screen [role="tab"][data-tab-id="contracts"]').focus();
  await page.keyboard.press('End');
  add('tab keyboard navigation selects and focuses the last tab', await page.evaluate(() => {
    const tab = document.activeElement;
    return tab?.getAttribute('data-tab-id') === 'authoritative' && tab?.getAttribute('aria-selected') === 'true';
  }));
  await page.locator('#season-ops-screen [role="tab"][data-tab-id="contracts"]').click();
  await safeAuditScreenshot(page, path.join(outDir, 'season-ops-contracts-desktop.png'), 'browser_season_ops_audit', { timeout: 9000 });

  await page.evaluate(() => {
    window.__seasonOpsDeferNextDashboard();
    void window.game.seasonOpsView.refresh({ silent: true });
  });
  await page.waitForFunction(() => typeof window.__seasonOpsResolveDashboard === 'function');
  await page.locator('[data-season-ops-action="claim"][data-objective-id="daily_battle_wins"]').click();
  await page.waitForFunction(() => document.querySelector('[data-objective-id="daily_battle_wins"]')?.textContent?.trim() === '已领取');
  add('claim applies durable refreshed state', await page.evaluate(() => window.game.seasonOpsView.dashboard?.wallet?.balance === 1310));
  add('claim rerender preserves a logical focus anchor', await page.evaluate(() => document.activeElement?.dataset?.seasonOpsFocusFallback?.startsWith('claim:daily_battle_wins:') === true));
  await page.evaluate(() => window.__seasonOpsResolveDashboard());
  await page.waitForTimeout(50);
  add('older refresh cannot roll back a completed claim', await page.evaluate(() => {
    const objective = window.game.seasonOpsView.dashboard?.objectives?.find(entry => entry.objectiveId === 'daily_battle_wins');
    return objective?.claimed === true && window.game.seasonOpsView.dashboard?.wallet?.balance === 1310;
  }));

  await page.locator('[data-season-ops-action="switch-tab"][data-tab-id="store"]').click();
  await page.waitForSelector('.season-ops-offer-card');
  add('store shows cosmetic-only boundary', (await page.locator('#season-ops-screen').innerText()).includes('不改动战斗资源与匹配'));
  await page.locator('[data-season-ops-action="purchase"][data-offer-id="offer-path-walker-title"]').click();
  await page.waitForSelector('#generic-confirm-modal.active');
  const confirmText = await page.locator('#generic-confirm-message').innerText();
  add('purchase requires explicit confirmation', /确认用 360 荣誉/.test(confirmText) && /只提供外观/.test(confirmText));
  add('confirmation close button has an accessible name', await page.locator('#generic-confirm-modal .modal-close').getAttribute('aria-label') === '关闭确认框');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  add('confirmation traps keyboard focus inside the dialog', await page.evaluate(() => document.activeElement?.id === 'generic-confirm-btn'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#generic-confirm-modal', { state: 'hidden' });
  await page.waitForFunction(() => window.game?.seasonOpsView?.pendingPurchases?.size === 0);
  add('Escape cancellation does not purchase', await page.evaluate(() => window.__seasonOpsPurchaseCalls === 0));
  add('Escape cancellation restores purchase button focus', await page.evaluate(() => document.activeElement?.dataset?.seasonOpsFocusKey === 'purchase:offer-path-walker-title'));

  await page.locator('[data-season-ops-action="purchase"][data-offer-id="offer-path-walker-title"]').click();
  await page.waitForSelector('#generic-confirm-modal.active');
  await page.evaluate(() => window.game.closeModal());
  await page.waitForSelector('#generic-confirm-modal', { state: 'hidden' });
  await page.waitForFunction(() => window.game?.seasonOpsView?.pendingPurchases?.size === 0);
  add('programmatic modal close resolves cancellation', await page.evaluate(() => window.__seasonOpsPurchaseCalls === 0));
  add('programmatic modal close restores purchase focus', await page.evaluate(() => document.activeElement?.dataset?.seasonOpsFocusKey === 'purchase:offer-path-walker-title'));

  await page.locator('[data-season-ops-action="purchase"][data-offer-id="offer-path-walker-title"]').click();
  await page.waitForSelector('#generic-confirm-modal.active');
  await page.locator('#generic-confirm-btn').click();
  await page.waitForFunction(() => window.game?.seasonOpsView?.pendingPurchases?.size === 0);
  add('confirmed purchase submits exactly once', await page.evaluate(() => window.__seasonOpsPurchaseCalls === 1));
  add('confirmed purchase survives dashboard refresh', (await page.locator('[data-season-ops-action="purchase"][data-offer-id="offer-path-walker-title"]').innerText()).trim() === '已拥有');
  add('confirmed purchase refreshes wallet balance', (await page.locator('.season-ops-wallet-value').innerText()).includes('950'));
  add('confirmed purchase leaves focus on the purchased offer', await page.evaluate(() => document.activeElement?.dataset?.seasonOpsFocusFallback === 'purchase:offer-path-walker-title'));
  await safeAuditScreenshot(page, path.join(outDir, 'season-ops-store-desktop.png'), 'browser_season_ops_audit', { timeout: 9000 });

  await page.evaluate(async () => {
    window.__seasonOpsSetDashboardMode('error');
    window.game.seasonOpsView.dashboard = null;
    await window.game.seasonOpsView.refresh({ silent: false });
  });
  add('error state is announced as an alert', await page.locator('[data-season-ops-phase="error"] [role="alert"]').isVisible());
  await page.evaluate(async () => {
    window.__seasonOpsSetDashboardMode('empty');
    await window.game.seasonOpsView.refresh({ silent: false });
  });
  add('empty state is announced as status', await page.locator('[data-season-ops-phase="empty"] [role="status"]').isVisible());
  await page.evaluate(async () => {
    window.__seasonOpsSetDashboardMode('ready');
    await window.game.seasonOpsView.refresh({ silent: false });
  });

  await page.locator('[data-season-ops-action="switch-tab"][data-tab-id="leaderboard"]').click();
  add('official leaderboard renders self card', await page.locator('.season-ops-self-rank-card').isVisible());
  add('official leaderboard renders entries', await page.locator('.season-ops-rank-row').count() === 2);

  await page.locator('[data-season-ops-action="switch-tab"][data-tab-id="ledger"]').click();
  const ledgerCountBeforePaging = await page.locator('.season-ops-ledger-row').count();
  add('ledger renders positive and negative entries', ledgerCountBeforePaging >= 4);
  await page.evaluate(() => window.__seasonOpsDeferNextLedger());
  await page.locator('[data-season-ops-action="load-ledger"]').click();
  await page.waitForFunction(() => typeof window.__seasonOpsResolveLedger === 'function');
  await page.evaluate(async () => {
    await window.game.seasonOpsView.refresh({ silent: true });
    window.__seasonOpsResolveLedger();
  });
  await page.waitForFunction(() => window.game?.seasonOpsView?.isLoadingLedger === false);
  add('stale ledger page is discarded after refresh', await page.locator('.season-ops-ledger-row').count() === ledgerCountBeforePaging);
  await page.locator('[data-season-ops-action="load-ledger"]').click();
  await page.waitForFunction(expected => document.querySelectorAll('.season-ops-ledger-row').length === expected + 1, ledgerCountBeforePaging);
  add('ledger can load older records', await page.locator('.season-ops-ledger-row').count() === ledgerCountBeforePaging + 1);
  add('ledger paging preserves focus when the load button disappears', await page.evaluate(() => document.activeElement?.dataset?.seasonOpsFocusFallback === 'load-ledger'));

  await page.locator('[data-season-ops-action="switch-tab"][data-tab-id="authoritative"]').click();
  await page.waitForSelector('[data-season-ops-action="authoritative-begin"]');
  add('authoritative tab exposes server-owned boundary', (await page.locator('.season-ops-authoritative-panel').innerText()).includes('浏览器只提交命令'));
  await page.locator('[data-season-ops-action="authoritative-begin"]').click();
  await page.waitForSelector('[data-season-ops-action="authoritative-select-node"]');
  add('authoritative route renders server choices', await page.locator('[data-season-ops-action="authoritative-select-node"]').count() === 1);
  await page.locator('[data-season-ops-action="authoritative-select-node"]').click();
  await page.waitForSelector('[data-season-ops-action="authoritative-play-card"]');
  add('authoritative battle exposes intent and command-only hand', /墨刃 6/.test(await page.locator('.season-ops-authoritative-panel').innerText()));
  await page.locator('[data-season-ops-action="authoritative-refresh"]').click();
  add('authoritative refresh preserves confirmed battle version', await page.locator('[data-season-ops-action="authoritative-play-card"]').isVisible());
  await page.locator('[data-season-ops-action="authoritative-play-card"]').click();
  await page.waitForSelector('[data-season-ops-action="authoritative-choose-reward"]');
  await page.locator('[data-season-ops-action="authoritative-choose-reward"]').click();
  await page.waitForSelector('[data-season-ops-action="authoritative-settle"]');
  await page.locator('[data-season-ops-action="authoritative-settle"]').click();
  await page.waitForSelector('[data-season-ops-action="authoritative-begin-new"]');
  add('authoritative settlement exposes full replay receipt', /回放 通过/.test(await page.locator('.season-ops-authoritative-panel').innerText()));
  await safeAuditScreenshot(page, path.join(outDir, 'season-ops-authoritative-settled-desktop.png'), 'browser_season_ops_audit', { timeout: 9000 });
  await page.locator('[data-season-ops-action="authoritative-begin-new"]').click();
  await page.waitForSelector('[data-season-ops-action="authoritative-select-node"]');
  add('authoritative new run bypasses prior idempotency key', await page.evaluate(() => {
    const calls = window.__authoritativeBrowserCalls || [];
    return calls.some(call => call.startsWith('begin:pve:true:'))
      && window.game?.seasonOpsView?.authoritativeRunPanel?.lastRunMeta?.runId === 'browser-authoritative-run-2';
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLayout = await readLayout(page);
  add('mobile 390 has no horizontal overflow', mobileLayout.documentScrollWidth === 390 && mobileLayout.rootScrollWidth === mobileLayout.rootClientWidth, JSON.stringify(mobileLayout));
  add('mobile header does not overlap content', mobileLayout.headerOverlapsBody === false, JSON.stringify(mobileLayout));
  add('mobile controls meet touch target', mobileLayout.narrowButtons.length === 0, JSON.stringify(mobileLayout.narrowButtons));
  await safeAuditScreenshot(page, path.join(outDir, 'season-ops-authoritative-mobile.png'), 'browser_season_ops_audit', { timeout: 9000 });

  await page.evaluate(() => {
    window.__seasonOpsDeferNextDashboard();
    window.__seasonOpsSwitchUser({ objectId: 'season-browser-user-b', username: '换卷测试者' });
  });
  await page.waitForFunction(() => typeof window.__seasonOpsResolveDashboard === 'function');
  await page.waitForFunction(() => {
    const view = window.game?.seasonOpsView;
    const panel = view?.authoritativeRunPanel;
    return view?.boundUserId === 'season-browser-user-b'
      && panel?.lastRunMeta === null
      && panel?.getCurrentProjection?.() === null;
  });
  add('active authoritative tab clears the previous account run on external switch', await page.evaluate(() => {
    const panel = window.game?.seasonOpsView?.authoritativeRunPanel;
    const text = document.querySelector('.season-ops-authoritative-panel')?.textContent || '';
    return panel?.lastRunMeta === null
      && panel?.getCurrentProjection?.() === null
      && !text.includes('browser-authoritative-run-2');
  }));
  add('external account switch clears the previous dashboard while loading', await page.evaluate(() => {
    const view = window.game.seasonOpsView;
    return view.boundUserId === 'season-browser-user-b' && view.dashboard === null && view.phase === 'loading';
  }));
  await page.evaluate(() => window.__seasonOpsResolveDashboard());
  await page.waitForFunction(() => window.game?.seasonOpsView?.phase === 'ready');
  await page.locator('[data-season-ops-action="switch-tab"][data-tab-id="contracts"]').click();
  add('external account switch rebinds account identity', (await page.locator('.season-ops-account-chip').first().innerText()).includes('换卷测试者'));
  add('external account switch requests and renders only the new account payload', await page.evaluate(() => {
    const view = window.game.seasonOpsView;
    return window.__seasonOpsRequestedUsers.at(-1) === 'season-browser-user-b'
      && view.dashboard?.wallet?.balance === 77
      && view.dashboard?.objectives?.[0]?.title === '换卷账号契约'
      && !document.getElementById('season-ops-screen')?.innerText?.includes('三战热身');
  }));
  add('browser mock write paths remain account scoped', await page.evaluate(() => {
    const primary = window.__seasonOpsReadMockAccount?.('season-browser-user-a');
    const secondary = window.__seasonOpsReadMockAccount?.('season-browser-user-b');
    return primary?.wallet?.balance === 950
      && secondary?.wallet?.balance === 77
      && window.__seasonOpsMutationUsers?.join(',') === 'claim:season-browser-user-a,purchase:season-browser-user-a';
  }));

  await page.locator('[data-season-ops-action="back"]').click();
  add('back returns to main menu', await page.locator('#main-menu.active').isVisible());
  add('console errors are empty', consoleErrors.length === 0, consoleErrors.join('\n'));
} catch (error) {
  add('audit runtime', false, error?.stack || error);
} finally {
  if (browser) await browser.close();
}

const failed = findings.filter(finding => !finding.pass);
const report = {
  url: baseUrl,
  generatedAt: new Date().toISOString(),
  summary: {
    total: findings.length,
    failed: failed.length,
    consoleErrors,
  },
  findings,
  consoleErrors,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0 || consoleErrors.length > 0) process.exit(1);
