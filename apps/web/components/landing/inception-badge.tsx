"use client";

import { useCallback, useState } from "react";
import { useLandingLang } from "./theme";

/**
 * NVIDIA Inception program membership badge.
 *
 * ASSET: `apps/web/public/badges/nvidia-inception-member.png` is the supplied
 * member badge. It is shown untouched — never restyled, recolored or redrawn —
 * and strictly as program membership, never as a partnership, endorsement or
 * investment, per NVIDIA's announcement guidance.
 *
 * If the asset is missing, we fall back to a plain factual text line rather
 * than inventing a logo.
 */
export const INCEPTION_BADGE_SRC = "/badges/nvidia-inception-member.png";
export const INCEPTION_PROGRAM_URL = "https://www.nvidia.com/en-us/startups/";

/** Badge aspect ratio (1284 × 545). */
const BADGE_RATIO = 2.356;

function BadgeVisual({ alt, label, height }: { alt: string; label: string; height: number }) {
  const [failed, setFailed] = useState(false);
  // A 404 that lands before hydration never fires onError — catch it on attach too.
  const ref = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) {
    return (
      <span
        style={{
          fontSize: Math.round(height * 0.34),
          fontWeight: 600,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          color: "var(--oo-muted)",
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <img
      ref={ref}
      src={INCEPTION_BADGE_SRC}
      alt={alt}
      width={Math.round(height * BADGE_RATIO)}
      height={height}
      draggable={false}
      onError={() => setFailed(true)}
      style={{ height, width: "auto", display: "block", borderRadius: 6 }}
    />
  );
}

function BadgeShell({ alt, label, height }: { alt: string; label: string; height: number }) {
  return (
    <a
      href={INCEPTION_PROGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={alt}
      className="oo-nvidia-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 7,
        textDecoration: "none",
      }}
    >
      <BadgeVisual alt={alt} label={label} height={height} />
    </a>
  );
}

/** Centered membership mark for the landing page (inside LandingRoot). */
export function NvidiaInceptionBand() {
  const { strings: t } = useLandingLang();
  return (
    <section
      aria-label={t.inceptionCaption}
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "22px 32px 2px",
        boxSizing: "border-box",
        textAlign: "center",
      }}
    >
      <div className="oo-nvidia-float">
        <BadgeShell alt={t.inceptionBadgeAlt} label={t.inceptionCaption} height={50} />
      </div>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 12.5,
          fontWeight: 500,
          letterSpacing: "0.02em",
          color: "var(--oo-muted)",
        }}
      >
        {t.inceptionCaption}
      </p>
    </section>
  );
}

/** Compact linked mark for footer brand blocks (theme-agnostic). */
export function NvidiaInceptionMark({ alt, label }: { alt: string; label: string }) {
  return <BadgeShell alt={alt} label={label} height={56} />;
}
