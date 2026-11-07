# CHG-001 · 项目健康基线（HEALTH）

采集时间：2026-10-20 · 采集方式：知识图谱索引 + 环境实测（非文档转述）

## 1. 工程能力现状

| 维度 | 现状 | 结论 |
|---|---|---|
| 构建 | 无 `package.json`、无构建脚本，纯静态文件直接运行 | **缺失**，需新建（仅用于安卓封装与测试，不改前端运行方式） |
| 测试 | 0 个测试文件 | **缺失**，需新建 |
| Lint | 无 ESLint/Prettier 配置 | **缺失**，本 CHG 以 `node --check` + 自定义静态断言替代，不引入重型配置 |
| CI/CD | 无 `.github/` | **缺失**，需新建 |
| 依赖管理 | 无依赖声明（纯手写 JS） | 无供应链风险，但也无锁定；新增 npm 依赖必须提交 lockfile |
| 文档 | `README.md` 面向终端用户（PWA 安装/本地运行） | 缺开发者构建文档，需补 |

## 2. 代码结构（知识图谱，539 节点 / 1015 边）

| 文件 | 角色 | 规模 |
|---|---|---|
| `index.html` | 单页骨架 + 7 个 dialog | 1210 行 |
| `js/app.js` | 全部交互编排（渲染/弹窗/存储/事件） | ~4000+ 行，热点集中 |
| `js/qimen.js` | 排盘核心（宫位、星门神、克应判定） | 业务核心 |
| `js/calendar.js` | 天文历法、真太阳时、干支 | 业务核心 |
| `js/database.js` | 静态数据表 | 数据 |
| `css/style.css` | 全部样式 | 5225 行，11 个断点 |

架构分层：`app`（入口，出度 16）→ `qimen` / `calendar`（核心，高扇入）。边界清晰，但 `app.js` 是单片巨文件（God file），是本项目最大结构性债务。

热点（fan-in）：`showToast`(23)、`executePaipan`(15)、`openModal`/`renderNinePalaces`(9)。

## 3. 移动端适配现状（决定分页改造难度）

- 已有：`viewport-fit=cover`、8 处 `env(safe-area-inset-*)`、`@media` 覆盖 440/600/900/960px 四档。
- 已有：底部导航 `#m3MobileNav`（4 tab）+ `switchMobileTab()`。
- **缺**：`switchMobileTab` 只是「显隐切换」——`pan` 显示左栏、`cal/setting/cases` 显示右栏对应卡片；**没有**单页视口、页面级独立滚动、滑动切换、返回键语义、页面位置持久化。
- **缺**：`pan` 页仍是「四柱 + 九宫 + 克应」三卡长滚动。

结论：分页改造属于**在既有显隐机制上补齐页面语义**，不需要重排 DOM 结构，风险可控。

## 4. 运行时/宿主环境实测

| 项 | 实测值 | 影响 |
|---|---|---|
| CPU / 内存 | 20 核 / 256G（可用 230G） | 并行构建无压力 |
| 磁盘 | `/home` 可用 115G | 工具链约 2–3G，充足 |
| JDK | 系统仅 OpenJDK **11**，无 `javac` | **不满足** Capacitor 8 模板（AGP **8.13.0** 需 JDK 17+，实际用 21）→ 必须项目内自带 JDK 21（Temurin 21.0.13+9 实测可下载，198MB） |
| npm 依赖可用性 | `@capacitor/cli` 最新 **8.6.0**（engines `node >=22`，本机 24.22.1 满足）；`core`/`android` 8.6.0；`app` 8.1.2 | 版本链可落地；已写入 SPEC §ADR-009 锁定表 |
| Android SDK 包 | 仓库 XML 实测存在 `platforms;android-36`、`build-tools;36.0.0`、`cmdline-tools;latest`、`platform-tools` | compileSdk 36 方案可行 |
| Gradle | 未安装 | 用项目内 Gradle Wrapper |
| Android SDK | 未安装，无 `adb`/`sdkmanager` | 必须项目内安装 |
| Node / npm / pnpm | v24.22.1 / 11.19.1 / 11.15.1 | 可直接用（不新装，不算外溢） |
| Python + Pillow | 3.x + PIL 10.0.1 | 可用于生成启动图标与自适应图标 |
| aria2c | 已安装 | 大文件 16 并发下载 |
| gh CLI | 2.100.0，已登录 `hhx465453939`，scope 含 `repo` `workflow` | 可推送、可写 secrets、可建 Release |
| 代理 | 环境变量 `http_proxy=127.0.0.1:10940`；实测 dl.google.com / github / services.gradle.org / adoptium 均 200 | 下载可行；`7890` 端口在监听但实测超时，**不要用 7890** |
| 硬件虚拟化 | **无 `/dev/kvm`** | 无法跑安卓模拟器 → 本机不做设备级 E2E |
| `~/.gradle` / `~/.android` | 均不存在 | 基线干净，可验证「零外溢」 |

## 5. 技术债务分类

| 债务 | 归属 | 处置 |
|---|---|---|
| `.gitignore` 的 `*.png` 会忽略 Android 图标资源 | **本变更必须修**（否则 release 无图标） | CHG-001 内修 |
| `app.js` 单文件 4000+ 行 | 变更前既有 | 不在本 CHG 重构；分页逻辑抽为独立文件 `js/mobile-pager.js`，避免继续膨胀 |
| 无测试/无 CI | 变更前既有 | CHG-001 建立最小可用基线（结构 + 行为测试、构建流水线） |
| 无 lint | 变更前既有 | 本 CHG 不引入 ESLint（避免依赖膨胀），以语法检查 + 断言替代；留作后续 CHG |
| `sw.js` 在原生壳内会缓存陈旧资源 | **本变更必须处理** | 原生环境禁用 SW 注册 |
| `dvh` 有使用但缺 `vh` 回退（旧 WebView） | 本变更内核查 | CHG-001 内核查补齐 |

## 6. 健康结论

- 前端资产完整、无外部运行时依赖 → **打包可行性高**。
- 工程化能力为零 → 本 CHG 的主要工作量在「工具链 + 流水线 + 验证」，而非业务代码。
- 本机无法做设备级验证 → **必须**用「静态产物校验 + 结构/行为测试 + 主人设备 E2E」三段式替代，且不能把静态校验说成「装机验证通过」。
