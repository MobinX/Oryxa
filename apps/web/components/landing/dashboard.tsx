'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { BARS2, ORDER_ROWS, useLandingDemoTimeline, useMediaQuery, type DemoTimeline, type DemoView } from './demo-timeline';
import { PhoneDemo } from './phone-demo';
import { useLandingLang } from './theme';

export function LandingDashboard({ companyName }: { companyName: string }) {
  const [view, setView] = useState<DemoView>('inbox');
  const [paused, setPaused] = useState(false);
  const timeline = useLandingDemoTimeline(paused);
  const isPhone = useMediaQuery('(max-width: 640px)');

  if (isPhone) {
    return <PhoneDemo timeline={timeline} view={view} setView={setView} paused={paused} setPaused={setPaused} companyName={companyName} />;
  }
  return <DesktopDemo timeline={timeline} view={view} setView={setView} paused={paused} setPaused={setPaused} companyName={companyName} />;
}

interface DemoProps {
  timeline: DemoTimeline;
  view: DemoView;
  setView: Dispatch<SetStateAction<DemoView>>;
  paused: boolean;
  setPaused: Dispatch<SetStateAction<boolean>>;
  companyName: string;
}

function DesktopDemo({ timeline, view, setView, paused, setPaused, companyName }: DemoProps) {
  const { strings: l } = useLandingLang();
  const { tick, t, s1, typing1, s3, s4, typing2, s6, s7, s8, orderDone, preview, nPrev, tPrev, orders, revenue, toast, feed, bars } =
    timeline;

  const nBadge = t < 6;
  const tBadge = t < 7;
  const hotBorder = t >= 9 && t <= 12 ? 'var(--oo-accent)' : 'var(--oo-line)';

  const nav: Array<{ key: DemoView; label: string }> = [
    { key: 'inbox', label: l.dashInbox },
    { key: 'orders', label: l.dashOrders },
    { key: 'stats', label: l.dashStats },
  ];

  return (
    <div className="stage3d" style={{ position: 'relative', maxWidth: 1120, margin: '64px auto 0', textAlign: 'left' }}>
      <div
        className="intro"
        style={{
          padding: 1,
          borderRadius: '22px 22px 0 0',
          background: 'linear-gradient(180deg, var(--oo-lineStrong), transparent 85%)',
        }}
      >
        <div
          style={{
            position: 'relative',
            borderRadius: '21px 21px 0 0',
            background: 'var(--oo-surface)',
            boxShadow: '0 -20px 100px var(--oo-halo), 0 40px 80px var(--oo-shadow)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 18px',
              borderBottom: '1px solid var(--oo-line)',
              background: 'var(--oo-surface2)',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF6B6B' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFC857' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ADE9B' }} />
            <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--oo-muted)' }}>
              {companyName} · StyleHub BD
            </span>
            <span style={{ flexGrow: 1 }} />
            <span
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                background: 'var(--oo-surface)',
                border: '1px solid var(--oo-line)',
                fontSize: 12,
                color: 'var(--oo-muted)',
              }}
            >
              {l.dashSearch}
            </span>
            <span className="pill ok">
              <span
                className="pulse"
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--oo-ok)',
                  marginRight: 6,
                }}
              />
              {l.dashAgentOn}
            </span>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--oo-muted)', padding: '8px 16px 0' }}>
            {l.dashDemoNote}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 580 }}>
            <div
              className="si d1"
              style={{
                flex: '0 0 80px',
                boxSizing: 'border-box',
                borderRight: '1px solid var(--oo-line)',
                padding: '14px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {nav.map((n) => {
                const active = view === n.key;
                return (
                  <button
                    key={n.key}
                    onClick={() => setView(n.key)}
                    aria-label={n.label}
                    className={view === 'inbox' && n.key !== 'inbox' && tick < 9 ? 'ring' : undefined}
                    style={{
                      width: 62,
                      minHeight: 58,
                      borderRadius: 14,
                      border: `1px solid ${active ? 'var(--oo-accent)' : 'var(--oo-line)'}`,
                      background: active ? 'var(--oo-halo)' : 'transparent',
                      color: active ? 'var(--oo-accent)' : 'var(--oo-muted)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {n.key === 'inbox' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 5h16v11H9l-5 4z"></path>
                      </svg>
                    ) : null}
                    {n.key === 'orders' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"></path>
                      </svg>
                    ) : null}
                    {n.key === 'stats' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M5 20V10M12 20V4M19 20v-7"></path>
                      </svg>
                    ) : null}
                    <span>{n.label}</span>
                  </button>
                );
              })}
            </div>

            {view === 'inbox' ? (
              <>
                <div
                  className="si d2"
                  style={{
                    flex: '0 0 260px',
                    boxSizing: 'border-box',
                    borderRight: '1px solid var(--oo-line)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 10px' }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{l.dashInbox}</span>
                    <span className="pill ok">{l.dashLive}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 12, background: 'var(--oo-halo)', border: '1px solid var(--oo-line)' }}>
                    <span style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: '50%', background: 'linear-gradient(135deg,#F59EC0,#B16CF0)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                      A
                    </span>
                    <div style={{ minWidth: 0, flexGrow: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
                        <span>Ayesha R.</span>
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--oo-muted)' }}>now</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--oo-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {preview}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--oo-accent)', marginTop: 2 }}>Messenger</div>
                    </div>
                  </div>
                  <div className="pop" style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 12 }}>
                      <span style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: '50%', background: 'linear-gradient(135deg,#7CC5FF,#5B7CFF)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                        N
                      </span>
                      <div style={{ minWidth: 0, flexGrow: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
                          <span>Nabila K.</span>
                          {nBadge ? <span className="badge">1</span> : null}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--oo-muted)' }}>{nPrev}</div>
                        <div style={{ fontSize: 11, color: '#D6409F', marginTop: 2 }}>Instagram</div>
                      </div>
                    </div>
                  <div className="pop" style={{ display: 'flex', gap: 10, padding: 10, borderRadius: 12 }}>
                      <span style={{ width: 38, height: 38, flex: '0 0 38px', borderRadius: '50%', background: 'linear-gradient(135deg,#6EE7B7,#2FB67C)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                        T
                      </span>
                      <div style={{ minWidth: 0, flexGrow: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
                          <span>Tania S.</span>
                          {tBadge ? <span className="badge">1</span> : null}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--oo-muted)' }}>{tPrev}</div>
                        <div style={{ fontSize: 11, color: 'var(--oo-ok)', marginTop: 2 }}>WhatsApp</div>
                      </div>
                    </div>
                </div>

                <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--oo-line)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--oo-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 5l-7 7 7 7"></path>
                    </svg>
                    <div style={{ position: 'relative', width: 40, height: 40 }}>
                      <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#F59EC0,#B16CF0)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                        A
                      </span>
                      <span style={{ position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: '50%', background: '#31C48D', border: '2px solid var(--oo-surface)' }} />
                    </div>
                    <div style={{ flexGrow: 1 }}>
                      <div style={{ fontWeight: 600, lineHeight: 1.2 }}>Ayesha R.</div>
                      <div style={{ fontSize: 12, color: 'var(--oo-muted)' }}>Active now</div>
                    </div>
                    <span className="pill ok">AI replying</span>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                      <path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.4.55 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.55 3.4 1 1 0 01-.25 1z"></path>
                    </svg>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                      <path d="M3 7a2 2 0 012-2h9a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM17 10l4-3v10l-4-3z"></path>
                    </svg>
                  </div>
                  <div style={{ flexGrow: 1, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 380 }}>
                    <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--oo-muted)', marginBottom: 6 }}>
                      Today 11:42 AM
                    </div>
                    {s1 ? <div className="me pop">Assalamualaikum</div> : null}
                    {typing1 ? (
                      <div className="bot pop">
                        <span className="dot"></span> <span className="dot"></span> <span className="dot"></span>
                      </div>
                    ) : null}
                    {s3 ? <div className="bot pop">ওয়ালাইকুম আসসালাম ম্যাম 😊 StyleHub BD-তে স্বাগতম! আজ কী খুঁজছেন?</div> : null}
                    {s3 ? (
                      <div className="pop" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '2px 0' }}>
                        <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)' }}>কুর্তি</span>
                        <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)' }}>থ্রি-পিস</span>
                        <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)' }}>শাড়ি</span>
                        <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)' }}>পাঞ্জাবি</span>
                      </div>
                    ) : null}
                    {s4 ? <div className="me pop">Is the blue kurti available in M?</div> : null}
                    {typing2 ? (
                      <div className="bot pop">
                        <span className="dot"></span> <span className="dot"></span> <span className="dot"></span>
                      </div>
                    ) : null}
                    {s6 ? (
                      <div className="bot pop" style={{ padding: 10, width: 250, maxWidth: '80%' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
                            <defs>
                              <linearGradient id="oo-kg" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stopColor="#7CC5FF"></stop>
                                <stop offset="1" stopColor="#5B4BEA"></stop>
                              </linearGradient>
                            </defs>
                            <rect width="64" height="64" rx="12" fill="var(--oo-surface)"></rect>
                            <path d="M22 10l10-3 10 3 12 9-6 8-5-3 2 30H19l2-30-5 3-6-8z" fill="url(#oo-kg)"></path>
                          </svg>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>Blue kurti · M</div>
                            <div style={{ fontSize: 13, color: 'var(--oo-muted)' }}>
                              ৳1,850 · <span style={{ color: 'var(--oo-ok)' }}>In stock</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, textAlign: 'center', padding: 8, borderRadius: 10, background: 'var(--oo-accent)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                          Order now
                        </div>
                      </div>
                    ) : null}
                    {s7 ? <div className="me pop">Yes, confirm please</div> : null}
                    {s8 ? (
                      <div className="bot pop">
                        Order <b>#1042</b> confirmed ✓ We will message you when it ships.
                      </div>
                    ) : null}
                    {s8 ? <div style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--oo-muted)' }}>Seen</div> : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid var(--oo-line)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 7v10M7 12h10" stroke="var(--oo-surface)" strokeWidth="2" strokeLinecap="round"></path>
                    </svg>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--oo-accent)" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 8h3l2-3h6l2 3h3v11H4z"></path>
                      <circle cx="12" cy="13" r="3.5"></circle>
                    </svg>
                    <div style={{ flexGrow: 1, padding: '9px 16px', borderRadius: 999, background: 'var(--oo-surface2)', color: 'var(--oo-muted)', fontSize: 15 }}>
                      Aa
                    </div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--oo-accent)" aria-hidden="true">
                      <path d="M2 21h4V9H2zM22 10a2 2 0 00-2-2h-6l1-4.5L14.5 3 8 9.5V21h10a2 2 0 002-1.5l2-7z"></path>
                    </svg>
                  </div>
                </div>
              </>
            ) : null}

            {view === 'orders' ? (
              <div className="pop" style={{ flex: '1 1 420px', minWidth: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{l.dashOrders}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="chip" style={{ color: 'var(--oo-accent)', borderColor: 'var(--oo-accent)' }}>All</span>
                    <span className="chip">Confirmed</span>
                    <span className="chip">Packing</span>
                    <span className="chip">Delivered</span>
                  </div>
                </div>
                <div style={{ borderRadius: 14, border: '1px solid var(--oo-line)', overflow: 'hidden', fontSize: 14 }}>
                  <div style={{ display: 'flex', padding: '10px 16px', background: 'var(--oo-surface2)', color: 'var(--oo-muted)', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ flex: '0 0 64px' }}>ORDER</span>
                    <span style={{ flex: 1 }}>CUSTOMER</span>
                    <span style={{ flex: '0 0 72px' }}>TOTAL</span>
                    <span style={{ flex: '0 0 96px' }}>STATUS</span>
                  </div>
                  {ORDER_ROWS.filter((r, i) => i > 0 || orderDone).map((r) => (
                    <div key={r[0]} className="slide" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--oo-line)', background: r[0] === '#1042' ? 'var(--oo-halo)' : 'transparent' }}>
                      <b style={{ flex: '0 0 64px' }}>{r[0]}</b>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 500 }}>{r[1]}</span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--oo-muted)' }}>{r[2]}</span>
                      </span>
                      <span style={{ flex: '0 0 72px' }}>{r[3]}</span>
                      <span style={{ flex: '0 0 96px' }}>
                        <span className={`pill ${r[5]}`}>{r[4]}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: 'var(--oo-muted)' }}>
                  Every order captured in chat lands here with status, notes and totals.
                </div>
              </div>
            ) : null}

            {view === 'stats' ? (
              <div className="pop" style={{ flex: '1 1 420px', minWidth: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{l.dashStats}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ flex: '1 1 120px', padding: 14, borderRadius: 14, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                    <div style={{ fontSize: 12, color: 'var(--oo-muted)' }}>Chats handled</div>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>148</div>
                  </div>
                  <div style={{ flex: '1 1 120px', padding: 14, borderRadius: 14, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                    <div style={{ fontSize: 12, color: 'var(--oo-muted)' }}>First reply</div>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>1.8s</div>
                  </div>
                  <div style={{ flex: '1 1 120px', padding: 14, borderRadius: 14, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                    <div style={{ fontSize: 12, color: 'var(--oo-muted)' }}>Orders from chat</div>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>{orders}</div>
                  </div>
                </div>
                <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                  <div style={{ fontSize: 12, color: 'var(--oo-muted)', marginBottom: 12 }}>Revenue this week</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
                    {BARS2.map((x, i) => (
                      <div key={x[0]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
                        <span
                          className="grow"
                          style={{
                            width: '100%',
                            height: `${i === 6 && orderDone ? 124 : x[1]}px`,
                            borderRadius: '8px 8px 3px 3px',
                            background: i === 6 ? 'linear-gradient(180deg,var(--oo-accent),var(--oo-accent2))' : 'var(--oo-lineStrong)',
                          }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--oo-muted)' }}>{x[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span>Handled by AI</span>
                    <b>86%</b>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--oo-surface2)', overflow: 'hidden' }}>
                    <div className="grow" style={{ width: '86%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,var(--oo-accent),var(--oo-accent2))', transformOrigin: 'left' }} />
                  </div>
                </div>
              </div>
            ) : null}

            <div
              className="si d4"
              style={{
                flex: '0 0 290px',
                boxSizing: 'border-box',
                borderLeft: '1px solid var(--oo-line)',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, padding: 12, borderRadius: 14, border: `1px solid ${hotBorder}`, background: 'var(--oo-surface2)', transition: 'border-color .4s' }}>
                  <div style={{ fontSize: 11, color: 'var(--oo-muted)' }}>{l.dashOrdersToday}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>{orders}</div>
                </div>
                <div style={{ flex: 1.3, padding: 12, borderRadius: 14, border: `1px solid ${hotBorder}`, background: 'var(--oo-surface2)', transition: 'border-color .4s' }}>
                  <div style={{ fontSize: 11, color: 'var(--oo-muted)' }}>{l.dashRevenue}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>{revenue}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70, padding: '0 2px' }}>
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className="grow"
                    style={{
                      flex: 1,
                      height: `${h}px`,
                      borderRadius: '6px 6px 3px 3px',
                      background: i === 6 ? 'linear-gradient(180deg,var(--oo-accent),var(--oo-accent2))' : 'var(--oo-lineStrong)',
                      transition: 'height .6s cubic-bezier(.2,.8,.2,1)',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--oo-muted)' }}>{l.dashOrder}</span>
                <span className={`pill ${orderDone ? 'ok' : 'wait'}`}>{orderDone ? l.dashConfirmed : l.dashDraft}</span>
              </div>
              {s6 ? (
                <div className="pop" style={{ padding: 12, borderRadius: 14, border: '1px solid var(--oo-line)', background: 'var(--oo-surface2)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Blue kurti · M</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--oo-muted)' }}>
                    <span>Qty 1</span>
                    <b style={{ color: 'var(--oo-ink)' }}>৳1,850</b>
                  </div>
                </div>
              ) : null}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--oo-muted)' }}>{l.dashActivity}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
                {feed.map((f) => (
                  <div key={f[1]} className="slide" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, marginTop: 6, flex: '0 0 8px', borderRadius: '50%', background: 'var(--oo-accent)' }} />
                    <span style={{ flexGrow: 1 }}>{f[1]}</span>
                    <span style={{ color: 'var(--oo-muted)', fontSize: 12 }}>{f[2]}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setPaused((v) => !v)} className="hov" style={{ marginTop: 'auto', padding: 10, borderRadius: 10, border: '1px solid var(--oo-lineStrong)', background: paused ? 'var(--oo-accent)' : 'transparent', color: paused ? '#fff' : 'var(--oo-ink)', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>
                {paused ? `▶ ${l.dashResume}` : `⏸ ${l.dashPause}`}
              </button>
            </div>
          </div>

          {toast ? (
            <div
              className="toast"
              style={{
                position: 'absolute',
                top: 58,
                right: 20,
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 16,
                background: 'var(--oo-ink)',
                color: 'var(--oo-bg)',
                boxShadow: '0 20px 50px var(--oo-shadow)',
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--oo-ok)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                ✓
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>New order #1042 · ৳1,850</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Captured by AI in Messenger</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
