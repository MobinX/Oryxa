'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, MessageCircle, ShoppingCart, Tag } from 'lucide-react';
import { useLandingLang, usePrefersReducedMotion } from './theme';

function SpeakerOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"></path>
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.6 5.4a9 9 0 0 1 0 13.2"></path>
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"></path>
      <path d="M23 9l-6 6M17 9l6 6"></path>
    </svg>
  );
}

export function LandingVideo({ companyName }: { companyName: string }) {
  const { strings: t } = useLandingLang();
  const reducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [flash, setFlash] = useState<'play' | 'pause' | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autoplay (muted — browsers allow no other kind) unless reduced motion.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;
    video.play().catch(() => setPlaying(false));
  }, [reducedMotion]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const showFlash = (kind: 'play' | 'pause') => {
    setFlash(kind);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 650);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = (event: React.MouseEvent) => {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  return (
    <section
      id="video"
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '88px 32px 24px',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 16px',
          borderRadius: 999,
          background: 'var(--oo-halo)',
          color: 'var(--oo-accent)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <Tag size={14} aria-hidden="true" />
        {t.videoKicker}
      </div>
      <h2
        style={{
          margin: '10px 0 12px',
          fontSize: 48,
          lineHeight: 1.05,
          letterSpacing: '-0.035em',
          fontWeight: 700,
        }}
      >
        {t.videoH2(companyName)}
      </h2>
      <p style={{ margin: '0 auto 36px', maxWidth: 560, color: 'var(--oo-muted)', fontSize: 18 }}>{t.videoSub}</p>
      <div
        style={{
          position: 'relative',
          padding: 1,
          borderRadius: 30,
          background: 'linear-gradient(180deg, var(--oo-lineStrong), transparent 90%)',
          boxShadow: '0 40px 100px var(--oo-halo)',
        }}
      >
        <div
          className="oo-video-player"
          onClick={togglePlay}
          role="button"
          tabIndex={0}
          aria-label={playing ? t.videoPause : t.videoPlay}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              togglePlay();
            }
          }}
          style={{
            position: 'relative',
            aspectRatio: '16 / 9',
            borderRadius: 29,
            overflow: 'hidden',
            background: '#000',
            cursor: 'pointer',
          }}
        >
          <div
            className="oo-order-float"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              zIndex: 2,
              width: 210,
              boxSizing: 'border-box',
              padding: 14,
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.75)',
              background: 'var(--oo-surface, #fff)',
              boxShadow: '0 12px 36px rgba(10,20,40,0.18)',
              textAlign: 'left',
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#15803d', fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: 'var(--oo-text, #111)' }}>{t.orderCreated}</span>
              <Check size={14} color="#16a34a" />
            </div>
            <div style={{ marginTop: 5, color: 'var(--oo-muted)', fontSize: 12 }}>#1042</div>
            <div style={{ marginTop: 3, color: 'var(--oo-text, #111)', fontSize: 20, fontWeight: 800 }}>৳1,850</div>
          </div>
          <video
            ref={videoRef}
            src="/landing/onlyorders-commercial.mp4"
            poster="/landing/commercial-poster.jpg"
            muted={muted}
            loop
            playsInline
            preload="metadata"
            onPlay={() => {
              setPlaying(true);
              showFlash('play');
            }}
            onPause={() => {
              setPlaying(false);
              showFlash('pause');
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              background: '#000',
            }}
          />
          {flash ? (
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: 'rgba(10,10,20,0.55)',
                backdropFilter: 'blur(6px)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                animation: 'oo-pop 0.45s cubic-bezier(.2,.8,.2,1)',
              }}
            >
              {flash === 'play' ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                  <path d="M8 5l12 7-12 7z"></path>
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1.5"></rect>
                  <rect x="14" y="5" width="4" height="14" rx="1.5"></rect>
                </svg>
              )}
            </span>
          ) : null}
          {!playing ? (
            <span
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 84,
                height: 84,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 16px 50px var(--oo-halo2)',
                pointerEvents: 'none',
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M8 5l12 7-12 7z"></path>
              </svg>
            </span>
          ) : null}
          <button
            onClick={toggleMute}
            aria-label={muted ? t.videoUnmute : t.videoMute}
            title={muted ? t.videoUnmute : t.videoMute}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(10,10,20,0.55)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {muted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
          </button>
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginTop: 18,
          color: 'var(--oo-muted)',
        }}
      >
        {[MessageCircle, ShoppingCart, Check].map((Icon, index) => (
          <span key={index} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {index > 0 ? <ArrowRight size={14} aria-hidden="true" /> : null}
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'var(--oo-halo)',
                color: 'var(--oo-accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={16} aria-hidden="true" />
            </span>
          </span>
        ))}
      </div>
      <style>{'@media (max-width: 700px){.oo .oo-order-float{display:none}}'}</style>
    </section>
  );
}
