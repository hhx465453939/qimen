#!/usr/bin/env bash
# 生成 release 签名密钥（项目内 .signing/，gitignore）
# 输出：keystore + keystore.properties（含口令）+ 控制台打印 base64 与指纹
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/toolchain/env.sh"
SIGN_DIR="$ROOT/.signing"
KEYSTORE="$SIGN_DIR/qimen-release.keystore"
PROPS="$SIGN_DIR/keystore.properties"
ALIAS="qimen"

mkdir -p "$SIGN_DIR"
chmod 700 "$SIGN_DIR"

if [ -f "$KEYSTORE" ]; then
  echo "[keystore] 已存在，跳过生成: $KEYSTORE"
else
  if [ -n "${QIMEN_KEYSTORE_PASSWORD:-}" ]; then
    PASS="$QIMEN_KEYSTORE_PASSWORD"
  else
    PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  fi

  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storetype PKCS12 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=Qimen Release, OU=Mobile, O=Qimen, L=NA, ST=NA, C=CN" >/dev/null

  cat > "$PROPS" <<EOF
QIMEN_KEYSTORE_PATH=$KEYSTORE
QIMEN_KEYSTORE_PASSWORD=$PASS
QIMEN_KEY_ALIAS=$ALIAS
QIMEN_KEY_PASSWORD=$PASS
EOF
  chmod 600 "$KEYSTORE" "$PROPS"
  echo "[keystore] 生成完成: $KEYSTORE"
fi

# shellcheck source=/dev/null
set -a; source "$PROPS"; set +a

echo
echo "=== 证书指纹（发版时写进 Release 说明）==="
keytool -list -v -keystore "$QIMEN_KEYSTORE_PATH" -alias "$QIMEN_KEY_ALIAS" -storepass "$QIMEN_KEYSTORE_PASSWORD" 2>/dev/null | grep -E "SHA256:|有效期|Owner:" | head -5
echo
echo "=== base64（可直接写入 GitHub Secret ANDROID_KEYSTORE_BASE64）==="
base64 -w0 "$QIMEN_KEYSTORE_PATH" | head -c 200
echo " ...（完整值请用后面命令导出）"
echo
echo "导出命令: base64 -w0 \"$KEYSTORE\""
echo "属性文件: $PROPS"
echo
echo "[重要] 请把 .signing/ 目录另存到你自己的安全位置。丢失后无法覆盖升级。"
