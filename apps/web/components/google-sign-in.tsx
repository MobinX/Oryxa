'use client';

import { signInWithGoogle } from '@/lib/firebase';
import { setAuthSession } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

/** Firebase Google sign-in requires the browser — this is the only client boundary for auth. */
export function GoogleSignInButton() {
  return (
    <Button
      className="w-full"
      size="lg"
      type="button"
      onClick={async () => {
        try {
          const cred = await signInWithGoogle();
          const idToken = await cred.user.getIdToken();
          await setAuthSession(idToken, {
            firebaseUid: cred.user.uid,
            name: cred.user.displayName ?? 'User',
            email: cred.user.email ?? undefined,
          });
        } catch (e) {
          console.error(e);
          alert('Login failed. Check Firebase configuration.');
        }
      }}
    >
      Continue with Google
    </Button>
  );
}
