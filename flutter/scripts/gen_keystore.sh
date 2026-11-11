#!/usr/bin/env bash
set -e

KEYSTORE_PATH="android/app/release.keystore"

if [ -f "$KEYSTORE_PATH" ]; then
  echo "Keystore already exists at $KEYSTORE_PATH"
  exit 0
fi

echo "Generating release keystore..."
keytool -genkey -v \
  -keystore "$KEYSTORE_PATH" \
  -alias remote_dev_key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass android \
  -keypass android \
  -dname "CN=FlutterRemoteDev, OU=Development, O=OpenSource, L=Global, S=Global, C=US"

echo "Release keystore generated successfully at $KEYSTORE_PATH"
