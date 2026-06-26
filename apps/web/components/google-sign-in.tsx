'use client';

import { useState } from 'react';
import { signInWithGoogle } from '@/lib/firebase';
import { setAuthSession } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

/** Firebase Google sign-in requires the browser — this is the only client boundary for auth. */
export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      className="w-full"
      size="lg"
      type="button"
      disabled={loading}
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          const cred = await signInWithGoogle();
          const idToken = await cred.user.getIdToken();
          await setAuthSession(idToken, {
            firebaseUid: cred.user.uid,
            name: cred.user.displayName ?? 'User',
            email: cred.user.email ?? undefined,
          });
        } catch (e: any) {
          console.error(e);
          if (
            e?.code === 'auth/cancelled-popup-request' ||
            e?.code === 'auth/popup-closed-by-user'
          ) {
            // Silently ignore user-cancelled or duplicated popup requests
            return;
          }
          alert('Login failed. Check Firebase configuration.');
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? 'Connecting...' : 'Continue with Google'}
    </Button>
  );
}
