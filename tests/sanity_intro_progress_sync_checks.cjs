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

  const intro = fs.readFileSync(introPath, 'utf8');
  const progress = fs.readFileSync(progressPath, 'utf8');

  const sharedAnchors = [
    'V9.2',
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
  ];

  const introOnlyAnchors = [
    '当前版本重点（V9.2）',
    '当前迭代重点（V9.2）',
    'PVP 风险画像已上线',
  ];

  const progressOnlyAnchors = [
    'tests/browser_meta_screen_audit.mjs',
    'tests/browser_pvp_mobile_audit.mjs',
    'tests/browser_guide_modal_audit.mjs',
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

  const introVersionCount = (intro.match(/V9\.2/g) || []).length;
  const progressVersionCount = (progress.match(/V9\.2/g) || []).length;
  assert(introVersionCount >= 2, `expected intro to mention V9.2 at least twice, got ${introVersionCount}`);
  assert(progressVersionCount >= 1, `expected progress to mention V9.2 at least once, got ${progressVersionCount}`);

  console.log(`Intro/progress sync checks passed (${sharedAnchors.length} shared anchors).`);
})();
