import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const backendClient = read('js/services/backend-client.js');
const authService = read('js/services/authService.js');
const socialView = read('js/views/SocialView.js');
const playerMessage = read('js/ui/player-message.js');
const game = read('js/game.js');
const html = read('index.html');
const css = read('css/account-social.css');

assert.match(backendClient, /ACCOUNT_SECURITY_PROTOCOL_VERSION\s*=\s*'account-security-v1'/);
assert.match(backendClient, /SOCIAL_GRAPH_PROTOCOL_VERSION\s*=\s*'social-graph-v1'/);
assert.match(backendClient, /WORLD_RIFT_SQUAD_PROTOCOL_VERSION\s*=\s*'world-rift-squad-v1'/);
assert.match(backendClient, /DEVICE_STORAGE_KEY\s*=\s*'theDefierDeviceIdV1'/);
assert.match(backendClient, /targetProfileId/, 'friend live invite should use an opaque profile id');
assert.match(backendClient, /createRequiredSessionIntegrityFields[\s\S]*account_social_signature_required/, 'social writes should require session HMAC');
assert.match(backendClient, /session-v2\\n\$\{signedRoute\}/, 'account/social session HMAC should bind the request method and path');
assert.match(backendClient, /signedRoute\s*=\s*`\$\{String\(method/, 'account-bound writes should derive a concrete signed route');
assert.match(backendClient, /currentUserId !== boundUserId/, 'late social responses should be suppressed after account switching');
assert.match(backendClient, /authPathPrefix}\/logout/, 'local logout should request durable session revocation');
assert.match(backendClient, /response\.status === 401[\s\S]*expireServerSession/, 'rejected active sessions should be cleared centrally');
assert.match(backendClient, /AUTH_EXPIRED_EVENT\s*=\s*'the-defier-auth-expired'/, 'expired sessions should notify active UI surfaces');

assert.match(authService, /changePassword\(/);
assert.match(authService, /revokeSession\(/);
assert.match(authService, /logoutAll\(/);
assert.doesNotMatch(game, /const loginRes = await AuthService\.login\(username, password\)/, 'registration must not create a second login session');
assert.match(game, /showSocialHub\(tab = 'friends'\)/);
assert.match(game, /guest-expired-auth[\s\S]*handleSessionExpired/, 'localhost automation should expose the expired-session recovery state for browser QA');
assert.match(game, /import\('\.\/views\/SocialView\.js'\)/, 'social view should load only when the account hub opens');
assert.doesNotMatch(game, /import \{ SocialView \}/, 'social view should not stay in the eager game bundle');
assert.match(game, /handleLoginMenuAction\(\)[\s\S]*?this\.showSocialHub\('friends'\)/, 'logged-in account control should open the account hub through the delegated boot action');
assert.doesNotMatch(game, /btn\.onclick = \(\) => this\.showSocialHub\('friends'\)/, 'logged-in account control should not install a competing click handler');

for (const tab of ['friends', 'requests', 'squad', 'security']) {
  assert.match(html, new RegExp(`data-social-tab="${tab}"`), `social hub should expose ${tab} tab`);
}
assert.match(socialView, /45_?000|45000/, 'presence heartbeat should use the 45 second cadence');
assert.match(socialView, /每人仅取最佳一次真实贡献/, 'squad UI should explain the best-one-per-member rule');
assert.match(socialView, /不增加次数、伤害或战力/, 'squad UI should state the no-power boundary');
assert.match(socialView, /尚无贡献/, 'zero score should not be presented as real participation');
assert.match(socialView, /account_social_account_changed[\s\S]*this\.dashboard = null[\s\S]*this\.security = null/, 'account switching should clear stale social and security data');
assert.match(socialView, /handleSessionExpired\([\s\S]*登录状态已过期[\s\S]*showLoginModal/, 'social UI should recover an expired session with a player-facing login path');
assert.match(socialView, /safePlayerMessage[\s\S]*safeSocialMessage/, 'social UI should use the shared player-facing message guard');
assert.match(playerMessage, /TECHNICAL_MESSAGE_PATTERN[\s\S]*safePlayerMessage/, 'shared message guard should reject transport and API diagnostics');
assert.match(socialView, /export function loadSocialViewStyles/, 'social styles should load with the deferred social view');
assert.doesNotMatch(html, /href="css\/account-social\.css"/, 'social stylesheet should not load on the idle main menu');
assert.doesNotMatch(backendClient, /leaveRiftSquad[\s\S]{0,220}milestoneId/, 'leaving a squad must not reference an undefined reward milestone');
assert.doesNotMatch(socialView, /机器人道友|模拟小队成员|假在线/, 'client must not create simulated social facts');
assert.match(css, /@media \(max-width: 768px\)/, 'social hub should collapse throughout the full mobile viewport band');
assert.match(css, /\.social-content button\s*\{[\s\S]*?min-height: 44px/, 'social actions should keep touch-safe dimensions');

const { AUTH_EXPIRED_EVENT, BackendClient, SESSION_STORAGE_KEY } = await import('../js/services/backend-client.js');
const sessionStore = new Map();
globalThis.localStorage = {
  getItem(key) {
    return sessionStore.has(key) ? sessionStore.get(key) : null;
  },
  setItem(key, value) {
    sessionStore.set(key, String(value));
  },
  removeItem(key) {
    sessionStore.delete(key);
  }
};
globalThis.__THE_DEFIER_CONFIG__ = {
  server: { baseUrl: 'https://expired-session.invalid' }
};
const authExpiryEvents = [];
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.dispatchEvent = event => {
  authExpiryEvents.push(event);
  return true;
};
globalThis.fetch = async () => ({
  ok: false,
  status: 401,
  async json() {
    return { message: 'HTTP 401 /api/social/dashboard' };
  }
});
BackendClient.REQUEST_TIMEOUT_MS = 25;
BackendClient.cloudEnabled = false;
BackendClient.init();
BackendClient.persistServerSession({
  token: 'expired-active-token',
  user: { objectId: 'expired-user', username: 'expired-user' }
});
await assert.rejects(
  BackendClient.requestServer('/api/social/dashboard'),
  error => Number(error && error.code) === 401
);
assert.equal(localStorage.getItem(SESSION_STORAGE_KEY), null, 'a 401 for the active token should remove the stale local session');
assert.equal(authExpiryEvents.length, 1, 'a stale active token should notify the visible client once');
assert.equal(authExpiryEvents[0].type, AUTH_EXPIRED_EVENT);
assert.equal(authExpiryEvents[0].detail.userId, 'expired-user');

BackendClient.persistServerSession({
  token: 'current-valid-token',
  user: { objectId: 'current-user', username: 'current-user' }
});
await assert.rejects(
  BackendClient.requestServer('/api/social/dashboard', { authToken: 'foreign-rejected-token' }),
  error => Number(error && error.code) === 401
);
assert.ok(localStorage.getItem(SESSION_STORAGE_KEY), 'a rejected snapshot from another token must not clear the current session');
assert.equal(authExpiryEvents.length, 1, 'a rejected foreign token should not emit a current-session expiry event');

console.log('Account social client checks passed.');
