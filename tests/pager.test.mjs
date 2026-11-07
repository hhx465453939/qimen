import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const PAGER_SRC = await readFile(path.join(ROOT, 'js', 'mobile-pager.js'), 'utf8');

function makeDom({ mobile = true, width = 390, height = 844 } = {}) {
  const dom = new JSDOM(HTML, {
    url: 'https://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.innerWidth = width;
  window.innerHeight = height;
  window.matchMedia = (query) => ({
    matches: mobile && /max-width:\s*900px/.test(query),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; }
  });

  window.eval(PAGER_SRC);

  const main = window.document.getElementById('appMainContainer');
  main.getBoundingClientRect = () => ({ top: 64, left: 0, right: width, bottom: height, width, height: height - 64 });
  const nav = window.document.getElementById('m3MobileNav');
  Object.defineProperty(nav, 'offsetHeight', { value: 64, configurable: true });

  return { dom, window, doc: window.document };
}

function visible(el) {
  return el && el.style.display !== 'none';
}

let ctx;

beforeEach(() => {
  ctx = makeDom();
});

test('初始化：移动端进入分页模式，默认停在排盘页', () => {
  const { window, doc } = ctx;
  window.QimenPager.init({});

  assert.equal(window.QimenPager.current(), 'pan');
  assert.ok(doc.body.classList.contains('pager-mode'), 'body 应带 pager-mode');
  assert.equal(visible(doc.getElementById('leftPanel')), true);
  assert.equal(visible(doc.getElementById('rightPanel')), false);

  const active = doc.querySelector('#m3MobileNav .nav-item.active');
  assert.equal(active.getAttribute('data-tab'), 'pan');
});

test('切页：万年历/设局/案例互斥显示，导航与 hash 同步', () => {
  const { window, doc } = ctx;
  window.QimenPager.init({});

  for (const page of ['cal', 'setting', 'cases']) {
    window.QimenPager.go(page);
    assert.equal(window.QimenPager.current(), page);

    assert.equal(visible(doc.getElementById('leftPanel')), false, page + ' 应隐藏左栏');
    assert.equal(visible(doc.getElementById('rightPanel')), true, page + ' 应显示右栏');

    const map = { cal: '.calendar-card', setting: '.controls-card', cases: '.cases-card' };
    for (const [key, sel] of Object.entries(map)) {
      assert.equal(visible(doc.querySelector(sel)), key === page, `${page} 页 ${sel} 显隐错误`);
    }

    assert.equal(doc.querySelector('#m3MobileNav .nav-item.active').getAttribute('data-tab'), page);
    assert.equal(window.location.hash, '#/' + page);
    assert.equal(window.localStorage.getItem('qimen.pager.page'), page);
  }
});

test('返回键：非首页回排盘并返回 handled，首页返回 exit', () => {
  const { window } = ctx;
  window.QimenPager.init({});

  window.QimenPager.go('cases');
  assert.equal(window.QimenPager.handleBack(), 'handled');
  assert.equal(window.QimenPager.current(), 'pan');
  assert.equal(window.QimenPager.handleBack(), 'exit');
});

test('冷启动：恢复上次所在页（localStorage）', () => {
  const { window, doc } = ctx;
  window.localStorage.setItem('qimen.pager.page', 'setting');
  window.QimenPager.init({});
  assert.equal(window.QimenPager.current(), 'setting');
  assert.equal(visible(doc.querySelector('.controls-card')), true);
});

test('桌面端：不启用分页，且清空分页写入的内联样式', () => {
  const desk = makeDom({ mobile: false, width: 1280, height: 900 });
  const { window, doc } = desk;
  window.QimenPager.init({});
  assert.equal(window.QimenPager.isMobile(), false);
  assert.ok(!doc.body.classList.contains('pager-mode'));

  for (const el of [doc.getElementById('appMainContainer'), doc.getElementById('leftPanel'), doc.getElementById('rightPanel')]) {
    assert.equal(el.style.display, '', '桌面端不应残留内联 display');
    assert.equal(el.style.height, '', '桌面端不应残留内联 height');
  }
});

test('滑动：左滑进入下一页，弹窗打开时不触发', () => {
  const { window, doc } = ctx;
  window.QimenPager.init({});

  const main = doc.getElementById('appMainContainer');
  const fire = (type, x, y) => {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    const touch = { clientX: x, clientY: y };
    ev.touches = type === 'touchstart' ? [touch] : [];
    ev.changedTouches = type === 'touchend' ? [touch] : [];
    main.dispatchEvent(ev);
  };

  // 左滑：pan -> cal
  fire('touchstart', 320, 400);
  fire('touchend', 120, 400);
  assert.equal(window.QimenPager.current(), 'cal');

  // 弹窗打开：sliding 应被忽略
  const scrim = doc.querySelector('.m3-dialog-scrim');
  scrim.classList.add('open');
  fire('touchstart', 320, 400);
  fire('touchend', 120, 400);
  assert.equal(window.QimenPager.current(), 'cal', '弹窗打开时不应切页');

  // 右滑：cal -> pan
  scrim.classList.remove('open');
  fire('touchstart', 120, 400);
  fire('touchend', 320, 400);
  assert.equal(window.QimenPager.current(), 'pan');
});

test('切页保留各页独立滚动位置', () => {
  const { window, doc } = ctx;
  window.QimenPager.init({});

  const left = doc.getElementById('leftPanel');
  left.scrollTop = 240;
  window.QimenPager.go('cal');
  assert.equal(left.scrollTop, 240, '离开时应记录滚动位置');

  const right = doc.getElementById('rightPanel');
  right.scrollTop = 99;
  window.QimenPager.go('pan');
  assert.equal(right.scrollTop, 99, '离开右栏应记录滚动位置');
});
