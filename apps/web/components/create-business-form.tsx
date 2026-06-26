'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBusiness } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function CreateBusinessForm({
  token,
  onCreated,
  onCancel,
}: {
  token: string;
  onCreated?: (businessId: string) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      className="space-y-4"
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
          if (onCreated) {
            onCreated(business.id);
          } else {
            router.push(`/b/${business.id}/dashboard`);
          }
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
          placeholder="Acme Store"
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
          rows={3}
        />
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create business'}
        </Button>
      </div>
    </form>
  );
}
