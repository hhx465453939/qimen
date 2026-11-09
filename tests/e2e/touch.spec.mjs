import { test, expect } from '@playwright/test';

/**
 * 真实触摸回归（2026-11 真机事故后新增）
 *
 * 背景：旧测试用 page.evaluate 手工 dispatchEvent 伪造 touchstart/touchend，
 * 绕过了浏览器真实的触摸链路，结果真机（Redmi Note 12）上「纵向滑不动、
 * 横向不翻页」却全绿——假绿。这里改为 CDP Input.dispatchTouchEvent，
 * 走与手指相同的输入通道。
 */

const VP = { width: 393, height: 873 }; // 红米 Note 12 近似

async function realTouchDrag(page, from, to, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
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
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(320);
  await cdp.detach();
}

test.describe('真实触摸 · 移动端', () => {
  test.use({ viewport: VP, hasTouch: true, isMobile: true });

  // 只在移动项目里跑，避免桌面项目重复执行
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', '仅移动项目');
  });

  test('页面高度被锁在视口内（不是内容高度），且内容区可滚动', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/pager-mode/);

    const m = await page.evaluate(() => {
      const main = document.getElementById('appMainContainer');
      const left = document.getElementById('leftPanel');
      const nav = document.getElementById('m3MobileNav');
      return {
        mainH: Math.round(main.getBoundingClientRect().height),
        inner: window.innerHeight,
        navH: Math.round(nav.getBoundingClientRect().height),
        contentH: left.scrollHeight,
        clientH: left.clientHeight
      };
    });

    // 关键回归：容器高度必须接近「视口 - 顶栏 - 底栏」，不能被内容撑开
    expect(m.mainH, '主容器被内容撑开了（flex min-height:auto 回归）').toBeLessThan(
      m.inner - m.navH + 4
    );
    expect(m.mainH, '主容器高度异常偏大').toBeLessThan(m.contentH);
    // 必须有可滚动余量
    expect(m.contentH, '内容区没有滚动余量，手指滑动会“没反应”').toBeGreaterThan(m.clientH + 40);
  });

  test('纵向真手势可以滚动内容', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/pager-mode/);

    const before = await page.evaluate(() => document.getElementById('leftPanel').scrollTop);
    await realTouchDrag(page, { x: 196, y: 700 }, { x: 196, y: 260 }, 12);
    const after = await page.evaluate(() => document.getElementById('leftPanel').scrollTop);

    expect(after, '真实手指上推后内容应滚动').toBeGreaterThan(before + 50);
  });

  test('横向真手势可以翻页（左滑下一页 / 右滑上一页）', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/pager-mode/);

    // 左滑 → 万年历
    await realTouchDrag(page, { x: 330, y: 300 }, { x: 100, y: 300 }, 10);
    await expect(page.locator('.calendar-card')).toBeVisible();

    const p1 = await page.evaluate(() => window.QimenPager.current());
    expect(p1).toBe('cal');

    // 右滑 → 回到排盘（必须不触发浏览器后退历史）
    await realTouchDrag(page, { x: 100, y: 300 }, { x: 330, y: 300 }, 10);

    expect(page.url(), '右滑触发了浏览器历史导航，页面被换走').toContain('/index.html');
    const alive = await page.evaluate(() => typeof window.QimenPager !== 'undefined');
    expect(alive, '分页引擎消失（页面被导航走）').toBe(true);

    const p2 = await page.evaluate(() => window.QimenPager.current());
    expect(p2).toBe('pan');
  });

  test('表格区：内容自适应不裁剪，且横滑能翻页（无死区）', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/pager-mode/);

    // 表格必须自适应（不再横向滚动），否则与 pan-y 冲突形成死区
    const fit = await page.evaluate(() => {
      const el = document.querySelector('.merged-table-responsive');
      return el ? { sw: el.scrollWidth, cw: el.clientWidth } : null;
    });
    expect(fit).not.toBeNull();
    expect(fit.sw, '表格仍可横向滚动（自适应未生效）').toBeLessThanOrEqual(fit.cw + 2);

    const table = page.locator('.merged-table-responsive').first();
    const box0 = await table.boundingBox();
    expect(box0, '找不到克应表格').not.toBeNull();

    // 表格可能在首屏下方：先滚进视口，否则触摸坐标会落在屏幕外
    await table.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const box = await table.boundingBox();
    // 把落点夹在视口内
    const y = Math.round(Math.min(Math.max(box.y + 20, 120), VP.height - 140));

    // 确认落点真的在表格上（否则测的就不是表格区）
    const hitOnTable = await page.evaluate((yy) => {
      const el = document.elementFromPoint(215, yy);
      return !!(el && el.closest('.merged-table-responsive'));
    }, y);
    expect(hitOnTable, `落点 y=${y} 不在表格上，测试无效`).toBe(true);

    const before = await page.evaluate(() => window.QimenPager.current());
    await realTouchDrag(page, { x: 330, y }, { x: 100, y }, 10);
    const after = await page.evaluate(() => window.QimenPager.current());
    expect(after, `表格区域横滑无法翻页（落点 y=${y}）`).not.toBe(before);
  });

  test('手势修复不影响点击：底部导航仍可正常切页', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#m3MobileNav .nav-item[data-tab="cases"]').click();
    await expect(page.locator('.cases-card')).toBeVisible();
    expect(await page.evaluate(() => window.QimenPager.current())).toBe('cases');
  });
});
