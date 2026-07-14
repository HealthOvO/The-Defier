const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'scripts', 'wait-production-api-ready.mjs');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function runHelper(baseUrl, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helperPath, baseUrl], {
      cwd: root,
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function withHealthServer(handler, fn, { onConnection } = {}) {
  const server = http.createServer(handler);
  if (onConnection) {
    server.on('connection', onConnection);
  }
  await listen(server);
  const address = server.address();
  assert(address && typeof address === 'object', 'server should expose an address object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl, server);
  } finally {
    await close(server);
  }
}

async function testRetriesUntilHealthyJsonStatus() {
  let requestCount = 0;
  await withHealthServer((req, res) => {
    if (req.url !== '/api/health') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('missing');
      return;
    }
    requestCount += 1;
    if (requestCount <= 2) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('bad gateway');
      return;
    }
    if (requestCount === 3) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'starting', message: 'warming up sqlite migrations' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'The Defier Backend is running' }));
  }, async (baseUrl) => {
    const result = await runHelper(baseUrl, {
      PROD_API_READY_TIMEOUT_MS: '2000',
      PROD_API_READY_INTERVAL_MS: '25',
    });
    assert.strictEqual(result.code, 0, `helper should succeed once health JSON reports status=ok\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert(requestCount >= 4, `helper should retry through transient 502/starting responses, got ${requestCount} requests`);
    assert.match(result.stdout, /\[prod-ready\] Ready after \d+ms on attempt 4:/, 'helper should report the successful retry attempt');
    assert.match(result.stderr, /Attempt 1 not ready/, 'helper should log intermediate retry diagnostics');
    assert.match(result.stderr, /status="starting"/, 'helper should reject HTTP 200 until health JSON status becomes ok');
  });
}

async function testAbortsHangingResponseWithinBudget() {
  const sockets = new Set();
  await withHealthServer((req, res) => {
    if (req.url !== '/api/health') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"status":"starting","message":"response body intentionally hangs"');
  }, async (baseUrl) => {
    const startedAt = Date.now();
    const result = await runHelper(baseUrl, {
      PROD_API_READY_TIMEOUT_MS: '260',
      PROD_API_READY_INTERVAL_MS: '40',
      PROD_API_READY_PROBE_TIMEOUT_MS: '80',
    });
    const elapsedMs = Date.now() - startedAt;
    assert.notStrictEqual(result.code, 0, 'helper should fail when every probe hangs');
    assert(elapsedMs < 800, `helper should stop within the bounded readiness budget, got ${elapsedMs}ms`);
    assert.match(result.stderr, /probe timed out after 80ms/, 'helper should report the per-probe abort reason for hanging responses');
    assert.match(result.stderr, /\[prod-ready\] Timed out after 260ms/, 'helper should preserve the total readiness deadline');
  }, {
    onConnection: (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    },
  }).finally(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
  });
}

async function testTimesOutWithLastFailure() {
  let requestCount = 0;
  await withHealthServer((req, res) => {
    if (req.url !== '/api/health') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('missing');
      return;
    }
    requestCount += 1;
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('bad gateway');
  }, async (baseUrl) => {
    const result = await runHelper(baseUrl, {
      PROD_API_READY_TIMEOUT_MS: '220',
      PROD_API_READY_INTERVAL_MS: '40',
    });
    assert.notStrictEqual(result.code, 0, 'helper should fail when readiness never reaches status=ok');
    assert(requestCount >= 2, `helper should retry before timing out, got ${requestCount} requests`);
    assert.match(result.stderr, /\[prod-ready\] Timed out after 220ms/, 'helper should expose a bounded timeout');
    assert.match(result.stderr, /Last failure: HTTP 502 returned non-JSON body: bad gateway/, 'helper should preserve the last readiness failure detail');
  });
}

(async () => {
  await testRetriesUntilHealthyJsonStatus();
  await testAbortsHangingResponseWithinBudget();
  await testTimesOutWithLastFailure();
  console.log('sanity_prod_api_readiness_checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
