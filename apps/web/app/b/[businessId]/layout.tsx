'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Sidebar } from '@/components/sidebar';

export default function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { token, loading } = useAuth();
  const router = useRouter();
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setBusinessId(p.businessId));
  }, [params]);

  useEffect(() => {
    if (!loading && !token) router.push('/login');
  }, [token, loading, router]);

  if (loading || !token || !businessId) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar businessId={businessId} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
