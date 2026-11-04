export function MailErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p className="font-semibold">The message could not be sent.</p>
      <p className="mt-0.5 break-words">{message}</p>
      <p className="mt-1 text-xs">Please try again.</p>
    </div>
  );
}

export function MailSentNotice() {
  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
    >
      Message sent and stored in Sent.
    </div>
  );
}
