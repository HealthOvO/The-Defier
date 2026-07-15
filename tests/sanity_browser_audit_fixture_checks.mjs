import assert from 'node:assert/strict';
import fs from 'node:fs';

const gameSource = fs.readFileSync('js/game.js', 'utf8');
const fixtureSource = fs.readFileSync('js/testing/browser-audit-fixtures.js', 'utf8');
const socialSource = fs.readFileSync('js/views/SocialView.js', 'utf8');
const socialCss = fs.readFileSync('css/account-social.css', 'utf8');
const seasonSource = fs.readFileSync('js/views/SeasonOpsView.js', 'utf8');
const seasonCss = fs.readFileSync('css/season-ops.css', 'utf8');
const frontendCss = fs.readFileSync('css/frontend-upgrade.css', 'utf8');
const browserAuditSource = fs.readFileSync('tests/browser_automation_boot_audit.mjs', 'utf8');

assert.match(gameSource, /\['localhost', '127\.0\.0\.1', '::1'\]\.includes\(host\)/, 'automation boot must remain localhost-only');
assert.match(gameSource, /'season-ops-ledger'/, 'season ledger audit mode should be registered');
assert.match(gameSource, /'season-ops-leaderboard'/, 'season leaderboard audit mode should be registered');
assert.match(gameSource, /'social-relay-workspace'/, 'social relay audit mode should be registered');
assert.match(gameSource, /import\('\.\/testing\/browser-audit-fixtures\.js'\)/, 'audit fixtures should stay in a lazy chunk');

assert.match(fixtureSource, /showSeasonOpsAuditState/, 'season audit fixture should expose its boot helper');
assert.match(fixtureSource, /showSocialRelayAuditState/, 'social audit fixture should expose its boot helper');
assert.match(fixtureSource, /allowedTactics:[\s\S]*vanguard[\s\S]*bulwark[\s\S]*insight/, 'relay fixture should cover all three tactic choices');
assert.doesNotMatch(fixtureSource, /https?:\/\//, 'browser audit fixtures should not call a remote service');

assert.match(socialSource, /<details class="social-squad-roster">/, 'squad roster should remain collapsible');
assert.match(socialSource, /只共享路线、棒次与权威摘要，不转移战斗状态。/, 'relay boundary copy should stay concise');
assert.match(socialCss, /\.social-relay-route-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/, 'desktop relay route should use four columns');
assert.match(socialCss, /\.social-relay-tactic-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/, 'desktop relay tactics should use three columns');

assert.match(seasonSource, /<h2>\$\{escapeHtml\(season \? season\.title : "赛季卷宗"\)\}<\/h2>/, 'season header should show the season name instead of a feature list');
assert.match(seasonSource, /aria-label="刷新赛季卷宗"/, 'season refresh control should keep an accessible icon label');
assert.match(seasonCss, /\.season-ops-inline-btn\s*\{[\s\S]*min-height:\s*44px/, 'season inline actions should be touch ready');

assert.match(frontendCss, /@media \(min-width: 560px\) and \(max-width: 1180px\) and \(max-height: 560px\) and \(orientation: landscape\)/, 'short landscape battle layout should include narrow phones');
assert.match(frontendCss, /\.battle-control-rail \.battle-tactical-advisor\.collapsed\s*\{\s*display:\s*none;/, 'short landscape should remove the redundant collapsed advisor shell');
assert.match(frontendCss, /@media \(min-width: 560px\) and \(max-width: 768px\)[\s\S]*#battle-command-panel \.battle-command-btn\s*\{[\s\S]*min-height:\s*44px/, 'narrow landscape battle commands should remain touch ready');
assert.match(frontendCss, /@media screen and \(min-width: 769px\)\s*\{\s*#main-menu \.util-btn\s*\{[\s\S]*min-height:\s*44px/, 'desktop main-menu utility shortcuts should remain touch ready');
assert.match(browserAuditSource, /id: 'guest-battle-short-landscape'/, 'browser gate should cover the narrow landscape battle');
assert.match(browserAuditSource, /id: 'guest-battle-mobile'/, 'browser gate should cover the mobile hand rail');
assert.match(browserAuditSource, /enemyHandOverlap:\s*overlapArea\(enemy, hand\)/, 'browser gate should measure enemy and hand overlap');

console.log('Browser audit fixture checks passed.');
