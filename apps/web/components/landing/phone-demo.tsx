'use client';

import type { Dispatch, SetStateAction } from 'react';
import { BARS2, ORDER_ROWS, type DemoTimeline, type DemoView } from './demo-timeline';
import { useLandingLang } from './theme';

interface PhoneDemoProps {
  timeline: DemoTimeline;
  view: DemoView;
  setView: Dispatch<SetStateAction<DemoView>>;
  paused: boolean;
  setPaused: Dispatch<SetStateAction<boolean>>;
  companyName: string;
}

export function PhoneDemo({ timeline, view, setView, paused, setPaused, companyName }: PhoneDemoProps) {
  const { strings: l } = useLandingLang();
  const { s1, typing1, s3, s4, typing2, s6, s7, s8, orderDone, orders } = timeline;

  const tabs: Array<{ key: DemoView; label: string }> = [
    { key: 'inbox', label: l.dashInbox },
    { key: 'orders', label: l.dashOrders },
    { key: 'stats', label: l.dashStats },
  ];

  return (
    <div style={{ maxWidth: 1120, margin: '64px auto 0', textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: 'var(--oo-muted)', padding: '0 16px 12px' }}>{l.dashDemoNote}</div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
        <div
          style={{
            width: 'min(100%, 360px)',
            height: 600,
            boxSizing: 'border-box',
            padding: 9,
            borderRadius: 46,
            background: '#0E0F16',
            boxShadow: '0 40px 80px var(--oo-shadow), 0 0 0 1px var(--oo-lineStrong)',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              position: 'relative',
              height: '100%',
              borderRadius: 38,
              background: 'var(--oo-surface)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ position: 'absolute', left: '50%', top: 8, width: 92, height: 24, marginLeft: -46, borderRadius: 999, background: '#0E0F16', zIndex: 3 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 24px 0', fontSize: 12, fontWeight: 600 }}>
              <span>9:41</span>
              <span>5G ▮▮▮</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 14px 10px' }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  flex: '0 0 30px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg,#F59EC0,#B16CF0)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                A
              </span>
              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {companyName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--oo-muted)' }}>Active now</div>
              </div>
              <span className="pill ok" style={{ fontSize: 11 }}>
                {l.dashAgentOn}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px', borderBottom: '1px solid var(--oo-line)' }}>
              {tabs.map((tab) => {
                const active = view === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setView(tab.key)}
                    aria-label={tab.label}
                    style={{
                      flex: 1,
                      padding: '8px 4px',
                      borderRadius: 10,
                      border: `1px solid ${active ? 'var(--oo-accent)' : 'var(--oo-line)'}`,
                      background: active ? 'var(--oo-halo)' : 'transparent',
                      color: active ? 'var(--oo-accent)' : 'var(--oo-muted)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {view === 'inbox' ? (
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
                {s1 ? (
                  <div className="me pop" style={{ fontSize: 13, padding: '8px 11px' }}>
                    Assalamualaikum
                  </div>
                ) : null}
                {typing1 ? (
                  <div className="bot pop" style={{ fontSize: 13, padding: '8px 11px' }}>
                    <span className="dot"></span> <span className="dot"></span> <span className="dot"></span>
                  </div>
                ) : null}
                {s3 ? (
                  <div className="bot pop" style={{ fontSize: 13, padding: '8px 11px' }}>
                    ওয়ালাইকুম আসসালাম ম্যাম 😊 StyleHub BD-তে স্বাগতম! আজ কী খুঁজছেন?
                  </div>
                ) : null}
                {s3 ? (
                  <div className="pop" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)', fontSize: 12 }}>
                      কুর্তি
                    </span>
                    <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)', fontSize: 12 }}>
                      থ্রি-পিস
                    </span>
                    <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)', fontSize: 12 }}>
                      শাড়ি
                    </span>
                  </div>
                ) : null}
                {s4 ? (
                  <div className="me pop" style={{ fontSize: 13, padding: '8px 11px' }}>
                    Is the blue kurti available in M?
                  </div>
                ) : null}
                {typing2 ? (
                  <div className="bot pop" style={{ fontSize: 13, padding: '8px 11px' }}>
                    <span className="dot"></span> <span className="dot"></span> <span className="dot"></span>
                  </div>
                ) : null}
                {s6 ? (
                  <div className="bot pop" style={{ padding: 9, width: 210, maxWidth: '84%', fontSize: 13 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
                        <defs>
                          <linearGradient id="oo-kgp" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#7CC5FF"></stop>
                            <stop offset="1" stopColor="#5B4BEA"></stop>
                          </linearGradient>
                        </defs>
                        <rect width="64" height="64" rx="12" fill="var(--oo-surface)"></rect>
                        <path d="M22 10l10-3 10 3 12 9-6 8-5-3 2 30H19l2-30-5 3-6-8z" fill="url(#oo-kgp)"></path>
                      </svg>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>Blue kurti · M</div>
                        <div style={{ fontSize: 12, color: 'var(--oo-muted)' }}>
                          ৳1,850 · <span style={{ color: 'var(--oo-ok)' }}>In stock</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, textAlign: 'center', padding: 7, borderRadius: 9, background: 'var(--oo-accent)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                      Order now
                    </div>
                  </div>
                ) : null}
                {s7 ? (
                  <div className="me pop" style={{ fontSize: 13, padding: '8px 11px' }}>
                    Yes, confirm please
                  </div>
                ) : null}
                {s8 ? (
                  <div className="bot pop" style={{ fontSize: 13, padding: '8px 11px' }}>
                    Order <b>#1042</b> confirmed ✓ We will message you when it ships.
                  </div>
                ) : null}
                {s8 ? <div style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--oo-muted)' }}>Seen</div> : null}
              </div>
            ) : null}

            {view === 'orders' ? (
              <div style={{ flexGrow: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{l.dashOrders}</span>
                {ORDER_ROWS.filter((r, i) => i > 0 || orderDone).map((r) => (
                  <div key={r[0]} className="slide" style={{ padding: 10, borderRadius: 12, border: '1px solid var(--oo-line)', background: r[0] === '#1042' ? 'var(--oo-halo)' : 'var(--oo-surface2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 14 }}>{r[0]}</b>
                      <span className={`pill ${r[5]}`}>{r[4]}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{r[1]}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--oo-muted)', marginTop: 2 }}>
                      <span>{r[2]}</span>
                      <b style={{ color: 'var(--oo-ink)' }}>{r[3]}</b>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {view === 'stats' ? (
              <div style={{ flexGrow: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{l.dashStats}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, padding: 10, borderRadius: 12, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--oo-muted)' }}>Chats</div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>148</div>
                  </div>
                  <div style={{ flex: 1, padding: 10, borderRadius: 12, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--oo-muted)' }}>Reply</div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>1.8s</div>
                  </div>
                  <div style={{ flex: 1, padding: 10, borderRadius: 12, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                    <div style={{ fontSize: 10, color: 'var(--oo-muted)' }}>Orders</div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>{orders}</div>
                  </div>
                </div>
                <div style={{ padding: 10, borderRadius: 12, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--oo-muted)', marginBottom: 8 }}>Revenue this week</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 86 }}>
                    {BARS2.map((x, i) => (
                      <div key={x[0]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, justifyContent: 'flex-end', height: '100%' }}>
                        <span
                          className="grow"
                          style={{
                            width: '100%',
                            height: `${(i === 6 && orderDone ? 124 : x[1]) * 0.55}px`,
                            borderRadius: '6px 6px 2px 2px',
                            background: i === 6 ? 'linear-gradient(180deg,var(--oo-accent),var(--oo-accent2))' : 'var(--oo-lineStrong)',
                          }}
                        />
                        <span style={{ fontSize: 9, color: 'var(--oo-muted)' }}>{x[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span>Handled by AI</span>
                    <b>86%</b>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--oo-surface2)', overflow: 'hidden' }}>
                    <div className="grow" style={{ width: '86%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,var(--oo-accent),var(--oo-accent2))', transformOrigin: 'left' }} />
                  </div>
                </div>
              </div>
            ) : null}

            {view === 'inbox' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 14px', borderTop: '1px solid var(--oo-line)' }}>
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
            ) : null}
          </div>
        </div>
      </div>
      <button
        onClick={() => setPaused((v) => !v)}
        className="hov"
        style={{
          marginTop: 16,
          padding: '10px 22px',
          borderRadius: 999,
          border: '1px solid var(--oo-lineStrong)',
          background: paused ? 'var(--oo-accent)' : 'var(--oo-surface)',
          color: paused ? '#fff' : 'var(--oo-ink)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {paused ? `▶ ${l.dashResume}` : `⏸ ${l.dashPause}`}
      </button>
    </div>
  );
}
