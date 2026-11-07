import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '..');

async function readIndex() {
  return readFile(path.join(ROOT, 'index.html'), 'utf8');
}

async function exists(rel) {
  try {
    await stat(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

function collectLocalRefs(html) {
  const refs = new Set();
  const attrRe = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    if (/^(https?:|data:|mailto:|javascript:|#)/i.test(raw)) continue;
    refs.add(raw.split('?')[0].replace(/^\.\//, ''));
  }
  return [...refs];
}

test('结构与资源：所有本地引用都存在', async () => {
  const html = await readIndex();
  const refs = collectLocalRefs(html);
  assert.ok(refs.length > 5, '本地引用数量异常: ' + refs.length);

  const missing = [];
  for (const rel of refs) {
    if (!(await exists(rel))) missing.push(rel);
  }
  assert.deepEqual(missing, [], '缺失的本地资源: ' + missing.join(', '));
});

test('结构：4 个移动端分页入口齐全', async () => {
  const html = await readIndex();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const navItems = [...doc.querySelectorAll('#m3MobileNav .nav-item')];
  assert.equal(navItems.length, 4, '底部导航应有 4 个入口');

  const tabs = navItems.map((n) => n.getAttribute('data-tab')).sort();
  assert.deepEqual(tabs, ['cal', 'cases', 'pan', 'setting']);

  // 每个分页目标必须存在
  assert.ok(doc.getElementById('leftPanel'), '缺少 #leftPanel');
  assert.ok(doc.getElementById('rightPanel'), '缺少 #rightPanel');
  assert.ok(doc.querySelector('.calendar-card'), '缺少 .calendar-card');
  assert.ok(doc.querySelector('.controls-card'), '缺少 .controls-card');
  assert.ok(doc.querySelector('.cases-card'), '缺少 .cases-card');
  assert.ok(doc.getElementById('appMainContainer'), '缺少 #appMainContainer');
});

test('结构：id 唯一', async () => {
  const html = await readIndex();
  const dom = new JSDOM(html);
  const ids = [...dom.window.document.querySelectorAll('[id]')].map((e) => e.id);
  const seen = new Set();
  const dup = [];
  for (const id of ids) {
    if (seen.has(id)) dup.push(id);
    seen.add(id);
  }
  assert.deepEqual(dup, [], '重复 id: ' + dup.join(', '));
});

test('集成契约：分页脚本被引入且 app.js 做了委托与原生 SW 守卫', async () => {
  const html = await readIndex();
  assert.match(html, /js\/mobile-pager\.js/, 'index.html 未引入 mobile-pager.js');
  assert.match(html, /css\/pager\.css/, 'index.html 未引入 pager.css');

  const app = await readFile(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(app, /QimenPager/, 'app.js 未接入 QimenPager');
  assert.match(app, /isNativeShell\(\)/, 'app.js 缺少原生环境判定');
  assert.match(
    app,
    /原生环境，跳过 Service Worker 注册/,
    'app.js 缺少原生环境跳过 SW 注册的逻辑'
  );

  const pager = await readFile(path.join(ROOT, 'js', 'mobile-pager.js'), 'utf8');
  for (const fn of ['init', 'go', 'handleBack', 'isMobile', 'refresh']) {
    assert.match(pager, new RegExp(fn + '\\s*:'), `分页引擎缺少导出 ${fn}`);
  }
  assert.match(pager, /data-no-swipe/, '分页引擎缺少滑动抑制标记');
});

test('资源目录：关键业务文件存在且为 ASCII 路径', async () => {
  for (const rel of [
    'js/app.js',
    'js/qimen.js',
    'js/calendar.js',
    'js/database.js',
    'js/raw_keying.json',
    'css/style.css',
    'css/pager.css',
    'js/mobile-pager.js'
  ]) {
    assert.ok(await exists(rel), '缺少 ' + rel);
  }
  const jsFiles = await readdir(path.join(ROOT, 'js'));
  assert.ok(jsFiles.includes('raw_keying.json'));
});
