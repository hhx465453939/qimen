# CHG-001 · 追溯矩阵（TRACEABILITY）

状态：草案（随 PRD/SPEC 批准后定稿）
原则：每条验收标准必须有**可执行命令**与**证据类型**；无证据 = 未验证。

## 1. 需求 → 契约 → 里程碑 → 验证

| PRD 需求 | 验收标准 | SPEC 章节 | 里程碑 | 验证方式（命令/检查） | 证据 |
|---|---|---|---|---|---|
| US-1 安装与启动 | AC-1.1 APK+SHA256 资产 | §4.7 / ADR-005 | M5, M7 | Release 页面清单；`sha256sum -c` | E-REL, E-FILE |
| | AC-1.2 签名/包信息正确 | ADR-003/005 | M3, M5 | `bash scripts/verify-apk.sh`（apksigner + aapt2 badging） | E-CMD, E-FILE(`dist/apk-report.json`) |
| | AC-1.3 资源齐全、无 sw.js | ADR-001/004 | M2, M3 | `unzip -l` 白名单断言（verify-apk.sh） | E-CMD |
| | AC-1.4 启动无白屏/无异常 | ADR-001/004 | M4, M6 | Playwright 打开 index.html 断言无 console error、无 404 | E-CMD |
| | AC-1.5 飞行模式可用 | ADR-007 | M3 | `aapt2 dump badging` 断言无 INTERNET 权限 | E-CMD |
| US-2 手机分页 | AC-2.1 四页互斥 | ADR-004 | M4 | `tests/pager.test.mjs`（jsdom）+ Playwright 390×844 可见性断言 | E-CMD |
| | AC-2.2 导航切页 + active | ADR-004 | M4 | 同上 + `switchMobileTab` 委托契约断言 | E-CMD |
| | AC-2.3 滑动切页与抑制条件 | ADR-004 | M4 | pager 单测：滑动阈值/弹窗/横向区；Playwright 手势模拟 | E-CMD |
| | AC-2.4 独立滚动与位置恢复 | ADR-004 | M4 | pager 单测（scrollTop 记忆） | E-CMD |
| | AC-2.5 返回键优先级 | ADR-004 | M4 | pager 单测 `handleBack()` 三态 | E-CMD |
| | AC-2.6 冷启动恢复 + hash | ADR-004 | M4 | pager 单测（localStorage + `#/page`） | E-CMD |
| | AC-2.7 桌面不回归 | ADR-004 | M4 | Playwright 1280×900：双栏可见、无隐藏、无横向位移 | E-CMD |
| US-3 环境自包含 | AC-3.1 工具链就位 | ADR-002 | M1 | `bootstrap.sh` + `sdkmanager --list_installed` | E-CMD(`dist/toolchain-report.txt`) |
| | AC-3.2 零全局写入 | ADR-002 | M1, M3 | `verify-isolation.sh` 构建前后各一次 | E-CMD |
| | AC-3.3 删除工具链后可恢复 | ADR-002 | M1 | `rm -rf .toolchain` 后 `git status --porcelain` 为空 | E-CMD |
| | AC-3.4 ignore 规则正确 | §2.3 债务 | M2 | `git check-ignore -v` 对图标返回非忽略 | E-CMD |
| US-4 流水线 | AC-4.1 push 全链路 | §4.7 | M5 | GitHub Actions run 结论 | E-CI |
| | AC-4.2 tag 自动发布 | §4.7 | M5, M7 | Release 页面 + 资产 | E-REL |
| | AC-4.3 无密钥不红 | ADR-005 | M5 | 临时移除 secrets 的 workflow_dispatch 演练 | E-CI |
| | AC-4.4 版本来自 tag | §4.1 | M3, M5 | `aapt2 badging` 比对 tag | E-CMD |
| | AC-4.5 重复 tag 幂等/明确失败 | §4.7 | M5 | 重跑 release job 观察行为 | E-CI |
| US-5 质量门禁 | AC-5.1 测试全绿 | ADR-006 | M4 | `npm test`（结构+行为）、`npm run test:e2e` | E-CMD |
| | AC-5.2 产物四项校验 | ADR-006 | M3 | `npm run verify:apk` | E-CMD/E-FILE |
| | AC-5.3 发布前自查 | §6 DOD | M6/M7 | DOD 清单逐项勾选并附证据 | E-FILE |

## 2. 关键风险 → 检查点

| 风险 | 检查点 | 阻断条件 |
|---|---|---|
| R-1 密钥丢失 | 交付时给出指纹 + `.signing/` 备份路径 + 主人自存提示 | 未备份则不得 tag |
| R-2 edge-to-edge | 断言 targetSdk=34；CSS safe-area 保留 | targetSdk≠34 需说明 |
| R-3 旧 WebView | 检查 `dvh` 前有 `vh` 回退；minSdk=24 | 缺回退即修 |
| R-4 下载失败 | bootstrap 失败信息含镜像/代理/重试指引 | 无指引即修 |
| R-5 桌面回归 | Playwright 1280×900 断言 | 任一隐藏即阻断 |
| R-6 假绿 | CI 内必须执行 verify-apk.sh，且输出报告 | 缺校验步骤即阻断 |
| R-7 字体缩放 | 自查清单含 1.3× 缩放检查（截图/手动） | 主人 E2E 项，交付时明确列出 |

## 3. 证据登记（实现阶段已回填）

| 证据 ID | 内容 | 位置 | 状态 |
|---|---|---|---|
| E-CMD-001 | 工具链隔离报告：JDK 21.0.13 + `platforms;android-36` + `build-tools;36.0.0`；`~/.gradle`、`~/.android` 均不存在 | `dist/toolchain-report.txt` | ✅ 已产出 |
| E-CMD-002 | 单元/结构测试 12/12 通过 | `npm test` 输出 | ✅ 已通过 |
| E-CMD-003 | 浏览器冒烟 6/6 通过（移动 390×844 + 桌面 1280×900） | `npx playwright test` 输出 | ✅ 已通过 |
| E-CMD-004 | 发布产物 22/22 项校验通过（从 Release 重新下载后复核） | `dist/apk-report.json` | ✅ 已通过 |
| E-CMD-005 | 全局残留收容：造出残留 → guard 收容 → `~/.android` 清空；含 avd/adbkey/白名单外文件时只告警不动手 | `scripts/toolchain/global-leak-guard.sh` | ✅ 已通过 |
| E-CI-003 | 收容修复后 main CI 全绿 | https://github.com/hhx465453939/qimen/actions/runs/42335598722 | ✅ success |
| E-CI-001 | main 分支 CI 全绿（web + android） | https://github.com/hhx465453939/qimen/actions/runs/42331165527 | ✅ success |
| E-CI-002 | v1.0.0 tag CI 全绿（含 release job） | https://github.com/hhx465453939/qimen/actions/runs/42331795798 | ✅ success |
| E-REL-001 | GitHub Release v1.0.0 | https://github.com/hhx465453939/qimen/releases/tag/v1.0.0 | ✅ 已发布 |
| E-FILE-001 | `qimen-v1.0.0.apk`：3,458,362 字节；SHA256 `047168aa99092e00513d21990fe6266a52704730d8ab3bff7bc5b4f0b6772d01` | Release 资产 + `SHA256SUMS.txt` | ✅ 已校验 |
| E-FILE-002 | 签名证书 SHA-256 `00d5e0497baf16d7b998123ad5e0494351ac872f4ff1c0cc1937c93792386cae`（v2 签名方案） | `apksigner verify --print-certs` | ✅ 与本地构建同源 |

### 3.1 关于「本地构建 vs CI 构建」字节不一致的说明

本地构建的 SHA256 为 `eb484e55…`，CI 产物为 `047168aa…`。
**这是预期行为**：APK 内含构建时间戳等非确定性元数据，且由不同机器、不同 Gradle 缓存状态构建。
两者**签名证书完全相同**（同一 keystore），可互相覆盖安装；`versionName`/`versionCode`/`minSdk`/`targetSdk` 完全一致，已逐项校验。
若需字节级可复现，需额外开启 reproducible build 并对齐 zip 时间戳，不在本 CHG 范围内。

### 3.2 未完成/未验证项（如实登记）

| 项 | 原因 | 责任方 |
|---|---|---|
| 真机安装与运行 | 本机无 `/dev/kvm`，无法运行模拟器；Playwright 只能验证浏览器渲染 | 主人设备端 E2E（清单见 `docs/ANDROID.md` §7） |
| Android 15/16 的 edge-to-edge 视觉 | 首版 targetSdk 34 已规避强制贴边 | 若后续升 35/36 需另行验证 |
| 旧机 WebView（< Chrome 108） | minSdk 24 机型 WebView 可升级，但未实机覆盖 | 建议随 E2E 顺带确认 |
| 重复 tag 的幂等行为 | 采用 `gh release create --verify-tag`，已存在 Release 时会明确报错而非静默覆盖 | 设计行为，已记录 |
