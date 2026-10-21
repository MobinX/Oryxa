'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Search,
  Sparkles,
  ShoppingBag,
  CreditCard,
  Truck,
  Bell,
  CheckCircle2,
  ArrowRight,
  Terminal,
  Play,
  Pause,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMPANY_NAME } from '@/lib/brand';

type StepInfo = {
  id: number;
  number: string;
  title: string;
  tagline: string;
  icon: React.ElementType;
  color: string;
  statusText: string;
  terminalLog: string;
  metric: string;
  actionDetails: string;
};

const PIPELINE_STEPS: StepInfo[] = [
  {
    id: 1,
    number: '01',
    title: 'Customer Inquiry Received',
    tagline: 'Meta Webhook Receiver',
    icon: MessageSquare,
    color: 'from-blue-500 to-indigo-600',
    statusText: 'Webhook 200 OK · Instant Ingest',
    terminalLog: `POST /webhooks/facebook
Payload: {
  platform: "facebook_messenger",
  senderId: "psid_7829104",
  message: "Black hoodie size L ache? Cash on delivery hobe?"
} -> Agent runner invoked asynchronously (12ms)`,
    metric: '12ms Ingest',
    actionDetails:
      'Meta Send API receives the customer message, emits 200 OK immediately to prevent timeout, and kicks off the background agent runner.',
  },
  {
    id: 2,
    number: '02',
    title: 'LangGraph Catalog Search',
    tagline: 'Vector RAG & Inventory Check',
    icon: Search,
    color: 'from-purple-500 to-indigo-600',
    statusText: 'Embedding Match 98.4%',
    terminalLog: `Executing search_products_tool(query="black hoodie size L")
[DB Query]: SELECT * FROM products WHERE name ILIKE '%hoodie%'
Match Found: "Essential Black Hoodie"
Variant: Size L · SKU: HD-001-L
Stock Status: 24 units in stock · Price: ৳2,490`,
    metric: 'Stock Verified',
    actionDetails:
      'The agent queries your PostgreSQL catalog, checks current variant stock, dimensions, fabric details, and pricing in milliseconds.',
  },
  {
    id: 3,
    number: '03',
    title: 'Natural AI Reply Dispatched',
    tagline: 'Gemini 2.5 Flash-Lite Engine',
    icon: Sparkles,
    color: 'from-indigo-500 to-violet-600',
    statusText: 'Streaming Response · 0.4s',
    terminalLog: `LLM Stream completed (410ms)
"Ji sir! Essential Black Hoodie size L available ache. 
Price ৳2,490. Free Cash on Delivery available across Bangladesh 🚚"
Card Attachment: Essential Hoodie (৳2,490) + Size Selector`,
    metric: '410ms Reply',
    actionDetails:
      'Generates natural conversational Bengali and English responses, complete with interactive product cards and sizing options.',
  },
  {
    id: 4,
    number: '04',
    title: 'Atomic Order Creation',
    tagline: 'PostgreSQL Schema Ingestion',
    icon: ShoppingBag,
    color: 'from-emerald-500 to-teal-600',
    statusText: 'Order #1042 Recorded',
    terminalLog: `BEGIN TRANSACTION;
INSERT INTO orders (id, business_id, customer_name, phone, address, total_price, state)
VALUES ('ord_1042', 'biz_3c3f...', 'Tanvir Hasan', '01712345678', 'Dhanmondi 27, Dhaka', 2490, 'pending');
UPDATE inventory SET stock = stock - 1 WHERE variant_id = 'v_hd_l';
COMMIT;`,
    metric: 'DB Synced',
    actionDetails:
      'Collects shipping address and contact number from chat, automatically validates customer info, and records Order #1042.',
  },
  {
    id: 5,
    number: '05',
    title: 'Payment Verification & Alert',
    tagline: 'bKash TrxID & Merchant Ping',
    icon: CreditCard,
    color: 'from-pink-500 to-rose-600',
    statusText: 'TrxID Verified: BK9F3D2K7L',
    terminalLog: `[Payment Listener]
Received TrxID: "BK9F3D2K7L"
Amount: ৳2,490 via bKash Merchant
State transition: pending -> acknowledged
Notification fired: "New Order #1042 Verified & Ready to Pack"`,
    metric: 'Instant Verification',
    actionDetails:
      'Validates bKash, Nagad or Cash-on-Delivery payment reference, advances order state, and triggers merchant notifications.',
  },
  {
    id: 6,
    number: '06',
    title: 'Courier Dispatch & Tracking',
    tagline: 'Steadfast / Pathao Consignment',
    icon: Truck,
    color: 'from-amber-500 to-emerald-600',
    statusText: 'Consignment: ST-902418-BD',
    terminalLog: `[Steadfast API Endpoint]
POST /api/create_order
Consignment Created: Tracking #ST-902418-BD
Customer SMS sent: "Apnar parcel courier e deya hoyeche. Track: steadfast.com.bd/t/ST-902418-BD"
Order Status: onDelivery`,
    metric: 'Automated Dispatch',
    actionDetails:
      'Generates courier consignment labels with Steadfast or Pathao, and sends automated tracking updates to the customer via SMS.',
  },
];

export function ActiveWorkflowPipeline() {
  const [activeStepId, setActiveStepId] = useState<number>(1);
  const [isAutoCycling, setIsAutoCycling] = useState<boolean>(true);

  useEffect(() => {
    if (!isAutoCycling) return;
    const interval = setInterval(() => {
      setActiveStepId((prev) => (prev % PIPELINE_STEPS.length) + 1);
    }, 3800);
    return () => clearInterval(interval);
  }, [isAutoCycling]);

  const activeStep = PIPELINE_STEPS.find((s) => s.id === activeStepId) || PIPELINE_STEPS[0];
  const StepIcon = activeStep.icon;

  return (
    <div className="space-y-8">
      {/* Interactive Controls & Progress Overview */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#5B3DF5] to-[#7C3AED] text-white shadow-md shadow-[#5B3DF5]/30">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white sm:text-base">
              Autonomous Commerce Pipeline
            </h3>
            <p className="text-xs text-slate-400">
              Active Step: <span className="font-semibold text-[#818CF8]">{activeStep.number} · {activeStep.title}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAutoCycling(!isAutoCycling)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 transition"
          >
            {isAutoCycling ? (
              <>
                <Pause className="h-3.5 w-3.5 text-[#818CF8]" />
                <span>Pause Auto-Step</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                <span>Play Auto-Step</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 6 Step Nodes Connected with Flowing Energy Beam */}
      <div className="relative">
        {/* Animated Connecting SVG Light Line (visible on desktop) */}
        <div className="hidden lg:block absolute top-[28px] left-[6%] right-[6%] h-[3px] pointer-events-none z-0">
          <div className="w-full h-full bg-white/10 relative overflow-hidden rounded-full">
            <div
              className="absolute top-0 bottom-0 bg-gradient-to-r from-transparent via-[#818CF8] to-transparent animate-pulse"
              style={{
                width: '30%',
                left: `${((activeStepId - 1) / (PIPELINE_STEPS.length - 1)) * 70}%`,
                transition: 'left 0.5s ease-in-out',
              }}
            />
          </div>
        </div>

        {/* 6 Interactive Step Buttons */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 relative z-10">
          {PIPELINE_STEPS.map((step) => {
            const isCurrent = step.id === activeStepId;
            const Icon = step.icon;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setActiveStepId(step.id);
                  setIsAutoCycling(false);
                }}
                className={cn(
                  'group flex flex-col items-center rounded-2xl p-3 text-center transition-all duration-200 border',
                  isCurrent
                    ? 'border-[#5B3DF5] bg-[#161B36] shadow-lg shadow-[#5B3DF5]/20 ring-2 ring-[#5B3DF5]/40'
                    : 'border-white/10 bg-[#101428] hover:border-white/20 hover:bg-[#141830]',
                )}
              >
                {/* Node Pill */}
                <div
                  className={cn(
                    'relative flex h-12 w-12 items-center justify-center rounded-xl transition-all shadow-md',
                    isCurrent
                      ? 'bg-gradient-to-br from-[#5B3DF5] to-[#7C3AED] text-white scale-105'
                      : 'bg-white/10 text-slate-300 group-hover:bg-white/15',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#0E1022] text-[9px] font-bold text-slate-300 border border-white/20">
                    {step.id}
                  </span>
                </div>

                <p className="mt-2.5 text-xs font-bold text-white line-clamp-1">
                  {step.title}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400 line-clamp-1">
                  {step.tagline}
                </p>

                <span
                  className={cn(
                    'mt-2 rounded-full px-2 py-0.5 text-[9px] font-bold transition',
                    isCurrent
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-white/5 text-slate-400',
                  )}
                >
                  {isCurrent ? '● Active' : step.metric}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Step Live Inspector Card */}
      <div className="rounded-2xl border border-[#5B3DF5]/30 bg-[#12162E] p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5B3DF5] text-white font-bold">
              <StepIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-extrabold text-[#A78BFA]">
                  STEP {activeStep.number}
                </span>
                <span className="text-white font-extrabold text-sm sm:text-base">
                  {activeStep.title}
                </span>
              </div>
              <p className="text-xs text-slate-400">{activeStep.actionDetails}</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-300">
            {activeStep.statusText}
          </span>
        </div>

        {/* Live Terminal Output & Execution Log */}
        <div className="rounded-xl border border-white/10 bg-[#0A0C18] p-3.5 font-mono text-[11px] sm:text-xs text-slate-300 space-y-1 overflow-x-auto">
          <div className="flex items-center justify-between text-slate-400 border-b border-white/10 pb-1.5 mb-2">
            <div className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-[#818CF8]" />
              <span>Real-Time Execution Log</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold">● Production Pipeline</span>
          </div>
          <pre className="whitespace-pre-wrap leading-relaxed text-indigo-100">
            {activeStep.terminalLog}
          </pre>
        </div>

        {/* Bottom Micro-Stepper Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Next automatic stage:</span>
            <span className="font-bold text-white">
              {PIPELINE_STEPS[activeStepId % PIPELINE_STEPS.length].title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveStepId((activeStepId - 2 + PIPELINE_STEPS.length) % PIPELINE_STEPS.length + 1)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setActiveStepId((activeStepId % PIPELINE_STEPS.length) + 1)}
              className="flex items-center gap-1 rounded-lg bg-[#5B3DF5] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#4C2EE0] transition"
            >
              <span>Next Stage</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
