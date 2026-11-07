# Android 构建与发版手册（CHG-001）

> 本项目所有安卓工具链都在仓库内 `.toolchain/`，**不写全局环境**。
> 验证方式：`bash scripts/toolchain/verify-isolation.sh` 会断言 `~/.gradle`、`~/.android` 不存在。

## 1. 首次准备（约 5–15 分钟，取决于网速）

```bash
cd <repo>
npm install                 # Capacitor CLI + 测试依赖
npm run setup               # 下载 JDK 21 + Android SDK（全部落到 .toolchain/）
npm run gen:keystore        # 生成 release 签名密钥（.signing/，不进 git）
```

`npm run setup` 做四件事：

1. 装 Temurin JDK 21 到 `.toolchain/jdk21`
2. 装 cmdline-tools 到 `.toolchain/android-sdk/cmdline-tools/latest`
3. 装 `platform-tools`、`platforms;android-36`、`build-tools;36.0.0`
4. 自动探测可用代理并写进 `.toolchain/gradle-home/gradle.properties`

## 2. 日常命令

| 命令 | 作用 |
|---|---|
| `npm run build:web` | 把静态资源按白名单复制到 `www/`（排除 `sw.js`） |
| `npm test` | 结构 + 分页行为测试（jsdom，12 项，约 2 秒） |
| `npm run test:e2e` | 浏览器冒烟（移动 390×844 / 桌面 1280×900） |
| `npm run android:debug` | 出 debug APK → `dist/qimen-v<版本>-debug.apk` |
| `npm run android:release` | 出 release APK → `dist/qimen-v<版本>.apk` |
| `npm run verify:apk` | 产物四项校验（签名/包信息/资源/体积）→ `dist/apk-report.json` |
| `npm run set:secrets` | 把签名密钥写进 GitHub 仓库 Secrets |

版本号来自 git tag：`v1.2.3` → `versionName=1.2.3`、`versionCode=10203`。
无 tag 时默认 `1.0.0`。

## 3. 发版流程

```bash
# 1) 本地出包并校验
npm run android:release
npm run verify:apk

# 2) 提交并推送
git add <显式文件列表>
git commit -m "feat(android): ..."
git push origin main

# 3) 等 CI 绿后打 tag（tag 会触发 Release 发布）
git tag v1.0.0
git push origin v1.0.0
```

CI 行为（`.github/workflows/android-ci.yml`）：

- push / PR：跑测试 + 构建 + 产物校验，不发布
- 推 `v*` tag：额外创建 GitHub Release，附 `qimen-v*.apk` 与 `SHA256SUMS.txt`
- 未配置签名 secrets 时：降级产出 debug 签名包，并在 Job Summary 明确警告（不会让流水线变红）

## 4. 签名密钥（最重要）

- 位置：`.signing/qimen-release.keystore` + `.signing/keystore.properties`
- 均为 gitignore，**不进仓库**
- 已写入 GitHub Secrets：
  `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`
- 证书 SHA-256：`00:D5:E0:49:7B:AF:16:D7:B9:98:12:3A:D5:E0:49:43:51:AC:87:2F:4F:F1:C0:CC:19:37:C9:37:92:38:6C:AE`

> ⚠️ 请把 `.signing/` 另存到你自己的安全位置。
> 密钥丢失后，新包无法覆盖安装旧包，只能卸载重装，WebView 里的案例数据会一起丢失。

## 5. 排障表

| 现象 | 根因 | 处理 |
|---|---|---|
| 构建报「多个环境变量指向 Android Preferences」 | 同时设了 `ANDROID_SDK_HOME` 与 `ANDROID_USER_HOME` | 只保留后者（`env.sh` 已修） |
| 构建报 `Value is null` | Groovy 把 `versionCode (x).toInteger()` 解析成方法链 | 用显式赋值（`app/build.gradle` 已修） |
| 下载 SDK 很慢/失败 | 代理未生效 | `source scripts/toolchain/env.sh && qimen_apply_proxy`；确认 10940 端口可用 |
| 本地预览请求返回 503 | 全局 `http_proxy` 把 127.0.0.1 也代理了 | `env.sh` 已导出 `no_proxy=localhost,127.0.0.1` |
| `npx playwright install chromium` 失败 | 本机 Ubuntu 20.04 不受新版本支持 | 本机用 `QIMEN_CHROMIUM_PATH=<已有 chrome 路径>`；CI 不受影响 |
| 校验报「缺少 res/mipmap-*/ic_launcher.png」 | AGP release 会压缩 `res/` 路径 | 校验脚本已改为检查 badging 引用的图标真实存在 |
| APK 装不上（INSTALL_FAILED_UPDATE_INCOMPATIBLE） | 签名与已装版本不同 | 卸载旧包再装（数据会丢），或确保用同一 keystore |
| 构建后 `~/.android` 又出现了 | AGP 在配置阶段向系统账号主目录写 1 个 127B 统计文件（不认各种重定向） | 构建脚本会自动收容；也可手动跑 `bash scripts/toolchain/global-leak-guard.sh` |
| `global-leak-guard.sh` 报「跳过处理」 | 目录里有 AVD/adb 密钥等用户数据，或白名单外文件 | 这是**保护**而非失败：先人工确认 `~/.android` 里是什么，再决定 |

## 6. 已知限制

1. **不做真机自动化**：本机无 `/dev/kvm`，跑不了模拟器。设备端 E2E 由使用者手动完成。
2. **网页版数据不迁移**：PWA 与 APK 的 `localStorage` 按 origin 隔离，案例不会自动带过去。
3. **targetSdk 34**：刻意不使用 35/36，避免 Android 15+ 强制 edge-to-edge 的视觉风险；升级需单独评估。
4. **仅侧载**：未上架任何应用商店，需要在手机上允许「安装未知来源应用」。
5. **minSdk 24**：Android 7.0 以下不支持；建议系统 WebView 为 Chrome 108+。
6. **AGP 统计文件的收容**：每次构建 AGP 都会向系统账号主目录写 1 个 127 字节的 `analytics.settings`，已确认无法用环境变量/ JVM 参数关闭。
   构建脚本在结束时自动把它移入 `.toolchain/quarantine/`，因此**构建完成后的最终状态**是干净的；
   若目录里发现 AVD、adb 密钥等用户数据，脚本只告警、绝不动手。

## 7. 主人设备端 E2E 清单

装好后请按顺序确认：

- [ ] 桌面出现「奇门排盘」图标，名称与图标正常
- [ ] 首次启动有启动图，随后直接进入排盘页，无白屏
- [ ] 底部四个页签可点击切换：排盘 / 万年历 / 设局 / 案例
- [ ] 左右滑动可切页
- [ ] 切页后每页滚动位置独立
- [ ] 返回键：先关弹窗 → 再回排盘页 → 最后退出
- [ ] 关掉网络（飞行模式）后冷启动仍可用
- [ ] 起局、切换定局方式、切换飞盘/转盘正常
- [ ] 九宫格在屏幕上不溢出、不被手势条遮挡
- [ ] 系统字体放大到 1.3× 后布局不错乱
- [ ] 保存案例后杀掉进程重开，案例仍在
