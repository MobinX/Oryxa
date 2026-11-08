'use client';

import { useEffect, useState } from 'react';
import { useLandingLang, usePrefersReducedMotion } from './theme';

type MsgKind = 'text' | 'chips' | 'carousel' | 'image' | 'voice' | 'receipt' | 'track';

const ALL: Array<{ s: number; side: 'me' | 'bot'; kind: MsgKind; text?: string }> = [
  { s: 0, side: 'me', kind: 'text', text: 'Assalamualaikum' },
  { s: 0, side: 'bot', kind: 'text', text: 'ওয়ালাইকুম আসসালাম ম্যাম 😊 StyleHub BD-তে স্বাগতম!' },
  { s: 1, side: 'bot', kind: 'text', text: 'আজ কী খুঁজছেন?' },
  { s: 1, side: 'bot', kind: 'chips' },
  { s: 1, side: 'me', kind: 'text', text: 'কুর্তি' },
  { s: 1, side: 'bot', kind: 'carousel' },
  { s: 2, side: 'me', kind: 'image' },
  { s: 2, side: 'bot', kind: 'text', text: 'ছবি মিলিয়ে নিয়েছি ✓ Blue Kurti · K-204' },
  { s: 3, side: 'me', kind: 'text', text: 'M size ache?' },
  { s: 3, side: 'bot', kind: 'text', text: 'জি ম্যাম, M স্টকে আছে ✓' },
  { s: 4, side: 'me', kind: 'voice' },
  { s: 4, side: 'bot', kind: 'text', text: 'অর্ডার কনফার্ম ✓ #1042' },
  { s: 5, side: 'bot', kind: 'receipt' },
  { s: 6, side: 'bot', kind: 'track' },
  { s: 7, side: 'bot', kind: 'text', text: 'পার্সেল পৌঁছে গেছে! রিভিউ দেবেন? ⭐⭐⭐⭐⭐' },
  { s: 7, side: 'me', kind: 'text', text: 'ধন্যবাদ, দারুণ! ⭐⭐⭐⭐⭐' },
];

export function LandingWorkflow() {
  const [tick, setTick] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const { strings: l } = useLandingLang();
  const DEFS = l.wfDefs;

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = setInterval(() => setTick((value) => value + 1), 1300);
    return () => clearInterval(id);
  }, [reducedMotion, paused]);

  const step = pinned !== null ? pinned : Math.floor(tick / 3) % 8;
  const cur = DEFS[step]!;
  const showOrder = step >= 4;
  const wfLabel = step >= 7 ? 'Delivered' : step === 6 ? 'Shipped' : 'Confirmed';
  const wfCls = step === 6 ? 'wait' : 'ok';
  const msgs = ALL.filter((m) => m.s <= step);

  return (
    <section id="workflow" className="oo-workflow" style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 14, color: 'var(--oo-accent)', fontWeight: 600 }}>{l.wfKicker}</div>
      <h2 style={{ margin: '10px 0 14px', maxWidth: 700, fontSize: 48, lineHeight: 1.05, letterSpacing: '-0.035em', fontWeight: 700 }}>
        {l.wfH2}
      </h2>
      <p style={{ margin: '0 0 32px', color: 'var(--oo-muted)', fontSize: 18, maxWidth: 640 }}>
        {l.wfSub}
      </p>

      <div className="oo-step-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {DEFS.map((d, i) => {
          const active = i === step;
          return (
            <button
              key={d[0]}
              onClick={() => setPinned(pinned === i ? null : i)}
              style={{
                position: 'relative',
                overflow: 'hidden',
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 999,
                border: `1px solid ${active ? 'var(--oo-accent)' : 'var(--oo-line)'}`,
                background: active ? 'var(--oo-accent)' : 'var(--oo-surface)',
                color: active ? '#fff' : 'var(--oo-ink)',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ opacity: 0.6, marginRight: 6 }}>{`0${i + 1}`}</span>
              {d[0]}
              {active && pinned === null ? (
                <span key={step} className="prog" style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', background: '#fff', opacity: 0.7 }} />
              ) : null}
            </button>
          );
        })}
        <button
          onClick={() => setPaused((v) => !v)}
          style={{
            minHeight: 44,
            padding: '0 16px',
            borderRadius: 999,
            border: '1px solid var(--oo-line)',
            background: paused ? 'var(--oo-accent)' : 'transparent',
            color: paused ? '#fff' : 'var(--oo-ink)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {paused ? `▶ ${l.wfResume}` : `⏸ ${l.wfPause}`}
        </button>
      </div>

      <div
        className="oo-workflow-card"
        style={{
          position: 'relative',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 40,
          alignItems: 'center',
          padding: 36,
          borderRadius: 28,
          border: '1px solid var(--oo-line)',
          background: 'var(--oo-surface)',
          boxShadow: '0 30px 80px var(--oo-shadow)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', right: -80, top: -120, width: 560, height: 560, background: 'radial-gradient(closest-side, var(--oo-halo), transparent)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', flex: '1 1 420px', minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--oo-accent)', fontWeight: 600 }}>{l.wfStep(step + 1)}</div>
          <div style={{ margin: '6px 0 8px', fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            {cur[1]}
          </div>
          <div style={{ marginBottom: 24, color: 'var(--oo-muted)', fontSize: 16 }}>{cur[2]}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {DEFS.map((d, i) => (
              <div key={d[0]} style={{ display: 'flex', gap: 14, opacity: i > step ? 0.45 : 1, transition: 'opacity .4s' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span
                    className={i === step ? 'ring' : undefined}
                    style={{
                      width: 30,
                      height: 30,
                      flex: '0 0 30px',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      background: i < step ? 'var(--oo-ok)' : i === step ? 'var(--oo-accent)' : 'var(--oo-surface2)',
                      color: i <= step ? '#fff' : 'var(--oo-muted)',
                      border: `1px solid ${i <= step ? 'transparent' : 'var(--oo-line)'}`,
                    }}
                  >
                    {i < step ? '✓' : String(i + 1)}
                  </span>
                  {i < 7 ? (
                    <span
                      className={i === step ? 'flow' : undefined}
                      style={{
                        width: 2,
                        height: 18,
                        background: i < step ? 'var(--oo-ok)' : i === step ? undefined : 'var(--oo-line)',
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, lineHeight: '30px' }}>{d[0]}</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--oo-muted)', lineHeight: '30px', textAlign: 'right' }}>{d[3]}</div>
                </div>
              </div>
            ))}
          </div>
          {showOrder ? (
            <div className="slide" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                #
              </span>
              <div style={{ flexGrow: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Order #1042 · Ayesha R.</div>
                <div style={{ fontSize: 13, color: 'var(--oo-muted)' }}>Blue kurti · M · ৳1,930 · Cash on delivery</div>
              </div>
              <span className={`pill ${wfCls}`}>{wfLabel}</span>
            </div>
          ) : null}
        </div>

        <div style={{ position: 'relative', flex: '0 1 320px', margin: '0 auto' }}>
          <div className="oo-phone" style={{ width: 312, maxWidth: '100%', boxSizing: 'border-box', padding: 9, borderRadius: 46, background: '#0E0F16', boxShadow: '0 40px 80px var(--oo-shadow), 0 0 0 1px var(--oo-lineStrong)' }}>
            <div className="oo-phone-screen" style={{ position: 'relative', height: 580, borderRadius: 38, background: 'var(--oo-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'absolute', left: '50%', top: 8, width: 92, height: 24, marginLeft: -46, borderRadius: 999, background: '#0E0F16', zIndex: 3 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 24px 0', fontSize: 12, fontWeight: 600 }}>
                <span>9:41</span>
                <span>5G ▮▮▮</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '22px 12px 10px', borderBottom: '1px solid var(--oo-line)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--oo-accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7"></path>
                </svg>
                <div style={{ position: 'relative', width: 34, height: 34 }}>
                  <span className="shine" style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                    S
                  </span>
                  <span style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: '#31C48D', border: '2px solid var(--oo-surface)' }} />
                </div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>StyleHub BD</div>
                  <div style={{ fontSize: 11, color: 'var(--oo-muted)' }}>Active now</div>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                  <path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.4.55 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.55 3.4 1 1 0 01-.25 1z"></path>
                </svg>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                  <path d="M3 7a2 2 0 012-2h9a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM17 10l4-3v10l-4-3z"></path>
                </svg>
              </div>
              <div
                style={{
                  flexGrow: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  gap: 6,
                  padding: 12,
                  overflow: 'hidden',
                  WebkitMaskImage: 'linear-gradient(transparent, #000 14%)',
                  maskImage: 'linear-gradient(transparent, #000 14%)',
                }}
              >
                {msgs.map((m, i) => (
                  <div key={i} className="pop" style={{ display: 'flex', flexDirection: 'column', alignSelf: m.side === 'me' ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
                    {m.kind === 'text' ? (
                      <div className={m.side} style={{ maxWidth: '100%', fontSize: 14, padding: '8px 12px' }}>
                        {m.text}
                      </div>
                    ) : null}
                    {m.kind === 'chips' ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)' }}>কুর্তি</span>
                        <span className="chip">থ্রি-পিস</span>
                        <span className="chip">শাড়ি</span>
                      </div>
                    ) : null}
                    {m.kind === 'carousel' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ width: 118, borderRadius: 14, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)', padding: 8 }}>
                          <svg width="100%" height="64" viewBox="0 0 64 64" aria-hidden="true">
                            <defs>
                              <linearGradient id="oo-kgw" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#7CC5FF"></stop>
                                <stop offset="1" stopColor="#5B4BEA"></stop>
                              </linearGradient>
                            </defs>
                            <rect width="64" height="64" rx="10" fill="var(--oo-surface)"></rect>
                            <path d="M22 10l10-3 10 3 12 9-6 8-5-3 2 30H19l2-30-5 3-6-8z" fill="url(#oo-kgw)"></path>
                          </svg>
                          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>Blue Kurti</div>
                          <div style={{ fontSize: 11, color: 'var(--oo-muted)' }}>K-204 · ৳1,850</div>
                          <div style={{ marginTop: 6, textAlign: 'center', padding: 5, borderRadius: 8, background: 'var(--oo-accent)', color: '#fff', fontSize: 11, fontWeight: 600 }}>
                            Order
                          </div>
                        </div>
                        <div style={{ width: 118, borderRadius: 14, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)', padding: 8 }}>
                          <svg width="100%" height="64" viewBox="0 0 64 64" aria-hidden="true">
                            <defs>
                              <linearGradient id="oo-kr" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#FFB3C7"></stop>
                                <stop offset="1" stopColor="#C45BE6"></stop>
                              </linearGradient>
                            </defs>
                            <rect width="64" height="64" rx="10" fill="var(--oo-surface)"></rect>
                            <path d="M22 10l10-3 10 3 12 9-6 8-5-3 2 30H19l2-30-5 3-6-8z" fill="url(#oo-kr)"></path>
                          </svg>
                          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>Rose Kurti</div>
                          <div style={{ fontSize: 11, color: 'var(--oo-muted)' }}>K-198 · ৳1,650</div>
                          <div style={{ marginTop: 6, textAlign: 'center', padding: 5, borderRadius: 8, background: 'var(--oo-accent)', color: '#fff', fontSize: 11, fontWeight: 600 }}>
                            Order
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {m.kind === 'image' ? (
                      <div style={{ width: 130, height: 150, borderRadius: '18px 18px 4px 18px', background: 'linear-gradient(160deg,#8EC5FF,#4B3FD6)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <svg width="70" height="70" viewBox="0 0 64 64" aria-hidden="true">
                          <path d="M22 10l10-3 10 3 12 9-6 8-5-3 2 30H19l2-30-5 3-6-8z" fill="rgba(255,255,255,0.9)"></path>
                        </svg>
                        <span style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.35)', padding: '2px 8px', borderRadius: 999 }}>
                          Photo
                        </span>
                      </div>
                    ) : null}
                    {m.kind === 'voice' ? (
                      <div className="me" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', width: 150, boxSizing: 'border-box' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                          <path d="M7 4l13 8-13 8z"></path>
                        </svg>
                        <span className="vb" style={{ display: 'flex', alignItems: 'center', gap: 2, height: 18, color: '#fff' }}>
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                        <span style={{ fontSize: 11 }}>0:08</span>
                      </div>
                    ) : null}
                    {m.kind === 'receipt' ? (
                      <div style={{ width: 200, borderRadius: 16, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)', padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Receipt · #1042</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Blue Kurti · M × 1</span>
                          <b>৳1,850</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--oo-muted)' }}>
                          <span>Delivery</span>
                          <span>৳80</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--oo-lineStrong)', paddingTop: 6 }}>
                          <b>Total</b>
                          <b>৳1,930</b>
                        </div>
                        <div style={{ color: 'var(--oo-muted)' }}>Cash on delivery</div>
                      </div>
                    ) : null}
                    {m.kind === 'track' ? (
                      <div style={{ width: 200, borderRadius: 16, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)', padding: 12, fontSize: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Your parcel is on the way 🚚</div>
                        <div style={{ color: 'var(--oo-muted)', margin: '2px 0 8px' }}>Out for delivery today</div>
                        <div style={{ textAlign: 'center', padding: 7, borderRadius: 9, background: 'var(--oo-accent)', color: '#fff', fontWeight: 600 }}>
                          Track parcel
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 14px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 7v10M7 12h10" stroke="var(--oo-surface)" strokeWidth="2" strokeLinecap="round"></path>
                </svg>
                <div style={{ flexGrow: 1, padding: '8px 14px', borderRadius: 999, background: 'var(--oo-surface2)', color: 'var(--oo-muted)', fontSize: 13 }}>
                  Aa
                </div>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                  <path d="M2 21h4V9H2zM22 10a2 2 0 00-2-2h-6l1-4.5L14.5 3 8 9.5V21h10a2 2 0 002-1.5l2-7z"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
