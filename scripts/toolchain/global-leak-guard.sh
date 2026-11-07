#!/usr/bin/env bash
# AGP 副产物收容（CHG-001 / AC-3.2）
#
# 背景（实测结论）：
#   - ANDROID_USER_HOME 能把 debug.keystore、cache、android-cli 全部导向项目内；
#   - 但 AGP 8.13 仍有 1 个写入者会向系统账号主目录写 127 字节的 analytics.settings，
#     它不认 user.home / HOME / ANDROID_USER_HOME（本机无 strace/root，无法再定位）。
# 因此：构建结束时把「纯副产物」的 ~/.android 收进项目内隔离区，保证最终零残留。
#
# 安全边界（绝不误删用户数据）：
#   - 发现 avd/、adbkey、adbkey.pub 等用户数据 → 只告警，不动手
#   - 发现白名单以外的任何文件 → 只告警，不动手
#   - 目录体积 > 4MB → 只告警，不动手
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GLOBAL="${QIMEN_GLOBAL_ANDROID_HOME:-$HOME/.android}"
QUARANTINE="$ROOT/.toolchain/quarantine"

[ -e "$GLOBAL" ] || exit 0

warn() { echo "[leak-guard][WARN] $*" >&2; }

# 1) 用户数据判据（命中即退出，绝不处理）
for keep in avd adbkey adbkey.pub breakpad; do
  if [ -e "$GLOBAL/$keep" ]; then
    warn "~/.android 含用户数据（$keep），跳过处理；请人工确认后再决定"
    exit 0
  fi
done

# 2) 白名单判据：只允许本项目已知副产物
unknown="$(find "$GLOBAL" -mindepth 1 -maxdepth 2 \( -type f -o -type d \) \
  ! -name 'analytics.settings' \
  ! -name 'debug.keystore' \
  ! -name 'debug.keystore.lock' \
  ! -name 'cache' \
  ! -path '*/cache/*' \
  -print -quit 2>/dev/null)"
if [ -n "$unknown" ]; then
  warn "~/.android 含白名单外条目（$unknown），跳过处理"
  exit 0
fi

# 3) 体积判据
size_kb="$(du -sk "$GLOBAL" 2>/dev/null | cut -f1)"
if [ "${size_kb:-0}" -gt 4096 ]; then
  warn "~/.android 体积 ${size_kb}KB 超出副产物预期，跳过处理"
  exit 0
fi

mkdir -p "$QUARANTINE"
dest="$QUARANTINE/android-home-$(date +%Y%m%d-%H%M%S)"
if mv "$GLOBAL" "$dest" 2>/dev/null; then
  echo "[leak-guard] 已把 AGP 副产物收容到项目内: $dest"
else
  warn "收容失败（可能被占用），请稍后重试或手动清理 $GLOBAL"
  exit 1
fi
