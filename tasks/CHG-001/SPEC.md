# CHG-001 · 工程规格（SPEC）

```yaml
change_id: CHG-001
version: 1
status: approved              # 主人 2026-10-20 明确授权（「不用我批准」），Q1–Q4 全按默认
prd_ref: PRD.md               # status: DRAFT（待批准）
health_ref: HEALTH.md
change_ref: CHANGE.md
supersedes: null
approved_by: 主人
approved_at: 2026-10-20
```

> **流程记录**：主人 2026-10-20 明确指示「不用我批准，赶紧干活」。据此 PRD v1 与 SPEC v1 视为批准，Q1–Q4 均按默认执行（已确认签名密钥可写 secrets）。commit/push 按主人原始授权自动执行；破坏性操作仍按门控询问。

---

## 1. 上下文、目标、非目标、约束、假设、未决问题

### 1.1 上下文
纯静态 PWA（无构建、无测试、无 CI），需封装为可侧载安卓应用，并把工具链、验证、发布全部放进项目内。

### 1.2 目标（对应 PRD G-1~G-5）
- 可安装、可覆盖升级、离线可用的 release APK。
- 手机 4 页分页，桌面不回归。
- 工具链零全局写入。
- 一条命令本地出包；打 tag 自动发布。
- 产物可验证（签名/包信息/资产/体积）。

### 1.3 非目标
见 PRD §4。特别声明：**本 CHG 不做设备级 E2E**（无 `/dev/kvm`），设备验证由主人在自己的手机上完成。

### 1.4 约束
- C-1 不写 `~/.gradle`、`~/.android`、系统 SDK。
- C-2 不引入前端打包器，保持 `<script>` 直载。
- C-3 网页版（GitHub Pages）不回归。
- C-4 分页改造可增量、可回滚。
- C-5 CI 缺签名密钥不得整体失败。
- C-6 依赖锁定 + 版本号来自 tag。

### 1.5 假设
- A-1 Android 7.0+（minSdk 24），WebView ≥ Chrome 108。
- A-2 允许 GitHub Release 侧载。
- A-3 允许新增 npm 依赖并提交 lockfile。
- A-4 签名密钥写入 secrets 需主人授权（Q1）。

### 1.6 未决问题（阻塞项）
| ID | 问题 | 默认 |
|---|---|---|
| Q1 | 授权生成 keystore 并写 4 项 secrets？ | 授权 |
| Q2 | 4 页切分方案确认？ | 确认 |
| Q3 | appId / 名称 / 首版版本号确认？ | `io.github.hhx465453939.qimen` / 奇门排盘 / v1.0.0 |
| Q4 | 发布到 `hhx465453939/qimen` main + Releases？ | 确认 |

---

## 2. 当前架构与债务影响

### 2.1 现状
```
index.html ──┬── css/style.css (5225 行, 11 断点)
             ├── js/database.js  (静态数据)
             ├── js/calendar.js  (历法/真太阳时)
             ├── js/qimen.js     (排盘/克应)
             └── js/app.js       (~4000 行, 全局函数, DOM 编排)
                     └── sw.js   (Cache-First PWA)
```

### 2.2 本 CHG 引入的结构
```
qimen/
├─ .toolchain/                 # 生成物，gitignore（JDK/SDK/GradleHome/npmCache/tmp）
├─ .signing/                   # 生成物，gitignore（keystore 备份）
├─ www/                        # 生成物，gitignore（Capacitor webDir）
├─ android/                    # 提交：Capacitor 原生工程源码（不含 build 产物）
├─ scripts/
│  ├─ toolchain/{env.sh,bootstrap.sh,verify-isolation.sh}
│  ├─ build-web.mjs            # 白名单拷贝 → www/
│  ├─ make-icons.py            # PIL 生成 launcher/adaptive/splash
│  ├─ version.mjs              # tag → versionName/versionCode
│  ├─ android-build.sh         # 统一本地构建入口
│  ├─ verify-apk.sh            # 产物四项校验（本地=CI 同一脚本）
│  ├─ gen-keystore.sh          # 生成密钥 + 打印 base64
│  └─ set-gh-secrets.sh        # gh secret set（需 Q1 授权后执行）
├─ js/mobile-pager.js          # 新增：分页引擎（独立、可单测）
├─ css/pager.css               # 新增：分页样式（后置覆盖）
├─ tests/                      # node:test + jsdom + playwright(pager 冒烟)
├─ tasks/CHG-001/*             # 本契约
├─ docs/ANDROID.md             # 构建/发版/密钥/排障
├─ package.json / package-lock.json
├─ capacitor.config.json
└─ .github/workflows/android-ci.yml
```

### 2.3 债务影响
| 债务 | 本 CHG 处置 |
|---|---|
| `.gitignore` 的 `*.png` 误伤安卓图标 | **修**（加 `!android/app/src/main/res/**/*.png`） |
| `app.js` God file | **不重构**；分页逻辑外置为 `js/mobile-pager.js`，`switchMobileTab` 仅做委托（2 处调用方，图谱已确认） |
| 无测试/无 CI | **建基线**：结构测试 + 分页行为测试 + 浏览器冒烟 + 产物校验 + CI |
| SW 在原生壳内缓存陈旧资源 | **修**：原生环境跳过注册；`www/` 不含 `sw.js` |
| `dvh` 缺 `vh` 回退 | **核查并补**（旧 WebView 布局塌陷风险） |

---

## 3. 选定设计与 ADR

### ADR-001 · 打包方案：Capacitor 8.6.0 原生外壳（选定，版本经 npm 实测）
**决定**：用 **Capacitor 8.6.0**（`@capacitor/core|cli|android` 8.6.0 + `@capacitor/app` 8.1.2）承载现有静态资源，资源打进 APK 的 `assets/public/`，WebView 以 `https://localhost` 加载。

> 只装 4 个包：`core`、`cli`(dev)、`android`、`app`（返回键必需）。**不装** `status-bar` / `splash-screen`：状态栏走 `styles.xml`，启动图走模板自带的 `androidx core-splashscreen` + `drawable/splash.png`，少一个依赖少一处失败面。

| 备选 | 否决理由 |
|---|---|
| 手写 WebView 壳 | 需自实现资源 scheme、返回键、insets、启动图，等价重造 Capacitor，缺陷面更大 |
| TWA（Trusted Web Activity） | 依赖线上站点与 Digital Asset Links，**不是离线应用**，断网体验不可控 |
| React Native / Flutter 重写 | 与「不改业务逻辑、最小风险」冲突，工作量与回归面数量级上升 |

**可逆性**：高。`android/` 与脚本可整体删除，网页版不受影响。
**后果**：引入 `node_modules`（gitignore）与 `npx cap sync` 步骤；换来成熟的返回键/状态栏/启动图能力。

### ADR-002 · 工具链位置：项目内 `.toolchain/`（选定）
**决定**：JDK 21（Temurin）、Android SDK、`GRADLE_USER_HOME`、`ANDROID_USER_HOME`、npm cache、TMPDIR 全部重定向到 `.toolchain/`。

| 备选 | 否决理由 |
|---|---|
| 系统级安装 | 直接违反「不外溢」约束 |
| Docker 构建 | 需 docker daemon 与外部镜像层，缓存与卷仍在项目外；本地/CI 一致性好但引入新前置依赖 |

**隔离清单（必须同时设置，缺一即漏）**：
`JAVA_HOME`、`ANDROID_HOME`、`ANDROID_SDK_ROOT`、`ANDROID_USER_HOME`、`ANDROID_SDK_HOME`(legacy)、`GRADLE_USER_HOME`、`npm_config_cache`、`TMPDIR`。

**验证**：`scripts/toolchain/verify-isolation.sh` 断言 `~/.gradle`、`~/.android` **不存在**，且所有工具路径位于项目根内；构建后再断言一次（AC-3.2）。

**可逆性**：极高（`rm -rf .toolchain`）。

### ADR-003 · 系统版本矩阵：minSdk 24 / targetSdk 34 / compileSdk 35（选定）
| 参数 | 值 | 理由 |
|---|---|---|
| minSdk | **24**（Android 7.0） | Capacitor 8 模板默认即 24；覆盖「绝大多数主流机型」，并保证 WebView 可达 Chrome 108+（`dvh`/可选链可用） |
| targetSdk | **34**（Android 14） | **显式覆盖模板默认值 36**：规避 Android 15+ 对 targetSdk≥35 的强制 edge-to-edge，首版优先视觉稳定；侧载分发不受 Play 政策约束 |
| compileSdk | **36** | Capacitor 8 模板要求（AGP 8.13.0） |

| 备选 | 否决理由 |
|---|---|
| targetSdk 35 | 强制 edge-to-edge，WebView 与状态栏/手势条重叠风险高，首版不值得 |
| minSdk 21/23 | 老机 WebView 无法升级，`dvh`/现代语法会白屏或塌陷 |

**后果/升级路径**：升 targetSdk 35 需单独 CHG（insets + edge-to-edge 实机验证）。

### ADR-004 · 分页实现：可见性分页引擎（选定）
**决定**：不改 DOM 树。新增 `js/mobile-pager.js` 作为「页面注册表 + 切换器」：
- 页映射：`pan` → `#leftPanel`（四柱+九宫+克应）；`cal`/`setting`/`cases` → `#rightPanel` 内仅显示对应 `.calendar-card`/`.controls-card`/`.cases-card`。
- ≤900px 启用：`body.pager-mode`，`#appMainContainer` 固定视口高度、`overflow:hidden`；当前页容器独立纵向滚动。
- 交互：底部导航点击、左右滑动（阈值 55px，横向主导，弹窗/横向滚动区内不触发）、`#/page` hash、`localStorage` 记忆、每页 scrollTop 记忆、180ms 过渡（尊重 `prefers-reduced-motion`）。
- 返回键：`handleBack()` → 弹窗开→关；非 `pan`→回 `pan`；否则交系统。
- 桌面 ≥901px：移除 `pager-mode`，清空分页写入的内联样式，恢复原双栏。

| 备选 | 否决理由 |
|---|---|
| 重排 DOM 为 scroll-snap 横向分页 | 需搬动 6 张卡片与两个栏容器，桌面布局需 `display:contents` 技巧，回归面大 |
| 拆成多个 HTML 页面 | 共享 JS 状态（排盘结果/设置/案例）跨页丢失，需引入状态持久化层，改动失控 |

**接口契约**（`window.QimenPager`）：
```js
{
  PAGES: ['pan','cal','setting','cases'],
  init(opts): void,            // { isModalOpen: () => bool, onAfterSwitch?: (page) => void }
  go(page, {animate=true, updateHash=true}): boolean,
  current(): string,
  handleBack(): 'handled' | 'exit',
  isMobile(): boolean,
  refresh(): void,             // 断点变化时重算
  destroy(): void
}
```
**集成点**：`js/app.js` 的 `switchMobileTab(tab)` 改为 `QimenPager.go(tab)`；保留原函数名（图谱确认 2 处调用）。

### ADR-005 · 签名：项目内生成 keystore + GitHub Secrets（选定，待 Q1 授权）
- `scripts/gen-keystore.sh`：`keytool -genkeypair`（RSA 2048 / 10000 天 / PKCS12），输出 `.signing/qimen-release.keystore`（gitignore），打印 base64 与指纹。
- `scripts/set-gh-secrets.sh`：`gh secret set ANDROID_KEYSTORE_BASE64|ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_ALIAS|ANDROID_KEY_PASSWORD -R hhx465453939/qimen`。
- Gradle：存在 `QIMEN_KEYSTORE_PATH` 时启用 release 签名，否则回落 `signingConfigs.debug`（保证 CI 不红）。
- Release notes 必须写明证书 SHA-256 指纹，便于主人核对「升级包同源」。

**备选**：仅 debug 签名（否决：无法平滑覆盖升级，且每次换机/清缓存风险高）；Play App Signing（不适用，不上架）。

### ADR-006 · 验证策略：三层（选定）
1. **结构/契约测试**（`node:test` + `jsdom`，快、稳、无浏览器）：
   - index.html 可解析、id 唯一、4 页选择器存在、所有本地 `script/link/img` 引用存在。
   - `mobile-pager.js` 纯逻辑单测：切页、hash、scroll 记忆、返回优先级、桌面禁用。
   - 契约断言：`app.js` 内含 `QimenPager` 委托、SW 注册受原生判断保护。
2. **浏览器冒烟**（Playwright + chromium，项目内 `PLAYWRIGHT_BROWSERS_PATH`）：
   - 390×844：4 页互斥、点击切页、无横向溢出、九宫格在视口内。
   - 1280×900：双栏可见、无卡片被隐藏。
   - 阻断式（非 `continue-on-error`），仅 4 条断言，控制抖动。
3. **产物校验**（`scripts/verify-apk.sh`，本地/CI 同一脚本）：
   - `apksigner verify --print-certs`（签名与指纹）
   - `aapt2 dump badging`（包名/版本/minSdk/targetSdk/label/icon）
   - `unzip -l`（`assets/public/**` 白名单存在、`sw.js` 不存在、图标存在）
   - 体积阈值（≤15MB）+ SHA256 输出

> **诚实边界**：以上均非「真机安装验证」。真机 E2E 由主人执行；交付报告必须按此措辞。

### ADR-007 · 权限最小化：release 不申请 INTERNET（选定）
- Capacitor 模板**自带** `android.permission.INTERNET`，需**显式移除**（本地资源无需网络），并在 `verify-apk.sh` 中断言不存在。
- 若未来启用 live-reload，仅在 `src/debug/AndroidManifest.xml` 叠加（本 CHG 不启用）。
- **后果**：AC-1.5「飞行模式可用」由「无网络权限」强保证。

### ADR-008 · 仓库镜像策略：本地阿里云优先，CI 官方源（选定）
- `android/settings.gradle` 与 `android/build.gradle` 增加受 `-PuseAliyunMirrors` 控制的仓库前缀（默认 `true` 本地，CI 传 `false`）。
- 镜像缺失时按顺序回落 `google()`/`mavenCentral()`，不改变解析结果。
- 代理**只**写入 `.toolchain/gradle-home/gradle.properties`（生成物），绝不写入提交的 `android/gradle.properties`。

### ADR-009 · 版本锁定（2026-10-20 npm/仓库实测，非推测）

| 组件 | 锁定值 | 实测依据 |
|---|---|---|
| `@capacitor/cli` | 8.6.0 | `npm view` → engines `node >=22`（本机 Node 24.22.1 满足） |
| `@capacitor/core` / `android` | 8.6.0 | `npm view` |
| `@capacitor/app` | 8.1.2 | `npm view`（插件独立版本号） |
| AGP | 8.13.0 | `@capacitor/cli@8.6.0` 内置模板 `build.gradle` |
| Gradle | 8.14.3 | 同上模板 `gradle-wrapper.properties` |
| minSdk / compileSdk | 24 / 36 | 同上模板 `variables.gradle` |
| targetSdk | 34（覆盖 36） | 本 CHG 决策，见 ADR-003 |
| androidx.webkit | 1.14.0 | 同上模板 |
| JDK | Temurin **21.0.13+9**（198.2 MB） | Adoptium API 实测可下载 |
| Android SDK | `cmdline-tools;latest` + `platform-tools` + `platforms;android-36` + `build-tools;36.0.0` | `dl.google.com` 仓库 XML 实测存在 |

**落地约束**：`package.json` 全部写**精确版本**（不带 `^`/`~`），提交 `package-lock.json`；Gradle/AGP 版本以模板 wrapper 为准，不擅自升级。实现时若 npm 解析出与上表不同的版本，必须在 `dist/toolchain-report.txt` 记录并在交付报告中说明。

---

## 4. 接口、数据、安全、兼容、迁移、观测、发布、回滚

### 4.1 接口
- 原生↔Web：Capacitor 注入 `window.Capacitor`；仅使用 `App.addListener('backButton')`、`StatusBar`（配置式）、`SplashScreen`（配置式）。
- 构建：`npm run setup | test | build:web | android:debug | android:release | verify:apk`。
- 环境变量契约（构建期）：
  `QIMEN_VERSION_NAME`、`QIMEN_VERSION_CODE`、`QIMEN_KEYSTORE_PATH`、`QIMEN_KEYSTORE_PASSWORD`、`QIMEN_KEY_ALIAS`、`QIMEN_KEY_PASSWORD`。

### 4.2 数据
- 无服务端数据。用户数据仍在 WebView `localStorage`（`qimen.*` 键）。
- **兼容性要求**：`androidScheme: "https"` 保证 origin 稳定（`https://localhost`），升级不丢设置/案例。
- 不新增数据迁移；不改既有 localStorage key。

### 4.3 安全
- 签名密钥：仅存在于 `.signing/`（gitignore）与 GitHub Secrets；**不得**进入提交历史（提交前 `git diff --cached` 白名单核对 + `git log -S` 自查）。
- 无网络权限 → 无数据传输面。
- `webContentsDebuggingEnabled` 仅 debug 构建为 true。
- CI 最小权限：`release` job 仅 `contents: write`。

### 4.4 兼容性
- 网页版：分页仅在 ≤900px 生效且由 `QimenPager.isMobile()` 判定；桌面行为不变。
- PWA：`sw.js` 资源版本号提升，避免旧缓存。
- 旧 WebView：`dvh` 必须有 `vh` 前置回退（M4 检查项）。

### 4.5 迁移
- 从 PWA 主屏快捷方式 → APK：localStorage 不共享（不同 origin），**已知限制**，需在 release notes 说明（案例可在网页版导出？当前无导出功能 → 明确告知不可避免）。

### 4.6 观测
- 构建日志 `dist/build-latest.log`；产物报告 `dist/apk-report.json`（badging/签名/资产/体积/SHA256）。
- CI：Job Summary 输出同一份报告；失败时打印最后 80 行 Gradle 错误。
- 应用内：保留既有 `console` 输出；debug 构建可远程调试。

### 4.7 发布（Rollout）
1. 本地 `npm run android:release` 出包 → `verify:apk` 全绿。
2. commit + push `main` → CI 绿。
3. `git tag v1.0.0 && git push origin v1.0.0` → CI 发布 Release（APK + SHA256SUMS + notes）。
4. 主人下载安装验证。
5. 若失败：删除该 Release（需授权）→ 打 patch tag 重发。

### 4.8 回滚
| 层 | 回滚动作 | 影响 |
|---|---|---|
| Web/分页 | `git revert <commit>`，网页即时恢复；APP 需重发版 | 无数据影响 |
| 原生壳/CI | revert 对应 CHG 提交 | 无 |
| 工具链 | `rm -rf .toolchain` | 无（可重建） |
| 已发布 APK | 发布上一版本 tag 的 APK 为 `-rollback` 资产；用户覆盖安装（同签名） | 需 versionCode 更高或同版本重装 |

---

## 5. 里程碑（依赖顺序、独占文件、验收、检查、风险、回滚）

> **独占文件清单**：本 CHG 声明对下列路径的写权限；当前工作区干净（`git status` 空），无其他 agent 在途改动。
> `.gitignore`、`package.json`、`package-lock.json`、`capacitor.config.json`、`www/**`(生成)、`scripts/**`、`tests/**`、`js/mobile-pager.js`、`css/pager.css`、`js/app.js`(仅 3 处：SW 守卫/分页委托/原生 class)、`index.html`(仅 script/link 注入 + 页面语义属性)、`sw.js`(版本号)、`android/**`、`.github/workflows/android-ci.yml`、`docs/ANDROID.md`、`README.md`、`tasks/CHG-001/**`、`.signing/**`(生成)、`.toolchain/**`(生成)、`dist/**`(生成)

### M1 · 项目内工具链（无业务改动）
- **文件**：`scripts/toolchain/{env.sh,bootstrap.sh,verify-isolation.sh}`、`.gitignore`
- **内容**：JDK 21 + `cmdline-tools;latest` + `platform-tools` + `platforms;android-36` + `build-tools;36.0.0`；下载走 aria2c 16 并发 + 镜像回退 + sha256；自动接受 licenses；全部重定向。
- **验收**：`bash scripts/toolchain/bootstrap.sh` 成功；`java -version` 为 21；`sdkmanager --list_installed` 含三件套；`~/.gradle`/`~/.android` 不存在。
- **检查**：`verify-isolation.sh` 非零退出即失败；记录各组件版本到 `dist/toolchain-report.txt`。
- **风险**：R-4 下载失败 → 镜像列表（dl.google.com / tencent / huawei）+ 断点续传 + 明确错误提示。
- **回滚**：`rm -rf .toolchain`。

### M2 · Capacitor 外壳与资源管线
- **文件**：`package.json`、`capacitor.config.json`、`scripts/build-web.mjs`、`scripts/make-icons.py`、`android/**`、`.gitignore`、`index.html`(仅 script 注入)
- **内容**：`webDir: www`；白名单拷贝（排除 `sw.js`）；`cap add android`；appId/名称/版本矩阵；图标与启动图生成；adaptive icon；`.gitignore` 补 PNG 放行。
- **验收**：`npm run build:web && npx cap sync android` 成功；`android/app/src/main/assets/public/` 资产齐全；`res/` 图标齐全；`git check-ignore` 确认图标**不**被忽略。
- **检查**：`scripts/verify-web-refs.mjs`（所有引用可解析）+ 资产白名单断言。
- **风险**：Capacitor 版本漂移 → lockfile 锁定，SPEC 实现记录回填实际版本。
- **回滚**：删除 `android/`、`www/`、`package*.json`、`capacitor.config.json`。

### M3 · 本地可安装构建
- **文件**：`scripts/version.mjs`、`scripts/android-build.sh`、`scripts/verify-apk.sh`、`android/app/build.gradle`(版本/签名)、`android/app/src/main/AndroidManifest.xml`(权限/label)
- **内容**：debug 与 release 两条路径；无密钥回落 debug 签名；产物校验四项。
- **验收**：`npm run android:release` 产出 `dist/qimen-v1.0.0.apk`；`verify:apk` 全绿（含「无 INTERNET 权限」断言）。
- **检查**：同一脚本在本地与 CI 运行，输出 `dist/apk-report.json`。
- **风险**：AGP/Gradle 版本不匹配 → 以 Capacitor 模板为准，不擅自升级。
- **回滚**：还原三个脚本与 build.gradle 片段。

### M4 · 手机分页（核心交互）
- **文件**：`js/mobile-pager.js`(新)、`css/pager.css`(新)、`index.html`(script/link + `data-page`)、`js/app.js`(3 处)、`sw.js`(版本号)
- **内容**：ADR-004 全量行为；补 `dvh` 的 `vh` 回退；SW 原生守卫；返回键接入。
- **验收**：AC-2.1~2.7 在 jsdom + Playwright 下全部通过。
- **检查**：`npm test`（结构/行为）+ `npm run test:e2e`（浏览器冒烟）。
- **风险**：R-5 桌面回归 → Playwright 1280×900 断言 + 桌面样式零改动（仅在 `@media (max-width:900px)` 内生效）。
- **回滚**：删除两个新文件 + 还原 app.js/index.html 三处注入点（单 commit，可一键 revert）。

### M5 · CI/CD 与发布
- **文件**：`.github/workflows/android-ci.yml`、`scripts/gen-keystore.sh`、`scripts/set-gh-secrets.sh`、`docs/ANDROID.md`、`README.md`
- **内容**：jobs `web` → `android` → `release`(tag)；版本注入；签名解码；Gradle 缓存；`-PuseAliyunMirrors=false`；Release notes 模板。
- **验收**：push main 全绿；打 `v1.0.0` 后 Release 出现 APK + SHA256；无 secrets 分支也能绿。
- **检查**：CI 日志 + Release 页面 + 下载后本地 `verify-apk.sh` 复核。
- **风险**：R-6 假绿 → 强制 `verify-apk.sh` 在 CI 内阻断。
- **回滚**：删除 workflow；已发 Release 保留（删除需授权）。

### M6 · 文档与交接
- **文件**：`docs/ANDROID.md`、`README.md`、`tasks/CHG-001/TRACEABILITY.md`
- **内容**：构建、发版、密钥备份、排障表、已知限制（PWA 数据不迁移、targetSdk 34、WebView 下限）、主人 E2E 清单。
- **验收**：新人/新会话照文档可在 20 分钟内出包。

### M7 · 发布与通知
- **动作**：tag `v1.0.0` → 等 CI → 下载 Release APK 复核 → 汇报（含 Release 链接、SHA256、指纹、E2E 清单）。
- **注意**：不宣称「真机验证通过」。

---

## 6. Definition of Ready / Done

### DOR
- [x] HEALTH 实测完成
- [x] 范围/AC 可判定
- [ ] PRD v1 获批准
- [ ] SPEC v1 获批准
- [ ] Q1–Q4 答复
- [ ] 授权边界确认（commit/push 自动；secrets 单独授权）

### DOD
- [ ] AC-1.1~AC-5.3 逐条有证据（命令输出/文件/链接）
- [ ] `npm test` + `npm run test:e2e` 绿
- [ ] `verify:apk` 绿，报告归档 `dist/apk-report.json`
- [ ] CI push 绿 + tag Release 可下载
- [ ] 桌面网页版回归绿
- [ ] `~/.gradle` / `~/.android` 不存在
- [ ] 文档齐备（含密钥备份与已知限制）
- [ ] 交付措辞如实（静态校验 ≠ 真机验证）

---

## 7. 评审与交付门

| Gate | 判定 | 谁 | 失败处理 |
|---|---|---|---|
| G0 · PRD 批准 | PRD status=approved | 主人 | 回到 PRD 补 |
| G1 · SPEC 批准 | SPEC status=approved + version 记录 | 主人 | 修订后重审 |
| G2 · 工具链隔离 | `verify-isolation.sh` 绿 | 我 | 修脚本，不放行 |
| G3 · 本地产物 | `verify:apk` 绿 | 我 | 修构建，不 tag |
| G4 · 测试 | 单测+冒烟绿 | 我 | 修实现，不 push |
| G5 · CI | main 绿 | CI | 修 workflow，不 tag |
| G6 · Release | tag 后资产可下载且校验一致 | 我 | 修 CI / 重发 patch |
| G7 · 设备 E2E | 主人手机安装可用 | 主人 | 按回报修 bug，出新 patch |

**授权边界**：
- ✅ 已授权（主人原话「开发测试commitpush全自动执行」）：`git add <显式文件>`、`commit`、`push origin main`、推 tag。
- ⚠️ 需单独明确授权：写仓库 secrets（Q1）、删除/覆盖已发布 Release、force push、改仓库设置。
- ❌ 永不做：`git add -A/.*`、提交密钥、跳过校验宣布通过。

---

## 8. 可追溯性与证据计划

见 `TRACEABILITY.md`：PRD 需求 → AC → 里程碑 → 验证命令 → 证据位置。

**证据类型**：
- `E-CMD`：命令 + 退出码 + 关键输出（贴报告，不贴全文）
- `E-FILE`：产物路径 + 大小 + SHA256
- `E-CI`：run 链接 + job 结论
- `E-REL`：Release URL + 资产清单

**反假绿规则**：任何「绿」必须能追到上面四类证据之一；无证据即视为未验证。

---

## 9. 实现记录（偏差与修正，如实登记）

> 本节记录实现阶段与草案的差异及根因，供后续维护与下一次 CHG 参考。

| # | 偏差/问题 | 根因 | 处理 |
|---|---|---|---|
| D-1 | Capacitor 用 **8.6.0**（草案写 7） | 实测 npm 最新为 8.6.0，要求 Node ≥22（本机 24.22.1 满足）；模板 template 要求 minSdk 24 / compileSdk 36 / AGP 8.13.0 / Gradle 8.14.3 | 按实测锁定；targetSdk 仍按 ADR-003 覆盖为 34 |
| D-2 | 工具链隔离变量冲突 | 同时设置 `ANDROID_SDK_HOME` 与 `ANDROID_USER_HOME` 会被 AGP 8.13 判定为「多个路径指向 Preferences」并直接构建失败 | 仅保留 `ANDROID_USER_HOME`，删除旧变量 |
| D-3 | Gradle `buildscript` 闭包读不到脚本内 `def` 变量 | Gradle 对 `buildscript {}` 单独编译求值，局部变量不参与闭包捕获 | 镜像开关改用 `System.getenv('QIMEN_USE_ALIYUN_MIRRORS')` |
| D-4 | `versionCode (expr).toInteger()` 报 `Value is null` | Groovy 命令链解析歧义，把带空格括号当成方法链 | 先算局部变量，再用 `versionCode = ...` 显式赋值 |
| D-5 | 产物校验误报 3 项 | ① 新版 aapt2 输出 `minSdkVersion:'24'` ② `apksigner --print-certs` 无 `verified` 字样 ③ AGP release 会压缩 `res/` 路径，`res/mipmap-*/ic_launcher.png` 不存在 | 逐条按真实输出修正：兼容两种 sdk 字段；改用 `--verbose` 的 `Verifies` + 返回码；改校验 badging 引用图标真实存在且 PNG 数量达标 |
| D-6 | 本机 Playwright 无法安装 chromium | 本机 Ubuntu 20.04，Playwright 1.65 已不支持该平台 | 本机用既有 `chromium-1200`（`QIMEN_CHROMIUM_PATH` 注入）；CI 用 ubuntu-latest 官方安装 |
| D-7 | Playwright 本地服务探测超时 | 本机全局 `http_proxy` 把 `127.0.0.1` 也代理了（实测 503） | `env.sh` 固化 `no_proxy=localhost,127.0.0.1,::1` |
| D-8 | 网页版会拿到旧缓存（缺 pager.css / mobile-pager.js） | `sw.js` 采用 Cache-First 且缓存版本未提升 | `CACHE_NAME` 升至 `qimen-m3-v97`，缓存清单补入两个新资源 |
| D-9 | 启动图标与状态栏需与 M3 主色一致 | 模板默认 `ic_launcher_background=#FFFFFF`，状态栏未配置 | 背景改 `#2355C4`；`styles.xml` 设 statusBar/navigationBar 颜色与 splash 主题 |

### 9.1 实测结论（本轮证据）

| 项 | 结果 |
|---|---|
| 工具链隔离 | `~/.gradle`、`~/.android` 均不存在；JDK 21 / Android SDK 均在 `.toolchain/`（JDK 346M、SDK 488M） |
| 单元/结构测试 | 12/12 通过 |
| 浏览器冒烟 | 6/6 通过（移动 390×844、桌面 1280×900） |
| APK 产物校验 | 22/22 通过；3 MB；包名/版本/minSdk 24/targetSdk 34/label 均符合 |
| 签名 | v2 方案通过；证书 SHA-256 `00d5e049…86cae`（完整值见 `dist/apk-report.json`） |
| 权限 | 未申请 INTERNET |
| sw.js | 未打入 APK |

**仍未验证（按要求如实标注）**：真机安装与运行。本机无 `/dev/kvm`，无法做设备级 E2E；该项由主人在自己手机上完成。
