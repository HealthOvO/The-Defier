import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { safeAuditScreenshot } from "./helpers/safe_audit_screenshot.mjs";

const require = createRequire(import.meta.url);
const sqlite3 = require("../server/node_modules/sqlite3").verbose();
const { buildCycleSnapshotForTime } = require("../server/weekly-archive/catalog");

const appUrl = process.argv[2] || "http://127.0.0.1:4173";
const outDir = process.argv[3] || "output/browser-fate-chronicle-real-backend-smoke";
const reportPath = path.join(outDir, "report.json");
const dbPath = process.env.BROWSER_FATE_CHRONICLE_DB_PATH
  || path.join(os.tmpdir(), `the-defier-fate-chronicle-${process.pid}.sqlite`);
const requestedPort = Number(process.env.BROWSER_FATE_CHRONICLE_PORT || 0);
const unique = `${Date.now().toString(36)}${process.pid.toString(36)}`.slice(-12);
const username = `fchron${unique}`.slice(0, 20);
const password = `pwd_${unique}_chronicle`;
const findings = [];
const consoleErrors = [];
let browser = null;
let backend = null;
let port = 0;
let apiUrl = "";
let userId = "";
let allowExpectedArchive503ConsoleError = false;
const PRIVATE_BRANCH_FIELDS = [
  "rewardCardPool",
  "rewardProfile",
  "futureStages",
  "enemyAdjustments",
  "rewardAdjustments",
  "seed",
];
const PUBLIC_BRANCH_KEYS = [
  "branchId",
  "title",
  "description",
  "counterplay",
  "buildFocus",
  "consequenceSummary",
].sort();

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(reportPath, { force: true });

function add(name, pass, detail = "") {
  findings.push({ name, pass: !!pass, detail: String(detail || "") });
}

function recordConsoleError(value) {
  const message = String(value || "");
  if (/favicon|ERR_CONNECTION_(CLOSED|RESET)|404 \(Not Found\)/i.test(message)) return;
  if (allowExpectedArchive503ConsoleError && /503 \(Service Unavailable\)/.test(message)) return;
  consoleErrors.push(message);
}

function removeDbFiles() {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

function dbGet(sql, params = []) {
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      db.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbRun(sql, params = []) {
  const db = new sqlite3.Database(dbPath);
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      db.close();
      if (error) reject(error);
      else resolve(this);
    });
  });
}

async function reservePort(preferred = 0) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: preferred }, resolve);
  });
  const address = server.address();
  const selected = typeof address === "object" && address ? address.port : preferred;
  await new Promise(resolve => server.close(resolve));
  return selected;
}

function startBackend() {
  const child = spawn(process.execPath, ["server/app.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: "fate-chronicle-browser-jwt-secret-32",
      DEFIER_HMAC_SECRET: "fate-chronicle-browser-hmac-secret-32",
      DEFIER_FATE_CHRONICLE_SEED_SECRET: "fate-chronicle-browser-seed-secret-32",
      DEFIER_INTEGRITY_REQUIRED: "1",
      DEFIER_OPS_TOKEN: "fate-chronicle-browser-ops-token",
      DEFIER_DB_PATH: dbPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function stopBackend() {
  if (!backend || backend.child.killed || backend.child.exitCode !== null) return;
  backend.child.kill("SIGTERM");
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2500);
    backend.child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (backend.child.exitCode !== null) {
      throw new Error(`backend exited before health check: ${backend.child.exitCode}\n${backend.getOutput()}`);
    }
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      const payload = await response.json();
      if (response.ok && payload.status === "ok") return payload;
      lastError = new Error(`health ${response.status}: ${JSON.stringify(payload)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`backend health timeout: ${lastError?.message || "unknown"}\n${backend.getOutput()}`);
}

function cssValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function assertPublicBranch(branch, label) {
  if (!branch || typeof branch !== "object") {
    throw new Error(`${label} should expose a public chapterBranch`);
  }
  const keys = Object.keys(branch).sort();
  if (JSON.stringify(keys) !== JSON.stringify(PUBLIC_BRANCH_KEYS)) {
    throw new Error(`${label} should only expose public chapterBranch fields: ${keys.join(",")}`);
  }
  const json = JSON.stringify(branch);
  PRIVATE_BRANCH_FIELDS.forEach(field => {
    if (json.includes(field)) {
      throw new Error(`${label} leaked private field ${field}`);
    }
  });
}

function assertNoPrivateBranchFields(value, label) {
  const json = JSON.stringify(value || null);
  PRIVATE_BRANCH_FIELDS.forEach(field => {
    if (json.includes(field)) {
      throw new Error(`${label} leaked private field ${field}`);
    }
  });
}

async function prepareLoggedInPage(page) {
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient && !!window.__THE_DEFIER_SERVICES__?.AuthService,
    null,
    { timeout: 30000 }
  );
  const login = await page.evaluate(async credentials => {
    const { BackendClient, AuthService } = window.__THE_DEFIER_SERVICES__;
    BackendClient.REQUEST_TIMEOUT_MS = 10000;
    BackendClient.NETWORK_RETRY = 0;
    BackendClient.clearServerSession();
    const initialized = BackendClient.init();
    if (!initialized?.success) return { success: false, stage: "init", initialized };
    const registered = await AuthService.register(credentials.username, credentials.password);
    if (!registered?.success) return { success: false, stage: "register", registered };
    const authenticated = await AuthService.login(credentials.username, credentials.password);
    const user = AuthService.getCurrentUser();
    return {
      success: authenticated?.success === true,
      stage: "login",
      userId: user?.objectId || user?.id || "",
      username: user?.username || ""
    };
  }, { username, password });
  userId = login.userId;
  add("real backend account registers and logs into fate chronicle", login.success && !!userId, JSON.stringify(login));
  if (!login.success) throw new Error(`real backend login failed: ${JSON.stringify(login)}`);
}

async function addWeeklyArchiveProof({
  eventId,
  mode,
  occurredAt,
  trustTier = "server_authoritative",
  activityCompletions = 1
}) {
  await dbRun(
    `INSERT INTO progression_events
      (user_id, event_id, event_type, activity_mode, source_kind, trust_tier, source_ref,
       battle_wins, boss_wins, activity_completions, pvp_matches, pvp_wins,
       proof_json, occurred_at, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, ?, ?)`,
    [
      userId,
      eventId,
      `browser_weekly_archive_${eventId}`,
      mode,
      `${mode}_settlement`,
      trustTier,
      `browser:${eventId}`,
      activityCompletions,
      JSON.stringify({ runId: `browser:${eventId}`, source: "browser_fate_chronicle_real_backend_smoke" }),
      occurredAt,
      occurredAt
    ]
  );
}

async function openChronicle(page) {
  await page.evaluate(() => {
    for (const id of ["save-slots-modal", "auth-modal", "generic-confirm-modal", "save-conflict-modal"]) {
      document.getElementById(id)?.classList.remove("active");
    }
  });
  const chronicleScreen = page.locator("#fate-chronicle-screen.active");
  if (await chronicleScreen.count()) {
    await chronicleScreen.locator('[data-fate-chronicle-action="return-menu"]').click();
    await page.waitForSelector("#main-menu.active", { timeout: 10000 });
  }
  await page.locator('#main-menu.active button[data-boot-action="open-chronicle"]').click();
  await page.waitForSelector("#fate-chronicle-screen.active .fate-chronicle-shell", { timeout: 20000 });
  await page.waitForFunction(
    () => {
      const view = window.game?.fateChronicleView;
      const model = view?.getModel?.();
      return view?.phase === "ready" && !!model?.rotation?.rotationId;
    },
    null,
    { timeout: 20000 }
  );
  return readChronicle(page);
}

async function readChronicle(page) {
  return page.evaluate(() => {
    const view = window.game?.fateChronicleView;
    const model = view?.getModel?.() || {};
    const panel = view?.runPanel;
    const root = document.querySelector("#fate-chronicle-screen.active") || document.getElementById("fate-chronicle-screen");
    const foundationButton = root?.querySelector('[data-fate-chronicle-action="claim-foundation"]');
    const archiveWarning = root?.querySelector('[data-fate-chronicle-state="archive-warning"]');
    const notice = root?.querySelector('[data-fate-chronicle-state="notice"]');
    return {
      phase: view?.phase || "",
      rotationId: model?.rotation?.rotationId || "",
      chapters: (model?.chapters || []).map(chapter => ({
        chapterId: chapter.chapterId,
        unlocked: chapter.unlocked,
        completed: chapter.completed,
        dualCompleted: chapter.dualCompleted,
        vowCount: chapter.vows?.length || 0
      })),
      credentialCount: Number(model?.credentialCount || 0),
      voucherCount: model?.vouchers?.length || 0,
      voucherStates: (model?.vouchers || []).map(voucher => ({
        id: voucher.id,
        completed: voucher.completed === true
      })),
      activeRunId: model?.activeRunId || "",
      foundationClaimable: model?.foundationClaimable === true,
      foundationClaimed: model?.foundationClaimed === true,
      foundationCycleId: model?.foundationCycleId || "",
      foundationRewardAmount: Number(model?.foundationRewardAmount || 0),
      foundationButtonText: foundationButton?.textContent?.replace(/\s+/g, " ").trim() || "",
      foundationButtonDisabled: foundationButton?.disabled === true,
      foundationButtonState: foundationButton?.getAttribute("data-fate-chronicle-foundation-claim") || "",
      archiveWarningText: archiveWarning?.textContent?.replace(/\s+/g, " ").trim() || "",
      archiveWarningCount: root?.querySelectorAll('[data-fate-chronicle-state="archive-warning"]').length || 0,
      noticeText: notice?.textContent?.replace(/\s+/g, " ").trim() || "",
      milestoneStates: (model?.rewardMilestones || []).map(entry => ({
        milestoneId: entry.milestoneId,
        claimable: entry.claimable,
        claimed: entry.claimed
      })),
      projection: panel?.getCurrentProjection?.() || null,
      runStatus: panel?.getStatus?.() || "",
      busy: panel?.isBusy?.() || false,
      text: root?.textContent?.replace(/\s+/g, " ").trim() || "",
      chapterCardCount: root?.querySelectorAll("[data-fate-chronicle-chapter]").length || 0,
      vowButtonCount: root?.querySelectorAll(".fate-chronicle-vow-btn").length || 0,
      voucherCardCount: root?.querySelectorAll("[data-fate-chronicle-voucher]").length || 0
    };
  });
}

function chooseDecision(projection, { preferredBranchId = "" } = {}) {
  if (!projection) return null;
  if (projection.phase === "route") {
    const choices = [...(projection.route?.choices || [])];
    const preferred = preferredBranchId
      ? choices.find(choice => choice.chapterBranch?.branchId === preferredBranchId)
      : null;
    const choice = preferred || choices.sort((left, right) => (
      Number(left.routeContract?.difficultyRating || 0) - Number(right.routeContract?.difficultyRating || 0)
    )).at(-1);
    return choice ? {
      selector: `[data-fate-chronicle-action="authoritative-select-node"][data-node-id="${cssValue(choice.nodeId)}"]`
    } : null;
  }
  if (projection.phase === "reward") {
    const choices = Array.isArray(projection.reward?.choices) ? projection.reward.choices : [];
    const hp = Number(projection.player?.hp || 0);
    const maxHp = Math.max(1, Number(projection.player?.maxHp || 1));
    const stage = Number(projection.route?.stage || 0);
    const preferredKind = hp / maxHp < 0.35
      ? "heal"
      : stage === 1
        ? "upgrade_card"
        : stage === 2
          ? "remove_card"
          : "card";
    const choice = choices.find(entry => entry.kind === preferredKind)
      || choices.find(entry => entry.kind === "card")
      || choices[0];
    return choice ? {
      selector: `[data-fate-chronicle-action="authoritative-choose-reward"][data-reward-id="${cssValue(choice.rewardId)}"]`,
      rewardKind: choice.kind,
      targetCardInstanceId: choice.targetCardInstanceId || ""
    } : null;
  }
  if (projection.phase !== "battle") return null;
  const incoming = Number(projection.battle?.enemy?.intent?.amount || 0);
  const playerBlock = Number(projection.player?.block || 0);
  const energy = Number(projection.player?.energy || 0);
  const blockCards = new Set(["guard", "iron_mandate", "ember_riposte", "mirror_breath", "warding_stride"]);
  const damageCards = new Set(["strike", "sky_pierce", "life_siphon", "fracture", "ember_riposte", "severing_flow", "archive_surge", "sealbreaker"]);
  const tactic = projection.battle?.tactic;
  const requirements = Array.isArray(tactic?.requirements) ? tactic.requirements : [];
  const blockRequirement = requirements.find(requirement => requirement.metric === "blockGained");
  const damageRequirement = requirements.find(requirement => requirement.metric === "damageDealt");
  const needsBlock = blockRequirement && !blockRequirement.met;
  const needsDamage = damageRequirement && !damageRequirement.met;
  const effectiveIncoming = Math.max(
    0,
    incoming - (tactic?.completed ? Number(tactic.effects?.damageReduction || 0) : 0)
  );
  const cards = [...(projection.player?.hand || [])].sort((left, right) => {
    const leftBlocks = blockCards.has(left.cardId) ? 1 : 0;
    const rightBlocks = blockCards.has(right.cardId) ? 1 : 0;
    const leftDamages = damageCards.has(left.cardId) ? 1 : 0;
    const rightDamages = damageCards.has(right.cardId) ? 1 : 0;
    const tacticOrder = needsBlock
      ? rightBlocks - leftBlocks
      : needsDamage
        ? rightDamages - leftDamages
        : 0;
    const defenseOrder = effectiveIncoming > playerBlock ? rightBlocks - leftBlocks : leftBlocks - rightBlocks;
    return tacticOrder || defenseOrder || Number(right.cost || 0) - Number(left.cost || 0)
      || String(left.instanceId).localeCompare(String(right.instanceId));
  });
  const card = cards.find(entry => Number(entry.cost || 0) <= energy);
  return {
    selector: card
      ? `[data-fate-chronicle-action="authoritative-play-card"][data-card-instance-id="${cssValue(card.instanceId)}"]`
      : '[data-fate-chronicle-action="authoritative-end-turn"]'
  };
}

async function waitForRunChange(page, before) {
  await page.waitForFunction(
    expected => {
      const panel = window.game?.fateChronicleView?.runPanel;
      const projection = panel?.getCurrentProjection?.();
      return projection?.runId === expected.runId
        && Number(projection?.version) > Number(expected.version)
        && !panel?.isBusy?.();
    },
    { runId: before.runId, version: before.version },
    { timeout: 15000 }
  );
  return readChronicle(page);
}

async function driveCurrentRun(page, { preferredBranchId = "" } = {}) {
  let state = await readChronicle(page);
  let actions = 0;
  const rewardKinds = [];
  const rewardUi = [];
  const routeContractPhases = { battle: null, reward: null, perilousBattle: null, perilousReward: null };
  const branchPhases = { decision: null, battle: null, reward: null, terminal: null };
  while (!new Set(["completed", "defeated", "abandoned"]).has(state.projection?.phase) && actions < 256) {
    assertNoPrivateBranchFields(state.projection, `projection step ${actions}`);
    if (state.projection?.phase === "route"
      && state.projection?.route?.chapterBranchDecision
      && !branchPhases.decision) {
      const options = state.projection?.route?.choices?.map(choice => choice.chapterBranch).filter(Boolean) || [];
      options.forEach((branch, index) => assertPublicBranch(branch, `branch option ${index}`));
      branchPhases.decision = {
        decision: state.projection.route.chapterBranchDecision,
        options,
        text: state.text,
      };
      await safeAuditScreenshot(
        page,
        path.join(outDir, "fate-chronicle-branch-choice.png"),
        "browser_fate_chronicle_real_backend_smoke",
        { timeout: 9000 }
      );
    }
    if (state.projection?.phase === "battle" && !routeContractPhases.battle) {
      const visibility = await page.locator('[data-authoritative-phase="battle"]').evaluate(element => {
        const root = element.closest('#fate-chronicle-screen');
        const rootRect = root?.getBoundingClientRect();
        const phaseRect = element.getBoundingClientRect();
        return {
          rootTop: rootRect?.top ?? 0,
          rootHeight: rootRect?.height ?? 0,
          phaseTop: phaseRect.top,
          phaseHeight: phaseRect.height,
          scrollTop: root?.scrollTop ?? 0,
          activePhase: document.activeElement?.getAttribute('data-authoritative-phase') || '',
        };
      });
      routeContractPhases.battle = {
        contract: state.projection?.battle?.routeContract || null,
        text: state.text,
        visibility
      };
      await safeAuditScreenshot(
        page,
        path.join(outDir, "fate-chronicle-route-battle.png"),
        "browser_fate_chronicle_real_backend_smoke",
        { timeout: 9000 }
      );
    }
    if (state.projection?.phase === "battle"
      && state.projection?.route?.chapterBranch
      && !branchPhases.battle) {
      assertPublicBranch(state.projection.route.chapterBranch, "battle route chapterBranch");
      branchPhases.battle = {
        branch: state.projection.route.chapterBranch,
        text: state.text,
      };
      await safeAuditScreenshot(
        page,
        path.join(outDir, "branch-resolved.png"),
        "browser_fate_chronicle_real_backend_smoke",
        { timeout: 9000 }
      );
    }
    if (state.projection?.phase === "battle"
      && state.projection?.battle?.routeContract?.contractId === "perilous"
      && !routeContractPhases.perilousBattle) {
      routeContractPhases.perilousBattle = {
        contract: state.projection.battle.routeContract,
        text: state.text
      };
      await safeAuditScreenshot(
        page,
        path.join(outDir, "fate-chronicle-perilous-battle.png"),
        "browser_fate_chronicle_real_backend_smoke",
        { timeout: 9000 }
      );
    }
    if (state.projection?.phase === "reward" && !routeContractPhases.reward) {
      routeContractPhases.reward = {
        contract: state.projection?.reward?.routeContract || null,
        text: state.text
      };
    }
    if (state.projection?.phase === "reward"
      && state.projection?.route?.chapterBranch
      && !branchPhases.reward) {
      assertPublicBranch(state.projection.route.chapterBranch, "reward route chapterBranch");
      branchPhases.reward = {
        branch: state.projection.route.chapterBranch,
        text: state.text,
      };
    }
    if (state.projection?.phase === "reward"
      && state.projection?.reward?.routeContract?.contractId === "perilous"
      && !routeContractPhases.perilousReward) {
      routeContractPhases.perilousReward = {
        contract: state.projection.reward.routeContract,
        choiceCount: state.projection?.reward?.choices?.length || 0,
        text: state.text
      };
      await safeAuditScreenshot(
        page,
        path.join(outDir, "fate-chronicle-perilous-reward.png"),
        "browser_fate_chronicle_real_backend_smoke",
        { timeout: 9000 }
      );
    }
    const decision = chooseDecision(state.projection, { preferredBranchId });
    if (!decision) throw new Error(`fate chronicle has no playable command: ${JSON.stringify(state)}`);
    const before = { runId: state.projection.runId, version: state.projection.version };
    const target = page.locator(decision.selector).first();
    await target.waitFor({ state: "visible", timeout: 10000 });
    await target.scrollIntoViewIfNeeded();
    if (decision.rewardKind) {
      const firstOfKind = !rewardKinds.includes(decision.rewardKind);
      rewardKinds.push(decision.rewardKind);
      rewardUi.push(await target.evaluate(element => ({
        text: element.textContent?.replace(/\s+/g, " ").trim() || "",
        rewardKind: element.getAttribute("data-reward-kind") || "",
        targetCardInstanceId: element.getAttribute("data-target-card-instance-id") || ""
      })));
      if (firstOfKind && ["upgrade_card", "remove_card"].includes(decision.rewardKind)) {
        const screenshotName = decision.rewardKind === "upgrade_card"
          ? "fate-chronicle-reward-upgrade.png"
          : "fate-chronicle-reward-trim.png";
        await safeAuditScreenshot(
          page,
          path.join(outDir, screenshotName),
          "browser_fate_chronicle_real_backend_smoke",
          { timeout: 9000 }
        );
      }
    }
    if (state.projection?.phase === "route") {
      await target.evaluate(element => {
        const root = element.closest('#fate-chronicle-screen');
        element.focus({ preventScroll: true });
        if (root) root.scrollTop = 0;
        element.click();
      });
    } else {
      await target.click({ force: true });
    }
    state = await waitForRunChange(page, before);
    actions += 1;
  }
  assertNoPrivateBranchFields(state.projection, "terminal projection");
  if (state.projection?.summary?.chapterBranchResolution) {
    assertPublicBranch(state.projection.summary.chapterBranchResolution, "terminal summary chapterBranchResolution");
    assertPublicBranch(state.projection.route?.chapterBranch, "terminal route chapterBranch");
    branchPhases.terminal = {
      branch: state.projection.route.chapterBranch,
      resolution: state.projection.summary.chapterBranchResolution,
      text: state.text,
    };
  }
  return { state, actions, rewardKinds, rewardUi, routeContractPhases, branchPhases };
}

async function readLayout(page) {
  return page.evaluate(() => {
    const root = document.querySelector("#fate-chronicle-screen.active") || document.getElementById("fate-chronicle-screen");
    const visibleButtons = [...root.querySelectorAll("button")].filter(button => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const escapedMilestoneButtons = [...root.querySelectorAll(".fate-chronicle-milestone-card button")]
      .map(button => {
        const card = button.closest(".fate-chronicle-milestone-card");
        const buttonRect = button.getBoundingClientRect();
        const cardRect = card?.getBoundingClientRect();
        return {
          text: button.textContent.trim().slice(0, 40),
          buttonLeft: buttonRect.left,
          buttonRight: buttonRect.right,
          cardLeft: cardRect?.left ?? 0,
          cardRight: cardRect?.right ?? 0
        };
      })
      .filter(entry => entry.buttonLeft < entry.cardLeft - 1 || entry.buttonRight > entry.cardRight + 1);
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      escapedMilestoneButtons,
      undersized: visibleButtons.map(button => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent.trim().slice(0, 40), width: rect.width, height: rect.height };
      }).filter(entry => entry.width < 40 || entry.height < 40)
    };
  });
}

try {
  removeDbFiles();
  port = await reservePort(requestedPort);
  apiUrl = `http://127.0.0.1:${port}`;
  backend = startBackend();
  const health = await waitForHealth();
  add(
    "real backend boots fate chronicle schema V12",
    health?.schema?.version === 12 && health?.schema?.currentMigrationId === "0012_world_rift_campaign_directives",
    JSON.stringify(health?.schema || {})
  );

  const launchArgs = [];
  if (new URL(appUrl).protocol === "https:") {
    launchArgs.push(
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults"
    );
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args: launchArgs
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(targetApiUrl => {
    localStorage.setItem("theDefierDebug", "true");
    localStorage.setItem("theDefierServerConfig", JSON.stringify({ baseUrl: targetApiUrl }));
    window.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.dataset.fateChronicleSmoke = "hide-save-slot-modal";
      style.textContent = "#save-slots-modal { display: none !important; pointer-events: none !important; }";
      document.head.appendChild(style);
    });
  }, apiUrl);
  const page = await context.newPage();
  page.on("console", message => {
    if (message.type() === "error") recordConsoleError(message.text());
  });
  page.on("pageerror", error => recordConsoleError(error));

  await prepareLoggedInPage(page);
  const initial = await openChronicle(page);
  add(
    "fate chronicle renders three chapters nine oaths and five archive proofs",
    initial.chapterCardCount === 3
      && initial.vowButtonCount === 9
      && initial.voucherCount === 5
      && initial.voucherCardCount === 5
      && initial.chapters[0]?.unlocked === true
      && initial.chapters[1]?.unlocked === false
      && /失败不扣次数/.test(initial.text)
      && /任意两类权威凭证/.test(initial.text),
    JSON.stringify(initial)
  );
  const desktopLayout = await readLayout(page);
  add(
    "real fate chronicle desktop milestone controls stay within cards",
    desktopLayout.documentScrollWidth === desktopLayout.viewportWidth
      && desktopLayout.escapedMilestoneButtons.length === 0,
    JSON.stringify(desktopLayout)
  );
  await safeAuditScreenshot(page, path.join(outDir, "fate-chronicle-before.png"), "browser_fate_chronicle_real_backend_smoke", { timeout: 9000 });

  await page.locator('[data-fate-chronicle-action="select-vow"][data-chapter-id="chapter-1"][data-vow-id="proof"]').click({ force: true });
  await page.waitForFunction(
    () => {
      const selected = document.querySelector('[data-fate-chronicle-selected]');
      return selected?.getAttribute('data-fate-chronicle-selected') === 'chapter-1:proof';
    },
    null,
    { timeout: 10000 }
  );
  await page.locator('[data-fate-chronicle-action="start"]').click({ force: true });
  await page.waitForFunction(
    () => {
      const panel = window.game?.fateChronicleView?.runPanel;
      const projection = panel?.getCurrentProjection?.();
      return projection?.mode === "fate_chronicle" && projection?.phase === "route" && !panel?.isBusy?.();
    },
    null,
    { timeout: 20000 }
  );
  const started = await readChronicle(page);
  const runId = started.projection?.runId || "";
  add(
    "chapter-1 proof oath starts a server-authoritative fate run",
    !!runId
      && started.activeRunId === runId
      && started.projection?.mode === "fate_chronicle"
      && started.projection?.scenario?.scenarioId === "chronicle-ember-proof",
    JSON.stringify({ runId, activeRunId: started.activeRunId, projection: started.projection })
  );
  const startedProjectionJson = JSON.stringify(started.projection || null);
  const startedContracts = started.projection?.route?.choices?.map(choice => choice.routeContract) || [];
  add(
    "fate route renders two readable v7 contracts without private coefficients",
    started.projection?.contentVersion === "authoritative-trials-v7"
      && Number(started.projection?.route?.contractVersion) === 1
      && startedContracts.length === 2
      && startedContracts.every(contract => Number(contract?.version) === 1
        && !!contract?.label
        && !!contract?.riskLabel
        && !!contract?.difficultySummary
        && !!contract?.rewardSummary
        && started.text.includes(contract.label)
        && started.text.includes(contract.difficultySummary)
        && started.text.includes(contract.rewardSummary))
      && !/enemyAdjustments|rewardAdjustments/.test(startedProjectionJson)
      && !/contractId|scenarioMultiplierBps/.test(started.text),
    JSON.stringify({ contracts: startedContracts, text: started.text })
  );
  await safeAuditScreenshot(page, path.join(outDir, "fate-chronicle-route.png"), "browser_fate_chronicle_real_backend_smoke", { timeout: 9000 });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!window.game && !!window.__THE_DEFIER_SERVICES__?.BackendClient, null, { timeout: 30000 });
  const resumed = await openChronicle(page);
  add(
    "full browser reload resumes the same fate chronicle run",
    resumed.activeRunId === runId && resumed.projection?.runId === runId && resumed.runStatus === "active",
    JSON.stringify({ runId, activeRunId: resumed.activeRunId, projection: resumed.projection })
  );

  const driven = await driveCurrentRun(page, { preferredBranchId: "proof_rush" });
  add(
    "real fate chronicle UI completes the chapter-1 proof oath",
    driven.state.projection?.phase === "completed" && driven.actions > 0 && driven.actions < 256,
    JSON.stringify({ actions: driven.actions, projection: driven.state.projection })
  );
  add(
    "proof route captures two public branch options before lock-in",
    Number(driven.branchPhases.decision?.decision?.version) === 1
      && Number(driven.branchPhases.decision?.decision?.triggerStage) === 2
      && driven.branchPhases.decision?.options?.length === 2
      && driven.branchPhases.decision.options.every(branch => branch && branch.branchId && branch.counterplay && branch.buildFocus && branch.consequenceSummary)
      && /根据当前构筑证据锁定后续命途|选择依据|构筑方向|后续变化/.test(driven.branchPhases.decision?.text || "")
      && !/rewardCardPool|rewardProfile|futureStages|enemyAdjustments|rewardAdjustments|seed/.test(JSON.stringify(driven.branchPhases.decision)),
    JSON.stringify(driven.branchPhases.decision)
  );
  add(
    "selected proof branch stays visible through battle reward and terminal projections",
    driven.branchPhases.battle?.branch?.branchId === "proof_rush"
      && driven.branchPhases.reward?.branch?.branchId === "proof_rush"
      && driven.branchPhases.terminal?.branch?.branchId === "proof_rush"
      && driven.branchPhases.terminal?.resolution?.branchId === "proof_rush"
      && [driven.branchPhases.battle, driven.branchPhases.reward, driven.branchPhases.terminal].every(entry =>
        /选择依据/.test(entry?.text || "")
        && /构筑方向/.test(entry?.text || "")
        && /后续变化/.test(entry?.text || "")
      )
      && !/rewardCardPool|rewardProfile|futureStages|enemyAdjustments|rewardAdjustments|seed/.test(JSON.stringify(driven.branchPhases)),
    JSON.stringify(driven.branchPhases)
  );
  add(
    "fate battle and reward retain the server-selected route contract",
    !!driven.routeContractPhases.battle?.contract?.label
      && !!driven.routeContractPhases.reward?.contract?.label
      && /已选路线合同/.test(driven.routeContractPhases.battle.text)
      && /已选路线合同/.test(driven.routeContractPhases.reward.text)
      && driven.routeContractPhases.battle.text.includes(driven.routeContractPhases.battle.contract.difficultySummary)
      && driven.routeContractPhases.reward.text.includes(driven.routeContractPhases.reward.contract.rewardSummary)
      && !/enemyAdjustments|rewardAdjustments/.test(JSON.stringify(driven.routeContractPhases)),
    JSON.stringify(driven.routeContractPhases)
  );
  add(
    "fate route transition reveals the battle phase instead of leaving a blank viewport",
    Number(driven.routeContractPhases.battle?.visibility?.phaseHeight) > 0
      && Number(driven.routeContractPhases.battle?.visibility?.scrollTop) > 0
      && driven.routeContractPhases.battle?.visibility?.activePhase === "battle"
      && Number(driven.routeContractPhases.battle?.visibility?.phaseTop) >= Number(driven.routeContractPhases.battle?.visibility?.rootTop) - 1
      && Number(driven.routeContractPhases.battle?.visibility?.phaseTop)
        <= Number(driven.routeContractPhases.battle?.visibility?.rootTop)
          + Math.max(80, Number(driven.routeContractPhases.battle?.visibility?.rootHeight) * 0.25),
    JSON.stringify(driven.routeContractPhases.battle?.visibility || null)
  );
  add(
    "fate real browser path exercises perilous pressure and premium rewards",
    driven.routeContractPhases.perilousBattle?.contract?.riskTier === "high"
      && driven.routeContractPhases.perilousBattle?.contract?.rewardTier === "premium"
      && driven.routeContractPhases.perilousBattle.text.includes(driven.routeContractPhases.perilousBattle.contract.difficultySummary)
      && driven.routeContractPhases.perilousReward?.choiceCount >= 4
      && driven.routeContractPhases.perilousReward.text.includes(driven.routeContractPhases.perilousReward.contract.rewardSummary)
      && !/enemyAdjustments|rewardAdjustments/.test(JSON.stringify({
        battle: driven.routeContractPhases.perilousBattle,
        reward: driven.routeContractPhases.perilousReward
      })),
    JSON.stringify({
      battle: driven.routeContractPhases.perilousBattle,
      reward: driven.routeContractPhases.perilousReward
    })
  );
  add(
    "fate terminal projection carries additive route score and per-stage resolution",
    Number(driven.state.projection?.summary?.scoreBreakdown?.finalScore) === Number(driven.state.projection?.summary?.score)
      && Number(driven.state.projection?.summary?.scoreBreakdown?.routeBonus) === Number(driven.state.projection?.summary?.routeResolution?.totalBonus)
      && driven.state.projection?.summary?.routeResolution?.selections?.length === driven.state.projection?.route?.totalStages
      && driven.state.projection?.summary?.chapterBranchResolution?.branchId === "proof_rush",
    JSON.stringify(driven.state.projection?.summary)
  );
  add(
    "fate chronicle real UI executes exact-target upgrade and one legal trim",
    Number(driven.state.projection?.stats?.cardsUpgraded) >= 1
      && Number(driven.state.projection?.stats?.cardsRemoved) === 1
      && Number(driven.state.projection?.summary?.upgradedCards) >= 1
      && Number(driven.state.projection?.summary?.cardsRemoved) === 1
      && driven.rewardKinds.includes("upgrade_card")
      && driven.rewardKinds.includes("remove_card")
      && driven.rewardUi.some(entry => entry?.rewardKind === "upgrade_card"
        && !!entry.targetCardInstanceId
        && /精修卡牌|精修目标|精修这张牌/.test(entry.text))
      && driven.rewardUi.some(entry => entry?.rewardKind === "remove_card"
        && !!entry.targetCardInstanceId
        && /裁去卡牌|裁牌目标|裁去这张牌/.test(entry.text)),
    JSON.stringify({
      stats: driven.state.projection?.stats,
      summary: driven.state.projection?.summary,
      rewardKinds: driven.rewardKinds,
      rewardUi: driven.rewardUi
    })
  );
  if (driven.state.projection?.phase !== "completed") {
    throw new Error(`fate chronicle run did not complete: ${JSON.stringify(driven)}`);
  }
  const completedRunCopy = await page.locator('[data-fate-chronicle-state="run"]').innerText();
  add(
    "completed fate chronicle UI preserves the deck-crafting payoff",
    /终局牌组 9 张/.test(completedRunCopy)
      && /精修 1 张/.test(completedRunCopy)
      && /裁牌 1 张/.test(completedRunCopy),
    completedRunCopy
  );
  add(
    "completed fate chronicle UI renders route score history without internal route fields",
    /路线分拆解/.test(completedRunCopy)
      && /路线总分/.test(completedRunCopy)
      && /路线留痕/.test(completedRunCopy)
      && !/contractId|enemyAdjustments|rewardAdjustments|scenarioMultiplierBps/.test(completedRunCopy),
    completedRunCopy
  );
  await safeAuditScreenshot(
    page,
    path.join(outDir, "fate-chronicle-completed.png"),
    "browser_fate_chronicle_real_backend_smoke",
    { timeout: 9000 }
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const completedMobileLayout = await readLayout(page);
  const completedMobileCopy = await page.locator('[data-fate-chronicle-state="run"]').innerText();
  add(
    "completed fate route resolution remains readable at 390px",
    completedMobileLayout.documentScrollWidth === 390
      && completedMobileLayout.rootScrollWidth === completedMobileLayout.rootClientWidth
      && completedMobileLayout.undersized.length === 0
      && /路线分拆解/.test(completedMobileCopy)
      && /路线留痕/.test(completedMobileCopy),
    JSON.stringify({ layout: completedMobileLayout, copy: completedMobileCopy })
  );
  await safeAuditScreenshot(
    page,
    path.join(outDir, "fate-chronicle-route-completed-mobile.png"),
    "browser_fate_chronicle_real_backend_smoke",
    { timeout: 9000 }
  );
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.evaluate(() => {
    const panel = window.game?.fateChronicleView?.runPanel;
    const settle = panel.settleRun.bind(panel);
    window.__fateChronicleSettlementResult = null;
    panel.settleRun = async (...args) => {
      const result = await settle(...args);
      window.__fateChronicleSettlementResult = result;
      return result;
    };
  });
  await page.locator('[data-fate-chronicle-action="authoritative-settle"]').click({ force: true });
  await page.waitForFunction(() => window.__fateChronicleSettlementResult !== null, null, { timeout: 25000 });
  const settlementResult = await page.evaluate(() => window.__fateChronicleSettlementResult);
  add(
    "fate chronicle settlement returns a replay receipt and successful projection",
    settlementResult?.success === true
      && settlementResult?.receipt?.integrity?.fullReplayPassed === true
      && settlementResult?.chronicleProjection?.success === true,
    JSON.stringify(settlementResult)
  );
  if (settlementResult?.chronicleProjection?.success !== true) {
    throw new Error(`fate chronicle projection failed: ${JSON.stringify(settlementResult)}`);
  }
  await page.waitForFunction(
    () => {
      const view = window.game?.fateChronicleView;
      const model = view?.getModel?.();
      return model?.chapters?.[0]?.completed === true && !view?.runPanel?.isBusy?.();
    },
    null,
    { timeout: 25000 }
  );
  const projected = await readChronicle(page);
  const chapterMilestone = projected.milestoneStates.find(entry => entry.milestoneId === "chapter-1-clear");
  add(
    "settlement projects chapter progress and unlocks the next chapter without consuming failure attempts",
    projected.chapters[0]?.completed === true
      && projected.chapters[1]?.unlocked === true
      && chapterMilestone?.claimable === true
      && projected.credentialCount === 1,
    JSON.stringify(projected)
  );

  await page.locator('[data-fate-chronicle-action="claim-milestone"][data-milestone-id="chapter-1-clear"]').click({ force: true });
  await page.waitForFunction(
    () => window.game?.fateChronicleView?.getModel?.()?.rewardMilestones
      ?.some(entry => entry.milestoneId === "chapter-1-clear" && entry.claimed === true),
    null,
    { timeout: 20000 }
  );
  const claimed = await readChronicle(page);
  add(
    "chapter clear reward claims once as cosmetic-only renown",
    claimed.milestoneStates.some(entry => entry.milestoneId === "chapter-1-clear" && entry.claimed === true),
    JSON.stringify(claimed.milestoneStates)
  );
  await safeAuditScreenshot(page, path.join(outDir, "fate-chronicle-projected.png"), "browser_fate_chronicle_real_backend_smoke", { timeout: 9000 });

  const currentArchiveCycle = buildCycleSnapshotForTime(Date.now());
  await addWeeklyArchiveProof({
    eventId: `browser-world-rift-${unique}`,
    mode: "world_rift",
    occurredAt: currentArchiveCycle.startsAt + 7_000
  });
  await page.locator('[data-fate-chronicle-action="refresh"]').click({ force: true });
  await page.waitForFunction(
    expectedCycleId => {
      const model = window.game?.fateChronicleView?.getModel?.();
      return model?.credentialCount === 2
        && model?.foundationClaimable === true
        && model?.foundationClaimed === false
        && model?.foundationCycleId === expectedCycleId
        && !window.game?.fateChronicleView?.runPanel?.isBusy?.();
    },
    currentArchiveCycle.cycleId,
    { timeout: 20000 }
  );
  const foundationReady = await readChronicle(page);
  add(
    "weekly archive reaches foundation 2/5 and exposes the 120 renown claim CTA",
    foundationReady.credentialCount === 2
      && foundationReady.foundationClaimable === true
      && foundationReady.foundationClaimed === false
      && foundationReady.foundationCycleId === currentArchiveCycle.cycleId
      && foundationReady.foundationRewardAmount === 120
      && foundationReady.foundationButtonDisabled === false
      && foundationReady.foundationButtonState === "claimable"
      && foundationReady.foundationButtonText.includes("120 荣誉")
      && foundationReady.voucherStates.filter(entry => entry.completed).length === 2
      && foundationReady.voucherStates.some(entry => entry.id === "fate_chronicle" && entry.completed)
      && foundationReady.voucherStates.some(entry => entry.id === "world_rift" && entry.completed),
    JSON.stringify(foundationReady)
  );

  const foundationClaimButton = page.locator('[data-fate-chronicle-action="claim-foundation"]');
  await foundationClaimButton.scrollIntoViewIfNeeded();
  await foundationClaimButton.click();
  await page.waitForFunction(
    () => {
      const model = window.game?.fateChronicleView?.getModel?.();
      const button = document.querySelector('#fate-chronicle-screen.active [data-fate-chronicle-action="claim-foundation"]');
      return model?.foundationClaimed === true
        && model?.foundationClaimable === false
        && button?.disabled === true
        && /基础归卷已领取/.test(button?.textContent || "");
    },
    null,
    { timeout: 25000 }
  );
  const foundationClaimed = await readChronicle(page);
  add(
    "real browser foundation CTA grants 120 renown and locks after one claim",
    foundationClaimed.credentialCount === 2
      && foundationClaimed.foundationClaimed === true
      && foundationClaimed.foundationClaimable === false
      && foundationClaimed.foundationButtonDisabled === true
      && foundationClaimed.foundationButtonState === "claimed"
      && foundationClaimed.foundationButtonText.includes("基础归卷已领取"),
    JSON.stringify(foundationClaimed)
  );
  await safeAuditScreenshot(page, path.join(outDir, "fate-chronicle-foundation-claimed.png"), "browser_fate_chronicle_real_backend_smoke", { timeout: 9000 });

  const foundationReplay = await page.evaluate(async () => {
    return await window.game?.fateChronicleView?.claimArchiveFoundation();
  });
  add(
    "second foundation claim replays the existing authoritative receipt without extra renown",
    foundationReplay?.success === true
      && foundationReplay?.claim?.alreadyClaimed === true
      && foundationReplay?.claim?.cycleId === currentArchiveCycle.cycleId
      && Number(foundationReplay?.reward?.amount) === 120
      && Number(foundationReplay?.wallet?.balance) === 150,
    JSON.stringify(foundationReplay)
  );

  const persisted = await dbGet(
    `SELECT
       (SELECT COUNT(*) FROM fate_chronicle_results WHERE user_id = ?) AS chronicle_results,
       (SELECT COUNT(*) FROM fate_chronicle_reward_claims WHERE user_id = ?) AS chronicle_claims,
       (SELECT COUNT(*) FROM progression_events WHERE user_id = ? AND activity_mode = 'fate_chronicle' AND trust_tier = 'server_authoritative') AS chronicle_events,
       (SELECT COUNT(*) FROM progression_events WHERE user_id = ? AND activity_mode = 'world_rift' AND trust_tier = 'server_authoritative' AND activity_completions > 0) AS world_rift_events,
       (SELECT COUNT(*) FROM progression_authoritative_run_receipts WHERE user_id = ? AND activity_mode = 'fate_chronicle') AS chronicle_receipts,
       (SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = 'renown') AS renown_balance,
       (SELECT lifetime_earned FROM progression_economy_balances WHERE user_id = ? AND currency = 'renown') AS renown_earned,
       (SELECT COUNT(*) FROM weekly_archive_reward_claims WHERE user_id = ? AND cycle_id = ?) AS weekly_claim_rows,
       (SELECT claim_id FROM weekly_archive_reward_claims WHERE user_id = ? AND cycle_id = ?) AS weekly_claim_id,
       (SELECT amount FROM weekly_archive_reward_claims WHERE user_id = ? AND cycle_id = ?) AS weekly_claim_amount,
       (SELECT grade_id FROM weekly_archive_reward_claims WHERE user_id = ? AND cycle_id = ?) AS weekly_claim_grade,
       (SELECT proof_count FROM weekly_archive_reward_claims WHERE user_id = ? AND cycle_id = ?) AS weekly_claim_proof_count,
       (SELECT reward_impact FROM weekly_archive_reward_claims WHERE user_id = ? AND cycle_id = ?) AS weekly_claim_reward_impact,
       (SELECT power_impact FROM weekly_archive_reward_claims WHERE user_id = ? AND cycle_id = ?) AS weekly_claim_power_impact`,
    [
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId, currentArchiveCycle.cycleId,
      userId, currentArchiveCycle.cycleId,
      userId, currentArchiveCycle.cycleId,
      userId, currentArchiveCycle.cycleId,
      userId, currentArchiveCycle.cycleId,
      userId, currentArchiveCycle.cycleId
    ]
  );
  add(
    "database persists one authoritative weekly foundation claim while crediting renown exactly once",
    Number(persisted?.chronicle_results) === 1
      && Number(persisted?.chronicle_claims) === 1
      && Number(persisted?.chronicle_events) === 1
      && Number(persisted?.world_rift_events) === 1
      && Number(persisted?.chronicle_receipts) === 1
      && Number(persisted?.renown_balance) === 150
      && Number(persisted?.renown_earned) === 150
      && Number(persisted?.weekly_claim_rows) === 1
      && persisted?.weekly_claim_id === foundationReplay?.claim?.claimId
      && Number(persisted?.weekly_claim_amount) === 120
      && persisted?.weekly_claim_grade === "foundation"
      && Number(persisted?.weekly_claim_proof_count) === 2
      && persisted?.weekly_claim_reward_impact === "cosmetic_only"
      && [null, "none"].includes(persisted?.weekly_claim_power_impact ?? null),
    JSON.stringify(persisted)
  );

  await page.setViewportSize({ width: 390, height: 844 });
  allowExpectedArchive503ConsoleError = true;
  await page.route(`${apiUrl}/api/weekly-archive/current`, async route => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        reason: "weekly_archive_browser_failure",
        message: "三证归卷当前状态读取失败"
      })
    });
  });
  const mobileFailure = await openChronicle(page);
  add(
    "mobile archive read failure clears stale 2/5 cache and disables foundation claim controls",
    mobileFailure.credentialCount === 0
      && mobileFailure.foundationClaimable === false
      && mobileFailure.foundationClaimed === false
      && mobileFailure.foundationButtonDisabled === true
      && mobileFailure.foundationButtonState === "locked"
      && mobileFailure.foundationButtonText === "需先达成 2/5"
      && mobileFailure.voucherStates.every(entry => entry.completed === false)
      && mobileFailure.archiveWarningCount === 1
      && mobileFailure.noticeText !== "三证归卷当前状态读取失败"
      && (mobileFailure.text.match(/三证归卷当前状态读取失败/g) || []).length === 1
      && /三证归卷当前状态读取失败/.test(mobileFailure.archiveWarningText),
    JSON.stringify(mobileFailure)
  );
  const mobileLayout = await readLayout(page);
  add(
    "real fate chronicle mobile view has no horizontal overflow",
    mobileLayout.documentScrollWidth === 390 && mobileLayout.rootScrollWidth === mobileLayout.rootClientWidth,
    JSON.stringify(mobileLayout)
  );
  add(
    "real fate chronicle mobile controls meet touch target",
    mobileLayout.undersized.length === 0,
    JSON.stringify(mobileLayout.undersized)
  );
  await safeAuditScreenshot(page, path.join(outDir, "fate-chronicle-mobile-archive-failure.png"), "browser_fate_chronicle_real_backend_smoke", { timeout: 9000 });
  add("real fate chronicle browser console errors are empty", consoleErrors.length === 0, consoleErrors.join("\n"));
} catch (error) {
  add("fate chronicle real-backend browser runtime", false, error?.stack || error);
} finally {
  if (browser) await browser.close();
  await stopBackend();
  removeDbFiles();
}

const failed = findings.filter(finding => !finding.pass);
const report = {
  url: appUrl,
  apiUrl,
  generatedAt: new Date().toISOString(),
  summary: {
    total: findings.length,
    failed: failed.length,
    consoleErrors
  },
  findings,
  consoleErrors
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0 || consoleErrors.length > 0) process.exit(1);
