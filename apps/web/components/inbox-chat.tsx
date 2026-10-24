'use client';

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import {
  Check,
  Clock3,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlertDialog } from '@/components/alert-dialog';
import { Input } from '@/components/ui/input';
import type { InboxSuggestion } from '@/lib/api';
import {
  generateSuggestionsAction,
  pollInboxMessagesAction,
  sendInboxReplyAction,
  sendInboxSuggestionAction,
  setAutoPilotAction,
  type InboxMessage,
} from '@/app/actions/inbox';

const money = (value: number) => `৳${value.toFixed(0)}`;

export function InboxChat({
  businessId,
  conversationId,
  customerName,
  createdAt,
  initialMessages,
  initialAutoPilot,
}: {
  businessId: string;
  conversationId: string;
  customerName: string | null;
  createdAt: string;
  initialMessages: InboxMessage[];
  initialAutoPilot: boolean;
}) {
  const [messages, setMessages] = useState<InboxMessage[]>(initialMessages);
  const [autoPilot, setAutoPilot] = useState(initialAutoPilot);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState('Something went wrong');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [toggleSaved, setToggleSaved] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<InboxSuggestion[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [sendingSuggestion, setSendingSuggestion] = useState<string | null>(null);
  const [sentSuggestion, setSentSuggestion] = useState<string | null>(null);
  const [sendPending, startSend] = useTransition();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pollingRef = useRef(false);
  const suggestionKeyRef = useRef<string | null>(null);

  const initials = (customerName || 'C')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const latestCustomerId =
    [...messages].reverse().find((message) => message.from === 'customer')?.id ?? null;
  // Only an unanswered customer turn deserves suggestions; once the merchant speaks,
  // polling keeps the old customer id and must not start another model call.
  const lastMessageFromCustomer =
    messages.length > 0 && messages[messages.length - 1]?.from === 'customer';

  const refresh = useCallback(
    async (manual = false) => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      if (manual) setRefreshing(true);
      try {
        const next = await pollInboxMessagesAction(businessId, conversationId);
        setMessages(next);
      } catch {
        // A failed poll keeps the last good thread on screen; the next tick retries.
      } finally {
        pollingRef.current = false;
        if (manual) setRefreshing(false);
      }
    },
    [businessId, conversationId],
  );

  // Poll the thread every five seconds; a hidden tab does not spend server actions.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refresh(false);
    }, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, suggesting]);

  const suggestionKey = `${autoPilot}:${lastMessageFromCustomer ? latestCustomerId ?? '' : ''}`;

  // A new, unanswered customer turn while auto pilot is off asks the suggestion agent once.
  useEffect(() => {
    if (autoPilot || !latestCustomerId || !lastMessageFromCustomer) {
      setSuggestions([]);
      setSuggesting(false);
      setSuggestionError(null);
      suggestionKeyRef.current = suggestionKey;
      return;
    }
    if (suggestionKeyRef.current === suggestionKey) return;
    suggestionKeyRef.current = suggestionKey;

    let cancelled = false;
    setSuggesting(true);
    setSuggestionError(null);
    generateSuggestionsAction(businessId, conversationId)
      .then((result) => {
        if (!cancelled) setSuggestions(result.suggestions);
      })
      .catch(() => {
        if (cancelled) return;
        suggestionKeyRef.current = null;
        setSuggestionError('Could not suggest a reply. Tap retry.');
      })
      .finally(() => {
        if (!cancelled) setSuggesting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [autoPilot, businessId, conversationId, latestCustomerId, lastMessageFromCustomer, suggestionKey]);

  const toggleAutoPilot = async () => {
    if (savingToggle) return;
    const next = !autoPilot;
    setSavingToggle(true);
    setToggleSaved(false);
    try {
      const result = await setAutoPilotAction(businessId, conversationId, next);
      setAutoPilot(result.autoPilot);
      setToggleSaved(true);
      setTimeout(() => setToggleSaved(false), 1500);
    } catch {
      setErrorTitle("Couldn't update auto pilot");
      setError('Could not change auto pilot. Please try again.');
      setDialogOpen(true);
    } finally {
      setSavingToggle(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sendPending) return;
    startSend(async () => {
      const result = await sendInboxReplyAction(businessId, conversationId, content);
      if (result.error) {
        setErrorTitle("Couldn't send message");
        setError(result.error);
        setDialogOpen(true);
        return;
      }
      setDraft('');
      setSuggestions([]);
      suggestionKeyRef.current = null;
      await refresh(false);
    });
  };

  const retrySuggestions = () => {
    suggestionKeyRef.current = null;
    setSuggestionError(null);
    setSuggesting(true);
    generateSuggestionsAction(businessId, conversationId)
      .then((result) => setSuggestions(result.suggestions))
      .catch(() => setSuggestionError('Could not suggest a reply. Tap retry.'))
      .finally(() => setSuggesting(false));
  };

  const sendCardSuggestion = async (suggestion: InboxSuggestion) => {
    if (suggestion.kind === 'text' || sendingSuggestion) return;
    setSendingSuggestion(suggestion.id);
    const result = await sendInboxSuggestionAction(
      businessId,
      conversationId,
      suggestion.kind === 'product'
        ? { kind: 'product', productId: suggestion.productId }
        : { kind: 'category', categoryId: suggestion.categoryId },
    );
    setSendingSuggestion(null);
    if (result.error) {
      setSuggestionError(result.error);
      return;
    }
    setSentSuggestion(suggestion.id);
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    await refresh(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-4 py-2 dark:border-slate-800 dark:bg-[#111427] sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={autoPilot}
            onClick={toggleAutoPilot}
            disabled={savingToggle}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition',
              autoPilot
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            Auto pilot
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide',
                autoPilot ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white dark:bg-slate-600',
              )}
            >
              {autoPilot ? 'On' : 'Off'}
            </span>
            {savingToggle ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : toggleSaved ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
          </button>
          <span className="text-[10px] text-slate-400">
            {autoPilot ? 'The AI answers this customer' : 'Messages wait for you; AI suggests replies'}
          </span>
          {suggesting && !autoPilot && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5B3DF5] dark:text-indigo-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5B3DF5]" />
              AI is suggesting…
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6"
      >
        <div className="mx-auto mb-1 flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-[11px] text-slate-500 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <Clock3 className="h-3.5 w-3.5" />
          Conversation started{' '}
          {new Date(createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
        {messages.map((message) => {
          const fromCustomer = message.from === 'customer';
          return (
            <div
              key={message.id}
              className={cn('flex items-end gap-2.5', fromCustomer ? 'justify-start' : 'justify-end')}
            >
              {fromCustomer && (
                <div className="mb-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5]/15 text-[10px] font-bold text-[#5B3DF5]">
                  {initials}
                </div>
              )}
              <div className="max-w-[88%] space-y-1.5 sm:max-w-[75%] lg:max-w-[68%]">
                <div
                  className={cn(
                    'space-y-2 rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs',
                    fromCustomer
                      ? 'rounded-bl-xs border border-slate-200/80 bg-white text-slate-900 dark:border-slate-800 dark:bg-[#13172B] dark:text-slate-100'
                      : 'rounded-br-xs bg-[#5B3DF5] text-white',
                  )}
                >
                  {message.images?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {message.images.map((url, index) => (
                        <a key={`${message.id}-${url}`} href={url} target="_blank" rel="noreferrer">
                          <img
                            src={url}
                            alt={`Attachment ${index + 1}`}
                            className="max-h-64 w-auto max-w-full rounded-xl object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {message.content && (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  )}
                </div>
                <time
                  className={cn(
                    'block px-1 text-[10px] text-slate-400',
                    fromCustomer ? 'text-left' : 'text-right',
                  )}
                  dateTime={message.time}
                >
                  {new Date(message.time).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              {!fromCustomer && (
                <div className="mb-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5] text-[10px] font-bold text-white shadow-xs">
                  AI
                </div>
              )}
            </div>
          );
        })}
        {suggesting && !autoPilot && (
          <div className="flex items-end justify-end gap-2.5">
            <div className="max-w-[88%] rounded-2xl rounded-br-xs bg-[#5B3DF5]/85 px-4 py-2.5 text-xs text-white shadow-xs sm:max-w-[75%]">
              <span className="flex items-center gap-2">
                <span className="flex items-end gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90" />
                </span>
                AI is suggesting a reply… you can keep typing.
              </span>
            </div>
            <div className="mb-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5] text-[10px] font-bold text-white shadow-xs">
              AI
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <p className="m-auto text-xs text-slate-400">No messages in this conversation yet.</p>
        )}
      </div>

      {(suggesting || suggestions.length > 0 || suggestionError) && !autoPilot && (
        <div className="shrink-0 border-t border-slate-200/80 bg-[#5B3DF5]/[0.04] px-4 py-3 dark:border-slate-800 dark:bg-[#5B3DF5]/10 sm:px-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#5B3DF5] dark:text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
              {suggesting ? 'AI is suggesting…' : 'AI suggestions'}
            </p>
            {suggestionError && (
              <button
                type="button"
                onClick={retrySuggestions}
                className="text-[10px] font-bold text-rose-600 hover:underline dark:text-rose-400"
              >
                Retry
              </button>
            )}
          </div>
          {suggestionError ? (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">{suggestionError}</p>
          ) : suggesting ? (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reading the conversation and the catalog — you can keep typing.
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((suggestion) => {
                if (suggestion.kind === 'text') {
                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => {
                        setDraft(suggestion.text);
                        inputRef.current?.focus();
                      }}
                      className="min-w-[220px] max-w-[320px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xs transition hover:border-[#5B3DF5]/40 hover:shadow-sm dark:border-slate-700 dark:bg-[#13172B]"
                    >
                      <p className="line-clamp-4 text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                        {suggestion.text}
                      </p>
                      <p className="mt-2 text-[10px] font-bold text-[#5B3DF5] dark:text-indigo-300">
                        Use this reply
                      </p>
                    </button>
                  );
                }

                const busy = sendingSuggestion === suggestion.id;
                const sent = sentSuggestion === suggestion.id;
                return (
                  <div
                    key={suggestion.id}
                    className="min-w-[220px] max-w-[260px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-700 dark:bg-[#13172B]"
                  >
                    {suggestion.kind === 'product' ? (
                      <div className="flex gap-2">
                        {suggestion.imageUrl ? (
                          <img
                            src={suggestion.imageUrl}
                            alt={suggestion.title}
                            className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[9px] text-slate-400 dark:bg-slate-800">
                            No img
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                            {suggestion.title}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {money(suggestion.price)}
                          </p>
                          {suggestion.subtitle && (
                            <p className="line-clamp-2 text-[9px] text-slate-400">{suggestion.subtitle}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                          {suggestion.name}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {suggestion.productCount} products
                        </p>
                        <div className="mt-1 flex gap-1">
                          {suggestion.products.slice(0, 4).map((product) =>
                            product.imageUrl ? (
                              <img
                                key={product.id}
                                src={product.imageUrl}
                                alt={product.name}
                                className="h-8 w-8 rounded object-cover"
                              />
                            ) : null,
                          )}
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void sendCardSuggestion(suggestion)}
                      disabled={busy || sent}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5B3DF5] px-2 py-1.5 text-[10px] font-bold text-white hover:bg-[#4C2EE0] disabled:opacity-60"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Sending…
                        </>
                      ) : sent ? (
                        <>
                          <Check className="h-3 w-3" /> Sent
                        </>
                      ) : (
                        suggestion.kind === 'product' ? 'Send product card' : 'Send category'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="shrink-0 border-t border-border/70 bg-card p-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 pl-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a message..."
            className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            disabled={sendPending}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={sendPending || !draft.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5] text-white transition hover:bg-[#4C2EE0] disabled:opacity-50"
          >
            {sendPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 px-1 text-[10px] text-muted-foreground">
          Replies are sent directly to the customer.
        </p>
      </form>

      <AlertDialog
        open={dialogOpen && Boolean(error)}
        title={errorTitle}
        description={error ?? ''}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
