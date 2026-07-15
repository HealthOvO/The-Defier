import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const gameSource = fs.readFileSync('js/game.js', 'utf8');
const fixtureSource = fs.readFileSync('js/testing/browser-audit-fixtures.js', 'utf8');
const indexSource = fs.readFileSync('index.html', 'utf8');
const eventSource = fs.readFileSync('js/views/EventView.js', 'utf8');
const eventManagerSource = fs.readFileSync('js/managers/EventManager.js', 'utf8');
const expeditionSource = fs.readFileSync('js/core/expedition_hub.js', 'utf8');
const collectionSource = fs.readFileSync('js/core/collection_hub.js', 'utf8');
const expeditionDataSource = fs.readFileSync('js/data/expedition_systems.js', 'utf8');
const rewardSource = fs.readFileSync('js/views/RewardView.js', 'utf8');
const fateChronicleSource = fs.readFileSync('js/views/FateChronicleView.js', 'utf8');
const fateChronicleCss = fs.readFileSync('css/fate-chronicle.css', 'utf8');
const systemSource = fs.readFileSync('js/views/SystemView.js', 'utf8');
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
assert.match(gameSource, /'guest-game-over'/, 'defeat result audit mode should be registered');
assert.match(gameSource, /'guest-victory'/, 'victory result audit mode should be registered');
assert.match(gameSource, /import\('\.\/testing\/browser-audit-fixtures\.js'\)/, 'audit fixtures should stay in a lazy chunk');
assert.match(gameSource, /skipRewardCard\(\)\s*\{\s*return Game\.prototype\.ensureRewardView\.call\(this\)\.skipRewardCard\(\);\s*\}/, 'reward skip button should delegate to the reward view');

assert.match(fixtureSource, /showSeasonOpsAuditState/, 'season audit fixture should expose its boot helper');
assert.match(fixtureSource, /showSocialRelayAuditState/, 'social audit fixture should expose its boot helper');
assert.match(fixtureSource, /showRunResultAuditState/, 'run result audit fixture should expose its boot helper');
assert.match(fixtureSource, /allowedTactics:[\s\S]*vanguard[\s\S]*bulwark[\s\S]*insight/, 'relay fixture should cover all three tactic choices');
assert.doesNotMatch(fixtureSource, /https?:\/\//, 'browser audit fixtures should not call a remote service');

assert.match(indexSource, /<details class="event-system-summary" id="event-system-summary"/, 'event context should use a native disclosure');
assert.match(eventSource, /<summary class="event-summary-toggle">/, 'event context should expose a concise disclosure control');
assert.match(eventSource, /refs\.summaryEl\.open = false;/, 'event context should start collapsed');
assert.match(indexSource, /data-run-result-action="menu"/, 'run result should expose a stable main-menu action');
assert.match(systemSource, /restartBtn\.style\.display = 'none'/, 'victory should hide the defeat-only realm restart action');

const eventManagerContext = vm.createContext({
  console,
  CARDS: { doomsentVerdict: { id: 'doomsentVerdict', name: '终契裁决' } },
  LAWS: { thunderLaw: { id: 'thunderLaw', name: '雷法残章' } },
  TREASURES: { metalEssence: { id: 'metalEssence', name: '金精石' } },
  FATE_RING: { paths: {} }
});
vm.runInContext(
  eventManagerSource
    .replace(/^import\s+.*?;$/gm, '')
    .replace('export class EventManager', 'class EventManager'),
  eventManagerContext,
  { filename: 'EventManager.js' }
);
const EventManager = vm.runInContext('EventManager', eventManagerContext);
const eventManager = new EventManager({});
const eventEffectSummary = eventManager.buildEventChoiceEffectSummary({
  effects: [
    { type: 'card', cardId: 'doomsentVerdict' },
    { type: 'law', lawId: 'thunderLaw' },
    { type: 'treasure', treasureId: 'metalEssence' },
    { type: 'card', cardId: 'missing_internal_id' }
  ]
}).join(' · ');
assert.match(eventEffectSummary, /获得卡牌 终契裁决/, 'event choices should show localized card names');
assert.match(eventEffectSummary, /获得法则 雷法残章/, 'event choices should show localized law names');
assert.match(eventEffectSummary, /获得法宝 金精石/, 'event choices should show localized treasure names');
assert.match(eventEffectSummary, /获得卡牌 指定卡牌/, 'unknown event rewards should use a player-facing fallback');
assert.doesNotMatch(eventEffectSummary, /doomsentVerdict|thunderLaw|metalEssence|missing_internal_id/, 'event choices should not expose internal catalog ids');
assert.match(expeditionSource, /battle:\s*'战斗悬赏'[\s\S]*route:\s*'路线悬赏'[\s\S]*extreme:\s*'险境悬赏'/, 'expedition bounty types should use player-facing labels');
assert.match(expeditionSource, /节点：\$\{escapeHtml\(formatExpeditionNodeLabels\(entry\.nodeTypes/, 'observatory bonuses should translate node ids');
assert.match(expeditionSource, /出没：\$\{formatExpeditionNodeLabels\(state\.activeNemesis\?\.triggerNodeTypes/, 'nemesis cards should translate node ids');
assert.doesNotMatch(expeditionDataSource, /['"][^'"\n]*\bbuild\b[^'"\n]*['"]/, 'expedition player copy should not expose development terminology');
assert.doesNotMatch(rewardSource, /战斗胜利 · 样本更新|样本持续归档中|写入档案|继续扩样/, 'reward copy should stay in the game world instead of exposing analysis terminology');
assert.doesNotMatch(expeditionSource, /观星建议会把样本节奏|更贴近[^\n]*的样本节奏/, 'primary expedition guidance should use player-facing route language');
assert.doesNotMatch(expeditionSource, /把样本节奏先定进主线|更贴样本的支线|挑战样本反哺|样本路线|更贴样本节奏/, 'deep expedition summaries should avoid analysis terminology');
assert.match(expeditionSource, /路线指引：\$\{expedition\.observatoryLink\.routeFocusLine\}/, 'expedition snapshots should expose a player-facing route label');
assert.doesNotMatch(collectionSource, /命盘与样本节奏|样本路径<\/span>|暂未留下样本路径|命途样本与下一轮路线/, 'collection guidance should avoid analysis terminology');
assert.match(fateChronicleSource, /<h2>登录后继续命途长卷<\/h2>/, 'chronicle guest state should lead with a player action');
assert.doesNotMatch(fateChronicleSource, /账号签名|客户端不会本地补全|2\/5 基础归卷奖励/, 'chronicle state copy should not expose implementation language');
assert.match(fateChronicleCss, /\.fate-chronicle-state-shell\s*\{[\s\S]*min-height:\s*100dvh;[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\)/, 'chronicle guest state should fill and balance the viewport');

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
assert.match(frontendCss, /#event-modal \.event-system-summary\s*\{[\s\S]*border-radius:\s*8px/, 'event context disclosure should stay compact');
assert.match(frontendCss, /@media \(min-width: 769px\)[\s\S]*#event-modal \.event-choices\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'desktop event choices should stay comparable in two columns');
assert.match(frontendCss, /#game-over-screen \.game-over-buttons\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/, 'desktop run result actions should remain in one stable row');
assert.match(frontendCss, /@media \(max-width: 768px\)[\s\S]*#reward-screen \.reward-cards\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'mobile rewards should remain visible together for direct comparison');
assert.doesNotMatch(frontendCss, /#reward-screen \.reward-cards\s*\{[\s\S]{0,420}scroll-snap-type:\s*x mandatory/, 'mobile rewards should not hide the second choice behind a carousel');
assert.match(browserAuditSource, /id: 'guest-battle-short-landscape'/, 'browser gate should cover the narrow landscape battle');
assert.match(browserAuditSource, /id: 'guest-battle-mobile'/, 'browser gate should cover the mobile hand rail');
assert.match(browserAuditSource, /id: 'guest-reward-mobile'/, 'browser gate should cover direct mobile reward comparison');
assert.match(browserAuditSource, /id: 'guest-event-short-landscape'/, 'browser gate should cover short landscape event decisions');
assert.match(browserAuditSource, /enemyHandOverlap:\s*overlapArea\(enemy, hand\)/, 'browser gate should measure enemy and hand overlap');

console.log('Browser audit fixture checks passed.');
