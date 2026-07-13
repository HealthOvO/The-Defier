import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = path.resolve(root, process.argv[2] || 'dist');
const manifestPath = path.join(outputDir, '.vite', 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing Vite manifest: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entry = manifest['index.html'];
if (!entry || !entry.isEntry) throw new Error('Missing index.html entry in Vite manifest');

const readSize = relativePath => {
  const absolutePath = path.join(outputDir, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return {
    file: relativePath,
    rawBytes: buffer.byteLength,
    gzipBytes: zlib.gzipSync(buffer, { level: 9 }).byteLength,
  };
};

const eagerKeys = new Set(['index.html']);
const visitImports = key => {
  const chunk = manifest[key];
  if (!chunk) return;
  for (const dependency of chunk.imports || []) {
    if (eagerKeys.has(dependency)) continue;
    eagerKeys.add(dependency);
    visitImports(dependency);
  }
};
visitImports('index.html');

const eagerJsFiles = [...eagerKeys]
  .map(key => manifest[key]?.file)
  .filter(file => typeof file === 'string' && file.endsWith('.js'));
const eagerCssFiles = [...new Set([...eagerKeys].flatMap(key => manifest[key]?.css || []))];
const entryAssets = (entry.assets || []).map(readSize);
const eagerJs = eagerJsFiles.map(readSize);
const eagerCss = eagerCssFiles.map(readSize);

const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
const kb = bytes => Math.round(bytes / 1024 * 10) / 10;
const limits = {
  entryJsGzipKb: 700,
  eagerJsGzipKb: 800,
  eagerCssGzipKb: 110,
  entryAssetRawKb: 180,
  entryAssetsRawKb: 310,
};
const failures = [];

const entryJs = readSize(entry.file);
const eagerJsGzipKb = kb(sum(eagerJs, 'gzipBytes'));
const eagerCssGzipKb = kb(sum(eagerCss, 'gzipBytes'));
const entryAssetsRawKb = kb(sum(entryAssets, 'rawBytes'));

if (kb(entryJs.gzipBytes) > limits.entryJsGzipKb) {
  failures.push(`entry JS gzip ${kb(entryJs.gzipBytes)} KB > ${limits.entryJsGzipKb} KB`);
}
if (eagerJsGzipKb > limits.eagerJsGzipKb) {
  failures.push(`eager JS gzip ${eagerJsGzipKb} KB > ${limits.eagerJsGzipKb} KB`);
}
if (eagerCssGzipKb > limits.eagerCssGzipKb) {
  failures.push(`eager CSS gzip ${eagerCssGzipKb} KB > ${limits.eagerCssGzipKb} KB`);
}
if (entryAssetsRawKb > limits.entryAssetsRawKb) {
  failures.push(`entry assets ${entryAssetsRawKb} KB > ${limits.entryAssetsRawKb} KB`);
}
for (const asset of entryAssets) {
  if (kb(asset.rawBytes) > limits.entryAssetRawKb) {
    failures.push(`${asset.file} ${kb(asset.rawBytes)} KB > ${limits.entryAssetRawKb} KB`);
  }
}

const requiredDynamicEntries = [
  'js/core/challenge_hub.js',
  'js/scenes/pvp-scene.js',
  'js/views/SeasonOpsView.js',
  'js/views/FateChronicleView.js',
  'js/views/SocialView.js',
];
for (const source of requiredDynamicEntries) {
  if (!manifest[source]?.isDynamicEntry) failures.push(`${source} is not a dynamic entry`);
}
const requiredDeferredStyles = [
  'css/pvp.css',
  'css/season-ops.css',
  'css/fate-chronicle.css',
  'css/account-social.css',
];
for (const source of requiredDeferredStyles) {
  const file = manifest[source]?.file;
  if (!file) failures.push(`${source} is missing from the build manifest`);
  if (file && eagerCssFiles.includes(file)) failures.push(`${source} is still eager-loaded`);
}

const report = {
  outputDir,
  limits,
  measured: {
    entryJs: { file: entryJs.file, rawKb: kb(entryJs.rawBytes), gzipKb: kb(entryJs.gzipBytes) },
    eagerJsGzipKb,
    eagerCssGzipKb,
    entryAssetsRawKb,
    dynamicEntries: requiredDynamicEntries.map(source => ({ source, file: manifest[source]?.file || null })),
    deferredStyles: requiredDeferredStyles.map(source => ({ source, file: manifest[source]?.file || null })),
  },
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) throw new Error(`Frontend budget failed:\n- ${failures.join('\n- ')}`);
console.log('Frontend performance budgets passed.');
