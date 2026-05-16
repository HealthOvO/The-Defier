const assert = require('assert');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.BACKEND_SECURITY_TEST_PORT || 9011);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = 'integration-jwt-secret-32-characters';
const HMAC_SECRET = 'integration-hmac-secret-32-characters';

function signPayload(dataStr, salt, secret = HMAC_SECRET) {
  return crypto.createHmac('sha256', secret)
    .update('v1', 'utf8')
    .update('\n', 'utf8')
    .update(String(salt), 'utf8')
    .update('\n', 'utf8')
    .update(String(dataStr), 'utf8')
    .digest('hex');
}

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (error) {
    payload = null;
  }
  return { status: res.status, ok: res.ok, payload };
}

async function waitForHealth() {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await request('/health');
      if (res.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError || new Error('backend health check timed out');
}

function startServer(env) {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), JWT_SECRET, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk.toString());
  child.stderr.on('data', chunk => output += chunk.toString());
  return { child, getOutput: () => output };
}

async function stopServer(server) {
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

async function withServer(env, fn) {
  const server = startServer(env);
  try {
    await waitForHealth();
    await fn();
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
  }
}

async function assertServerStartupFails(env, expectedText) {
  const server = startServer(env);
  const exitCode = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 3000);
    server.child.once('exit', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (exitCode === null) {
    await stopServer(server);
    throw new Error('server should fail to start but kept running');
  }
  assert.notStrictEqual(exitCode, 0, 'invalid security config should fail server startup');
  assert(server.getOutput().includes(expectedText), `startup output should mention ${expectedText}: ${server.getOutput()}`);
}

async function registerUser(prefix) {
  const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const password = 'pwd123';
  const res = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(res.status, 200, `register should succeed: ${JSON.stringify(res.payload)}`);
  return {
    username,
    token: res.payload.user.sessionToken
  };
}

async function runOptionalIntegrityChecks() {
  await withServer({}, async () => {
    const user = await registerUser('optional_hmac');

    const partialSignature = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData: { level: 0 },
        saveTime: Date.now(),
        signature: 'a'.repeat(64)
      }
    });
    assert.strictEqual(partialSignature.status, 400, 'optional mode should reject signature without salt');

    const partialSalt = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData: { level: 0 },
        saveTime: Date.now(),
        salt: 'optional-salt-0'
      }
    });
    assert.strictEqual(partialSalt.status, 400, 'optional mode should reject salt without signature');

    const invalidSignature = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData: { level: 0 },
        saveTime: Date.now(),
        salt: 'optional-salt-0',
        signature: 'not-hex'
      }
    });
    assert.strictEqual(invalidSignature.status, 400, 'optional mode should reject malformed explicit signatures');

    const saveData = { level: 1, hp: 100 };
    const saveRes = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData,
        saveTime: Date.now(),
        salt: 'optional-salt-1',
        signature: 'a'.repeat(64)
      }
    });
    assert.strictEqual(saveRes.status, 200, 'optional integrity should not block valid-format signatures when HMAC is not configured');

    const missingAuth = await request('/api/saves');
    assert.strictEqual(missingAuth.status, 401, 'missing auth should return 401');

    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'missing-user', password: 'bad' }
    });
    assert.strictEqual(badLogin.status, 401, 'bad login should return 401');
  });
}

async function runRequiredIntegrityChecks() {
  await withServer({ DEFIER_HMAC_SECRET: HMAC_SECRET, DEFIER_INTEGRITY_REQUIRED: '1' }, async () => {
    const user = await registerUser('required_hmac');
    const saveData = { level: 2, hp: 120 };
    const saveStr = JSON.stringify(saveData);
    const salt = 'required-salt-1';
    const signature = signPayload(saveStr, salt);

    const missingSig = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData, saveTime: Date.now() }
    });
    assert.strictEqual(missingSig.status, 400, 'forced integrity should reject missing signatures');

    const invalidFormat = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData, saveTime: Date.now(), salt, signature: 'not-hex' }
    });
    assert.strictEqual(invalidFormat.status, 400, 'forced integrity should reject invalid signature format');

    const tampered = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData: { ...saveData, hp: 999 }, saveTime: Date.now(), salt, signature }
    });
    assert.strictEqual(tampered.status, 403, 'forced integrity should reject tampered save payload');

    const validSave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData, saveTime: Date.now(), salt, signature }
    });
    assert.strictEqual(validSave.status, 200, 'forced integrity should accept valid save signatures');

    const ghostData = { name: 'RequiredHero', hp: 500, maxHp: 500, deck: [{ id: 'audit_strike' }] };
    const ghostSalt = 'ghost-salt-123';
    const ghostSignature = signPayload(JSON.stringify(ghostData), ghostSalt);
    const validGhost = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: { realm: 3, ghostData, salt: ghostSalt, signature: ghostSignature }
    });
    assert.strictEqual(validGhost.status, 200, 'forced integrity should accept valid ghost signatures');

    const badGhost = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: { realm: 3, ghostData: { ...ghostData, hp: 999 }, salt: ghostSalt, signature: ghostSignature }
    });
    assert.strictEqual(badGhost.status, 403, 'forced integrity should reject tampered ghost payload');

    const invalidGhostShape = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: {
        realm: 3,
        ghostData: { name: 'InvalidHero', hp: 9999, maxHp: 500, deck: [{ id: 'audit_strike' }] },
        salt: 'ghost-salt-456',
        signature: signPayload(JSON.stringify({ name: 'InvalidHero', hp: 9999, maxHp: 500, deck: [{ id: 'audit_strike' }] }), 'ghost-salt-456')
      }
    });
    assert.strictEqual(invalidGhostShape.status, 403, 'server-side ghost validation should reject impossible stats');

    const writes = Array.from({ length: 10 }, (_, index) => {
      const payload = { level: index, hp: 100 + index };
      const writeSalt = `concurrent-${index}`;
      return request('/api/saves', {
        method: 'POST',
        token: user.token,
        body: {
          slotIndex: 1,
          saveData: payload,
          saveTime: Date.now() + index,
          salt: writeSalt,
          signature: signPayload(JSON.stringify(payload), writeSalt)
        }
      });
    });
    const settled = await Promise.all(writes);
    assert(settled.every(item => item.status === 200), `all concurrent writes should pass: ${JSON.stringify(settled)}`);

    const read = await request('/api/saves', { token: user.token });
    assert.strictEqual(read.status, 200, 'save read should succeed after concurrent writes');
    const slot = read.payload.data.find(item => item.slotIndex === 1);
    assert(slot, 'slot 1 should exist after concurrent writes');
  });
}

(async () => {
  await assertServerStartupFails({ DEFIER_INTEGRITY_REQUIRED: '1' }, 'DEFIER_INTEGRITY_REQUIRED requires DEFIER_HMAC_SECRET');
  await runOptionalIntegrityChecks();
  await runRequiredIntegrityChecks();
  console.log('Backend security endpoint checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
