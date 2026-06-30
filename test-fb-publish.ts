#!/usr/bin/env bun
/**
 * Test Facebook post publishing end-to-end.
 * Pulls the first draft post + its channel's page token from Neon DB,
 * then posts it to the Facebook Graph API via curl.
 *
 * Usage: bun run /home/radix/Dev/Oryxa/test-fb-publish.ts
 */
import 'dotenv/config';
import postgres from 'postgres';
import { execSync } from 'child_process';

const DATABASE_URL = process.env.DATABASE_URL!;
const GRAPH_API = 'https://graph.facebook.com/v21.0';

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

try {
  // 1. Pull the first non-deleted draft post and its channel's page token
  const rows = await sql`
    SELECT
      p.id         AS post_id,
      p.content,
      p.media_urls,
      c.id         AS channel_id,
      c.platform,
      c.platform_channel_id AS page_id,
      c.api_token           AS page_token
    FROM posts p
    JOIN channels c ON c.id = p.channel_id
    WHERE p.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND c.platform    = 'facebook'
    ORDER BY p.created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    console.error('❌ No Facebook posts found in the database. Create one via the dashboard first.');
    process.exit(1);
  }

  const post = rows[0];
  console.log('\n📋 Post pulled from Neon DB:');
  console.log(`   post_id   : ${post.post_id}`);
  console.log(`   channel_id: ${post.channel_id}`);
  console.log(`   platform  : ${post.platform}`);
  console.log(`   page_id   : ${post.page_id}`);
  console.log(`   token     : ${String(post.page_token).slice(0, 10)}… [truncated]`);
  console.log(`   content   : ${String(post.content).slice(0, 80)}${String(post.content).length > 80 ? '…' : ''}`);
  console.log(`   media_urls: ${JSON.stringify(post.media_urls)}\n`);

  // 2. Determine endpoint
  const hasMedia = Array.isArray(post.media_urls) && post.media_urls.length > 0;
  const endpoint = hasMedia
    ? `${GRAPH_API}/${post.page_id}/photos`
    : `${GRAPH_API}/${post.page_id}/feed`;

  // 3. Build curl command and execute
  let curlCmd: string;
  if (hasMedia) {
    curlCmd = [
      'curl', '-sS', '-w', '"\\nHTTP_STATUS: %{http_code}"',
      '-X', 'POST', endpoint,
      '-F', `access_token=${post.page_token}`,
      '-F', `url=${post.media_urls[0]}`,
      '-F', `caption=${post.content}`,
    ].join(' ');
  } else {
    curlCmd = [
      'curl', '-sS', '-w', '"\\nHTTP_STATUS: %{http_code}"',
      '-X', 'POST', endpoint,
      '--data-urlencode', `access_token=${post.page_token}`,
      '--data-urlencode', `message=${post.content}`,
    ].join(' ');
  }

  console.log(`🚀 Firing curl to: ${endpoint}`);
  console.log(`   Endpoint type: ${hasMedia ? '/photos (with media)' : '/feed (text only)'}\n`);
  console.log('--- CURL OUTPUT ---');

  const output = execSync(curlCmd, { encoding: 'utf8', timeout: 20_000 });
  console.log(output);
  console.log('-------------------\n');

  // 4. Try to parse response
  const httpStatusMatch = output.match(/HTTP_STATUS: (\d+)/);
  const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1]) : null;
  const responseBody = output.replace(/HTTP_STATUS: \d+/, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    parsed = responseBody;
  }

  if (httpStatus === 200 || parsed?.id || parsed?.post_id) {
    console.log('✅ SUCCESS! Facebook returned:', JSON.stringify(parsed, null, 2));
    const platformPostId = parsed?.post_id || parsed?.id;
    if (platformPostId) {
      console.log(`\n   Platform Post ID: ${platformPostId}`);
      console.log(`   View at: https://www.facebook.com/${platformPostId}`);
    }
  } else {
    console.error('❌ FAILED. HTTP status:', httpStatus);
    console.error('   Response:', parsed);
    console.error('\n💡 Possible causes:');
    console.error('   1. The page token is expired → re-connect the channel in your dashboard');
    console.error('   2. The token lacks pages_manage_posts scope → re-authorize with updated permissions');
    console.error('   3. ETIMEDOUT → your server/machine cannot reach graph.facebook.com:443');
    console.error('      Run: curl -v https://graph.facebook.com to check connectivity');
  }
} catch (err: any) {
  console.error('💥 Script error:', err?.message ?? err);
  if (err?.code === 'ETIMEDOUT') {
    console.error('\n⚠️  ETIMEDOUT: This machine cannot reach graph.facebook.com.');
    console.error('   This is a network/firewall issue, not a token or code issue.');
    console.error('   Try: curl -v https://graph.facebook.com/');
  }
} finally {
  await sql.end();
}
