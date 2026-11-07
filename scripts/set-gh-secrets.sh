#!/usr/bin/env bash
# 把签名密钥写入 GitHub 仓库 Secrets（需 gh 已登录且对仓库有 admin 权限）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROPS="$ROOT/.signing/keystore.properties"
REPO="${QIMEN_REPO:-hhx465453939/qimen}"

if [ ! -f "$PROPS" ]; then
  echo "[secrets][FAIL] 未找到 $PROPS，请先执行 npm run gen:keystore"
  exit 1
fi

# shellcheck source=/dev/null
set -a; source "$PROPS"; set +a

command -v gh >/dev/null || { echo "[secrets][FAIL] 未安装 gh"; exit 1; }
# gh auth status 在多账号环境下会因失效账号整体返回非零，改用 API 探测当前活跃账号
GH_LOGIN="$(gh api user --jq .login 2>/dev/null || true)"
[ -n "$GH_LOGIN" ] || { echo "[secrets][FAIL] gh 未登录或无有效 token"; exit 1; }
echo "[secrets] gh 当前账号: $GH_LOGIN"

echo "[secrets] 目标仓库: $REPO"
base64 -w0 "$QIMEN_KEYSTORE_PATH" | gh secret set ANDROID_KEYSTORE_BASE64 -R "$REPO"
gh secret set ANDROID_KEYSTORE_PASSWORD -R "$REPO" --body "$QIMEN_KEYSTORE_PASSWORD"
gh secret set ANDROID_KEY_ALIAS -R "$REPO" --body "$QIMEN_KEY_ALIAS"
gh secret set ANDROID_KEY_PASSWORD -R "$REPO" --body "$QIMEN_KEY_PASSWORD"

echo "[secrets] 已写入 4 项 secrets："
gh secret list -R "$REPO"
