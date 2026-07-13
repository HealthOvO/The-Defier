const fs = require('fs');
const path = require('path');

const outputRoot = process.argv[2];
const baseUrl = process.argv[3] || process.env.BASE_URL || '';

if (!outputRoot) {
  console.error('Usage: node tests/summarize_browser_release_reports.cjs <output-root> [base-url]');
  process.exit(1);
}

const root = path.resolve(outputRoot);
const requiredReleaseRunId = String(process.env.BROWSER_RELEASE_RUN_ID || '').trim();

const EXPECTED_RELEASE_MODULES = [
  'core',
  'feature',
  'automation-boot',
  'map-overview-risk',
  'ui-gallery',
  'frontend-layout',
  'backend-client',
  'auth-ui-cloud',
  'account-social-real',
  'mobile',
  'reward-mobile',
  'meta',
  'chapter-flow',
  'run-path',
  'run-path-events',
  'run-path-reward',
  'dongfu',
  'challenge',
  'season-ops',
  'authoritative-runs-real',
  'relay-expedition-real',
  'expedition',
  'events',
  'vow-choice',
  'guide',
  'inheritance',
  'pvp',
  'pvp-live',
  'pvp-live-real',
  'pvp-live-mobile-real',
  'pvp-mobile',
  'pvp-mobile-result',
  'challenge-mobile-flow',
];
function parseExpectedReleaseModules(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

const expectedReleaseModulesFromEnv = parseExpectedReleaseModules(process.env.EXPECTED_RELEASE_MODULES);
const activeExpectedReleaseModules = expectedReleaseModulesFromEnv.length
  ? expectedReleaseModulesFromEnv
  : EXPECTED_RELEASE_MODULES;
const EXPECTED_RELEASE_MODULE_SET = new Set(activeExpectedReleaseModules);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function readReport(filePath) {
  try {
    const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const stat = fs.statSync(filePath);
    const findings = Array.isArray(report.findings) ? report.findings : [];
    const failedFindings = findings.filter(item => item && item.pass === false);
    const summary = report.summary && typeof report.summary === 'object' ? report.summary : {};
    const consoleErrors = Array.isArray(report.consoleErrors)
      ? report.consoleErrors
      : Array.isArray(summary.consoleErrors)
        ? summary.consoleErrors
        : [];
    const relativePath = path.relative(root, filePath);
    const moduleName = path.dirname(relativePath).replace(/\\/g, '/');
    const releaseRunId = String(report.releaseRunId || '').trim();
    const stale = !!requiredReleaseRunId && releaseRunId !== requiredReleaseRunId;
    return {
      ok: !stale,
      module: moduleName === '.' ? 'root' : moduleName,
      path: relativePath,
      url: report.url || report.baseUrl || summary.url || baseUrl || '',
      generatedAt: report.generatedAt || report.timestamp || stat.mtime.toISOString(),
      releaseRunId,
      totalFindings: findings.length || Number(summary.total || 0),
      failedFindings: failedFindings.length || Number(summary.failed || 0) || (stale ? 1 : 0),
      consoleErrors: consoleErrors.length,
      parseError: stale ? `stale release report: expected ${requiredReleaseRunId || '(none)'}, got ${releaseRunId || '(missing)'}` : '',
      failureNames: [
        ...failedFindings.map(item => item.name || `${item.viewport || ''}:${item.scenario || ''}`.replace(/^:/, '')),
        ...(stale ? ['stale-release-report'] : [])
      ]
    };
  } catch (error) {
    return {
      ok: false,
      module: path.dirname(path.relative(root, filePath)).replace(/\\/g, '/'),
      path: path.relative(root, filePath),
      parseError: error.message,
      totalFindings: 0,
      failedFindings: 1,
      consoleErrors: 0,
      failureNames: ['report-parse-error']
    };
  }
}

const reportFiles = walk(root)
  .filter(filePath => path.basename(filePath) === 'report.json')
  .filter(filePath => path.resolve(filePath) !== path.join(root, 'report.json'))
  .sort();

const reports = reportFiles.map(readReport);
const screenshotCount = activeExpectedReleaseModules
  .map(module => path.join(root, module))
  .filter(moduleDir => fs.existsSync(moduleDir) && fs.statSync(moduleDir).isDirectory())
  .flatMap(moduleDir => walk(moduleDir))
  .filter(filePath => /\.(png|jpg|jpeg|webp)$/i.test(filePath))
  .length;
const moduleCounts = reports.reduce((counts, report) => {
  counts[report.module] = (counts[report.module] || 0) + 1;
  return counts;
}, {});
const missingModules = activeExpectedReleaseModules.filter(module => !moduleCounts[module]);
const unknownModules = reports
  .map(report => report.module)
  .filter(module => !EXPECTED_RELEASE_MODULE_SET.has(module));
const duplicateModules = Object.entries(moduleCounts)
  .filter(([, count]) => count > 1)
  .map(([module]) => module);
const structuralFailures = [
  ...missingModules.map(module => ({
    ok: false,
    module,
    path: path.join(module, 'report.json'),
    parseError: 'missing expected release report',
    totalFindings: 0,
    failedFindings: 1,
    consoleErrors: 0,
    failureNames: ['missing-release-report'],
  })),
  ...duplicateModules.map(module => ({
    ok: false,
    module,
    path: `${module}/report.json`,
    parseError: 'duplicate release report module',
    totalFindings: 0,
    failedFindings: 1,
    consoleErrors: 0,
    failureNames: ['duplicate-release-report'],
  })),
  ...unknownModules.map(module => ({
    ok: false,
    module,
    path: `${module}/report.json`,
    parseError: 'unexpected release report module',
    totalFindings: 0,
    failedFindings: 1,
    consoleErrors: 0,
    failureNames: ['unexpected-release-report'],
  })),
];
const failedReports = [
  ...reports.filter(report => !report.ok || report.failedFindings > 0 || report.consoleErrors > 0),
  ...structuralFailures,
];

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  outputRoot: root,
  releaseRunId: requiredReleaseRunId,
  expectedReportCount: activeExpectedReleaseModules.length,
  reportCount: reports.length,
  totalFindings: reports.reduce((sum, report) => sum + report.totalFindings, 0),
  failedFindings: reports.reduce((sum, report) => sum + report.failedFindings, 0),
  consoleErrors: reports.reduce((sum, report) => sum + report.consoleErrors, 0),
  screenshotCount,
  failedReportCount: failedReports.length,
  missingModules,
  duplicateModules,
  unknownModules,
  modules: reports.map(report => report.module)
};

const aggregate = {
  url: baseUrl,
  generatedAt: summary.generatedAt,
  releaseRunId: requiredReleaseRunId,
  summary,
  reports
};

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(aggregate, null, 2));

const markdown = [
  '# Browser Release Audit Summary',
  '',
  `Generated: ${summary.generatedAt}`,
  `Base URL: ${baseUrl || '(not provided)'}`,
  `Reports: ${summary.reportCount}`,
  `Expected reports: ${summary.expectedReportCount}`,
  `Findings: ${summary.totalFindings}`,
  `Failed findings: ${summary.failedFindings}`,
  `Console errors: ${summary.consoleErrors}`,
  `Screenshots: ${summary.screenshotCount}`,
  `Missing modules: ${summary.missingModules.length ? summary.missingModules.join(', ') : '(none)'}`,
  `Duplicate modules: ${summary.duplicateModules.length ? summary.duplicateModules.join(', ') : '(none)'}`,
  `Unexpected modules: ${summary.unknownModules.length ? summary.unknownModules.join(', ') : '(none)'}`,
  '',
  '| Module | Findings | Failed | Console Errors | Timestamp |',
  '| --- | ---: | ---: | ---: | --- |',
  ...reports.map(report => `| ${report.module} | ${report.totalFindings} | ${report.failedFindings} | ${report.consoleErrors} | ${report.generatedAt || '(none)'} |`)
].join('\n');

fs.writeFileSync(path.join(root, 'summary.md'), `${markdown}\n`);

if (failedReports.length > 0) {
  console.error(`Browser release summary found ${failedReports.length} failing report(s).`);
  console.error(JSON.stringify(failedReports, null, 2));
  process.exit(1);
}

console.log(`Browser release summary written: ${path.join(root, 'report.json')}`);
