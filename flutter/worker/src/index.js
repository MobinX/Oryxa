/**
 * Cloudflare Worker for Streaming Flutter OTA Patches from GitHub /lastpatch
 *
 * Designed specifically for low-memory environments (128MB worker ceiling).
 * Streams patch files chunk-by-chunk using Web Streams API (zero buffering in RAM).
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(),
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: getCorsHeaders(),
      });
    }

    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    // Normalize path: support root '/', '/manifest.json', or '/lastpatch/manifest.json'
    if (pathname === '/' || pathname === '') {
      pathname = '/manifest.json';
    }

    // Strip leading slash
    let relativePath = pathname.replace(/^\/+/, '');

    // If client requested with /lastpatch/ prefix, strip it so it maps directly
    if (relativePath.startsWith('lastpatch/')) {
      relativePath = relativePath.replace(/^lastpatch\//, '');
    }

    // Prevent path traversal attacks
    if (relativePath.includes('..') || relativePath.startsWith('.')) {
      return new Response('Forbidden', { status: 403, headers: getCorsHeaders() });
    }

    // GitHub repository configuration from environment variables
    const owner = env.GITHUB_OWNER || 'MobinX';
    const repo = env.GITHUB_REPO || 'Oryxa';
    const branch = env.GITHUB_BRANCH || 'main';
    const repoPath = (env.REPO_PATH || 'flutter/lastpatch').replace(/\/+$/, '');
    const githubToken = env.GITHUB_TOKEN;

    // Diagnostic endpoint: /status or /health
    if (relativePath === 'status' || relativePath === 'health') {
      return new Response(
        JSON.stringify(
          {
            service: 'Flutter Patcher OTA Streamer',
            status: 'operational',
            upstream: {
              owner,
              repo,
              branch,
              path: `${repoPath}/`,
            },
            endpoints: {
              manifest: `${url.origin}/manifest.json`,
              patch_zip: `${url.origin}/patch.zip`,
            },
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...getCorsHeaders(),
          },
        }
      );
    }

    // Target file path inside GitHub repo:
    // If requesting APK, map to /flutter/apk/app-release.apk instead of /flutter/lastpatch/
    let targetFilePath;
    if (relativePath === 'app-release.apk' || relativePath === 'apk' || relativePath === 'apk/app-release.apk') {
      targetFilePath = 'flutter/apk/app-release.apk';
    } else {
      targetFilePath = `${repoPath}/${relativePath}`;
    }

    try {
      // -------------------------------------------------------------
      // 1. Manifest Endpoint: Instant, real-time fetch via GitHub API
      // -------------------------------------------------------------
      if (relativePath === 'manifest.json' && request.method === 'GET') {
        const apiHeaders = new Headers({
          'User-Agent': 'Cloudflare-Worker-Flutter-Patcher',
          'Accept': 'application/vnd.github.raw+json',
        });
        if (githubToken) {
          apiHeaders.set('Authorization', `Bearer ${githubToken}`);
        }

        const apiEndpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${targetFilePath}?ref=${branch}`;
        const manifestRes = await fetch(apiEndpoint, {
          headers: apiHeaders,
          cf: { cacheTtl: -1, cacheEverything: false },
        });

        if (!manifestRes.ok) {
          return new Response(
            JSON.stringify({
              error: 'Manifest Not Found',
              message: `Could not retrieve manifest from ${owner}/${repo}@${branch}`,
              status: manifestRes.status,
            }),
            {
              status: manifestRes.status,
              headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
            }
          );
        }

        const manifestData = await manifestRes.json();

        // Dynamically resolve patch_url to this Worker instance
        if (manifestData.patch_url && !manifestData.patch_url.startsWith('http://') && !manifestData.patch_url.startsWith('https://')) {
          const cleanPatchPath = manifestData.patch_url.replace(/^\/+/, '');
          manifestData.patch_url = `${url.origin}/${cleanPatchPath}`;
        }

        return new Response(JSON.stringify(manifestData, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            ...getCorsHeaders(),
          },
        });
      }

      // -------------------------------------------------------------
      // 2. Binary / Static Assets (e.g. patch.zip, .so binaries, images):
      // Must stream chunk-by-chunk to stay under worker low-memory ceiling!
      // -------------------------------------------------------------
      const githubRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${targetFilePath}`;
      const fetchHeaders = new Headers({
        'User-Agent': 'Cloudflare-Worker-Flutter-Patcher',
      });
      if (githubToken) {
        fetchHeaders.set('Authorization', `Bearer ${githubToken}`);
      }

      const githubRes = await fetch(githubRawUrl, {
        method: request.method,
        headers: fetchHeaders,
        cf: {
          cacheTtl: 300,
          cacheEverything: true,
        },
      });

      if (!githubRes.ok) {
        return new Response(
          JSON.stringify({
            error: 'Asset Not Found',
            path: targetFilePath,
            status: githubRes.status,
          }),
          {
            status: githubRes.status,
            headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
          }
        );
      }

      const contentType = getMimeType(relativePath, githubRes.headers.get('content-type'));
      const contentLength = githubRes.headers.get('content-length');
      const etag = githubRes.headers.get('etag');

      const responseHeaders = new Headers({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=120, s-maxage=300',
        ...getCorsHeaders(),
      });

      if (contentLength) responseHeaders.set('Content-Length', contentLength);
      if (etag) responseHeaders.set('ETag', etag);

      if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers: responseHeaders });
      }

      // Chunk read -> Chunk write TransformStream pipeline (Zero buffer memory usage)
      const { readable, writable } = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
      });

      ctx.waitUntil(
        githubRes.body.pipeTo(writable).catch((err) => {
          console.error('Streaming pipeline error:', err);
        })
      );

      return new Response(readable, {
        status: 200,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Internal Worker Gateway Error', details: err.message }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(),
          },
        }
      );
    }
  },
};

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
    'Access-Control-Max-Age': '86400',
  };
}

function getMimeType(filename, fallback) {
  if (filename.endsWith('.apk')) return 'application/vnd.android.package-archive';
  if (filename.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filename.endsWith('.zip')) return 'application/zip';
  if (filename.endsWith('.so')) return 'application/octet-stream';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return fallback || 'application/octet-stream';
}
