// 真实触摸诊断（不是 dispatchEvent 造假事件）
// 用法: node tests/diag/touch-diag.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const CHROME = process.env.QIMEN_CHROMIUM_PATH;
const URL = process.env.QIMEN_URL || 'http://127.0.0.1:8099/index.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function touchDrag(cdp, from, to, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, radiusX: 5, radiusY: 5, force: 1 }]
  });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 5, radiusY: 5, force: 1 }]
    });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox']
});
const context = await browser.newContext({
  viewport: { width: 393, height: 873 },   // 红米 Note 12 近似
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; 22111317C) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'load' });
await sleep(600);

const metrics = await page.evaluate(() => {
  const pick = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      position: cs.position,
      height: cs.height,
      overflowY: cs.overflowY,
      overflowX: cs.overflowX,
      touchAction: cs.touchAction,
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
      rectTop: Math.round(el.getBoundingClientRect().top),
      rectH: Math.round(el.getBoundingClientRect().height),
      inlineH: el.style.height || '',
      inlineOverflow: el.style.overflow || ''
    };
  };
  return {
    innerHeight: window.innerHeight,
    docScrollH: document.documentElement.scrollHeight,
    bodyScrollH: document.body.scrollHeight,
    bodyOverflow: getComputedStyle(document.body).overflow,
    bodyClass: document.body.className,
    pagerMode: document.body.classList.contains('pager-mode'),
    main: pick(document.getElementById('appMainContainer')),
    grid: pick(document.querySelector('.main-grid')),
    left: pick(document.getElementById('leftPanel')),
    right: pick(document.getElementById('rightPanel')),
    nav: pick(document.getElementById('m3MobileNav')),
    page: window.QimenPager ? window.QimenPager.current() : 'n/a'
  };
});

console.log('=== 尺寸/样式 ===');
console.log(JSON.stringify(metrics, null, 2));

const flexInfo = await page.evaluate(() => {
  const info = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      display: s.display,
      flexDirection: s.flexDirection,
      flex: s.flex,
      flexGrow: s.flexGrow,
      flexShrink: s.flexShrink,
      flexBasis: s.flexBasis,
      minHeight: s.minHeight,
      height: s.height,
      overflowY: s.overflowY
    };
  };
  const main = document.getElementById('appMainContainer');
  return {
    html: info(document.documentElement),
    body: info(document.body),
    mainParent: info(main.parentElement),
    main: info(main),
    left: info(document.getElementById('leftPanel'))
  };
});
console.log('\n=== flex / min-height 实况 ===');
console.log(JSON.stringify(flexInfo, null, 2));

const cdp = await context.newCDPSession(page);

// 0) 找出到底是谁覆盖了内联高度
const rules = await page.evaluate(() => {
  const hits = [];
  const walk = (list, media) => {
    for (const r of list) {
      if (r.cssRules) { walk(r.cssRules, r.conditionText || media); continue; }
      if (!r.selectorText) continue;
      if (!/app-content|appMainContainer|left-column|right-column|main-grid/.test(r.selectorText)) continue;
      for (const prop of ['height', 'min-height', 'max-height', 'overflow', 'overflow-y', 'flex']) {
        const v = r.style.getPropertyValue(prop);
        if (!v) continue;
        hits.push({
          media: media || 'all',
          selector: r.selectorText,
          prop,
          value: v,
          important: r.style.getPropertyPriority(prop) === 'important'
        });
      }
    }
  };
  for (const s of document.styleSheets) {
    try { walk(s.cssRules, null); } catch (e) { /* 跨域样式表忽略 */ }
  }
  return hits.filter((h) => h.prop !== 'flex' || h.important || /appMainContainer|app-content/.test(h.selector));
});
console.log('\n=== 影响高度的 CSS 规则 ===');
for (const r of rules) {
  console.log(`  ${r.important ? '❗important' : '         '} [${r.media}] ${r.selector} { ${r.prop}: ${r.value} }`);
}

// 1) 纵向手势：手指自下往上推，期望页面内容滚动
const vBefore = await page.evaluate(() => {
  const el = document.getElementById('leftPanel');
  return { scrollTop: el.scrollTop, max: el.scrollHeight - el.clientHeight };
});
await touchDrag(cdp, { x: 196, y: 700 }, { x: 196, y: 260 }, 12);
const vAfter = await page.evaluate(() => document.getElementById('leftPanel').scrollTop);
console.log('\n=== 纵向手势 ===');
console.log(`leftPanel.scrollTop: ${vBefore.scrollTop} → ${vAfter}（可滚动量 ${vBefore.max}px）`);
console.log(vAfter > vBefore.scrollTop ? '✅ 纵向可滚动' : '❌ 纵向滚动无反应（用户症状）');

// 2) 横向手势：左滑，期望切到下一页
await page.evaluate(() => {
  window.__evlog = [];
  const rec = (tag) => (e) => {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || {};
    window.__evlog.push({
      tag,
      type: e.type,
      x: Math.round(t.clientX || 0),
      y: Math.round(t.clientY || 0),
      target: e.target ? e.target.tagName + '.' + String(e.target.className || '').split(' ')[0] : '-',
      defaultPrevented: e.defaultPrevented
    });
  };
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((type) => {
    document.addEventListener(type, rec('doc'), { passive: true, capture: true });
    document.getElementById('appMainContainer')
      .addEventListener(type, rec('main'), { passive: true, capture: true });
  });
});
await page.evaluate(() => {
  window.__pagerState = {
    isMobile: window.QimenPager.isMobile(),
    matchMedia900: window.matchMedia('(max-width: 900px)').matches,
    innerWidth: window.innerWidth,
    modalOpen: !!document.querySelector('.m3-dialog-scrim.open')
  };
});

const pBefore = await page.evaluate(() => window.QimenPager.current());
await touchDrag(cdp, { x: 320, y: 250 }, { x: 110, y: 250 }, 10);
const pAfter = await page.evaluate(() => window.QimenPager.current());
console.log('\n=== 横向手势①：棋盘区（y=250）===');
console.log(`当前页: ${pBefore} → ${pAfter}`);
console.log(pAfter !== pBefore ? '✅ 棋盘区滑动可翻页' : '❌ 棋盘区滑动仍无反应');

// 横向手势②：表格区，第一次应横滑表格，第二次（到头后）应翻页
await page.evaluate(() => { if (window.QimenPager.current() !== 'setting') window.QimenPager.go('setting'); });
await sleep(300);
const tblBefore = await page.evaluate(() => {
  const el = document.querySelector('.merged-table-responsive');
  return el ? { left: Math.round(el.scrollLeft), max: el.scrollWidth - el.clientWidth, page: window.QimenPager.current() } : null;
});
console.log('\n=== 横向手势②：表格区 ===');
if (!tblBefore) {
  console.log('  （设局页无表格容器，跳过）');
} else {
  for (let i = 1; i <= 3; i++) {
    await touchDrag(cdp, { x: 320, y: 420 }, { x: 110, y: 420 }, 10);
    const st = await page.evaluate(() => {
      const el = document.querySelector('.merged-table-responsive');
      return {
        left: el ? Math.round(el.scrollLeft) : 0,
        max: el ? el.scrollWidth - el.clientWidth : 0,
        page: window.QimenPager.current()
      };
    });
    console.log(`  第${i}次：表格 scrollLeft=${st.left}/${st.max}，当前页=${st.page}`);
    if (st.page !== 'setting') { console.log('  ✅ 表格到头后已能翻页'); break; }
  }
}

const evlog = await page.evaluate(() => window.__evlog || []);
const pagerState = await page.evaluate(() => window.__pagerState);
console.log('\n=== pager 状态 ===');
console.log(JSON.stringify(pagerState, null, 2));
console.log('\n=== 触摸事件流（doc/main 捕获阶段）===');
console.log(`共 ${evlog.length} 条`);
console.log(evlog.slice(0, 6).map((e) => `  ${e.tag}/${e.type} x=${e.x} y=${e.y} target=${e.target}`).join('\n'));
console.log('  ...');
console.log(evlog.slice(-4).map((e) => `  ${e.tag}/${e.type} x=${e.x} y=${e.y} target=${e.target}`).join('\n'));

const probe = await page.evaluate(() => ({
  cssVarHeight: getComputedStyle(document.documentElement).getPropertyValue('--qimen-pager-height').trim(),
  storedPage: (() => { try { return localStorage.getItem('qimen.pager.page'); } catch (e) { return 'n/a'; } })(),
  hash: location.hash,
  current: window.QimenPager.current(),
  bodyClass: document.body.className
}));
console.log('\n=== 探针 A：新代码是否生效 / 是否有 go 痕迹 ===');
console.log(JSON.stringify(probe, null, 2));

// 探针 B：直接调用 go()，看是「go 不工作」还是「手势判定没触发 go」
await page.evaluate(() => window.QimenPager.go('cal'));
await sleep(300);
const afterManual = await page.evaluate(() => ({
  current: window.QimenPager.current(),
  calVisible: !!document.querySelector('.calendar-card') && getComputedStyle(document.querySelector('.calendar-card')).display !== 'none',
  leftVisible: getComputedStyle(document.getElementById('leftPanel')).display !== 'none'
}));
console.log('\n=== 探针 B：手动调用 go("cal") ===');
console.log(JSON.stringify(afterManual, null, 2));
console.log(afterManual.current === 'cal' ? '→ go() 本身正常，问题在手势判定' : '→ go() 本身有 bug');

// 探针 C：列出会被「横向滚动器」守卫误判的容器
await page.evaluate(() => window.QimenPager.go('pan'));
await sleep(250);
const scrollers = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach((el) => {
    if (el.scrollWidth <= el.clientWidth + 4) return;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') return;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').split(' ').slice(0, 2).join('.'),
      id: el.id || '',
      sw: el.scrollWidth,
      cw: el.clientWidth,
      overflowX: cs.overflowX
    });
  });
  return out.slice(0, 12);
});
console.log('\n=== 探针 C：会被误判为横向滚动容器的元素 ===');
console.log(scrollers.length ? JSON.stringify(scrollers, null, 2) : '（无）');

// 3) 命中测试：手指起点处到底是什么元素
const hit = await page.evaluate(() => {
  const el = document.elementFromPoint(196, 420);
  if (!el) return null;
  const chain = [];
  let n = el;
  while (n && n !== document.body && chain.length < 6) {
    const cs = getComputedStyle(n);
    chain.push(`${n.tagName.toLowerCase()}.${(n.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')} ovx=${cs.overflowX} sw=${n.scrollWidth} cw=${n.clientWidth}`);
    n = n.parentElement;
  }
  return chain;
});
console.log('\n=== 触摸点元素链（判断是否被判定为横向滚动器）===');
console.log(hit ? hit.join('\n  ↑ ') : '(无)');

console.log('\n=== 页面 JS 异常 ===');
console.log(errors.length ? errors.join('\n') : '无');

await browser.close();
