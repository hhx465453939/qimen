# 奇门遁甲专业排盘 PWA (Qimen Dunjia Professional Board)

> 现代 Material Design 3 风格的高精度奇门遁甲排盘系统，融合三百年权威天文历法数据与专业易理运筹体系。

🌐 **在线体验 (GitHub Pages)**: [https://watersfree.github.io/qimen/](https://watersfree.github.io/qimen/)

📦 **安卓安装包**: 到 [Releases](https://github.com/hhx465453939/qimen/releases) 下载 `qimen-v*.apk` 侧载安装

> 安卓版为纯离线应用（不申请网络权限），与网页版数据不互通；构建与发版见 [docs/ANDROID.md](docs/ANDROID.md)。

---

## ✨ 核心特性

- 🏛️ **现代交互与双主题体验**
  - 深度遵循 Google Material Design 3 设计规范，排版严整考究。
  - 完美支持自适应深色 (Dark) / 浅色 (Light) 主题一键切换。
  - 一键开启“简洁模式”，大屏沉浸专注文书与克应研判。
  - 右上角系统常用设置自动持久化记忆，刷新与脱机均无需反复配置。

- 📐 **三大主流起局算法与飞转双轨**
  - **定局方式**：严格实现**置闰法**（正授/超神/接气/芒种大雪置闰）、**拆补法**与**茅山法**。
  - **排盘体制**：支持**转盘法（排宫）**与**飞盘法（飞宫）**。
  - **子时处理**：支持早夜子时细分（split）与23点统换次日（merge）。

- 🌍 **天文级精密授时与真太阳时**
  - 内置覆盖 300 年权威高精度天文节气数据库。
  - 全国各大主要省市经纬度快速联动，支持精确到分秒的真太阳时经度视差校正。

- 🔍 **全息九宫与81十干克应体系**
  - 九星、八门、八神结构化人物象意与事物象意两行纵向对齐，支持全部/物象/人象快速筛选。
  - 权威 81 十干克应判定表，修正字面吉凶误差，按实际奇门义理严谨研判。
  - 地盘基盘全息视角一键切换，九宫原始八卦、地支、元旦盘信息一目了然。

- 🎯 **智能用神圈选与全盘运筹**
  - 支持盘面手动圈选用神、要素分类速查与智能用神判定。
  - 旬空宫位及对冲宫精准联动，非用神弱化遮罩辅助快速抓取局态核心。

- ⚡ **完备的 PWA 离线脱机支持**
  - **标准 PWA**：采用 Service Worker 高速缓存策略（Cache-First），支持现代浏览器一键“添加到主屏幕”，脱网秒开，全屏原生体验。

---

## 📱 手机离线安装指南

### 方式一：安卓 APK（推荐，真·独立应用）

1. 打开 [Releases](https://github.com/hhx465453939/qimen/releases) 下载最新的 `qimen-v*.apk`。
2. 手机上允许「安装未知来源应用」。
3. 安装后桌面出现「奇门排盘」，断网可用。

### 方式二：PWA（网页版添加到主屏）

1. 用手机浏览器打开 [https://watersfree.github.io/qimen/](https://watersfree.github.io/qimen/)。
2. **iOS Safari**：点击底部分享按钮，选择 **“添加到主屏幕”**。
3. **Android Chrome / 夸克等**：点击右上角菜单，选择 **“安装应用”** 或 **“添加到主屏幕”**。
4. 安装完成后，桌面上将生成独立的“奇门排盘”应用图标，点开全屏沉浸运行，即使手机处于飞行模式亦可秒开。

---

## 💻 本地运行

本项目为纯前端静态应用，无任何复杂后端依赖：

```bash
# 克隆仓库
git clone https://github.com/hhx465453939/qimen.git
cd qimen

# 使用任意本地静态服务器启动，例如 Python:
python -m http.server 8099
```

### 安卓版构建（工具链全部在项目内）

```bash
npm install          # Capacitor CLI + 测试依赖
npm run setup        # 下载 JDK 21 + Android SDK 到 .toolchain/（不写全局）
npm test             # 结构与分页测试
npm run android:release && npm run verify:apk
```

详见 [docs/ANDROID.md](docs/ANDROID.md)。

---

## 📄 License

MIT License
