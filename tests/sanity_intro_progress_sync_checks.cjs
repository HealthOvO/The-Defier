const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const intro = fs.readFileSync(path.join(root, 'game-intro.html'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const progress = fs.readFileSync(path.join(root, 'progress.md'), 'utf8');
  const systemView = fs.readFileSync(path.join(root, 'js/views/SystemView.js'), 'utf8');

  const sharedAnchors = [
    'V11 命途长卷 · 三证归卷',
    '命途长卷',
    '三证归卷',
    '3 章各 3 条誓约',
    '服务器权威 run',
    '失败不扣次数',
    '不会回退已完成章节',
    '5 类权威活动铸证',
    '2/5 领取 120 荣誉',
    '3/5 只提升档案等级',
    '非强制 PVP',
    '纯外观里程碑',
  ];

  sharedAnchors.forEach(anchor => {
    assert(intro.includes(anchor), `intro missing shared anchor: ${anchor}`);
    assert(progress.includes(anchor), `progress missing shared anchor: ${anchor}`);
  });

  [
    '当前版本重点（V11 命途长卷 · 三证归卷）',
    '当前迭代重点（V11 命途长卷 · 三证归卷）',
    '实时论道属于非强制 PVP 证源',
  ].forEach(anchor => {
    assert(intro.includes(anchor), `intro missing expected anchor: ${anchor}`);
  });

  [
    '当前玩家版本口径更新为“V11 命途长卷 · 三证归卷”',
    '历史版本记录中的 `V10 同道远征 · 权威接力闭环` 已保留',
  ].forEach(anchor => {
    assert(progress.includes(anchor), `progress missing expected anchor: ${anchor}`);
  });

  [
    'V11 命途长卷 · 三证归卷',
    '3 章各 3 条誓约',
    '服务器权威 run',
    '失败不扣次数',
    '不会回退已完成章节',
    '5 类权威活动铸证',
    '2/5 领取 120 荣誉',
    '3/5 只提升档案等级',
    '非强制 PVP',
    '纯外观',
  ].forEach(anchor => {
    assert(systemView.includes(anchor), `SystemView guide missing current chronicle anchor: ${anchor}`);
  });

  const combinedChronicleCopy = [intro, progress, systemView].join('\n');
  ['定稿誓', '审镜誓', '封卷誓'].forEach(anchor => {
    assert(combinedChronicleCopy.includes(anchor), `chronicle sync copy should mention the new oath anchor: ${anchor}`);
  });

  ['3 章各 2 条誓约'].forEach(staleAnchor => {
    assert(!intro.includes(staleAnchor), `intro should not keep stale copy: ${staleAnchor}`);
    assert(!systemView.includes(staleAnchor), `SystemView should not keep stale copy: ${staleAnchor}`);
  });

  const currentVersionPattern = /V11 命途长卷 · 三证归卷/g;
  const introVersionCount = (intro.match(currentVersionPattern) || []).length;
  const progressVersionCount = (progress.match(currentVersionPattern) || []).length;
  assert(introVersionCount >= 2, `expected intro to mention V11 命途长卷 · 三证归卷 at least twice, got ${introVersionCount}`);
  assert(progressVersionCount >= 1, `expected progress to mention V11 命途长卷 · 三证归卷 at least once, got ${progressVersionCount}`);

  const currentVersionMatches = [...progress.matchAll(/当前玩家版本口径更新为“([^”]+)”/g)];
  assert(currentVersionMatches.length >= 2, 'progress should track both the current V11 copy sync and the historical V10 record');
  assert(currentVersionMatches[0][1] === 'V11 命途长卷 · 三证归卷', `expected the first current-version record in progress to be V11, got ${currentVersionMatches[0][1]}`);
  assert(currentVersionMatches.some(match => match[1] === 'V10 同道远征 · 权威接力闭环'), 'progress should retain the historical V10 current-version record');

  assert(!/v9\.2/i.test(intro), 'intro should not keep stale v9.2 current-version copy');
  assert(!/v9\.2/i.test(index), 'index should not keep stale v9.2 current-version copy');
  assert(!/v9\.2/i.test(systemView), 'SystemView guide should not keep stale v9.2 current-version copy');
  assert(!/seasonBoard\./.test(intro), 'intro should not expose seasonBoard implementation key paths to players');
  assert(!/seasonBoard\./.test(systemView), 'SystemView guide should not expose seasonBoard implementation key paths to players');
  assert(!intro.includes('镜像演武'), 'intro current guide should use 镜像练习 instead of stale 镜像演武 copy');
  assert(!index.includes('镜像演武'), 'index current PVP entry should use 镜像练习 instead of stale 镜像演武 copy');
  assert(!systemView.includes('镜像演武'), 'SystemView current guide should use 镜像练习 instead of stale 镜像演武 copy');

  console.log(`Intro/progress/SystemView sync checks passed (${sharedAnchors.length} shared anchors).`);
})();
