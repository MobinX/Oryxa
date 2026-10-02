'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type CartLine = {
  /** Stable line id: productId, or `productId:variantId` when a variant is chosen. */
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  price: number;
  qty: number;
  image?: string | null;
};

export type CartAddInput = {
  productId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  price: number;
  image?: string | null;
  qty?: number;
};

type CartContextValue = {
  ready: boolean;
  items: CartLine[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  add: (input: CartAddInput) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
};

const MAX_QTY = 99;

const CartContext = createContext<CartContextValue | null>(null);

function lineKey(productId: string, variantId?: string): string {
  return variantId ? `${productId}:${variantId}` : productId;
}

function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(MAX_QTY, Math.max(1, Math.round(qty)));
}

function storageKey(slug: string): string {
  return `oryxa.storefront.cart.${slug}`;
}

function readCart(slug: string): CartLine[] {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is CartLine => {
        const line = entry as Partial<CartLine>;
        return typeof line.productId === 'string' && typeof line.name === 'string';
      })
      .map((line) => ({
        ...line,
        key: line.key || lineKey(line.productId, line.variantId),
        qty: clampQty(line.qty ?? 1),
      }))
      .slice(0, 50);
  } catch {
    return [];
  }
}

export function CartProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const skipWrite = useRef(true);

  // Hydrate from localStorage after mount so server / client markup match on the first paint.
  useEffect(() => {
    setItems(readCart(slug));
    setReady(true);
    skipWrite.current = true;
  }, [slug]);

  useEffect(() => {
    if (!ready) return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(storageKey(slug), JSON.stringify(items));
    } catch {
      /* private mode / quota — the cart simply stays in memory */
    }
  }, [items, ready, slug]);

  // Keep multiple tabs of the same store in sync.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey(slug)) return;
      setItems(readCart(slug));
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [slug]);

  const add = useCallback((input: CartAddInput) => {
    const key = lineKey(input.productId, input.variantId);
    setItems((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, qty: clampQty(line.qty + (input.qty ?? 1)) } : line,
        );
      }
      return [
        ...current,
        {
          key,
          productId: input.productId,
          variantId: input.variantId,
          name: input.name,
          variantName: input.variantName,
          price: input.price,
          qty: clampQty(input.qty ?? 1),
          image: input.image ?? null,
        },
      ];
    });
  }, []);

  const remove = useCallback((key: string) => {
    setItems((current) => current.filter((line) => line.key !== key));
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((current) =>
      current.map((line) => (line.key === key ? { ...line, qty: clampQty(qty) } : line)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((total, line) => total + line.qty, 0);
    const subtotal = items.reduce((total, line) => total + line.qty * line.price, 0);
    return {
      ready,
      items,
      count,
      subtotal,
      isOpen,
      openCart,
      closeCart,
      add,
      remove,
      setQty,
      clear,
    };
  }, [items, ready, isOpen, add, remove, setQty, clear, openCart, closeCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
