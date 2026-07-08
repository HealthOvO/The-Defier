const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const SERVER_DIR = path.resolve(__dirname, '../..');
const SERVICE_NAME = 'the-defier-backend';

let cachedInfo = null;

const readJsonFile = (filePath) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return {};
    }
};

const digestFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(data).digest('hex');
    } catch (error) {
        return 'missing';
    }
};

const resolveGitSha = () => {
    const envSha = process.env.DEFIER_GIT_SHA || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
    if (envSha) return String(envSha).trim();
    try {
        return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 1000
        }).trim();
    } catch (error) {
        return 'unknown';
    }
};

const getStaticRuntimeInfo = () => {
    if (cachedInfo) return cachedInfo;
    const appPackage = readJsonFile(path.join(ROOT_DIR, 'package.json'));
    const serverPackage = readJsonFile(path.join(SERVER_DIR, 'package.json'));
    cachedInfo = {
        service: SERVICE_NAME,
        appVersion: String(appPackage.version || '0.0.0'),
        serverVersion: String(serverPackage.version || '0.0.0'),
        gitSha: resolveGitSha(),
        packageLockDigest: digestFile(path.join(ROOT_DIR, 'package-lock.json')),
        serverPackageLockDigest: digestFile(path.join(SERVER_DIR, 'package-lock.json')),
        nodeVersion: process.version,
        nodeEnv: process.env.NODE_ENV || 'development'
    };
    return cachedInfo;
};

const makeVersionPayload = (schemaStatus) => ({
    status: 'ok',
    generatedAt: Date.now(),
    ...getStaticRuntimeInfo(),
    schema: schemaStatus
});

const makeHealthVersionSummary = () => {
    const info = getStaticRuntimeInfo();
    return {
        service: info.service,
        appVersion: info.appVersion,
        serverVersion: info.serverVersion,
        gitSha: info.gitSha
    };
};

module.exports = {
    SERVICE_NAME,
    getStaticRuntimeInfo,
    makeHealthVersionSummary,
    makeVersionPayload
};
