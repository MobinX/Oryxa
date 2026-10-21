'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  Send,
  ThumbsUp,
  MessageCircle,
  Share2,
  Check,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';

export interface SocialContentStudioProps {
  children?: React.ReactNode;
  businessId: string;
  initialPosts?: any[];
  channels?: any[];
}

export function SocialContentStudio({
  children,
  businessId,
  initialPosts = [],
  channels = [],
}: SocialContentStudioProps) {
  const [socialSubTab, setSocialSubTab] = useState('calendar');
  const [calendarMode, setCalendarMode] = useState<'month' | 'week' | 'list'>('month');
  const [selectedOctDay, setSelectedOctDay] = useState(7);
  const [postTone, setPostTone] = useState('Friendly');
  const [postPrompt, setPostPrompt] = useState(
    "Create an engaging Facebook post for our Eid special collection of men's kurtas. Highlight discount and free delivery. Keep it short and attractive.",
  );
  const [generatedPost, setGeneratedPost] = useState(
    'Eid is around the corner! 🌙✨\nGet ready with our exclusive Eid Collection – premium kurtas for your special moments. Enjoy up to 30% off and free delivery across Bangladesh.\n\nLook good. Celebrate bigger. 💙',
  );
  const [previewTab, setPreviewTab] = useState<'facebook' | 'instagram' | 'both'>('facebook');
  const [autoPublish, setAutoPublish] = useState(true);
  const [studioToast, setStudioToast] = useState('');

  const triggerToast = (msg: string) => {
    setStudioToast(msg);
    setTimeout(() => setStudioToast(''), 3000);
  };

  return (
    <div className="mx-auto max-w-[1380px] p-2 sm:p-4 lg:p-6 space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-geist text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Social Media Content
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Plan, create and automate posts for your business
          </p>
        </div>
        <div className="flex items-center gap-2">
          {studioToast && (
            <span className="rounded-xl bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 animate-slide-up-fade">
              {studioToast}
            </span>
          )}
          <button
            type="button"
            onClick={() => triggerToast(`Scheduled Eid Campaign Post for Oct ${selectedOctDay}, 10:00 AM!`)}
            className="rounded-xl bg-[#5B3DF5] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#5B3DF5]/20 hover:bg-[#4C2EE0] transition"
          >
            + Create Post ▾
          </button>
        </div>
      </div>

      {/* Campaign / Subtabs Filter Row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold dark:border-slate-800">
        {[
          { id: 'calendar', label: '📅 Content Calendar' },
          { id: 'ai', label: '✨ AI Suggestions' },
          { id: 'scheduled', label: '🕒 Scheduled' },
          { id: 'published', label: '✈️ Published' },
          { id: 'drafts', label: '📄 Drafts' },
          { id: 'templates', label: '⊞ Post Templates' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSocialSubTab(t.id)}
            className={`rounded-lg px-3 py-1.5 transition ${
              socialSubTab === t.id
                ? 'bg-[#5B3DF5]/10 font-bold text-[#5B3DF5]'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Upcoming Campaign Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[11px] font-semibold text-slate-400">Campaigns:</span>
        <span className="cursor-pointer rounded-full bg-indigo-50 px-3 py-1 font-semibold text-[#5B3DF5] dark:bg-[#5B3DF5]/20">
          🌙 Eid Campaign (Active)
        </span>
        <span className="cursor-pointer rounded-full bg-slate-100 px-3 py-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
          ✨ Puja Special
        </span>
        <span className="cursor-pointer rounded-full bg-slate-100 px-3 py-1 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
          ⚡ Flash Offer
        </span>
      </div>

      {/* 3 Columns Studio Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Calendar Column */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4">
          <div className="flex items-center justify-between pb-3">
            <span className="text-sm font-extrabold text-slate-900 dark:text-white">October 2026</span>
            <div className="flex gap-1 text-[11px]">
              {(['month', 'week', 'list'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCalendarMode(m)}
                  className={`rounded px-2 py-0.5 capitalize transition ${
                    calendarMode === m
                      ? 'bg-[#5B3DF5] text-white font-bold'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <span key={d} className="py-1 font-bold text-slate-400">
                {d}
              </span>
            ))}
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedOctDay(day)}
                className={`rounded-lg py-2 font-bold transition ${
                  selectedOctDay === day
                    ? 'bg-[#5B3DF5] text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="text-[11px] font-bold text-slate-400">Scheduled for Oct {selectedOctDay}</p>
            <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <p className="font-bold text-slate-900 dark:text-white">Eid Special Men&apos;s Kurta Drop</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">10:00 AM · Facebook &amp; Instagram</p>
            </div>
          </div>
        </div>

        {/* AI Generator Column */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                ✨ Create Post with AI
              </span>
              <select
                value={postTone}
                onChange={(e) => setPostTone(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="Friendly">Friendly</option>
                <option value="Professional">Professional</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            <textarea
              value={postPrompt}
              onChange={(e) => setPostPrompt(e.target.value)}
              rows={3}
              placeholder="Describe what you want to post about..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#5B3DF5] dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
            />

            <button
              type="button"
              onClick={() => {
                setGeneratedPost(
                  `[${postTone} Tone] Eid is around the corner! 🌙✨\nGet ready with our exclusive Eid Collection – premium kurtas for your special moments. Enjoy up to 30% off and free delivery across Bangladesh.\n\nShop now: limited stock available!`,
                );
                triggerToast('Generated fresh post tailored with ' + postTone + ' tone!');
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#5B3DF5] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#5B3DF5]/20 hover:bg-[#4C2EE0] transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate with AI</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs dark:border-slate-800 dark:bg-[#13172B]">
            <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white">
              <span>✨ AI Generated Post</span>
              <button
                type="button"
                onClick={() => {
                  setGeneratedPost(
                    `Celebrate Eid in style! 🌙\nUpgrade your festive wardrobe with our newest designer kurtas. Flat 25% off this week only with free nationwide shipping!\n\nTap the message button to order directly.`,
                  );
                  triggerToast('Regenerated fresh AI copy!');
                }}
                className="inline-flex items-center gap-1 text-[#5B3DF5] hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Regenerate</span>
              </button>
            </div>

            <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {generatedPost}
            </p>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                type="button"
                onClick={() => triggerToast('Post opened in editor')}
                className="rounded-xl border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Edit Post
              </button>
              <button
                type="button"
                onClick={() => triggerToast('Post applied to live preview!')}
                className="rounded-xl bg-[#5B3DF5] py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#4C2EE0] transition"
              >
                ✓ Use This
              </button>
              <button
                type="button"
                onClick={() => triggerToast('Saved as post template!')}
                className="rounded-xl border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>

        {/* Live Post Preview Column */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3 shadow-2xs dark:border-slate-800 dark:bg-[#13172B] lg:col-span-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-900 dark:text-white">Post Preview</span>
            <div className="flex gap-1 text-xs">
              {(['facebook', 'instagram', 'both'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreviewTab(p)}
                  className={`rounded px-2 py-0.5 capitalize transition ${
                    previewTab === p
                      ? 'bg-[#5B3DF5] text-white font-bold'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#5B3DF5] to-[#7C3AED] text-center text-xs font-bold leading-7 text-white">
                S
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  StyleHub BD · <span className="font-normal text-slate-400">Just now</span>
                </p>
                <p className="text-[10px] text-slate-400">Sponsored · 🌐</p>
              </div>
            </div>

            <p className="whitespace-pre-line text-slate-700 dark:text-slate-300 leading-relaxed">
              {generatedPost}
            </p>

            <div className="rounded-xl bg-gradient-to-r from-amber-100 to-amber-200 p-4 text-slate-900 shadow-2xs dark:from-amber-200 dark:to-amber-300">
              <p className="font-serif text-lg font-bold">Eid Collection — UP TO 30% OFF</p>
              <p className="text-[11px] font-semibold text-slate-800">🚚 Free Delivery Across Bangladesh</p>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <ThumbsUp className="h-3 w-3 text-[#1877F2]" /> 1.2K
              </span>
              <span>120 comments · 45 shares</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-300">
              Auto-publish on Oct {selectedOctDay}, 10:00 AM
            </span>
            <button
              type="button"
              onClick={() => {
                setAutoPublish((a) => !a);
                triggerToast(autoPublish ? 'Auto-publish turned off' : 'Auto-publish enabled for Oct ' + selectedOctDay);
              }}
              className={`rounded-full px-3 py-1 font-bold transition ${
                autoPublish
                  ? 'bg-[#5B3DF5] text-white shadow-2xs'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {autoPublish ? 'Enabled' : 'Off'}
            </button>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
