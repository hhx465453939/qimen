#!/usr/bin/env bash
# 断言：工具链与构建状态全部位于项目内，零全局写入。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# 允许单独执行：自行加载环境变量
# shellcheck source=/dev/null
[ -z "${JAVA_HOME:-}" ] && source "$ROOT/scripts/toolchain/env.sh"
fail=0

say() { printf '%s\n' "$*"; }

inside() { case "$1" in "$ROOT"/*) return 0 ;; *) return 1 ;; esac; }

for var in JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT ANDROID_USER_HOME GRADLE_USER_HOME npm_config_cache TMPDIR; do
  val="${!var:-}"
  if [ -z "$val" ]; then
    say "[隔离][跳过] $var 未设置"
    continue
  fi
  if inside "$val"; then
    say "[隔离][OK] $var = $val"
  else
    say "[隔离][FAIL] $var 指向项目外: $val"
    fail=1
  fi
done

for d in "$HOME/.gradle" "$HOME/.android"; do
  if [ -e "$d" ]; then
    say "[隔离][FAIL] 检测到全局目录被写入: $d"
    fail=1
  else
    say "[隔离][OK] 全局目录不存在: $d"
  fi
done

# 构建产物不应出现在项目外
if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ]; then
  say "[隔离][OK] Android SDK 位于项目内 ($(du -sh "$ANDROID_HOME" 2>/dev/null | cut -f1))"
fi
if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
  say "[隔离][OK] JDK 位于项目内 ($(du -sh "$JAVA_HOME" 2>/dev/null | cut -f1))"
fi

if [ "$fail" -ne 0 ]; then
  say "[隔离][结论] 存在外溢，必须修复后再继续"
  exit 1
fi
say "[隔离][结论] 通过：零全局写入"
