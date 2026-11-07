#!/usr/bin/env bash
# APK 产物四项校验：签名 / 包信息 / 资源清单 / 体积与哈希
# 本地与 CI 共用同一脚本（ADR-006），任一不符即非零退出。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=/dev/null
source "$ROOT/scripts/toolchain/env.sh"

APK="${1:-}"
if [ -z "$APK" ]; then
  APK="$(ls -t dist/qimen-*.apk 2>/dev/null | head -1)"
fi
if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "[verify][FAIL] 未找到 APK（先执行 npm run android:release）"
  exit 2
fi

BT="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"
AAPT2="$BT/aapt2"
APKSIGNER="$BT/apksigner"
[ -x "$AAPT2" ] || AAPT2="$(command -v aapt2 || true)"
[ -x "$APKSIGNER" ] || APKSIGNER="$(command -v apksigner || true)"
[ -x "$AAPT2" ] || { echo "[verify][FAIL] 缺少 aapt2"; exit 2; }
[ -x "$APKSIGNER" ] || { echo "[verify][FAIL] 缺少 apksigner"; exit 2; }

eval "$(node scripts/version.mjs --shell)"

# 防御：未导出 ANDROID_HOME 时回落到项目内 SDK（避免 set -u 直接中断）
: "${ANDROID_HOME:=$QIMEN_TOOLCHAIN/android-sdk}"
export ANDROID_HOME

OK=0
BAD=0
pass() { echo "[verify][OK]   $1"; OK=$((OK + 1)); }
nope() { echo "[verify][FAIL] $1"; BAD=$((BAD + 1)); }

BADGING="$("$AAPT2" dump badging "$APK" 2>/dev/null)"
PKG_LINE="$(printf '%s\n' "$BADGING" | grep -m1 '^package:')"
VERSION_NAME="$(printf '%s\n' "$PKG_LINE" | sed -n "s/.*versionName='\([^']*\)'.*/\1/p")"
VERSION_CODE="$(printf '%s\n' "$PKG_LINE" | sed -n "s/.*versionCode='\([^']*\)'.*/\1/p")"
MIN_SDK="$(printf '%s\n' "$BADGING" | sed -n "s/^minSdkVersion:'\([^']*\)'.*/\1/p" | head -1)"
[ -n "$MIN_SDK" ] || MIN_SDK="$(printf '%s\n' "$BADGING" | sed -n "s/^sdkVersion:'\([^']*\)'.*/\1/p" | head -1)"
TARGET_SDK="$(printf '%s\n' "$BADGING" | sed -n "s/^targetSdkVersion:'\([^']*\)'.*/\1/p" | head -1)"
LABEL="$(printf '%s\n' "$BADGING" | sed -n "s/^application-label:'\([^']*\)'.*/\1/p" | head -1)"

echo "=== APK 校验: $APK ($(du -h "$APK" | cut -f1)) ==="

printf '%s\n' "$PKG_LINE" | grep -q "name='io.github.hhx465453939.qimen'" \
  && pass "包名 = io.github.hhx465453939.qimen" || nope "包名不符: $PKG_LINE"
[ "$VERSION_NAME" = "$QIMEN_VERSION_NAME" ] \
  && pass "版本名 = $QIMEN_VERSION_NAME" || nope "版本名不符: ${VERSION_NAME:-空} ≠ $QIMEN_VERSION_NAME"
[ "$VERSION_CODE" = "$QIMEN_VERSION_CODE" ] \
  && pass "版本号 = $QIMEN_VERSION_CODE" || nope "版本号不符: ${VERSION_CODE:-空} ≠ $QIMEN_VERSION_CODE"
[ "$MIN_SDK" = "24" ] && pass "minSdk = 24" || nope "minSdk 不符: ${MIN_SDK:-空}"
[ "$TARGET_SDK" = "34" ] && pass "targetSdk = 34" || nope "targetSdk 不符: ${TARGET_SDK:-空}"
[ "$LABEL" = "奇门排盘" ] && pass "应用名 = 奇门排盘" || nope "应用名不符: ${LABEL:-空}"
printf '%s\n' "$BADGING" | grep -q 'android.permission.INTERNET' \
  && nope "不应申请 INTERNET 权限" || pass "未申请 INTERNET 权限"

# 签名（用 --verbose：输出里有 "Verifies"，rc=0 为通过）
SIGN_OUT="$("$APKSIGNER" verify --verbose "$APK" 2>&1)"
SIGN_RC=$?
if [ "$SIGN_RC" -eq 0 ] && printf '%s\n' "$SIGN_OUT" | grep -q '^Verifies'; then
  pass "签名校验通过"
else
  nope "签名校验失败（rc=$SIGN_RC）: $(printf '%s' "$SIGN_OUT" | head -2 | tr '\n' ' ')"
fi
CERT_SHA="$("$APKSIGNER" verify --print-certs "$APK" 2>/dev/null | grep -i 'SHA-256 digest' | head -1 | sed 's/.*: *//')"

# 资源清单
LISTING="$(unzip -l "$APK" 2>/dev/null)"
for asset in \
  'assets/public/index.html' \
  'assets/public/css/style.css' \
  'assets/public/css/pager.css' \
  'assets/public/js/app.js' \
  'assets/public/js/mobile-pager.js' \
  'assets/public/js/qimen.js' \
  'assets/public/js/calendar.js' \
  'assets/public/js/database.js' \
  'assets/public/js/raw_keying.json'; do
  printf '%s\n' "$LISTING" | grep -q "$asset" && pass "内置 $asset" || nope "缺少 $asset"
done

# 启动图标：AGP release 会压缩 res 路径，改为校验 badging 引用的图标真实存在，且密度资源齐备
ICON_PATH="$(printf '%s\n' "$BADGING" | sed -n "s/^application:.*icon='\([^']*\)'.*/\1/p" | head -1)"
if [ -n "$ICON_PATH" ] && printf '%s\n' "$LISTING" | grep -q " $ICON_PATH$"; then
  pass "启动图标存在（$ICON_PATH）"
else
  nope "启动图标缺失或引用断链（icon='${ICON_PATH:-空}'）"
fi
PNG_COUNT=$(printf '%s\n' "$LISTING" | grep -cE ' res/[^ ]+\.(png|9\.png)$')
[ "$PNG_COUNT" -ge 10 ] && pass "资源 PNG 数量 ${PNG_COUNT} ≥ 10（含各密度图标）" || nope "资源 PNG 过少: ${PNG_COUNT}"
printf '%s\n' "$BADGING" | grep -q '^launchable-activity:' && pass "存在可启动 Activity" || nope "缺少 launchable-activity"
printf '%s\n' "$LISTING" | grep -q 'assets/public/sw.js' \
  && nope "不应内置 sw.js" || pass "未内置 sw.js"

# 体积
SIZE_BYTES=$(stat -c%s "$APK")
SIZE_MB=$((SIZE_BYTES / 1048576))
[ "$SIZE_MB" -le 15 ] && pass "体积 ${SIZE_MB}MB ≤ 15MB" || nope "体积 ${SIZE_MB}MB 超阈值"

SHA256="$(sha256sum "$APK" | cut -d' ' -f1)"
echo "[verify] SHA256: $SHA256"
echo "[verify] 证书 SHA-256: ${CERT_SHA:-未取到}"

mkdir -p "$ROOT/dist"
cat > "$ROOT/dist/apk-report.json" <<JSON
{
  "apk": "$(basename "$APK")",
  "sizeBytes": $SIZE_BYTES,
  "sha256": "$SHA256",
  "package": "io.github.hhx465453939.qimen",
  "versionName": "$VERSION_NAME",
  "versionCode": "$VERSION_CODE",
  "minSdk": "$MIN_SDK",
  "targetSdk": "$TARGET_SDK",
  "label": "$LABEL",
  "certSha256": "${CERT_SHA:-}",
  "passed": $([ "$BAD" -eq 0 ] && echo true || echo false),
  "checksPassed": $OK,
  "checksFailed": $BAD,
  "verifiedAt": "$(date -Iseconds)"
}
JSON

if [ "$BAD" -ne 0 ]; then
  echo "[verify][结论] $BAD 项不合规，禁止发布"
  exit 1
fi
echo "[verify][结论] $OK 项全部通过"
