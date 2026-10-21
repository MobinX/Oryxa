'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  Clock,
  CheckCircle2,
  Truck,
  CreditCard,
  Search,
  MessageSquare,
  ArrowRight,
  Package,
} from 'lucide-react';

const AVATARS = {
  sarah: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
  rafiul: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
  nusrat: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
  tanvir: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
  ayesha: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
  imran: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
};

const DEFAULT_ORDERS = [
  { orderNo: '#1024', customer: 'Sarah Ahmed', phone: '+880 1712 345678', email: 'sarah.ahmed@gmail.com', address: 'House 12, Road 3, Dhanmondi, Dhaka 1205, Bangladesh', amount: '৳2,490', status: 'Pending', txId: 'BK59F2H7M3', verified: false, avatar: AVATARS.sarah },
  { orderNo: '#1023', customer: 'Rafiq Islam', phone: '+880 1811 223344', email: 'rafiq@gmail.com', address: 'Uttara Sector 7, Dhaka 1230, Bangladesh', amount: '৳3,880', status: 'Processing', txId: 'BK88P1M2Q9', verified: true, avatar: AVATARS.rafiul },
  { orderNo: '#1022', customer: 'Nusrat Jahan', phone: '+880 1912 998877', email: 'nusrat@gmail.com', address: 'Banani Road 11, Dhaka 1213, Bangladesh', amount: '৳990', status: 'Confirmed', txId: 'BK12M9X4V1', verified: true, avatar: AVATARS.nusrat },
  { orderNo: '#1021', customer: 'Tanvir Hasan', phone: '+880 1615 445566', email: 'tanvir@gmail.com', address: 'Mirpur 10, Dhaka 1216, Bangladesh', amount: '৳4,990', status: 'Shipped', txId: 'BK77P2Q8W5', verified: true, avatar: AVATARS.tanvir },
  { orderNo: '#1020', customer: 'Ayesha Rahman', phone: '+880 1719 887766', email: 'ayesha@gmail.com', address: 'Gulshan 2, Dhaka 1212, Bangladesh', amount: '৳1,690', status: 'Delivered', txId: 'COD-1020', verified: true, avatar: AVATARS.ayesha },
  { orderNo: '#1019', customer: 'Imran Chowdhury', phone: '+880 1511 334455', email: 'imran@gmail.com', address: 'Bashundhara R/A, Dhaka', amount: '৳2,490', status: 'Pending', txId: 'BK33N9C4R8', verified: false, avatar: AVATARS.imran },
];

const DEFAULT_PRODUCTS = [
  { name: 'Essential Hoodie', sku: 'HD-001', stock: 42, price: '৳2,490' },
  { name: 'Classic T-Shirt', sku: 'TS-002', stock: 120, price: '৳990' },
  { name: 'Cargo Pants', sku: 'CP-003', stock: 35, price: '৳1,890' },
  { name: 'Denim Jacket', sku: 'DJ-004', stock: 18, price: '৳3,290' },
  { name: 'Sneakers', sku: 'SN-005', stock: 27, price: '৳4,990' },
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
  const [orderFilterTab, setOrderFilterTab] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderNo, setSelectedOrderNo] = useState('#1024');
  const [ordersData, setOrdersData] = useState(() => {
    if (initialOrders && initialOrders.length > 0) {
      return initialOrders.map((o: any, idx: number) => ({
        orderNo: `#${o.id?.slice(0, 5) || 1020 + idx}`,
        customer: o.customerName || 'Customer',
        phone: o.customerPhone || '+880 1700 000000',
        email: o.customerEmail || 'customer@gmail.com',
        address: o.shippingAddress || 'Dhaka, Bangladesh',
        amount: o.totalCents ? `৳${(o.totalCents / 100).toFixed(0)}` : '৳2,490',
        status: o.status || 'Pending',
        txId: o.paymentReference || 'BK59F2H7M3',
        verified: o.paymentStatus === 'paid',
        avatar: AVATARS.sarah,
      }));
    }
    return DEFAULT_ORDERS;
  });

  const products = initialProducts && initialProducts.length > 0
    ? initialProducts.map((p: any) => ({
        name: p.name || 'Product',
        sku: p.sku || 'SKU-001',
        stock: p.stock ?? 25,
        price: p.priceCents ? `৳${(p.priceCents / 100).toFixed(0)}` : '৳990',
      }))
    : DEFAULT_PRODUCTS;

  const activeOrder =
    ordersData.find((o) => o.orderNo === selectedOrderNo) || ordersData[0] || DEFAULT_ORDERS[0];

  const totalOrdersCount = ordersData.length > 0 ? 128 : 0;
  const pendingCount = ordersData.filter((o) => o.status === 'Pending').length || 24;
  const processingCount = ordersData.filter((o) => o.status === 'Processing' || o.status === 'Confirmed').length || 18;
  const deliveredCount = ordersData.filter((o) => o.status === 'Delivered').length || 86;

  // Timeline steps for the active order
  const timelineSteps = [
    { title: 'Order Placed', subtitle: `${activeOrder.customer} via Facebook Messenger`, done: true },
    { title: 'bKash Payment Submitted', subtitle: `TxID: ${activeOrder.txId}`, done: true },
    { title: 'Payment Verification', subtitle: activeOrder.verified ? 'Verified automatically' : 'Awaiting confirmation', done: activeOrder.verified },
    { title: 'Order Confirmed & Packed', subtitle: activeOrder.status !== 'Pending' ? 'Packed at warehouse' : 'In queue', done: activeOrder.status !== 'Pending' },
    { title: 'Handed to Courier', subtitle: activeOrder.status === 'Shipped' || activeOrder.status === 'Delivered' ? 'Steadfast Courier' : 'Pending dispatch', done: activeOrder.status === 'Shipped' || activeOrder.status === 'Delivered' },
    { title: 'Delivered', subtitle: activeOrder.status === 'Delivered' ? 'Received & signed' : 'Estimated 24-48 hrs', done: activeOrder.status === 'Delivered' },
  ];

  return (
    <div className="mx-auto max-w-[1380px] p-2 sm:p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-geist text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Orders &amp; Products
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage your products, inventory and customer orders all in one place.
          </p>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Orders</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-slate-900 dark:text-white">
            {totalOrdersCount} <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">↑ 12%</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pending Orders</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-slate-900 dark:text-white">
            {pendingCount} <span className="text-xs font-bold text-rose-500">↑ 8%</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Processing</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-slate-900 dark:text-white">
            {processingCount}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Delivered</p>
          <p className="mt-1 font-geist text-2xl font-extrabold text-slate-900 dark:text-white">
            {deliveredCount} <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">↑ 18%</span>
          </p>
        </div>
      </div>

      {/* 3 Columns: Products Table + Orders Table + Order Details Drawer */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Products Table (Col-span-4) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Products</h2>
            <Link href={`/b/${businessId}/products/new`} className="text-xs font-bold text-[#5B3DF5] hover:underline">
              + Add
            </Link>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#5B3DF5] dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
            />
          </div>
          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800 max-h-[500px] overflow-y-auto">
            {products
              .filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
              .map((p) => (
                <div key={p.sku} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{p.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {p.sku} · Stock: <span className="font-semibold text-slate-600 dark:text-slate-300">{p.stock}</span>
                    </p>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">{p.price}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Orders Table (Col-span-4) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Orders</h2>
            <div className="flex gap-1 text-[11px]">
              {['all', 'Pending', 'Processing', 'Shipped'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderFilterTab(t)}
                  className={`rounded px-2 py-0.5 transition ${
                    orderFilterTab === t
                      ? 'bg-[#5B3DF5] font-bold text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {t}
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
              placeholder="Search orders..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#5B3DF5] dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
            />
          </div>
          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800 max-h-[500px] overflow-y-auto">
            {ordersData
              .filter(
                (o) =>
                  (orderFilterTab === 'all' || o.status === orderFilterTab) &&
                  o.customer.toLowerCase().includes(orderSearch.toLowerCase()),
              )
              .map((o) => (
                <button
                  key={o.orderNo}
                  type="button"
                  onClick={() => setSelectedOrderNo(o.orderNo)}
                  className={`flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left transition ${
                    selectedOrderNo === o.orderNo
                      ? 'bg-[#5B3DF5]/10 dark:bg-[#5B3DF5]/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{o.orderNo}</span>
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{o.customer}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 dark:text-white">{o.amount}</span>
                    <div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          o.status === 'Pending'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : o.status === 'Delivered'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                        }`}
                      >
                        {o.status}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Order Details Drawer (Col-span-4) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4 text-xs">
          <div className="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <div>
              <p className="text-[11px] text-slate-400">Order Details</p>
              <h3 className="font-geist text-xl font-extrabold text-slate-900 dark:text-white">
                {activeOrder.orderNo} · {activeOrder.status}
              </h3>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                activeOrder.verified
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600'
              }`}
            >
              {activeOrder.verified ? 'Payment Verified' : 'Awaiting Payment'}
            </span>
          </div>

          <div>
            <p className="font-bold text-slate-900 dark:text-white">Customer Information</p>
            <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{activeOrder.customer}</p>
            <p className="text-slate-500 dark:text-slate-400">
              {activeOrder.phone} · {activeOrder.email}
            </p>
          </div>

          <div>
            <p className="font-bold text-slate-900 dark:text-white">Delivery Address</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">{activeOrder.address}</p>
          </div>

          {/* bKash Payment Card */}
          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#E2136E]">bKash Payment</span>
              <button
                type="button"
                onClick={() =>
                  setOrdersData((prev) =>
                    prev.map((o) =>
                      o.orderNo === activeOrder.orderNo
                        ? { ...o, verified: !o.verified, status: !o.verified ? 'Confirmed' : 'Pending' }
                        : o,
                    ),
                  )
                }
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
                  activeOrder.verified
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-500/15 text-rose-600 hover:bg-rose-500/25'
                }`}
              >
                {activeOrder.verified ? '✓ Verified' : '! Verify bKash Now'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Transaction ID: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{activeOrder.txId}</span>
            </p>
            <p className="font-bold text-slate-900 dark:text-white">
              Total: ৳2,550 <span className="font-normal text-slate-500">(incl. ৳60 delivery)</span>
            </p>
          </div>

          {/* 6-Step Order Timeline Stepper */}
          <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="font-bold text-slate-900 dark:text-white">Order Timeline</p>
            <div className="relative pl-5 space-y-2.5 border-l-2 border-slate-100 dark:border-slate-800 ml-1.5">
              {timelineSteps.map((step, idx) => (
                <div key={idx} className="relative">
                  <div
                    className={`absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 bg-white dark:bg-[#13172B] ${
                      step.done
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                  <p className={`font-semibold ${step.done ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-slate-400">{step.subtitle}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Link
              href={`/b/${businessId}/inbox`}
              className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-2 font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Contact</span>
            </Link>
            <button
              type="button"
              onClick={() =>
                setOrdersData((prev) =>
                  prev.map((o) =>
                    o.orderNo === activeOrder.orderNo
                      ? {
                          ...o,
                          status:
                            o.status === 'Pending'
                              ? 'Confirmed'
                              : o.status === 'Confirmed'
                              ? 'Shipped'
                              : 'Delivered',
                          verified: true,
                        }
                      : o,
                  ),
                )
              }
              className="rounded-xl bg-[#5B3DF5] py-2 font-bold text-white shadow-md shadow-[#5B3DF5]/20 hover:bg-[#4C2EE0] transition"
            >
              Update Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
