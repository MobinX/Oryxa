# Release APK Directory

This directory stores compiled production Android APKs directly in the GitHub repository (no zip archive required).

### Direct Download Links (Raw APKs - No Zip)
- **Latest Release APK**: [app-release.apk](https://github.com/MobinX/Oryxa/raw/main/flutter/apk/app-release.apk)
- **Fast CDN Direct Stream**: `https://oryxa-flutter-patch-worker.mobin-devx.workers.dev/apk/app-release.apk`

### Versioned APKs
Each native release build uploads its versioned binary directly to this directory so you can download any historic or specific APK build directly from GitHub:
- `onlyorders-v1.0.15-b20.apk` (Build 20)
- `onlyorders-b20.apk` (Build 20)
- `app-release.apk` (Latest)

### Installation
You can download the APK file directly on your Android phone and tap to install, or install via ADB:
```bash
adb install -r flutter/apk/app-release.apk
```
