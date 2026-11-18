'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  ArrowUpRight,
  Languages,
  Plug,
  RefreshCw,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { ApiError, sendPublicChatMessage, type ChatHistoryTurn } from '@/lib/api';
import { useBrand } from '@/components/brand-provider';
import { useLandingLang } from './theme';

type Bubble = { role: 'user' | 'assistant'; content: string };

const SUGGESTION_ICONS = [Wallet, Languages, Plug];

function TypingDots() {
  return (
    <span className="oo-typing" aria-label="Assistant is typing">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Anonymous landing chat. No account, no token — the API caps each IP at a few
 * turns per day, and the panel says exactly how many are left.
 */
export function ChatWidget() {
  const { lang, strings: t } = useLandingLang();
  const { companyName } = useBrand();
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [bannerOffset, setBannerOffset] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Portal into the landing root (not <body>) so the theme tokens inherit while
  // the widget escapes the content wrapper's stacking context.
  useEffect(() => {
    setPortal(document.querySelector<HTMLElement>('.oo') ?? document.body);
  }, []);

  // The cookie banner owns the bottom-right corner until it is answered. Sit the
  // launcher and panel above it instead of covering a consent dialog, and drop
  // back down the moment it is dismissed. Mobile keeps the full-screen sheet.
  useEffect(() => {
    const measure = () => {
      if (window.innerWidth <= 520) {
        setBannerOffset(0);
        return;
      }
      const banner = document.querySelector<HTMLElement>('[aria-label="Cookie choices"]');
      setBannerOffset(banner ? Math.round(banner.getBoundingClientRect().height) + 28 : 0);
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(message: string) {
    const text = message.trim().slice(0, 500);
    if (!text || sending || exhausted) return;
    const history: ChatHistoryTurn[] = [...bubbles, { role: 'user' as const, content: text }]
      .slice(-8)
      .map((b) => ({ role: b.role, content: b.content }));
    setBubbles((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    scrollDown();
    try {
      const res = await sendPublicChatMessage({
        message: text,
        history: history.slice(0, -1),
        lang,
        brand: companyName,
      });
      setBubbles((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      setRemaining(res.remaining);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setExhausted(true);
        setRemaining(0);
        setBubbles((prev) => [...prev, { role: 'assistant', content: t.chatOutOfChats }]);
      } else {
        setBubbles((prev) => [...prev, { role: 'assistant', content: t.chatError }]);
      }
    } finally {
      setSending(false);
      scrollDown();
    }
  }

  const reset = () => {
    setBubbles([]);
    setInput('');
    inputRef.current?.focus();
  };

  const lift = bannerOffset > 0 ? { bottom: bannerOffset } : undefined;

  const ui = (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.chatOpen}
          title={t.chatOpen}
          className="oo-chat-launcher"
          style={lift}
        >
          <span aria-hidden="true" className="oo-chat-launcher-halo" />
          <Sparkles size={23} aria-hidden="true" />
          <span aria-hidden="true" className="oo-chat-launcher-badge" />
          <span aria-hidden="true" className="oo-chat-launcher-tip">
            {t.chatOpen}
          </span>
        </button>
      )}

      {open && (
        <section
          aria-label={t.chatTitle}
          className="oo-chat-panel"
          style={
            bannerOffset > 0
              ? {
                  bottom: bannerOffset,
                  height: `min(600px, calc(100dvh - ${bannerOffset + 24}px))`,
                }
              : undefined
          }
        >
          <header className="oo-chat-head">
            <span className="oo-chat-avatar" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div className="oo-chat-id">
              <strong>
                {companyName} <em>AI</em>
              </strong>
              <span>
                <i aria-hidden="true" />
                {t.chatStatus}
              </span>
            </div>
            <div className="oo-chat-actions">
              {bubbles.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label={t.chatNewChat}
                  title={t.chatNewChat}
                  className="oo-chat-icon"
                >
                  <RefreshCw size={15} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  launcherRef.current?.focus();
                }}
                aria-label={t.chatClose}
                title={t.chatClose}
                className="oo-chat-icon"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div ref={listRef} role="log" aria-live="polite" className="oo-chat-log">
            {bubbles.length === 0 && (
              <div className="oo-chat-welcome">
                <span className="oo-chat-orb" aria-hidden="true">
                  <Sparkles size={22} />
                </span>
                <h2>{t.chatEmptyTitle}</h2>
                <p>{t.chatWelcome(companyName)}</p>
                <div className="oo-chat-suggestions">
                  {t.chatSuggestions.map((suggestion, index) => {
                    const Icon = SUGGESTION_ICONS[index] ?? Sparkles;
                    return (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void send(suggestion)}
                        className="oo-chat-sug"
                      >
                        <span className="oo-chat-sug-icon" aria-hidden="true">
                          <Icon size={15} />
                        </span>
                        <span className="oo-chat-sug-label">{suggestion}</span>
                        <ArrowUpRight size={15} aria-hidden="true" className="oo-chat-sug-arrow" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {bubbles.map((b, i) => (
              <div key={i} className={`oo-chat-row ${b.role === 'user' ? 'is-me' : 'is-bot'}`}>
                {b.role === 'assistant' && (
                  <span className="oo-chat-avatar oo-chat-avatar-sm" aria-hidden="true">
                    <Sparkles size={11} />
                  </span>
                )}
                <div className="oo-chat-bubble">{b.content}</div>
              </div>
            ))}

            {sending && (
              <div className="oo-chat-row is-bot">
                <span className="oo-chat-avatar oo-chat-avatar-sm" aria-hidden="true">
                  <Sparkles size={11} />
                </span>
                <div className="oo-chat-bubble oo-chat-bubble-typing">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          <div className="oo-chat-meta">
            <span>{remaining !== null ? t.chatRemaining(remaining) : ''}</span>
            {(exhausted || remaining === 0) && <a href="/login">{t.chatSignIn}</a>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="oo-chat-form"
          >
            <div className="oo-chat-composer">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.chatPlaceholder}
                aria-label={t.chatPlaceholder}
                maxLength={500}
                disabled={sending || exhausted}
                className="oo-chat-input"
              />
              <button
                type="submit"
                disabled={sending || exhausted || input.trim().length === 0}
                aria-label={t.chatSend}
                title={t.chatSend}
                className="oo-chat-send"
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="oo-chat-foot">{t.chatFooterNote}</p>
          </form>
        </section>
      )}
    </>
  );

  return portal ? createPortal(ui, portal) : null;
}
