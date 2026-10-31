'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Cookie, Settings2, X } from 'lucide-react';
import {
  DEFAULT_CONSENT,
  readConsent,
  writeConsent,
  type ConsentCategories,
  type ConsentRecord,
} from '@/lib/consent';
import { cn } from '@/lib/utils';

type CookieConsentContextValue = {
  consent: ConsentRecord | null;
  acceptAll: () => void;
  rejectOptional: () => void;
  save: (categories: ConsentCategories) => void;
  openPreferences: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function useCookieConsent() {
  return useContext(CookieConsentContext);
}

export const CONSENT_CHANGE_EVENT = 'oryxa-consent-change';

/**
 * Holds the visitor's choice and renders the first-visit banner plus the preferences
 * dialog. It wraps the whole app so storefront analytics can read the same state, and
 * the footer can reopen the dialog later to withdraw consent.
 */
export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const [consent, setConsent] = useState<ConsentRecord | null | undefined>(undefined);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const stored = readConsent();
    setConsent(stored);
    setBannerOpen(!stored);
  }, []);

  const save = useCallback((categories: ConsentCategories) => {
    const record = writeConsent(categories);
    setConsent(record);
    setBannerOpen(false);
    setPreferencesOpen(false);
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }));
  }, []);

  const acceptAll = useCallback(() => save({ analytics: true, marketing: false }), [save]);
  const rejectOptional = useCallback(() => save(DEFAULT_CONSENT), [save]);
  const openPreferences = useCallback(() => {
    setPreferencesOpen(true);
    setBannerOpen(false);
  }, []);

  return (
    <CookieConsentContext.Provider
      value={{ consent: consent ?? null, acceptAll, rejectOptional, save, openPreferences }}
    >
      {children}
      {consent !== undefined && bannerOpen && pathname !== '/cookies' ? (
        <ConsentBanner
          onAcceptAll={acceptAll}
          onReject={rejectOptional}
          onManage={openPreferences}
        />
      ) : null}
      {preferencesOpen ? (
        <ConsentDialog
          onClose={() => {
            setPreferencesOpen(false);
            if (!consent) setBannerOpen(true);
          }}
        />
      ) : null}
    </CookieConsentContext.Provider>
  );
}

function ConsentBanner({
  onAcceptAll,
  onReject,
  onManage,
}: {
  onAcceptAll: () => void;
  onReject: () => void;
  onManage: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-3 z-[100] rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xl shadow-black/20 dark:border-slate-700 dark:bg-[#111427] sm:left-auto sm:right-4 sm:bottom-4 sm:w-[430px] sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5B3DF5]/10 text-[#5B3DF5] dark:text-indigo-300">
          <Cookie className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Your cookie choices</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            We use necessary cookies to sign you in and keep your cart. With your consent we
            use first-party analytics to count store visits anonymously. No advertising
            cookies, and we never sell personal data.{' '}
            <Link href="/cookies" className="font-semibold text-[#5B3DF5] underline-offset-2 hover:underline dark:text-indigo-300">
              Cookie policy
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onAcceptAll}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#5B3DF5] px-3 text-xs font-semibold text-white transition hover:bg-[#4C2EE0]"
        >
          Accept all
        </button>
        <button
          type="button"
          onClick={onReject}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Reject optional
        </button>
        <button
          type="button"
          onClick={onManage}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Manage
        </button>
      </div>
    </div>
  );
}

/**
 * The category switches. Necessary is always on; analytics is optional and the only
 * switch that changes anything today; advertising is shown as unused so the absence of
 * a choice is explicit rather than a hidden default.
 */
export function CookiePreferenceControls({
  onSaved,
  compact = false,
}: {
  onSaved?: () => void;
  compact?: boolean;
}) {
  const context = useCookieConsent();
  const [analytics, setAnalytics] = useState(
    context?.consent?.analytics ?? DEFAULT_CONSENT.analytics,
  );

  useEffect(() => {
    setAnalytics(context?.consent?.analytics ?? DEFAULT_CONSENT.analytics);
  }, [context?.consent?.analytics]);

  const save = (categories: ConsentCategories) => {
    context?.save(categories);
    onSaved?.();
  };

  return (
    <div className={cn('space-y-3', compact && 'space-y-2.5')}>
      <ConsentRow
        title="Strictly necessary"
        description="Sign-in, security, your cart, theme and timezone. Always on."
        checked
        disabled
      />
      <ConsentRow
        title="Analytics"
        description="A random first-party id lets us count store visits without identifying you."
        checked={analytics}
        onChange={setAnalytics}
      />
      <ConsentRow
        title="Advertising"
        description="We do not use advertising or cross-site tracking cookies."
        checked={false}
        disabled
      />

      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <button
          type="button"
          onClick={() => save({ analytics, marketing: false })}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#5B3DF5] px-4 text-xs font-semibold text-white transition hover:bg-[#4C2EE0]"
        >
          <Check className="h-3.5 w-3.5" />
          Save choices
        </button>
        <button
          type="button"
          onClick={() => {
            setAnalytics(false);
            save(DEFAULT_CONSENT);
          }}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Reject optional
        </button>
      </div>
    </div>
  );
}

function ConsentRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 p-3 dark:border-slate-700/70">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${title} cookies`}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
          disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

function ConsentDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#111427]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-sm font-bold text-slate-900 dark:text-white">
              Cookie preferences
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Change your choice any time. See the{' '}
              <Link href="/cookies" className="font-semibold text-[#5B3DF5] hover:underline dark:text-indigo-300">
                cookie policy
              </Link>{' '}
              for the full list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cookie preferences"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">
          <CookiePreferenceControls />
        </div>
      </div>
    </div>
  );
}

/** Footer trigger. Falls back to the policy page if rendered outside the provider. */
export function CookieSettingsButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const context = useCookieConsent();
  if (!context) {
    return (
      <Link href="/cookies#preferences" className={className}>
        {children ?? 'Cookie settings'}
      </Link>
    );
  }
  return (
    <button type="button" onClick={context.openPreferences} className={className}>
      {children ?? 'Cookie settings'}
    </button>
  );
}

/** The preferences block embedded on /cookies. */
export function CookiePreferencesPanel() {
  const context = useCookieConsent();
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-foreground">Your choices</h2>
        {context?.consent ? (
          <span className="text-[10px] text-muted-foreground">
            Saved {new Date(context.consent.updatedAt).toLocaleDateString('en-GB')}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">No choice saved yet</span>
        )}
      </div>
      <CookiePreferenceControls />
    </div>
  );
}
