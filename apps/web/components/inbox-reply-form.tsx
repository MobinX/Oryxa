'use client';

import { useActionState, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
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
        className="shrink-0 border-t border-border/70 bg-card p-3 sm:px-5 sm:py-4"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 pl-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20">
          <Input
            name="content"
            placeholder="Type a message..."
            required
            className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            disabled={pending}
          />
          <Button type="submit" aria-label="Send message" className="h-10 w-10 shrink-0 rounded-xl p-0" disabled={pending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 px-1 text-[10px] text-muted-foreground">Replies are sent directly to the customer.</p>
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
