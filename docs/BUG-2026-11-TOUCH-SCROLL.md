# 真机事故复盘：手机上「滑动没反应，点击正常」

- 报告时间：2026-11-07
- 报告人：主人（真机：Redmi Note 12，Android 13）
- 影响版本：v1.0.0
- 修复版本：v1.0.1
- 关联变更：CHG-001 / ADR-004（移动端分页）

---

## 1. 现象（用户原话）

> 去滑动这个页面，发现触控以后没有反应；但是用 tap 单击里面的一些元件是可以的。

拆成两条可验证的事实：

1. 手指**上下滑动**：页面内容不动。
2. 手指**左右滑动**：不切换页签。
3. 手指**单击**按钮/页签：正常工作。

「能点不能滑」是关键线索：说明页面渲染正常、JS 已运行、元素能命中，问题在**滚动能力**和**手势判定**，不在加载。

---

## 2. 结论先行（三层根因，全部实测确认）

| # | 根因 | 实测证据 |
|---|---|---|
| 1 | 主容器是 flex 子项，默认 `min-height: auto` 会按**内容高度**撑开，把 JS 设置的视口高度顶掉 | 视口 `innerHeight=873`，JS 设 `height:749px`，**实际计算高度 1448px**；面板 `clientHeight(1442) == scrollHeight(1442)` → **滚动余量为 0** |
| 2 | 横向手势守卫「只要祖先能横向滚动就让路」，没有判断**当前是否已到边界** | 存在 `.merged-table-responsive`（内容 460px / 可视 335px / `overflow-x:auto`）；手指落在克应表格上时，每次横滑都被判为「让路给表格」，翻页永不触发 |
| 3 | 为修第 2 条一度去掉 `touch-action: pan-y`，反而放出了浏览器自带的「左右滑 = 前进/后退」手势 | 右滑后页面被导航走，新页面里 `window.QimenPager` 为 `undefined`（测试直接报 `Cannot read properties of undefined`） |

第 1 条是主因：容器被内容撑高 + `body`/容器都 `overflow:hidden`，屏幕外那 600 多像素内容**永远够不到**，所以「怎么滑都不动」；而可见区域内的按钮仍然可以点。

---

## 3. 修复逻辑（逐条对应）

### 3.1 锁死视口高度（修第 1 条）

`css/pager.css`：

```css
body.pager-mode #appMainContainer {
  flex: 0 0 auto !important;                                   /* 不让 flex 拉伸 */
  height: var(--qimen-pager-height) !important;                 /* 显式高度 */
  min-height: 0 !important;                                     /* 关键：允许收缩 */
  max-height: var(--qimen-pager-height) !important;
  overflow: hidden !important;
}
```

`js/mobile-pager.js` 的 `layout()` 改为写 CSS 变量（而不是只写内联 height）：

```js
root.style.setProperty('--qimen-pager-height', Math.round(h) + 'px');
```

为什么必须这样：只设内联 `height` 会被 flex 的 `min-height:auto` 顶掉；`!important` + `min-height:0` 才能压住。

### 3.2 手势守卫加「方向 + 边界」判断（修第 2 条）

```js
// 只有该方向真的还能继续滚，才把手指让给容器；到边界就交回分页
if ((dir < 0 && !atEnd) || (dir > 0 && !atStart)) return true;
```

### 3.3 恢复 `touch-action: pan-y` + 宽表格自适应（修第 3 条）

- 面板恢复 `touch-action: pan-y`：纵向跟手，同时**阻止浏览器把横滑识别成历史导航**。
- 代价：面板内不能做原生横向滚动。因此把宽表格改成自适应：

```css
body.pager-mode .merged-table-responsive { overflow-x: hidden !important; }
body.pager-mode .merged-table-responsive > table {
  width: 100% !important; min-width: 0 !important; table-layout: fixed !important;
}
body.pager-mode .merged-table-responsive th,
body.pager-mode .merged-table-responsive td {
  word-break: break-word; overflow-wrap: anywhere;
}
```

这样「表格要横滚」这个死区来源被彻底消除，表格内容改为换行显示，不再被裁掉。

### 3.4 手势事件补强

- 新增 `touchmove` 记录最新坐标：Android 被原生滚动接管时可能不发 `touchend`，用它兜底。
- 新增 `touchcancel` 结算：否则一次手势被打断后，后续滑动会永久失效。
- 手势列表更新为 `touchstart / touchmove / touchend / touchcancel`，`destroy()` 同步解绑。

---

## 4. 为什么第一版测试没抓到（假绿）

原测试这样造滑动：

```js
main.dispatchEvent(new Event('touchstart'))   // ❌ 手工造的事件
main.dispatchEvent(new Event('touchend'))
```

问题：它绕过了浏览器真实的触摸链路（原生滚动接管、`touch-action`、`touchcancel`、坐标换算），
所以**布局上根本没有滚动余量**、**手势被守卫吞掉**这两种真实故障，测试全都发现不了。

修复方式：改用 CDP 的真实输入通道：

```js
cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...] })
// 多次 touchMove（每 16ms 一步）
cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
```

---

## 5. 新增回归测试（`tests/e2e/touch.spec.mjs`）

| 用例 | 断言 | 防的是什么 |
|---|---|---|
| 页面高度锁在视口内 | 容器高度 < 视口，且内容区 `scrollHeight > clientHeight + 40` | 防第 1 条复发（撑高后没滚动余量） |
| 纵向真手势滚动 | 上推后 `scrollTop` 增加 > 50 | 防「滑不动」复发 |
| 横向真手势翻页 | 左滑到 `cal`、右滑回 `pan`，且 URL 仍在本页、`QimenPager` 仍存在 | 防第 3 条复发（历史导航把页面换走） |
| 表格区横滑 | 表格 `scrollWidth <= clientWidth + 2`，且表格上横滑能翻页 | 防第 2 条复发（死区） |
| 手势不影响点击 | 点底部页签仍能切页 | 防手势修复把点击拦掉 |

辅助脚本：`tests/diag/touch-diag.mjs`（打印尺寸、flex 实况、触摸事件流、探针 A/B/C），排障时可直接跑。

结果：`npm test` 12/12、`npx playwright test` 17/17 全绿。

---

## 6. 验证流程（可复现）

```bash
# 1. 起本地服务
python3 -m http.server 8099 --bind 127.0.0.1

# 2. 真实触摸诊断（打印每层高度与手势结果）
NO_PROXY=127.0.0.1,localhost \
QIMEN_CHROMIUM_PATH=<本地 chrome 路径> \
node tests/diag/touch-diag.mjs

# 3. 全量测试
npm test
npx playwright test

# 4. 出包并校验
npm run android:release && npm run verify:apk
```

关键验收数字（修复后实测）：

- 视口 873 → 主容器高度 745（不再是 1448）
- 内容滚动余量 703px（不再是 0）
- 纵向手势：`scrollTop` 0 → 620
- 横向手势：`pan` → `cal` → `pan`
- 表格 `scrollWidth == clientWidth`（不再需要横滚）

---

## 7. 回滚方式

单 commit 可回滚：`git revert <本修复 commit>`。
回滚后移动端会恢复到「只能点、不能滑」的 v1.0.0 行为，桌面端不受影响。

---

## 8. 已知限制

1. 本机无 `/dev/kvm`，无法跑安卓模拟器；以上验证是 **Chromium 移动模拟（393×873，DPR 2.75，Android UA）+ 真实触摸事件**，仍不等于真机。
2. 设置页的表单控件区域（`select`/`input`/滑块）刻意不劫持横滑，避免误触；在这些控件上横滑不会翻页，请用底部页签。
3. 表格改为固定布局换行后，极长的连续英文/数字仍可能撑高行高（已有 `word-break/overflow-wrap` 兜底）。
