'use client';

import { useFormStatus } from 'react-dom';
import { CornerUpLeft, Forward, Loader2, Send } from 'lucide-react';
import { useAttachmentUploading } from '@/components/mail-attachments';

const ICONS = { send: Send, reply: CornerUpLeft, forward: Forward };

type Props = {
  label?: string;
  pendingLabel?: string;
  icon?: keyof typeof ICONS;
  size?: 'sm' | 'md';
};

export function MailSubmitButton({
  label = 'Send message',
  pendingLabel = 'Sending…',
  icon = 'send',
  size = 'md',
}: Props) {
  const { pending } = useFormStatus();
  const uploading = useAttachmentUploading();
  const blocked = pending || uploading;
  const Icon = ICONS[icon];
  const sizeClass =
    size === 'sm'
      ? 'h-9 gap-1.5 rounded-lg px-3 text-xs'
      : 'h-10 gap-2 rounded-xl px-4 text-sm';
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <button
      type="submit"
      disabled={blocked}
      aria-busy={blocked}
      className={`inline-flex items-center justify-center bg-primary font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${sizeClass}`}
    >
      {blocked ? (
        <Loader2 className={`${iconClass} animate-spin`} aria-hidden />
      ) : (
        <Icon className={iconClass} aria-hidden />
      )}
      {pending ? pendingLabel : uploading ? 'Uploading…' : label}
    </button>
  );
}
