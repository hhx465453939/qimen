#!/usr/bin/env node
/**
 * 把静态 PWA 资源按白名单复制到 www/（Capacitor webDir）。
 * 单一真源：源文件仍在仓库根，www/ 是生成物（gitignore），绝不反向修改源码。
 * 排除 sw.js：原生壳内 Service Worker 只会缓存陈旧资源。
 */
import { rm, mkdir, cp, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'www');
const INCLUDE = ['index.html', 'css', 'js', 'icons', 'manifest.json', 'favicon.ico'];
const EXCLUDE_NAMES = new Set(['sw.js', '.DS_Store', 'Thumbs.db']);
const EXCLUDE_EXT = new Set(['.map', '.log', '.bak']);

async function copyTree(src, dest) {
  const st = await stat(src);
  if (st.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const name of await readdir(src)) {
      if (EXCLUDE_NAMES.has(name)) continue;
      if (EXCLUDE_EXT.has(path.extname(name))) continue;
      await copyTree(path.join(src, name), path.join(dest, name));
    }
  } else {
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(src, dest);
  }
}

async function walk(dir, acc = []) {
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    const st = await stat(p);
    if (st.isDirectory()) await walk(p, acc);
    else acc.push({ file: path.relative(OUT, p), bytes: st.size });
  }
  return acc;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const item of INCLUDE) {
    await copyTree(path.join(ROOT, item), path.join(OUT, item));
  }

  // 硬性断言：sw.js 绝不能进入原生资源
  const files = await walk(OUT);
  const hasSW = files.some((f) => path.basename(f.file) === 'sw.js');
  if (hasSW) throw new Error('www/ 中出现了 sw.js —— 原生壳不应注册 Service Worker');

  const required = [
    'index.html',
    'css/style.css',
    'css/pager.css',
    'js/app.js',
    'js/qimen.js',
    'js/calendar.js',
    'js/database.js',
    'js/mobile-pager.js',
    'js/raw_keying.json'
  ];
  const present = new Set(files.map((f) => f.file));
  const missing = required.filter((r) => !present.has(r));
  if (missing.length) throw new Error('www/ 缺少必需资源: ' + missing.join(', '));

  const total = files.reduce((s, f) => s + f.bytes, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes: total,
    totalMB: +(total / 1048576).toFixed(2),
    files: files.map((f) => f.file).sort()
  };
  await writeFile(path.join(ROOT, 'dist', 'web-report.json'), JSON.stringify(report, null, 2));

  console.log(`[build:web] ${files.length} 个文件，共 ${report.totalMB} MB → www/`);
  console.log('[build:web] sw.js 已排除 ✓');
}

main().catch((err) => {
  console.error('[build:web][FAIL]', err.message);
  process.exit(1);
});
