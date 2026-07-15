const fs = require('fs');

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(p, enc) {
    let c = originalReadFileSync(p, enc);
    if (enc === 'utf8' && p.endsWith('.js')) {
        c = c.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
        c = c.replace(/^export\s+\{.*?\};?/gm, '');
        c = c.replace(/^import\s+.*?;/gm, '');
    }
    return c;
};

const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const introPath = path.join(root, 'game-intro.html');
  const indexPath = path.join(root, 'index.html');
  const progressPath = path.join(root, 'progress.md');
  const systemViewPath = path.join(root, 'js/views/SystemView.js');

  const intro = fs.readFileSync(introPath, 'utf8');
  const index = fs.readFileSync(indexPath, 'utf8');
  const progress = fs.readFileSync(progressPath, 'utf8');
  const systemView = fs.readFileSync(systemViewPath, 'utf8');

  const sharedAnchors = [
    'V11 命途长卷 · 三证归卷',
    '命途长卷',
    '三证归卷',
    '3 章各 2 条誓约',
    '服务器权威 run',
    '失败不扣次数',
    '不会回退已完成章节',
    '5 类权威活动铸证',
    '2/5 领取 120 荣誉',
    '3/5 只提升档案等级',
    '非强制 PVP',
    '纯外观里程碑',
  ];

  const introOnlyAnchors = [
    '当前版本重点（V11 命途长卷 · 三证归卷）',
    '当前迭代重点（V11 命途长卷 · 三证归卷）',
    '所有归卷奖励、双解展示与全证奖励都维持纯外观里程碑边界',
    '实时论道属于非强制 PVP 证源',
  ];

  const progressOnlyAnchors = [
    '当前玩家版本口径更新为“V11 命途长卷 · 三证归卷”',
    '历史版本记录中的 `V10 同道远征 · 权威接力闭环` 已保留',
    'tests/browser_meta_screen_audit.mjs',
    'tests/browser_pvp_mobile_audit.mjs',
    'tests/browser_guide_modal_audit.mjs',
  ];

  const systemViewCurrentAnchors = [
    'V11 命途长卷 · 三证归卷',
    '3 章各 2 条誓约',
    '服务器权威 run',
    '失败不扣次数',
    '不会回退已完成章节',
    '5 类权威活动铸证',
    '2/5 领取 120 荣誉',
    '3/5 只提升档案等级',
    '非强制 PVP',
    '纯外观',
    '同道远征',
    '共享路线，不共享残血与牌组',
    '镜像练习',
    '实时论道赛后复盘',
    'PVP 练习快照',
    '不写正式积分',
    '权威试炼',
  ];

  sharedAnchors.forEach((anchor) => {
    assert(intro.includes(anchor), `intro missing shared anchor: ${anchor}`);
    assert(progress.includes(anchor), `progress missing shared anchor: ${anchor}`);
  });

  introOnlyAnchors.forEach((anchor) => {
    assert(intro.includes(anchor), `intro missing expected anchor: ${anchor}`);
  });

  progressOnlyAnchors.forEach((anchor) => {
    assert(progress.includes(anchor), `progress missing expected verification anchor: ${anchor}`);
  });

  systemViewCurrentAnchors.forEach((anchor) => {
    assert(systemView.includes(anchor), `SystemView guide missing current PVP anchor: ${anchor}`);
  });

  const currentVersionPattern = /V11 命途长卷 · 三证归卷/g;
  const introVersionCount = (intro.match(currentVersionPattern) || []).length;
  const progressVersionCount = (progress.match(currentVersionPattern) || []).length;
  assert(introVersionCount >= 2, `expected intro to mention V11 命途长卷 · 三证归卷 at least twice, got ${introVersionCount}`);
  assert(progressVersionCount >= 1, `expected progress to mention V11 命途长卷 · 三证归卷 at least once, got ${progressVersionCount}`);
  assert(!intro.includes('当前版本重点（V10 同道远征 · 权威接力闭环）'), 'intro should not keep stale V10 current-version title');
  assert(!intro.includes('当前迭代重点（V10 同道远征 · 权威接力闭环）'), 'intro should not keep stale V10 current-iteration title');
  assert(!systemView.includes('当前版本重点（V10 同道远征 · 权威接力闭环）'), 'SystemView should not keep stale V10 current-version title');
  const currentVersionMatches = [...progress.matchAll(/当前玩家版本口径更新为“([^”]+)”/g)];
  assert(currentVersionMatches.length >= 2, 'progress should track both the current V11 copy sync and the historical V10 record');
  assert(currentVersionMatches[0][1] === 'V11 命途长卷 · 三证归卷', `expected the first current-version record in progress to be V11, got ${currentVersionMatches[0][1]}`);
  assert(currentVersionMatches.some((match) => match[1] === 'V10 同道远征 · 权威接力闭环'), 'progress should retain the historical V10 current-version record');
  assert(!/v9\.2/i.test(intro), 'intro should not keep stale v9.2 current-version copy');
  assert(!/v9\.2/i.test(index), 'index should not keep stale v9.2 current-version copy');
  assert(!/v9\.2/i.test(systemView), 'SystemView guide should not keep stale v9.2 current-version copy');
  assert(!/seasonBoard\./.test(intro), 'intro should not expose seasonBoard implementation key paths to players');
  assert(!/seasonBoard\./.test(systemView), 'SystemView guide should not expose seasonBoard implementation key paths to players');
  assert(!intro.includes('镜像演武'), 'intro current guide should use 镜像练习 instead of stale 镜像演武 copy');
  assert(!index.includes('镜像演武'), 'index current PVP entry should use 镜像练习 instead of stale 镜像演武 copy');
  assert(!systemView.includes('镜像演武'), 'SystemView current guide should use 镜像练习 instead of stale 镜像演武 copy');
  assert(systemView.includes('界面反馈'), 'SystemView controls guide should describe interface feedback');
  assert(!/常用快捷键|按\s*L|按\s*F|<strong>Esc<\/strong>|快捷预设/.test(systemView), 'SystemView should not expose keyboard shortcut copy in the player guide');

  console.log(`Intro/progress/SystemView sync checks passed (${sharedAnchors.length} shared anchors).`);
})();
