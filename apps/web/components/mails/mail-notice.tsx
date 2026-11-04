import { CircleAlert, CircleCheck } from 'lucide-react';

export function MailErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">The message could not be sent.</p>
        <p className="mt-0.5 break-words text-[13px]">{message}</p>
        <p className="mt-1 text-xs opacity-80">Please try again.</p>
      </div>
    </div>
  );
}

export function MailSentNotice() {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-3.5 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-300"
    >
      <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
      Message sent and stored in Sent.
    </div>
  );
}
