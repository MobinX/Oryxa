# Flutter Remote Dev & OTA Hotfix Template

A turnkey, production-ready template designed for developing Flutter applications on **resource-constrained environments** (e.g. 2GB RAM / 2-Core VPS, remote containers, headless Linux servers, Chromebooks) where running Android Gradle compilation locally causes Out-Of-Memory (OOM) crashes.

Full native compilation is offloaded to **GitHub Actions** with aggressive caching, while Dart UI and logic hotfixes are streamed over-the-air to your Android test device via a low-RAM **Cloudflare Worker** streaming directly from this repository's `/lastpatch` directory.

---

## Table of Contents

1. [Architecture & How It Works](#1-architecture--how-it-works)
2. [Why This Template? (Zero-Config Benefits)](#2-why-this-template-zero-config-benefits)
3. [Quick Start: Using This Template for Any New App](#3-quick-start-using-this-template-for-any-new-app)
4. [Commit Triggers: `{{native}}` vs `{{patch}}`](#4-commit-triggers-native-vs-patch)
5. [Real-Time CLI Log & Debugging Tool (`watch.sh`)](#5-real-time-cli-log--debugging-tool-watchsh)
6. [Repository & Directory Structure](#6-repository--directory-structure)
7. [Cloudflare Worker Streaming Architecture](#7-cloudflare-worker-streaming-architecture)
8. [Troubleshooting & Common Questions](#8-troubleshooting--common-questions)

---

## 1. Architecture & How It Works

```
                      +---------------------------------------+
                      | Low-Spec VPS (2GB RAM / 2 Cores)       |
                      | - Write Dart code in lib/             |
                      | - Run: ./scripts/watch.sh to debug    |
                      | - Git commit & push (no local build)  |
                      +-------------------+-------------------+
                                          |
                                      git push
                                          v
                      +---------------------------------------+
                      | GitHub Actions CI/CD                  |
                      | - Aggressive Gradle, pub, build cache |
                      |                                       |
                      | If commit has {{native}}:             |
                      |   * Full compile release APK -> /apk  |
                      |   * Reset baseline & patcher keys     |
                      |   * Set manifest.json has_update=false|
                      |                                       |
                      | If commit has {{patch}}:              |
                      |   * Fast diff build against baseline  |
                      |   * Generates patch.zip (~2MB)        |
                      |   * Sets manifest.json has_update=true|
                      |   * Updates /lastpatch & /patch/      |
                      +-------------------+-------------------+
                                          |
                              Auto-commit release/patch
                                          v
                      +---------------------------------------+
                      | Cloudflare Worker (in /worker)        |
                      | - Acts as high-speed static OTA host  |
                      | - Bypasses GitHub raw CDN caching     |
                      | - Streams binary patch chunk-by-chunk |
                      | - Uses < 2MB RAM (Worker Free Tier)   |
                      +-------------------+-------------------+
                                          |
                                    HTTP GET OTA
                                          v
                      +---------------------------------------+
                      | Android Test Device                   |
                      | - Installed release APK from /apk     |
                      | - Checks worker for manifest.json     |
                      | - Downloads & applies patch.zip       |
                      | - Restart app -> updates applied!     |
                      +-------------------+-------------------+
```

---

## 2. Why This Template? (Zero-Config Benefits)

When creating a new Flutter application, developers usually waste hours configuring Gradle versions, signing keys, AAPT resources, and SDK targets. This template comes **100% pre-configured**:

- **Pre-Configured Android Toolchain:**
  - Gradle **8.14** wrapper pre-installed with `android.newDsl=false`.
  - Android Gradle Plugin (AGP) configured for Java 17 and Flutter 3.x.
  - `compileSdk 36` and `targetSdk 35` pre-set (satisfies Flutter 3.29+ and Android 15/16 requirements).
  - All standard launcher mipmap vector drawables (`res/mipmap-*/`) pre-bundled to eliminate AAPT resource linking errors.
- **Production Keystore Generator:**
  - Automated keystore generation in `scripts/gen_keystore.sh` and CI fallback so release APKs are always properly signed.
- **Aggressive 3-Layer CI Caching:**
  - Layer 1: Gradle caches (`~/.gradle/caches`, `~/.gradle/wrapper`) and Gradle daemon artifacts.
  - Layer 2: Flutter SDK and Pub cache (`~/.pub-cache`, `.dart_tool`).
  - Layer 3: Patcher keys and baseline APKs (`.baseline/`).
  - *Result:* Full native builds complete in 2–3 minutes; OTA patches compile in ~60–90 seconds.
- **Streaming Cloudflare Worker:**
  - Uses native Fetch and Web Streams API (`TransformStream`) to deliver binary patch chunks without buffering entire files in memory.
  - Real-time GitHub API integration bypasses GitHub's 300-second raw CDN cache, delivering 0-second manifest updates to devices.

---

## 3. Quick Start: Using This Template for Any New App

To use this setup for your own new Flutter app, you do **not** need to manually configure permissions, worker endpoints, or tokens.

### Step 1: Use Template or Clone
```bash
git clone https://github.com/MobinX/flutter_remote_dev.git my_new_app
cd my_new_app
git remote set-url origin https://github.com/<YOUR_USER>/<YOUR_NEW_REPO>.git
```

### Step 2: One-Command Automated Setup (Recommended)
Run the bundled onboarding script:
```bash
./scripts/setup_template.sh
```
Or non-interactively by supplying your tokens:
```bash
./scripts/setup_template.sh \
  --github-token "ghp_yourGithubPersonalAccessToken" \
  --cf-token "cfat_yourCloudflareApiToken" \
  --yes
```

#### What `setup_template.sh` Automatically Does:
1. **GitHub Actions Write Permission API Call:**
   Calls `PUT /repos/:owner/:repo/actions/permissions/workflow` with `{"default_workflow_permissions": "write"}` so the CI runner can push the generated APK and `/lastpatch` artifacts back to the repository without manual browser settings.
2. **Authenticated Git Origin Setup:**
   Configures your local Git remote with your GitHub token so your VPS can push cleanly.
3. **Cloudflare Account & Worker Auto-Deployment:**
   Detects your Cloudflare Account ID and workers subdomain, updates `worker/wrangler.toml` with your new repository name, and deploys the streaming worker via Wrangler.
4. **Endpoint Linking:**
   Injects the deployed worker live URL directly into `flutter_patcher.yaml`.
5. **Secure Local Persistence (`.env`):**
   Saves credentials in `.env` with strict permissions (`chmod 600`), adds `.env` to `.gitignore`, and makes `./scripts/watch.sh` work instantly without entering tokens again.

---

### Alternative: Manual Step-by-Step Setup

If you prefer manual configuration without running the onboarding script:

1. **Enable GitHub Actions Permissions Manually:**
   - In GitHub, navigate to **Settings > Actions > General > Workflow permissions**.
   - Check **Read and write permissions**.
2. **Deploy Cloudflare Worker:**
   ```bash
   cd worker
   npm install
   # Update wrangler.toml with your GITHUB_OWNER and GITHUB_REPO
   npx wrangler deploy
   ```
3. **Update Client Config:**
   - Copy the worker URL from the deploy output and update `flutter_patcher.yaml`:
     ```yaml
     patch_server:
       manifest_url: "https://<your-worker>.workers.dev/manifest.json"
     ```
4. **Create `.env`:**
   ```bash
   cp .env.example .env
   # Add your GITHUB_TOKEN and CLOUDFLARE_API_TOKEN
   chmod 600 .env
   ```

---

### Step 3: Trigger the Initial Native Build
Run:
```bash
git add .
git commit -m "Initial release build {{native}}"
git push origin main
```
- GitHub Actions will build `apk/app-release.apk` and establish your `.baseline/base-app-release.apk`.
- Download `apk/app-release.apk` and install it on your Android test phone.

---

## 4. Commit Triggers: `{{native}}` vs `{{patch}}`

The CI/CD pipeline inspects your commit message to decide whether to do a full compilation, an incremental OTA patch, or skip execution to save runner minutes:

| Tag in Commit Message | Action Taken by CI | Typical Time | When to Use |
| :--- | :--- | :--- | :--- |
| **`{{native}}`** | Full Release APK compilation | ~2.5 - 3 min | When adding native Java/Kotlin plugins, editing `AndroidManifest.xml`, changing Gradle dependencies, or bumping app version in `pubspec.yaml`. |
| **`{{patch}}`** | Fast OTA Diff Patch | ~60 - 90 sec | When editing Dart code (`lib/`), modifying UI, fixing business logic, or updating assets. |
| *(None)* | **Skipped** | 0 sec | For documentation changes, README edits, or local work. Saves GitHub runner minutes. |

### Examples:

#### 1. Applying an OTA Patch (Daily Development):
You changed a button color, fixed a bug, or added a new screen in `lib/`:
```bash
git add lib/
git commit -m "fix: update checkout screen and button styling {{patch}}"
git push origin main
```
- The CI compiles only the Dart difference against the baseline APK.
- It produces `lastpatch/patch.zip` and updates `lastpatch/manifest.json`.
- Open your app on your Android phone, tap **"Check for Update"**, and the new code runs instantly!

#### 2. Building a Native Release (Version Bumps / Native Plugins):
You bumped `pubspec.yaml` to `version: 1.0.2+3` or added a native Android plugin (e.g. camera, Bluetooth):
```bash
git add .
git commit -m "feat: bump version to 1.0.2 and add camera plugin {{native}}"
git push origin main
```
- The CI compiles `apk/app-release.apk` for version code `3`.
- It **resets** the patcher keys and wipes previous `lastpatch/patch.zip` files.
- It sets `has_update: false` in `manifest.json` targeting version code `3`.
- Install the new APK on your device to continue patching against the new baseline.

---

## 5. Real-Time CLI Log & Debugging Tool (`watch.sh`)

Working on a headless VPS without a browser? Use the bundled `scripts/watch.sh` tool to monitor workflow runs, view live step progress, and extract error logs directly in your terminal.

### Usage:

```bash
# Auto-detect latest run (automatically watches if running, or displays summary if complete)
./scripts/watch.sh

# Watch the workflow run live in your terminal
./scripts/watch.sh -w

# View recent 10 workflow runs with status icons and IDs
./scripts/watch.sh -r

# View the last 50 lines of logs
./scripts/watch.sh -l

# View the last 150 lines of logs
./scripts/watch.sh -l -n 150

# Extract ONLY errors and failure traces from a failed build
./scripts/watch.sh -e

# Inspect a specific previous run ID
./scripts/watch.sh -i 42761029070 -e
```

### Example Terminal Output:

```
=== Latest GitHub Action Run Status ===

Run ID: 42764345655
Commit: feat(native): bump to v1.0.1+2, add native permission and reset patch baseline {{native}}
Status: completed | Conclusion: success
URL:    https://github.com/MobinX/flutter_remote_dev/actions/runs/42764345655
--------------------------------------------------------------------------------
#       STEP NAME                                     STATUS       RESULT    
--------------------------------------------------------------------------------
1    ✅ Set up job                                    completed    success   
2    ✅ Checkout Source Code                          completed    success   
3    ✅ Inspect Commit Message for {{patch}} or {{nat completed    success   
4    ⏩ Log Skipped Execution                         completed    skipped   
5    ✅ Setup Java 17                                 completed    success   
6    ✅ Setup Flutter SDK                             completed    success   
7    ✅ Aggressive Gradle & Pub Cache                 completed    success   
8    ✅ Baseline Release & Patcher Keys Cache         completed    success   
9    ✅ Ensure Signing Keystore Exists                completed    success   
10   ✅ Install Flutter & Dart Dependencies           completed    success   
11   ✅ Full Native Release Build                     completed    success   
12   ⏩ Generate Production OTA Patch                 completed    skipped   
13   ✅ Commit & Push Release Artifacts to GitHub     completed    success   
--------------------------------------------------------------------------------
```

---

## 6. Repository & Directory Structure

```
├── .baseline/
│   └── base-app-release.apk     # Current baseline APK used to generate diff patches
├── .github/
│   └── workflows/
│       └── build_or_patch.yml   # Multi-layered CI/CD pipeline
├── android/                     # Pre-configured Gradle 8.14 & compileSdk 36
├── apk/
│   └── app-release.apk          # Latest compiled installable release APK
├── lastpatch/
│   ├── manifest.json            # Active OTA manifest served to mobile devices
│   └── patch.zip                # Active compressed Dart diff patch (present during patch cycles)
├── patch/                       # Permanent history archive of previous patches by version
├── lib/
│   └── main.dart                # Application entrypoint with built-in patch checker & logger
├── scripts/
│   ├── watch.sh                 # Fast CLI monitor & log debugger
│   ├── watch_action.sh          # Full log streaming and monitor engine
│   └── gen_keystore.sh          # Keystore setup script
├── worker/
│   ├── src/index.js             # Low-RAM Cloudflare Worker streaming proxy
│   └── wrangler.toml            # Cloudflare deployment settings
├── flutter_patcher.yaml         # Patcher client configuration
└── pubspec.yaml                 # Dependencies and version configuration
```

---

## 7. Cloudflare Worker Streaming Architecture

The Cloudflare Worker in `worker/src/index.js` acts as an edge proxy between mobile devices and GitHub:

1. **Manifest Requests (`GET /manifest.json`):**
   - Fetched in real time from the GitHub API using `Accept: application/vnd.github.raw+json` and `cacheTtl: -1`.
   - **Why?** Bypasses GitHub's `raw.githubusercontent.com` 5-minute CDN cache so client devices receive updates within 1 second of CI completion.
   - Dynamically replaces relative `patch_url: "/patch.zip"` with the worker's fully qualified domain.
2. **Patch Binary Requests (`GET /patch.zip`):**
   - Transferred via chunked HTTP streaming using `TransformStream`.
   - The worker never buffers the 2–5MB zip file in RAM, maintaining memory usage under 2MB (well within Cloudflare's 128MB free tier limit).
   - If no patch exists (e.g. fresh native release), returns clean `404 Not Found`.

---

## 8. Troubleshooting & Common Questions

### Q: Why did my build skip in GitHub Actions?
**Answer:** The workflow only executes when your commit message includes `{{patch}}` or `{{native}}`. If neither tag is present, CI skips to preserve free runner minutes.

### Q: Can an OTA patch change native code (Android / iOS plugins)?
**Answer:** No. Over-The-Air patching applies to the Dart VM runtime (UI widgets, business logic, state management, HTTP endpoints). If you add a package that contains Android Kotlin/Java code, you must push with `{{native}}` and reinstall the generated APK from `/apk`.

### Q: How does the app verify patch integrity?
**Answer:** The worker manifest contains an MD5 hash of `patch.zip`. Before applying, the app computes the cryptographic MD5 hash of the downloaded zip. If the hash does not match, the patch is discarded to prevent corrupted state.

### Q: How do I pull the latest APK or patch back to my VPS?
**Answer:**
```bash
git pull origin main
```
The newly compiled `apk/app-release.apk` and `lastpatch/manifest.json` will be fetched directly to your local workspace.
