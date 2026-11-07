import { test, expect } from '@playwright/test';

const PAGES = [
  { tab: 'pan', mustShow: '#leftPanel', mustHide: '#rightPanel' },
  { tab: 'cal', mustShow: '.calendar-card', mustHide: '.controls-card' },
  { tab: 'setting', mustShow: '.controls-card', mustHide: '.calendar-card' },
  { tab: 'cases', mustShow: '.cases-card', mustHide: '.calendar-card' }
];

test.describe('移动端 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('分页接管：四页互斥、可点击切换、无横向溢出', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/index.html');

    await expect(page.locator('body')).toHaveClass(/pager-mode/);
    await expect(page.locator('#leftPanel')).toBeVisible();
    await expect(page.locator('#rightPanel')).toBeHidden();

    // 无横向滚动
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    for (const p of PAGES) {
      await page.locator(`#m3MobileNav .nav-item[data-tab="${p.tab}"]`).click();
      await expect(page.locator(p.mustShow)).toBeVisible();
      await expect(page.locator(p.mustHide)).toBeHidden();
      await expect(page.locator(`#m3MobileNav .nav-item[data-tab="${p.tab}"]`)).toHaveClass(/active/);
    }

    // 九宫格不超出屏幕
    await page.locator('#m3MobileNav .nav-item[data-tab="pan"]').click();
    const box = await page.locator('#nineGrid').boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeLessThanOrEqual(390);
    expect(box.x).toBeGreaterThanOrEqual(-1);

    expect(errors, '页面不应有未捕获 JS 异常: ' + errors.join(' | ')).toEqual([]);
  });

  test('滑动切页与返回键语义', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/pager-mode/);

    // 左滑 → 万年历
    await page.evaluate(() => {
      const main = document.getElementById('appMainContainer');
      const mk = (type, x, y) => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        const t = { clientX: x, clientY: y };
        ev.touches = type === 'touchstart' ? [t] : [];
        ev.changedTouches = type === 'touchend' ? [t] : [];
        return ev;
      };
      main.dispatchEvent(mk('touchstart', 320, 420));
      main.dispatchEvent(mk('touchend', 120, 420));
    });
    await expect(page.locator('.calendar-card')).toBeVisible();

    const handled = await page.evaluate(() => window.QimenPager.handleBack());
    expect(handled).toBe('handled');
    await expect(page.locator('#leftPanel')).toBeVisible();
  });
});

test.describe('桌面 1280x900', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('不接管分页：双栏与全部卡片可见', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('body')).not.toHaveClass(/pager-mode/);
    await expect(page.locator('#leftPanel')).toBeVisible();
    await expect(page.locator('#rightPanel')).toBeVisible();
    await expect(page.locator('.calendar-card')).toBeVisible();
    await expect(page.locator('.controls-card')).toBeVisible();
    await expect(page.locator('.cases-card')).toBeVisible();
    await expect(page.locator('.board-card')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
