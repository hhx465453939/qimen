#!/usr/bin/env bash
# 项目内安卓工具链引导：JDK 21 + cmdline-tools + platform-tools + platform 36 + build-tools 36
# 全部落在 <repo>/.toolchain，幂等可重跑。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/toolchain/env.sh"
qimen_apply_proxy
qimen_write_gradle_proxy

DL="$QIMEN_TOOLCHAIN/downloads"
mkdir -p "$DL" "$QIMEN_ROOT/dist"
REPORT="$QIMEN_ROOT/dist/toolchain-report.txt"
: > "$REPORT"

log() { echo "[bootstrap] $*" | tee -a "$REPORT"; }
die() { echo "[bootstrap][FAIL] $*" | tee -a "$REPORT" >&2; exit 1; }

PROXY_ARGS=()
if [ -n "${QIMEN_PROXY:-}" ]; then
  _hp="${QIMEN_PROXY#*://}"
  PROXY_ARGS=(--all-proxy="$QIMEN_PROXY")
fi

verify_sum() { # "algo:hash" file  （无冒号时按 sha256）
  local spec="$1" file="$2" algo hash tool
  [ -z "$spec" ] && return 0
  algo="${spec%%:*}"; hash="${spec#*:}"
  if [ "$algo" = "$hash" ]; then algo=sha256; hash="$spec"; fi
  case "$algo" in
    sha1) tool=sha1sum ;;
    sha256) tool=sha256sum ;;
    sha512) tool=sha512sum ;;
    md5) tool=md5sum ;;
    *) tool=sha256sum ;;
  esac
  printf '%s  %s\n' "$hash" "$file" | "$tool" -c --status 2>/dev/null
}

fetch() { # url outfile "algo:hash"
  local url="$1" out="$2" spec="${3:-}"
  if [ -f "$out" ]; then
    if verify_sum "$spec" "$out"; then
      log "本地已有: $(basename "$out")"; return 0
    fi
    log "校验不符，重新下载: $(basename "$out")"; rm -f "$out"
  fi
  if command -v aria2c >/dev/null 2>&1; then
    # aria2c 会读 all_proxy 环境变量，本机格式不兼容，临时屏蔽（http_proxy 仍由 --all-proxy 显式传入）
    local _saved_all_proxy="${all_proxy-}"
    unset all_proxy ALL_PROXY
    aria2c -c -x16 -s16 -k1M --no-conf --auto-file-renaming=false --allow-overwrite=true \
      "${PROXY_ARGS[@]}" --dir="$(dirname "$out")" -o "$(basename "$out")" "$url" >>"$REPORT" 2>&1 \
      || curl -fL --retry 3 --max-time 2400 -o "$out" "$url" >>"$REPORT" 2>&1
    [ -n "$_saved_all_proxy" ] && export all_proxy="$_saved_all_proxy"
  else
    curl -fL --retry 3 --max-time 2400 -o "$out" "$url" >>"$REPORT" 2>&1
  fi
  [ -s "$out" ] || die "下载失败: $url"
  verify_sum "$spec" "$out" || die "完整性校验失败: $out"
  log "下载完成: $(basename "$out") ($(du -h "$out" | cut -f1))"
}

# ---------- 1. JDK 21 (Temurin) ----------
if [ -x "$JAVA_HOME/bin/java" ] && "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '"21\.'; then
  log "JDK 21 已就位: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
else
  log "解析 Temurin 21 最新发行版..."
  JDK_META="$(curl -s -m 60 ${QIMEN_PROXY:+--proxy "$QIMEN_PROXY"} \
    "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=linux&vendor=eclipse")"
  [ -n "$JDK_META" ] || die "Adoptium API 无响应"
  read -r JDK_URL JDK_SHA JDK_NAME <<<"$(printf '%s' "$JDK_META" | python3 -c '
import json,sys
d=json.load(sys.stdin)[0]["binary"]["package"]
print(d["link"], d["checksum"], d["name"])
')"
  log "目标 JDK: $JDK_NAME"
  fetch "$JDK_URL" "$DL/$JDK_NAME" "sha256:$JDK_SHA"
  rm -rf "$QIMEN_TOOLCHAIN/jdk21"
  mkdir -p "$QIMEN_TOOLCHAIN/jdk21"
  tar xzf "$DL/$JDK_NAME" -C "$QIMEN_TOOLCHAIN/jdk21" --strip-components=1
  [ -x "$JAVA_HOME/bin/java" ] || die "JDK 解压后不可执行"
  log "JDK 安装完成: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
fi

# ---------- 2. cmdline-tools ----------
if [ -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  log "cmdline-tools 已就位"
else
  log "解析 cmdline-tools;latest ..."
  REPO_XML="$DL/repository2-3.xml"
  fetch "https://dl.google.com/android/repository/repository2-3.xml" "$REPO_XML" ""
  read -r CT_URL CT_ALG CT_SHA CT_NAME <<<"$(python3 - "$REPO_XML" <<'PY'
import re,sys
xml=open(sys.argv[1],encoding='utf-8',errors='ignore').read()
m=re.search(r'<remotePackage path="cmdline-tools;latest">(.*?)</remotePackage>', xml, re.S)
if not m: raise SystemExit("cmdline-tools;latest not found")
b=m.group(1)
url=re.search(r'<url>(.*?)</url>', b, re.S).group(1).strip()
cm=re.search(r'<checksum(?:\s+type="([^"]+)")?[^>]*>(.*?)</checksum>', b, re.S)
alg=(cm.group(1) or 'sha256') if cm else 'sha256'
sha=cm.group(2).strip() if cm else ''
name=url.rsplit('/',1)[-1]
if not url.startswith('http'):
    url = 'https://dl.google.com/android/repository/' + name
print(url, alg, sha, name)
PY
)"
  [ -n "${CT_URL:-}" ] || die "未能解析 cmdline-tools 下载地址"
  fetch "$CT_URL" "$DL/$CT_NAME" "${CT_ALG:-sha256}:${CT_SHA:-}"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  unzip -q -o "$DL/$CT_NAME" -d "$ANDROID_HOME/cmdline-tools"
  if [ -d "$ANDROID_HOME/cmdline-tools/cmdline-tools" ]; then
    mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  fi
  [ -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ] || die "cmdline-tools 安装失败"
  log "cmdline-tools 安装完成"
fi

# ---------- 3. SDK 组件 ----------
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
SDK_PROXY_ARGS=()
if [ -n "${QIMEN_PROXY:-}" ]; then
  _hp="${QIMEN_PROXY#*://}"
  SDK_PROXY_ARGS=(--proxy=http --proxy_host="${_hp%%:*}" --proxy_port="${_hp##*:}")
fi

log "接受 SDK licenses..."
yes 2>/dev/null | "$SDKM" --sdk_root="$ANDROID_HOME" "${SDK_PROXY_ARGS[@]}" --licenses >>"$REPORT" 2>&1 || true

for pkg in "platform-tools" "platforms;android-36" "build-tools;36.0.0"; do
  if [ -d "$ANDROID_HOME/${pkg%%;*}" ] || [ -d "$ANDROID_HOME/$pkg" ]; then
    log "组件已存在: $pkg"
  fi
  log "安装组件: $pkg"
  "$SDKM" --sdk_root="$ANDROID_HOME" "${SDK_PROXY_ARGS[@]}" "$pkg" >>"$REPORT" 2>&1 \
    || die "组件安装失败: $pkg（详见 $REPORT）"
done

# ---------- 4. 报告与隔离校验 ----------
{
  echo "=== 工具链版本 ==="
  "$JAVA_HOME/bin/java" -version 2>&1 | head -1
  echo "sdkmanager: $("$SDKM" --version 2>/dev/null | tail -1)"
  ls -1 "$ANDROID_HOME/platforms" 2>/dev/null | sed 's/^/platform: /'
  ls -1 "$ANDROID_HOME/build-tools" 2>/dev/null | sed 's/^/build-tools: /'
  ls -1 "$ANDROID_HOME/platform-tools" 2>/dev/null | head -3 | sed 's/^/platform-tools: /'
  echo "GRADLE_USER_HOME=$GRADLE_USER_HOME"
  echo "ANDROID_USER_HOME=$ANDROID_USER_HOME"
  echo "JAVA_HOME=$JAVA_HOME"
} >> "$REPORT"

bash "$ROOT/scripts/toolchain/verify-isolation.sh" | tee -a "$REPORT"
log "工具链引导完成。报告: $REPORT"
