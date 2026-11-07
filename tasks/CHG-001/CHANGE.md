# CHG-001 · 变更简报（Change Brief）

```yaml
change_id: CHG-001
title: 奇门排盘 PWA 打包为 Android 应用 + 项目内安卓工具链 + 自动发布流水线 + 移动端分页
requested_by: 主人（本会话原始需求）
date: 2026-10-20
status: DRAFT（待主人确认）
```

## 1. 字面需求（原话拆解）

1. 把 `Development/qimen` 做成一个能在**绝大多数主流安卓手机**上安装运行的 App。
2. 安卓开发与测试环境**全部放在项目内部**，不外溢到全局环境。
3. 开发、测试、commit、push **全自动**执行。
4. CI/CD 与 **APK release 构建**要重点盯住，确保不出问题，有 bug 及时修。
5. 前端优化成**适应手机显示的分页**。
6. 全部完成后通知主人，主人从自己的仓库下载 release 安装包做端到端测试。

## 2. 字面背后的真实目的（判断）

| 字面 | 真实目的 |
|---|---|
| 做成安卓 App | 要一个**可离线、可长期留在桌面、双击即用**的独立应用，摆脱「浏览器打开网页 / 信心不足的 PWA 添加主屏」 |
| 环境放项目内部 | 这台机器是多项目共用开发机，**不允许污染全局**（不装系统级 SDK、不写 `~/.gradle`、`~/.android`），项目可整体迁移/删除 |
| 全自动 commit/push | 不想当人肉搬运工，要**一条命令跑到发布**，且失败能自愈重试 |
| 盯住 CI/CD 与 release | 历史上被「CI 绿但装不上 / 签名不对 / 找不到 APK」坑过，要**可验证的真绿** |
| 手机分页 | 当前是长滚动页面，手机上信息密度过高、找不到重点，要**一屏一件事、可左右切换** |
| 完成后通知 | 主人只做最后一件事：下载 APK 装机跑真实业务，**不在中途被技术细节打扰** |

## 3. 现状（事实，非推测）

- 纯前端静态应用：`index.html`（1210 行）+ `css/style.css`（5225 行）+ `js/{app,qimen,calendar,database}.js` + `js/raw_keying.json` + `sw.js` + `manifest.json` + `icons/`。
- 无构建系统：无 `package.json`、无打包器、无 `node_modules`；JS 以传统 `<script>` 全局函数方式加载。
- 无任何自动化测试、无 lint、无 CI（无 `.github/`）。
- 移动端已有基础：`viewport-fit=cover`、8 处 `env(safe-area-inset-*)`、11 个 `@media` 断点、底部导航 `#m3MobileNav`（4 个 tab）与 `switchMobileTab()`（可见性切换，非真分页）。
- Git：分支 `main`，工作区干净，与 `origin/main` 同步；远端 `https://github.com/hhx465453939/qimen`。
- 已知坑：`.gitignore` 含 `*.png`（仅放行 `icons/*.png`），会误伤 Android 启动图标资源。

## 4. 范围（IN）

- IN-1 项目内自包含安卓工具链（JDK 21 + Android SDK + Gradle 用户目录 + npm 缓存），全部落在 `.toolchain/` 且 gitignore。
- IN-2 Capacitor **8.6.0** 原生外壳 + 现有静态资源打包（`www/` 生成物，单一真源不复制源码）。
- IN-3 移动端真分页：4 页（排盘 / 万年历 / 设局 / 案例），底部导航 + 左右滑动 + 返回键 + 页面位置持久化。
- IN-4 自动化测试（HTML 结构 / 资源完整性 / 分页行为 + 桌面不回归）。
- IN-5 GitHub Actions CI/CD：push 构建校验，打 tag 出签名 release APK 并发布到 GitHub Release。
- IN-6 版本号由 tag 注入（versionName/versionCode），APK 产物做静态校验（badging / 签名 / 资源清单）。
- IN-7 文档：本地构建、密钥管理、发版流程、故障排查。

## 5. 非范围（OUT）

- OUT-1 上架 Google Play / 国内应用商店（只走 GitHub Release 侧载）。
- OUT-2 iOS / 鸿蒙原生包。
- OUT-3 后端服务化改造（应用保持纯离线）。
- OUT-4 奇门算法、历法数据、克应判定的任何业务逻辑变更。
- OUT-5 用安卓模拟器做本机自动化 E2E（本机 **无 /dev/kvm**，纯软件模拟不可用；设备端 E2E 由主人执行）。
- OUT-6 多语言、账号体系、云同步。

## 6. 约束

- C-1 不得污染全局：禁止写 `~/.gradle`、`~/.android`、系统级 SDK 目录；一切通过项目内环境变量重定向。
- C-2 不引入前端打包器：保持「改完源码直接刷新即可验证」的开发体验，Capacitor 以原生桥注入方式工作。
- C-3 现有 PWA（GitHub Pages 在线版）必须继续可用，分页改造不得破坏桌面端与网页端。
- C-4 现有 CSS/JS 体量大且无模块化，改造必须**可回滚、可增量**。
- C-5 CI 不得因缺少签名密钥而整体失败（无密钥时降级产出可安装的 debug 签名包）。
- C-6 一次构建产物必须可复现：依赖锁定（`package-lock.json`）、版本号来自 git tag。

## 7. 假设

- A-1 主人使用 Android 7.0 及以上手机（minSdk 24），系统 WebView 可升级至 Chrome 108+。
- A-2 主人接受通过 GitHub Release 侧载安装（需在手机上允许「安装未知来源应用」）。
- A-3 允许在项目内新增 npm 依赖（Capacitor CLI 与官方插件），版本锁定后提交 lockfile。**实测**：Capacitor 最新为 8.6.0，要求 Node ≥22（本机 24.22.1 满足）；模板要求 compileSdk 36 / minSdk 24 / AGP 8.13.0 / Gradle 8.14.3 / JDK 21。
- A-4 允许我生成 release 签名密钥并写入仓库 secrets（**需主人明确授权，见 Q1**）。

## 8. 风险（按杀伤力排序）

| ID | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R-1 | 签名密钥丢失 | 后续版本无法覆盖升级，只能卸载重装且数据丢失 | 密钥双备份（项目内 `.signing/` + 主人自存）；release 说明中写明指纹 |
| R-2 | targetSdk 35 强制 edge-to-edge 导致 WebView 顶到状态栏/被手势条遮挡 | 首屏视觉错位，最容易被主人一眼判死 | 首版 targetSdk 34（规避强制 edge-to-edge），CSS 保留 safe-area 兜底，升 35 单独立项 |
| R-3 | 旧机 WebView 不支持 `dvh` / 可选链 | 布局塌陷或白屏 | minSdk 24 + `dvh` 必须有 `vh` 回退；发布说明标注 WebView 下限 |
| R-4 | 安卓 SDK / Gradle 依赖经代理下载失败或极慢 | 本地首次构建阻塞数小时 | aria2c 16 并发 + 镜像回退 + sha256 校验 + 断点续传；Gradle 走阿里云镜像（CI 关闭镜像开关） |
| R-5 | 分页改造破坏桌面端双栏布局 | 现有网页用户回归 | 分页仅在小屏断点启用；桌面端 `display` 保持原样；补结构测试 |
| R-6 | CI 绿但 APK 装不上（签名/对齐/资源缺失） | 主人端到端失败，等于没交付 | CI 内强制 `apksigner verify` + `aapt2 badging` + `unzip -l` 资源断言，产物附 SHA256 |
| R-7 | 系统字体放大/超大屏导致九宫格溢出 | 视觉破损 | 分页后单页信息量下降；字体缩放 1.3× 纳入自查清单 |

## 9. 成功信号

- S-1 主人在自己手机上安装 release APK，断网可正常起局、切页、查看克应。
- S-2 本地一条命令可产出可安装 APK；CI 打 tag 后 Release 页面出现 `qimen-vX.Y.Z.apk` + SHA256。
- S-3 项目根目录外无新增文件（`~/.gradle`、`~/.android` 不存在）。
- S-4 桌面浏览器打开 GitHub Pages 版，双栏布局与功能与改造前一致。

## 10. 未决问题（阻塞，需主人回答）

| ID | 问题 | 我的默认建议 |
|---|---|---|
| Q1 | 是否授权我生成 release keystore，并用已登录的 `gh` 把 4 项签名 secrets 写入 `hhx465453939/qimen`？ | 授权。否则 CI 只能产出 debug 签名包（能装、不能平滑升级） |
| Q2 | 分页切分：排盘（四柱+九宫+克应）/ 万年历 / 设局控制 / 案例格局，共 4 页？ | 按此执行 |
| Q3 | 应用标识：appId `io.github.hhx465453939.qimen`，显示名「奇门排盘」，首版 v1.0.0？ | 按此执行 |
| Q4 | 发布目标：`origin` = `hhx465453939/qimen` 的 `main` 分支与 Releases？ | 按此执行 |
