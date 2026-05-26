#!/usr/bin/env bash
# 生成 auth-service 本地用 RSA 密钥对 (RS256)
# 写入 scripts/dev/secrets/jwt-{private,public}.pem (gitignore)
# 生产用 KMS, 不要复用本地密钥.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SECRETS="$DIR/secrets"
PRIV="$SECRETS/jwt-private.pem"
PUB="$SECRETS/jwt-public.pem"

mkdir -p "$SECRETS"

if [[ -f "$PRIV" && -f "$PUB" ]]; then
  echo "✓ keys already exist: $PRIV / $PUB"
  echo "  delete them first if you want to rotate"
  exit 0
fi

openssl genpkey -algorithm RSA -out "$PRIV" -pkeyopt rsa_keygen_bits:2048
openssl rsa -in "$PRIV" -pubout -out "$PUB" 2>/dev/null
chmod 600 "$PRIV"
chmod 644 "$PUB"

echo "✓ wrote $PRIV"
echo "✓ wrote $PUB"
