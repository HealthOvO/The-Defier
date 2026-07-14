#!/usr/bin/env node

const rawBaseUrl = process.argv[2] || process.env.BASE_URL || '';
if (!rawBaseUrl) {
  console.error('Usage: node scripts/wait-production-api-ready.mjs <base-url>');
  process.exit(2);
}

const baseUrl = rawBaseUrl.replace(/\/+$/, '');
const healthUrl = `${baseUrl}/api/health`;
const timeoutMs = Number(process.env.PROD_API_READY_TIMEOUT_MS || 30000);
const intervalMs = Number(process.env.PROD_API_READY_INTERVAL_MS || 1000);
const configuredProbeTimeoutMs = process.env.PROD_API_READY_PROBE_TIMEOUT_MS === undefined
  ? null
  : Number(process.env.PROD_API_READY_PROBE_TIMEOUT_MS);

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(`[prod-ready] Invalid PROD_API_READY_TIMEOUT_MS: ${process.env.PROD_API_READY_TIMEOUT_MS}`);
  process.exit(2);
}

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  console.error(`[prod-ready] Invalid PROD_API_READY_INTERVAL_MS: ${process.env.PROD_API_READY_INTERVAL_MS}`);
  process.exit(2);
}

if (configuredProbeTimeoutMs !== null && (!Number.isFinite(configuredProbeTimeoutMs) || configuredProbeTimeoutMs <= 0)) {
  console.error(`[prod-ready] Invalid PROD_API_READY_PROBE_TIMEOUT_MS: ${process.env.PROD_API_READY_PROBE_TIMEOUT_MS}`);
  process.exit(2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizePayload(payload) {
  if (payload === null || payload === undefined) {
    return String(payload);
  }
  if (typeof payload === 'string') {
    return payload.slice(0, 200);
  }
  try {
    return JSON.stringify(payload).slice(0, 400);
  } catch (error) {
    return `[unserializable payload: ${error.message}]`;
  }
}

function resolveProbeTimeoutMs(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 1;
  }
  if (configuredProbeTimeoutMs === null) {
    return remainingMs;
  }
  return Math.min(remainingMs, configuredProbeTimeoutMs);
}

async function probeHealth(probeTimeoutMs) {
  const controller = new AbortController();
  const timeoutError = new Error(`probe timed out after ${probeTimeoutMs}ms`);
  const timeoutId = setTimeout(() => {
    controller.abort(timeoutError);
  }, probeTimeoutMs);
  try {
    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    const bodyText = await response.text();
    let payload = null;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch (error) {
      return {
        ready: false,
        detail: `HTTP ${response.status} returned non-JSON body: ${bodyText.slice(0, 200)}`,
      };
    }
    if (!response.ok) {
      return {
        ready: false,
        detail: `HTTP ${response.status} returned ${summarizePayload(payload)}`,
      };
    }
    if (payload?.status !== 'ok') {
      return {
        ready: false,
        detail: `HTTP ${response.status} returned status=${JSON.stringify(payload?.status)} payload=${summarizePayload(payload)}`,
      };
    }
    return {
      ready: true,
      detail: `HTTP ${response.status} status=ok payload=${summarizePayload(payload)}`,
    };
  } catch (error) {
    const detail = error === timeoutError || error?.message === timeoutError.message
      ? timeoutError.message
      : `request failed: ${error.message}`;
    return {
      ready: false,
      detail,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

const startTime = Date.now();
const deadline = startTime + timeoutMs;
let attempt = 0;
let lastFailure = 'no probe attempts executed';

while (true) {
  const probeStartTime = Date.now();
  const remainingMs = Math.max(0, deadline - probeStartTime);
  if (remainingMs <= 0) {
    break;
  }
  const probeTimeoutMs = resolveProbeTimeoutMs(remainingMs);
  attempt += 1;
  const result = await probeHealth(probeTimeoutMs);
  if (result.ready) {
    const elapsedMs = Date.now() - startTime;
    console.log(`[prod-ready] Ready after ${elapsedMs}ms on attempt ${attempt}: ${result.detail}`);
    process.exit(0);
  }

  lastFailure = result.detail;
  const now = Date.now();
  if (now >= deadline) {
    break;
  }

  const remainingAfterProbeMs = Math.max(0, deadline - now);
  console.error(
    `[prod-ready] Attempt ${attempt} not ready after ${now - startTime}ms: ${result.detail}. `
    + `Probe budget ${probeTimeoutMs}ms. Retrying in ${Math.min(intervalMs, remainingAfterProbeMs)}ms.`,
  );
  await sleep(Math.min(intervalMs, remainingAfterProbeMs));
}

console.error(`[prod-ready] Timed out after ${timeoutMs}ms waiting for ${healthUrl}. Last failure: ${lastFailure}`);
process.exit(1);
