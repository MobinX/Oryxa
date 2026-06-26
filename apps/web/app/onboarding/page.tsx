'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { createBusiness } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';

export default function OnboardingPage() {
  const { token, loading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (!token) {
    router.push('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <h1 className="text-2xl font-bold">Set up your business</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Tell us about your store to get started.
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            try {
              const business = await createBusiness(token, {
                name,
                description,
                hasTradeLicense: false,
                hasTaxLicense: false,
              });
              router.push(`/b/${business.id}/dashboard`);
            } catch (err) {
              alert('Failed to create business');
              console.error(err);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div>
            <label className="text-sm font-medium">Business name</label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              className="mt-1"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What do you sell?"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create workspace'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
