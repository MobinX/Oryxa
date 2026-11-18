'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  Check,
  Copy,
  MessageSquareText,
  Package,
  Plug,
  Send,
  Sparkles,
  Wallet,
} from 'lucide-react';

import {
  ApiError,
  getAssistantQuota,
  sendAssistantChatMessage,
  type AssistantQuota,
  type ChatHistoryTurn,
} from '@/lib/api';

type Bubble = { role: 'user' | 'assistant'; content: string; failed?: boolean };

const SUGGESTIONS = [
  { icon: Wallet, label: 'What plan am I on?', text: 'What plan am I on and what does it include?' },
  { icon: Plug, label: 'Connect a channel', text: 'How do I connect a Facebook page or channel to my store?' },
  { icon: Package, label: 'Add a product', text: 'How do I add a product with photos, price and stock?' },
  { icon: MessageSquareText, label: 'Reply setup', text: 'How do I set up automatic replies for customer messages?' },
];

function quotaSummary(quota: AssistantQuota | null): { label: string; percent: number; low: boolean } {
  if (!quota) return { label: '', percent: 0, low: false };
  if (quota.assistantLimit === null) {
    return {
      label: quota.used === 0 ? 'Unlimited chats' : `${quota.used} chats used · unlimited`,
      percent: 0,
      low: false,
    };
  }
  const left = Math.max(0, quota.assistantLimit - quota.used);
  const percent = quota.assistantLimit > 0 ? Math.min(100, (quota.used / quota.assistantLimit) * 100) : 0;
  return {
    label: `${left} of ${quota.assistantLimit} chats left`,
    percent,
    low: left <= Math.max(1, Math.round(quota.assistantLimit * 0.2)),
  };
}

/** Tiny inline formatter: **bold** and `code` only — no HTML injection. */
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={`${keyPrefix}-${index}`}
          className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[0.85em] text-slate-800 dark:bg-slate-700/70 dark:text-slate-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

function MessageBody({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={index} className="flex gap-2 pl-0.5">
              <span aria-hidden="true" className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
              <span>{renderInline(bullet[1] ?? '', `l${index}`)}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={index} className="h-1" />;
        return (
          <p key={index} className="m-0">
            {renderInline(line, `l${index}`)}
          </p>
        );
      })}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  );
}

/**
 * Logged-in assistant. The bearer spends the business's 30-day assistant
 * budget; the meter above the thread always shows what is left.
 */
export function AssistantClient({
  token,
  businessId,
  companyName,
  initialQuota,
}: {
  token: string;
  businessId: string;
  companyName: string;
  initialQuota: AssistantQuota | null;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [quota, setQuota] = useState<AssistantQuota | null>(initialQuota);
  const [copied, setCopied] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const blocked = quota?.blocked ?? false;
  const meter = quotaSummary(quota);
  const userInitial = companyName.trim().charAt(0).toUpperCase() || 'S';

  // Keep the newest turn in view — the log grows downward, like every chat.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [bubbles, sending]);

  // Grow the composer with its content, up to four lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input]);

  async function send(message: string) {
    const text = message.trim().slice(0, 1000);
    if (!text || sending || blocked) return;
    const history: ChatHistoryTurn[] = [...bubbles, { role: 'user' as const, content: text }]
      .slice(-10)
      .map((b) => ({ role: b.role, content: b.content }));
    setBubbles((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    try {
      const res = await sendAssistantChatMessage(token, businessId, {
        message: text,
        history: history.slice(0, -1),
        lang: 'en',
        brand: companyName,
      });
      setBubbles((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      const fresh = await getAssistantQuota(token, businessId).catch(() => null);
      if (fresh) setQuota(fresh.quota);
    } catch (err) {
      const messageText =
        err instanceof ApiError && err.status === 429
          ? 'You have used this cycle’s assistant chats. They reset soon — or move to a bigger plan in Billing.'
          : 'Something went wrong. Please try again.';
      setBubbles((prev) => [...prev, { role: 'assistant', content: messageText, failed: true }]);
      if (err instanceof ApiError && err.status === 429) {
        const fresh = await getAssistantQuota(token, businessId).catch(() => null);
        if (fresh) setQuota(fresh.quota);
      }
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function copy(index: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(index);
      window.setTimeout(() => setCopied((value) => (value === index ? null : value)), 1600);
    } catch {
      /* clipboard blocked — the text is selectable anyway */
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-6rem)] min-h-[480px] w-full max-w-4xl flex-col gap-3 sm:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-7.5rem)]">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm shadow-slate-900/[0.03] backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#5B3DF5] text-white shadow-lg shadow-[#5B3DF5]/25">
            <Sparkles className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              AI Assistant
            </h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Store copilot for {companyName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quota && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 dark:border-slate-700/70 dark:bg-slate-800/50">
              <p className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${meter.low ? 'bg-amber-500' : 'bg-emerald-500'}`}
                />
                {meter.label}
              </p>
              {quota.assistantLimit !== null && quota.assistantLimit > 0 && (
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all ${
                      meter.low ? 'bg-amber-500' : 'bg-[#5B3DF5]'
                    }`}
                    style={{ width: `${meter.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {bubbles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setBubbles([]);
                setInput('');
                inputRef.current?.focus();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </div>
      </header>

      {/* Thread */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-busy={sending}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white p-4 sm:p-5 dark:border-slate-800 dark:from-slate-900/60 dark:to-slate-900"
      >
        {bubbles.length === 0 && (
          <div className="m-auto w-full max-w-lg py-4 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5B3DF5]/10 text-[#5B3DF5] dark:text-[#A78BFA]">
              <Sparkles className="h-6 w-6" />
            </span>
            <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
              How can I help?
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Ask about orders, products, channels, payments or your plan. I answer from
              your store&apos;s own settings.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={sending || blocked}
                  onClick={() => void send(s.text)}
                  className="group flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-left text-xs font-medium text-slate-700 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-[#5B3DF5]/40 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-[#8B5CF6]/50 dark:hover:text-white"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-[#5B3DF5]/10 group-hover:text-[#5B3DF5] dark:bg-slate-700/60 dark:text-slate-400 dark:group-hover:text-[#C4B5FD]">
                    <s.icon className="h-3.5 w-3.5" />
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {bubbles.map((b, i) => {
          const isUser = b.role === 'user';
          return (
            <div
              key={i}
              className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {isUser ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                  {userInitial}
                </span>
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5] text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
              )}
              <div
                className={`group relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[75%] ${
                  isUser
                    ? 'rounded-br-md bg-[#5B3DF5] text-white shadow-[#5B3DF5]/20'
                    : b.failed
                      ? 'rounded-bl-md border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
                      : 'rounded-bl-md border border-slate-200/80 bg-white text-slate-800 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-100'
                }`}
              >
                <MessageBody content={b.content} />
                {!isUser && !b.failed && (
                  <button
                    type="button"
                    onClick={() => void copy(i, b.content)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 opacity-0 shadow-sm transition hover:text-slate-700 group-hover:opacity-100 focus-visible:opacity-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
                    aria-label="Copy reply"
                    title="Copy reply"
                  >
                    {copied === i ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex items-end gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5B3DF5] text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200/80 bg-white px-4 py-3 text-slate-400 dark:border-slate-700/70 dark:bg-slate-800/80">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm shadow-slate-900/[0.03] focus-within:border-[#5B3DF5]/50 focus-within:ring-2 focus-within:ring-[#5B3DF5]/10 dark:border-slate-800 dark:bg-slate-900">
        {blocked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This cycle’s assistant chats are used up. They reset{' '}
              {quota?.cycle.resetsAt ? `on ${quota.cycle.resetsAt}` : 'soon'}.
            </p>
            <Link
              href={`/b/${businessId}/billing`}
              className="inline-flex items-center gap-1 rounded-lg bg-[#5B3DF5] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#4a32e0]"
            >
              Upgrade plan
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={`Ask about ${companyName}…`}
              aria-label="Ask about your store"
              maxLength={1000}
              disabled={sending}
              className="max-h-[132px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:opacity-60 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={sending || input.trim().length === 0}
              aria-label="Send message"
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5] text-white shadow-sm shadow-[#5B3DF5]/25 transition hover:bg-[#4a32e0] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
            >
              {sending ? <Send className="h-4 w-4 animate-pulse" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </form>
        )}
        <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
          <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
          <span className="sm:hidden">Enter to send</span>
          {input.length > 800 && <span>{input.length}/1000</span>}
        </div>
      </div>
    </div>
  );
}
