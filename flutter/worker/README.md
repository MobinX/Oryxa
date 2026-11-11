# Flutter Remote Dev - Cloudflare Worker OTA Static Host

This Cloudflare Worker acts as a zero-buffering, low-RAM streaming gateway that serves the `/lastpatch` directory directly from your GitHub repository to Flutter devices.

## Features
- **Chunked Streaming (`chunk read -> chunk write`)**: Streams `patch.zip` and binary payloads directly through Web Streams `TransformStream`, preventing memory exhaustion even on Cloudflare's free plan.
- **Dynamic Manifest Resolution**: Intercepts `manifest.json` and dynamically sets `patch_url` to the worker's own public domain so mobile clients always download patches through this gateway.
- **CORS & Cache Controls**: Provides instantaneous updates for `manifest.json` (`no-cache`) and fast CDN edge caching for binary patch archives.
- **Private Repo Support**: Pass a GitHub Personal Access Token (`GITHUB_TOKEN`) secret to access private repositories.

## Configuration

In `wrangler.jsonc` (or via Cloudflare Dashboard):
```json
{
  "vars": {
    "GITHUB_OWNER": "your-github-username",
    "GITHUB_REPO": "flutter_remote_dev",
    "GITHUB_BRANCH": "main"
  }
}
```

If your repository is private, add your GitHub token as a secret:
```bash
npx wrangler secret put GITHUB_TOKEN
```

## Local Development
```bash
cd worker
npm install
npx wrangler dev
```

## Deployment
```bash
cd worker
npx wrangler deploy
```

Once deployed, copy your worker URL (e.g., `https://flutter-remote-dev-patch-worker.<your-subdomain>.workers.dev`) and enter it in `flutter_patcher.yaml` or directly in the Flutter app's settings field.
