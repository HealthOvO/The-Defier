import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const backendClient = read('js/services/backend-client.js');
const authService = read('js/services/authService.js');
const socialView = read('js/views/SocialView.js');
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

assert.match(authService, /changePassword\(/);
assert.match(authService, /revokeSession\(/);
assert.match(authService, /logoutAll\(/);
assert.doesNotMatch(game, /const loginRes = await AuthService\.login\(username, password\)/, 'registration must not create a second login session');
assert.match(game, /showSocialHub\(tab = 'friends'\)/);
assert.match(game, /btn\.onclick = \(\) => this\.showSocialHub\('friends'\)/, 'logged-in account control should open the account hub');

for (const tab of ['friends', 'requests', 'squad', 'security']) {
  assert.match(html, new RegExp(`data-social-tab="${tab}"`), `social hub should expose ${tab} tab`);
}
assert.match(socialView, /45_?000|45000/, 'presence heartbeat should use the 45 second cadence');
assert.match(socialView, /每人仅取最佳一次真实贡献/, 'squad UI should explain the best-one-per-member rule');
assert.match(socialView, /不增加次数、伤害或战力/, 'squad UI should state the no-power boundary');
assert.match(socialView, /尚无贡献/, 'zero score should not be presented as real participation');
assert.match(socialView, /account_social_account_changed[\s\S]*this\.dashboard = null[\s\S]*this\.security = null/, 'account switching should clear stale social and security data');
assert.doesNotMatch(backendClient, /leaveRiftSquad[\s\S]{0,220}milestoneId/, 'leaving a squad must not reference an undefined reward milestone');
assert.doesNotMatch(socialView, /机器人道友|模拟小队成员|假在线/, 'client must not create simulated social facts');
assert.match(css, /@media \(max-width: 720px\)/, 'social hub should include a narrow viewport layout');
assert.match(css, /min-height: 40px/, 'social actions should keep touch-safe dimensions');

console.log('Account social client checks passed.');
