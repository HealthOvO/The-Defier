#!/usr/bin/env node

import { spawn } from 'node:child_process';

const [, , timeoutSecondsArg, killAfterSecondsArg, ...command] = process.argv;

const timeoutSeconds = Number(timeoutSecondsArg);
const killAfterSeconds = Number(killAfterSecondsArg);

if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
  console.error('[run_with_timeout] timeoutSeconds must be a positive number');
  process.exit(2);
}

if (!Number.isFinite(killAfterSeconds) || killAfterSeconds <= 0) {
  console.error('[run_with_timeout] killAfterSeconds must be a positive number');
  process.exit(2);
}

if (command.length === 0) {
  console.error('[run_with_timeout] missing command');
  process.exit(2);
}

const supportsProcessGroups = process.platform !== 'win32';
const child = spawn(command[0], command.slice(1), {
  stdio: 'inherit',
  detached: supportsProcessGroups
});

let timedOut = false;
let finished = false;
let killTimer = null;

const safeKill = (signal) => {
  if (finished) {
    return;
  }

  try {
    if (supportsProcessGroups) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (error) {
    if (error && error.code !== 'ESRCH') {
      console.error(`[run_with_timeout] failed to send ${signal}: ${error.message}`);
    }
  }
};

const timeoutTimer = setTimeout(() => {
  timedOut = true;
  console.error(
    `[run_with_timeout] timeout after ${timeoutSeconds}s: ${command.join(' ')}`
  );
  safeKill('SIGTERM');
  killTimer = setTimeout(() => {
    console.error(
      `[run_with_timeout] force-kill after ${killAfterSeconds}s grace: ${command.join(' ')}`
    );
    safeKill('SIGKILL');
  }, killAfterSeconds * 1000);
}, timeoutSeconds * 1000);

child.on('error', (error) => {
  clearTimeout(timeoutTimer);
  if (killTimer) {
    clearTimeout(killTimer);
  }
  console.error(`[run_with_timeout] failed to start command: ${error.message}`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  finished = true;
  clearTimeout(timeoutTimer);
  if (killTimer) {
    clearTimeout(killTimer);
  }

  if (timedOut) {
    process.exit(124);
  }

  if (signal) {
    console.error(`[run_with_timeout] command exited via signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
