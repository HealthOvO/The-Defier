const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function assertFile(relativePath) {
  const absolute = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolute), `${relativePath} should exist`);
  const stat = fs.statSync(absolute);
  assert.ok(stat.size > 1024, `${relativePath} should be a real image asset`);
}

assertFile('assets/images/ui/main-menu-hero.webp');
assertFile('assets/images/characters/mo_chen.webp');
assertFile('assets/images/characters/ning_xuan.webp');

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(indexHtml.includes('css/frontend-upgrade.css'), 'index.html should include frontend-upgrade.css');
assert.ok(indexHtml.includes('assets/images/ui/main-menu-hero.webp'), 'main menu should reference the generated hero asset');

const characterData = fs.readFileSync(path.join(root, 'js/data/characters.js'), 'utf8');
assert.ok(characterData.includes('assets/images/characters/mo_chen.webp'), 'moChen should use generated portrait');
assert.ok(characterData.includes('assets/images/characters/ning_xuan.webp'), 'ningXuan should use generated portrait');

console.log('Frontend upgrade asset checks passed.');
