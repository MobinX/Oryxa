'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { getIdToken } from '@/lib/firebase';
import { syncUser as syncUserApi } from '@/lib/api';

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ user: null, token: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
        try {
          await syncUserApi({
            firebaseUid: firebaseUser.uid,
            name: firebaseUser.displayName ?? 'User',
            email: firebaseUser.email ?? undefined,
            signInMethod: 'google',
          });
        } catch (e) {
          console.error('User sync failed:', e);
        }
      } else {
        setToken(null);
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function refreshToken(): Promise<string | null> {
  return getIdToken();
}
