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

## 3. 证据登记（实现阶段回填）

| 证据 ID | 内容 | 位置 | 状态 |
|---|---|---|---|
| E-CMD-001 | 工具链隔离报告 | `dist/toolchain-report.txt` | 待生成 |
| E-CMD-002 | APK 校验报告 | `dist/apk-report.json` | 待生成 |
| E-CMD-003 | 单测与冒烟输出 | `dist/test-report.txt` | 待生成 |
| E-CI-001 | main 分支 CI run | GitHub Actions URL | 待生成 |
| E-REL-001 | v1.0.0 Release | GitHub Release URL | 待生成 |
| E-FILE-001 | APK SHA256 | `SHA256SUMS.txt` | 待生成 |
