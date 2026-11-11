import { NextResponse } from 'next/server';

/**
 * Public Firebase web config for the Flutter app.
 *
 * These values are the same ones `apps/web/lib/firebase.ts` already ships to every browser:
 * they identify the Firebase project, they do not authorise server work. Keeping them here
 * means the mobile build never has to hardcode (or leak) a key that differs per environment.
 */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };

  if (!config.apiKey) {
    return NextResponse.json(
      { error: 'Firebase is not configured on this deployment' },
      { status: 503 },
    );
  }

  return NextResponse.json(config, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
