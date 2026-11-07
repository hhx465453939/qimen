#!/usr/bin/env node
/**
 * 版本号注入（CHG-001 / ADR-009）
 * 规则：versionName 来自 git tag（去掉前缀 v）；versionCode = major*10000 + minor*100 + patch
 * 可用环境变量覆盖：QIMEN_VERSION_NAME / QIMEN_VERSION_CODE
 */
import { execSync } from 'node:child_process';

function gitTag() {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const raw = process.env.QIMEN_VERSION_NAME || gitTag() || '1.0.0';
const versionName = raw.replace(/^v/i, '');
const parts = versionName.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
const [major = 1, minor = 0, patch = 0] = parts;

const versionCode = process.env.QIMEN_VERSION_CODE
  ? parseInt(process.env.QIMEN_VERSION_CODE, 10)
  : major * 10000 + minor * 100 + patch;

if (minor > 99 || patch > 99) {
  console.error('[version] minor/patch 必须 < 100，否则 versionCode 会冲突');
  process.exit(1);
}

if (process.argv.includes('--shell')) {
  console.log(`QIMEN_VERSION_NAME=${versionName}`);
  console.log(`QIMEN_VERSION_CODE=${versionCode}`);
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ versionName, versionCode, source: process.env.QIMEN_VERSION_NAME ? 'env' : 'git-tag' }));
} else {
  console.log(`${versionName} (${versionCode})`);
}
