const GRAPH_API = 'https://graph.facebook.com/v21.0';

export function getFacebookOAuthUrl(state: string): string {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;
  const scopes = ['pages_messaging', 'pages_show_list', 'pages_manage_metadata'].join(',');
  return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=${scopes}&state=${state}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    code,
  });

  const res = await fetch(`${GRAPH_API}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error(`Facebook token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getUserPages(userToken: string) {
  const res = await fetch(`${GRAPH_API}/me/accounts?access_token=${userToken}`);
  if (!res.ok) throw new Error(`Failed to fetch pages: ${await res.text()}`);
  const data = (await res.json()) as {
    data: Array<{ id: string; name: string; access_token: string }>;
  };
  return data.data;
}

export async function sendMessage(
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook send message failed: ${err}`);
  }
}

export function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
): boolean {
  if (!signature || !process.env.META_APP_SECRET) return false;
  // Production: implement HMAC-SHA256 verification
  return true;
}
