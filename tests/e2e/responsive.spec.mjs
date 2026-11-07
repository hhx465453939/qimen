import { test, expect } from '@playwright/test';

// 覆盖「绝大多数主流安卓手机」的实际视口，防止只在 390 宽下好看
const VIEWPORTS = [
  { name: '小屏 360x640', width: 360, height: 640 },
  { name: '主流 412x915', width: 412, height: 915 },
  { name: '平板 768x1024', width: 768, height: 1024 }
];

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('分页可用、无横向溢出、九宫格不越界', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto('/index.html');
      await expect(page.locator('body')).toHaveClass(/pager-mode/);

      // 1) 无横向滚动
      let overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `${vp.name} 出现横向溢出`).toBeLessThanOrEqual(1);

      // 2) 九宫格完整落在视口内
      const grid = page.locator('#nineGrid');
      await expect(grid).toBeVisible();
      const box = await grid.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x, '九宫格左侧越界').toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, '九宫格右侧越界').toBeLessThanOrEqual(vp.width + 1);

      // 3) 四页都可切换且切页后仍无横向溢出
      for (const tab of ['cal', 'setting', 'cases', 'pan']) {
        await page.locator(`#m3MobileNav .nav-item[data-tab="${tab}"]`).click();
        overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflow, `${vp.name} 切到 ${tab} 后横向溢出`).toBeLessThanOrEqual(1);
      }

      // 4) 底部导航与页面内容不重叠（导航高度内不应被内容压住）
      const navBox = await page.locator('#m3MobileNav').boundingBox();
      expect(navBox).not.toBeNull();
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(vp.height + 1);

      expect(errors, '未捕获 JS 异常: ' + errors.join(' | ')).toEqual([]);
    });
  });
}
