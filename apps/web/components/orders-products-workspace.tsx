'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Clock,
  CheckCircle2,
  Truck,
  CreditCard,
  Search,
  MessageSquare,
  Package,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { advanceOrderStateAction, deleteOrderAction } from '@/app/actions/orders';
import { ORDER_STATES, ORDER_STATE_LABEL, normalizeOrderState, nextOrderState, prevOrderState, formatTaka } from '@/lib/order-state';

const NEXT_STATE: Record<string, string> = Object.fromEntries(
  ORDER_STATES.map((st) => [st, nextOrderState(st)]).filter(([, v]) => v),
) as Record<string, string>;

const PREV_STATE: Record<string, string> = Object.fromEntries(
  ORDER_STATES.map((st) => [st, prevOrderState(st)]).filter(([, v]) => v),
) as Record<string, string>;

const STATE_LABEL: Record<string, string> = ORDER_STATE_LABEL;

const ORDER_STAGES: Array<{ id: 'pending' | 'acknowledged' | 'onDelivery' | 'done'; title: string; desc: string }> = [
  { id: 'pending', title: 'Order Placed', desc: 'Awaiting merchant review' },
  { id: 'acknowledged', title: 'Order Confirmed', desc: 'Confirmed & packaging' },
  { id: 'onDelivery', title: 'Handed to Courier', desc: 'Dispatched for delivery' },
  { id: 'done', title: 'Delivered & Completed', desc: 'Customer received parcel' },
];

export interface OrdersProductsWorkspaceProps {
  businessId: string;
  initialOrders?: any[];
  initialProducts?: any[];
}

export function OrdersProductsWorkspace({
  businessId,
  initialOrders = [],
  initialProducts = [],
}: OrdersProductsWorkspaceProps) {
  const [isPending, startTransition] = useTransition();
  const [orderFilterTab, setOrderFilterTab] = useState<'all' | 'pending' | 'acknowledged' | 'onDelivery' | 'done'>('all');
  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Map real database orders
  const ordersList = initialOrders.map((o: any, idx: number) => ({
    id: o.id,
    orderNo: `#${o.id ? o.id.slice(0, 8) : 1000 + idx}`,
    customer: o.customerName || 'Customer',
    phone: o.customerPhone || 'Not provided',
    email: o.customerEmail || '',
    address: o.customerAddress || 'Delivery address on file',
    totalPrice: typeof o.totalPrice === 'number' ? o.totalPrice : parseFloat(o.totalPrice || '0') || 0,
    amount: formatTaka(o.totalPrice),
    state: normalizeOrderState(o.state) as string,
    paymentReference: o.paymentReference || o.txId || null,
    createdAt: o.createdAt ? new Date(o.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently',
  }));

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    return ordersList.length > 0 ? ordersList[0].id : null;
  });

  const activeOrder = ordersList.find((o) => o.id === selectedOrderId) || ordersList[0] || null;

  // Real KPI calculations from live DB data
  const totalOrdersCount = ordersList.length;
  const pendingCount = ordersList.filter((o) => o.state === 'pending').length;
  const processingCount = ordersList.filter((o) => o.state === 'acknowledged').length;
  const deliveredCount = ordersList.filter((o) => o.state === 'done' || o.state === 'onDelivery').length;

  const filteredOrders = ordersList.filter((o) => {
    const matchesTab = orderFilterTab === 'all' || o.state === orderFilterTab;
    const matchesSearch =
      o.customer.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.orderNo.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.phone.toLowerCase().includes(orderSearch.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const filteredProducts = initialProducts.filter((p: any) =>
    (p.name || '').toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku || '').toLowerCase().includes(productSearch.toLowerCase()),
  );

  const handleSetState = (orderId: string, targetState: string) => {
    if (!targetState) return;
    startTransition(async () => {
      try {
        await advanceOrderStateAction(businessId, orderId, targetState);
        setActionMessage(`Order updated to ${STATE_LABEL[targetState] || targetState}`);
        setTimeout(() => setActionMessage(null), 3000);
      } catch (err: any) {
        setActionMessage(`Error updating order: ${err?.message || 'Failed'}`);
        setTimeout(() => setActionMessage(null), 4000);
      }
    });
  };

  const handleAdvanceState = (orderId: string, currentState: string) => {
    const next = NEXT_STATE[currentState];
    if (!next) return;
    handleSetState(orderId, next);
  };

  const handleRevertState = (orderId: string, currentState: string) => {
    const prev = PREV_STATE[currentState];
    if (!prev) return;
    handleSetState(orderId, prev);
  };

  const handleDelete = (orderId: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    startTransition(async () => {
      try {
        await deleteOrderAction(businessId, orderId);
        setActionMessage('Order deleted');
        setTimeout(() => setActionMessage(null), 3000);
      } catch (err: any) {
        setActionMessage(`Error deleting: ${err?.message || 'Failed'}`);
        setTimeout(() => setActionMessage(null), 4000);
      }
    });
  };

  // Timeline steps for the active order
  const timelineSteps = activeOrder
    ? [
        {
          title: 'Order Placed',
          subtitle: `${activeOrder.customer} (${activeOrder.createdAt})`,
          done: true,
        },
        {
          title: 'Order Confirmed',
          subtitle:
            activeOrder.state !== 'pending'
              ? 'Confirmed by merchant / AI agent'
              : 'Awaiting merchant confirmation',
          done: activeOrder.state !== 'pending',
        },
        {
          title: 'Handed to Courier',
          subtitle:
            activeOrder.state === 'onDelivery' || activeOrder.state === 'done'
              ? 'Dispatched for delivery'
              : 'Pending dispatch',
          done: activeOrder.state === 'onDelivery' || activeOrder.state === 'done',
        },
        {
          title: 'Delivered & Completed',
          subtitle: activeOrder.state === 'done' ? 'Customer received parcel' : 'In transit / pending',
          done: activeOrder.state === 'done',
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1380px] p-2 sm:p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-geist text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Orders &amp; Products
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time catalog and customer orders connected to your Facebook channels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actionMessage && (
            <span className="rounded-xl bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-[#5B3DF5] animate-slide-up-fade">
              {actionMessage}
            </span>
          )}
          <Link
            href={`/b/${businessId}/orders/new`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5B3DF5] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-[#5B3DF5]/30 hover:bg-[#4C2EE0] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Order</span>
          </Link>
        </div>
      </div>

      {/* 4 Real KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Orders</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-slate-900 dark:text-white">
            {totalOrdersCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Live count in database</p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pending Orders</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {pendingCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Needs review or packaging</p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">In Processing / Confirmed</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-blue-600 dark:text-blue-400">
            {processingCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Confirmed &amp; packaging</p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Delivered / Dispatched</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {deliveredCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Fulfilled orders</p>
        </div>
      </div>

      {/* 3 Columns: Real Products + Real Orders + Real Order Details */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Products Table (Col-span-4) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Store Catalog</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {initialProducts.length}
              </span>
            </div>
            <Link
              href={`/b/${businessId}/products/new`}
              className="text-xs font-bold text-[#5B3DF5] hover:underline"
            >
              + Add
            </Link>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products or SKU..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#5B3DF5] dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
            />
          </div>
          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800 max-h-[520px] overflow-y-auto flex-1">
            {filteredProducts.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Package className="mx-auto mb-2 h-7 w-7 opacity-40" />
                <p className="text-xs font-semibold">No products found</p>
                <Link
                  href={`/b/${businessId}/products/new`}
                  className="mt-2 inline-block text-xs font-bold text-[#5B3DF5] hover:underline"
                >
                  Add your first product
                </Link>
              </div>
            ) : (
              filteredProducts.map((p: any) => (
                <div key={p.id || p.sku} className="flex items-center justify-between py-2.5 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 px-1 rounded-lg">
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-bold text-slate-900 dark:text-white">
                      {p.name || 'Product'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {p.sku || 'SKU'} · Stock:{' '}
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {p.stock ?? 0}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-slate-900 dark:text-white">
                    {p.priceCents ? `৳${(p.priceCents / 100).toFixed(0)}` : typeof p.price === 'number' ? `৳${p.price.toFixed(0)}` : '৳0'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Real Orders Table (Col-span-4) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Orders</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {ordersList.length}
              </span>
            </div>
            <div className="flex gap-1 text-[10px]">
              {(['all', 'pending', 'acknowledged', 'onDelivery', 'done'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderFilterTab(t)}
                  className={`rounded px-1.5 py-0.5 capitalize transition ${
                    orderFilterTab === t
                      ? 'bg-[#5B3DF5] font-bold text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {t === 'all' ? 'All' : STATE_LABEL[t] || t}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search by customer, phone, or #..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#5B3DF5] dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
            />
          </div>
          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800 max-h-[520px] overflow-y-auto flex-1">
            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <AlertCircle className="mx-auto mb-2 h-7 w-7 opacity-40 text-slate-400" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ordersList.length === 0 ? 'No orders in database' : 'No matching orders'}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 max-w-[220px] mx-auto leading-relaxed">
                  {ordersList.length === 0
                    ? 'Orders from customer Messenger chats and storefront appear here automatically.'
                    : 'Try clearing the search filter.'}
                </p>
                {ordersList.length === 0 && (
                  <Link
                    href={`/b/${businessId}/orders/new`}
                    className="mt-3 inline-block rounded-lg bg-[#5B3DF5] px-3 py-1.5 text-xs font-bold text-white shadow-xs"
                  >
                    + Create First Order
                  </Link>
                )}
              </div>
            ) : (
              filteredOrders.map((o) => {
                const isSelected = activeOrder?.id === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`flex w-full items-center justify-between rounded-xl p-2.5 text-left transition ${
                      isSelected
                        ? 'bg-[#5B3DF5]/10 border border-[#5B3DF5]/30 dark:bg-[#5B3DF5]/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 dark:text-white">{o.orderNo}</span>
                        <span className="text-[10px] text-slate-400">{o.createdAt}</span>
                      </div>
                      <p className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {o.customer}
                      </p>
                      {o.phone && o.phone !== 'Not provided' && (
                        <p className="text-[10px] text-slate-400">{o.phone}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-bold text-slate-900 dark:text-white">{o.amount}</span>
                      <div>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            o.state === 'pending'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              : o.state === 'done'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                          }`}
                        >
                          {STATE_LABEL[o.state] || o.state}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Real Order Details Drawer (Col-span-4) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4 text-xs">
          {activeOrder ? (
            <>
              <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
                <div>
                  <p className="text-[11px] text-slate-400">Order Information</p>
                  <h3 className="font-geist text-lg font-extrabold text-slate-900 dark:text-white">
                    {activeOrder.orderNo}
                  </h3>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    activeOrder.state === 'done'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : activeOrder.state === 'pending'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                  }`}
                >
                  {STATE_LABEL[activeOrder.state] || activeOrder.state}
                </span>
              </div>

              <div>
                <p className="font-bold text-slate-900 dark:text-white">Customer</p>
                <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                  {activeOrder.customer}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  {activeOrder.phone} {activeOrder.email ? `· ${activeOrder.email}` : ''}
                </p>
              </div>

              <div>
                <p className="font-bold text-slate-900 dark:text-white">Delivery Address</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                  {activeOrder.address}
                </p>
              </div>

              {/* Order Amount Card */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-200">Total Order Amount</span>
                  <span className="font-geist text-base font-extrabold text-[#5B3DF5]">
                    {activeOrder.amount}
                  </span>
                </div>
                {activeOrder.paymentReference && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Ref/TrxID: {activeOrder.paymentReference}
                  </p>
                )}
              </div>

              {/* Order Status Stepper & Bidirectional Control */}
              <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900 dark:text-white">Order Pipeline</p>
                  <span className="text-[10px] text-slate-400">Click any step to set</span>
                </div>

                {/* Interactive Clickable Steps */}
                <div className="relative pl-6 space-y-3 border-l-2 border-slate-100 dark:border-slate-800 ml-2">
                  {ORDER_STAGES.map((stage, idx) => {
                    const stepStateOrder = ['pending', 'acknowledged', 'onDelivery', 'done'];
                    const currentIdx = stepStateOrder.indexOf(activeOrder.state);
                    const isPassed = idx <= currentIdx;
                    const isCurrent = activeOrder.state === stage.id;

                    return (
                      <button
                        key={stage.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => handleSetState(activeOrder.id, stage.id)}
                        className={`group relative block w-full text-left transition rounded-lg p-1.5 -ml-1.5 ${
                          isCurrent
                            ? 'bg-[#5B3DF5]/10 border border-[#5B3DF5]/30 dark:bg-[#5B3DF5]/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div
                          className={`absolute -left-[27px] top-2.5 h-3.5 w-3.5 rounded-full border-2 transition ${
                            isCurrent
                              ? 'border-[#5B3DF5] bg-[#5B3DF5] ring-2 ring-[#5B3DF5]/30'
                              : isPassed
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-[#13172B]'
                          }`}
                        />
                        <div className="flex items-center justify-between">
                          <p
                            className={`font-semibold text-xs ${
                              isCurrent
                                ? 'text-[#5B3DF5] dark:text-[#818cf8] font-bold'
                                : isPassed
                                ? 'text-slate-900 dark:text-white'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {stage.title}
                          </p>
                          {isCurrent && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#5B3DF5] bg-[#5B3DF5]/15 px-1.5 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {idx === 0
                            ? `${activeOrder.customer} (${activeOrder.createdAt})`
                            : stage.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Direct State Quick Jump Bar */}
                <div className="pt-2">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                    Quick State Jump (Forward / Backward)
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {ORDER_STAGES.map((s) => {
                      const isSelected = activeOrder.state === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isPending || isSelected}
                          onClick={() => handleSetState(activeOrder.id, s.id)}
                          className={`rounded-lg py-1.5 px-2 text-[11px] font-semibold text-center transition border ${
                            isSelected
                              ? 'bg-[#5B3DF5] border-[#5B3DF5] text-white shadow-xs pointer-events-none'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          {STATE_LABEL[s.id]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Bidirectional Advance / Revert & Chat / Delete */}
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  {/* Revert / Previous State */}
                  {PREV_STATE[activeOrder.state] ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleRevertState(activeOrder.id, activeOrder.state)}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-300/80 bg-amber-50/50 py-2.5 font-bold text-amber-800 hover:bg-amber-100 transition dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-950/40 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Revert to {STATE_LABEL[PREV_STATE[activeOrder.state]]}</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-center rounded-xl border border-slate-100 py-2.5 text-[11px] text-slate-400 dark:border-slate-800">
                      Initial Stage
                    </div>
                  )}

                  {/* Advance / Next State */}
                  {NEXT_STATE[activeOrder.state] ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleAdvanceState(activeOrder.id, activeOrder.state)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-[#5B3DF5] py-2.5 font-bold text-white shadow-md shadow-[#5B3DF5]/20 hover:bg-[#4C2EE0] transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Advance to {STATE_LABEL[NEXT_STATE[activeOrder.state]]}</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Order Fulfilled
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href={`/b/${businessId}/inbox`}
                    className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Open Chat</span>
                  </Link>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDelete(activeOrder.id)}
                    className="flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white py-2 font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30 dark:hover:bg-rose-950/50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-slate-400">
              <Package className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p className="text-xs font-semibold">No order selected</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Select an order from the list to view customer details and manage status.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
