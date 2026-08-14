'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog } from '@/components/alert-dialog';
import { sendMessageAction } from '@/app/actions/inbox';

export function InboxReplyForm({
  businessId,
  conversationId,
}: {
  businessId: string;
  conversationId: string;
}) {
  const [state, action, pending] = useActionState(
    sendMessageAction.bind(null, businessId, conversationId),
    { error: null as string | null },
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!pending && state.error) setDialogOpen(true);
  }, [pending, state.error]);

  return (
    <>
      <form
        action={action}
        className="flex flex-col gap-2 border-t border-border/40 p-4 sm:flex-row sm:flex-wrap"
      >
        <Input
          name="content"
          placeholder="Type a reply (bypasses AI)…"
          required
          className="flex-1"
          disabled={pending}
        />
        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          Send
        </Button>
      </form>
      <AlertDialog
        open={dialogOpen && Boolean(state.error)}
        title="Couldn't send message"
        description={state.error ?? ''}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
