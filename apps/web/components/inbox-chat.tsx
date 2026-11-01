'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  Check,
  ChevronRight,
  Clock3,
  Info,
  Images,
  List,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlertDialog } from '@/components/alert-dialog';
import { Input } from '@/components/ui/input';
import type { Category, InboxSuggestion, PaymentMethod, PaymentStrategy, ProductDetail, ProductListItem } from '@/lib/api';
import {
  paymentStrategyDescription,
  paymentStrategyLabel,
  requiresUpfrontPayment,
  resolvePaymentStrategy,
} from '@/lib/payment-strategy';
import {
  createInboxOrderAction,
  generateSuggestionsAction,
  getInboxOrderDefaultsAction,
  getInboxProductAction,
  listInboxCategoriesAction,
  pollInboxMessagesAction,
  searchInboxProductsAction,
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
  businessAgentOn,
  paymentMethods,
  paymentStrategy = 'cod',
}: {
  businessId: string;
  conversationId: string;
  customerName: string | null;
  createdAt: string;
  initialMessages: InboxMessage[];
  initialAutoPilot: boolean;
  /** The business-wide switch loaded in SSR: off disables the per-thread auto pilot control. */
  businessAgentOn: boolean;
  /** The merchant's configured payment methods, as edited on the Payments page. */
  paymentMethods: PaymentMethod[];
  /** Store-wide default payment strategy from the Payments page; a product may override it. */
  paymentStrategy?: PaymentStrategy;
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

  // Composer tools: the plus menu, its dialog and the order form.
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'product_list' | 'product_info' | 'product_variant' | 'order' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toolBusy, setToolBusy] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [orderCount, setOrderCount] = useState('1');
  const [orderPayment, setOrderPayment] = useState('Cash on delivery');
  const [orderTxn, setOrderTxn] = useState('');
  const [orderName, setOrderName] = useState(customerName ?? '');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderShipping, setOrderShipping] = useState('');
  const [orderResult, setOrderResult] = useState<{ id: string; totalPrice: number } | null>(null);
  const [orderCardBusy, setOrderCardBusy] = useState(false);
  const [orderCardSent, setOrderCardSent] = useState(false);

  // The merchant's own payment list decides what is offered here and which choice cannot be
  // ordered without a receipt number; the product's payment strategy decides how much must
  // move before the order exists at all. The product rule wins over the store default.
  const chosenMethod = paymentMethods.find((method) => method.name === orderPayment) ?? null;
  const needsTransaction = chosenMethod?.requiresTransactionId === true;
  const orderStrategy = resolvePaymentStrategy(paymentStrategy, selectedProduct?.paymentStrategyOverride);
  const orderShippingNum = orderShipping.trim() ? Number(orderShipping) : undefined;
  const upfrontRequired = requiresUpfrontPayment(
    orderStrategy.effective,
    typeof orderShippingNum === 'number' && Number.isFinite(orderShippingNum) ? orderShippingNum : null,
  );
  const showTransaction = needsTransaction || upfrontRequired;
  const codBlocked = orderStrategy.effective === 'full_prepaid' || upfrontRequired;

  // A product that forbids cash-on-delivery-only ordering must not sit on that choice from
  // the last order: move to the first prepaid method the merchant configured, if there is one.
  useEffect(() => {
    if (!selectedProduct || !codBlocked) return;
    if (orderPayment === 'Cash on delivery' && paymentMethods[0]) {
      setOrderPayment(paymentMethods[0].name);
    }
    // Only the product/strategy change should re-point the choice, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct?.id, orderStrategy.effective, upfrontRequired]);

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

  // The kill switch outranks the thread setting: the button reads as off and cannot be
  // toggled, but the stored per-thread choice is left intact for when it comes back on.
  const effectiveAutoPilot = autoPilot && businessAgentOn;
  // Suggestions exist exactly where automatic replies do not: auto pilot off, business
  // agent off, or both. They are a drafting aid for the merchant, never a sent reply.
  const suggestionsVisible = !effectiveAutoPilot;

  const suggestionKey = `${suggestionsVisible}:${lastMessageFromCustomer ? latestCustomerId ?? '' : ''}`;

  // A new, unanswered customer turn while auto pilot is off asks the suggestion agent once.
  useEffect(() => {
    if (!suggestionsVisible || !latestCustomerId || !lastMessageFromCustomer) {
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
  }, [suggestionsVisible, businessId, conversationId, latestCustomerId, lastMessageFromCustomer, suggestionKey]);

  const toggleAutoPilot = async () => {
    if (savingToggle || !businessAgentOn) return;
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
    if (suggestion.kind === 'order') {
      setDialog('order');
      setMenuOpen(false);
      setOrderName(customerName ?? '');
      setOrderCount(String(suggestion.count && suggestion.count > 0 ? suggestion.count : 1));
      setOrderPhone(suggestion.customerPhone ?? '');
      setOrderAddress(suggestion.customerAddress ?? '');
      await pickProduct(suggestion.productId, 'order');
      if (suggestion.variantId) setSelectedVariantId(suggestion.variantId);
      return;
    }
    setSendingSuggestion(suggestion.id);
    const input: Parameters<typeof sendInboxSuggestionAction>[2] =
      suggestion.kind === 'product'
        ? { kind: 'product', productId: suggestion.productId }
        : suggestion.kind === 'category'
          ? { kind: 'category', categoryId: suggestion.categoryId }
          : suggestion.kind === 'product_info'
            ? { kind: 'product_info', productId: suggestion.productId }
            : suggestion.kind === 'variant'
              ? {
                  kind: 'product_variant',
                  productId: suggestion.productId,
                  variantId: suggestion.variantId,
                }
              : { kind: 'order_card', orderId: suggestion.orderId };
    const result = await sendInboxSuggestionAction(businessId, conversationId, input);
    setSendingSuggestion(null);
    if (result.error) {
      setSuggestionError(result.error);
      return;
    }
    setSentSuggestion(suggestion.id);
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    await refresh(false);
  };

  const toast = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  };

  const openTool = async (kind: 'product_list' | 'product_info' | 'product_variant' | 'order') => {
    setMenuOpen(false);
    setDialog(kind);
    setSelectedProduct(null);
    setSelectedVariantId('');
    setOrderResult(null);
    setOrderCardBusy(false);
    setOrderCardSent(false);
    setOrderTxn('');
    setOrderCount('1');
    setOrderPayment('Cash on delivery');
    setOrderName(customerName ?? '');
    setOrderPhone('');
    setOrderAddress('');
    setOrderShipping('');
    if (kind === 'product_list' && categories.length === 0) {
      const list = await listInboxCategoriesAction(businessId).catch(() => []);
      setCategories(list);
      setCategoryId((current) => current || list[0]?.id || '');
    }
    if (kind === 'order') {
      const defaults = await getInboxOrderDefaultsAction(businessId, conversationId).catch(
        () => null,
      );
      if (defaults) {
        setOrderCount(String(defaults.count > 0 ? defaults.count : 1));
        setOrderPhone(defaults.customerPhone);
        setOrderAddress(defaults.customerAddress);
      }
    }
  };

  const sendToolCards = async (input: Parameters<typeof sendInboxSuggestionAction>[2]) => {
    setToolBusy(true);
    const result = await sendInboxSuggestionAction(businessId, conversationId, input);
    setToolBusy(false);
    if (result.error) {
      setErrorTitle('Could not send');
      setError(result.error);
      setDialogOpen(true);
      return;
    }
    setDialog(null);
    toast(input.kind === 'product_info' || input.kind === 'product_variant'
      ? 'Product cards sent'
      : 'Sent to the customer');
    await refresh(false);
  };

  const pickProduct = async (
    productId: string,
    next: 'product_info' | 'product_variant' | 'order',
  ) => {
    if (next === 'product_info') {
      await sendToolCards({ kind: 'product_info', productId });
      return;
    }
    setToolBusy(true);
    const product = await getInboxProductAction(businessId, productId).catch(() => null);
    setToolBusy(false);
    if (!product) {
      setErrorTitle('Could not load product');
      setError('That product could not be loaded. Try another one.');
      setDialogOpen(true);
      return;
    }
    setSelectedProduct(product);
    const first =
      product.variants.find((variant) => variant.isAvailable && variant.stock > 0) ??
      product.variants[0];
    setSelectedVariantId(first?.id ?? '');
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProduct) return;
    if (codBlocked && (orderPayment === 'Cash on delivery' || !chosenMethod)) {
      setErrorTitle('Prepaid payment needed');
      setError(
        paymentMethods.length
          ? `${paymentStrategyLabel(orderStrategy.effective)}: choose one of the store's prepaid methods (${paymentMethods.map((m) => m.name).join(', ')}) — cash on delivery alone cannot place this order.`
          : `${paymentStrategyLabel(orderStrategy.effective)}: this product needs payment before ordering, but the store has no prepaid method configured. Add one on the Payments page.`,
      );
      setDialogOpen(true);
      return;
    }
    if ((needsTransaction || upfrontRequired) && !orderTxn.trim()) {
      setErrorTitle('Transaction id needed');
      setError(
        upfrontRequired
          ? `${paymentStrategyLabel(orderStrategy.effective)} orders need the transaction id from the customer's upfront payment before the order can be created.`
          : `${orderPayment} orders need the transaction id from the customer.`,
      );
      setDialogOpen(true);
      return;
    }
    setToolBusy(true);
    const result = await createInboxOrderAction(businessId, conversationId, {
      productId: selectedProduct.id,
      variantId: selectedVariantId || undefined,
      count: parseInt(orderCount, 10) || 1,
      customerName: orderName.trim() || customerName || 'Customer',
      customerPhone: orderPhone.trim(),
      customerAddress: orderAddress.trim(),
      shippingCost: orderShipping.trim() ? Number(orderShipping) : undefined,
      paymentMethod: orderPayment,
      transactionId: showTransaction ? orderTxn.trim() || undefined : undefined,
    });
    setToolBusy(false);
    if (result.error) {
      setErrorTitle('Could not create order');
      setError(result.error);
      setDialogOpen(true);
      return;
    }
    setOrderResult({ id: result.id!, totalPrice: result.totalPrice ?? 0 });
    toast('Order created');
    await refresh(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-4 py-2 dark:border-slate-800 dark:bg-[#111427] sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={effectiveAutoPilot}
            onClick={toggleAutoPilot}
            disabled={savingToggle || !businessAgentOn}
            title={businessAgentOn ? undefined : 'The AI agent is turned off for this business. Turn it on in Dashboard.'}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed',
              effectiveAutoPilot
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
              savingToggle || !businessAgentOn ? 'opacity-60' : 'hover:brightness-[0.98]',
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            Auto pilot
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide',
                effectiveAutoPilot ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white dark:bg-slate-600',
              )}
            >
              {effectiveAutoPilot ? 'On' : 'Off'}
            </span>
            {savingToggle ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : toggleSaved ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
          </button>
          <span className="text-[10px] text-slate-400">
            {!businessAgentOn
              ? 'Agent is off for this business. AI still suggests replies.'
              : effectiveAutoPilot
                ? 'The AI answers this customer'
                : 'Messages wait for you; AI suggests replies'}
          </span>
          {suggesting && suggestionsVisible && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#5B3DF5] dark:text-indigo-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5B3DF5]" />
              AI is suggesting…
            </span>
          )}
          {notice && (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {notice}
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
        {suggesting && suggestionsVisible && (
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

      {(suggesting || suggestions.length > 0 || suggestionError) && suggestionsVisible && (
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
                const imageUrl =
                  suggestion.kind === 'category' ? null : suggestion.imageUrl ?? null;
                const title =
                  suggestion.kind === 'category' ? suggestion.name : suggestion.title;
                const subtitle =
                  suggestion.kind === 'product'
                    ? suggestion.subtitle ?? money(suggestion.price)
                    : suggestion.kind === 'category'
                      ? `${suggestion.productCount} products`
                      : suggestion.kind === 'product_info'
                        ? `${suggestion.variantCount} variants · ${money(suggestion.price)}`
                        : suggestion.kind === 'variant'
                          ? `${suggestion.variantName} · ${suggestion.photoCount} photos · ${money(suggestion.price)}`
                          : suggestion.kind === 'order'
                            ? `Make an order · ${money(suggestion.price)}`
                            : suggestion.subtitle;
                const actionLabel =
                  suggestion.kind === 'product'
                    ? 'Send product card'
                    : suggestion.kind === 'category'
                      ? 'Send category'
                      : suggestion.kind === 'product_info'
                        ? 'Send variant cards'
                        : suggestion.kind === 'variant'
                          ? 'Send photos'
                          : suggestion.kind === 'order'
                            ? 'Make order'
                            : 'Send order card';
                return (
                  <div
                    key={suggestion.id}
                    className="min-w-[220px] max-w-[260px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-700 dark:bg-[#13172B]"
                  >
                    <div className="flex gap-2">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={title}
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                        />
                      ) : suggestion.kind === 'category' ? (
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {suggestion.products.slice(0, 4).map((product) =>
                            product.imageUrl ? (
                              <img
                                key={product.id}
                                src={product.imageUrl}
                                alt={product.name}
                                className="h-6 w-6 rounded object-cover"
                              />
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                          {title}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void sendCardSuggestion(suggestion)}
                      disabled={busy || sent}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5B3DF5] px-2 py-1.5 text-[10px] font-bold text-white hover:bg-[#4C2EE0] disabled:opacity-60"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Working…
                        </>
                      ) : sent ? (
                        <>
                          <Check className="h-3 w-3" /> Done
                        </>
                      ) : (
                        actionLabel
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
        {suggesting && suggestionsVisible && (
          <div
            role="status"
            aria-live="polite"
            className="mb-2 flex items-center gap-2 rounded-xl border border-[#5B3DF5]/30 bg-[#5B3DF5]/10 px-3 py-2 text-[11px] font-semibold text-[#5B3DF5] dark:text-indigo-300"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI is suggesting a reply… you can keep typing.
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-1.5 pl-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/20">
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Send a card or make an order"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              disabled={toolBusy}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl border transition',
                menuOpen
                  ? 'border-[#5B3DF5] bg-[#5B3DF5]/10 text-[#5B3DF5]'
                  : 'border-border text-slate-500 hover:bg-muted dark:text-slate-400',
              )}
            >
              {toolBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                <ToolMenuItem
                  icon={<List className="h-4 w-4" />}
                  label="Send product list"
                  hint="Top 15 products by category"
                  onClick={() => void openTool('product_list')}
                />
                <ToolMenuItem
                  icon={<Info className="h-4 w-4" />}
                  label="Send product info"
                  hint="Every variant with its first photo"
                  onClick={() => void openTool('product_info')}
                />
                <ToolMenuItem
                  icon={<Images className="h-4 w-4" />}
                  label="Send product variant"
                  hint="All photos of one variant"
                  onClick={() => void openTool('product_variant')}
                />
                <ToolMenuItem
                  icon={<ShoppingCart className="h-4 w-4" />}
                  label="Make order"
                  hint="Create it for this customer"
                  onClick={() => void openTool('order')}
                />
              </div>
            )}
          </div>
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

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => {
            if (!toolBusy) setDialog(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">
                  {dialog === 'product_list'
                    ? 'Send product list'
                    : dialog === 'product_info'
                      ? 'Send product info'
                      : dialog === 'product_variant'
                        ? 'Send product variant'
                        : 'Make order'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {dialog === 'product_list'
                    ? 'Choose a category; the first 15 products are sent as cards.'
                    : dialog === 'product_info'
                      ? 'Pick a product; every in-stock variant gets its first photo.'
                      : dialog === 'product_variant'
                        ? 'Pick a product, then a variant; all its photos are sent.'
                        : 'Find the product, choose the variant and confirm the order details.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setDialog(null)}
                disabled={toolBusy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-muted disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {dialog === 'product_list' && (
              <div className="space-y-3">
                <label className="block text-[11px] font-semibold" htmlFor="inbox-category">
                  Category
                </label>
                <select
                  id="inbox-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                >
                  <option value="">All products</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.productCount != null ? ` (${category.productCount})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={toolBusy}
                  onClick={() =>
                    void sendToolCards({
                      kind: 'product_list',
                      categoryId: categoryId || undefined,
                    })
                  }
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5B3DF5] py-2 text-xs font-bold text-white hover:bg-[#4C2EE0] disabled:opacity-50"
                >
                  {toolBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send list
                </button>
              </div>
            )}

            {dialog !== 'product_list' && !selectedProduct && (
              <ProductPicker
                businessId={businessId}
                disabled={toolBusy}
                onPick={(id) =>
                  void pickProduct(
                    id,
                    dialog === 'order'
                      ? 'order'
                      : dialog === 'product_variant'
                        ? 'product_variant'
                        : 'product_info',
                  )
                }
              />
            )}

            {dialog === 'product_variant' && selectedProduct && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="text-[11px] font-semibold text-[#5B3DF5] hover:underline"
                >
                  ← Choose another product
                </button>
                <p className="text-xs font-bold">{selectedProduct.name}</p>
                <div className="max-h-[46dvh] space-y-1 overflow-y-auto">
                  {selectedProduct.variants.map((variant) => {
                    const photos = variant.imageUrls?.length || (variant.imageUrl ? 1 : 0);
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={toolBusy || !variant.isAvailable || variant.stock <= 0 || photos === 0}
                        onClick={() =>
                          void sendToolCards({
                            kind: 'product_variant',
                            productId: selectedProduct.id,
                            variantId: variant.id,
                          })
                        }
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-left text-[11px] hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="font-semibold">{variant.name}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {money(variant.price ?? selectedProduct.price)} · {variant.stock} left · {photos} photo
                          {photos === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {dialog === 'order' && selectedProduct && (
              orderResult ? (
                <div className="space-y-3 text-sm">
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">Order created</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Total {money(orderResult.totalPrice)} · linked to this conversation and customer.
                  </p>

                  {orderCardSent ? (
                    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      Track card sent to the customer.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Send the order track card to this customer?
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                        It shows the item photo, status, total and order date.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={orderCardBusy}
                          onClick={async () => {
                            setOrderCardBusy(true);
                            const result = await sendInboxSuggestionAction(
                              businessId,
                              conversationId,
                              { kind: 'order_card', orderId: orderResult.id },
                            );
                            setOrderCardBusy(false);
                            if (result.error) {
                              setErrorTitle('Could not send the track card');
                              setError(result.error);
                              setDialogOpen(true);
                              return;
                            }
                            setOrderCardSent(true);
                            toast('Track card sent');
                            await refresh(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#5B3DF5] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#4C2EE0] disabled:opacity-60"
                        >
                          {orderCardBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Yes, send it
                        </button>
                        <button
                          type="button"
                          disabled={orderCardBusy}
                          onClick={() => setDialog(null)}
                          className="rounded-lg border border-border px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
                        >
                          Don&apos;t send
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Link
                      href={`/b/${businessId}/orders/${orderResult.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted"
                    >
                      Open order
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDialog(null)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submitOrder} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="text-[11px] font-semibold text-[#5B3DF5] hover:underline"
                  >
                    ← Choose another product
                  </button>
                  <p className="text-xs font-bold">{selectedProduct.name}</p>
                  <p
                    role={orderStrategy.isOverride ? 'alert' : undefined}
                    className={
                      orderStrategy.isOverride
                        ? 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
                        : 'rounded-lg bg-[var(--muted)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]'
                    }
                  >
                    <span className="font-semibold text-[var(--foreground)]">
                      Payment: {paymentStrategyLabel(orderStrategy.effective)}
                    </span>
                    {orderStrategy.isOverride ? ' — overrides the store default. ' : ' '}
                    {paymentStrategyDescription(orderStrategy.effective)}
                    {orderStrategy.effective === 'delivery_prepaid'
                      ? ' Enter the delivery charge as Shipping, choose a prepaid method for it, and record its transaction id.'
                      : orderStrategy.effective === 'full_prepaid'
                        ? ' Choose a prepaid method and record its transaction id; cash on delivery alone cannot create this order.'
                        : ''}
                  </p>
                  {selectedProduct.variants.length > 0 && (
                    <label className="block text-[11px] font-semibold">
                      Variant
                      <select
                        value={selectedVariantId}
                        onChange={(event) => setSelectedVariantId(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                      >
                        {selectedProduct.variants.map((variant) => (
                          <option
                            key={variant.id}
                            value={variant.id}
                            disabled={!variant.isAvailable || variant.stock <= 0}
                          >
                            {variant.name} — {money(variant.price ?? selectedProduct.price)} · {variant.stock} left
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] font-semibold">
                      Quantity
                      <Input
                        type="number"
                        min="1"
                        value={orderCount}
                        onChange={(event) => setOrderCount(event.target.value)}
                        className="mt-1 h-9"
                      />
                    </label>
                    <label className="block text-[11px] font-semibold">
                      Shipping (৳)
                      <Input
                        type="number"
                        min="0"
                        value={orderShipping}
                        onChange={(event) => setOrderShipping(event.target.value)}
                        className="mt-1 h-9"
                        placeholder="0"
                      />
                    </label>
                  </div>
                  <label className="block text-[11px] font-semibold">
                    Payment method
                    <select
                      value={orderPayment}
                      onChange={(event) => setOrderPayment(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                    >
                      <option disabled={codBlocked}>Cash on delivery{codBlocked ? ' (not enough for this product)' : ''}</option>
                      {paymentMethods.map((method) => (
                        <option key={method.name}>{method.name}</option>
                      ))}
                    </select>
                  </label>
                  {codBlocked && paymentMethods.length === 0 ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                      This product needs payment before ordering, but the store has no prepaid method configured. Add one on the Payments page.
                    </p>
                  ) : null}
                  {chosenMethod?.info ? (
                    <p className="rounded-lg bg-[var(--muted)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">
                      {chosenMethod.name} money goes to: <span className="font-semibold text-[var(--foreground)]">{chosenMethod.info}</span>
                    </p>
                  ) : null}
                  {showTransaction && (
                    <label className="block text-[11px] font-semibold">
                      Transaction ID{upfrontRequired ? ' (upfront payment)' : ''}
                      <Input
                        value={orderTxn}
                        onChange={(event) => setOrderTxn(event.target.value)}
                        className="mt-1 h-9"
                        placeholder="TrxID from the customer"
                        required
                      />
                    </label>
                  )}
                  <label className="block text-[11px] font-semibold">
                    Customer name
                    <Input
                      value={orderName}
                      onChange={(event) => setOrderName(event.target.value)}
                      className="mt-1 h-9"
                      required
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block text-[11px] font-semibold">
                      Phone
                      <Input
                        value={orderPhone}
                        onChange={(event) => setOrderPhone(event.target.value)}
                        className="mt-1 h-9"
                        placeholder="01XXXXXXXXX"
                        required
                      />
                    </label>
                    <label className="block text-[11px] font-semibold">
                      Address
                      <Input
                        value={orderAddress}
                        onChange={(event) => setOrderAddress(event.target.value)}
                        className="mt-1 h-9"
                        required
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={
                      toolBusy ||
                      (selectedProduct.variants.length > 0 && !selectedVariantId) ||
                      !orderPhone.trim() ||
                      !orderAddress.trim()
                    }
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#5B3DF5] py-2 text-xs font-bold text-white hover:bg-[#4C2EE0] disabled:opacity-50"
                  >
                    {toolBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                    Create order
                  </button>
                </form>
              )
            )}
          </div>
        </div>
      )}

      <AlertDialog
        open={dialogOpen && Boolean(error)}
        title={errorTitle}
        description={error ?? ''}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}

function ToolMenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted/60"
    >
      <span className="mt-0.5 text-[#5B3DF5] dark:text-indigo-300">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-slate-800 dark:text-slate-100">{label}</span>
        <span className="block text-[10px] text-slate-400">{hint}</span>
      </span>
    </button>
  );
}

function ProductPicker({
  businessId,
  disabled,
  onPick,
}: {
  businessId: string;
  disabled: boolean;
  onPick: (productId: string) => void;
}) {
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (query: string) => {
      setLoading(true);
      const rows = await searchInboxProductsAction(businessId, query).catch(() => []);
      setItems(rows);
      setLoading(false);
    },
    [businessId],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(term);
        }}
        className="flex gap-2"
      >
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search products by name or SKU..."
          className="h-9"
        />
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-[11px] font-semibold hover:bg-muted"
        >
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
      </form>
      <div className="max-h-[46dvh] space-y-1 overflow-y-auto">
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No products found.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(item.id)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-border p-2 text-left transition hover:bg-muted/50 disabled:opacity-50"
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.name}
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Package className="h-4 w-4 text-slate-400" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">{item.name}</span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                  {money(item.price)} · {item.variantCount ?? 0} variant
                  {(item.variantCount ?? 0) === 1 ? '' : 's'}
                  {item.paymentStrategyOverride
                    ? ` · ${paymentStrategyLabel(item.paymentStrategyOverride)} payment`
                    : ''}
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
