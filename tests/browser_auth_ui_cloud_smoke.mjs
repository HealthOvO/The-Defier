import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { safeAuditScreenshot } from './helpers/safe_audit_screenshot.mjs';

const appUrl = process.argv[2] || 'http://127.0.0.1:4173';
const outDir = process.argv[3] || 'output/browser-auth-ui-cloud-smoke';
const requestedPort = Number(process.env.BROWSER_AUTH_UI_SMOKE_PORT || 0);
let port = 0;
let apiUrl = '';
const runId = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
const username = `ui_cloud_${runId}`;
const password = `pwd_${runId}`;
const marker = `ui-cloud-marker-${runId}`;
const dbPath = process.env.BROWSER_AUTH_UI_SMOKE_DB_PATH || path.join(os.tmpdir(), `the-defier-browser-auth-ui-${process.pid}.sqlite`);

fs.mkdirSync(outDir, { recursive: true });

const findings = [];
const consoleErrors = [];
const AUTH_UI_CLOUD_FINDING = 'real auth UI register/login syncs global progress, loads cloud slot, and writes save back to cloud';
const SAVE_CONFLICT_FINDING = 'real save conflict modal keeps local/cloud choices consistent with backend state';

function add(name, pass, detail = '') {
  findings.push({ name, pass, detail });
}

function recordConsoleError(text) {
  const message = String(text || '');
  if (/ERR_CONNECTION_(CLOSED|RESET)/.test(message)) return;
  if (/Failed to load resource: net::ERR_FILE_NOT_FOUND/.test(message)) return;
  consoleErrors.push(message);
}

async function reserveAvailablePort(preferredPort = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: preferredPort }, resolve);
  });
  const address = server.address();
  const selectedPort = typeof address === 'object' && address ? address.port : preferredPort;
  await new Promise(resolve => server.close(resolve));
  return selectedPort;
}

function startBackend() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'integration-jwt-secret-32-characters',
      DEFIER_HMAC_SECRET: 'integration-hmac-secret-32-characters',
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_DB_PATH: dbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function stopBackend(server) {
  if (!server || server.child.killed || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (server?.child?.exitCode !== null) {
      throw new Error(`backend child exited before health check passed: code=${server.child.exitCode}\nServer output:\n${server.getOutput()}`);
    }
    try {
      const res = await fetch(`${apiUrl}/api/health`);
      const payload = await res.json();
      if (res.status === 200 && payload?.status === 'ok') return;
      lastError = new Error(`health returned ${res.status}: ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const output = server ? `\nServer output:\n${server.getOutput()}` : '';
  throw new Error(`backend health check timed out: ${lastError?.message || 'unknown'}${output}`);
}

async function fetchCloudSlots(token) {
  const res = await fetch(`${apiUrl}/api/saves`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json();
  if (!res.ok || !payload?.success) {
    throw new Error(`cloud slots fetch failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  return payload.data || [];
}

function sessionSignature(dataStr, salt, token) {
  return crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(String(salt), 'utf8')
    .update('\n', 'utf8')
    .update(String(dataStr), 'utf8')
    .digest('hex');
}

function signedFields(data, token, saltPrefix) {
  const salt = `${saltPrefix}-${runId}`;
  const dataStr = JSON.stringify(data);
  return {
    salt,
    signature: sessionSignature(dataStr, salt, token),
    signatureMode: 'session',
  };
}

function createConflictSave({
  marker: saveMarker,
  timestamp,
  slotIndex,
  realm,
  currentHp,
  maxHp = 120,
  gold,
}) {
  const deck = [
    'strike',
    'strike',
    'strike',
    'defend',
    'defend',
    'spiritBoost',
  ].map((id, index) => ({ id, instanceId: `${saveMarker}_card_${index}` }));
  return {
    version: '5.1.0',
    marker: saveMarker,
    timestamp,
    currentScreen: 'map-screen',
    saveSlot: slotIndex,
    map: {
      nodes: [],
      currentNodeIndex: 0,
      completedNodes: [],
    },
    player: {
      characterId: 'linFeng',
      registerTime: timestamp - 86400000,
      realm,
      currentHp,
      maxHp,
      block: 0,
      gold,
      heavenlyInsight: 1,
      karma: 0,
      currentEnergy: 3,
      baseEnergy: 3,
      hand: [],
      drawPile: [],
      discardPile: [],
      deck,
      buffs: {},
      stance: 'neutral',
      fateRing: { type: 'normal', level: 0, exp: 0 },
      collectedLaws: [],
      collectedTreasures: [],
      equippedTreasures: [],
    },
    unlockedRealms: [1, 2, 3, 4],
  };
}

async function uploadCloudSave(token, slotIndex, saveData, saveTime = saveData?.timestamp) {
  const res = await fetch(`${apiUrl}/api/saves`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      slotIndex,
      saveData,
      saveTime,
      ...signedFields(saveData, token, `cloud-save-${slotIndex}-${saveData?.marker || 'seed'}`),
    }),
  });
  const payload = await res.json();
  if (!res.ok || !payload?.success || payload.skipped) {
    throw new Error(`cloud save seed failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function uploadGlobalProgress(token, globalData) {
  const res = await fetch(`${apiUrl}/api/user/global`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      globalData,
      globalUpdatedAt: globalData.updatedAt,
      ...signedFields(globalData, token, 'global-progress'),
    }),
  });
  const payload = await res.json();
  if (!res.ok || !payload?.success) {
    throw new Error(`global progress upload failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForCloudMarker(token) {
  const deadline = Date.now() + 10000;
  let lastSlots = null;
  while (Date.now() < deadline) {
    const rows = await fetchCloudSlots(token);
    lastSlots = rows;
    const row = rows.find(item => item.slotIndex === 0 && item.saveData?.marker === marker);
    if (row) return row;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`cloud marker was not uploaded: ${JSON.stringify(lastSlots)}`);
}

async function waitForCloudGold(token, expectedGold) {
  const deadline = Date.now() + 10000;
  let lastSlots = null;
  while (Date.now() < deadline) {
    const rows = await fetchCloudSlots(token);
    lastSlots = rows;
    const row = rows.find(item => item.slotIndex === 0);
    if (row && Number(row.saveData?.player?.gold) === expectedGold) return row;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`cloud save gold did not update to ${expectedGold}: ${JSON.stringify(lastSlots)}`);
}

function getSaveDeck(saveData) {
  return Array.isArray(saveData?.player?.deck) ? saveData.player.deck : [];
}

async function waitForCloudDeckLength(token, slotIndex, expectedDeckLength) {
  const deadline = Date.now() + 10000;
  let lastSlots = null;
  while (Date.now() < deadline) {
    const rows = await fetchCloudSlots(token);
    lastSlots = rows;
    const row = rows.find(item => item.slotIndex === slotIndex);
    const deck = getSaveDeck(row?.saveData);
    if (row && deck.length === expectedDeckLength) return row;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`cloud slot ${slotIndex} deck did not become exactly ${expectedDeckLength}: ${JSON.stringify(lastSlots)}`);
}

async function waitForCloudSlotMarker(token, slotIndex, expectedMarker) {
  const deadline = Date.now() + 10000;
  let lastSlots = null;
  while (Date.now() < deadline) {
    const rows = await fetchCloudSlots(token);
    lastSlots = rows;
    const row = rows.find(item => item.slotIndex === slotIndex && item.saveData?.marker === expectedMarker);
    if (row) return row;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`cloud slot ${slotIndex} marker did not become ${expectedMarker}: ${JSON.stringify(lastSlots)}`);
}

async function configurePage(page) {
  await page.addInitScript((targetApiUrl) => {
    try {
      localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: targetApiUrl }));
    } catch {}
  }, apiUrl);
}

async function waitForGame(page) {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => !!window.game && !!document.getElementById('login-btn'),
    null,
    { timeout: 12000 }
  );
}

async function runConflictDecisionProbe(browser, token, serverSession, choice, slotIndex) {
  const timestampBase = Date.now() - 120000 - (slotIndex * 10000);
  const staleLocalChoice = choice === 'stale-local';
  const cloudPayload = createConflictSave({
    marker: `${choice}-cloud-conflict-${runId}`,
    timestamp: timestampBase,
    slotIndex,
    realm: choice === 'local' ? 4 : 5,
    currentHp: choice === 'local' ? 91 : 93,
    gold: choice === 'local' ? 4100 : 5100,
  });
  const localPayload = createConflictSave({
    marker: `${choice}-local-conflict-${runId}`,
    timestamp: staleLocalChoice ? timestampBase - 1000 : timestampBase + 30000,
    slotIndex,
    realm: choice === 'local' ? 6 : 7,
    currentHp: choice === 'local' ? 77 : 79,
    gold: choice === 'local' ? 7600 : 8700,
  });
  await uploadCloudSave(token, slotIndex, cloudPayload, cloudPayload.timestamp);
  const seededCloudRow = await waitForCloudSlotMarker(token, slotIndex, cloudPayload.marker);

  const context = await browser.newContext();
  const conflictPage = await context.newPage();
  const dialogMessages = [];
  conflictPage.on('dialog', async dialog => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });
  conflictPage.on('console', msg => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  conflictPage.on('pageerror', error => recordConsoleError(error.message));

  try {
    await configurePage(conflictPage);
    await conflictPage.addInitScript(({ serverSession, localPayload, slotIndex }) => {
      try {
        localStorage.setItem('theDefierServerSession', JSON.stringify(serverSession));
        localStorage.setItem('lastSaveSlot', String(slotIndex));
        sessionStorage.setItem('currentSaveSlot', String(slotIndex));
        sessionStorage.removeItem('justLoadedSave');
        if (sessionStorage.getItem('theDefierConflictSeeded') !== 'true') {
          localStorage.setItem('theDefierSave', JSON.stringify(localPayload));
          sessionStorage.setItem('theDefierConflictSeeded', 'true');
        }
      } catch {}
    }, { serverSession, localPayload, slotIndex });
    await waitForGame(conflictPage);
    await conflictPage.evaluate(async ({ localPayload, slotIndex }) => {
      localStorage.setItem('theDefierSave', JSON.stringify(localPayload));
      localStorage.setItem('lastSaveSlot', String(slotIndex));
      sessionStorage.setItem('currentSaveSlot', String(slotIndex));
      sessionStorage.removeItem('justLoadedSave');
      window.game.currentSaveSlot = slotIndex;
      await window.game.checkForCloudSave();
    }, { localPayload, slotIndex });
    await conflictPage.waitForSelector('#save-conflict-modal.active', { timeout: 12000 });
    const before = await conflictPage.evaluate(({ cloudPayload, localPayload, slotIndex }) => {
      const modal = document.getElementById('save-conflict-modal');
      const localInfo = document.getElementById('local-save-info')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const cloudInfo = document.getElementById('cloud-save-info')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return {
        modalActive: !!modal?.classList.contains('active'),
        currentSaveSlot: window.game?.currentSaveSlot ?? null,
        localInfo,
        cloudInfo,
        localInfoHasRealm: localInfo.includes(`第 ${localPayload.player.realm} 重天`),
        localInfoHasGold: localInfo.includes(String(localPayload.player.gold)),
        cloudInfoHasRealm: cloudInfo.includes(`第 ${cloudPayload.player.realm} 重天`),
        cloudInfoHasGold: cloudInfo.includes(String(cloudPayload.player.gold)),
        tempCloudMarker: window.game?.tempCloudData?.marker || '',
        tempCloudMarkerMatched: window.game?.tempCloudData?.marker === cloudPayload.marker,
        slotMatched: window.game?.currentSaveSlot === slotIndex,
      };
    }, { cloudPayload, localPayload, slotIndex });
    await safeAuditScreenshot(conflictPage, path.join(outDir, `save-conflict-${choice}-modal.png`));

    if (choice === 'local' || staleLocalChoice) {
      await conflictPage.evaluate(() => {
        const original = window.game.resolveSaveConflict.bind(window.game);
        window.__lastConflictResolveResult = null;
        window.game.resolveSaveConflict = (selectedChoice) => {
          const result = original(selectedChoice);
          Promise.resolve(result)
            .then(value => {
              window.__lastConflictResolveResult = { settled: true, fulfilled: true, value };
            })
            .catch(error => {
              window.__lastConflictResolveResult = {
                settled: true,
                fulfilled: false,
                message: error && error.message ? error.message : String(error),
              };
            });
          return result;
        };
      });
      await conflictPage.click('#save-conflict-modal [onclick="game.resolveSaveConflict(\'local\')"]');
      if (staleLocalChoice) {
        await conflictPage.waitForFunction(
          () => window.__lastConflictResolveResult?.settled === true,
          null,
          { timeout: 12000 }
        );
        const cloudRow = await waitForCloudSlotMarker(token, slotIndex, cloudPayload.marker);
        const after = await conflictPage.evaluate(({ localPayload, cloudPayload, slotIndex }) => {
          const modal = document.getElementById('save-conflict-modal');
          const raw = localStorage.getItem('theDefierSave');
          const save = raw ? JSON.parse(raw) : null;
          const resolveResult = window.__lastConflictResolveResult || null;
          return {
            modalStillActive: !!modal?.classList.contains('active'),
            localStorageKeptLocal: save?.marker === localPayload.marker,
            cachedMarker: window.game?.cachedSlots?.[slotIndex]?.marker || '',
            cachedSlotNotOverwritten: window.game?.cachedSlots?.[slotIndex]?.marker !== localPayload.marker,
            currentSaveSlot: window.game?.currentSaveSlot ?? null,
            slotMatched: window.game?.currentSaveSlot === slotIndex,
            resolveFulfilled: !!resolveResult?.fulfilled,
            resolveSkipped: !!resolveResult?.value?.skipped,
            resolveMessage: resolveResult?.value?.message || '',
            battleLogMentionsSkipped: document.body?.textContent?.includes('云端已有更新，本地存档未覆盖云端') || false,
            tempCloudMarkerStillCloud: window.game?.tempCloudData?.marker === cloudPayload.marker,
          };
        }, { localPayload, cloudPayload, slotIndex });
        await safeAuditScreenshot(conflictPage, path.join(outDir, 'save-conflict-stale-local-after.png'));
        return {
          choice,
          slotIndex,
          cloudSeedMarker: cloudPayload.marker,
          localMarker: localPayload.marker,
          before,
          after,
          dialogMessages,
          cloudReadbackMarker: cloudRow.saveData?.marker || '',
          cloudReadbackGold: Number(cloudRow.saveData?.player?.gold || 0),
          cloudReadbackSaveTime: Number(cloudRow.saveTime || 0),
          cloudReadbackMarkerStillCloud: cloudRow.saveData?.marker === cloudPayload.marker,
          cloudReadbackGoldStillCloud: Number(cloudRow.saveData?.player?.gold || 0) === cloudPayload.player.gold,
          cloudSaveTimeUnchanged: Number(cloudRow.saveTime || 0) === Number(seededCloudRow.saveTime || 0),
        };
      }
      await conflictPage.waitForFunction(
        () => !document.getElementById('save-conflict-modal')?.classList.contains('active'),
        null,
        { timeout: 12000 }
      );
      const cloudRow = await waitForCloudSlotMarker(token, slotIndex, localPayload.marker);
      const after = await conflictPage.evaluate(({ localPayload, slotIndex }) => {
        const modal = document.getElementById('save-conflict-modal');
        const raw = localStorage.getItem('theDefierSave');
        const save = raw ? JSON.parse(raw) : null;
        return {
          modalClosed: !modal?.classList.contains('active'),
          localStorageKeptLocal: save?.marker === localPayload.marker,
          cachedMarker: window.game?.cachedSlots?.[slotIndex]?.marker || '',
          cachedSlotUpdated: window.game?.cachedSlots?.[slotIndex]?.marker === localPayload.marker,
          currentSaveSlot: window.game?.currentSaveSlot ?? null,
          slotMatched: window.game?.currentSaveSlot === slotIndex,
        };
      }, { localPayload, slotIndex });
      await safeAuditScreenshot(conflictPage, path.join(outDir, 'save-conflict-keep-local-after.png'));
      return {
        choice,
        slotIndex,
        cloudSeedMarker: cloudPayload.marker,
        localMarker: localPayload.marker,
        before,
        after,
        dialogMessages,
        cloudReadbackMarker: cloudRow.saveData?.marker || '',
        cloudReadbackGold: Number(cloudRow.saveData?.player?.gold || 0),
        cloudReadbackSaveSlot: cloudRow.saveData?.saveSlot ?? null,
        cloudReadbackMarkerMatched: cloudRow.saveData?.marker === localPayload.marker,
        cloudReadbackGoldMatched: Number(cloudRow.saveData?.player?.gold || 0) === localPayload.player.gold,
        cloudReadbackSlotMatched: cloudRow.saveData?.saveSlot === slotIndex,
        cloudSaveTimeAdvanced: Number(cloudRow.saveTime || 0) > Number(seededCloudRow.saveTime || 0),
      };
    }

    const navPromise = conflictPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    await conflictPage.click('#save-conflict-modal [onclick="game.resolveSaveConflict(\'cloud\')"]');
    const reloadObserved = await navPromise;
    await conflictPage.waitForFunction(
      (cloudMarker) => {
        const raw = localStorage.getItem('theDefierSave');
        if (!raw || !window.game) return false;
        try {
          return JSON.parse(raw)?.marker === cloudMarker;
        } catch {
          return false;
        }
      },
      cloudPayload.marker,
      { timeout: 12000 }
    );
    const cloudRow = await waitForCloudSlotMarker(token, slotIndex, cloudPayload.marker);
    const after = await conflictPage.evaluate(({ cloudPayload, slotIndex }) => {
      const modal = document.getElementById('save-conflict-modal');
      const raw = localStorage.getItem('theDefierSave');
      const save = raw ? JSON.parse(raw) : null;
      return {
        modalClosed: !modal?.classList.contains('active'),
        localStorageRestoredCloud: save?.marker === cloudPayload.marker,
        localSavedGold: Number(save?.player?.gold || 0),
        runtimeRealm: Number(window.game?.player?.realm || 0),
        currentSaveSlot: window.game?.currentSaveSlot ?? null,
        slotMatched: window.game?.currentSaveSlot === slotIndex,
      };
    }, { cloudPayload, slotIndex });
    await safeAuditScreenshot(conflictPage, path.join(outDir, 'save-conflict-keep-cloud-after.png'));
    return {
      choice,
      slotIndex,
      cloudSeedMarker: cloudPayload.marker,
      localMarker: localPayload.marker,
      before,
      after,
      dialogMessages,
      reloadObserved,
      cloudReadbackMarker: cloudRow.saveData?.marker || '',
      cloudReadbackGold: Number(cloudRow.saveData?.player?.gold || 0),
      cloudReadbackSaveTime: Number(cloudRow.saveTime || 0),
      cloudReadbackMarkerStillCloud: cloudRow.saveData?.marker === cloudPayload.marker,
      cloudReadbackGoldStillCloud: Number(cloudRow.saveData?.player?.gold || 0) === cloudPayload.player.gold,
      cloudSaveTimeUnchanged: Number(cloudRow.saveTime || 0) === Number(seededCloudRow.saveTime || 0),
    };
  } finally {
    await context.close();
  }
}

async function runInvalidConflictSlotProbe(browser, token, serverSession) {
  const slotIndex = 0;
  const timestampBase = Date.now() + 60000;
  const cloudPayload = createConflictSave({
    marker: `invalid-slot-cloud-${runId}`,
    timestamp: timestampBase,
    slotIndex,
    realm: 2,
    currentHp: 82,
    gold: 2200,
  });
  const localPayload = createConflictSave({
    marker: `invalid-slot-local-${runId}`,
    timestamp: timestampBase + 30000,
    slotIndex,
    realm: 8,
    currentHp: 66,
    gold: 8800,
  });
  await uploadCloudSave(token, slotIndex, cloudPayload, cloudPayload.timestamp);
  const seededCloudRow = await waitForCloudSlotMarker(token, slotIndex, cloudPayload.marker);

  const context = await browser.newContext();
  const invalidPage = await context.newPage();
  const dialogMessages = [];
  invalidPage.on('dialog', async dialog => {
    dialogMessages.push(dialog.message());
    await dialog.accept();
  });
  invalidPage.on('console', msg => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  invalidPage.on('pageerror', error => recordConsoleError(error.message));

  try {
    await configurePage(invalidPage);
    await invalidPage.addInitScript(({ serverSession, localPayload }) => {
      try {
        localStorage.setItem('theDefierServerSession', JSON.stringify(serverSession));
        localStorage.setItem('theDefierSave', JSON.stringify(localPayload));
        localStorage.removeItem('lastSaveSlot');
        sessionStorage.removeItem('currentSaveSlot');
        sessionStorage.removeItem('justLoadedSave');
      } catch {}
    }, { serverSession, localPayload });
    await waitForGame(invalidPage);
    await invalidPage.evaluate((localPayload) => {
      localStorage.setItem('theDefierSave', JSON.stringify(localPayload));
      localStorage.removeItem('lastSaveSlot');
      sessionStorage.removeItem('currentSaveSlot');
      delete window.game.currentSaveSlot;
      window.game.resolveSaveConflict('local');
    }, localPayload);
    await invalidPage.waitForTimeout(250);
    const cloudRow = await waitForCloudSlotMarker(token, slotIndex, cloudPayload.marker);
    const after = await invalidPage.evaluate((localPayload) => {
      const raw = localStorage.getItem('theDefierSave');
      const save = raw ? JSON.parse(raw) : null;
      return {
        currentSaveSlotType: typeof window.game?.currentSaveSlot,
        localStorageKeptLocal: save?.marker === localPayload.marker,
        cachedSlotNotOverwritten: window.game?.cachedSlots?.[0]?.marker !== localPayload.marker,
      };
    }, localPayload);
    return {
      slotIndex,
      cloudSeedMarker: cloudPayload.marker,
      localMarker: localPayload.marker,
      dialogMessages,
      alertShown: dialogMessages.some(message => message.includes('无法确定存档位')),
      after,
      cloudReadbackMarker: cloudRow.saveData?.marker || '',
      cloudReadbackGold: Number(cloudRow.saveData?.player?.gold || 0),
      cloudReadbackSaveTime: Number(cloudRow.saveTime || 0),
      cloudReadbackMarkerStillCloud: cloudRow.saveData?.marker === cloudPayload.marker,
      cloudReadbackGoldStillCloud: Number(cloudRow.saveData?.player?.gold || 0) === cloudPayload.player.gold,
      cloudSaveTimeUnchanged: Number(cloudRow.saveTime || 0) === Number(seededCloudRow.saveTime || 0),
    };
  } finally {
    await context.close();
  }
}

async function runCleanCloudRestoreProbe(browser, serverSession, expectedGold, options = {}) {
  const expectedDeckLength = Math.max(0, Math.floor(Number(options.expectedDeckLength ?? options.expectedDeckMin) || 0));
  const expectedCardId = String(options.expectedCardId || '').trim();
  const context = await browser.newContext();
  const restorePage = await context.newPage();
  restorePage.on('console', msg => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  restorePage.on('pageerror', error => recordConsoleError(error.message));

  try {
    await configurePage(restorePage);
    await restorePage.addInitScript((session) => {
      try {
        localStorage.setItem('theDefierServerSession', JSON.stringify(session));
        if (sessionStorage.getItem('theDefierCleanRestorePrepared') !== 'true') {
          localStorage.removeItem('theDefierSave');
          localStorage.removeItem('lastSaveSlot');
          sessionStorage.removeItem('currentSaveSlot');
          sessionStorage.removeItem('justLoadedSave');
          sessionStorage.setItem('theDefierCleanRestorePrepared', 'true');
        }
      } catch {}
    }, serverSession);
    await waitForGame(restorePage);
    await restorePage.evaluate(() => {
      if (!window.game || typeof window.game.openSaveSlotsWithSync !== 'function') {
        throw new Error('game.openSaveSlotsWithSync is unavailable for cloud restore probe');
      }
      return window.game.openSaveSlotsWithSync();
    });
    const loadSelector = '#save-slots-modal [data-system-action="select-slot"][data-slot-index="0"][data-slot-mode="load"]';
    await restorePage.waitForSelector(loadSelector, { timeout: 12000 });
    const before = await restorePage.evaluate(({ expectedGold, expectedDeckLength, expectedCardId }) => {
      const modal = document.getElementById('save-slots-modal');
      const loadButton = modal?.querySelector('[data-system-action="select-slot"][data-slot-index="0"][data-slot-mode="load"]');
      const cached = window.game?.cachedSlots?.[0] || null;
      const cachedDeck = Array.isArray(cached?.player?.deck) ? cached.player.deck : [];
      return {
        modalActive: !!modal?.classList.contains('active'),
        hasLoadButton: !!loadButton,
        cachedGold: Number(cached?.player?.gold || 0),
        cachedSaveSlot: cached?.saveSlot ?? null,
        cachedGoldMatched: Number(cached?.player?.gold || 0) === expectedGold,
        cachedDeckLength: cachedDeck.length,
        cachedDeckLengthMatched: expectedDeckLength <= 0 || cachedDeck.length === expectedDeckLength,
        cachedHasCard: !expectedCardId || cachedDeck.some(card => card?.id === expectedCardId),
      };
    }, { expectedGold, expectedDeckLength, expectedCardId });
    await safeAuditScreenshot(restorePage, path.join(outDir, 'clean-cloud-restore-slots.png'));

    const navPromise = restorePage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    await restorePage.click(loadSelector);
    const reloadObserved = await navPromise;
    await restorePage.waitForFunction(
      ({ expectedGold, expectedDeckLength, expectedCardId }) => {
        const raw = localStorage.getItem('theDefierSave');
        if (!raw || !window.game) return false;
        try {
          const save = JSON.parse(raw);
          const savedDeck = Array.isArray(save?.player?.deck) ? save.player.deck : [];
          const runtimeDeck = Array.isArray(window.game?.player?.deck) ? window.game.player.deck : [];
          const continueButton = document.getElementById('continue-game-btn');
          const continueStyle = continueButton ? window.getComputedStyle(continueButton) : null;
          const continueVisible = !!continueButton
            && continueStyle?.display !== 'none'
            && continueStyle?.visibility !== 'hidden'
            && continueButton.getClientRects().length > 0;
          return Number(save?.player?.gold || 0) === expectedGold
            && Number(window.game?.player?.gold || 0) === expectedGold
            && window.game?.loadGameResult === true
            && window.game?.currentSaveSlot === 0
            && continueVisible
            && !continueButton.disabled
            && (expectedDeckLength <= 0 || (savedDeck.length === expectedDeckLength && runtimeDeck.length === expectedDeckLength))
            && (!expectedCardId || (savedDeck.some(card => card?.id === expectedCardId) && runtimeDeck.some(card => card?.id === expectedCardId)));
        } catch {
          return false;
        }
      },
      { expectedGold, expectedDeckLength, expectedCardId },
      { timeout: 12000 }
    );
    const after = await restorePage.evaluate(({ expectedGold, expectedDeckLength, expectedCardId }) => {
      const raw = localStorage.getItem('theDefierSave');
      const save = raw ? JSON.parse(raw) : null;
      const savedDeck = Array.isArray(save?.player?.deck) ? save.player.deck : [];
      const runtimeDeck = Array.isArray(window.game?.player?.deck) ? window.game.player.deck : [];
      const continueButton = document.getElementById('continue-game-btn');
      const continueStyle = continueButton ? window.getComputedStyle(continueButton) : null;
      const continueVisible = !!continueButton
        && continueStyle?.display !== 'none'
        && continueStyle?.visibility !== 'hidden'
        && continueButton.getClientRects().length > 0;
      return {
        reloadObserved: !!performance.getEntriesByType('navigation')?.some(entry => entry.type === 'reload'),
        localSavedGold: Number(save?.player?.gold || 0),
        runtimeGold: Number(window.game?.player?.gold || 0),
        currentScreen: window.game?.currentScreen || '',
        savedScreen: window.game?.savedScreen || '',
        currentSaveSlot: window.game?.currentSaveSlot ?? null,
        loadGameResult: window.game?.loadGameResult === true,
        localSaveSlot: save?.saveSlot ?? null,
        expectedGold,
        localDeckLength: savedDeck.length,
        runtimeDeckLength: runtimeDeck.length,
        expectedDeckLength,
        expectedCardId,
        continueVisible,
        continueDisabled: !!continueButton?.disabled,
        continueText: continueButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
        localGoldMatched: Number(save?.player?.gold || 0) === expectedGold,
        runtimeGoldMatched: Number(window.game?.player?.gold || 0) === expectedGold,
        slotMatched: window.game?.currentSaveSlot === 0,
        localDeckLengthMatched: expectedDeckLength <= 0 || savedDeck.length === expectedDeckLength,
        runtimeDeckLengthMatched: expectedDeckLength <= 0 || runtimeDeck.length === expectedDeckLength,
        localHasCard: !expectedCardId || savedDeck.some(card => card?.id === expectedCardId),
        runtimeHasCard: !expectedCardId || runtimeDeck.some(card => card?.id === expectedCardId),
      };
    }, { expectedGold, expectedDeckLength, expectedCardId });
    await safeAuditScreenshot(restorePage, path.join(outDir, 'clean-cloud-restore-after-reload.png'));
    return {
      before,
      after: {
        ...after,
        reloadObserved: reloadObserved || after.reloadObserved,
      },
    };
  } finally {
    await context.close();
  }
}

async function runRewardCloudRestoreProbe(page, browser, token, serverSession, expectedGold) {
  const setup = await page.evaluate((expectedGold) => {
    const game = window.game;
    if (!game || typeof game.showRewardScreen !== 'function') {
      throw new Error('game.showRewardScreen is unavailable for reward cloud restore probe');
    }
    game.currentSaveSlot = 0;
    sessionStorage.setItem('currentSaveSlot', '0');
    localStorage.setItem('lastSaveSlot', '0');
    if (game.player) {
      game.player.gold = expectedGold;
    }
    const beforeDeck = Array.isArray(game.player?.deck) ? game.player.deck : [];
    game.currentBattleNode = {
      id: 'auth_cloud_reward_probe',
      type: 'enemy',
      completed: false,
      accessible: true,
    };
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
      game.showRewardScreen(0, false, null, 0, null);
    } finally {
      Math.random = originalRandom;
    }
    return {
      beforeDeckLength: beforeDeck.length,
      beforeGold: Number(game.player?.gold || 0),
      currentScreen: game.currentScreen || '',
    };
  }, expectedGold);

  await page.waitForSelector('#reward-screen.active #reward-cards .reward-card', { timeout: 12000 });
  await safeAuditScreenshot(page, path.join(outDir, 'reward-cloud-before-select.png'));
  await page.click('#reward-screen.active #reward-cards .reward-card');
  await page.waitForFunction(
    () => !!window.game?.rewardCardSelected && !document.getElementById('continue-reward-btn')?.disabled,
    null,
    { timeout: 12000 }
  );
  const selected = await page.evaluate((beforeDeckLength) => {
    const deck = Array.isArray(window.game?.player?.deck) ? window.game.player.deck : [];
    const addedCards = deck.slice(beforeDeckLength);
    const addedCard = addedCards[addedCards.length - 1] || null;
    return {
      deckLength: deck.length,
      deckGrewByOne: deck.length === beforeDeckLength + 1,
      addedCardId: addedCard?.id || '',
      addedCardName: addedCard?.name || '',
      rewardCardSelected: !!window.game?.rewardCardSelected,
      continueEnabled: !document.getElementById('continue-reward-btn')?.disabled,
      runtimeGold: Number(window.game?.player?.gold || 0),
    };
  }, setup.beforeDeckLength);
  if (!selected.deckGrewByOne || !selected.addedCardId || !selected.rewardCardSelected || !selected.continueEnabled) {
    throw new Error(`reward card selection did not mutate runtime deck: ${JSON.stringify({ setup, selected })}`);
  }

  await page.waitForTimeout(25);
  await page.click('#continue-reward-btn');
  await page.waitForFunction(
    (expectedDeckLength) => {
      const raw = localStorage.getItem('theDefierSave');
      if (!raw || window.game?.currentScreen !== 'map-screen') return false;
      try {
        const save = JSON.parse(raw);
        const deck = Array.isArray(save?.player?.deck) ? save.player.deck : [];
        return deck.length === expectedDeckLength;
      } catch {
        return false;
      }
    },
    selected.deckLength,
    { timeout: 12000 }
  );
  const localAfterContinue = await page.evaluate(({ expectedDeckLength, addedCardId }) => {
    const raw = localStorage.getItem('theDefierSave');
    const save = raw ? JSON.parse(raw) : null;
    const deck = Array.isArray(save?.player?.deck) ? save.player.deck : [];
      return {
        currentScreen: window.game?.currentScreen || '',
        bodyScreen: document.body?.dataset?.currentScreen || '',
        localDeckLength: deck.length,
        localDeckLengthMatched: deck.length === expectedDeckLength,
        localHasCard: deck.some(card => card?.id === addedCardId),
        localSavedGold: Number(save?.player?.gold || 0),
        currentSaveSlot: window.game?.currentSaveSlot ?? null,
      };
  }, { expectedDeckLength: selected.deckLength, addedCardId: selected.addedCardId });
  await safeAuditScreenshot(page, path.join(outDir, 'reward-cloud-after-continue.png'));

  const cloudRow = await waitForCloudDeckLength(token, 0, selected.deckLength);
  const cloudDeck = getSaveDeck(cloudRow.saveData);
  const cloudProbe = {
    cloudDeckLength: cloudDeck.length,
    cloudDeckLengthMatched: cloudDeck.length === selected.deckLength,
    cloudHasCard: cloudDeck.some(card => card?.id === selected.addedCardId),
    cloudSavedGold: Number(cloudRow.saveData?.player?.gold || 0),
    cloudSaveSlot: cloudRow.saveData?.saveSlot ?? null,
    cloudSaveTime: Number(cloudRow.saveTime || 0),
  };
  const restoreProbe = await runCleanCloudRestoreProbe(browser, serverSession, expectedGold, {
    expectedDeckLength: selected.deckLength,
    expectedCardId: selected.addedCardId,
  });

  return {
    setup,
    selected,
    localAfterContinue,
    cloudProbe,
    restoreProbe,
  };
}

async function runSmoke(page, browser) {
  await configurePage(page);
  await waitForGame(page);

  await page.evaluate(({ marker }) => {
    localStorage.removeItem('theDefierServerSession');
    localStorage.removeItem('lastSaveSlot');
    sessionStorage.removeItem('currentSaveSlot');
    sessionStorage.removeItem('justLoadedSave');
    const starterDeck = [
      'strike',
      'strike',
      'strike',
      'strike',
      'defiantWill',
      'defend',
      'defend',
      'defend',
      'defend',
      'spiritBoost',
    ].map((id, index) => ({ id, instanceId: `ui_cloud_card_${index}` }));
    localStorage.setItem('theDefierSave', JSON.stringify({
      version: '5.1.0',
      marker,
      timestamp: Date.now(),
      currentScreen: 'map-screen',
      saveSlot: 0,
      map: {
        nodes: [],
        currentNodeIndex: 0,
        completedNodes: [],
      },
      player: {
        characterId: 'linFeng',
        registerTime: Date.now() - 86400000,
        realm: 3,
        currentHp: 88,
        maxHp: 120,
        block: 0,
        gold: 188,
        heavenlyInsight: 1,
        karma: 0,
        currentEnergy: 3,
        baseEnergy: 3,
        hand: [],
        drawPile: [],
        discardPile: [],
        deck: starterDeck,
        buffs: {},
        stance: 'neutral',
        fateRing: { type: 'normal', level: 0, exp: 0 },
        collectedLaws: [],
        collectedTreasures: [],
        equippedTreasures: [],
      },
      unlockedRealms: [1, 2, 3],
    }));
  }, { marker });

  await page.click('#login-btn');
  await page.waitForSelector('#auth-modal.active');
  await safeAuditScreenshot(page, path.join(outDir, 'auth-register-modal.png'));
  await page.fill('#auth-username', username);
  await page.fill('#auth-password', password);
  await page.click('#auth-modal [onclick="game.handleRegister()"]');

  await page.waitForFunction(
    () => document.getElementById('auth-message')?.textContent?.includes('注册成功'),
    null,
    { timeout: 12000 }
  );
  await page.waitForSelector('#save-slots-modal.active', { timeout: 12000 });
  await page.waitForSelector('#save-slots-modal [data-system-action="select-slot"][data-slot-index="0"][data-slot-mode="load"]', { timeout: 12000 });
  await safeAuditScreenshot(page, path.join(outDir, 'registered-cloud-slots.png'));

  const session = await page.evaluate(() => {
    const raw = localStorage.getItem('theDefierServerSession');
    return raw ? JSON.parse(raw) : null;
  });
  const token = session?.token;
  if (!token) throw new Error('UI registration did not persist a server session token');
  const cloudRow = await waitForCloudMarker(token);
  const originalCloudSaveTime = Number(cloudRow.saveTime || 0);
  const cloudAchievementId = 'firstBlood';
  const localAchievementId = 'veteran';
  const cloudCardBackId = 'cloudLoginBack';
  const localCardBackId = 'localLoginBack';
  const cloudUnlockId = 'cloudLoginMergeProbe';
  const localUnlockId = 'localLoginMergeProbe';
  const writebackGold = 700000 + Math.floor(Date.now() % 100000);
  const cloudGlobalProgress = {
    unlocked: [cloudAchievementId],
    claimed: [cloudAchievementId],
    stats: {
      enemiesDefeated: 11,
      uniqueCards: ['strike'],
      maxCombo: 3,
    },
    conf: {
      startBonuses: { maxHp: 7, spirit: 1 },
      unlocks: [cloudUnlockId],
      cardBacks: ['default', cloudCardBackId],
    },
    marker: `global-${marker}`,
    updatedAt: Date.now(),
    lastUpdated: Date.now(),
  };
  await uploadGlobalProgress(token, cloudGlobalProgress);

  const loginContext = await browser.newContext();
  const loginPage = await loginContext.newPage();
  loginPage.on('console', msg => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  loginPage.on('pageerror', error => recordConsoleError(error.message));
  let slotProbe = null;
  let loadProbe = null;
  let saveWritebackProbe = null;
  let loginSessionProbe = null;
  let globalProbe = null;
  let saveConflictProbe = null;
  let cleanCloudRestoreProbe = null;
  let rewardCloudRestoreProbe = null;
  try {
    await configurePage(loginPage);
    await loginPage.addInitScript(({ localAchievementId, localCardBackId, localUnlockId }) => {
      try {
        localStorage.setItem('theDefierAchievements', JSON.stringify([localAchievementId]));
        localStorage.setItem('theDefierClaimedAchievements', JSON.stringify([localAchievementId]));
        localStorage.setItem('theDefierStats', JSON.stringify({
          enemiesDefeated: 20,
          uniqueCards: ['defend'],
          maxCombo: 1,
        }));
        localStorage.setItem('theDefierStartBonuses', JSON.stringify({ maxHp: 12 }));
        localStorage.setItem('theDefierUnlocks', JSON.stringify([localUnlockId]));
        localStorage.setItem('theDefierCardBacks', JSON.stringify(['default', localCardBackId]));
      } catch {}
    }, { localAchievementId, localCardBackId, localUnlockId });
    await waitForGame(loginPage);
    await loginPage.waitForTimeout(2300);
    await loginPage.click('#login-btn');
    await loginPage.waitForSelector('#auth-modal.active');
    await loginPage.fill('#auth-username', username);
    await loginPage.fill('#auth-password', password);
    await loginPage.click('#auth-modal [onclick="game.handleLogin()"]');

    await loginPage.waitForFunction(
      () => document.getElementById('auth-message')?.textContent?.includes('登录成功'),
      null,
      { timeout: 12000 }
    );
    await loginPage.waitForSelector('#save-slots-modal.active', { timeout: 12000 });
    globalProbe = await loginPage.evaluate(({ cloudAchievementId, localAchievementId, cloudCardBackId, localCardBackId, cloudUnlockId, localUnlockId }) => {
      const system = window.game?.achievementSystem;
      const unlocked = JSON.parse(localStorage.getItem('theDefierAchievements') || '[]');
      const claimed = JSON.parse(localStorage.getItem('theDefierClaimedAchievements') || '[]');
      const stats = JSON.parse(localStorage.getItem('theDefierStats') || '{}');
      const startBonuses = JSON.parse(localStorage.getItem('theDefierStartBonuses') || '{}');
      const unlocks = JSON.parse(localStorage.getItem('theDefierUnlocks') || '[]');
      const cardBacks = JSON.parse(localStorage.getItem('theDefierCardBacks') || '[]');
      return {
        cloudAchievementId,
        localAchievementId,
        unlockedInRuntime: !!system?.unlockedAchievements?.includes(cloudAchievementId),
        claimedInRuntime: !!system?.claimedAchievements?.includes(cloudAchievementId),
        keptLocalUnlockedInRuntime: !!system?.unlockedAchievements?.includes(localAchievementId),
        keptLocalClaimedInRuntime: !!system?.claimedAchievements?.includes(localAchievementId),
        enemiesDefeated: Number(system?.stats?.enemiesDefeated || 0),
        enemiesUsedMax: Number(system?.stats?.enemiesDefeated || 0) === 20 && Number(stats.enemiesDefeated || 0) === 20,
        maxComboUsedCloudMax: Number(system?.stats?.maxCombo || 0) >= 3 && Number(stats.maxCombo || 0) >= 3,
        uniqueCardsUnion: Array.isArray(system?.stats?.uniqueCards)
          && system.stats.uniqueCards.includes('strike')
          && system.stats.uniqueCards.includes('defend'),
        localUnlocked: unlocked.includes(cloudAchievementId),
        localClaimed: claimed.includes(cloudAchievementId),
        keptLocalUnlocked: unlocked.includes(localAchievementId),
        keptLocalClaimed: claimed.includes(localAchievementId),
        startBonusMerged: Number(startBonuses.spirit || 0) >= 1,
        startBonusKeptLocalMax: Number(startBonuses.maxHp || 0) === 12,
        unlockMerged: unlocks.includes(cloudUnlockId),
        unlockKeptLocal: unlocks.includes(localUnlockId),
        cardBackMerged: cardBacks.includes(cloudCardBackId),
        cardBackKeptLocal: cardBacks.includes(localCardBackId),
        modalAlreadyActive: !!document.getElementById('save-slots-modal')?.classList.contains('active'),
      };
    }, {
      cloudAchievementId,
      localAchievementId,
      cloudCardBackId,
      localCardBackId,
      cloudUnlockId,
      localUnlockId,
    });
    if (!globalProbe.unlockedInRuntime
      || !globalProbe.claimedInRuntime
      || !globalProbe.keptLocalUnlockedInRuntime
      || !globalProbe.keptLocalClaimedInRuntime
      || !globalProbe.enemiesUsedMax
      || !globalProbe.maxComboUsedCloudMax
      || !globalProbe.uniqueCardsUnion
      || !globalProbe.localUnlocked
      || !globalProbe.localClaimed
      || !globalProbe.keptLocalUnlocked
      || !globalProbe.keptLocalClaimed
      || !globalProbe.startBonusMerged
      || !globalProbe.startBonusKeptLocalMax
      || !globalProbe.unlockMerged
      || !globalProbe.unlockKeptLocal
      || !globalProbe.cardBackMerged
      || !globalProbe.cardBackKeptLocal
      || !globalProbe.modalAlreadyActive) {
      throw new Error(`global progress was not merged before save slots modal: ${JSON.stringify(globalProbe)}`);
    }
    const loadSelector = '#save-slots-modal [data-system-action="select-slot"][data-slot-index="0"][data-slot-mode="load"]';
    slotProbe = await loginPage.evaluate((marker) => {
      const modal = document.getElementById('save-slots-modal');
      const loadButton = modal?.querySelector('[data-system-action="select-slot"][data-slot-index="0"][data-slot-mode="load"]');
      const slot = loadButton?.closest('.save-slot');
      return {
        modalActive: !!modal?.classList.contains('active'),
        hasLoadButton: !!loadButton,
        slotText: slot?.textContent?.replace(/\s+/g, ' ').trim() || '',
        cachedMarker: window.game?.cachedSlots?.[0]?.marker || '',
        loginButtonText: document.getElementById('login-btn')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        markerMatched: window.game?.cachedSlots?.[0]?.marker === marker,
      };
    }, marker);
    await safeAuditScreenshot(loginPage, path.join(outDir, 'login-cloud-slots.png'));

    await Promise.all([
      loginPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }),
      loginPage.click(loadSelector),
    ]);
    await loginPage.waitForFunction(
      (expectedMarker) => {
        const raw = localStorage.getItem('theDefierSave');
        if (!raw) return false;
        try {
          const save = JSON.parse(raw);
          return save?.marker === expectedMarker
            && window.game?.player?.realm === 3
            && window.game?.savedScreen === 'map-screen';
        } catch {
          return false;
        }
      },
      marker,
      { timeout: 12000 }
    );
    loadProbe = await loginPage.evaluate((marker) => {
      const raw = localStorage.getItem('theDefierSave');
      const save = raw ? JSON.parse(raw) : null;
      return {
        savedMarker: save?.marker || '',
        currentScreen: window.game?.currentScreen || '',
        savedScreen: window.game?.savedScreen || '',
        playerRealm: window.game?.player?.realm ?? null,
        localSaveMatched: save?.marker === marker,
        playerRealmMatched: window.game?.player?.realm === 3,
        savedScreenMatched: window.game?.savedScreen === 'map-screen',
      };
    }, marker);
    await safeAuditScreenshot(loginPage, path.join(outDir, 'loaded-cloud-save.png'));

    const loginSession = await loginPage.evaluate(() => {
      const raw = localStorage.getItem('theDefierServerSession');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        token: parsed?.token || '',
        username: parsed?.user?.username || '',
        objectId: parsed?.user?.objectId || '',
      };
    });
    const loginToken = loginSession?.token || '';
    loginSessionProbe = {
      hasToken: !!loginToken,
      username: loginSession?.username || '',
      objectId: loginSession?.objectId || '',
      usernameMatched: loginSession?.username === username,
      usedLoginSessionForReadback: false,
    };
    if (!loginToken || !loginSessionProbe.usernameMatched) {
      throw new Error(`login page did not persist the expected server session: ${JSON.stringify(loginSessionProbe)}`);
    }
    const serverSession = {
      token: loginToken,
      user: {
        objectId: loginSession.objectId,
        username: loginSession.username,
        sessionToken: loginToken,
      },
    };

    saveWritebackProbe = await loginPage.evaluate(async ({ writebackGold }) => {
      if (!window.game || typeof window.game.saveGame !== 'function') {
        throw new Error('game.saveGame is unavailable after cloud slot load');
      }
      window.game.currentSaveSlot = 0;
      sessionStorage.setItem('currentSaveSlot', '0');
      localStorage.setItem('lastSaveSlot', '0');
      if (window.game.player) {
        window.game.player.gold = writebackGold;
      }
      const result = window.game.saveGame();
      const finalResult = result && result.cloudPromise ? await result.cloudPromise : result;
      const raw = localStorage.getItem('theDefierSave');
      const saved = raw ? JSON.parse(raw) : null;
      return {
        localSuccess: !!result?.success,
        cloudPending: !!result?.cloudPending,
        cloudSuccess: !!finalResult?.cloud,
        cloudSkipped: !!finalResult?.cloudSkipped,
        slot: finalResult?.slot ?? result?.slot ?? null,
        runtimeGold: Number(window.game.player?.gold || 0),
        localSavedGold: Number(saved?.player?.gold || 0),
        localSaveSlot: saved?.saveSlot ?? null,
        finalResult,
      };
    }, { writebackGold });
    if (!saveWritebackProbe.localSuccess
      || !saveWritebackProbe.cloudPending
      || !saveWritebackProbe.cloudSuccess
      || saveWritebackProbe.cloudSkipped
      || saveWritebackProbe.slot !== 0
      || saveWritebackProbe.runtimeGold !== writebackGold
      || saveWritebackProbe.localSavedGold !== writebackGold
      || saveWritebackProbe.localSaveSlot !== 0) {
      throw new Error(`saveGame did not complete local+cloud writeback: ${JSON.stringify(saveWritebackProbe)}`);
    }
    const writebackRow = await waitForCloudGold(loginToken, writebackGold);
    loginSessionProbe.usedLoginSessionForReadback = true;
    saveWritebackProbe.cloudSavedGold = Number(writebackRow.saveData?.player?.gold || 0);
    saveWritebackProbe.cloudSaveSlot = writebackRow.saveData?.saveSlot ?? null;
    saveWritebackProbe.cloudSaveTime = Number(writebackRow.saveTime || 0);
    saveWritebackProbe.cloudSaveTimeAdvanced = saveWritebackProbe.cloudSaveTime >= originalCloudSaveTime;
    await safeAuditScreenshot(loginPage, path.join(outDir, 'cloud-save-writeback.png'));
    cleanCloudRestoreProbe = await runCleanCloudRestoreProbe(browser, serverSession, writebackGold);
    rewardCloudRestoreProbe = await runRewardCloudRestoreProbe(loginPage, browser, loginToken, serverSession, writebackGold);
    saveConflictProbe = {
      invalidSlot: await runInvalidConflictSlotProbe(browser, loginToken, serverSession),
      skipped: await runConflictDecisionProbe(browser, loginToken, serverSession, 'stale-local', 1),
      local: await runConflictDecisionProbe(browser, loginToken, serverSession, 'local', 2),
      cloud: await runConflictDecisionProbe(browser, loginToken, serverSession, 'cloud', 3),
    };
  } finally {
    await loginContext.close();
  }

  return {
    username,
    marker,
    tokenPersisted: !!token,
    cloudSlotIndex: cloudRow.slotIndex,
    cloudSaveTime: cloudRow.saveTime,
    originalCloudSaveTime,
    writebackGold,
    cloudAchievementId,
    globalProbe,
    slotProbe,
    loadProbe,
    saveWritebackProbe,
    loginSessionProbe,
    cleanCloudRestoreProbe,
    rewardCloudRestoreProbe,
    saveConflictProbe,
  };
}

function writeReport() {
  const report = {
    url: appUrl,
    apiUrl,
    generatedAt: new Date().toISOString(),
    summary: {
      total: findings.length,
      failed: findings.filter(item => item.pass === false).length,
      consoleErrors: consoleErrors.length,
    },
    findings,
    consoleErrors,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
}

let server = null;
let browser = null;
try {
  port = await reserveAvailablePort(requestedPort);
  apiUrl = `http://127.0.0.1:${port}`;
  server = startBackend();
  await waitForHealth(server);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') recordConsoleError(msg.text());
  });
  page.on('pageerror', error => recordConsoleError(error.message));
  const result = await runSmoke(page, browser);
  await page.close();
  const invalidSlotConflict = result.saveConflictProbe?.invalidSlot || null;
  const skippedConflict = result.saveConflictProbe?.skipped || null;
  const localConflict = result.saveConflictProbe?.local || null;
  const cloudConflict = result.saveConflictProbe?.cloud || null;

  add(
    AUTH_UI_CLOUD_FINDING,
    result.tokenPersisted
      && result.cloudSlotIndex === 0
      && result.loginSessionProbe.hasToken
      && result.loginSessionProbe.usernameMatched
      && result.loginSessionProbe.usedLoginSessionForReadback
      && result.globalProbe
      && result.globalProbe.unlockedInRuntime
      && result.globalProbe.claimedInRuntime
      && result.globalProbe.keptLocalUnlockedInRuntime
      && result.globalProbe.keptLocalClaimedInRuntime
      && result.globalProbe.enemiesUsedMax
      && result.globalProbe.maxComboUsedCloudMax
      && result.globalProbe.uniqueCardsUnion
      && result.globalProbe.localUnlocked
      && result.globalProbe.localClaimed
      && result.globalProbe.keptLocalUnlocked
      && result.globalProbe.keptLocalClaimed
      && result.globalProbe.startBonusMerged
      && result.globalProbe.startBonusKeptLocalMax
      && result.globalProbe.unlockMerged
      && result.globalProbe.unlockKeptLocal
      && result.globalProbe.cardBackMerged
      && result.globalProbe.cardBackKeptLocal
      && result.globalProbe.modalAlreadyActive
      && result.slotProbe.modalActive
      && result.slotProbe.hasLoadButton
      && result.slotProbe.markerMatched
      && result.loadProbe.localSaveMatched
      && result.loadProbe.playerRealmMatched
      && result.loadProbe.savedScreenMatched
      && result.saveWritebackProbe.localSuccess
      && result.saveWritebackProbe.cloudPending
      && result.saveWritebackProbe.cloudSuccess
      && !result.saveWritebackProbe.cloudSkipped
      && result.saveWritebackProbe.slot === 0
      && result.saveWritebackProbe.runtimeGold === result.writebackGold
      && result.saveWritebackProbe.localSavedGold === result.writebackGold
      && result.saveWritebackProbe.localSaveSlot === 0
      && result.saveWritebackProbe.cloudSavedGold === result.writebackGold
      && result.saveWritebackProbe.cloudSaveSlot === 0
      && result.saveWritebackProbe.cloudSaveTimeAdvanced
      && result.cleanCloudRestoreProbe?.before?.modalActive
      && result.cleanCloudRestoreProbe?.before?.hasLoadButton
      && result.cleanCloudRestoreProbe?.before?.cachedGoldMatched
      && result.cleanCloudRestoreProbe?.after?.reloadObserved
	      && result.cleanCloudRestoreProbe?.after?.loadGameResult
	      && result.cleanCloudRestoreProbe?.after?.localGoldMatched
	      && result.cleanCloudRestoreProbe?.after?.runtimeGoldMatched
	      && result.cleanCloudRestoreProbe?.after?.slotMatched
	      && result.cleanCloudRestoreProbe?.after?.continueVisible
	      && !result.cleanCloudRestoreProbe?.after?.continueDisabled
	      && result.rewardCloudRestoreProbe?.selected?.deckGrewByOne
	      && result.rewardCloudRestoreProbe?.selected?.addedCardId
	      && result.rewardCloudRestoreProbe?.localAfterContinue?.currentScreen === 'map-screen'
	      && result.rewardCloudRestoreProbe?.localAfterContinue?.localDeckLengthMatched
	      && result.rewardCloudRestoreProbe?.localAfterContinue?.localHasCard
      && result.rewardCloudRestoreProbe?.cloudProbe?.cloudDeckLengthMatched
      && result.rewardCloudRestoreProbe?.cloudProbe?.cloudHasCard
      && result.rewardCloudRestoreProbe?.restoreProbe?.before?.cachedDeckLengthMatched
	      && result.rewardCloudRestoreProbe?.restoreProbe?.before?.cachedHasCard
	      && result.rewardCloudRestoreProbe?.restoreProbe?.after?.reloadObserved
	      && result.rewardCloudRestoreProbe?.restoreProbe?.after?.runtimeDeckLengthMatched
	      && result.rewardCloudRestoreProbe?.restoreProbe?.after?.runtimeHasCard
	      && result.rewardCloudRestoreProbe?.restoreProbe?.after?.continueVisible
	      && !result.rewardCloudRestoreProbe?.restoreProbe?.after?.continueDisabled,
	    JSON.stringify(result)
	  );
  add(
    SAVE_CONFLICT_FINDING,
    invalidSlotConflict
      && invalidSlotConflict.alertShown
      && invalidSlotConflict.after?.currentSaveSlotType === 'undefined'
      && invalidSlotConflict.after?.localStorageKeptLocal
      && invalidSlotConflict.after?.cachedSlotNotOverwritten
      && invalidSlotConflict.cloudReadbackMarkerStillCloud
      && invalidSlotConflict.cloudReadbackGoldStillCloud
      && invalidSlotConflict.cloudSaveTimeUnchanged
      && skippedConflict
      && skippedConflict.before?.modalActive
      && skippedConflict.before?.slotMatched
      && skippedConflict.before?.localInfoHasRealm
      && skippedConflict.before?.localInfoHasGold
      && skippedConflict.before?.cloudInfoHasRealm
      && skippedConflict.before?.cloudInfoHasGold
      && skippedConflict.before?.tempCloudMarkerMatched
      && skippedConflict.after?.modalStillActive
      && skippedConflict.after?.slotMatched
      && skippedConflict.after?.localStorageKeptLocal
      && skippedConflict.after?.cachedSlotNotOverwritten
      && skippedConflict.after?.resolveFulfilled
      && skippedConflict.after?.resolveSkipped
      && skippedConflict.after?.resolveMessage === 'stale-save-ignored'
      && skippedConflict.after?.battleLogMentionsSkipped
      && skippedConflict.after?.tempCloudMarkerStillCloud
      && skippedConflict.cloudReadbackMarkerStillCloud
      && skippedConflict.cloudReadbackGoldStillCloud
      && skippedConflict.cloudSaveTimeUnchanged
      && localConflict
      && localConflict.before?.modalActive
      && localConflict.before?.slotMatched
      && localConflict.before?.localInfoHasRealm
      && localConflict.before?.localInfoHasGold
      && localConflict.before?.cloudInfoHasRealm
      && localConflict.before?.cloudInfoHasGold
      && localConflict.before?.tempCloudMarkerMatched
      && localConflict.after?.modalClosed
      && localConflict.after?.slotMatched
      && localConflict.after?.localStorageKeptLocal
      && localConflict.after?.cachedSlotUpdated
      && localConflict.cloudReadbackMarkerMatched
      && localConflict.cloudReadbackGoldMatched
      && localConflict.cloudReadbackSlotMatched
      && localConflict.cloudSaveTimeAdvanced
      && cloudConflict
      && cloudConflict.before?.modalActive
      && cloudConflict.before?.slotMatched
      && cloudConflict.before?.localInfoHasRealm
      && cloudConflict.before?.localInfoHasGold
      && cloudConflict.before?.cloudInfoHasRealm
      && cloudConflict.before?.cloudInfoHasGold
      && cloudConflict.before?.tempCloudMarkerMatched
      && cloudConflict.reloadObserved
      && cloudConflict.dialogMessages?.includes('已从云端恢复存档！')
      && cloudConflict.after?.modalClosed
      && cloudConflict.after?.slotMatched
      && cloudConflict.after?.localStorageRestoredCloud
      && cloudConflict.after?.localSavedGold === cloudConflict.cloudReadbackGold
      && cloudConflict.cloudReadbackMarkerStillCloud
      && cloudConflict.cloudReadbackGoldStillCloud
      && cloudConflict.cloudSaveTimeUnchanged,
    JSON.stringify(result.saveConflictProbe)
  );
} catch (error) {
  add(AUTH_UI_CLOUD_FINDING, false, error?.message || String(error));
  add(SAVE_CONFLICT_FINDING, false, error?.message || String(error));
} finally {
  if (browser) await browser.close().catch(() => {});
  await stopBackend(server);
  writeReport();
}

console.log(JSON.stringify({
  url: appUrl,
  apiUrl,
  findings,
  consoleErrors,
  timestamp: new Date().toISOString(),
}, null, 2));

if (findings.some(item => item.pass === false) || consoleErrors.length > 0) {
  process.exit(1);
}
