#!/usr/bin/env bash
# Create Zachary's Play upload keystore. Does not invent a password.
# Usage:
#   STORE_PASSWORD=... KEY_PASSWORD=... ./scripts/create-upload-keystore.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${KEYSTORE_PATH:-$ROOT/android/upload-keystore.jks}"
ALIAS="${KEY_ALIAS:-upload}"

if [[ -z "${STORE_PASSWORD:-}" || -z "${KEY_PASSWORD:-}" ]]; then
  echo "Refusing to invent a keystore password."
  echo "Set STORE_PASSWORD and KEY_PASSWORD in the environment, then rerun."
  echo "Example:"
  echo "  STORE_PASSWORD='your-store-pass' KEY_PASSWORD='your-key-pass' $0"
  exit 1
fi

if [[ -e "$OUT" ]]; then
  echo "Refusing to overwrite existing $OUT"
  exit 1
fi

keytool -genkeypair \
  -v \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$STORE_PASSWORD" \
  -keypass "$KEY_PASSWORD" \
  -dname "${DNAME:-CN=Zachary Menear, OU=Daily Warrior, O=Menear, L=Unknown, ST=Unknown, C=US}"

PROP="$ROOT/android/keystore.properties"
cat > "$PROP" <<EOF
storeFile=upload-keystore.jks
storePassword=$STORE_PASSWORD
keyAlias=$ALIAS
keyPassword=$KEY_PASSWORD
EOF

echo "Wrote $OUT and $PROP"
echo "keystore.properties and *.jks are gitignored. Keep them off GitHub."
echo "Play App Signing will ask for this upload key once. Do not lose it."
