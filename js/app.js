// 奇门遁甲专业排盘 PWA 交互与应用主控制器 (Application Controller)

import { CITIES_DATA } from './database.js';
import {
  getLunarDate, JIAZI, xunOf, XUN_SHOU_YI,
  kongwangOf, MA_STAR, TIANGAN, DIZHI
} from './calendar.js';
import {
  paipan, getPalaceAnalysis, formatPlainQimen,
  GONG_CN, SEARCH_PRESETS, matchPatternCondition,
  DIPAN_PALACE_INFO, DOOR_HOME, STAR_HOME,
  JIUGONG_MEMORY_DATA, getStarWangshuaiAnalysis,
  DOOR_ORIGINAL_PALACE, DOOR_ORIGINAL_ELEMENT,
  checkGlobalPatterns, getDoorShengkeAnalysis,
  getYingqiXunKongAnalysis
} from './qimen.js';

// 中文数字
const GONG_NUM = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };

// 应用核心状态
const state = {
  // 当前排盘时刻 (默认 2026年10月20日 21时12分，复刻参考案例)
  year: 2026,
  month: 10,
  day: 20,
  hour: 21,
  minute: 12,
  
  // 地理位置 (读取持久化设置)
  province: localStorage.getItem('qimen_province') || '北京',
  cityName: localStorage.getItem('qimen_city') || '北京 天安门',
  longitude: (() => {
    const v = parseFloat(localStorage.getItem('qimen_longitude'));
    return !isNaN(v) ? v : 116.38;
  })(),

  // 算法选项 (读取持久化设置)
  dingjuMethod: localStorage.getItem('qimen_dingju_method') || 'zhirun', // 'zhirun' | 'chaibu' | 'maoshan'
  paipanMethod: localStorage.getItem('qimen_paipan_method') || 'zhuan',  // 'zhuan' | 'fei'
  manualJu: null,         // null (自动) 或 { dun: '阴', ju: 5 }
  customPillars: null,    // null (自动推算) 或 { year: '丙午', month: '戊戌', day: '丁卯', hour: '辛亥' }
  zishi: localStorage.getItem('qimen_zishi') || 'split',         // 'split' | 'merge'
  showDipan: localStorage.getItem('qimen_show_dipan') === '1',       // 切换地盘全息视图 (默认显示天盘)
  kongLookOpposite: localStorage.getItem('qimen_kong_look_opposite') !== '0', // 旬空看对冲宫开关 (默认 true)
  maskWeakened: localStorage.getItem('qimen_mask_weakened') === '1', // 减弱非用神蒙版效果开关 (默认 false)
  yongshenNature: localStorage.getItem('qimen_yongshen_nature') || 'auto', // 'auto' | 'person_object' | 'affair'

  // UI交互状态 (读取持久化设置)
  selectedGong: 2,        // 默认选中坤二宫
  isSimpleMode: localStorage.getItem('qimen_simple_mode') === '1',
  isGridPickingMode: false, // 盘面手动圈选用神模式 (点击九宫格直接圈选)
  showKeyingDetails: localStorage.getItem('qimen_show_keying_details') === '1', // 默认隐藏天盘干、门状态、地盘干
  keyingOnlyYongShen: false, // 全盘克应速查弹窗中是否过滤只看当前用神
  imageryMode: localStorage.getItem('qimen_imagery_mode') || 'all', // 象意显示模式: 'all' (全部) | 'wu' (物象) | 'ren' (人象)
  currentPan: null,

  // 所问问题与选取用神
  userQuestion: localStorage.getItem('qimen_user_question') || '',
  selectedYongShen: (() => {
    try {
      const raw = localStorage.getItem('qimen_selected_yongshen');
      const manuallyCleared = localStorage.getItem('qimen_zhifu_manually_cleared') === '1';
      if (!raw) return ['值符'];
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        if (!manuallyCleared && !saved.includes('值符')) {
          saved.unshift('值符');
        }
        return saved;
      }
      return ['值符'];
    } catch {
      return ['值符'];
    }
  })(),
  
  // 万年历当前浏览年月
  calViewYear: 2026,
  calViewMonth: 10
};

// 初始化入口
document.addEventListener('DOMContentLoaded', () => {
  // 恢复保存的主题
  const savedTheme = localStorage.getItem('qimen_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // 恢复简洁模式
  if (state.isSimpleMode) {
    document.body.classList.add('simple-mode');
    const btnSimple = document.getElementById('btnToggleSimple');
    if (btnSimple) btnSimple.textContent = '完整模式';
  }

  initServiceWorker();
  initLocationSelectors();
  initDateTimeSelectors();
  initControls();
  initCalendar();
  initPalaceInteractions();
  initCasesStorage();
  initLiveClock();
  initPatternSearch();
  initYongShenModal();
  initManualInputModal();
  initShiganSwitchDelegation();
  initSettingsModal();

  // 原生/网页环境标记 + 移动端分页初始化（CHG-001）
  document.documentElement.classList.add(isNativeShell() ? 'native-shell' : 'web-shell');
  initMobilePager();

  // 首次运行排盘
  executePaipan();
  window.__qimen_state = state;
  window.__qimen_renderNinePalaces = renderNinePalaces;
});

// 十干克应按键切换全局事件委托
function initShiganSwitchDelegation() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.shigan-switch-btn');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const group = btn.closest('.shigan-btn-group');
    if (!group) return;
    const idx = parseInt(btn.dataset.idx, 10);

    group.querySelectorAll('.shigan-switch-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (row.dataset.shiganItems) {
      try {
        const items = JSON.parse(row.dataset.shiganItems);
        const item = items[idx];
        if (item) {
          const descEl = row.querySelector('.shigan-desc-display');
          if (descEl) descEl.textContent = item.content;
          const statusEl = row.querySelector('.shigan-live-status');
          if (statusEl) {
            statusEl.textContent = item.status;
            statusEl.className = `merged-status-badge ${item.statusClass} shigan-live-status`;
          }
        }
      } catch (err) {
        console.warn('Switch shigan item error:', err);
      }
    }
  });
}

// 0. 运行环境判定 + 移动端分页（CHG-001）
function isNativeShell() {
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());
}

function initMobilePager() {
  if (!window.QimenPager) {
    console.warn('[pager] mobile-pager.js 未加载，保留原有移动端 tab 行为');
    return;
  }

  window.QimenPager.init({
    isModalOpen: () => !!document.querySelector('.m3-dialog-scrim.open')
  });

  // 安卓返回键优先级：关弹窗 → 回排盘页 → 交系统退出
  const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (capApp && typeof capApp.addListener === 'function') {
    capApp.addListener('backButton', () => {
      const openScrim = document.querySelector('.m3-dialog-scrim.open');
      if (openScrim) {
        openScrim.classList.remove('open');
        return;
      }
      if (window.QimenPager.handleBack() === 'handled') return;
      if (typeof capApp.exitApp === 'function') capApp.exitApp();
    });
  }
}

// 1. Service Worker 注册 (PWA 离线支持与自动热更新)
function initServiceWorker() {
  // 原生壳内不注册 SW：资源已打进 APK，SW 只会缓存陈旧版本
  if (isNativeShell()) {
    console.log('[PWA] 原生环境，跳过 Service Worker 注册');
    return;
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[PWA] Service Worker Registered successfully:', reg.scope);
        // 主动探测远端版本更新
        if (typeof reg.update === 'function') {
          reg.update().catch(() => {});
        }
      })
      .catch(err => console.warn('[PWA] Service Worker registration failed:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  // 绑定设置弹窗中的“检查更新”按钮
  const btnForceUpdate = document.getElementById('btnForceUpdateApp');
  if (btnForceUpdate) {
    btnForceUpdate.addEventListener('click', async () => {
      btnForceUpdate.textContent = '更新中...';
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch (e) {
        console.warn('[PWA] Clear cache error:', e);
      }
      window.location.href = window.location.pathname + '?v=' + Date.now();
    });
  }
}

// 2. 全国省市与经度下拉联动初始化
function initLocationSelectors() {
  const selProv = document.getElementById('selProvince');
  const selCity = document.getElementById('selCity');
  const numLon = document.getElementById('numLongitude');

  selProv.innerHTML = '';
  CITIES_DATA.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.province;
    opt.textContent = p.province;
    if (p.province === (state.province || '北京')) opt.selected = true;
    selProv.appendChild(opt);
  });

  function populateCities(provName, selectCityName) {
    selCity.innerHTML = '';
    const provObj = CITIES_DATA.find(p => p.province === provName) || CITIES_DATA[0];
    provObj.cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      opt.dataset.lon = c.lon;
      selCity.appendChild(opt);
    });
    if (selectCityName) {
      const cleanCity = selectCityName.replace(provName, '').trim();
      const matchOpt = Array.from(selCity.options).find(o => o.value === cleanCity || o.value === selectCityName);
      if (matchOpt) {
        selCity.value = matchOpt.value;
      } else {
        selCity.selectedIndex = 0;
      }
    } else {
      selCity.selectedIndex = 0;
    }
    updateLongitude();
  }

  function updateLongitude() {
    const selOpt = selCity.options[selCity.selectedIndex];
    if (selOpt && selOpt.dataset.lon) {
      numLon.value = selOpt.dataset.lon;
      state.longitude = parseFloat(selOpt.dataset.lon);
      state.province = selProv.value;
      state.cityName = `${selProv.value} ${selOpt.value}`;
      localStorage.setItem('qimen_province', state.province);
      localStorage.setItem('qimen_city', state.cityName);
      localStorage.setItem('qimen_longitude', state.longitude);
      if (typeof syncSettingsModalLocation === 'function') syncSettingsModalLocation();
    }
  }

  selProv.addEventListener('change', () => {
    state.province = selProv.value;
    populateCities(selProv.value);
    executePaipan();
  });

  selCity.addEventListener('change', () => {
    updateLongitude();
    executePaipan();
  });

  numLon.addEventListener('change', () => {
    state.longitude = parseFloat(numLon.value) || 120.0;
    localStorage.setItem('qimen_longitude', state.longitude);
    if (typeof syncSettingsModalLocation === 'function') syncSettingsModalLocation();
    executePaipan();
  });

  populateCities(state.province || '北京', state.cityName);
}

// 通用公历与中文字符串日期时间解析函数
function parseDateTimeFromText(text) {
  if (!text || !text.trim()) return null;
  const str = text.trim();

  let year = null, month = null, day = null, hour = null, minute = 0;
  const now = new Date();
  const defaultYear = state.year || now.getFullYear();

  // 1. 中文年月日格式: 2026年10月20日 / 2026年10月20
  const cnMatch = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (cnMatch) {
    year = parseInt(cnMatch[1]);
    month = parseInt(cnMatch[2]);
    day = parseInt(cnMatch[3]);
  } else {
    // 2. 破折号/斜杠/点格式: 2026-10-20, 2026/10/20, 2026.10.20
    const sepMatch = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (sepMatch) {
      year = parseInt(sepMatch[1]);
      month = parseInt(sepMatch[2]);
      day = parseInt(sepMatch[3]);
    } else {
      // 3. 紧凑8位连续数字: 20261020
      const compMatch = str.match(/\b(19\d{2}|20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
      if (compMatch) {
        year = parseInt(compMatch[1]);
        month = parseInt(compMatch[2]);
        day = parseInt(compMatch[3]);
      } else {
        // 4. 无年份格式: 10月20日 / 10-20 / 10/20 (默认当前年份)
        const noYearCn = str.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
        const noYearSep = str.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
        if (noYearCn) {
          year = defaultYear;
          month = parseInt(noYearCn[1]);
          day = parseInt(noYearCn[2]);
        } else if (noYearSep) {
          year = defaultYear;
          month = parseInt(noYearSep[1]);
          day = parseInt(noYearSep[2]);
        }
      }
    }
  }

  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // 时辰匹配:
  // A. 匹配地支时辰: 戌时 / 子时 / 午时 等
  const zhiNames = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const zhiHours = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  const zhiMatch = str.match(/([子丑寅卯辰巳午未申酉戌亥])\s*时/);
  if (zhiMatch) {
    const idx = zhiNames.indexOf(zhiMatch[1]);
    if (idx >= 0) {
      hour = zhiHours[idx];
      minute = 0;
    }
  }

  // B. 匹配数字时间: 21:12 / 21:12:30 / 21点30分 / 21时12分 / 21点 / 21时 / 20:00
  if (hour === null) {
    const timeMatch = str.match(/(?:(?:上午|下午|晚上|夜间)\s*)?(\d{1,2})[:：点时](\s*(\d{1,2})\s*分?)?/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      if (timeMatch[3] !== undefined && timeMatch[3].trim() !== '') {
        minute = parseInt(timeMatch[3]);
      } else {
        minute = 0;
      }
      if ((str.includes('下午') || str.includes('晚上')) && hour < 12) {
        hour += 12;
      }
    } else {
      // 匹配日期后空格跟随的4位时间: 20261020 2112 或 2026-10-20 2112
      const timeNumMatch = str.match(/(?:[-/.\d\s]+)\s+([01]?\d|2[0-3])([0-5]\d)\b/);
      if (timeNumMatch) {
        hour = parseInt(timeNumMatch[1]);
        minute = parseInt(timeNumMatch[2]);
      } else {
        // 若只输入了年月日，未指定小时，则使用当前小时
        hour = state.hour !== undefined ? state.hour : now.getHours();
        minute = state.minute !== undefined ? state.minute : now.getMinutes();
      }
    }
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { year, month, day, hour, minute };
}

// 通用四柱干支与公历时间智能解析函数
function parseGanzhiOrDateTimeInput(rawText) {
  if (!rawText || !rawText.trim()) return null;
  const text = rawText.trim();

  // 1. 优先尝试解析公历/中文日期时间
  const dt = parseDateTimeFromText(text);
  if (dt) {
    let dingjuMethod = null;
    if (text.includes('拆补')) dingjuMethod = 'chaibu';
    else if (text.includes('置闰')) dingjuMethod = 'zhirun';
    else if (text.includes('茅山')) dingjuMethod = 'maoshan';

    let paipanMethod = null;
    if (text.includes('飞盘') || text.includes('飞宫')) paipanMethod = 'fei';
    else if (text.includes('转盘') || text.includes('排宫')) paipanMethod = 'zhuan';

    let dun = null, ju = null;
    const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    const juMatch = text.match(/(阳|阴)[遁]?([一二三四五六七八九1-9])局?/);
    if (juMatch) {
      dun = juMatch[1];
      ju = numMap[juMatch[2]] || parseInt(juMatch[2]);
    }

    return {
      type: 'datetime',
      dt,
      dingjuMethod,
      paipanMethod,
      dun,
      ju,
      text
    };
  }

  // 2. 尝试提取四柱干支 (如：壬寅 乙巳 壬申 庚戌，或 年:甲子 月:丙寅 日:戊辰 时:辛酉)
  let parsedPillars = {};
  const yMatch = text.match(/(?:年柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*年)/);
  if (yMatch) parsedPillars.year = yMatch[1] || yMatch[2];
  const mMatch = text.match(/(?:月柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*月)/);
  if (mMatch) parsedPillars.month = mMatch[1] || mMatch[2];
  const dMatch = text.match(/(?:日柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*日)/);
  if (dMatch) parsedPillars.day = dMatch[1] || dMatch[2];
  const hMatch = text.match(/(?:时柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*时)/);
  if (hMatch) parsedPillars.hour = hMatch[1] || hMatch[2];

  // 连续四柱识别 (如：壬寅 乙巳 壬申 庚戌)
  const fourGzMatch = text.match(/(?:干支[:：\s]*)?([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s,，]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s,，]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s,，]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/);
  if (fourGzMatch) {
    if (!parsedPillars.year) parsedPillars.year = fourGzMatch[1];
    if (!parsedPillars.month) parsedPillars.month = fourGzMatch[2];
    if (!parsedPillars.day) parsedPillars.day = fourGzMatch[3];
    if (!parsedPillars.hour) parsedPillars.hour = fourGzMatch[4];
  }

  // 提取文本中出现的所有合法六十甲子
  const gzList = [];
  const gzRegex = /([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g;
  let gm;
  while ((gm = gzRegex.exec(text)) !== null) {
    if (JIAZI.includes(gm[1])) {
      gzList.push(gm[1]);
    }
  }

  if (!parsedPillars.year && !parsedPillars.month && !parsedPillars.day && !parsedPillars.hour) {
    if (gzList.length >= 4) {
      parsedPillars.year = gzList[0];
      parsedPillars.month = gzList[1];
      parsedPillars.day = gzList[2];
      parsedPillars.hour = gzList[3];
    } else if (gzList.length === 2) {
      parsedPillars.day = gzList[0];
      parsedPillars.hour = gzList[1];
    }
  } else {
    if (!parsedPillars.year && gzList[0]) parsedPillars.year = gzList[0];
    if (!parsedPillars.month && gzList[1]) parsedPillars.month = gzList[1];
    if (!parsedPillars.day && gzList[2]) parsedPillars.day = gzList[2];
    if (!parsedPillars.hour && gzList[3]) parsedPillars.hour = gzList[3];
  }

  const hasPillars = !!(parsedPillars.year || parsedPillars.month || parsedPillars.day || parsedPillars.hour);
  if (!hasPillars) return null;

  let dingjuMethod = null;
  if (text.includes('拆补')) dingjuMethod = 'chaibu';
  else if (text.includes('置闰')) dingjuMethod = 'zhirun';
  else if (text.includes('茅山')) dingjuMethod = 'maoshan';

  let paipanMethod = null;
  if (text.includes('飞盘') || text.includes('飞宫')) paipanMethod = 'fei';
  else if (text.includes('转盘') || text.includes('排宫')) paipanMethod = 'zhuan';

  let dun = null, ju = null;
  const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const juMatch = text.match(/(阳|阴)[遁]?([一二三四五六七八九1-9])局?/);
  if (juMatch) {
    dun = juMatch[1];
    ju = numMap[juMatch[2]] || parseInt(juMatch[2]);
  }

  return {
    type: 'ganzhi',
    pillars: parsedPillars,
    dingjuMethod,
    paipanMethod,
    dun,
    ju,
    text
  };
}

// 3. 起局日期时间选择与快速输入初始化
function initDateTimeSelectors() {
  const selYear = document.getElementById('selPanYear');
  const selMonth = document.getElementById('selPanMonth');
  const selDay = document.getElementById('selPanDay');
  const selHour = document.getElementById('selPanHour');
  const selMin = document.getElementById('selPanMinute');
  const iptQuick = document.getElementById('iptPanQuickTime');
  const btnQuick = document.getElementById('btnQuickTimeApply');

  if (selYear && selYear.tagName === 'SELECT') {
    for (let y = 1900; y <= 2099; y++) selYear.add(new Option(y, y));
    for (let m = 1; m <= 12; m++) selMonth.add(new Option(m, m));
    for (let h = 0; h <= 23; h++) selHour.add(new Option(h, h));
    for (let mi = 0; mi <= 59; mi++) selMin.add(new Option(mi, mi));
  }

  function handleInputEvent(el) {
    if (!el) return;
    el.addEventListener('change', syncDateTimeFromPickers);
    el.addEventListener('input', syncDateTimeFromPickers);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        syncDateTimeFromPickers();
        executePaipan();
      }
    });
  }

  [selYear, selMonth, selDay, selHour, selMin].forEach(handleInputEvent);

  const btnExec = document.getElementById('btnExecutePan');
  if (btnExec) {
    btnExec.addEventListener('click', () => {
      syncDateTimeFromPickers();
      executePaipan();
    });
  }

  // 快速四柱干支或公历时间输入识别起盘逻辑 (复制手动录入智能联动能力)
  function handleQuickTimeApply() {
    if (!iptQuick) return;
    const val = iptQuick.value.trim();
    if (!val) return;

    const res = parseGanzhiOrDateTimeInput(val);
    if (!res) {
      showToast('未检测到有效四柱干支或公历时间，请尝试如：壬寅 乙巳 壬申 庚戌 或 2026-10-20 21:12');
      return;
    }

    // 1. 同步可能包含的定局方式
    if (res.dingjuMethod) {
      state.dingjuMethod = res.dingjuMethod;
      const segDingju = document.getElementById('segDingjuGroup');
      if (segDingju) {
        segDingju.querySelectorAll('.m3-segment-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.value === res.dingjuMethod);
        });
      }
    }

    // 2. 同步可能包含的排盘方式 (转盘/飞盘)
    if (res.paipanMethod) {
      state.paipanMethod = res.paipanMethod;
      const segPaipan = document.getElementById('segPaipanGroup');
      if (segPaipan) {
        segPaipan.querySelectorAll('.m3-segment-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.value === res.paipanMethod);
        });
      }
    }

    if (res.type === 'datetime') {
      const dt = res.dt;
      state.year = dt.year;
      state.month = dt.month;
      state.day = dt.day;
      state.hour = dt.hour;
      state.minute = dt.minute;
      state.customPillars = null;
      if (res.dun && res.ju) {
        state.manualJu = { dun: res.dun, ju: res.ju, type: 'manual', dingjuMethod: state.dingjuMethod };
        const selManual = document.getElementById('selManualJu');
        if (selManual) selManual.value = `${res.dun}${res.ju}`;
      } else {
        const selManual = document.getElementById('selManualJu');
        if (selManual && selManual.value !== 'auto') {
          const dun = selManual.value.substring(0, 1);
          const ju = parseInt(selManual.value.substring(1));
          state.manualJu = { dun, ju, type: 'manual', dingjuMethod: state.dingjuMethod };
        } else {
          state.manualJu = null;
        }
      }
      syncDateTimeToPickers();
      renderCalendar();
      executePaipan();
      showToast(`已识别起局时间: ${dt.year}年${dt.month}月${dt.day}日 ${String(dt.hour).padStart(2, '0')}:${String(dt.minute).padStart(2, '0')}`);
      iptQuick.value = '';
    } else if (res.type === 'ganzhi') {
      const curPillars = (state.currentPan && state.currentPan.pillars) || {};
      const fullPillars = {
        year: res.pillars.year || curPillars.year || '丙午',
        month: res.pillars.month || curPillars.month || '戊戌',
        day: res.pillars.day || curPillars.day || '丁卯',
        hour: res.pillars.hour || curPillars.hour || '辛亥'
      };
      state.customPillars = fullPillars;
      if (res.dun && res.ju) {
        state.manualJu = { dun: res.dun, ju: res.ju, type: 'manual', dingjuMethod: state.dingjuMethod };
        const selManual = document.getElementById('selManualJu');
        if (selManual) selManual.value = `${res.dun}${res.ju}`;
      } else {
        // 关键修复：输入纯四柱时优先尊重页面上已选择的指定局数下拉框（如 阴九局）
        const selManual = document.getElementById('selManualJu');
        if (selManual && selManual.value !== 'auto') {
          const dun = selManual.value.substring(0, 1);
          const ju = parseInt(selManual.value.substring(1));
          state.manualJu = { dun, ju, type: 'manual', dingjuMethod: state.dingjuMethod };
        } else {
          state.manualJu = null;
        }
      }
      executePaipan();
      const juText = state.manualJu ? ` · ${state.manualJu.dun}遁${['一','二','三','四','五','六','七','八','九'][state.manualJu.ju - 1]}局` : '';
      showToast(`已成功识别四柱干支：${fullPillars.year} ${fullPillars.month} ${fullPillars.day} ${fullPillars.hour}${juText}，完成起盘！`);
      iptQuick.value = '';
    }
  }

  if (btnQuick) btnQuick.addEventListener('click', handleQuickTimeApply);
  if (iptQuick) {
    iptQuick.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickTimeApply();
      }
    });
  }

  syncDateTimeToPickers();
}

// 同步全部界面控件状态 (分段按钮、手动局数下拉框、时间选择框、用神与所问事项)
function syncControlsUI() {
  // 1. 同步定局方式 Segmented Button (置闰 / 拆补 / 茅山)
  const segDingju = document.getElementById('segDingjuGroup');
  if (segDingju) {
    segDingju.querySelectorAll('.m3-segment-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.dingjuMethod);
    });
  }

  // 2. 同步排盘方式 Segmented Button (排宫 / 飞宫)
  const segPaipan = document.getElementById('segPaipanGroup');
  if (segPaipan) {
    segPaipan.querySelectorAll('.m3-segment-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.paipanMethod);
    });
  }

  // 3. 同步手动指定局数下拉框 (#selManualJu)
  const selManual = document.getElementById('selManualJu');
  if (selManual) {
    if (state.manualJu && state.manualJu.dun && state.manualJu.ju) {
      selManual.value = `${state.manualJu.dun}${state.manualJu.ju}`;
    } else {
      selManual.value = 'auto';
    }
  }

  // 4. 同步时间选择框与日期
  syncDateTimeToPickers();

  // 5. 同步所问问题输入框
  const iptQ = document.getElementById('iptUserQuestion');
  if (iptQ) {
    iptQ.value = state.userQuestion || '';
  }
}

function syncDateTimeToPickers() {
  const y = document.getElementById('selPanYear');
  const m = document.getElementById('selPanMonth');
  const d = document.getElementById('selPanDay');
  const h = document.getElementById('selPanHour');
  const min = document.getElementById('selPanMinute');
  if (y) y.value = state.year;
  if (m) m.value = state.month;
  if (d) d.value = state.day;
  if (h) h.value = state.hour;
  if (min) min.value = state.minute;
}

function syncDateTimeFromPickers() {
  const y = parseInt(document.getElementById('selPanYear').value);
  const m = parseInt(document.getElementById('selPanMonth').value);
  const d = parseInt(document.getElementById('selPanDay').value);
  const h = parseInt(document.getElementById('selPanHour').value);
  const min = parseInt(document.getElementById('selPanMinute').value);
  if (!isNaN(y)) state.year = y;
  if (!isNaN(m)) state.month = m;
  if (!isNaN(d)) state.day = d;
  if (!isNaN(h)) state.hour = h;
  if (!isNaN(min)) state.minute = min;
  state.customPillars = null;

  const selBaoshi = document.getElementById('selBaoshiHour');
  if (selBaoshi) {
    selBaoshi.value = 'default';
  }
}

// 4. M3 控制组件初始化 (分段按钮、开关、选项)
function initControls() {
  function setupSegmentedGroup(groupId, onChange, currentValue) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const btns = group.querySelectorAll('.m3-segment-btn');
    if (currentValue !== undefined) {
      btns.forEach(b => {
        b.classList.toggle('active', b.dataset.value === currentValue);
      });
    }
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (onChange) onChange(btn.dataset.value);
      });
    });
  }

  // 定局方式 Segmented Button
  setupSegmentedGroup('segDingjuGroup', val => {
    state.dingjuMethod = val;
    localStorage.setItem('qimen_dingju_method', val);
    if (typeof syncSettingsModal === 'function') syncSettingsModal();
    executePaipan();
  }, state.dingjuMethod);

  // 排盘方式 Segmented Button (排宫 / 飞宫)
  setupSegmentedGroup('segPaipanGroup', val => {
    state.paipanMethod = val;
    localStorage.setItem('qimen_paipan_method', val);
    if (typeof syncSettingsModal === 'function') syncSettingsModal();
    executePaipan();
  }, state.paipanMethod);

  // 子时 Segmented Button (早晚分 / 进次日)
  setupSegmentedGroup('segZishiGroup', val => {
    state.zishi = val;
    localStorage.setItem('qimen_zishi', val);
    if (typeof syncSettingsModal === 'function') syncSettingsModal();
    executePaipan();
  }, state.zishi);

  // 地盘/天盘全息视图切换开关 (M3 Switch)
  const chkDipan = document.getElementById('chkToggleDipan');
  if (chkDipan) {
    chkDipan.checked = state.showDipan;
    chkDipan.addEventListener('change', e => {
      state.showDipan = e.target.checked;
      localStorage.setItem('qimen_show_dipan', state.showDipan ? '1' : '0');
      updateBoardCardCenter(state.currentPan);
      if (typeof syncSettingsModal === 'function') syncSettingsModal();
      if (state.currentPan) {
        renderNinePalaces(state.currentPan);
        renderKeyingAnalysis(state.currentPan, state.selectedGong);
      }
      showToast(state.showDipan ? '已切换至地盘全息象意' : '已切换至天盘信息');
    });
  }

  // 研判详情折叠开关 (默认隐藏天盘干、门状态、地盘干)
  const btnToggleKeying = document.getElementById('btnToggleKeyingDetail');
  if (btnToggleKeying) {
    updateKeyingToggleBtn();
    btnToggleKeying.addEventListener('click', () => {
      state.showKeyingDetails = !state.showKeyingDetails;
      localStorage.setItem('qimen_show_keying_details', state.showKeyingDetails ? '1' : '0');
      updateKeyingToggleBtn();
      if (typeof syncSettingsModal === 'function') syncSettingsModal();
      if (state.currentPan) {
        renderKeyingAnalysis(state.currentPan, state.selectedGong);
      }
      showToast(state.showKeyingDetails ? '已展开显示详细信息' : '已恢复精简模式');
    });
  }

  // 辅助函数：清零报数起局
  function resetBaoShu() {
    const ipt = document.getElementById('iptBaoShu');
    const rem = document.getElementById('txtBaoshuRem');
    if (ipt) ipt.value = '';
    if (rem) rem.textContent = '余：-';
  }

  // 辅助函数：报时起局恢复默认
  function resetBaoshi() {
    const sel = document.getElementById('selBaoshiHour');
    if (sel) sel.value = 'default';
    const selHour = document.getElementById('selPanHour');
    if (selHour) state.hour = parseInt(selHour.value);
  }

  // 辅助函数：指定局数改为自动起局
  function resetManualJu() {
    const sel = document.getElementById('selManualJu');
    if (sel) sel.value = 'auto';
    state.manualJu = null;
  }

  // 1. 手动指定局数下拉框
  const selManual = document.getElementById('selManualJu');
  if (selManual) {
    selManual.addEventListener('change', () => {
      const val = selManual.value;
      if (val === 'auto') {
        state.manualJu = null;
      } else {
        const dun = val.substring(0, 1);
        const ju = parseInt(val.substring(1));
        state.manualJu = { dun, ju, type: 'manual' };

        // 互斥：输入指定局数时，报时起局默认，报数起局输入数字清零
        resetBaoshi();
        resetBaoShu();
      }
      executePaipan();
    });
  }

  // 2. 报时起局下拉框
  const selBaoshi = document.getElementById('selBaoshiHour');
  if (selBaoshi) {
    selBaoshi.addEventListener('change', () => {
      const val = selBaoshi.value;
      if (val === 'default') {
        // 恢复默认时辰（对齐主时间选择器小时）
        const selPanHour = document.getElementById('selPanHour');
        if (selPanHour) state.hour = parseInt(selPanHour.value);
      } else {
        const h = parseInt(val);
        state.hour = h;
        const selPanHour = document.getElementById('selPanHour');
        if (selPanHour) selPanHour.value = h;

        // 互斥：报时起局时，指定局数改为自动起局，报数起局输入数字清零
        resetManualJu();
        resetBaoShu();
        showToast(`报时起局：已切换至 ${selBaoshi.options[selBaoshi.selectedIndex].text}`);
      }
      executePaipan();
    });
  }

  // 3. 报数起局：实时预览
  const iptBaoShu = document.getElementById('iptBaoShu');
  const txtBaoshuRem = document.getElementById('txtBaoshuRem');
  if (iptBaoShu && txtBaoshuRem) {
    iptBaoShu.addEventListener('input', () => {
      const raw = iptBaoShu.value.trim();
      if (!raw) {
        txtBaoshuRem.textContent = '余：-';
        // 清空时，若当前处于报数起局状态则恢复自动起盘
        if (state.manualJu && state.manualJu.type === 'baoshu') {
          state.manualJu = null;
          executePaipan();
        }
        return;
      }

      const num = parseInt(raw);
      if (isNaN(num) || num <= 0) {
        txtBaoshuRem.textContent = '余：-';
        if (state.manualJu && state.manualJu.type === 'baoshu') {
          state.manualJu = null;
          executePaipan();
        }
        return;
      }

      const remainder = ((num - 1) % 9) + 1;
      txtBaoshuRem.textContent = `余：${remainder}`;

      // 互斥：报数起局时，指定局数改为自动起局，报时起局默认
      resetManualJu();
      resetBaoshi();

      // 实时预览起局（阴阳遁跟随当前日节气）
      const dun = state.currentPan ? state.currentPan.dun : '阳';
      state.manualJu = { dun, ju: remainder, type: 'baoshu' };
      executePaipan();
    });
  }

  // 查找格局入口按钮
  const btnOpenFindPattern = document.getElementById('btnOpenFindPattern');
  if (btnOpenFindPattern) btnOpenFindPattern.addEventListener('click', openPatternSearchModal);
  const btnBottomFindPattern = document.getElementById('btnBottomFindPattern');
  if (btnBottomFindPattern) btnBottomFindPattern.addEventListener('click', openPatternSearchModal);

  // 顶部与底部快捷按钮
  const btnSimple = document.getElementById('btnToggleSimple');
  if (btnSimple) btnSimple.addEventListener('click', toggleSimpleMode);

  const btnCopy = document.getElementById('btnCopyQimen');
  if (btnCopy) btnCopy.addEventListener('click', copyQimenToClipboard);
  const btnTopKeying = document.getElementById('btnTopKeying');
  if (btnTopKeying) {
    btnTopKeying.addEventListener('click', (e) => {
      e.stopPropagation();
      openKeyingModal();
    });
    btnTopKeying.addEventListener('touchend', (e) => {
      e.stopPropagation();
      openKeyingModal();
    }, { passive: true });
  }
  const topToolbarGroup = document.querySelector('.top-bar-actions .toolbar-group');
  if (topToolbarGroup) {
    topToolbarGroup.addEventListener('click', (e) => {
      if (e.target === btnTopKeying || (btnTopKeying && btnTopKeying.contains(e.target))) return;
      openKeyingModal();
    });
  }
  const btnBottomCopy = document.getElementById('btnBottomCopy');
  if (btnBottomCopy) btnBottomCopy.addEventListener('click', copyQimenToClipboard);
  const btnBottomCopyYongShen = document.getElementById('btnBottomCopyYongShen');
  if (btnBottomCopyYongShen) btnBottomCopyYongShen.addEventListener('click', copyYongShenAnalysis);

  const btnTheme = document.getElementById('btnToggleTheme');
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

  const btnSettings = document.getElementById('btnSettings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      if (typeof syncSettingsModal === 'function') syncSettingsModal();
      openModal('modalSettings');
    });
  }

  const btnHelp = document.getElementById('btnHelp');
  if (btnHelp) btnHelp.addEventListener('click', () => openModal('modalHelp'));

  const btnKeying = document.getElementById('btnKeyingSearchModal');
  if (btnKeying) btnKeying.addEventListener('click', openKeyingModal);
  const btnBottomKeying = document.getElementById('btnBottomKeying');
  if (btnBottomKeying) btnBottomKeying.addEventListener('click', openKeyingModal);

  const btnKeyingFilterYongShen = document.getElementById('btnKeyingFilterYongShen');
  if (btnKeyingFilterYongShen) {
    btnKeyingFilterYongShen.addEventListener('click', () => {
      state.keyingOnlyYongShen = !state.keyingOnlyYongShen;
      renderKeyingModalContent();
    });
  }

  const btnKeyingCopyPan = document.getElementById('btnKeyingCopyPan');
  if (btnKeyingCopyPan) {
    btnKeyingCopyPan.addEventListener('click', copyQimenToClipboard);
  }

  const btnKeyingCopyAll = document.getElementById('btnKeyingCopyAll');
  if (btnKeyingCopyAll) {
    btnKeyingCopyAll.addEventListener('click', copyKeyingModalPanAndCurrentContent);
  }

  const btnKeyingCopyCurrent = document.getElementById('btnKeyingCopyCurrent');
  if (btnKeyingCopyCurrent) {
    btnKeyingCopyCurrent.addEventListener('click', copyKeyingModalCurrentContent);
  }

  const btnNow = document.getElementById('btnToolbarNow');
  if (btnNow) btnNow.addEventListener('click', setToNow);

  const btnBottomSave = document.getElementById('btnBottomSave');
  if (btnBottomSave) btnBottomSave.addEventListener('click', () => openModal('modalSaveCase'));

  // 象意人象与物象快速切换按键委托监听
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.imagery-mode-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const mode = btn.dataset.mode;
    let targetMode = mode;
    if (btn.classList.contains('active') && mode !== 'all') {
      targetMode = 'all';
    }
    setImageryMode(targetMode);
  });

  // 对话框关闭按钮
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // M3 移动端底部导航栏
  document.querySelectorAll('#m3MobileNav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      switchMobileTab(item.dataset.tab);
    });
  });
}

// 移动端底部标签页切换
function switchMobileTab(tab) {
  // 移动端交由分页引擎接管（CHG-001 / ADR-004）
  if (window.QimenPager && window.QimenPager.isMobile()) {
    window.QimenPager.go(tab);
    return;
  }

  // 桌面兜底：保留原有显隐逻辑
  document.querySelectorAll('#m3MobileNav .nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.tab === tab);
  });
  const leftP = document.getElementById('leftPanel');
  const rightP = document.getElementById('rightPanel');
  const calCard = document.querySelector('.calendar-card');
  const ctrlCard = document.querySelector('.controls-card');
  const caseCard = document.querySelector('.cases-card');

  if (tab === 'pan') {
    if (leftP) leftP.classList.add('tab-active');
    if (rightP) rightP.classList.remove('tab-active');
  } else {
    if (leftP) leftP.classList.remove('tab-active');
    if (rightP) rightP.classList.add('tab-active');

    if (tab === 'cal') {
      if (calCard) calCard.style.display = 'flex';
      if (ctrlCard) ctrlCard.style.display = 'none';
      if (caseCard) caseCard.style.display = 'none';
    } else if (tab === 'setting') {
      if (calCard) calCard.style.display = 'none';
      if (ctrlCard) ctrlCard.style.display = 'flex';
      if (caseCard) caseCard.style.display = 'none';
    } else if (tab === 'cases') {
      if (calCard) calCard.style.display = 'none';
      if (ctrlCard) ctrlCard.style.display = 'none';
      if (caseCard) caseCard.style.display = 'flex';
    }
  }
}

// 5. 万年历月历组件初始化与渲染
function initCalendar() {
  const selYear = document.getElementById('selCalYear');
  const selMonth = document.getElementById('selCalMonth');

  for (let y = 1900; y <= 2099; y++) {
    selYear.add(new Option(y, y));
  }
  for (let m = 1; m <= 12; m++) {
    selMonth.add(new Option(m, m));
  }

  selYear.value = state.calViewYear;
  selMonth.value = state.calViewMonth;

  selYear.addEventListener('change', () => {
    state.calViewYear = parseInt(selYear.value);
    renderCalendar();
  });
  selMonth.addEventListener('change', () => {
    state.calViewMonth = parseInt(selMonth.value);
    renderCalendar();
  });

  const btnPrevY = document.getElementById('btnPrevYear');
  if (btnPrevY) {
    btnPrevY.addEventListener('click', () => {
      state.calViewYear = Math.max(1900, state.calViewYear - 1);
      selYear.value = state.calViewYear;
      renderCalendar();
    });
  }
  const btnNextY = document.getElementById('btnNextYear');
  if (btnNextY) {
    btnNextY.addEventListener('click', () => {
      state.calViewYear = Math.min(2099, state.calViewYear + 1);
      selYear.value = state.calViewYear;
      renderCalendar();
    });
  }
  const btnPrevM = document.getElementById('btnPrevMonth');
  if (btnPrevM) {
    btnPrevM.addEventListener('click', () => {
      if (state.calViewMonth === 1) {
        state.calViewMonth = 12;
        state.calViewYear--;
      } else {
        state.calViewMonth--;
      }
      selYear.value = state.calViewYear;
      selMonth.value = state.calViewMonth;
      renderCalendar();
    });
  }
  const btnNextM = document.getElementById('btnNextMonth');
  if (btnNextM) {
    btnNextM.addEventListener('click', () => {
      if (state.calViewMonth === 12) {
        state.calViewMonth = 1;
        state.calViewYear++;
      } else {
        state.calViewMonth++;
      }
      selYear.value = state.calViewYear;
      selMonth.value = state.calViewMonth;
      renderCalendar();
    });
  }
  document.getElementById('btnCalNow').addEventListener('click', setToNow);

  // 移动端万年历底部快捷起盘与查看盘面
  const btnCastNow = document.getElementById('btnCalCastNow');
  if (btnCastNow) {
    btnCastNow.addEventListener('click', () => {
      setToNow();
      if (typeof switchMobileTab === 'function') {
        switchMobileTab('pan');
      }
      showToast('已按当前时间实时起盘！');
    });
  }

  const btnViewPan = document.getElementById('btnCalViewPan');
  if (btnViewPan) {
    btnViewPan.addEventListener('click', () => {
      if (typeof switchMobileTab === 'function') {
        switchMobileTab('pan');
      }
    });
  }

  renderCalendar();
}

function renderCalendar() {
  const tbody = document.getElementById('calTableBody');
  tbody.innerHTML = '';

  const y = state.calViewYear;
  const m = state.calViewMonth;

  // 首日星期 (0=周日)
  const firstDay = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevMonthDays = new Date(y, m - 1, 0).getDate();

  let dateNum = 1;
  let nextMonthDay = 1;

  for (let row = 0; row < 6; row++) {
    const tr = document.createElement('tr');
    let hasDateInRow = false;

    for (let col = 0; col < 7; col++) {
      const td = document.createElement('td');
      const cellIndex = row * 7 + col;

      if (cellIndex < firstDay) {
        // 上个月的尾巴
        const prevDay = prevMonthDays - (firstDay - cellIndex - 1);
        td.classList.add('is-other-month');
        td.innerHTML = `<div class="cal-day-num">${prevDay}</div>`;
      } else if (dateNum <= daysInMonth) {
        // 本月日期
        hasDateInRow = true;
        const currentD = dateNum;
        if (col === 0 || col === 6) td.classList.add('is-weekend');

        // 是否为当前起盘所选日期
        if (y === state.year && m === state.month && currentD === state.day) {
          td.classList.add('selected');
        }

        const lunar = getLunarDate(y, m, currentD);
        const lunarShort = lunar.lunarDay === 1
          ? (lunar.isLeap ? '闰' : '') + lunar.lunarMonthName.substring(0, 2)
          : lunar.lunarDayName;

        td.innerHTML = `
          <div class="cal-day-num">${currentD}</div>
          <div class="cal-lunar-text">${lunarShort}</div>
        `;

        // 点击直接起盘
        td.addEventListener('click', () => {
          state.year = y;
          state.month = m;
          state.day = currentD;
          syncDateTimeToPickers();
          renderCalendar();
          executePaipan();
        });

        dateNum++;
      } else {
        // 下个月头部
        td.classList.add('is-other-month');
        td.innerHTML = `<div class="cal-day-num">${nextMonthDay++}</div>`;
      }
      tr.appendChild(td);
    }

    if (hasDateInRow || row < 5) {
      tbody.appendChild(tr);
    }
  }

  // 更新万年历头部干支与节气展示
  const middleDateLunar = getLunarDate(y, m, 15);
  const elCalLunar = document.getElementById('calLunarYearTitle');
  if (elCalLunar) elCalLunar.textContent = `农历: ${middleDateLunar.yearGanzhi}${middleDateLunar.nayin}『${middleDateLunar.shengxiao}』年`;
  const elZodiac = document.getElementById('calZodiacBadge');
  if (elZodiac) elZodiac.textContent = `生肖: ${middleDateLunar.shengxiao}`;
}

// 6. 九宫格交互与点击选中
function initPalaceInteractions() {
  document.querySelectorAll('.palace-cell').forEach(cell => {
    const gong = parseInt(cell.dataset.gong);
    cell.addEventListener('click', (e) => {
      // 若点击的是正宫角落开关按钮，不触发宫位选中
      if (e.target.closest('#btnCenterKongToggle') || e.target.closest('#btnCenterMaskToggle')) return;

      // 若处于盘面手动圈选用神模式，拦截点击并处理用神圈选，不改变所选宫位
      if (state.isGridPickingMode) {
        e.stopPropagation();
        e.preventDefault();
        handleGridPickClick(e, gong);
        return;
      }

      selectPalace(gong);
    });
  });

  // 正宫右上角旬空符号与左上角减弱蒙版按钮点击事件全局监听
  document.addEventListener('click', e => {
    const btn = e.target.closest('#btnCenterKongToggle');
    if (btn) {
      e.stopPropagation();
      e.preventDefault();
      state.kongLookOpposite = !state.kongLookOpposite;
      try {
        localStorage.setItem('qimen_kong_look_opposite', state.kongLookOpposite ? '1' : '0');
      } catch (err) {}
      if (state.currentPan) {
        renderNinePalaces(state.currentPan);
      }
      const modalKeying = document.getElementById('modalKeying');
      if (modalKeying && modalKeying.classList.contains('active')) {
        renderKeyingModalContent();
      }
      showToast(state.kongLookOpposite ? '旬空看对宫：已开启（实心·显示淡蓝色光圈）' : '旬空看对宫：已关闭（空圈·不显示）');
      return;
    }

    const maskBtn = e.target.closest('#btnCenterMaskToggle');
    if (maskBtn) {
      e.stopPropagation();
      e.preventDefault();
      state.maskWeakened = !state.maskWeakened;
      try {
        localStorage.setItem('qimen_mask_weakened', state.maskWeakened ? '1' : '0');
      } catch (err) {}
      if (state.currentPan) {
        renderNinePalaces(state.currentPan);
      }
      showToast(state.maskWeakened ? '运筹模式：已开启（金黄色标记吉门吉星吉神，并减弱非用神蒙版）' : '运筹模式：已关闭（恢复正常突出）');
    }
  });
}

function selectPalace(gong) {
  state.selectedGong = gong;
  document.querySelectorAll('.palace-cell').forEach(c => {
    c.classList.toggle('selected', parseInt(c.dataset.gong) === gong);
  });
  if (state.currentPan) {
    renderKeyingAnalysis(state.currentPan, gong);
  }
}

// 7. 执行排盘并更新全界面
function executePaipan() {
  try {
    const pan = paipan({
      year: state.year,
      month: state.month,
      day: state.day,
      hour: state.hour,
      minute: state.minute,
      longitude: state.longitude,
      dingjuMethod: state.dingjuMethod,
      paipanMethod: state.paipanMethod,
      designatedJu: state.manualJu,
      zishi: state.zishi,
      cityName: state.cityName,
      customPillars: state.customPillars
    });

    pan.selectedYongShen = state.selectedYongShen;
    pan.userQuestion = state.userQuestion;
    pan.yongshenNature = state.yongshenNature;
    state.currentPan = pan;

    renderHeaderInfo(pan);
    renderNinePalaces(pan);
    renderKeyingAnalysis(pan, state.selectedGong);
    renderCalendarTerms(pan);
  } catch (err) {
    console.error('排盘执行异常:', err);
    showToast('排盘计算失败: ' + err.message);
  }
}

// 渲染头部信息区
function renderHeaderInfo(pan) {
  const p = pan;
  document.getElementById('txtSolarTime').textContent = `${p.rawInput.year}年${String(p.rawInput.month).padStart(2, '0')}月${String(p.rawInput.day).padStart(2, '0')}日 ${String(p.rawInput.hour).padStart(2, '0')}:${String(p.rawInput.minute).padStart(2, '0')}`;
  document.getElementById('txtWeekDay').textContent = `星期${p.weekDay}`;

  document.getElementById('txtCurTerm').textContent = `${p.termInfo.current.name} ${String(p.termInfo.current.month).padStart(2, '0')}-${String(p.termInfo.current.day).padStart(2, '0')} ${String(p.termInfo.current.hour).padStart(2, '0')}:${String(p.termInfo.current.minute).padStart(2, '0')}`;
  document.getElementById('txtNextTerm').textContent = `次节 ${p.termInfo.next.name} ${String(p.termInfo.next.month).padStart(2, '0')}-${String(p.termInfo.next.day).padStart(2, '0')} ${String(p.termInfo.next.hour).padStart(2, '0')}:${String(p.termInfo.next.minute).padStart(2, '0')}`;

  document.getElementById('txtTrueTime').textContent = `${p.trueTime.year}年${String(p.trueTime.month).padStart(2, '0')}月${String(p.trueTime.day).padStart(2, '0')}日 ${String(p.trueTime.hour).padStart(2, '0')}:${String(p.trueTime.minute).padStart(2, '0')}`;
  document.getElementById('txtLocation').textContent = `${p.rawInput.cityName || '北京'} (${p.rawInput.longitude}°)`;

  document.getElementById('txtLunarDate').textContent = `${p.pillars.year}年 ${p.lunar.lunarMonthName} ${p.lunar.lunarDayName}日`;
  document.getElementById('txtShichenDesc').textContent = `${p.shichenTitle}  ${p.pillars.hour[1]}时`;

  document.getElementById('txtGanzhi').textContent = `${p.pillars.year}  ${p.pillars.month}  ${p.pillars.day}  ${p.pillars.hour}`;
  document.getElementById('txtJuDesc').textContent = p.dingju.desc;

  document.getElementById('txtKongwang').innerHTML = `${p.kongwang.year}  ${p.kongwang.month}  ${p.kongwang.day}  <span class="info-red">${p.kongwang.hour}</span>`;
  document.getElementById('txtXunshou').textContent = p.xun;

  document.getElementById('txtStarFu').textContent = p.starFu;
  document.getElementById('txtFuGong').textContent = GONG_NUM[p.shiGong];
  document.getElementById('txtDoorShi').textContent = p.doorShi;
  document.getElementById('txtDoorGong').textContent = GONG_NUM[p.doorShiGong];

  // 更新九宫盘面中间显示的四柱干支或所问问题
  updateBoardCardCenter(p);

  const dingjuName = p.dingjuMethod === 'zhirun' ? '置闰' : (p.dingjuMethod === 'chaibu' ? '拆补' : '茅山');
  const paipanName = p.paipanMethod === 'zhuan' ? '排宫法' : '飞宫法';
  document.getElementById('txtMethodDesc').textContent = `${dingjuName}${paipanName}`;

  // 全盘大像 (八门反吟/伏吟，九星反吟/伏吟，五不遇时，时干入墓)
  const patterns = checkGlobalPatterns(p);
  const existingBadges = document.querySelectorAll('.ju-banner .badge-pattern');
  existingBadges.forEach(el => el.remove());
  if (patterns.badges && patterns.badges.length > 0) {
    const juBanner = document.querySelector('.ju-banner');
    if (juBanner) {
      patterns.badges.forEach(b => {
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'badge-tag-tonal badge-pattern';
        badgeSpan.textContent = b.name;
        badgeSpan.title = b.desc;
        if (b.type.includes('fan') || b.type === 'wubuyu') {
          badgeSpan.style.backgroundColor = 'var(--md-sys-color-error-container)';
          badgeSpan.style.color = 'var(--md-sys-color-error)';
          badgeSpan.style.fontWeight = '700';
        } else if (b.type === 'shimu') {
          badgeSpan.style.backgroundColor = '#fef3c7';
          badgeSpan.style.color = '#92400e';
          badgeSpan.style.fontWeight = '700';
        } else {
          badgeSpan.style.backgroundColor = 'var(--md-sys-color-tertiary-container)';
          badgeSpan.style.color = 'var(--md-sys-color-on-tertiary-container)';
        }
        juBanner.appendChild(badgeSpan);
      });
    }
  }

  // 时辰大像列表联动展现 (五不遇时 / 时干入墓)
  const itemWuBuYuRow = document.getElementById('itemWuBuYuRow');
  const txtWuBuYuDesc = document.getElementById('txtWuBuYuDesc');
  if (p.wuBuYu && p.wuBuYu.hasSpecial) {
    if (itemWuBuYuRow && txtWuBuYuDesc) {
      itemWuBuYuRow.style.display = 'flex';
      txtWuBuYuDesc.textContent = p.wuBuYu.desc;
    }
  } else {
    if (itemWuBuYuRow) itemWuBuYuRow.style.display = 'none';
  }
}

// 渲染地盘全量基盘全息卡片 (对应地盘基盘教学图)
function renderDipanPalaces(pan, gongs) {
  const gridEl = document.getElementById('nineGrid');
  if (gridEl) {
    gridEl.classList.remove('has-yongshen-active', 'mask-weakened');
    gridEl.classList.add('is-dipan-mode');
  }

  gongs.forEach(g => {
    const cell = document.getElementById(`cellGong${g}`);
    if (!cell) return;
    cell.classList.remove('is-yongshen', 'is-yongshen-zhifu', 'is-yongshen-opposite-kong', 'is-palace-dimmed');
    cell.classList.add('is-dipan-cell');
    cell.removeAttribute('title');
    const info = DIPAN_PALACE_INFO[g];
    const dg = pan.dipan[g] || '';

    if (g === 5) {
      // 中五宫: 5, 中, 皇极无卦 (地盘模式下不显示旬空开关)
      cell.innerHTML = `
        <div class="dipan-cell-content gong-5">
          <div class="dipan-row-top">
            <div class="dipan-num-wx">
              <span class="dipan-num">5</span>
            </div>
            <div class="dipan-top-right">
              <span class="dipan-cur-stem-tag" title="本局地盘奇仪: ${dg || '戊'}">${dg || '戊'}</span>
              <span class="dipan-dir-tag">中</span>
            </div>
          </div>
          <div class="dipan-row-mid">
            <div class="dipan-center-box">
              <span class="dipan-center-title">中宫</span>
              <span class="dipan-center-sub">皇极 · 戊己土</span>
            </div>
          </div>
          <div class="dipan-row-bot">
            <span class="dipan-desc" style="color: var(--md-sys-color-outline);">皇极无卦 · 寄坤二</span>
          </div>
        </div>
      `;
      return;
    }

    // 地支排列
    let dizhiHtml = '';
    if (info.dizhi.length === 1) {
      dizhiHtml = `<span class="dipan-zhi-single">${info.dizhi[0]}</span>`;
    } else if (info.dizhi.length === 2) {
      dizhiHtml = `
        <div class="dipan-zhi-double">
          <span class="zhi-first">${info.dizhi[0]}</span>
          <span class="zhi-second">${info.dizhi[1]}</span>
        </div>
      `;
    }

    let jiganTag = '';
    if (g === 2 && pan.dipan[5]) {
      jiganTag = `<span class="dipan-jigan-tag" title="中五寄干: ${pan.dipan[5]}">${pan.dipan[5]}</span>`;
    }

    cell.innerHTML = `
      <div class="dipan-cell-content">
        <div class="dipan-row-top">
          <div class="dipan-num-wx">
            <span class="dipan-num">${info.num}</span>
            <span class="dipan-wx">${info.element}</span>
          </div>
          <div class="dipan-top-right">
            ${jiganTag}
            <span class="dipan-cur-stem-tag" title="本局地盘奇仪: ${dg}">${dg}</span>
            <span class="dipan-dir-tag">${info.direction}</span>
          </div>
        </div>
        <div class="dipan-row-mid">
          ${dizhiHtml}
        </div>
        <div class="dipan-row-bot">
          <span class="dipan-trigram">${info.trigram}</span>
          <span class="dipan-desc">${info.trigramDesc}</span>
        </div>
      </div>
    `;
  });
}

// 渲染九宫格
function renderNinePalaces(pan) {
  const gongs = [4, 9, 2, 3, 5, 7, 8, 1, 6];

  // 地盘全息基盘视图
  if (state.showDipan) {
    renderDipanPalaces(pan, gongs);
    return;
  }

  // 预先计算所有宫位的用神匹配与旬空状态 (人/物逢空看对冲宫，事逢空不看对面)
  const matchResByGong = {};
  const emptyYongShenPalaces = []; // 落有用神且逢旬空的宫位
  const oppositePalacesOfKong = new Map(); // 对冲宫位 -> 来源旬空宫位及用神信息

  const isPersonOrObj = isYongShenPersonOrObject(state.selectedYongShen, state.userQuestion, state.yongshenNature);
  const lookOppositeActive = (!state.showDipan && state.kongLookOpposite && isPersonOrObj);

  const hasYongShen = (!state.showDipan && state.selectedYongShen && state.selectedYongShen.length > 0);
  const gridEl = document.getElementById('nineGrid');
  if (gridEl) {
    gridEl.classList.remove('is-dipan-mode');
    gridEl.classList.toggle('has-yongshen-active', !!hasYongShen);
    gridEl.classList.toggle('mask-weakened', !!(hasYongShen && state.maskWeakened));
    gridEl.classList.toggle('grid-picking-mode', !!state.isGridPickingMode);
  }

  if (hasYongShen) {
    gongs.forEach(g => {
      const matchRes = checkPalaceMatchYongShen(pan, g, state.selectedYongShen);
      matchResByGong[g] = matchRes;
      if (matchRes.matched) {
        const isKong = !!(pan.palaceFlags[g] && pan.palaceFlags[g].isKong);
        if (isKong && lookOppositeActive) {
          emptyYongShenPalaces.push(g);
          const opp = (g === 5 ? 2 : (10 - g));
          oppositePalacesOfKong.set(opp, { originGong: g, items: matchRes.items });
        }
      }
    });
  }

  gongs.forEach(g => {
    const cell = document.getElementById(`cellGong${g}`);
    if (!cell) return;

    if (g === 5 && pan.paipanMethod === 'zhuan') {
      // 转盘中五正宫: 居中显示地盘戊，右上角为旬空看对宫切换按钮，左上角为减弱非用神蒙版按钮
      const isKongOppActive = state.kongLookOpposite;
      const kongBtnHtml = `
        <button type="button" class="btn-center-kong-toggle ${isKongOppActive ? 'is-solid' : 'is-hollow'}" id="btnCenterKongToggle" title="${isKongOppActive ? '旬空看对宫：已开启（实心·显示淡蓝色光圈，点击切换为不显示）' : '旬空看对宫：已关闭（空圈·不显示，点击切换为显示淡蓝色光圈）'}" aria-label="旬空看对宫切换">
          <span class="kong-icon"></span>
        </button>
      `;
      const isMaskWeakened = state.maskWeakened;
      const maskBtnHtml = `
        <button type="button" class="btn-center-mask-toggle ${isMaskWeakened ? 'is-solid' : 'is-hollow'}" id="btnCenterMaskToggle" title="${isMaskWeakened ? '运筹模式与蒙版减弱：已开启（实心·金黄色标记三吉，方便通盘运筹，点击恢复正常）' : '运筹模式与蒙版减弱：已关闭（空圈·点击开启金黄色标记三吉与减弱非用神蒙版）'}" aria-label="运筹与减弱非用神蒙版切换">
          <span class="mask-icon"></span>
        </button>
      `;
      cell.innerHTML = `
        ${maskBtnHtml}
        <div class="cell-center-content" title="${pan.dipan[5] || '戊'}">
          ${pan.dipan[5] || '戊'}
        </div>
        ${kongBtnHtml}
      `;
      cell.classList.remove('is-yongshen', 'is-yongshen-zhifu', 'is-yongshen-opposite-kong', 'is-dipan-cell', 'has-lucky-3', 'has-lucky-2', 'has-lucky-1');
      cell.removeAttribute('data-lucky-count');
      if (hasYongShen) {
        cell.classList.add('is-palace-dimmed');
      } else {
        cell.classList.remove('is-palace-dimmed');
      }
      cell.removeAttribute('title');
      return;
    }

    const spirit = pan.tianpanSpirit[g] || '';
    const flag = pan.palaceFlags[g];
    const isFuSpirit = spirit === '值符';
    const isShiDoor = g === pan.doorShiGong;

    let star = pan.tianpanStar[g] || '';
    const door = pan.tianpanDoor[g] || '';

    // 运筹模式三吉研判 (天辅、天心、天任为吉星；开、休、生为吉门；值符、太阴、六合、九天为吉神)
    let isLuckyStar = false;
    let isLuckyDoor = false;
    let isLuckySpirit = false;
    let luckyCount = 0;

    if (state.maskWeakened) {
      isLuckyStar = ['天辅', '天心', '天任'].some(s => star.includes(s));
      isLuckyDoor = ['开门', '休门', '生门', '开', '休', '生'].some(d => door.includes(d));
      isLuckySpirit = ['值符', '太阴', '六合', '九天'].includes(spirit);
      luckyCount = (isLuckyStar ? 1 : 0) + (isLuckyDoor ? 1 : 0) + (isLuckySpirit ? 1 : 0);
    }

    // 第一行: 八神 + 空亡/马星
    const isSpiritPicked = state.selectedYongShen && (state.selectedYongShen.includes(spirit) || (isFuSpirit && state.selectedYongShen.includes('值符')));
    let spiritClass = `spirit-tag ${isFuSpirit ? 'is-fu' : ''} ${isSpiritPicked ? 'is-picked-symbol' + (isFuSpirit ? ' is-zhifu-symbol' : '') : ''}`;
    let spiritTip = spirit;
    if (state.maskWeakened && isLuckySpirit && luckyCount > 0) {
      spiritClass += ` is-lucky-symbol lucky-lv-${luckyCount}`;
      spiritTip = `【运筹·吉神】${spirit}（本宫${luckyCount}吉）`;
    }

    const isKongPicked = state.selectedYongShen && (
      state.selectedYongShen.includes('空亡') ||
      state.selectedYongShen.includes('旬空') ||
      state.selectedYongShen.includes(`空亡•${GONG_CN[g]}宫`) ||
      state.selectedYongShen.includes(`旬空•${GONG_CN[g]}宫`) ||
      state.selectedYongShen.includes(`旬空亡•${GONG_CN[g]}宫`) ||
      state.selectedYongShen.includes(`空亡•${GONG_CN[g]}`) ||
      state.selectedYongShen.includes(`旬空•${GONG_CN[g]}`) ||
      state.selectedYongShen.includes(`旬空亡•${GONG_CN[g]}`)
    );
    const isMaPicked = state.selectedYongShen && state.selectedYongShen.includes('马星');

    const spiritHtml = `
      <div class="cell-row-top">
        <div class="spirit-box">
          <span class="${spiritClass}" title="${spiritTip}">${spirit}</span>
          ${flag.isKong ? `<span class="badge-kong ${isKongPicked ? 'is-picked-symbol' : ''}">○</span>` : ''}
          ${flag.hasMa ? `<span class="badge-ma ${isMaPicked ? 'is-picked-symbol' : ''}">马</span>` : ''}
        </div>
      </div>
    `;

    const isTianRui = star.includes('天芮');
    const hasTianQin = isTianRui || star.includes('天禽') || !!pan.tianpanJigan[g];

    const tg = pan.tianpanGan[g] || '';
    const isHighlightPurple = (tg === pan.dayGan || tg === pan.shiGan);
    const isTgPicked = state.selectedYongShen && (
      state.selectedYongShen.includes(tg) ||
      (tg === pan.dayGan && state.selectedYongShen.includes('日干')) ||
      (tg === pan.shiGan && state.selectedYongShen.includes('时干')) ||
      (pan.pillars && pan.pillars.year && tg === pan.pillars.year[0] && state.selectedYongShen.includes('年干')) ||
      (pan.pillars && pan.pillars.month && tg === pan.pillars.month[0] && state.selectedYongShen.includes('月干')) ||
      (HE_GAN_MAP[pan.dayGan] && tg === HE_GAN_MAP[pan.dayGan] && state.selectedYongShen.includes('合干'))
    );
    let tgClass = isHighlightPurple ? 'tian-gan highlight-purple' : 'tian-gan';
    if (isTgPicked) tgClass += ' is-picked-symbol';

    let tianJiganHtml = '';
    if (pan.tianpanJigan[g]) {
      const isTjPicked = state.selectedYongShen && (
        state.selectedYongShen.includes(pan.tianpanJigan[g]) ||
        (pan.tianpanJigan[g] === pan.dayGan && state.selectedYongShen.includes('日干')) ||
        (pan.tianpanJigan[g] === pan.shiGan && state.selectedYongShen.includes('时干'))
      );
      tianJiganHtml = `<span class="tian-jigan-stem ${isTjPicked ? 'is-picked-symbol' : ''}">${pan.tianpanJigan[g]}</span>`;
    }

    const starWang = getStarWangshuaiAnalysis(isTianRui ? '天芮' : star, g, pan);
    let starTip = starWang && starWang.text ? `${star}星（${starWang.text}）` : `${star}星`;
    if (hasTianQin) {
      const qinWang = getStarWangshuaiAnalysis('天禽', g, pan);
      const ruiPart = starWang && starWang.text ? `天芮星（${starWang.text}）` : '天芮星';
      const qinPart = qinWang && qinWang.text ? `天禽星（${qinWang.text}）` : '天禽星';
      starTip = `${ruiPart} ｜ ${qinPart}`;
    }

    let starDisplayHtml = star;
    if (isTianRui) {
      starDisplayHtml = `天芮<span class="star-qin">禽</span>`;
    }

    const isStarPicked = state.selectedYongShen && state.selectedYongShen.some(ys => star.includes(ys) || (hasTianQin && ys === '天禽'));
    let starClass = `star-name ${hasTianQin ? 'has-qin' : ''} ${isStarPicked ? 'is-picked-symbol' : ''}`;
    if (state.maskWeakened && isLuckyStar && luckyCount > 0) {
      starClass += ` is-lucky-symbol lucky-lv-${luckyCount}`;
      starTip = `【运筹·吉星】${starTip}（本宫${luckyCount}吉）`;
    }

    const starHtml = `
      <div class="cell-row-mid">
        <span class="${starClass}" title="${starTip}">${starDisplayHtml}</span>
        <div class="cell-stem-group">
          <span class="${tgClass}">${tg}</span>
          ${tianJiganHtml}
        </div>
      </div>
    `;

    // 第三行: 八门 + 地盘干 + 地盘寄干
    const dg = pan.dipan[g] || '';
    const isDgPicked = state.selectedYongShen && state.selectedYongShen.includes(dg);
    let diJiganHtml = '';
    if (g === 2 && pan.dipan[5]) {
      const isDjPicked = state.selectedYongShen && state.selectedYongShen.includes(pan.dipan[5]);
      diJiganHtml = `<span class="di-jigan-stem ${isDjPicked ? 'is-picked-symbol' : ''}">${pan.dipan[5]}</span>`;
    }

    const doorShengke = getDoorShengkeAnalysis(door, g, pan);
    let doorTip = doorShengke && doorShengke.text ? `${door}（${doorShengke.text}）` : door;

    const isDoorPicked = state.selectedYongShen && state.selectedYongShen.some(ys => door.includes(ys.replace('门', '')) || ys === door);
    let doorClass = `door-name ${isShiDoor ? 'is-shi' : ''} ${isDoorPicked ? 'is-picked-symbol' : ''}`;
    if (state.maskWeakened && isLuckyDoor && luckyCount > 0) {
      doorClass += ` is-lucky-symbol lucky-lv-${luckyCount}`;
      doorTip = `【运筹·吉门】${doorTip}（本宫${luckyCount}吉）`;
    }

    const doorHtml = `
      <div class="cell-row-bot">
        <span class="${doorClass}" title="${doorTip}">${door}</span>
        <div class="cell-stem-group">
          <span class="di-gan ${isDgPicked ? 'is-picked-symbol' : ''}">${dg}</span>
          ${diJiganHtml}
        </div>
      </div>
    `;

    cell.innerHTML = spiritHtml + starHtml + doorHtml;

    // 清除原有状态类
    cell.classList.remove('is-yongshen', 'is-yongshen-zhifu', 'is-yongshen-opposite-kong', 'is-palace-dimmed', 'is-dipan-cell', 'has-lucky-3', 'has-lucky-2', 'has-lucky-1');
    cell.removeAttribute('title');
    if (state.maskWeakened && luckyCount > 0) {
      cell.classList.add(`has-lucky-${luckyCount}`);
      cell.dataset.luckyCount = String(luckyCount);
    } else {
      delete cell.dataset.luckyCount;
    }

    // 用神落宫与旬空对冲宫标记 (仅天盘生效)
    const matchRes = matchResByGong[g];
    const isYsMatch = matchRes && matchRes.matched;
    const isYsKong = emptyYongShenPalaces.includes(g);
    const isOpposite = oppositePalacesOfKong.has(g);

    if (isYsMatch) {
      cell.classList.remove('is-palace-dimmed');
      if (matchRes.hasZhifu) {
        cell.classList.add('is-yongshen-zhifu');
      } else {
        cell.classList.add('is-yongshen');
      }

      if (lookOppositeActive && (isYsKong || isOpposite)) {
        // 在天盘文字底下用淡蓝色的光圈在用神下面的宫位进行标记
        const oppGong = (g === 5 ? 2 : (10 - g));
        cell.innerHTML += `<div class="palace-kong-halo is-ys-halo" title="用神落宫逢旬空：人/物逢空，转寻对冲${GONG_CN[oppGong]}宫"></div>`;
        cell.setAttribute('title', `【用神落宫·旬空】${matchRes.items.join('、')}（人/物逢空，转寻对冲${GONG_CN[oppGong]}宫）`);
      } else {
        cell.setAttribute('title', `【用神落宫】${matchRes.items.join('、')}`);
      }
    } else if (lookOppositeActive && isOpposite) {
      cell.classList.remove('is-palace-dimmed');
      // 并在对面宫位进行标记
      const oppInfo = oppositePalacesOfKong.get(g);
      const originName = GONG_CN[oppInfo.originGong] || oppInfo.originGong;
      cell.classList.add('is-yongshen-opposite-kong');
      cell.innerHTML += `<div class="palace-kong-halo is-opp-halo" title="【旬空对冲宫】对冲${originName}宫用神（${oppInfo.items.join('、')}）旬空，人/物逢空看此对宫"></div>`;
      cell.setAttribute('title', `【旬空对冲宫】对冲${originName}宫用神（${oppInfo.items.join('、')}）旬空，人/物逢空看此对宫`);
    } else {
      if (hasYongShen) {
        cell.classList.add('is-palace-dimmed');
      }
    }

    if (g === 5) {
      const isKongOppActive = state.kongLookOpposite;
      const kongBtnHtml = `
        <button type="button" class="btn-center-kong-toggle ${isKongOppActive ? 'is-solid' : 'is-hollow'}" id="btnCenterKongToggle" title="${isKongOppActive ? '旬空看对宫：已开启（实心·显示淡蓝色光圈，点击切换为不显示）' : '旬空看对宫：已关闭（空圈·不显示，点击切换为显示淡蓝色光圈）'}" aria-label="旬空看对宫切换">
          <span class="kong-icon"></span>
        </button>
      `;
      const isMaskWeakened = state.maskWeakened;
      const maskBtnHtml = `
        <button type="button" class="btn-center-mask-toggle ${isMaskWeakened ? 'is-solid' : 'is-hollow'}" id="btnCenterMaskToggle" title="${isMaskWeakened ? '运筹模式与蒙版减弱：已开启（实心·金黄色标记三吉，方便通盘运筹，点击恢复正常）' : '运筹模式与蒙版减弱：已关闭（空圈·点击开启金黄色标记三吉与减弱非用神蒙版）'}" aria-label="运筹与减弱非用神蒙版切换">
          <span class="mask-icon"></span>
        </button>
      `;
      cell.innerHTML += `${maskBtnHtml}${kongBtnHtml}`;
    }
  });
}

// 同步克应研判折叠按钮文案与状态
function updateKeyingToggleBtn() {
  const btn = document.getElementById('btnToggleKeyingDetail');
  const txt = document.getElementById('txtToggleKeyingDetail');
  if (!btn || !txt) return;

  if (state.showKeyingDetails) {
    btn.classList.add('is-active');
    btn.title = '点击收起并隐藏天盘干、门状态、地盘干';
    txt.textContent = '收起精简';
  } else {
    btn.classList.remove('is-active');
    btn.title = '点击展开显示天盘干、门状态、地盘干';
    txt.textContent = '展开详细';
  }
}

// 渲染表头象意切换按钮组 (全部 / 物象 / 人象)
function renderImageryModeGroupHtml(currentMode) {
  const mode = currentMode || 'all';
  return `
    <div class="imagery-mode-group" role="group" aria-label="象意切换">
      <button type="button" class="imagery-mode-btn ${mode === 'all' ? 'active' : ''}" data-mode="all" title="查看完整象意">全部</button>
      <button type="button" class="imagery-mode-btn ${mode === 'wu' ? 'active' : ''}" data-mode="wu" title="仅查看物象、外观、材质与事物">物象</button>
      <button type="button" class="imagery-mode-btn ${mode === 'ren' ? 'active' : ''}" data-mode="ren" title="仅查看人象、外表、心性与人物">人象</button>
    </div>
  `.trim();
}

// 切换全局象意显示模式并同步更新当前界面
function setImageryMode(mode) {
  state.imageryMode = mode || 'all';
  try {
    localStorage.setItem('qimen_imagery_mode', state.imageryMode);
  } catch (e) {
    console.warn('localStorage error', e);
  }

  // 同步更新所有表头中的切换按钮 active 状态
  document.querySelectorAll('.imagery-mode-group .imagery-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.imageryMode);
  });

  // 同步更新所有已渲染 table 的模式 class
  document.querySelectorAll('.merged-table').forEach(tbl => {
    tbl.classList.remove('imagery-mode-all', 'imagery-mode-wu', 'imagery-mode-ren');
    tbl.classList.add(`imagery-mode-${state.imageryMode}`);
  });

  if (typeof syncSettingsModal === 'function') syncSettingsModal();
}

// 渲染克应速查面板
function renderKeyingAnalysis(pan, gong) {
  const analysis = getPalaceAnalysis(pan, gong);
  const contentDiv = document.getElementById('keyingContent');

  // 地盘全息模式：作为纯静态九宫定位基盘查询参考表 (不进行运算，移除本局地盘与多余杂项)
  if (state.showDipan) {
    const info = DIPAN_PALACE_INFO[gong];
    const mem = JIUGONG_MEMORY_DATA[gong];
    document.getElementById('keyingTitle').textContent = `『${mem.gongName}』(${mem.direction}) 地盘基盘参考`;

    let curDiGan = '';
    if (pan && pan.dipan) {
      if (gong === 2 && pan.dipan[5]) {
        curDiGan = `${pan.dipan[2]} 寄${pan.dipan[5]}`;
      } else if (gong === 5) {
        curDiGan = pan.dipan[5] || '戊';
      } else {
        curDiGan = pan.dipan[gong] || '';
      }
    }

    let html = `
      <div class="dipan-detail-overview">
        <div class="dipan-badge-row">
          <span class="dipan-badge-item num">洛书 ${mem.gongNum}宫</span>
          <span class="dipan-badge-item wuxing">${info.detail.nature}</span>
          <span class="dipan-badge-item bagua">${info.trigram ? info.trigram + ' ' : ''}${info.bagua}卦</span>
          <span class="dipan-badge-item dir">${info.direction}</span>
          <span class="dipan-badge-item star">${mem.star}星</span>
          <span class="dipan-badge-item door">${mem.door}</span>
        </div>
      </div>

      <div class="memory-card-container">
        <div class="memory-list">
          <div class="memory-row">
            <span class="memory-tag gong">宫</span>
            <div class="memory-content">
              <span class="memory-name">${mem.bagua}：</span>
              <span class="memory-desc">${mem.gongDesc}</span>
            </div>
          </div>
          <div class="memory-row">
            <span class="memory-tag star">星</span>
            <div class="memory-content">
              <span class="memory-name">${mem.star}星：</span>
              <span class="memory-desc">${mem.starDesc}</span>
            </div>
          </div>
          <div class="memory-row">
            <span class="memory-tag door">门</span>
            <div class="memory-content">
              <span class="memory-name">${mem.door}：</span>
              <span class="memory-desc">${mem.doorDesc}</span>
            </div>
          </div>
          <div class="memory-row">
            <span class="memory-tag stem">天干</span>
            <div class="memory-content">
              <span class="memory-desc">${mem.tianganDesc}</span>
            </div>
          </div>
          <div class="memory-row">
            <span class="memory-tag branch">地支</span>
            <div class="memory-content">
              <span class="memory-desc">${mem.dizhiDesc}</span>
            </div>
          </div>
          ${curDiGan ? `
          <div class="memory-row">
            <span class="memory-tag current">地盘干</span>
            <div class="memory-content">
              <span class="memory-desc">地盘坐干 <strong>【${curDiGan}】</strong>（地盘为基、为静、为过去状态）</span>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    contentDiv.innerHTML = html;
    return;
  }

  document.getElementById('keyingTitle').textContent = `${analysis.title} 克应研判`;
  updateKeyingToggleBtn();

  // 排宫法(转盘)中五宫寄坤二，无独立门星克应，明确显示“无”
  if (gong === 5 && pan.paipanMethod === 'zhuan') {
    contentDiv.innerHTML = '<div style="color: var(--md-sys-color-outline); padding: 8px 0; font-size: 14px; font-weight: 500;">无</div>';
    return;
  }

  let html = '';

  // 天盘实战克应与天干六变综合研判表 (根据用户要求全面合并，遁甲、相合、相刑无状态不显示，默认隐藏3个次要信息)
  const ma = analysis.mergedAnalysis;
  if (ma && ma.rows && ma.rows.length > 0) {
    html += '<div class="merged-analysis-card">';
    html += '  <div class="merged-table-responsive">';
    html += `    <table class="merged-table imagery-mode-${state.imageryMode || 'all'}">`;
    html += '      <thead>';
    html += '        <tr>';
    html += '          <th class="merged-th-tag">项目</th>';
    html += '          <th class="merged-th-desc">';
    html += '            <div class="desc-header-flex">';
    html += '              <span class="desc-header-title">实战象意与深层分析</span>';
    html += `              ${renderImageryModeGroupHtml(state.imageryMode)}`;
    html += '            </div>';
    html += '          </th>';
    html += '          <th class="merged-th-status">状态 / 旺衰</th>';
    html += '        </tr>';
    html += '      </thead>';
    html += '      <tbody>';
    ma.rows.forEach(r => {
      const isTianganRow = (r.tag === '天盘干');
      const isDoorRow = (r.tag === '八门' || r.tag === '门');
      const isDiganRow = (r.tag === '地盘干' || r.tag === '天干能量');

      // 1. 天盘干行默认隐藏, 3. 地盘干行默认隐藏
      if ((isTianganRow || isDiganRow) && !state.showKeyingDetails) {
        return;
      }

      // 2. 门行状态默认隐藏
      let statusHtml = '';
      let descHtml = r.html || r.content;
      let trDataAttr = '';

      if (r.tag === '十干克应' && r.items && r.items.length > 1) {
        trDataAttr = ` data-shigan-items="${JSON.stringify(r.items).replace(/"/g, '&quot;')}"`;
        const btnGroupHtml = `
          <div class="shigan-btn-group">
            ${r.items.map((it, idx) => `
              <button type="button" class="shigan-switch-btn ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
                ${it.name}
              </button>
            `).join('')}
          </div>
        `;
        descHtml = `${btnGroupHtml}<div class="shigan-desc-display">${r.items[0].content}</div>`;
        statusHtml = `<span class="merged-status-badge ${r.items[0].statusClass} shigan-live-status">${r.items[0].status}</span>`;
      } else {
        if (r.status) {
          if (!isDoorRow || state.showKeyingDetails) {
            statusHtml = `<span class="merged-status-badge ${r.statusClass}">${r.status}</span>`;
          }
        }
      }

      html += `        <tr${trDataAttr}>
          <td class="merged-cell-tag"><span class="merged-tag-badge ${r.tagClass}">${r.tag}</span></td>
          <td class="merged-cell-desc">${descHtml}</td>
          <td class="merged-cell-status">${statusHtml}</td>
        </tr>`;
    });
    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';

    if (ma.classicEvidence && ma.classicEvidence.length > 0) {
      html += '  <div class="merged-classic-block">';
      html += '    <div class="merged-classic-title">典籍印证：</div>';
      ma.classicEvidence.forEach(c => {
        html += `    <div class="merged-classic-item">${c}</div>`;
      });
      html += '  </div>';
    }
    html += '</div>';
  }

  if (!html) {
    html = '<div style="color: var(--md-sys-color-outline); padding: 8px 0; font-size: 14px; font-weight: 500;">无</div>';
  }

  contentDiv.innerHTML = html;
}

function renderCalendarTerms(pan) {
  const cur = pan.termInfo.current;
  const nxt = pan.termInfo.next;
  document.getElementById('calTermCur').textContent = `${cur.name}: ${String(cur.month).padStart(2, '0')}月${String(cur.day).padStart(2, '0')}日${cur.hour}时${cur.minute}分`;
  document.getElementById('calTermNext').textContent = `${nxt.name}: ${String(nxt.month).padStart(2, '0')}月${String(nxt.day).padStart(2, '0')}日${nxt.hour}时${nxt.minute}分`;
}

// 8. 快捷功能实现
function setToNow() {
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth() + 1;
  state.day = now.getDate();
  state.hour = now.getHours();
  state.minute = now.getMinutes();
  state.manualJu = null;
  state.customPillars = null;

  const selManual = document.getElementById('selManualJu');
  if (selManual) selManual.value = 'auto';

  const selBaoshi = document.getElementById('selBaoshiHour');
  if (selBaoshi) selBaoshi.value = 'default';

  const ipt = document.getElementById('iptBaoShu');
  const rem = document.getElementById('txtBaoshuRem');
  if (ipt) ipt.value = '';
  if (rem) rem.textContent = '余：-';

  state.calViewYear = state.year;
  state.calViewMonth = state.month;

  syncDateTimeToPickers();
  renderCalendar();
  executePaipan();
  showToast('已重置为当前系统时间');
}

function toggleSimpleMode() {
  state.isSimpleMode = !state.isSimpleMode;
  document.body.classList.toggle('simple-mode', state.isSimpleMode);
  document.getElementById('btnToggleSimple').textContent = state.isSimpleMode ? '完整模式' : '简洁模式';
  localStorage.setItem('qimen_simple_mode', state.isSimpleMode ? '1' : '0');
  if (typeof syncSettingsModal === 'function') syncSettingsModal();
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('qimen_theme', newTheme);
  if (typeof syncSettingsModal === 'function') syncSettingsModal();
  showToast(`已切换至${newTheme === 'dark' ? '深色主题' : '浅色主题'}`);
}

function copyQimenToClipboard() {
  if (!state.currentPan) return;
  const text = formatPlainQimen(state.currentPan);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('排盘信息已成功复制到剪贴板！');
    }).catch(err => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text, successMsg = '排盘信息已成功复制到剪贴板！') {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast(successMsg);
}

// 格式化单宫纯文本研判分析 (供复制用神、全盘克应导出复用)
function formatPalaceAnalysisText(p, gong, opts = {}) {
  const info = DIPAN_PALACE_INFO[gong];
  const spirit = p.tianpanSpirit[gong] || '无';
  const star = p.tianpanStar[gong] || '无';
  const starWang = getStarWangshuaiAnalysis(star, gong, p);
  const starText = starWang && starWang.text ? `${star}星（${starWang.text}）` : `${star}星`;

  const door = p.tianpanDoor[gong] || '无';
  const doorAnalysis = getDoorShengkeAnalysis(door, gong, p);
  const doorText = doorAnalysis && doorAnalysis.text ? `${door}（${doorAnalysis.text}）` : door;

  const tg = p.tianpanGan[gong] || '';
  const tj = p.tianpanJigan[gong] || '';
  const dg = p.dipan[gong] || '';
  const dj = (gong === 2 && p.dipan[5]) ? p.dipan[5] : '';

  const flag = p.palaceFlags[gong] || {};
  const flagsList = [];
  if (flag.isKong) flagsList.push('旬空');
  if (flag.hasMa) flagsList.push('马星(主动/出行/速变)');

  const pa = getPalaceAnalysis(p, gong);
  const ma = pa ? pa.mergedAnalysis : null;

  let out = '';
  const prefix = opts.titlePrefix || '宫位';
  const tag = opts.titleTag ? ` —— ${opts.titleTag}` : '';
  out += `${prefix}：『${GONG_CN[gong]}宫』(${info.direction} / ${info.bagua}卦 / 五行属${info.element})${tag}\n`;
  if (opts.note) {
    out += `  • 备注：${opts.note}\n`;
  }
  if (gong === 5 && p.paipanMethod === 'zhuan') {
    out += `  • 说明：排宫法(转盘)中五宫寄坤二，无独立神门星，地盘奇仪为【${p.dipan[5] || '戊'}】\n\n`;
    return out;
  }

  out += `  • 宫内神星门：八神【${spirit}】 ｜ 九星【${starText}】 ｜ 八门【${doorText}】\n`;
  out += `  • 天地盘奇仪：天盘【${tg}】${tj ? '(' + tj + ')' : ''} 加 地盘【${dg}】${dj ? '(' + dj + ')' : ''}\n`;
  if (flagsList.length > 0) {
    out += `  • 神煞标记：${flagsList.join('、')}\n`;
  }

  const yingqi = getYingqiXunKongAnalysis(p, gong);
  if (yingqi && yingqi.isKong) {
    out += `  • 旬空定应期：${yingqi.content}\n`;
  }

  if (ma && ma.rows) {
    const shiganRow = ma.rows.find(r => r.tag === '十干克应');
    if (shiganRow) {
      if (shiganRow.items && shiganRow.items.length > 1) {
        const shiganTexts = shiganRow.items.map(it => `[${it.name}] ${it.content} (${it.status})`).join('；');
        out += `  • 十干实战克应：${shiganTexts}\n`;
      } else {
        out += `  • 十干实战克应：${shiganRow.content} [${shiganRow.status}]\n`;
      }
    }
    const dunjiaRow = ma.rows.find(r => r.tag === '遁甲');
    if (dunjiaRow) {
      out += `  • 遁甲之变：${dunjiaRow.content}\n`;
    }
    const heRow = ma.rows.find(r => r.tag === '相合');
    if (heRow) {
      out += `  • 天干相合：${heRow.content}\n`;
    }
    const xingRow = ma.rows.find(r => r.tag === '相刑');
    if (xingRow) {
      out += `  • 天干相刑：${xingRow.content}\n`;
    }
    const shengwangRow = ma.rows.find(r => r.tag === '生旺死绝');
    if (shengwangRow) {
      out += `  • 气数旺绝：${shengwangRow.content}（${shengwangRow.status}）\n`;
    }
    const maxingRow = ma.rows.find(r => r.tag === '马星');
    if (maxingRow) {
      out += `  • 马星动态研判：${maxingRow.content} [${maxingRow.status}]\n`;
    }
  }

  if (ma && ma.classicEvidence && ma.classicEvidence.length > 0) {
    out += `  • 典籍印证：${ma.classicEvidence.join(' ')}\n`;
  }
  out += `\n`;
  return out;
}

// 复制用神：复制内容包含所问事项、所选用神落宫详析，若逢旬空且看对宫则把旬空对冲宫完整包含在内
function copyYongShenAnalysis() {
  if (!state.currentPan) {
    showToast('当前无可用排盘信息');
    return;
  }
  const p = state.currentPan;
  const yongShenList = (Array.isArray(state.selectedYongShen) && state.selectedYongShen.length > 0)
    ? state.selectedYongShen
    : ['值符'];

  const questionText = state.userQuestion ? state.userQuestion.trim() : '（未指定具体所问事项，求测自身与事态大纲）';
  const isPersonObj = isYongShenPersonOrObject(yongShenList, state.userQuestion, state.yongshenNature);
  const shouldLookOpposite = (state.kongLookOpposite && isPersonObj);

  let out = `【奇门遁甲 · 用神专断落宫报告】\n`;
  out += `────────────────────────────────────────\n`;
  out += `所问事项：${questionText}\n`;
  out += `四柱干支：${p.pillars.year}  ${p.pillars.month}  ${p.pillars.day}  ${p.pillars.hour}\n`;
  out += `局象定局：${p.dingju.desc}（${p.paipanMethod === 'zhuan' ? '排宫法/转盘' : '飞宫法/飞盘'}）\n`;
  out += `选定用神：${yongShenList.join('、')}\n`;
  out += `旬空马星：日空【${p.kongwang.day}】 时空【${p.kongwang.hour}】 旬首【${p.xun}】\n`;
  out += `────────────────────────────────────────\n\n`;

  // 找出与用神匹配的宫位
  const matchedPalaces = [];
  for (let g = 1; g <= 9; g++) {
    const matchRes = checkPalaceMatchYongShen(p, g, yongShenList);
    if (matchRes.matched) {
      matchedPalaces.push({ gong: g, matchRes });
    }
  }

  if (matchedPalaces.length === 0) {
    out += `当前所选取的用神在天盘中未检索到明确落宫，请检查用神设定。\n`;
  } else {
    out += `【已选【${yongShenList.join('、')}】之天盘落宫详析】\n\n`;
    const oppPalacesToAppend = [];
    const addedOppGongs = new Set();

    matchedPalaces.forEach(({ gong, matchRes }, idx) => {
      let note = `对应所选用神：【${matchRes.items.join('、')}】${matchRes.hasZhifu ? ' (全局大纲首领)' : ''}`;
      const flag = p.palaceFlags[gong] || {};
      if (flag.isKong) {
        const oppG = (gong === 5 ? 2 : (10 - gong));
        if (shouldLookOpposite) {
          const reasonText = '人/物逢空，转寻对冲';
          note += `；落宫逢旬空（${reasonText}【${GONG_CN[oppG]}宫】）`;
          if (!addedOppGongs.has(oppG)) {
            addedOppGongs.add(oppG);
            oppPalacesToAppend.push({
              oppGong: oppG,
              originGong: gong,
              originName: GONG_CN[gong],
              items: matchRes.items,
              reasonText
            });
          }
        } else {
          const reasonText = !state.kongLookOpposite ? '已手动关闭旬空看对冲宫' : '测事逢空待填实，不看对面';
          note += `；落宫逢旬空（${reasonText}）`;
        }
      }

      out += formatPalaceAnalysisText(p, gong, {
        titlePrefix: `用神宫位 ${idx + 1}`,
        titleTag: `对应所选用神：【${matchRes.items.join('、')}】${matchRes.hasZhifu ? ' (全局大纲首领)' : ''}`,
        note
      });
    });

    if (oppPalacesToAppend.length > 0) {
      out += `────────────────────────────────────────\n`;
      out += `【旬空转看对冲落宫详析】\n\n`;
      oppPalacesToAppend.forEach(({ oppGong, originName, items, reasonText }, oppIdx) => {
        out += formatPalaceAnalysisText(p, oppGong, {
          titlePrefix: `对冲宫位 ${oppIdx + 1}`,
          titleTag: `【旬空转看对冲宫】`,
          note: `对冲『${originName}宫』用神【${items.join('、')}】落宫逢旬空（${reasonText}，转寻此对冲宫参断）`
        });
      });
    }
  }

  out += `════════════════════════════════════════\n`;
  out += `奇门遁甲专业排盘分析系统\n`;

  const successToast = '所问事项与用神落宫分析已复制到剪贴板！';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out).then(() => {
      showToast(successToast);
    }).catch(err => {
      fallbackCopy(out, successToast);
    });
  } else {
    fallbackCopy(out, successToast);
  }
}

// 获取全盘克应速查弹窗当前信息纯文本 (全盘或仅看用神与对冲宫)
function getKeyingModalCurrentContentText() {
  if (!state.currentPan) return '';
  const p = state.currentPan;
  const yongShenList = (Array.isArray(state.selectedYongShen) && state.selectedYongShen.length > 0)
    ? state.selectedYongShen
    : ['值符'];

  const questionText = state.userQuestion ? state.userQuestion.trim() : '（未指定具体所问事项，求测自身与事态大纲）';
  const isPersonObj = isYongShenPersonOrObject(yongShenList, state.userQuestion, state.yongshenNature);
  const shouldLookOpposite = (state.kongLookOpposite && isPersonObj);

  let out = '';
  if (state.keyingOnlyYongShen) {
    out += `【奇门遁甲 · 克应速查当前信息（仅看用神落宫）】\n`;
    out += `────────────────────────────────────────\n`;
    out += `所问事项：${questionText}\n`;
    out += `四柱干支：${p.pillars.year}  ${p.pillars.month}  ${p.pillars.day}  ${p.pillars.hour}\n`;
    out += `局象定局：${p.dingju.desc}（${p.paipanMethod === 'zhuan' ? '排宫法/转盘' : '飞宫法/飞盘'}）\n`;
    out += `选定用神：${yongShenList.join('、')}\n`;
    out += `旬空马星：日空【${p.kongwang.day}】 时空【${p.kongwang.hour}】 旬首【${p.xun}】\n`;
    out += `────────────────────────────────────────\n\n`;

    const matchedPalaces = [];
    for (let g = 1; g <= 9; g++) {
      const matchRes = checkPalaceMatchYongShen(p, g, yongShenList);
      if (matchRes.matched) {
        matchedPalaces.push({ gong: g, matchRes });
      }
    }

    if (matchedPalaces.length === 0) {
      out += `当前所选取的用神【${yongShenList.join('、')}】在天盘中未检索到明确落宫。\n`;
    } else {
      out += `【用神落宫克应详析】\n\n`;
      const oppPalacesToAppend = [];
      const addedOppGongs = new Set();

      matchedPalaces.forEach(({ gong, matchRes }, idx) => {
        let note = `对应所选用神：【${matchRes.items.join('、')}】${matchRes.hasZhifu ? ' (全局大纲首领)' : ''}`;
        const flag = p.palaceFlags[gong] || {};
        if (flag.isKong) {
          const oppG = (gong === 5 ? 2 : (10 - gong));
          if (shouldLookOpposite) {
            const reasonText = '人/物逢空，转寻对冲';
            note += `；落宫逢旬空（${reasonText}【${GONG_CN[oppG]}宫】）`;
            if (!addedOppGongs.has(oppG)) {
              addedOppGongs.add(oppG);
              oppPalacesToAppend.push({
                oppGong: oppG,
                originGong: gong,
                originName: GONG_CN[gong],
                items: matchRes.items,
                reasonText
              });
            }
          } else {
            const reasonText = !state.kongLookOpposite ? '已手动关闭旬空看对冲宫' : '测事逢空待填实，不看对面';
            note += `；落宫逢旬空（${reasonText}）`;
          }
        }

        out += formatPalaceAnalysisText(p, gong, {
          titlePrefix: `用神宫位 ${idx + 1}`,
          titleTag: `对应所选用神：【${matchRes.items.join('、')}】`,
          note
        });
      });

      if (oppPalacesToAppend.length > 0) {
        out += `────────────────────────────────────────\n`;
        out += `【旬空转看对冲落宫详析】\n\n`;
        oppPalacesToAppend.forEach(({ oppGong, originName, items, reasonText }, oppIdx) => {
          out += formatPalaceAnalysisText(p, oppGong, {
            titlePrefix: `对冲宫位 ${oppIdx + 1}`,
            titleTag: `【旬空转看对冲宫】`,
            note: `对冲『${originName}宫』用神【${items.join('、')}】落宫逢旬空（${reasonText}，转寻此对冲宫参断）`
          });
        });
      }
    }
  } else {
    // 全盘九宫
    out += `【奇门遁甲 · 全盘九宫克应速查报告】\n`;
    out += `────────────────────────────────────────\n`;
    out += `四柱干支：${p.pillars.year}  ${p.pillars.month}  ${p.pillars.day}  ${p.pillars.hour}\n`;
    out += `局象定局：${p.dingju.desc}（${p.paipanMethod === 'zhuan' ? '排宫法/转盘' : '飞宫法/飞盘'}）\n`;
    out += `旬空马星：日空【${p.kongwang.day}】 时空【${p.kongwang.hour}】 旬首【${p.xun}】\n`;
    out += `────────────────────────────────────────\n\n`;

    const gongs = [4, 9, 2, 3, 5, 7, 8, 1, 6];
    gongs.forEach((g, idx) => {
      out += formatPalaceAnalysisText(p, g, {
        titlePrefix: `九宫之 ${idx + 1}`
      });
    });
  }

  out += `════════════════════════════════════════\n`;
  out += `奇门遁甲专业排盘分析系统\n`;
  return out;
}

// 复制全盘克应速查弹窗当前信息 (全盘或仅看用神与对冲宫)
function copyKeyingModalCurrentContent() {
  if (!state.currentPan) {
    showToast('当前无可用排盘信息');
    return;
  }
  const out = getKeyingModalCurrentContentText();
  const successToast = '当前克应信息已成功复制到剪贴板！';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(out).then(() => {
      showToast(successToast);
    }).catch(err => {
      fallbackCopy(out, successToast);
    });
  } else {
    fallbackCopy(out, successToast);
  }
}

// 一起复制排盘与当前信息 (完整排盘 + 当前克应信息)
function copyKeyingModalPanAndCurrentContent() {
  if (!state.currentPan) {
    showToast('当前无可用排盘信息');
    return;
  }
  const panText = formatPlainQimen(state.currentPan);
  const currentKeyingText = getKeyingModalCurrentContentText();
  const combined = `${panText.trim()}\n\n${currentKeyingText.trim()}\n`;

  const successToast = '排盘与当前信息(1+2)已成功复制到剪贴板！';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(combined).then(() => {
      showToast(successToast);
    }).catch(err => {
      fallbackCopy(combined, successToast);
    });
  } else {
    fallbackCopy(combined, successToast);
  }
}

// 渲染全盘克应速查模态弹窗内容
function renderKeyingModalContent() {
  if (!state.currentPan) return;
  const p = state.currentPan;
  const modalBody = document.getElementById('modalKeyingBody');
  if (!modalBody) return;
  modalBody.innerHTML = '';

  const btnFilter = document.getElementById('btnKeyingFilterYongShen');
  const titleEl = document.getElementById('modalKeyingTitle');

  const yongShenList = (Array.isArray(state.selectedYongShen) && state.selectedYongShen.length > 0)
    ? state.selectedYongShen
    : ['值符'];

  const isPersonObj = isYongShenPersonOrObject(yongShenList, state.userQuestion, state.yongshenNature);
  const shouldLookOpposite = (state.kongLookOpposite && isPersonObj);

  if (btnFilter) {
    if (state.keyingOnlyYongShen) {
      btnFilter.textContent = '查看全盘克应';
      btnFilter.className = 'm3-btn m3-btn-filled';
      btnFilter.title = '点击切换回查看全盘九宫克应';
    } else {
      btnFilter.textContent = '只看当前用神';
      btnFilter.className = 'm3-btn m3-btn-outlined';
      btnFilter.title = state.kongLookOpposite
        ? '点击只查看当前用神落宫及旬空对冲宫克应'
        : '点击只查看当前用神落宫克应';
    }
  }

  if (titleEl) {
    titleEl.textContent = state.keyingOnlyYongShen
      ? `奇门遁甲克应速查 · 仅看用神落宫`
      : '奇门遁甲全盘克应速查';
  }

  let palacesToRender = []; // Array of { gong, isOpposite, originGong, matchItems, reasonText }

  if (!state.keyingOnlyYongShen) {
    // 全盘九宫
    const standardGongs = [4, 9, 2, 3, 5, 7, 8, 1, 6];
    palacesToRender = standardGongs.map(g => ({ gong: g, isOpposite: false }));
  } else {
    // 仅看当前用神 (含旬空对冲宫)
    const matchedPalaces = [];
    for (let g = 1; g <= 9; g++) {
      const matchRes = checkPalaceMatchYongShen(p, g, yongShenList);
      if (matchRes.matched) {
        matchedPalaces.push({ gong: g, matchRes });
      }
    }

    if (matchedPalaces.length === 0) {
      modalBody.innerHTML = `
        <div style="padding: 28px 16px; text-align: center; color: var(--md-sys-color-outline);">
          <p style="font-size: 15px; margin-bottom: 12px;">当前所选取的用神【${yongShenList.join('、')}】在天盘中未检索到明确落宫。</p>
          <button type="button" class="m3-btn m3-btn-tonal" id="btnKeyingResetAll">查看全盘克应</button>
        </div>
      `;
      const resetBtn = document.getElementById('btnKeyingResetAll');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          state.keyingOnlyYongShen = false;
          renderKeyingModalContent();
        });
      }
      return;
    }

    const addedOppGongs = new Set();
    matchedPalaces.forEach(({ gong, matchRes }) => {
      palacesToRender.push({
        gong,
        isOpposite: false,
        matchItems: matchRes.items
      });

      const isKong = !!(p.palaceFlags[gong] && p.palaceFlags[gong].isKong);
      if (isKong && shouldLookOpposite) {
        const oppG = (gong === 5 ? 2 : (10 - gong));
        if (!addedOppGongs.has(oppG)) {
          addedOppGongs.add(oppG);
          const reasonText = '人/物逢空，转寻对冲';
          palacesToRender.push({
            gong: oppG,
            isOpposite: true,
            originGong: gong,
            originName: GONG_CN[gong],
            matchItems: matchRes.items,
            reasonText
          });
        }
      }
    });
  }

  // 渲染每个宫位卡片
  palacesToRender.forEach(item => {
    const g = item.gong;
    const analysis = getPalaceAnalysis(p, g);
    const sec = document.createElement('div');
    sec.className = 'keying-palace-section';
    sec.style.marginBottom = '14px';
    sec.style.borderBottom = '1px solid var(--md-sys-color-outline-variant, #ddd)';
    sec.style.paddingBottom = '10px';

    let headerBadgeHtml = '';
    let noticeBannerHtml = '';

    if (item.isOpposite) {
      headerBadgeHtml = `<span class="keying-palace-badge is-opposite-badge">旬空转看对冲宫</span>`;
      noticeBannerHtml = `
        <div class="keying-palace-notice is-opp-notice">
          因『${item.originName}宫』用神【${item.matchItems.join('、')}】落宫逢旬空（${item.reasonText}），依奇门定则转寻此对冲『${GONG_CN[g]}宫』参断。
        </div>
      `;
    } else if (state.keyingOnlyYongShen && item.matchItems) {
      headerBadgeHtml = `<span class="keying-palace-badge is-yongshen-badge">用神：${item.matchItems.join('、')}</span>`;
      const isKong = !!(p.palaceFlags[g] && p.palaceFlags[g].isKong);
      if (isKong) {
        const oppG = (g === 5 ? 2 : (10 - g));
        if (shouldLookOpposite) {
          const reasonText = '人/物逢空，转寻对冲';
          noticeBannerHtml = `
            <div class="keying-palace-notice is-kong-notice">
              用神落宫逢旬空（${reasonText}），转寻对冲【${GONG_CN[oppG]}宫】（见下方对冲宫详析）。
            </div>
          `;
        } else {
          const reasonText = !state.kongLookOpposite ? '已手动关闭旬空看对冲宫' : '测事逢空待填实，不看对面';
          noticeBannerHtml = `
            <div class="keying-palace-notice is-kong-notice">
              用神落宫逢旬空（${reasonText}）。
            </div>
          `;
        }
      }
    }

    let html = `
      <div class="keying-palace-title-box">
        <h4 style="color: #0055ea; margin: 0; font-size: 16px;">${analysis.title}</h4>
        ${headerBadgeHtml}
      </div>
      ${noticeBannerHtml}
    `;

    if (g === 5 && p.paipanMethod === 'zhuan') {
      html += '<div style="padding-left:10px; color: var(--md-sys-color-outline); padding: 8px 0;">排宫法(转盘)中五宫寄坤二，无独立门星克应，地盘奇仪为【' + (p.dipan[5] || '戊') + '】。</div>';
      sec.innerHTML = html;
      modalBody.appendChild(sec);
      return;
    }

    if (analysis.mergedAnalysis && analysis.mergedAnalysis.rows && analysis.mergedAnalysis.rows.length > 0) {
      const ma = analysis.mergedAnalysis;
      html += '<div class="merged-analysis-card" style="margin-top: 4px; box-shadow: none;">';
      html += '  <div class="merged-table-responsive">';
      html += `    <table class="merged-table imagery-mode-${state.imageryMode || 'all'}">`;
      html += '      <thead>';
      html += '        <tr>';
      html += '          <th class="merged-th-tag">项目</th>';
      html += '          <th class="merged-th-desc">';
      html += '            <div class="desc-header-flex">';
      html += '              <span class="desc-header-title">实战象意与深层分析</span>';
      html += `              ${renderImageryModeGroupHtml(state.imageryMode)}`;
      html += '            </div>';
      html += '          </th>';
      html += '          <th class="merged-th-status">状态 / 旺衰</th>';
      html += '        </tr>';
      html += '      </thead>';
      html += '      <tbody>';
      ma.rows.forEach(r => {
        const isTianganRow = (r.tag === '天盘干');
        const isDoorRow = (r.tag === '八门' || r.tag === '门');
        const isDiganRow = (r.tag === '地盘干' || r.tag === '天干能量');

        if ((isTianganRow || isDiganRow) && !state.showKeyingDetails) {
          return;
        }

        let statusHtml = '';
        let descHtml = r.html || r.content;
        let trDataAttr = '';

        if (r.tag === '十干克应' && r.items && r.items.length > 1) {
          trDataAttr = ` data-shigan-items="${JSON.stringify(r.items).replace(/"/g, '&quot;')}"`;
          const btnGroupHtml = `
            <div class="shigan-btn-group">
              ${r.items.map((it, idx) => `
                <button type="button" class="shigan-switch-btn ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
                  ${it.name}
                </button>
              `).join('')}
            </div>
          `;
          descHtml = `${btnGroupHtml}<div class="shigan-desc-display">${r.items[0].content}</div>`;
          statusHtml = `<span class="merged-status-badge ${r.items[0].statusClass} shigan-live-status">${r.items[0].status}</span>`;
        } else {
          if (r.status) {
            if (!isDoorRow || state.showKeyingDetails) {
              statusHtml = `<span class="merged-status-badge ${r.statusClass}">${r.status}</span>`;
            }
          }
        }

        html += `        <tr${trDataAttr}>
          <td class="merged-cell-tag"><span class="merged-tag-badge ${r.tagClass}">${r.tag}</span></td>
          <td class="merged-cell-desc">${descHtml}</td>
          <td class="merged-cell-status">${statusHtml}</td>
        </tr>`;
      });
      html += '      </tbody>';
      html += '    </table>';
      html += '  </div>';

      if (ma.classicEvidence && ma.classicEvidence.length > 0) {
        html += '  <div class="merged-classic-block">';
        html += '    <div class="merged-classic-title">典籍印证：</div>';
        ma.classicEvidence.forEach(c => {
          html += `    <div class="merged-classic-item">${c}</div>`;
        });
        html += '  </div>';
      }
      html += '</div>';
    }

    sec.innerHTML = html;
    modalBody.appendChild(sec);
  });
}

// 全盘克应速查模态弹窗
function openKeyingModal() {
  if (!state.currentPan) {
    executePaipan();
  }
  if (!state.currentPan) return;
  renderKeyingModalContent();
  openModal('modalKeying');
}

// 9. 案例库与 localStorage 持久化 (全量复原排盘、局数、自定义干支、所问问题与断语笔记)
function initCasesStorage() {
  const selCases = document.getElementById('selCaseList');
  const btnLoad = document.getElementById('btnLoadSelectedCase');

  function showCaseDetail(item) {
    const panel = document.getElementById('caseDetailPanel');
    if (!panel) return;
    if (!item) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    const titleEl = document.getElementById('caseDetailTitle');
    const timeEl = document.getElementById('caseDetailTime');
    const qEl = document.getElementById('caseDetailQuestion');
    const remarkEl = document.getElementById('caseDetailRemark');
    const summaryEl = document.getElementById('caseDetailSummary');

    if (titleEl) titleEl.textContent = item.title || '无标题案例';
    if (timeEl) timeEl.textContent = item.dateStr || '';
    if (qEl) qEl.textContent = item.userQuestion || item.title || '（未记录具体问题）';
    if (remarkEl) {
      remarkEl.textContent = item.remark ? item.remark : '（暂无断语笔记）';
      remarkEl.style.fontStyle = item.remark ? 'normal' : 'italic';
      remarkEl.style.color = item.remark ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-outline)';
    }
    if (summaryEl) {
      const juStr = item.juDesc || (item.manualJu ? `${item.manualJu.dun}遁${['一','二','三','四','五','六','七','八','九'][item.manualJu.ju - 1]}局` : '');
      const pillarsStr = item.pillars ? `${item.pillars.year} ${item.pillars.month} ${item.pillars.day} ${item.pillars.hour}` : (item.customPillars ? `${item.customPillars.year} ${item.customPillars.month} ${item.customPillars.day} ${item.customPillars.hour}` : '');
      const dingjuName = item.dingjuMethod === 'zhirun' ? '置闰' : (item.dingjuMethod === 'chaibu' ? '拆补' : '茅山');
      const paipanName = item.paipanMethod === 'zhuan' ? '转盘' : '飞盘';
      summaryEl.textContent = [juStr, pillarsStr, `${dingjuName}/${paipanName}`].filter(Boolean).join(' ｜ ');
    }
  }

  function loadCases(selectedIdx = null) {
    selCases.innerHTML = '';
    const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
    const countEl = document.getElementById('txtCaseCount');
    if (countEl) countEl.textContent = `查找到${stored.length}个`;

    const emptyEl = document.getElementById('caseEmptyState');

    stored.forEach((item, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `[${item.dateStr}] ${item.title || '无标题格局'}`;
      selCases.appendChild(opt);
    });

    if (stored.length > 0) {
      if (emptyEl) emptyEl.style.display = 'none';
      if (selCases) selCases.style.display = 'block';
      const targetIdx = (selectedIdx !== null && selectedIdx >= 0 && selectedIdx < stored.length) ? selectedIdx : 0;
      selCases.value = targetIdx;
      showCaseDetail(stored[targetIdx]);
    } else {
      if (emptyEl) emptyEl.style.display = 'flex';
      if (selCases) selCases.style.display = 'none';
      showCaseDetail(null);
    }
  }

  function applyCase(item) {
    if (!item) return;

    // 1. 恢复核心时间与地理参数
    state.year = item.year;
    state.month = item.month;
    state.day = item.day;
    state.hour = item.hour;
    state.minute = item.minute;
    state.longitude = item.longitude || state.longitude;
    state.cityName = item.cityName || state.cityName;

    // 2. 恢复定局与排盘流派
    state.dingjuMethod = item.dingjuMethod || 'zhirun';
    state.paipanMethod = item.paipanMethod || 'zhuan';
    state.zishi = item.zishi || 'split';

    // 3. 恢复局数 (manualJu: 关键修复，确保阴九局等指定局不丢失)
    if (item.manualJu && item.manualJu.dun && item.manualJu.ju) {
      state.manualJu = { ...item.manualJu };
    } else {
      state.manualJu = null;
    }

    // 4. 恢复四柱干支 (customPillars: 关键修复，确保手动输入干支不丢失)
    if (item.customPillars) {
      state.customPillars = { ...item.customPillars };
    } else {
      state.customPillars = null;
    }

    // 5. 恢复所问问题与笔记 (支持同步到盘面中间显示及用神弹窗)
    state.userQuestion = item.userQuestion || item.title || '';
    localStorage.setItem('qimen_user_question', state.userQuestion);
    state.caseRemark = item.remark || '';

    // 6. 恢复选定用神
    if (Array.isArray(item.selectedYongShen) && item.selectedYongShen.length > 0) {
      state.selectedYongShen = [...item.selectedYongShen];
      localStorage.setItem('qimen_selected_yongshen', JSON.stringify(state.selectedYongShen));
    }

    // 7. 同步所有界面控件（分段按钮、下拉框、时间框、问题框）
    syncControlsUI();
    renderCalendar();
    executePaipan();
    showToast(`已成功读取并复原案例【${item.title}】的完整排盘、问题与笔记！`);
  }

  // 打开保存案例弹窗时，自动预填当前问题与笔记
  document.getElementById('btnSaveCase').addEventListener('click', () => {
    const iptTitle = document.getElementById('iptCaseTitle');
    const txtRemark = document.getElementById('txtCaseRemark');
    if (iptTitle) {
      iptTitle.value = state.userQuestion ? state.userQuestion.trim() : (state.currentPan ? `${state.currentPan.pillars.day}日${state.currentPan.pillars.hour}时 占事` : '');
    }
    if (txtRemark) {
      txtRemark.value = state.caseRemark || '';
    }
    openModal('modalSaveCase');
  });

  document.getElementById('btnConfirmSaveCase').addEventListener('click', () => {
    const title = document.getElementById('iptCaseTitle').value.trim() || '奇门格局案例';
    const remark = document.getElementById('txtCaseRemark').value.trim();
    state.caseRemark = remark;

    const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
    const curPan = state.currentPan;
    stored.unshift({
      title,
      remark, // 断语笔记
      userQuestion: state.userQuestion ? state.userQuestion.trim() : title, // 所问问题
      selectedYongShen: Array.isArray(state.selectedYongShen) ? [...state.selectedYongShen] : ['值符'],
      dateStr: `${state.year}-${state.month}-${state.day} ${state.hour}:${state.minute}`,
      year: state.year,
      month: state.month,
      day: state.day,
      hour: state.hour,
      minute: state.minute,
      longitude: state.longitude,
      cityName: state.cityName,
      dingjuMethod: state.dingjuMethod,
      paipanMethod: state.paipanMethod,
      zishi: state.zishi,
      manualJu: state.manualJu ? { ...state.manualJu } : null,
      customPillars: state.customPillars ? { ...state.customPillars } : null,
      pillars: (curPan && curPan.pillars) ? { ...curPan.pillars } : null,
      juDesc: (curPan && curPan.dingju) ? curPan.dingju.desc : ''
    });

    localStorage.setItem('qimen_saved_cases', JSON.stringify(stored));
    closeModal('modalSaveCase');
    loadCases(0);
    showToast('格局案例已成功保存至本地！');
  });

  // 单击/切换选中案例：展示问题与笔记详情
  selCases.addEventListener('change', () => {
    const idx = parseInt(selCases.value);
    const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
    if (stored[idx]) {
      showCaseDetail(stored[idx]);
    }
  });

  selCases.addEventListener('click', () => {
    const idx = parseInt(selCases.value);
    const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
    if (stored[idx]) {
      showCaseDetail(stored[idx]);
    }
  });

  // 双击列表项：直接起盘并复原
  selCases.addEventListener('dblclick', () => {
    const idx = parseInt(selCases.value);
    const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
    if (stored[idx]) {
      applyCase(stored[idx]);
    }
  });

  // 单击「读取并复原此盘」按钮：读取并复原
  if (btnLoad) {
    btnLoad.addEventListener('click', () => {
      const idx = parseInt(selCases.value);
      const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
      if (isNaN(idx) || !stored[idx]) {
        showToast('请先选择要读取的案例');
        return;
      }
      applyCase(stored[idx]);
    });
  }

  let editingCaseIndex = null;

  function openEditCaseModal(idx) {
    const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
    if (isNaN(idx) || !stored[idx]) {
      showToast('请先选择要编辑的案例');
      return;
    }
    editingCaseIndex = idx;
    const item = stored[idx];

    const metaEl = document.getElementById('editCaseMetaSummary');
    const iptTitle = document.getElementById('iptEditCaseTitle');
    const iptQ = document.getElementById('iptEditCaseQuestion');
    const txtRemark = document.getElementById('txtEditCaseRemark');
    const chkUpdate = document.getElementById('chkEditUpdatePan');

    if (metaEl) {
      const juStr = item.juDesc || (item.manualJu ? `${item.manualJu.dun}遁${['一','二','三','四','五','六','七','八','九'][item.manualJu.ju - 1]}局` : '');
      const pillarsStr = item.pillars ? `${item.pillars.year} ${item.pillars.month} ${item.pillars.day} ${item.pillars.hour}` : (item.customPillars ? `${item.customPillars.year} ${item.customPillars.month} ${item.customPillars.day} ${item.customPillars.hour}` : '');
      const dingjuName = item.dingjuMethod === 'zhirun' ? '置闰' : (item.dingjuMethod === 'chaibu' ? '拆补' : '茅山');
      const paipanName = item.paipanMethod === 'zhuan' ? '转盘' : '飞盘';
      metaEl.textContent = `原盘信息：${item.dateStr} ｜ ${[juStr, pillarsStr, `${dingjuName}/${paipanName}`].filter(Boolean).join(' ｜ ')}`;
    }

    if (iptTitle) iptTitle.value = item.title || '';
    if (iptQ) iptQ.value = item.userQuestion || item.title || '';
    if (txtRemark) txtRemark.value = item.remark || '';
    if (chkUpdate) chkUpdate.checked = false;

    openModal('modalEditCase');
  }

  // 点击「编辑」按钮
  const btnEdit = document.getElementById('btnEditCase');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      const idx = parseInt(selCases.value);
      openEditCaseModal(idx);
    });
  }

  // 详情面板中的「编辑此案例」按钮
  const btnDetailEdit = document.getElementById('btnDetailEditCase');
  if (btnDetailEdit) {
    btnDetailEdit.addEventListener('click', () => {
      const idx = parseInt(selCases.value);
      openEditCaseModal(idx);
    });
  }

  // 确认修改案例
  const btnConfirmEdit = document.getElementById('btnConfirmEditCase');
  if (btnConfirmEdit) {
    btnConfirmEdit.addEventListener('click', () => {
      if (editingCaseIndex === null) return;
      const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
      if (!stored[editingCaseIndex]) return;

      const item = stored[editingCaseIndex];
      const iptTitle = document.getElementById('iptEditCaseTitle');
      const iptQ = document.getElementById('iptEditCaseQuestion');
      const txtRemark = document.getElementById('txtEditCaseRemark');
      const chkUpdate = document.getElementById('chkEditUpdatePan');

      item.title = (iptTitle && iptTitle.value.trim()) || item.title || '奇门格局案例';
      item.userQuestion = (iptQ && iptQ.value.trim()) || item.title;
      item.remark = (txtRemark && txtRemark.value.trim()) || '';

      if (chkUpdate && chkUpdate.checked) {
        const curPan = state.currentPan;
        item.dateStr = `${state.year}-${state.month}-${state.day} ${state.hour}:${state.minute}`;
        item.year = state.year;
        item.month = state.month;
        item.day = state.day;
        item.hour = state.hour;
        item.minute = state.minute;
        item.longitude = state.longitude;
        item.cityName = state.cityName;
        item.dingjuMethod = state.dingjuMethod;
        item.paipanMethod = state.paipanMethod;
        item.zishi = state.zishi;
        item.manualJu = state.manualJu ? { ...state.manualJu } : null;
        item.customPillars = state.customPillars ? { ...state.customPillars } : null;
        item.pillars = (curPan && curPan.pillars) ? { ...curPan.pillars } : null;
        item.juDesc = (curPan && curPan.dingju) ? curPan.dingju.desc : '';
        item.selectedYongShen = Array.isArray(state.selectedYongShen) ? [...state.selectedYongShen] : ['值符'];
      }

      localStorage.setItem('qimen_saved_cases', JSON.stringify(stored));
      closeModal('modalEditCase');
      loadCases(editingCaseIndex);
      showToast(`案例【${item.title}】已成功更新！`);
    });
  }

  document.getElementById('btnDeleteCase').addEventListener('click', () => {
    const idx = parseInt(selCases.value);
    if (isNaN(idx)) {
      showToast('请先选择要删除的案例');
      return;
    }
    const stored = JSON.parse(localStorage.getItem('qimen_saved_cases') || '[]');
    stored.splice(idx, 1);
    localStorage.setItem('qimen_saved_cases', JSON.stringify(stored));
    loadCases(idx > 0 ? idx - 1 : 0);
    showToast('案例已删除');
  });

  loadCases();
}

// 10. 实时时钟走时
function initLiveClock() {
  const clockEl = document.getElementById('txtLiveClock');
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  setInterval(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const w = weekDays[now.getDay()];
    clockEl.textContent = `当前时间: ${y}年 ${m}月 ${d}日 ${h}时 ${mi}分 ${s}秒 星期${w}`;
  }, 1000);
}

// 通用弹窗与Toast函数
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toastMsg');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

// ==================== 11. 查找格局高级检索系统 ====================
const searchState = {
  conditions: {},
  currentGong: 1,
  currentCategory: 'tianSpirit',
  dingjuMethod: 'zhirun'
};

const SEARCH_CANDIDATES = {
  tianSpirit: ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'],
  star: ['天蓬', '天芮', '天冲', '天辅', '天禽', '天心', '天柱', '天任', '天英'],
  tianGan: ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'],
  door: ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'],
  diGan: ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'],
  diSpirit: ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天']
};

const SEARCH_GONG_NAMES = {
  1: '坎一宫', 2: '坤二宫', 3: '震三宫', 4: '巽四宫', 5: '中五宫',
  6: '乾六宫', 7: '兑七宫', 8: '艮八宫', 9: '离九宫'
};

function formatDateTimeLocal(d) {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const H = String(d.getHours()).padStart(2, '0');
  const Min = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D}T${H}:${Min}`;
}

function setQuickDateRange(rangeType) {
  const now = new Date(state.year, state.month - 1, state.day, state.hour, state.minute);
  let start = new Date(now);
  let end = new Date(now);

  if (rangeType === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (rangeType === '3days') {
    end.setDate(end.getDate() + 3);
  } else if (rangeType === '7days') {
    end.setDate(end.getDate() + 7);
  } else if (rangeType === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const iptStart = document.getElementById('iptSearchStart');
  const iptEnd = document.getElementById('iptSearchEnd');
  if (iptStart) iptStart.value = formatDateTimeLocal(start);
  if (iptEnd) iptEnd.value = formatDateTimeLocal(end);

  document.querySelectorAll('.search-quick-ranges .m3-chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === rangeType);
  });
}

function updateSearchPromptPreview() {
  const txtPrompt = document.getElementById('txtSearchPrompt');
  if (!txtPrompt) return;

  const activeGongs = [];
  for (let g = 1; g <= 9; g++) {
    const c = searchState.conditions[g];
    if (c && Object.values(c).some(v => v !== undefined && v !== null && v !== '')) {
      activeGongs.push(g);
    }
  }

  const gongsToShow = activeGongs.length > 0 ? activeGongs : [searchState.currentGong];

  const blocks = gongsToShow.map(g => {
    const c = searchState.conditions[g] || {};
    const gongName = SEARCH_GONG_NAMES[g];
    return `${gongName}={\n　　天八神 = ${c.tianSpirit || ''}\n　　九星 = ${c.star || ''}\n　　天盘干 = ${c.tianGan || ''}\n　　八门 = ${c.door || ''}\n　　地盘干 = ${c.diGan || ''}\n　　地八神 = ${c.diSpirit || ''}\n　}`;
  });

  txtPrompt.value = blocks.join('\n');
}

function renderCandidateChips() {
  const box = document.getElementById('boxSearchCandidates');
  if (!box) return;
  box.innerHTML = '';

  const list = SEARCH_CANDIDATES[searchState.currentCategory] || [];
  const currentVal = (searchState.conditions[searchState.currentGong] || {})[searchState.currentCategory];

  list.forEach(val => {
    const chip = document.createElement('div');
    chip.className = 'candidate-chip';
    if (currentVal === val) chip.classList.add('active');
    chip.textContent = val;
    chip.addEventListener('click', () => {
      if (!searchState.conditions[searchState.currentGong]) {
        searchState.conditions[searchState.currentGong] = {};
      }
      if (searchState.conditions[searchState.currentGong][searchState.currentCategory] === val) {
        delete searchState.conditions[searchState.currentGong][searchState.currentCategory];
      } else {
        searchState.conditions[searchState.currentGong][searchState.currentCategory] = val;
      }
      renderCandidateChips();
      updateSearchPromptPreview();
    });
    box.appendChild(chip);
  });
}

function openPatternSearchModal() {
  setQuickDateRange('3days');
  renderCandidateChips();
  updateSearchPromptPreview();
  openModal('modalFindPattern');
}

function executeSearch() {
  const iptStart = document.getElementById('iptSearchStart');
  const iptEnd = document.getElementById('iptSearchEnd');
  const txtStatus = document.getElementById('txtSearchStatus');
  const boxResults = document.getElementById('boxSearchResults');
  const listResults = document.getElementById('listSearchResults');
  const btnExecute = document.getElementById('btnSearchExecute');

  if (!iptStart || !iptEnd || !iptStart.value || !iptEnd.value) {
    showToast('请选择开始时间和结束时间');
    return;
  }

  const startDate = new Date(iptStart.value);
  const endDate = new Date(iptEnd.value);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    showToast('时间格式无效，请重新选择');
    return;
  }

  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  if (startYear < 1900 || startYear > 2100 || endYear < 1900 || endYear > 2100) {
    showToast('本程序目前只能用于1900到2100年之间的格局查找,请重新选择');
    return;
  }

  if (endMs <= startMs) {
    showToast('结束时间必须比开始时间大');
    return;
  }

  const hasConditions = Object.values(searchState.conditions).some(c => 
    c && Object.values(c).some(v => v !== undefined && v !== null && v !== '')
  );

  if (!hasConditions) {
    showToast('请先选择查找条件或选择经典格局');
    return;
  }

  txtStatus.textContent = '正在查找.....';
  btnExecute.disabled = true;
  boxResults.style.display = 'block';
  listResults.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--md-sys-color-outline);">正在检索符合条件的奇门排盘...</div>';

  setTimeout(() => {
    try {
      const results = [];
      const stepMs = 2 * 3600 * 1000;
      let curMs = startMs;
      const dingjuMethod = searchState.dingjuMethod;

      while (curMs <= endMs) {
        const curDate = new Date(curMs);
        const pan = paipan({
          year: curDate.getFullYear(),
          month: curDate.getMonth() + 1,
          day: curDate.getDate(),
          hour: curDate.getHours(),
          minute: curDate.getMinutes(),
          longitude: state.longitude,
          dingjuMethod: dingjuMethod,
          paipanMethod: state.paipanMethod,
          zishi: state.zishi,
          cityName: state.cityName
        });

        if (matchPatternCondition(pan, searchState.conditions)) {
          results.push({
            date: curDate,
            pan: pan
          });
        }

        curMs += stepMs;
      }

      txtStatus.textContent = `查找结束   一共查找到 ${results.length} 个符合条件的起局时间`;
      btnExecute.disabled = false;

      if (results.length === 0) {
        listResults.innerHTML = '<div class="search-empty-msg">在所选时间范围内未找到符合条件的起局时刻</div>';
        return;
      }

      listResults.innerHTML = '';
      results.forEach(res => {
        const d = res.date;
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const H = String(d.getHours()).padStart(2, '0');
        const Min = String(d.getMinutes()).padStart(2, '0');
        const timeStr = `${Y}-${M}-${D} ${H}:${Min}`;

        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
          <span class="sr-time">${timeStr}</span>
          <span class="sr-info">【${res.pan.dingju.desc}】值符${res.pan.starFu} 值使${res.pan.doorShi} 旬首${res.pan.xun}</span>
        `;

        item.addEventListener('click', () => {
          state.year = d.getFullYear();
          state.month = d.getMonth() + 1;
          state.day = d.getDate();
          state.hour = d.getHours();
          state.minute = d.getMinutes();
          state.dingjuMethod = dingjuMethod;
          state.manualJu = null;
          
          const selManual = document.getElementById('selManualJu');
          if (selManual) selManual.value = 'auto';

          const segDingju = document.getElementById('segDingjuGroup');
          if (segDingju) {
            segDingju.querySelectorAll('.m3-segment-btn').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.value === dingjuMethod);
            });
          }

          syncDateTimeToPickers();
          renderCalendar();
          executePaipan();
          closeModal('modalFindPattern');
          showToast(`已加载格局时刻并起局：${timeStr}`);
        });

        listResults.appendChild(item);
      });
    } catch (err) {
      console.error('查找格局出错:', err);
      txtStatus.textContent = '查找过程中发生错误';
      btnExecute.disabled = false;
      listResults.innerHTML = `<div class="search-empty-msg" style="color: var(--md-sys-color-error);">查找失败: ${err.message}</div>`;
    }
  }, 30);
}

function initPatternSearch() {
  const selGong = document.getElementById('selSearchGong');
  if (selGong) {
    selGong.addEventListener('change', () => {
      searchState.currentGong = parseInt(selGong.value);
      renderCandidateChips();
      updateSearchPromptPreview();
    });
  }

  const selCategory = document.getElementById('selSearchCategory');
  if (selCategory) {
    selCategory.addEventListener('change', () => {
      searchState.currentCategory = selCategory.value;
      renderCandidateChips();
    });
  }

  const selPreset = document.getElementById('selSearchPreset');
  if (selPreset) {
    selPreset.addEventListener('change', () => {
      const presetKey = selPreset.value;
      if (!presetKey) return;
      const p = SEARCH_PRESETS[presetKey];
      if (!p) return;

      searchState.conditions = {};
      let targetGong = searchState.currentGong;
      if (p.gong) {
        targetGong = p.gong;
        searchState.currentGong = targetGong;
        if (selGong) selGong.value = targetGong.toString();
      }

      searchState.conditions[targetGong] = {};
      if (p.tianSpirit) searchState.conditions[targetGong].tianSpirit = p.tianSpirit;
      if (p.star) searchState.conditions[targetGong].star = p.star;
      if (p.tianGan) searchState.conditions[targetGong].tianGan = p.tianGan;
      if (p.door) searchState.conditions[targetGong].door = p.door;
      if (p.doors) searchState.conditions[targetGong].door = p.doors[0];
      if (p.qis) searchState.conditions[targetGong].tianGan = p.qis[0];
      if (p.diGan) searchState.conditions[targetGong].diGan = p.diGan;
      if (p.diSpirit) searchState.conditions[targetGong].diSpirit = p.diSpirit;

      renderCandidateChips();
      updateSearchPromptPreview();
    });
  }

  const btnClearField = document.getElementById('btnClearCurrentField');
  if (btnClearField) {
    btnClearField.addEventListener('click', () => {
      if (searchState.conditions[searchState.currentGong]) {
        delete searchState.conditions[searchState.currentGong][searchState.currentCategory];
      }
      renderCandidateChips();
      updateSearchPromptPreview();
    });
  }

  const btnReset = document.getElementById('btnSearchReset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      searchState.conditions = {};
      if (selPreset) selPreset.value = '';
      renderCandidateChips();
      updateSearchPromptPreview();
      const boxResults = document.getElementById('boxSearchResults');
      if (boxResults) boxResults.style.display = 'none';
      const txtStatus = document.getElementById('txtSearchStatus');
      if (txtStatus) txtStatus.textContent = '选择好条件后点开始查找';
    });
  }

  document.querySelectorAll('.search-quick-ranges .m3-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setQuickDateRange(btn.dataset.range);
    });
  });

  const segSearchDingju = document.getElementById('segSearchDingju');
  if (segSearchDingju) {
    segSearchDingju.querySelectorAll('.m3-segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        segSearchDingju.querySelectorAll('.m3-segment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        searchState.dingjuMethod = btn.dataset.value;
      });
    });
  }

  const btnExecute = document.getElementById('btnSearchExecute');
  if (btnExecute) {
    btnExecute.addEventListener('click', executeSearch);
  }
}

// ==================== 12. 选取用神与所问问题模块 ====================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HE_GAN_MAP = {
  '甲': '己', '己': '甲',
  '乙': '庚', '庚': '乙',
  '丙': '辛', '辛': '丙',
  '丁': '壬', '壬': '丁',
  '戊': '癸', '癸': '戊'
};

// 判定宫位是否匹配所选取的用神
function checkPalaceMatchYongShen(pan, g, yongShenList) {
  if (!pan || !yongShenList || yongShenList.length === 0) {
    return { matched: false, items: [], hasZhifu: false };
  }
  // 排宫法(转盘)中五宫寄坤二，无独立神门星，中宫文字不参与用神选取
  if (g === 5 && pan.paipanMethod === 'zhuan') {
    return { matched: false, items: [], hasZhifu: false };
  }

  const tg = pan.tianpanGan[g] || '';
  const tj = pan.tianpanJigan[g] || '';
  const door = pan.tianpanDoor[g] || '';
  const star = pan.tianpanStar[g] || '';
  const spirit = pan.tianpanSpirit[g] || '';
  const hasMa = !!(pan.palaceFlags[g] && pan.palaceFlags[g].hasMa);
  const isKong = !!(pan.palaceFlags[g] && pan.palaceFlags[g].isKong);
  const gongNames = [String(g), GONG_CN[g] || '', `${GONG_CN[g]}宫`];

  const dayGan = pan.dayGan;
  const shiGan = pan.shiGan;
  const yearGan = pan.pillars && pan.pillars.year ? pan.pillars.year[0] : '';
  const monthGan = pan.pillars && pan.pillars.month ? pan.pillars.month[0] : '';
  const heGan = HE_GAN_MAP[dayGan] || '';

  const matchedItems = [];

  for (const ys of yongShenList) {
    let hit = false;
    if (ys === '日干') {
      if (tg === dayGan || tj === dayGan) hit = true;
    } else if (ys === '时干') {
      if (tg === shiGan || tj === shiGan) hit = true;
    } else if (ys === '年干') {
      if (tg === yearGan || tj === yearGan) hit = true;
    } else if (ys === '月干') {
      if (tg === monthGan || tj === monthGan) hit = true;
    } else if (ys === '合干') {
      if (heGan && (tg === heGan || tj === heGan)) hit = true;
    } else if (['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'].includes(ys)) {
      if (tg === ys || tj === ys) hit = true;
    } else if (ys === '值符' || ys === '直符') {
      if (spirit === '值符') hit = true;
    } else if (['螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'].includes(ys)) {
      if (spirit === ys) hit = true;
    } else if (['天蓬', '天芮', '天冲', '天辅', '天禽', '天心', '天柱', '天任', '天英'].includes(ys) || ys.startsWith('天')) {
      if (star.includes(ys)) hit = true;
    } else if (['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'].includes(ys) || ys.endsWith('门')) {
      if (door === ys || door.includes(ys.replace('门', ''))) hit = true;
    } else if (ys === '马星') {
      if (hasMa) hit = true;
    } else if (ys === '空亡' || ys === '旬空') {
      if (isKong) hit = true;
    } else if (
      ys === `空亡•${GONG_CN[g]}宫` ||
      ys === `旬空•${GONG_CN[g]}宫` ||
      ys === `旬空亡•${GONG_CN[g]}宫` ||
      ys === `空亡•${GONG_CN[g]}` ||
      ys === `旬空•${GONG_CN[g]}` ||
      ys === `旬空亡•${GONG_CN[g]}`
    ) {
      if (isKong) hit = true;
    } else if (gongNames.includes(ys)) {
      hit = true;
    }

    if (hit) {
      matchedItems.push(ys);
    }
  }

  const hasZhifu = matchedItems.includes('值符') || matchedItems.includes('直符');

  return {
    matched: matchedItems.length > 0,
    items: matchedItems,
    hasZhifu: hasZhifu
  };
}

// 判定当前用神与所问事项是否代表 人 或 物
// 准则:
// 1. 代表人的用神空（看对宫）
// 2. 代表物品的用神空（看对宫）
// 3. 代表事情的空不看对面
function isYongShenPersonOrObject(selectedList, question, natureSetting) {
  if (natureSetting === 'person_object') return true;
  if (natureSetting === 'affair') return false;

  const q = (question || '').trim();
  const personKeywords = ['我', '自己', '自身', '他', '她', '谁', '人', '恋', '婚', '妻', '夫', '对象', '男', '女', '友', '朋', '父母', '长辈', '领导', '上司', '孩子', '子女', '胎', '产', '下属', '病', '医', '贼', '盗', '犯', '对手'];
  const objectKeywords = ['钱', '财', '物', '本金', '资金', '利润', '货', '车', '失物', '手机', '资产', '物品', '东西'];
  const pureAffairKeywords = ['开业', '合作', '签约', '出行', '走势', '变动'];

  const hasPersonWord = personKeywords.some(w => q.includes(w));
  const hasObjectWord = objectKeywords.some(w => q.includes(w));
  if (hasPersonWord || hasObjectWord) return true;

  const list = Array.isArray(selectedList) ? selectedList : [];
  if (list.length === 0) return true;

  const personObjectItems = [
    '日干', '时干', '年干', '月干', '合干', '值符', '直符',
    '乙', '庚', '丙', '戊', '辛', '癸',
    '天芮', '天蓬', '天心', '天辅', '玄武', '太阴'
  ];

  const pureAffairItems = [
    '开门', '休门', '伤门', '杜门', '景门', '死门', '惊门',
    '六合', '九天', '九地', '白虎', '螣蛇', '马星', '空亡'
  ];

  const hasPersonObj = list.some(item => personObjectItems.includes(item));
  const allArePureAffair = list.every(item => pureAffairItems.includes(item) || item.startsWith('空亡') || item.startsWith('旬空'));

  if (allArePureAffair && !hasPersonWord && !hasObjectWord) {
    return false;
  }

  return true;
}

// 更新九宫盘面中间显示的四柱干支或所问问题
function updateBoardCardCenter(pan) {
  const el = document.getElementById('boardCardCenter');
  if (!el) return;
  const p = pan || state.currentPan;
  if (state.showDipan) {
    const q = state.userQuestion ? state.userQuestion.trim() : '';
    const displayText = q ? q : '点击输入所问事项';
    el.innerHTML = `<span class="header-center-text" title="${q ? escapeHtml(q) : '点击设置所问事项'}">${escapeHtml(displayText)}</span>`;
    el.title = q ? `所问事项：${q} (点击编辑或选取用神)` : '点击输入所问事项与选取用神';
  } else {
    if (p && p.pillars) {
      const sizhuStr = `${p.pillars.year}  ${p.pillars.month}  ${p.pillars.day}  ${p.pillars.hour}`;
      el.innerHTML = `<span class="header-center-text" title="${sizhuStr}">${sizhuStr}</span>`;
      el.title = `四柱干支：${sizhuStr}（点击可选取用神与输入所问）`;
    } else {
      el.innerHTML = `<span class="header-center-text">四柱干支</span>`;
      el.title = '四柱干支';
    }
  }
}

// 初始化选取用神与所问事项弹窗交互
function initYongShenModal() {
  const btnSelectYongShen = document.getElementById('btnSelectYongShen');
  const boardCenter = document.getElementById('boardCardCenter');
  const iptQuestion = document.getElementById('iptUserQuestion');
  const btnClearQ = document.getElementById('btnClearUserQuestion');
  const btnClearAllYS = document.getElementById('btnClearAllYongShen');
  const btnResetYS = document.getElementById('btnResetYongShen');
  const btnConfirmYS = document.getElementById('btnConfirmYongShen');
  const tagsContainer = document.getElementById('yongshenSelectedContainer');

  function getSelectedYongShenFromUI() {
    const checked = Array.from(document.querySelectorAll('#modalYongShen .ys-chips-row input[type="checkbox"]:checked'));
    return checked.map(cb => cb.value);
  }

  function renderSelectedTags(selectedList) {
    if (!tagsContainer) return;
    if (!selectedList || selectedList.length === 0) {
      tagsContainer.innerHTML = '<span class="yongshen-empty-hint" style="font-size: 12.5px; color: var(--md-sys-color-outline);">尚未选取用神（可点击上方快捷预设或下方各分类要素勾选）</span>';
      return;
    }
    tagsContainer.innerHTML = selectedList.map(item => {
      const isZhifu = item === '值符' || item === '直符';
      return `
        <span class="yongshen-tag-pill ${isZhifu ? 'tag-zhifu' : ''}" data-val="${escapeHtml(item)}">
          <span>${escapeHtml(item)}</span>
          <span class="remove-btn" title="移除此用神" data-remove="${escapeHtml(item)}">✕</span>
        </span>
      `;
    }).join('');

    tagsContainer.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const val = btn.dataset.remove;
        const cb = document.querySelector(`#modalYongShen .ys-chips-row input[type="checkbox"][value="${val}"]`);
        if (cb) {
          cb.checked = false;
          const chip = cb.closest('.ys-chip');
          if (chip) chip.classList.remove('active');
        }
        renderSelectedTags(getSelectedYongShenFromUI());
      });
    });
  }

  function syncUIFromState() {
    if (iptQuestion) iptQuestion.value = state.userQuestion || '';
    const currentList = Array.isArray(state.selectedYongShen) ? state.selectedYongShen : [];
    document.querySelectorAll('#modalYongShen .ys-chips-row input[type="checkbox"]').forEach(cb => {
      const isChecked = currentList.includes(cb.value);
      cb.checked = isChecked;
      const chip = cb.closest('.ys-chip');
      if (chip) chip.classList.toggle('active', isChecked);
    });
    renderSelectedTags(currentList);
    const curNature = state.yongshenNature || 'auto';
    const curRad = document.querySelector(`#modalYongShen input[name="radKongOpposite"][value="${curNature}"]`);
    if (curRad) curRad.checked = true;
  }

  function openYSModal() {
    syncUIFromState();
    openModal('modalYongShen');
  }

  if (btnSelectYongShen) {
    btnSelectYongShen.addEventListener('click', openYSModal);
  }
  if (boardCenter) {
    boardCenter.addEventListener('click', openYSModal);
  }

  // 快捷问题预设按钮: 不改变上方文字，支持叠加勾选
  document.querySelectorAll('.yongshen-qchip').forEach(qBtn => {
    qBtn.addEventListener('click', () => {
      // 保留上方输入框原有文字，不作替换覆盖
      if (qBtn.dataset.ys) {
        const ysArr = qBtn.dataset.ys.split(',').map(s => s.trim());
        ysArr.forEach(ys => {
          const cb = document.querySelector(`#modalYongShen .ys-chips-row input[type="checkbox"][value="${ys}"]`);
          if (cb) {
            cb.checked = true;
            const chip = cb.closest('.ys-chip');
            if (chip) chip.classList.add('active');
          }
        });
        renderSelectedTags(getSelectedYongShenFromUI());

        // 智能联动判定人/物属性
        const qText = qBtn.dataset.q || '';
        const pKeywords = ['自身', '恋爱', '婚姻', '夫妻', '领导', '贵人', '疾病', '防贼', '求财', '资金', '利润', '子女', '下属', '失物'];
        if (pKeywords.some(k => qText.includes(k))) {
          const radP = document.querySelector('#modalYongShen input[name="radKongOpposite"][value="person_object"]');
          if (radP) radP.checked = true;
        }
      }
    });
  });

  // Checkbox 选择联动
  document.querySelectorAll('#modalYongShen .ys-chips-row input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const chip = cb.closest('.ys-chip');
      if (chip) chip.classList.toggle('active', cb.checked);
      renderSelectedTags(getSelectedYongShenFromUI());
    });
  });

  // 清空问题
  if (btnClearQ) {
    btnClearQ.addEventListener('click', () => {
      if (iptQuestion) iptQuestion.value = '';
    });
  }

  // 清空用神选择（排除值符，不对值符生效，除非用户手动取消）
  function clearAllSelections(keepZhifu = true) {
    document.querySelectorAll('#modalYongShen .ys-chips-row input[type="checkbox"]').forEach(cb => {
      if (keepZhifu && (cb.value === '值符' || cb.value === '直符')) {
        cb.checked = true;
        const chip = cb.closest('.ys-chip');
        if (chip) chip.classList.add('active');
      } else {
        cb.checked = false;
        const chip = cb.closest('.ys-chip');
        if (chip) chip.classList.remove('active');
      }
    });
    renderSelectedTags(getSelectedYongShenFromUI());
  }

  if (btnClearAllYS) btnClearAllYS.addEventListener('click', () => clearAllSelections(true));
  if (btnResetYS) btnResetYS.addEventListener('click', () => {
    clearAllSelections(true);
    if (iptQuestion) iptQuestion.value = '';
  });

  // 确认并应用用神
  if (btnConfirmYS) {
    btnConfirmYS.addEventListener('click', () => {
      state.userQuestion = iptQuestion ? iptQuestion.value.trim() : '';
      state.selectedYongShen = getSelectedYongShenFromUI();
      const checkedRad = document.querySelector('#modalYongShen input[name="radKongOpposite"]:checked');
      if (checkedRad) {
        state.yongshenNature = checkedRad.value;
      }
      try {
        localStorage.setItem('qimen_user_question', state.userQuestion);
        localStorage.setItem('qimen_selected_yongshen', JSON.stringify(state.selectedYongShen));
        localStorage.setItem('qimen_zhifu_manually_cleared', state.selectedYongShen.includes('值符') ? '0' : '1');
        localStorage.setItem('qimen_yongshen_nature', state.yongshenNature);
      } catch (e) {
        console.warn('localStorage error', e);
      }
      closeModal('modalYongShen');
      updateBoardCardCenter(state.currentPan);
      if (state.currentPan) {
        state.currentPan.selectedYongShen = state.selectedYongShen;
        state.currentPan.userQuestion = state.userQuestion;
        state.currentPan.yongshenNature = state.yongshenNature;
        renderNinePalaces(state.currentPan);
        renderKeyingAnalysis(state.currentPan, state.selectedGong);
      }
      if (state.selectedYongShen.length > 0) {
        showToast(`已应用用神：【${state.selectedYongShen.join('、')}】，已在天盘虚框标注（值符黄色，其他红色）`);
      } else {
        showToast('已更新所问事项，未选用神');
      }
    });
  }

  // 盘面手动选按钮交互
  const btnStartManualGridPick = document.getElementById('btnStartManualGridPick');
  if (btnStartManualGridPick) {
    btnStartManualGridPick.addEventListener('click', () => {
      state.userQuestion = iptQuestion ? iptQuestion.value.trim() : '';
      state.selectedYongShen = getSelectedYongShenFromUI();
      const checkedRad = document.querySelector('#modalYongShen input[name="radKongOpposite"]:checked');
      if (checkedRad) {
        state.yongshenNature = checkedRad.value;
      }
      try {
        localStorage.setItem('qimen_user_question', state.userQuestion);
        localStorage.setItem('qimen_selected_yongshen', JSON.stringify(state.selectedYongShen));
        localStorage.setItem('qimen_zhifu_manually_cleared', state.selectedYongShen.includes('值符') ? '0' : '1');
        localStorage.setItem('qimen_yongshen_nature', state.yongshenNature);
      } catch (e) {
        console.warn('localStorage error', e);
      }
      closeModal('modalYongShen');
      enterGridPickingMode();
    });
  }

  // 初始化浮动圈选操作条与要素选择弹窗事件
  initGridPickingBar(openYSModal);
}

// ========================================================
// 盘面手动圈选用神模式交互控制器 (Manual Grid Picking Mode)
// ========================================================

let currentPickerGong = null;

// 从点击的目标元素提取所圈选的用神符号
function extractSymbolFromTarget(target, gong) {
  if (!target || !state.currentPan) return null;
  const pan = state.currentPan;

  // 1. 天禽星专属 (嵌套在天芮星内)
  if (target.closest('.star-qin')) {
    return '天禽';
  }

  // 2. 九星
  const starEl = target.closest('.star-name');
  if (starEl) {
    const rawStar = pan.tianpanStar[gong] || '';
    if (rawStar.includes('天芮')) {
      return '天芮';
    }
    const starList = ['天蓬', '天任', '天冲', '天辅', '天禽', '天心', '天柱', '天英', '天芮'];
    for (const s of starList) {
      if (rawStar.includes(s) || starEl.textContent.includes(s)) return s;
    }
    return rawStar || starEl.textContent.trim().slice(0, 2);
  }

  // 3. 八神
  const spiritEl = target.closest('.spirit-tag');
  if (spiritEl) {
    const spirit = pan.tianpanSpirit[gong] || spiritEl.textContent.trim();
    if (spirit === '滕蛇') return '螣蛇';
    return spirit;
  }

  // 4. 八门
  const doorEl = target.closest('.door-name');
  if (doorEl) {
    const rawDoor = pan.tianpanDoor[gong] || doorEl.textContent.trim();
    const doorList = ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'];
    for (const d of doorList) {
      if (rawDoor.includes(d) || rawDoor.includes(d.replace('门', ''))) return d;
    }
    return rawDoor;
  }

  // 5. 天盘干与天盘寄干
  const tgEl = target.closest('.tian-gan');
  if (tgEl) {
    const tg = pan.tianpanGan[gong] || tgEl.textContent.trim();
    return tg;
  }
  const tjEl = target.closest('.tian-jigan-stem');
  if (tjEl) {
    const tj = pan.tianpanJigan[gong] || tjEl.textContent.trim();
    return tj;
  }

  // 6. 地盘干与地盘寄干
  const dgEl = target.closest('.di-gan');
  if (dgEl) {
    const dg = pan.dipan[gong] || dgEl.textContent.trim();
    return dg;
  }
  const djEl = target.closest('.di-jigan-stem');
  if (djEl) {
    return (gong === 2 && pan.dipan[5]) ? pan.dipan[5] : djEl.textContent.trim();
  }

  // 7. 空亡与马星
  if (target.closest('.badge-kong')) {
    const gongName = GONG_CN[gong] ? `${GONG_CN[gong]}宫` : `${gong}宫`;
    return `空亡•${gongName}`;
  }
  if (target.closest('.badge-ma')) {
    return '马星';
  }

  return null;
}

// 盘面圈选点击事件分发
function handleGridPickClick(e, gong) {
  // 排宫法(转盘)中五宫寄坤二，无独立神门星，中宫文字不参与用神选取
  if (gong === 5 && state.currentPan && state.currentPan.paipanMethod === 'zhuan') {
    return;
  }
  const symbol = extractSymbolFromTarget(e.target, gong);
  if (symbol) {
    toggleYongShenSymbol(symbol);
  } else {
    // 点击空白处打开本宫要素快捷选择弹窗
    openPalaceElementPicker(gong);
  }
}

// 切换某个用神符号的选中状态
function toggleYongShenSymbol(val) {
  if (!val) return;
  if (!Array.isArray(state.selectedYongShen)) {
    state.selectedYongShen = [];
  }

  // 若点击的是分宫空亡 (如 空亡•艮宫)，清理列表中的通用 '空亡'/'旬空'，避免两宫继续同时全选
  if (val.startsWith('空亡•') || val.startsWith('旬空•') || val.startsWith('旬空亡•')) {
    const gKongIdx = state.selectedYongShen.indexOf('空亡');
    if (gKongIdx >= 0) state.selectedYongShen.splice(gKongIdx, 1);
    const gXunIdx = state.selectedYongShen.indexOf('旬空');
    if (gXunIdx >= 0) state.selectedYongShen.splice(gXunIdx, 1);
  }

  const idx = state.selectedYongShen.indexOf(val);
  let isAdd = false;
  if (idx >= 0) {
    state.selectedYongShen.splice(idx, 1);
    isAdd = false;
  } else {
    state.selectedYongShen.push(val);
    isAdd = true;
  }

  // 保存并即时全盘刷新
  try {
    localStorage.setItem('qimen_selected_yongshen', JSON.stringify(state.selectedYongShen));
    localStorage.setItem('qimen_zhifu_manually_cleared', state.selectedYongShen.includes('值符') ? '0' : '1');
  } catch (err) {
    console.warn('localStorage error', err);
  }

  if (state.currentPan) {
    state.currentPan.selectedYongShen = state.selectedYongShen;
    renderNinePalaces(state.currentPan);
    renderKeyingAnalysis(state.currentPan, state.selectedGong);
  }

  updateBoardCardCenter(state.currentPan);
  updateGridPickBarUI();

  // 若弹窗打开着，同步更新弹窗 chips
  if (currentPickerGong) {
    renderPalacePickerBody(currentPickerGong);
  }

  showToast(isAdd ? `已圈选用神：【${val}】` : `已取消用神：【${val}】`);
}

// 更新浮动操作条 UI
function updateGridPickBarUI() {
  const bar = document.getElementById('gridPickBar');
  const tagsRow = document.getElementById('gridPickTagsRow');
  if (!bar || !tagsRow) return;

  const list = Array.isArray(state.selectedYongShen) ? state.selectedYongShen : [];
  if (list.length === 0) {
    tagsRow.innerHTML = '<span class="grid-pick-empty-hint">尚未圈选用神，请在上方九宫格中直接点击符号</span>';
    return;
  }

  tagsRow.innerHTML = list.map(item => {
    const isZhifu = (item === '值符' || item === '直符');
    return `
      <span class="grid-pick-chip ${isZhifu ? 'ys-chip-zhifu' : ''}">
        <span>${escapeHtml(item)}</span>
        <span class="pick-remove" data-remove="${escapeHtml(item)}" title="取消此用神">✕</span>
      </span>
    `;
  }).join('');

  tagsRow.querySelectorAll('.pick-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = btn.dataset.remove;
      if (val) toggleYongShenSymbol(val);
    });
  });
}

// 进入盘面圈选用神模式
function enterGridPickingMode() {
  state.isGridPickingMode = true;
  const grid = document.getElementById('nineGrid');
  if (grid) grid.classList.add('grid-picking-mode');
  document.body.classList.add('grid-picking-active');

  const bar = document.getElementById('gridPickBar');
  if (bar) bar.style.display = 'block';

  updateGridPickBarUI();
  if (state.currentPan) renderNinePalaces(state.currentPan);

  const boardSection = document.getElementById('boardCardSection') || grid;
  if (boardSection) {
    boardSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showToast('已进入盘面圈选用神模式：直接点击九宫格内的八神、九星、八门、天干即可圈选');
}

// 退出盘面圈选用神模式
function exitGridPickingMode(save = true) {
  state.isGridPickingMode = false;
  const grid = document.getElementById('nineGrid');
  if (grid) grid.classList.remove('grid-picking-mode');
  document.body.classList.remove('grid-picking-active');

  const bar = document.getElementById('gridPickBar');
  if (bar) bar.style.display = 'none';

  closePalaceElementPicker();

  if (save) {
    try {
      localStorage.setItem('qimen_selected_yongshen', JSON.stringify(state.selectedYongShen));
      localStorage.setItem('qimen_zhifu_manually_cleared', state.selectedYongShen.includes('值符') ? '0' : '1');
    } catch (e) {}
    if (state.currentPan) {
      state.currentPan.selectedYongShen = state.selectedYongShen;
      renderNinePalaces(state.currentPan);
      renderKeyingAnalysis(state.currentPan, state.selectedGong);
    }
    updateBoardCardCenter(state.currentPan);
    if (state.selectedYongShen.length > 0) {
      showToast(`已完成用神圈选：【${state.selectedYongShen.join('、')}】`);
    } else {
      showToast('已退出圈选模式，未圈选用神');
    }
  } else {
    if (state.currentPan) renderNinePalaces(state.currentPan);
  }
}

// 渲染宫位要素快捷选择弹窗内容 (双栏卡片式精致排版)
function renderPalacePickerBody(gong) {
  if (!gong || !state.currentPan) return;
  const body = document.getElementById('palacePickerBody');
  const summaryEl = document.getElementById('palacePickerSummary');
  if (!body) return;
  const pan = state.currentPan;
  const list = Array.isArray(state.selectedYongShen) ? state.selectedYongShen : [];

  const spirit = pan.tianpanSpirit[gong] || '';
  const star = pan.tianpanStar[gong] || '';
  const door = pan.tianpanDoor[gong] || '';
  const tg = pan.tianpanGan[gong] || '';
  const tj = pan.tianpanJigan[gong] || '';
  const dg = pan.dipan[gong] || '';
  const dj = (gong === 2 && pan.dipan[5]) ? pan.dipan[5] : '';
  const hasMa = !!(pan.palaceFlags[gong] && pan.palaceFlags[gong].hasMa);
  const isKong = !!(pan.palaceFlags[gong] && pan.palaceFlags[gong].isKong);
  const gongName = `${GONG_CN[gong]}宫`;

  function renderChip(val, note = '', isZhifuDefault = false) {
    const active = list.includes(val) || (
      val.startsWith('空亡•') && (
        list.includes('空亡') ||
        list.includes('旬空') ||
        list.includes(val.replace('空亡•', '旬空•')) ||
        list.includes(val.replace('空亡•', '旬空亡•'))
      )
    );
    const isZhifu = isZhifuDefault || val === '值符' || val === '直符';
    return `
      <button type="button" class="palace-picker-chip ${active ? 'active' : ''} ${isZhifu ? 'is-zhifu' : ''}" data-val="${escapeHtml(val)}">
        <span>${escapeHtml(val)}${note ? ` <small class="chip-note">(${escapeHtml(note)})</small>` : ''}</span>
        ${active ? '<span class="chip-check">✓</span>' : ''}
      </button>
    `;
  }

  // 1. 左栏: 神机 · 星门
  let leftRowsHtml = '';
  if (gong === 5) {
    leftRowsHtml = `
      <div class="palace-picker-row">
        <span class="palace-picker-row-label">核心</span>
        <div class="palace-picker-row-chips">
          ${renderChip(pan.dipan[5] || '戊')}
        </div>
      </div>
      <div class="palace-picker-row">
        <span class="palace-picker-row-label">局态</span>
        <div style="font-size: 12px; color: var(--md-sys-color-outline); padding: 4px 0;">转盘中五无神门星，寄坤二宫</div>
      </div>
    `;
  } else {
    // 八神
    if (spirit) {
      leftRowsHtml += `
        <div class="palace-picker-row">
          <span class="palace-picker-row-label">八神</span>
          <div class="palace-picker-row-chips">
            ${renderChip(spirit, '', spirit === '值符')}
          </div>
        </div>
      `;
    }

    // 九星
    if (star) {
      let starChips = '';
      if (star.includes('天芮')) {
        starChips = renderChip('天芮') + renderChip('天禽');
      } else {
        starChips = renderChip(star);
      }
      leftRowsHtml += `
        <div class="palace-picker-row">
          <span class="palace-picker-row-label">九星</span>
          <div class="palace-picker-row-chips">
            ${starChips}
          </div>
        </div>
      `;
    }

    // 八门
    if (door) {
      leftRowsHtml += `
        <div class="palace-picker-row">
          <span class="palace-picker-row-label">八门</span>
          <div class="palace-picker-row-chips">
            ${renderChip(door)}
          </div>
        </div>
      `;
    }
  }

  // 2. 右栏: 奇仪 · 标志 · 宫位
  let rightRowsHtml = '';

  // 天盘干
  if (tg || tj) {
    let tgChips = '';
    if (tg) {
      let note = '';
      if (tg === pan.dayGan) note = '日干';
      else if (tg === pan.shiGan) note = '时干';
      tgChips += renderChip(tg, note);
    }
    if (tj) {
      let note = '天寄';
      if (tj === pan.dayGan) note = '日寄';
      else if (tj === pan.shiGan) note = '时寄';
      tgChips += renderChip(tj, note);
    }
    rightRowsHtml += `
      <div class="palace-picker-row">
        <span class="palace-picker-row-label">天盘</span>
        <div class="palace-picker-row-chips">
          ${tgChips}
        </div>
      </div>
    `;
  }

  // 地盘干
  if (dg || dj) {
    let dgChips = '';
    if (dg) dgChips += renderChip(dg);
    if (dj) dgChips += renderChip(dj, '地寄');
    rightRowsHtml += `
      <div class="palace-picker-row">
        <span class="palace-picker-row-label">地盘</span>
        <div class="palace-picker-row-chips">
          ${dgChips}
        </div>
      </div>
    `;
  }

  // 标志 (空亡 / 马星)
  if (isKong || hasMa) {
    let flagChips = '';
    if (isKong) flagChips += renderChip(`空亡•${gongName}`);
    if (hasMa) flagChips += renderChip('马星');
    rightRowsHtml += `
      <div class="palace-picker-row">
        <span class="palace-picker-row-label">标志</span>
        <div class="palace-picker-row-chips">
          ${flagChips}
        </div>
      </div>
    `;
  }

  // 宫位
  rightRowsHtml += `
    <div class="palace-picker-row">
      <span class="palace-picker-row-label">宫位</span>
      <div class="palace-picker-row-chips">
        ${renderChip(gongName)}
      </div>
    </div>
  `;

  body.innerHTML = `
    <div class="palace-picker-grid">
      <div class="palace-picker-card">
        <div class="palace-picker-card-header">
          <span class="palace-picker-section-title">神机 · 星门</span>
        </div>
        <div class="palace-picker-card-content">
          ${leftRowsHtml}
        </div>
      </div>

      <div class="palace-picker-card">
        <div class="palace-picker-card-header">
          <span class="palace-picker-section-title">奇仪 · 标志 · 宫位</span>
        </div>
        <div class="palace-picker-card-content">
          ${rightRowsHtml}
        </div>
      </div>
    </div>
  `;

  // 更新底部已选摘要
  if (summaryEl) {
    const palaceAllVals = [spirit, star, '天芮', '天禽', door, tg, tj, dg, dj, gongName, isKong ? '空亡' : null, hasMa ? '马星' : null].filter(Boolean);
    const matchedInPalace = list.filter(ys => palaceAllVals.includes(ys));
    if (matchedInPalace.length > 0) {
      summaryEl.innerHTML = `本宫已选：<b style="color: var(--md-sys-color-primary);">${escapeHtml(matchedInPalace.join('、'))}</b>`;
    } else {
      summaryEl.textContent = '本宫尚未圈选用神（点击上方要素即可选中）';
    }
  }

  // 绑定 chip 点击事件
  body.querySelectorAll('.palace-picker-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      if (val) toggleYongShenSymbol(val);
    });
  });
}

function openPalaceElementPicker(gong) {
  if (gong === 5 && state.currentPan && state.currentPan.paipanMethod === 'zhuan') {
    return;
  }
  currentPickerGong = gong;
  const title = document.getElementById('palacePickerTitle');
  if (title) title.textContent = `【${GONG_CN[gong]}宫 (${gong}宫)】要素点选`;
  renderPalacePickerBody(gong);
  openModal('modalPalacePickElements');
}

function closePalaceElementPicker() {
  closeModal('modalPalacePickElements');
  currentPickerGong = null;
}

// 初始化浮动圈选操作条与要素选择弹窗事件
function initGridPickingBar(openYSModalFn) {
  const btnFinish = document.getElementById('btnFinishGridPick');
  const btnReset = document.getElementById('btnResetGridPick');
  const btnBack = document.getElementById('btnBackToModalYS');
  const btnClose = document.getElementById('btnCloseGridPick');

  if (btnFinish) {
    btnFinish.addEventListener('click', () => exitGridPickingMode(true));
  }
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      state.selectedYongShen = [];
      try {
        localStorage.setItem('qimen_selected_yongshen', JSON.stringify([]));
        localStorage.setItem('qimen_zhifu_manually_cleared', '1');
      } catch (e) {}
      if (state.currentPan) {
        state.currentPan.selectedYongShen = [];
        renderNinePalaces(state.currentPan);
        renderKeyingAnalysis(state.currentPan, state.selectedGong);
      }
      updateBoardCardCenter(state.currentPan);
      updateGridPickBarUI();
      if (currentPickerGong) renderPalacePickerBody(currentPickerGong);
      showToast('已清空所有已选用神');
    });
  }
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      exitGridPickingMode(false);
      if (typeof openYSModalFn === 'function') {
        openYSModalFn();
      }
    });
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => exitGridPickingMode(true));
  }

  const btnConfirmPP = document.getElementById('btnConfirmPalacePicker');
  const btnClosePP = document.getElementById('btnClosePalacePicker');
  if (btnConfirmPP) btnConfirmPP.addEventListener('click', closePalaceElementPicker);
  if (btnClosePP) btnClosePP.addEventListener('click', closePalaceElementPicker);

  const modalPP = document.getElementById('modalPalacePickElements');
  if (modalPP) {
    modalPP.addEventListener('click', (e) => {
      if (e.target === modalPP) closePalaceElementPicker();
    });
  }
}

// 初始化手动录入奇门盘面模块
function initManualInputModal() {
  const btnBottomManual = document.getElementById('btnBottomManual');
  const selDun = document.getElementById('selManualDun');
  const selJuNum = document.getElementById('selManualJuNum');
  const selPaipanMethod = document.getElementById('selManualPaipanMethod');
  const selDingjuMethod = document.getElementById('selManualDingjuMethod');
  const selGzYear = document.getElementById('selManualGzYear');
  const selGzMonth = document.getElementById('selManualGzMonth');
  const selGzDay = document.getElementById('selManualGzDay');
  const selGzHour = document.getElementById('selManualGzHour');
  const iptGzQuick = document.getElementById('iptManualGzQuick');
  const txtGzQuickStatus = document.getElementById('txtManualGzQuickStatus');
  const previewSummary = document.getElementById('manualPreviewSummary');
  const previewDetail = document.getElementById('manualPreviewDetail');
  const btnConfirm = document.getElementById('btnConfirmManualInput');
  const txtPaste = document.getElementById('txtManualPasteInput');
  const btnParse = document.getElementById('btnParseManualText');
  const txtParseStatus = document.getElementById('txtManualParseStatus');
  const segMode = document.getElementById('segManualMode');
  const panelGanzhi = document.getElementById('manualModeGanzhi');
  const panelText = document.getElementById('manualModeText');

  // 1. 填充 60 甲子下拉框
  [selGzYear, selGzMonth, selGzDay, selGzHour].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '';
    JIAZI.forEach(gz => {
      sel.add(new Option(gz, gz));
    });
  });

  // 2. Tab 切换
  if (segMode) {
    const btns = segMode.querySelectorAll('.m3-segment-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        if (panelGanzhi) panelGanzhi.style.display = mode === 'ganzhi' ? 'block' : 'none';
        if (panelText) panelText.style.display = mode === 'text' ? 'block' : 'none';
      });
    });
  }

  // 3. 实时更新预览
  function updateManualPreview() {
    if (!selDun || !selJuNum || !selGzYear || !selGzMonth || !selGzDay || !selGzHour) return;
    const dun = selDun.value;
    const juNum = selJuNum.value;
    const juNumCn = ['一', '二', '三', '四', '五', '六', '七', '八', '九'][parseInt(juNum) - 1] || juNum;
    const yGz = selGzYear.value;
    const mGz = selGzMonth.value;
    const dGz = selGzDay.value;
    const hGz = selGzHour.value;
    const djName = selDingjuMethod ? (selDingjuMethod.options[selDingjuMethod.selectedIndex]?.text || '') : '';

    const xun = xunOf(hGz);
    const shouYi = XUN_SHOU_YI[xun] || '戊';
    const dayKw = kongwangOf(dGz);
    const hourKw = kongwangOf(hGz);

    if (previewSummary) {
      previewSummary.textContent = `${dun}遁${juNumCn}局${djName ? ' · ' + djName : ''} · ${yGz}年 ${mGz}月 ${dGz}日 ${hGz}时`;
    }
    if (previewDetail) {
      previewDetail.textContent = `旬首：${xun}${shouYi} ｜ 日空：${dayKw} ｜ 时空：${hourKw} ｜ 核心：以${dGz[0]}为求测人，${hGz[0]}为事态`;
    }
  }

  [selDun, selJuNum, selPaipanMethod, selDingjuMethod, selGzYear, selGzMonth, selGzDay, selGzHour].forEach(el => {
    if (el) el.addEventListener('change', updateManualPreview);
  });

  // 4. 手动输入四柱干支或公历时间即时识别联动
  function handleManualGzQuickInput(val) {
    if (!val || !val.trim()) {
      if (txtGzQuickStatus) txtGzQuickStatus.textContent = '';
      return;
    }
    const res = parseGanzhiOrDateTimeInput(val);
    if (!res) {
      if (txtGzQuickStatus) {
        txtGzQuickStatus.textContent = '未检测到有效甲子干支或公历时间';
        txtGzQuickStatus.style.color = 'var(--md-sys-color-error)';
      }
      return;
    }

    if (res.dingjuMethod && selDingjuMethod) selDingjuMethod.value = res.dingjuMethod;
    if (res.paipanMethod && selPaipanMethod) selPaipanMethod.value = res.paipanMethod;
    if (res.dun && selDun) selDun.value = res.dun;
    if (res.ju && selJuNum) selJuNum.value = String(res.ju);

    if (res.type === 'datetime') {
      const dt = res.dt;
      try {
        const curDingjuMethod = selDingjuMethod ? selDingjuMethod.value : (state.dingjuMethod || 'zhirun');
        const curPaipanMethod = selPaipanMethod ? selPaipanMethod.value : (state.paipanMethod || 'zhuan');
        const calcPan = paipan({
          year: dt.year,
          month: dt.month,
          day: dt.day,
          hour: dt.hour,
          minute: dt.minute,
          dingjuMethod: curDingjuMethod,
          paipanMethod: curPaipanMethod,
          longitude: state.longitude || 116.38
        });

        if (calcPan && calcPan.pillars) {
          if (selGzYear) selGzYear.value = calcPan.pillars.year;
          if (selGzMonth) selGzMonth.value = calcPan.pillars.month;
          if (selGzDay) selGzDay.value = calcPan.pillars.day;
          if (selGzHour) selGzHour.value = calcPan.pillars.hour;

          if (!res.dun && selDun && calcPan.dun) selDun.value = calcPan.dun;
          if (!res.ju && selJuNum && calcPan.ju) selJuNum.value = String(calcPan.ju);

          updateManualPreview();

          if (txtGzQuickStatus) {
            const minStr = String(dt.minute).padStart(2, '0');
            txtGzQuickStatus.textContent = `已识别时间 [${dt.year}-${dt.month}-${dt.day} ${dt.hour}:${minStr}] 转化为四柱：${calcPan.pillars.year} ${calcPan.pillars.month} ${calcPan.pillars.day} ${calcPan.pillars.hour}`;
            txtGzQuickStatus.style.color = 'var(--md-sys-color-primary)';
          }
          return;
        }
      } catch (err) {
        console.warn('时间转化四柱失败:', err);
      }
    } else if (res.type === 'ganzhi') {
      let matchedCount = 0;
      if (res.pillars.year && selGzYear && JIAZI.includes(res.pillars.year)) { selGzYear.value = res.pillars.year; matchedCount++; }
      if (res.pillars.month && selGzMonth && JIAZI.includes(res.pillars.month)) { selGzMonth.value = res.pillars.month; matchedCount++; }
      if (res.pillars.day && selGzDay && JIAZI.includes(res.pillars.day)) { selGzDay.value = res.pillars.day; matchedCount++; }
      if (res.pillars.hour && selGzHour && JIAZI.includes(res.pillars.hour)) { selGzHour.value = res.pillars.hour; matchedCount++; }

      updateManualPreview();

      if (txtGzQuickStatus) {
        if (matchedCount >= 4) {
          txtGzQuickStatus.textContent = `已成功识别四柱：${selGzYear.value} ${selGzMonth.value} ${selGzDay.value} ${selGzHour.value}`;
          txtGzQuickStatus.style.color = 'var(--md-sys-color-primary)';
        } else if (matchedCount > 0) {
          txtGzQuickStatus.textContent = `已识别 ${matchedCount}/4 柱...`;
          txtGzQuickStatus.style.color = 'var(--md-sys-color-tertiary, #b06000)';
        } else {
          txtGzQuickStatus.textContent = '未检测到有效甲子干支或公历时间';
          txtGzQuickStatus.style.color = 'var(--md-sys-color-error)';
        }
      }
    }
  }

  if (iptGzQuick) {
    iptGzQuick.addEventListener('input', e => handleManualGzQuickInput(e.target.value));
    iptGzQuick.addEventListener('change', e => handleManualGzQuickInput(e.target.value));
  }

  // 5. 文本粘贴智能识别 (模式 2)
  function parsePastedText(text) {
    if (!text || !text.trim()) return false;
    let foundJu = null;
    let foundDun = null;

    // 匹配局象: e.g. 阴五局 / 阳遁一局 / 阴5局 / 阳遁三局
    const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    const juMatch = text.match(/(阳|阴)[遁]?([一二三四五六七八九1-9])局?/);
    if (juMatch) {
      foundDun = juMatch[1];
      const rawNum = juMatch[2];
      foundJu = numMap[rawNum] || parseInt(rawNum) || 5;
    }

    if (text.includes('拆补') && selDingjuMethod) selDingjuMethod.value = 'chaibu';
    else if (text.includes('置闰') && selDingjuMethod) selDingjuMethod.value = 'zhirun';
    else if (text.includes('茅山') && selDingjuMethod) selDingjuMethod.value = 'maoshan';

    // 匹配干支 (在文本中提取所有合法的六十甲子干支)
    const gzMatches = [];
    const gzRegex = /([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g;
    let m;
    while ((m = gzRegex.exec(text)) !== null) {
      if (JIAZI.includes(m[1]) && !gzMatches.includes(m[1])) {
        gzMatches.push(m[1]);
      }
    }

    let parsedPillars = {};
    const yMatch = text.match(/(?:年柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*年)/);
    if (yMatch) parsedPillars.year = yMatch[1] || yMatch[2];
    const mMatch = text.match(/(?:月柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*月)/);
    if (mMatch) parsedPillars.month = mMatch[1] || mMatch[2];
    const dMatch = text.match(/(?:日柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*日)/);
    if (dMatch) parsedPillars.day = dMatch[1] || dMatch[2];
    const hMatch = text.match(/(?:时柱?[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])|([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])\s*时)/);
    if (hMatch) parsedPillars.hour = hMatch[1] || hMatch[2];

    const fourGzMatch = text.match(/干支[:：\s]*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s,，]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s,，]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])[\s,，]+([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/);
    if (fourGzMatch && (!parsedPillars.year || !parsedPillars.month || !parsedPillars.day || !parsedPillars.hour)) {
      if (!parsedPillars.year) parsedPillars.year = fourGzMatch[1];
      if (!parsedPillars.month) parsedPillars.month = fourGzMatch[2];
      if (!parsedPillars.day) parsedPillars.day = fourGzMatch[3];
      if (!parsedPillars.hour) parsedPillars.hour = fourGzMatch[4];
    }

    if (!parsedPillars.year && !parsedPillars.month && gzMatches.length >= 4) {
      parsedPillars.year = gzMatches[0];
      parsedPillars.month = gzMatches[1];
      parsedPillars.day = gzMatches[2];
      parsedPillars.hour = gzMatches[3];
    } else if (gzMatches.length === 2 && !parsedPillars.day && !parsedPillars.hour) {
      parsedPillars.day = gzMatches[0];
      parsedPillars.hour = gzMatches[1];
    }

    // 若文本中未包含完整四柱，但包含公历时间，则利用时间推算自动补充四柱干支
    if (!parsedPillars.year || !parsedPillars.month || !parsedPillars.day || !parsedPillars.hour) {
      const dt = parseDateTimeFromText(text);
      if (dt) {
        try {
          const curDingju = selDingjuMethod ? selDingjuMethod.value : (state.dingjuMethod || 'zhirun');
          const curPaipan = selPaipanMethod ? selPaipanMethod.value : (state.paipanMethod || 'zhuan');
          const calcPan = paipan({
            year: dt.year,
            month: dt.month,
            day: dt.day,
            hour: dt.hour,
            minute: dt.minute,
            dingjuMethod: curDingju,
            paipanMethod: curPaipan,
            longitude: state.longitude || 116.38
          });
          if (calcPan && calcPan.pillars) {
            if (!parsedPillars.year) parsedPillars.year = calcPan.pillars.year;
            if (!parsedPillars.month) parsedPillars.month = calcPan.pillars.month;
            if (!parsedPillars.day) parsedPillars.day = calcPan.pillars.day;
            if (!parsedPillars.hour) parsedPillars.hour = calcPan.pillars.hour;
            if (!foundDun && calcPan.dun) foundDun = calcPan.dun;
            if (!foundJu && calcPan.ju) foundJu = calcPan.ju;
          }
        } catch (e) {
          console.warn('粘贴文本时间转化四柱失败:', e);
        }
      }
    }

    let hasUpdate = false;
    if (foundDun && selDun) { selDun.value = foundDun; hasUpdate = true; }
    if (foundJu && selJuNum) { selJuNum.value = String(foundJu); hasUpdate = true; }
    if (parsedPillars.year && selGzYear) { selGzYear.value = parsedPillars.year; hasUpdate = true; }
    if (parsedPillars.month && selGzMonth) { selGzMonth.value = parsedPillars.month; hasUpdate = true; }
    if (parsedPillars.day && selGzDay) { selGzDay.value = parsedPillars.day; hasUpdate = true; }
    if (parsedPillars.hour && selGzHour) { selGzHour.value = parsedPillars.hour; hasUpdate = true; }

    updateManualPreview();
    return hasUpdate;
  }

  if (btnParse) {
    btnParse.addEventListener('click', () => {
      const val = txtPaste ? txtPaste.value : '';
      const ok = parsePastedText(val);
      if (ok) {
        if (txtParseStatus) {
          txtParseStatus.textContent = '已成功识别四柱与局数，请核对下方预览';
          txtParseStatus.style.color = 'var(--md-sys-color-primary)';
        }
      } else {
        if (txtParseStatus) {
          txtParseStatus.textContent = '未能识别出完整四柱或局数，请检查文本格式';
          txtParseStatus.style.color = 'var(--md-sys-color-error)';
        }
      }
    });
  }

  // 6. 打开弹窗时，用当前盘面数据初始化各下拉框
  function openManualModal() {
    if (state.currentPan && state.currentPan.pillars) {
      const p = state.currentPan;
      if (selGzYear) selGzYear.value = p.pillars.year;
      if (selGzMonth) selGzMonth.value = p.pillars.month;
      if (selGzDay) selGzDay.value = p.pillars.day;
      if (selGzHour) selGzHour.value = p.pillars.hour;
      if (selDun) selDun.value = p.dun || '阴';
      if (selJuNum) selJuNum.value = String(p.ju || 5);
      if (selPaipanMethod) selPaipanMethod.value = p.paipanMethod || 'zhuan';
    }
    if (selDingjuMethod) {
      selDingjuMethod.value = state.dingjuMethod || 'zhirun';
    }
    if (iptGzQuick) iptGzQuick.value = '';
    if (txtGzQuickStatus) txtGzQuickStatus.textContent = '';
    if (txtParseStatus) txtParseStatus.textContent = '';
    updateManualPreview();
    openModal('modalManualInput');
  }

  if (btnBottomManual) {
    btnBottomManual.addEventListener('click', openManualModal);
  }

  // 7. 确认录入并排盘
  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      const dun = selDun.value;
      const ju = parseInt(selJuNum.value);
      const paipanMethod = selPaipanMethod.value;
      const dingjuMethod = selDingjuMethod ? selDingjuMethod.value : state.dingjuMethod;
      const customPillars = {
        year: selGzYear.value,
        month: selGzMonth.value,
        day: selGzDay.value,
        hour: selGzHour.value
      };

      state.manualJu = { dun, ju, type: 'manual', dingjuMethod };
      state.customPillars = customPillars;
      state.paipanMethod = paipanMethod;
      state.dingjuMethod = dingjuMethod;

      // 同步全局定局方式 Segmented Button
      const segDingju = document.getElementById('segDingjuGroup');
      if (segDingju) {
        segDingju.querySelectorAll('.m3-segment-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.value === dingjuMethod);
        });
      }

      closeModal('modalManualInput');
      executePaipan();

      const djText = selDingjuMethod ? selDingjuMethod.options[selDingjuMethod.selectedIndex]?.text : '';
      showToast(`已成功录入并排定【${dun}遁${['一','二','三','四','五','六','七','八','九'][ju - 1]}局 · ${djText} · ${customPillars.day}日 ${customPillars.hour}时】！`);
    });
  }
}

// ==================== 12. 系统常用设置模块 (统一配置与持久化存储) ====================
function initSettingsModal() {
  const btnSettings = document.getElementById('btnSettings');
  if (btnSettings) {
    btnSettings.addEventListener('click', () => {
      syncSettingsModal();
      openModal('modalSettings');
    });
  }

  const btnOpenHelp = document.getElementById('btnSettingsOpenHelp');
  if (btnOpenHelp) {
    btnOpenHelp.addEventListener('click', () => {
      closeModal('modalSettings');
      openModal('modalHelp');
    });
  }

  // 省份与城市下拉列表联动
  const selProv = document.getElementById('selSettingProvince');
  const selCity = document.getElementById('selSettingCity');
  const numLon = document.getElementById('numSettingLongitude');

  if (selProv && selCity && numLon) {
    selProv.innerHTML = '';
    CITIES_DATA.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.province;
      opt.textContent = p.province;
      if (p.province === (state.province || '北京')) opt.selected = true;
      selProv.appendChild(opt);
    });

    function populateSettingCities(provName, selectCityName) {
      selCity.innerHTML = '';
      const provObj = CITIES_DATA.find(p => p.province === provName) || CITIES_DATA[0];
      provObj.cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        opt.dataset.lon = c.lon;
        selCity.appendChild(opt);
      });
      if (selectCityName) {
        const cleanCity = selectCityName.replace(provName, '').trim();
        const matchOpt = Array.from(selCity.options).find(o => o.value === cleanCity || o.value === selectCityName);
        if (matchOpt) selCity.value = matchOpt.value;
        else selCity.selectedIndex = 0;
      } else {
        selCity.selectedIndex = 0;
      }
      updateSettingLongitude();
    }

    function updateSettingLongitude() {
      const selOpt = selCity.options[selCity.selectedIndex];
      if (selOpt && selOpt.dataset.lon) {
        numLon.value = selOpt.dataset.lon;
        state.longitude = parseFloat(selOpt.dataset.lon);
        state.province = selProv.value;
        state.cityName = `${selProv.value} ${selOpt.value}`;
        localStorage.setItem('qimen_province', state.province);
        localStorage.setItem('qimen_city', state.cityName);
        localStorage.setItem('qimen_longitude', state.longitude);

        // 同步主页面位置选择器
        const mainProv = document.getElementById('selProvince');
        const mainCity = document.getElementById('selCity');
        const mainLon = document.getElementById('numLongitude');
        if (mainProv && mainCity && mainLon) {
          mainProv.value = state.province;
          const provObj = CITIES_DATA.find(p => p.province === state.province) || CITIES_DATA[0];
          mainCity.innerHTML = '';
          provObj.cities.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name;
            opt.dataset.lon = c.lon;
            mainCity.appendChild(opt);
          });
          mainCity.value = selOpt.value;
          mainLon.value = selOpt.dataset.lon;
        }
        executePaipan();
      }
    }

    selProv.addEventListener('change', () => {
      populateSettingCities(selProv.value);
    });

    selCity.addEventListener('change', () => {
      updateSettingLongitude();
    });

    numLon.addEventListener('change', () => {
      state.longitude = parseFloat(numLon.value) || 120.0;
      localStorage.setItem('qimen_longitude', state.longitude);
      const mainLon = document.getElementById('numLongitude');
      if (mainLon) mainLon.value = state.longitude;
      executePaipan();
    });

    populateSettingCities(state.province || '北京', state.cityName);
  }

  // 绑定设置弹窗内部的 Segmented Buttons
  bindSettingSeg('segSettingDingju', val => {
    state.dingjuMethod = val;
    localStorage.setItem('qimen_dingju_method', val);
    syncMainSegmentGroup('segDingjuGroup', val);
    executePaipan();
  });

  bindSettingSeg('segSettingPaipan', val => {
    state.paipanMethod = val;
    localStorage.setItem('qimen_paipan_method', val);
    syncMainSegmentGroup('segPaipanGroup', val);
    executePaipan();
  });

  bindSettingSeg('segSettingZishi', val => {
    state.zishi = val;
    localStorage.setItem('qimen_zishi', val);
    syncMainSegmentGroup('segZishiGroup', val);
    executePaipan();
  });

  bindSettingSeg('segSettingTheme', val => {
    document.documentElement.setAttribute('data-theme', val);
    localStorage.setItem('qimen_theme', val);
  });

  bindSettingSeg('segSettingSimple', val => {
    state.isSimpleMode = val === '1';
    document.body.classList.toggle('simple-mode', state.isSimpleMode);
    const btn = document.getElementById('btnToggleSimple');
    if (btn) btn.textContent = state.isSimpleMode ? '完整模式' : '简洁模式';
    localStorage.setItem('qimen_simple_mode', val);
  });

  bindSettingSeg('segSettingDetail', val => {
    state.showKeyingDetails = val === '1';
    localStorage.setItem('qimen_show_keying_details', val);
    updateKeyingToggleBtn();
    if (state.currentPan) renderKeyingAnalysis(state.currentPan, state.selectedGong);
  });

  bindSettingSeg('segSettingImagery', val => {
    setImageryMode(val);
  });

  bindSettingSeg('segSettingDipan', val => {
    state.showDipan = val === '1';
    localStorage.setItem('qimen_show_dipan', val);
    const chk = document.getElementById('chkToggleDipan');
    if (chk) chk.checked = state.showDipan;
    updateBoardCardCenter(state.currentPan);
    if (state.currentPan) {
      renderNinePalaces(state.currentPan);
      renderKeyingAnalysis(state.currentPan, state.selectedGong);
    }
  });

  const chkMask = document.getElementById('chkSettingMask');
  if (chkMask) {
    chkMask.checked = state.maskWeakened;
    chkMask.addEventListener('change', e => {
      state.maskWeakened = e.target.checked;
      localStorage.setItem('qimen_mask_weakened', state.maskWeakened ? '1' : '0');
      if (state.currentPan) {
        renderNinePalaces(state.currentPan);
        renderKeyingAnalysis(state.currentPan, state.selectedGong);
      }
    });
  }

  bindSettingSeg('segSettingKong', val => {
    state.kongLookOpposite = val === '1';
    localStorage.setItem('qimen_kong_look_opposite', val);
    if (state.currentPan) {
      renderNinePalaces(state.currentPan);
      renderKeyingAnalysis(state.currentPan, state.selectedGong);
    }
  });

  // 恢复出厂默认按钮
  const btnReset = document.getElementById('btnSettingsResetDefault');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      resetSettingsToDefault();
    });
  }

  syncSettingsModal();
}

function bindSettingSeg(groupId, onChange) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const btns = group.querySelectorAll('.m3-segment-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (onChange) onChange(btn.dataset.value);
    });
  });
}

function syncMainSegmentGroup(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.m3-segment-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === value);
  });
}

function syncSettingsModal() {
  // 同步定局法
  syncSegButtons('segSettingDingju', state.dingjuMethod);
  // 同步排盘法
  syncSegButtons('segSettingPaipan', state.paipanMethod);
  // 同步子时
  syncSegButtons('segSettingZishi', state.zishi);
  // 同步主题
  const curTheme = document.documentElement.getAttribute('data-theme') || 'light';
  syncSegButtons('segSettingTheme', curTheme);
  // 同步简洁模式
  syncSegButtons('segSettingSimple', state.isSimpleMode ? '1' : '0');
  // 同步详细
  syncSegButtons('segSettingDetail', state.showKeyingDetails ? '1' : '0');
  // 同步象意
  syncSegButtons('segSettingImagery', state.imageryMode);
  // 同步地盘
  syncSegButtons('segSettingDipan', state.showDipan ? '1' : '0');
  // 同步旬空
  syncSegButtons('segSettingKong', state.kongLookOpposite ? '1' : '0');
  // 同步蒙版
  const chk = document.getElementById('chkSettingMask');
  if (chk) chk.checked = state.maskWeakened;

  syncSettingsModalLocation();
}

function syncSegButtons(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.m3-segment-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.value === String(value));
  });
}

function syncSettingsModalLocation() {
  const selProv = document.getElementById('selSettingProvince');
  const selCity = document.getElementById('selSettingCity');
  const numLon = document.getElementById('numSettingLongitude');
  if (!selProv || !selCity || !numLon) return;

  if (selProv.value !== state.province) {
    selProv.value = state.province || '北京';
    const provObj = CITIES_DATA.find(p => p.province === selProv.value) || CITIES_DATA[0];
    selCity.innerHTML = '';
    provObj.cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      opt.dataset.lon = c.lon;
      selCity.appendChild(opt);
    });
  }
  const cleanCity = (state.cityName || '').replace(state.province, '').trim();
  const match = Array.from(selCity.options).find(o => o.value === cleanCity || o.value === state.cityName);
  if (match) selCity.value = match.value;
  numLon.value = state.longitude;
}

function resetSettingsToDefault() {
  // 清理 localStorage 中的相关设置项
  [
    'qimen_dingju_method', 'qimen_paipan_method', 'qimen_zishi',
    'qimen_province', 'qimen_city', 'qimen_longitude',
    'qimen_theme', 'qimen_simple_mode', 'qimen_show_keying_details',
    'qimen_imagery_mode', 'qimen_show_dipan',
    'qimen_mask_weakened', 'qimen_kong_look_opposite'
  ].forEach(k => localStorage.removeItem(k));

  state.dingjuMethod = 'zhirun';
  state.paipanMethod = 'zhuan';
  state.zishi = 'split';
  state.province = '北京';
  state.cityName = '北京 天安门';
  state.longitude = 116.38;
  state.isSimpleMode = false;
  state.showKeyingDetails = true;
  state.imageryMode = 'all';
  state.showDipan = false;
  state.maskWeakened = false;
  state.kongLookOpposite = true;

  document.documentElement.setAttribute('data-theme', 'light');
  document.body.classList.remove('simple-mode');
  const btnSimple = document.getElementById('btnToggleSimple');
  if (btnSimple) btnSimple.textContent = '简洁模式';

  const chkDipan = document.getElementById('chkToggleDipan');
  if (chkDipan) chkDipan.checked = false;

  updateKeyingToggleBtn();
  syncSettingsModal();

  // 同步主界面表单
  syncMainSegmentGroup('segDingjuGroup', 'zhirun');
  syncMainSegmentGroup('segPaipanGroup', 'zhuan');
  syncMainSegmentGroup('segZishiGroup', 'split');

  const mainProv = document.getElementById('selProvince');
  const mainCity = document.getElementById('selCity');
  const mainLon = document.getElementById('numLongitude');
  if (mainProv && mainCity && mainLon) {
    mainProv.value = '北京';
    const provObj = CITIES_DATA.find(p => p.province === '北京') || CITIES_DATA[0];
    mainCity.innerHTML = '';
    provObj.cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      opt.dataset.lon = c.lon;
      mainCity.appendChild(opt);
    });
    mainCity.selectedIndex = 0;
    mainLon.value = 116.38;
  }

  setImageryMode('all');

  executePaipan();
  showToast('已恢复出厂默认设置！');
}


