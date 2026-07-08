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
  const progressPath = path.join(root, 'progress.md');
  const systemViewPath = path.join(root, 'js/views/SystemView.js');

  const intro = fs.readFileSync(introPath, 'utf8');
  const progress = fs.readFileSync(progressPath, 'utf8');
  const systemView = fs.readFileSync(systemViewPath, 'utf8');

  const sharedAnchors = [
    'V10 真 PVP',
    '三周一章',
    'feedbackLine',
    'objective',
    'pressureWindow',
    'seasonBoard.frontier',
    'seasonBoard.frontier.chronicle',
    'seasonBoard.frontier.chronicleArchive',
    'seasonBoard.frontier.council',
    'seasonBoard.frontier.resolution',
    'seasonBoard.chapterArc',
    '章程回执直达',
    '查看章节档案',
    '章节演练',
    '设为今日天机章节演练',
    '设为七日劫数章节演练',
    '设为众生试炼章节演练',
    '三赛道',
    '七日劫数',
    '众生试炼',
    '裂隙回响线',
    'PVP 结算回执',
    '正式真人入口',
    '实时论道',
    '镜像演武不是真人排位',
  ];

  const introOnlyAnchors = [
    '当前版本重点（V10 真 PVP）',
    '当前迭代重点（V10 真 PVP）',
    'PVP 风险画像已上线',
    '正式胜负、积分和赛季记录只以实时论道为准',
    '不写正式赛季验证',
  ];

  const progressOnlyAnchors = [
    'tests/browser_meta_screen_audit.mjs',
    'tests/browser_pvp_mobile_audit.mjs',
    'tests/browser_guide_modal_audit.mjs',
  ];

  const systemViewCurrentAnchors = [
    'V10 真 PVP',
    '镜像练习',
    '实时论道赛后复盘',
    'PVP 练习快照',
    '不写正式积分',
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

  const introVersionCount = (intro.match(/V10 真 PVP/g) || []).length;
  const progressVersionCount = (progress.match(/V10 真 PVP/g) || []).length;
  assert(introVersionCount >= 2, `expected intro to mention V10 真 PVP at least twice, got ${introVersionCount}`);
  assert(progressVersionCount >= 1, `expected progress to mention V10 真 PVP at least once, got ${progressVersionCount}`);
  assert(!intro.includes('V9.2'), 'intro should not keep stale V9.2 current-version copy');
  assert(!systemView.includes('V9.2'), 'SystemView guide should not keep stale V9.2 current-version copy');
  assert(!systemView.includes('镜像演武'), 'SystemView current guide should use 镜像练习 instead of stale 镜像演武 copy');

  console.log(`Intro/progress/SystemView sync checks passed (${sharedAnchors.length} shared anchors).`);
})();
