#!/usr/bin/env bash
# 统一构建入口：本地与 CI 走同一条路径。
# 用法：bash scripts/android-build.sh [debug|release]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=/dev/null
source "$ROOT/scripts/toolchain/env.sh"
qimen_apply_proxy
qimen_write_gradle_proxy

TARGET="${1:-release}"
case "$TARGET" in
  debug|release) ;;
  *) echo "用法: $0 [debug|release]"; exit 2 ;;
esac

# 防御：若 env.sh 未导出（例如外部已有 SDK 但变量拼写不一），给出明确错误而不是 unbound
: "${ANDROID_HOME:=$QIMEN_TOOLCHAIN/android-sdk}"
export ANDROID_HOME

command -v java >/dev/null || { echo "[build][FAIL] 未找到 java，请先 npm run setup"; exit 1; }
[ -d "$ANDROID_HOME/platforms/android-36" ] || { echo "[build][FAIL] 缺少 platforms;android-36，请先 npm run setup"; exit 1; }

# 1) 版本号
eval "$(node scripts/version.mjs --shell)"
export QIMEN_VERSION_NAME QIMEN_VERSION_CODE
echo "[build] 版本: $QIMEN_VERSION_NAME ($QIMEN_VERSION_CODE)"

# 2) Web 资源
node scripts/build-web.mjs

# 3) 原生工程（首次自动创建）
if [ ! -d "$ROOT/android" ]; then
  echo "[build] 首次创建 android/ 工程..."
  npx cap add android
fi
npx cap sync android

# 4) 图标与启动图（幂等；缺 Pillow 时使用已提交的图标）
if python3 -c 'import PIL' 2>/dev/null; then
  python3 scripts/make-icons.py
else
  echo "[build] 未安装 Pillow，跳过图标生成（使用仓库内已提交图标）"
fi

# 5) Gradle 构建
if [ "$TARGET" = "release" ]; then
  GRADLE_TASK="assembleRelease"
else
  GRADLE_TASK="assembleDebug"
fi

if [ -n "${QIMEN_KEYSTORE_PATH:-}" ] && [ -f "${QIMEN_KEYSTORE_PATH}" ]; then
  echo "[build] 使用 release 签名: $QIMEN_KEYSTORE_PATH"
else
  echo "[build] 未提供签名密钥 → release 构建将回落到 debug 签名（仅用于自测）"
fi

mkdir -p "$ROOT/dist"
LOG="$ROOT/dist/build-$TARGET.log"
( cd "$ROOT/android" && ./gradlew --no-daemon --stacktrace "$GRADLE_TASK" ) >"$LOG" 2>&1 || {
  # 失败也要收容：AGP 可能在配置阶段就写了全局副产物
  bash "$ROOT/scripts/toolchain/global-leak-guard.sh" || true
  echo "[build][FAIL] Gradle 失败，最后 60 行："
  tail -60 "$LOG"
  exit 1
}

# 构建结束把 AGP 写入系统主目录的 127B analytics 副产物收容回项目内（AC-3.2）
bash "$ROOT/scripts/toolchain/global-leak-guard.sh" || true

# 6) 收集产物
APK_SRC="$(find "$ROOT/android/app/build/outputs/apk/$TARGET" -name '*.apk' -type f | head -1)"
[ -n "$APK_SRC" ] || { echo "[build][FAIL] 未找到 APK 产物"; exit 1; }

if [ "$TARGET" = "release" ]; then
  APK_DST="$ROOT/dist/qimen-v$QIMEN_VERSION_NAME.apk"
else
  APK_DST="$ROOT/dist/qimen-v$QIMEN_VERSION_NAME-debug.apk"
fi
cp -f "$APK_SRC" "$APK_DST"

echo "[build] APK: $APK_DST ($(du -h "$APK_DST" | cut -f1))"
echo "[build] 完成"
