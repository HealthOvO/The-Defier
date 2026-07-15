import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safePlayerMessage } from '../js/ui/player-message.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

assert.equal(
  safePlayerMessage({ message: 'HTTP 500 POST /api/pvp/live queue_timeout' }, '联机暂时不可用'),
  '联机暂时不可用'
);
assert.equal(
  safePlayerMessage({ message: '账号或密码不正确' }, '登录失败'),
  '账号或密码不正确'
);
assert.equal(
  safePlayerMessage({ reason: 'session_expired' }, '操作未完成'),
  '登录状态已过期，请重新登录'
);
assert.equal(safePlayerMessage('', ''), '');

const gameSource = read('js/game.js');
const pvpSource = read('js/scenes/pvp-scene.js');
const seasonSource = read('js/views/SeasonOpsView.js');
const chronicleSource = read('js/views/FateChronicleView.js');
const authoritativeSource = read('js/views/AuthoritativeRunPanel.js');

assert.match(gameSource, /safePlayerMessage\(result, '登录失败，请检查账号和密码'\)/);
assert.doesNotMatch(gameSource, /AuthService missing\)\s*'/);
assert.match(pvpSource, /公开战报仅展示双方可见的对局摘要/);
assert.doesNotMatch(pvpSource, /公开 viewer 只读取 replay_public/);
assert.match(seasonSource, /safePlayerMessage\(result, "赛季司读取失败，请稍后重试"\)/);
assert.match(chronicleSource, /safePlayerMessage\(result, "命途长卷读取失败，请稍后重试"\)/);
assert.match(authoritativeSource, /safePlayerMessage\(error, "天道试炼读取失败，请稍后重试。"\)/);

console.log('Player-facing message checks passed.');
