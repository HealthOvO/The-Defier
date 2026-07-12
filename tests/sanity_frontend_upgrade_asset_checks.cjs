const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertWebpAsset(relativePath) {
  const absolute = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolute), `${relativePath} should exist`);
  const stat = fs.statSync(absolute);
  assert.ok(stat.size > 1024, `${relativePath} should be a real image asset`);
  const header = fs.readFileSync(absolute).subarray(0, 12);
  assert.strictEqual(header.subarray(0, 4).toString('ascii'), 'RIFF', `${relativePath} should be a RIFF WebP`);
  assert.strictEqual(header.subarray(8, 12).toString('ascii'), 'WEBP', `${relativePath} should be a WebP image`);
}

function collectImageRefs(relativePath) {
  const source = read(relativePath);
  return Array.from(source.matchAll(/assets\/images\/[^'"`) \n\r<>]+/g), (match) => match[0]);
}

function assertSiteAssetIfPresent(relativePath) {
  const siteRoot = path.join(root, '.site');
  if (!fs.existsSync(siteRoot)) return;
  const absolute = path.join(siteRoot, relativePath);
  assert.ok(fs.existsSync(absolute), `.site should include copied visual asset: ${relativePath}`);
  const stat = fs.statSync(absolute);
  assert.ok(stat.size > 1024, `.site visual asset should be non-empty: ${relativePath}`);
}

const keyAssets = [
  'assets/images/logo-v2.webp',
  'assets/images/ui/main-menu-hero.webp',
  'assets/images/characters/lin_feng.webp',
  'assets/images/characters/xiang_ye.webp',
  'assets/images/characters/wuyu.webp',
  'assets/images/characters/yan_han.webp',
  'assets/images/characters/mo_chen.webp',
  'assets/images/characters/ning_xuan.webp',
];

keyAssets.forEach(assertWebpAsset);

const dataImageRefs = new Set([
  ...collectImageRefs('index.html'),
  ...collectImageRefs('js/data/characters.js'),
  ...collectImageRefs('js/data/enemies.js'),
]);

assert.ok(dataImageRefs.size >= 24, 'visual asset system should cover index, character, and boss image references');
dataImageRefs.forEach((relativePath) => {
  assertWebpAsset(relativePath);
  assertSiteAssetIfPresent(relativePath);
});

const indexHtml = read('index.html');
assert.ok(indexHtml.includes('css/frontend-upgrade.css'), 'index.html should include frontend-upgrade.css');
assert.ok(indexHtml.includes('assets/images/ui/main-menu-hero.webp'), 'main menu should reference the generated hero asset');
assert.ok(
  indexHtml.includes('<link rel="icon" type="image/webp" href="assets/images/logo-v2.webp">'),
  'favicon metadata should declare the WebP logo MIME type',
);

const characterData = read('js/data/characters.js');
assert.ok(characterData.includes('assets/images/characters/mo_chen.webp'), 'moChen should use generated portrait');
assert.ok(characterData.includes('assets/images/characters/ning_xuan.webp'), 'ningXuan should use generated portrait');

const preparePages = read('scripts/prepare-pages.sh');
assert.ok(preparePages.includes('copy_path "assets"'), 'pages build should copy source visual assets into .site');

console.log('Frontend upgrade asset checks passed.');
