export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]"
        aria-hidden
      />
      <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}
