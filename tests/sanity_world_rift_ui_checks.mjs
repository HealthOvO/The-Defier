import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');

const index = read('index.html');
const hub = read('js/core/challenge_hub.js');
const panel = read('js/views/AuthoritativeRunPanel.js');
const client = read('js/services/backend-client.js');
const style = read('css/style.css');

assert.match(index, /data-challenge-tab="rift"/);
assert.match(index, /switchChallengeTab\('rift'\)/);
assert.match(hub, /import \{ WorldRiftService \}/);
assert.match(hub, /initWorldRiftHub/);
assert.match(hub, /data-world-rift-summary/);
assert.match(hub, /data-challenge-action="open-authoritative-world-rift"/);
assert.match(hub, /data-challenge-action="claim-world-rift-milestone"/);
assert.match(hub, /真实共斗榜/);
assert.match(hub, /不显示本地模拟首领/);
assert.match(hub, /最佳 3 次计榜/);
assert.match(hub, /无末刀奖励/);
assert.match(hub, /data-world-rift-squad-summary/);
assert.match(hub, /data-challenge-action="open-social-squad"/);
assert.match(hub, /hasFormalContribution = completedAttempts > 0 \|\| personalTotal > 0 \|\| rankedContribution > 0/);
assert.match(hub, /不增加伤害、次数或战力/);
assert.match(hub, /role="progressbar"/);
assert.match(hub, /aria-valuemin="0" aria-valuemax="\$\{totalHp\}" aria-valuenow="\$\{appliedDamage\}"/);
assert.match(panel, /"world_rift"/);
assert.match(panel, /this\.worldRiftService\.start/);
assert.match(panel, /this\.worldRiftService\.submit/);
assert.match(client, /async getWorldRiftCurrent/);
assert.match(client, /async startWorldRiftAttempt/);
assert.match(client, /async submitWorldRiftContribution/);
assert.match(client, /async claimWorldRiftReward/);
assert.match(style, /\.world-rift-progress-track/);

console.log('World rift UI checks passed.');
