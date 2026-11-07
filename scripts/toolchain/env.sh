#!/usr/bin/env bash
# 项目内工具链环境变量。用法：source scripts/toolchain/env.sh
#
# 两种运行形态都要兼容：
#   1) 本机开发：使用 <repo>/.toolchain 内的 JDK/SDK，零全局写入
#   2) CI：使用 setup-java / setup-android 提供的外部 JDK/SDK，不要覆盖它们
# 原则：项目内有对应工具链才覆盖；否则保留既有环境变量。

if [ -n "${BASH_SOURCE[0]:-}" ]; then
  _qimen_env_src="${BASH_SOURCE[0]}"
else
  _qimen_env_src="$0"
fi
QIMEN_ROOT="$(cd "$(dirname "$_qimen_env_src")/../.." && pwd)"
export QIMEN_ROOT
# 注意：调用方可能开着 set -u，必须用 ${VAR:-} 形式读取未定义变量
export QIMEN_TOOLCHAIN="${QIMEN_TOOLCHAIN:-$QIMEN_ROOT/.toolchain}"

# ---------- JDK ----------
if [ -x "$QIMEN_TOOLCHAIN/jdk21/bin/java" ]; then
  export JAVA_HOME="$QIMEN_TOOLCHAIN/jdk21"
fi

# ---------- Android SDK ----------
if [ -x "$QIMEN_TOOLCHAIN/android-sdk/cmdline-tools/latest/bin/sdkmanager" ] \
  || [ -d "$QIMEN_TOOLCHAIN/android-sdk/platforms" ]; then
  export ANDROID_HOME="$QIMEN_TOOLCHAIN/android-sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  # 只设 ANDROID_USER_HOME：同时设 ANDROID_SDK_HOME 会被 AGP 8.13 判为冲突并报错
  export ANDROID_USER_HOME="$QIMEN_TOOLCHAIN/android-user-home"
fi

# ---------- 其它缓存目录（不覆盖外部已有值） ----------
: "${GRADLE_USER_HOME:=$QIMEN_TOOLCHAIN/gradle-home}"
: "${npm_config_cache:=$QIMEN_TOOLCHAIN/npm-cache}"
: "${TMPDIR:=$QIMEN_TOOLCHAIN/tmp}"
: "${PLAYWRIGHT_BROWSERS_PATH:=$QIMEN_TOOLCHAIN/ms-playwright}"
export GRADLE_USER_HOME npm_config_cache TMPDIR PLAYWRIGHT_BROWSERS_PATH
export TMP="$TMPDIR" TEMP="$TMPDIR"

mkdir -p "$GRADLE_USER_HOME" "$npm_config_cache" "$TMPDIR" 2>/dev/null
[ -n "${ANDROID_USER_HOME:-}" ] && mkdir -p "$ANDROID_USER_HOME" 2>/dev/null

# ---------- PATH（只加真实存在的目录） ----------
_qimen_prepend_path() {
  [ -d "$1" ] || return 0
  case ":$PATH:" in *":$1:"*) return 0 ;; esac
  PATH="$1:$PATH"
}
_qimen_prepend_path "$QIMEN_ROOT/node_modules/.bin"
[ -n "${JAVA_HOME:-}" ] && _qimen_prepend_path "$JAVA_HOME/bin"
[ -n "${ANDROID_HOME:-}" ] && {
  _qimen_prepend_path "$ANDROID_HOME/cmdline-tools/latest/bin"
  _qimen_prepend_path "$ANDROID_HOME/platform-tools"
}
export PATH

# ---------- 代理 ----------
# 本机代理会把 localhost 也代走（实测 503），固定直连；对本地预览/测试是必须的
export no_proxy="localhost,127.0.0.1,::1${no_proxy:+,$no_proxy}"
export NO_PROXY="$no_proxy"

# 探测可用代理（本机 10940 实测可用；1080/7890 作为候选）
qimen_detect_proxy() {
  local cand
  for cand in "${QIMEN_PROXY:-}" "${https_proxy:-}" "${http_proxy:-}" \
              "http://127.0.0.1:10940" "http://127.0.0.1:1080" "http://127.0.0.1:7890"; do
    [ -z "$cand" ] && continue
    if curl -s -m 6 -o /dev/null -x "$cand" https://dl.google.com/android/repository/repository2-3.xml 2>/dev/null; then
      printf '%s' "$cand"
      return 0
    fi
  done
  return 1
}

qimen_apply_proxy() {
  local p
  p="$(qimen_detect_proxy)" || { echo "[env] 未探测到可用代理，按直连处理" >&2; return 0; }
  export QIMEN_PROXY="$p"
  export http_proxy="$p" https_proxy="$p" HTTP_PROXY="$p" HTTPS_PROXY="$p"
  echo "[env] 使用代理 $p" >&2
}

# 把代理写进 Gradle 本地配置（生成物，绝不提交）
qimen_write_gradle_proxy() {
  local f="$GRADLE_USER_HOME/gradle.properties"
  [ -z "${QIMEN_PROXY:-}" ] && return 0
  local hp="${QIMEN_PROXY#*://}"
  local host="${hp%%:*}"
  local port="${hp##*:}"
  mkdir -p "$GRADLE_USER_HOME"
  {
    echo "systemProp.http.proxyHost=$host"
    echo "systemProp.http.proxyPort=$port"
    echo "systemProp.https.proxyHost=$host"
    echo "systemProp.https.proxyPort=$port"
    echo "systemProp.http.nonProxyHosts=localhost|127.0.0.1"
    echo "org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m"
    echo "org.gradle.daemon=false"
  } > "$f"
  echo "[env] 已写入 Gradle 代理配置 $f" >&2
}
