# Flutter Remote Dev - OTA Patching System

A low-spec VPS (2GB RAM / 2-Core) friendly Flutter remote development and Over-The-Air (OTA) hotfix system.

Full Android Gradle / Flutter compilation is offloaded to **GitHub Actions**, while Dart logic and asset hotfixes are served over-the-air via a high-performance, low-RAM **Cloudflare Worker** streaming directly from the repository's `/lastpatch` directory.

---

## Architecture Overview

```
                      +---------------------------------------+
                      | Low-Spec VPS (2GB RAM / 2 Cores)       |
                      | - Write Dart code & UI changes        |
                      | - Git commit & push (no local build)  |
                      +-------------------+-------------------+
                                          |
                                      git push
                                          v
                      +---------------------------------------+
                      | GitHub Actions CI/CD                  |
                      | - Aggressive Gradle & Pub Caching     |
                      | - If commit has {{native}}:           |
                      |     * Full compile release APK -> /apk|
                      |     * Reset baseline & patcher keys   |
                      | - Else (Dart/UI change):              |
                      |     * Fast diff patch -> /patch       |
                      |     * Update /lastpatch + manifest    |
                      +-------------------+-------------------+
                                          |
                              Git auto-push /lastpatch
                                          v
                      +---------------------------------------+
                      | Cloudflare Worker (in /worker)        |
                      | - Streams /lastpatch chunk-by-chunk   |
                      | - Zero buffering (<2MB RAM usage)     |
                      | - Acts as production static OTA host  |
                      +-------------------+-------------------+
                                          |
                                    HTTP GET OTA
                                          v
                      +---------------------------------------+
                      | Android Test Device                   |
                      | - Installed release APK from /apk     |
                      | - Checks worker for manifest.json     |
                      | - Downloads & applies patch.zip       |
                      | - Re-open app to see instant changes! |
                      +---------------------------------------+
```

---

## Key Directories

| Directory | Purpose |
| :--- | :--- |
| **`/apk`** | Stores the latest compiled production `app-release.apk` whenever `{{native}}` is pushed. |
| **`/patch`** | Historical versioned archive of all generated OTA patches (`patch/<version>/patch.zip`). |
| **`/lastpatch`** | Contains the active production files (`manifest.json` and `patch.zip`) served by the Cloudflare Worker. |
| **`/worker`** | The Cloudflare Worker sub-project that streams files from `/lastpatch` chunk-by-chunk. |
| **`/.github/workflows`** | GitHub Actions workflow (`build_or_patch.yml`) with aggressive caching and dual-mode dispatch. |

---

## Git Commit Trigger System

The GitHub Actions workflow uses explicit triggers to conserve CI resources and avoid accidental rebuilds:

### 1. Full Native Rebuild (`{{native}}`)
Whenever you add native Android plugins, modify Gradle scripts, update Flutter SDK, or need a fresh base APK:
```bash
git commit -m "feat: added new native library {{native}}"
git push
```
- **What happens:**
  1. GitHub Actions detects `{{native}}`.
  2. Resets previous patcher baseline and signing keys.
  3. Builds full release APK and signs it.
  4. Saves the APK to `apk/app-release.apk`.
  5. Resets `/lastpatch/manifest.json` (`has_update: false`).
  6. You install `apk/app-release.apk` once on your test device.

### 2. Instant OTA Hotfix / Patch (`{{patch}}`)
When changing Dart code, widgets, business logic, or assets:
```bash
git commit -m "fix: updated checkout button color and text {{patch}}"
git push
```
- **What happens:**
  1. GitHub Actions detects `{{patch}}`.
  2. Restores warm Gradle and Flutter build caches.
  3. Computes the diff against the baseline release.
  4. Builds `patch.zip` and calculates its MD5 hash.
  5. Updates `/lastpatch/manifest.json` with the new MD5 hash and version code.
  6. Archives to `/patch/<version>/`.
  7. Mobile app checks Cloudflare Worker, downloads the patch, and applies it dynamically!

### 3. Normal Commits (Skip Action)
When committing without `{{native}}` or `{{patch}}` (e.g. documentation, comments, minor edits):
```bash
git commit -m "docs: updated project notes"
git push
```
- **What happens:** The GitHub Action immediately **skips** the build and patch process, saving 100% of your GitHub Action runner minutes.

---

## What the Patching URL Shows

When your mobile app or browser accesses the Cloudflare Worker URL (e.g. `https://flutter-patch-worker.<subdomain>.workers.dev`), the worker serves the contents of `/lastpatch` dynamically:

### 1. Root / Manifest Endpoint (`GET /` or `GET /manifest.json`)
The worker returns the active patch manifest JSON:
```json
{
  "has_update": true,
  "version": "1.0.0-h1",
  "patch_url": "https://flutter-patch-worker.your-subdomain.workers.dev/patch.zip",
  "md5": "e2c569f313b30095a55d6f96be5087c5",
  "target_version_code": 1,
  "created_at": "2026-11-10T04:40:00Z",
  "commit": "8d52416..."
}
```
* **Dynamic Resolution:** Even if `lastpatch/manifest.json` in the git repository contains relative paths (like `/patch.zip`), the Cloudflare Worker automatically rewrites `"patch_url"` to its own public URL (`https://<worker-domain>/patch.zip`), ensuring the Flutter client always downloads through the streaming worker gateway.

### 2. Patch Payload Stream (`GET /patch.zip`)
Streams `lastpatch/patch.zip` directly from GitHub using low-RAM Web Streams (`TransformStream`).
* **Content-Type:** `application/zip`
* **Streaming Model:** Zero-buffer chunk-by-chunk streaming (`chunk read -> chunk write`).
* **Cache-Control:** Edge-cached to ensure fast downloads across devices.

### 3. Health & Diagnostic Endpoint (`GET /status` or `GET /health`)
Returns JSON detailing the upstream GitHub repository, branch, and active endpoint URLs for easy verification:
```json
{
  "service": "Flutter Patcher OTA Streamer",
  "status": "operational",
  "upstream": {
    "owner": "your-username",
    "repo": "flutter_remote_dev",
    "branch": "main",
    "path": "lastpatch/"
  },
  "endpoints": {
    "manifest": "https://<worker-domain>/manifest.json",
    "patch_zip": "https://<worker-domain>/patch.zip"
  }
}
```

---

## Aggressive Caching Architecture
To avoid rebuilding Gradle from scratch on every run:
- **Paths Cached:**
  - `~/.gradle/caches`
  - `~/.gradle/wrapper`
  - `~/.pub-cache`
  - `~/.android/build-cache`
  - Project `build/` and `.dart_tool/`
  - Release keystore & Flutter Patcher keys (`keys/`, `.baseline/`)
- Subsequent patch runs take under **1–2 minutes** instead of 10–15 minutes.

---

## Cloudflare Worker OTA Host (`/worker`)
Cloudflare Workers have a 128MB RAM limit. To ensure safe, high-speed delivery of large patch zip files without out-of-memory errors:
- Uses Web Streams API (`TransformStream` & `ReadableStream`).
- Streams responses from GitHub's `/lastpatch` chunk-by-chunk (`chunk read -> chunk write`).
- Dynamically resolves `patch_url` in `manifest.json` to the worker's domain.
- Sets strict `no-cache` on `manifest.json` for immediate update detection, and edge caching for binary patch archives.

---

## Required Variables & Secrets Checklist

### 1. GitHub Repository Settings
In **Repository Settings -> Actions -> General -> Workflow permissions**:
- Select **"Read and write permissions"** (enables the action to commit `apk/`, `patch/`, and `lastpatch/` back to the repository).

*(Optional Secrets if you want custom app signing instead of auto-generated keystore):*
- `KEYSTORE_BASE64` (Optional)
- `KEYSTORE_PASSWORD` (Optional)
- `KEY_ALIAS` (Optional)
- `KEY_PASSWORD` (Optional)

### 2. Cloudflare Worker Variables (`worker/wrangler.jsonc`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `GITHUB_OWNER` | Your GitHub username or organization | `octocat` |
| `GITHUB_REPO` | Repository name | `flutter_remote_dev` |
| `GITHUB_BRANCH` | Branch to stream `/lastpatch` from | `main` |
| `GITHUB_TOKEN` *(Secret)* | Optional for public repos; **Required** for private repos | `ghp_xxxxxxxxxxxx` |

To set the secret for private repositories:
```bash
cd worker
npx wrangler secret put GITHUB_TOKEN
```

### 3. Flutter App Endpoint
In `flutter_patcher.yaml` and `lib/main.dart`:
- Production Worker Endpoint:
  `https://flutter-remote-dev-patch-worker.mobin-devx.workers.dev`

---

## Quickstart Guide

### 1. Push Code to GitHub
```bash
cd /home/ubuntu/flutter_remote_dev
git init
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/flutter_remote_dev.git
git add .
git commit -m "Initial commit {{native}}"
git push -u origin main
```

### 2. Deploy Cloudflare Worker
```bash
cd /home/ubuntu/flutter_remote_dev/worker
npm install
# Update GITHUB_OWNER in wrangler.jsonc with your username
npx wrangler deploy
```

### 3. Download & Install Release APK
Once the initial `{{native}}` GitHub Action finishes:
```bash
git pull
adb install -r apk/app-release.apk
```

### 4. Test OTA Patching
1. Edit `lib/main.dart`:
   Change:
   ```dart
   static const String dartCodeVersion = "1.0.0 (Baseline)";
   ```
   to:
   ```dart
   static const String dartCodeVersion = "1.0.0-h1 (HOTFIX LIVE! 🎉)";
   static const Color themeAccentColor = Colors.green;
   ```
2. Commit and push **without** `{{native}}`:
   ```bash
   git commit -am "test: apply UI hotfix"
   git push
   ```
3. GitHub Action will build the patch and update `/lastpatch`.
4. Open the app on your phone, tap **"Check & Apply Patch"**, swipe the app away from recents, re-open it, and your new Dart code is live!
