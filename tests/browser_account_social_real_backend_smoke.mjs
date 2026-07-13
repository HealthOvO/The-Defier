import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-account-social-real-backend-smoke';
const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const dbPath = path.join(os.tmpdir(), `the-defier-account-social-browser-${process.pid}-${runId}.sqlite`);
const usernameA = `sociala-${runId}`.slice(0, 24);
const usernameB = `socialb-${runId}`.slice(0, 24);
const password = 'Start123!';
const newPassword = 'Changed456!';
const findings = [];
const consoleErrors = [];
let backend = null;
let browser = null;
let apiUrl = '';

fs.mkdirSync(outDir, { recursive: true });

function add(name, pass, detail = '') {
  findings.push({ name, pass: !!pass, detail: String(detail || '') });
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function startBackend(port) {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DEFIER_DB_PATH: dbPath,
      JWT_SECRET: 'account-social-browser-jwt-secret-32-characters',
      DEFIER_HMAC_SECRET: 'account-social-browser-hmac-secret-32-characters',
      DEFIER_INTEGRITY_REQUIRED: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function stopBackend(server) {
  if (!server || server.child.exitCode !== null || server.child.killed) return;
  server.child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (backend.child.exitCode !== null) throw new Error(`backend exited early\n${backend.getOutput()}`);
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      const payload = await response.json();
      if (response.ok && payload.status === 'ok') return payload;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`backend health timeout\n${backend.getOutput()}`);
}

async function api(pathname, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload };
}

function signPayload(payload, token, label, route) {
  const salt = `${label}-${runId}`;
  const signature = crypto.createHmac('sha256', token)
    .update(`session-v2\n${route}\n${salt}\n${JSON.stringify(payload)}`, 'utf8')
    .digest('hex');
  return { ...payload, salt, signature, signatureMode: 'session-v2' };
}

async function signedPost(pathname, token, payload, label) {
  const route = `POST ${pathname.split('?')[0]}`;
  return api(pathname, {
    method: 'POST',
    token,
    body: signPayload(payload, token, label, route)
  });
}

async function register(username, deviceName) {
  const response = await api('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      password,
      deviceId: `browser-${username}`,
      deviceName
    }
  });
  if (!response.ok || !response.payload?.token || !response.payload?.user) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.payload)}`);
  }
  return {
    token: response.payload.token,
    user: response.payload.user
  };
}

function findRotationId(payload) {
  return String(
    payload?.riftSquad?.current?.rotation?.rotationId
      || payload?.current?.riftSquad?.current?.rotation?.rotationId
      || payload?.current?.rotation?.rotationId
      || payload?.rotation?.rotationId
      || payload?.rotationId
      || ''
  );
}

async function openAs(page, account) {
  await page.addInitScript(({ serverUrl, token, user }) => {
    localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: serverUrl }));
    localStorage.setItem('theDefierServerSession', JSON.stringify({ token, user }));
    sessionStorage.setItem('currentSaveSlot', '0');
    localStorage.setItem('lastSaveSlot', '0');
  }, { serverUrl: apiUrl, token: account.token, user: account.user });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.querySelector('#login-btn'));
  await page.locator('#login-btn').click();
  await page.waitForSelector('#social-screen.active');
  await page.waitForFunction(() => {
    const screen = document.getElementById('social-screen');
    const tabs = [...document.querySelectorAll('[data-social-tab]')];
    return !!window.game?.socialView
      && screen?.getAttribute('aria-busy') === 'false'
      && tabs.length > 0
      && tabs.every(tab => !tab.disabled);
  });
  await page.waitForSelector('#social-content .social-row');
}

try {
  const port = await reservePort();
  apiUrl = `http://127.0.0.1:${port}`;
  backend = startBackend(port);
  const health = await waitForHealth();
  add('real backend boots authoritative fate chronicle schema V11', health?.schema?.version === 11 && health?.schema?.currentMigrationId === '0011_authoritative_fate_chronicle', JSON.stringify(health?.schema || {}));

  const accountA = await register(usernameA, 'Desktop A');
  const accountB = await register(usernameB, 'Desktop B');

  const friendRequestPayload = {
    protocolVersion: 'social-graph-v1',
    mutationId: `friend-${runId}`,
    targetUsername: usernameB
  };
  const friendRequest = await signedPost('/api/social/requests', accountA.token, friendRequestPayload, 'friend');
  add('account A sends an exact-name friend request', friendRequest.ok && friendRequest.payload?.status === 'pending', JSON.stringify(friendRequest.payload));

  const dashboardB = await api('/api/social/dashboard', { token: accountB.token });
  const requestId = dashboardB.payload?.incomingRequests?.[0]?.requestId;
  const acceptPayload = {
    protocolVersion: 'social-graph-v1',
    mutationId: `accept-${runId}`,
    requestId
  };
  const accepted = await signedPost(`/api/social/requests/${encodeURIComponent(requestId)}/accept`, accountB.token, acceptPayload, 'accept');
  add('account B accepts and creates one durable friendship', accepted.ok && accepted.payload?.status === 'accepted', JSON.stringify(accepted.payload));

  const dashboardA = await api('/api/social/dashboard', { token: accountA.token });
  const rotationId = findRotationId(dashboardA.payload);
  add('social dashboard exposes the real current rift rotation', !!rotationId, JSON.stringify(dashboardA.payload?.riftSquad || {}));
  const createSquadPayload = {
    protocolVersion: 'world-rift-squad-v1',
    mutationId: `squad-${runId}`,
    rotationId
  };
  const createdSquad = await signedPost('/api/social/rift-squads', accountA.token, createSquadPayload, 'squad');
  add('account A creates a real one-member rift squad', createdSquad.ok && createdSquad.payload?.dashboard?.squad?.memberCount === 1, JSON.stringify(createdSquad.payload));

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));
  await openAs(page, accountA);

  const friendRow = page.locator('.social-row').filter({ hasText: usernameB }).first();
  add('real UI renders the accepted friend by server profile', await friendRow.isVisible(), usernameB);
  await friendRow.locator('[data-social-action="pvp-invite"]').click();
  await page.waitForFunction(() => document.querySelector('#social-status')?.textContent?.includes('友谊约战已发出'));
  const inboxB = await api('/api/pvp/live/invites/inbox', { token: accountB.token });
  add('friend-row PVP action reaches the existing friendly inbox with no ranked impact', inboxB.ok && inboxB.payload?.invites?.length === 1 && inboxB.payload?.invites?.[0]?.inviteReport?.rankedImpact === 'none', JSON.stringify(inboxB.payload));

  await friendRow.locator('[data-social-action="squad-invite"]').click();
  await page.waitForFunction(() => document.querySelector('#social-status')?.textContent?.includes('裂隙小队邀请已发出'));
  const squadDashboardB = await api('/api/social/dashboard', { token: accountB.token });
  add('friend-row squad action creates one real pending invite', squadDashboardB.ok && squadDashboardB.payload?.riftSquad?.current?.invites?.received?.length === 1, JSON.stringify(squadDashboardB.payload?.riftSquad || {}));

  await page.locator('[data-social-tab="squad"]').click();
  await page.waitForSelector('.social-score');
  const squadText = await page.locator('#social-content').innerText();
  add('rift squad UI shows best-one scoring and no-power boundary', /每人仅取最佳一次真实贡献/.test(squadText) && /协作分/.test(squadText), squadText.slice(0, 500));
  await safeAuditScreenshot(page, path.join(outDir, 'account-social-desktop.png'), 'browser_account_social_real_backend_smoke');

  await page.locator('[data-social-tab="security"]').click();
  await page.waitForSelector('form[data-social-form="password"]');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById('social-content')?.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
  const mobileLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollLeft: document.documentElement.scrollLeft,
    tabsVisible: [...document.querySelectorAll('[data-social-tab]')].every(node => node.getBoundingClientRect().width > 0),
    screenVisible: document.querySelector('#social-screen')?.classList.contains('active')
  }));
  add('390px account security view has no horizontal overflow or hidden tabs', mobileLayout.scrollWidth <= mobileLayout.clientWidth + 1 && mobileLayout.scrollLeft === 0 && mobileLayout.tabsVisible && mobileLayout.screenVisible, JSON.stringify(mobileLayout));
  await safeAuditScreenshot(page, path.join(outDir, 'account-security-mobile.png'), 'browser_account_social_real_backend_smoke');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById('social-content')?.scrollTo(0, 0);
  });
  await page.locator('input[name="currentPassword"]').fill(password);
  await page.locator('input[name="newPassword"]').fill(newPassword);
  await page.locator('input[name="confirmPassword"]').fill(newPassword);
  await page.locator('form[data-social-form="password"] button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#social-status')?.textContent?.includes('密语已更新'));
  const browserSession = await page.evaluate(() => JSON.parse(localStorage.getItem('theDefierServerSession') || 'null'));
  const oldSession = await api('/api/auth/security', { token: accountA.token });
  const newSession = await api('/api/auth/security', { token: browserSession?.token || '' });
  const relogin = await api('/api/auth/login', {
    method: 'POST',
    body: { username: usernameA, password: newPassword, deviceId: `relogin-${usernameA}`, deviceName: 'Relogin check' }
  });
  add('password change revokes the old token and rotates the current browser session', oldSession.status === 401 && newSession.ok && browserSession?.token && browserSession.token !== accountA.token, JSON.stringify({ old: oldSession.payload, current: newSession.payload }));
  add('new password can create a fresh persistent session', relogin.ok && !!relogin.payload?.token, JSON.stringify(relogin.payload));

  add('browser run has no console errors', consoleErrors.length === 0, consoleErrors.join('\n'));
} catch (error) {
  add('account social real-backend browser smoke completes', false, `${error.stack || error}\n${backend?.getOutput() || ''}`);
} finally {
  if (browser) await browser.close();
  await stopBackend(backend);
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch {}
  }
  const report = {
    audit: 'account-social-real-backend',
    generatedAt: new Date().toISOString(),
    appUrl,
    apiUrl,
    findings,
    consoleErrors,
    summary: {
      total: findings.length,
      passed: findings.filter(item => item.pass).length,
      failed: findings.filter(item => !item.pass).length
    }
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Account social real-backend browser smoke passed: ${report.summary.passed}/${report.summary.total}`);
  }
}
