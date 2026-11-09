/**
 * 移动端分页引擎（CHG-001 / ADR-004）
 * 设计原则：不改 DOM 树，只在 ≤900px 时接管「可见性 + 独立滚动 + 切页交互」。
 * 桌面 ≥901px 完全退出，清空所有内联样式，保持原双栏布局。
 */
(function (global) {
  'use strict';

  var PAGES = ['pan', 'cal', 'setting', 'cases'];
  var MOBILE_MAX = 900;
  var STORAGE_KEY = 'qimen.pager.page';
  var SWIPE_MIN = 55;          // 横向位移阈值(px)
  var SWIPE_RATIO = 1.2;       // 横向必须明显大于纵向

  var CARDS = {
    cal: '.calendar-card',
    setting: '.controls-card',
    cases: '.cases-card'
  };

  var state = {
    inited: false,
    page: 'pan',
    mobile: false,
    opts: {},
    scroll: {},        // page -> scrollTop
    bound: {},
    lastApplied: null
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function els() {
    return {
      main: document.getElementById('appMainContainer'),
      left: document.getElementById('leftPanel'),
      right: document.getElementById('rightPanel'),
      nav: document.getElementById('m3MobileNav'),
      cards: {
        cal: $(CARDS.cal),
        setting: $(CARDS.setting),
        cases: $(CARDS.cases)
      }
    };
  }

  function isMobile() {
    if (typeof global.matchMedia === 'function') {
      return global.matchMedia('(max-width: ' + MOBILE_MAX + 'px)').matches;
    }
    return typeof global.innerWidth === 'number' && global.innerWidth <= MOBILE_MAX;
  }

  function normalize(page) {
    return PAGES.indexOf(page) >= 0 ? page : null;
  }

  function readHash() {
    var m = /^#\/(pan|cal|setting|cases)$/.exec(global.location && global.location.hash || '');
    return m ? m[1] : null;
  }

  function readStored() {
    try {
      return normalize(global.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function store(page) {
    try { global.localStorage.setItem(STORAGE_KEY, page); } catch (e) { /* 隐私模式忽略 */ }
  }

  function anyModalOpen() {
    if (typeof state.opts.isModalOpen === 'function') {
      try { return !!state.opts.isModalOpen(); } catch (e) { /* 落到默认判断 */ }
    }
    return !!document.querySelector('.m3-dialog-scrim.open');
  }

  function activeScroller() {
    var e = els();
    if (state.page === 'pan') return e.left;
    return e.right;
  }

  function saveScroll() {
    var sc = activeScroller();
    if (sc) state.scroll[state.page] = sc.scrollTop || 0;
  }

  function restoreScroll(page) {
    var e = els();
    var sc = page === 'pan' ? e.left : e.right;
    if (!sc) return;
    var y = state.scroll[page] || 0;
    // 下一帧再设，等 display 生效
    var raf = global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(function () { sc.scrollTop = y; });
  }

  function layout() {
    var e = els();
    if (!e.main) return;
    if (!state.mobile) return;
    var nav = e.nav;
    var navH = nav ? nav.offsetHeight || 0 : 0;
    var vh = global.innerHeight || 800;
    var top = e.main.getBoundingClientRect ? e.main.getBoundingClientRect().top : 0;
    var safePad = 8;
    var h = vh - top - navH - safePad;
    if (h < 240) h = 240; // 极端情况兜底，避免负高度
    // 高度必须由 CSS 变量 + !important 锁死：
    // 光设内联 height 会被 flex 子项的 min-height:auto 按内容高度顶掉
    // （真机实测：设 749px → 实际 1448px → 面板无滚动余量 → 滑动无反应）
    var root = document.documentElement;
    if (root && root.style && root.style.setProperty) {
      root.style.setProperty('--qimen-vh', Math.round(vh) + 'px');
      root.style.setProperty('--qimen-pager-height', Math.round(h) + 'px');
    }
    // 内联值仅作 CSS 丢失时的兜底
    e.main.style.height = Math.round(h) + 'px';
    e.main.style.overflow = 'hidden';
  }

  function paint() {
    var e = els();
    var page = state.page;

    // 面板显隐
    if (e.left) e.left.style.display = page === 'pan' ? 'flex' : 'none';
    if (e.right) e.right.style.display = page === 'pan' ? 'none' : 'flex';

    // 右栏内三张卡片互斥
    Object.keys(e.cards).forEach(function (key) {
      var card = e.cards[key];
      if (!card) return;
      card.style.display = page === key ? 'flex' : 'none';
    });

    // 导航 active 态
    if (e.nav) {
      $all('.nav-item', e.nav).forEach(function (item) {
        var on = item.getAttribute('data-tab') === page;
        item.classList.toggle('active', on);
        item.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    // 过渡动画（尊重减少动效偏好）
    var scroller = activeScroller();
    if (scroller && state.lastApplied && state.lastApplied !== page && !prefersReducedMotion()) {
      scroller.classList.remove('pager-enter');
      void scroller.offsetWidth;
      scroller.classList.add('pager-enter');
    }
    state.lastApplied = page;
  }

  function prefersReducedMotion() {
    return typeof global.matchMedia === 'function' &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function cleanupDesktop() {
    var e = els();
    document.body.classList.remove('pager-mode');
    var root = document.documentElement;
    if (root && root.style && root.style.removeProperty) {
      root.style.removeProperty('--qimen-vh');
      root.style.removeProperty('--qimen-pager-height');
    }
    [e.main, e.left, e.right].forEach(function (el) {
      if (!el) return;
      el.style.height = '';
      el.style.overflow = '';
      el.style.display = '';
    });
    Object.keys(e.cards).forEach(function (k) {
      if (e.cards[k]) e.cards[k].style.display = '';
    });
  }

  function apply() {
    var mobile = isMobile();
    state.mobile = mobile;
    if (!mobile) {
      cleanupDesktop();
      return;
    }
    document.body.classList.add('pager-mode');
    layout();
    paint();
  }

  function go(page, options) {
    var target = normalize(page);
    if (!target) return false;
    options = options || {};
    var e = els();
    if (!e.main) return false;

    state.mobile = isMobile();

    if (!state.mobile) {
      // 桌面不接管；若调用方仍要切 tab，交给兼容回调
      if (typeof state.opts.onLegacySwitch === 'function') state.opts.onLegacySwitch(target);
      return true;
    }

    if (target === state.page && state.lastApplied === target) {
      if (options.updateHash !== false) writeHash(target);
      return true;
    }

    saveScroll();
    state.page = target;
    store(target);
    layout();
    paint();
    restoreScroll(target);
    if (options.updateHash !== false) writeHash(target);
    if (typeof state.opts.onAfterSwitch === 'function') {
      try { state.opts.onAfterSwitch(target); } catch (err) { console.error('[pager] onAfterSwitch 失败', err); }
    }
    return true;
  }

  function writeHash(page) {
    if (!global.history || !global.history.replaceState) return;
    var next = '#/' + page;
    if (global.location.hash === next) return;
    try { global.history.replaceState(null, '', next); } catch (e) { /* file:// 下忽略 */ }
  }

  function step(delta) {
    var i = PAGES.indexOf(state.page);
    var next = PAGES[i + delta];
    if (next) go(next);
  }

  function isHorizontalScroller(node, dir) {
    var el = node;
    var depth = 0;
    while (el && el !== document.body && depth < 8) {
      if (el.scrollWidth > el.clientWidth + 8) {
        var style = global.getComputedStyle ? global.getComputedStyle(el) : null;
        var ox = style && style.overflowX;
        if (ox === 'auto' || ox === 'scroll') {
          var max = el.scrollWidth - el.clientWidth;
          var atStart = el.scrollLeft <= 1;
          var atEnd = el.scrollLeft >= max - 1;
          // 只有「这个方向真的还能继续滚」才把手指让给容器；
          // 已经到边界就交回分页，否则表格会永久吞掉横向滑动
          if ((dir < 0 && !atEnd) || (dir > 0 && !atStart)) return true;
        }
      }
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  function bindSwipe() {
    var e = els();
    if (!e.main) return;
    var startX = 0, startY = 0, lastX = 0, lastY = 0, tracking = false;

    function onStart(ev) {
      if (!state.mobile || anyModalOpen()) { tracking = false; return; }
      var t = ev.touches && ev.touches[0];
      if (!t) { tracking = false; return; }
      if (ev.target && ev.target.closest &&
          ev.target.closest('input, select, textarea, .m3-slider, [data-no-swipe]')) {
        tracking = false; return;
      }
      startX = lastX = t.clientX;
      startY = lastY = t.clientY;
      tracking = true;
    }

    // 记录最新位置：Android 被原生滚动接管时可能不发 touchend，只能靠它兜底
    function onMove(ev) {
      if (!tracking) return;
      var t = ev.touches && ev.touches[0];
      if (!t) return;
      lastX = t.clientX;
      lastY = t.clientY;
    }

    function finish(ev) {
      if (!tracking) return;
      tracking = false;
      var t = (ev && ev.changedTouches && ev.changedTouches[0]) || null;
      var endX = t ? t.clientX : lastX;
      var endY = t ? t.clientY : lastY;
      var dx = endX - startX;
      var dy = endY - startY;
      if (Math.abs(dx) < SWIPE_MIN) return;              // 位移不足：当点击/滚动
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return; // 纵向为主：不切页
      if (ev && ev.target && isHorizontalScroller(ev.target, dx < 0 ? -1 : 1)) return;
      step(dx < 0 ? 1 : -1);
    }

    e.main.addEventListener('touchstart', onStart, { passive: true });
    e.main.addEventListener('touchmove', onMove, { passive: true });
    e.main.addEventListener('touchend', finish, { passive: true });
    e.main.addEventListener('touchcancel', finish, { passive: true });
    state.bound.swipeStart = onStart;
    state.bound.swipeMove = onMove;
    state.bound.swipeEnd = finish;
  }

  function bindNav() {
    var e = els();
    if (!e.nav) return;
    var handler = function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.nav-item[data-tab]') : null;
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      if (!state.mobile) return; // 桌面导航隐藏，不介入
      ev.preventDefault();
      go(tab);
    };
    e.nav.addEventListener('click', handler);
    state.bound.nav = handler;
  }

  function bindResize() {
    var handler = function () {
      var wasMobile = state.mobile;
      var nowMobile = isMobile();
      if (wasMobile !== nowMobile) {
        state.mobile = nowMobile;
        apply();
        return;
      }
      if (nowMobile) {
        layout();
        // 旋转后 innerHeight 可能延迟更新，补一次重算
        setTimeout(layout, 260);
      }
    };
    global.addEventListener('resize', handler);
    global.addEventListener('orientationchange', handler);
    state.bound.resize = handler;
  }

  function bindHash() {
    var handler = function () {
      var page = readHash();
      if (page && page !== state.page) go(page, { updateHash: false });
    };
    global.addEventListener('hashchange', handler);
    global.addEventListener('popstate', handler);
    state.bound.hash = handler;
  }

  function init(opts) {
    state.opts = opts || {};
    if (state.inited) { apply(); return; }
    state.inited = true;

    var initial = readHash() || readStored() || 'pan';
    state.page = normalize(initial) || 'pan';

    bindNav();
    bindSwipe();
    bindResize();
    bindHash();
    apply();
    writeHash(state.page);
  }

  function handleBack() {
    if (!isMobile()) return 'exit';
    if (state.page !== 'pan') {
      go('pan');
      return 'handled';
    }
    return 'exit';
  }

  function destroy() {
    var e = els();
    var b = state.bound;
    if (e.nav && b.nav) e.nav.removeEventListener('click', b.nav);
    if (e.main && b.swipeStart) e.main.removeEventListener('touchstart', b.swipeStart);
    if (e.main && b.swipeMove) e.main.removeEventListener('touchmove', b.swipeMove);
    if (e.main && b.swipeEnd) {
      e.main.removeEventListener('touchend', b.swipeEnd);
      e.main.removeEventListener('touchcancel', b.swipeEnd);
    }
    if (b.resize) {
      global.removeEventListener('resize', b.resize);
      global.removeEventListener('orientationchange', b.resize);
    }
    if (b.hash) {
      global.removeEventListener('hashchange', b.hash);
      global.removeEventListener('popstate', b.hash);
    }
    cleanupDesktop();
    state.inited = false;
    state.bound = {};
  }

  global.QimenPager = {
    PAGES: PAGES.slice(),
    init: init,
    go: go,
    current: function () { return state.page; },
    handleBack: handleBack,
    isMobile: isMobile,
    refresh: apply,
    destroy: destroy
  };
})(typeof window !== 'undefined' ? window : this);
