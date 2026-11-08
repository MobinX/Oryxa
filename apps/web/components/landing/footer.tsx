'use client';

import Link from 'next/link';
import { CookieSettingsButton } from '@/components/cookie-consent';
import { useLandingLang } from './theme';

export function LandingFooter({ companyName }: { companyName: string }) {
  const { strings: t } = useLandingLang();
  const columns = [
    {
      heading: t.footProduct,
      links: [
        { label: t.footLiveDemo, href: '#video' },
        { label: t.footFeatures, href: '#workflow' },
        { label: t.footPricing, href: '/pricing' },
        { label: t.footSolutions, href: '/solutions' },
      ],
    },
    {
      heading: t.footResources,
      links: [
        { label: t.footDocs, href: '/docs' },
        { label: t.footContact, href: '/contact' },
        { label: t.footSignIn, href: '/login' },
        { label: t.footGetStarted, href: '/login' },
      ],
    },
    {
      heading: t.footTrust,
      links: [
        { label: t.footPrivacy, href: '/privacy' },
        { label: t.footTerms, href: '/terms' },
        { label: t.footCookies, href: '/cookies' },
        { label: t.footDataDelete, href: '/data-delete-instructions' },
      ],
    },
  ];
  return (
    <footer style={{ borderTop: '1px solid var(--oo-line)' }}>
      <div className="oo-footer-inner" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', boxSizing: 'border-box' }}>
        <div
          className="oo-footer-top"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 48,
            padding: '56px 0',
            justifyContent: 'space-between',
          }}
        >
          <div className="oo-footer-brand" style={{ maxWidth: 320 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 18 }}>
              <img src="/icon-96.png" alt="" width={30} height={30} style={{ width: 30, height: 30, borderRadius: 8 }} draggable={false} />
              {companyName}
            </div>
            <p
              style={{
                margin: '16px 0 0',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                color: 'var(--oo-muted)',
              }}
            >
              {t.footTag}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--oo-muted)' }}>{t.footBlurb}</p>
          </div>
          <div className="oo-footer-links" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '32px 64px' }}>
            {columns.map((col) => (
              <div key={col.heading}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    color: 'var(--oo-muted)',
                  }}
                >
                  {col.heading}
                </p>
                <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} style={{ color: 'var(--oo-muted)' }} className="hov">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderTop: '1px solid var(--oo-line)',
            padding: '24px 0',
            fontSize: 12,
            color: 'var(--oo-muted)',
          }}
        >
          <p style={{ margin: 0 }}>
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px' }}>
            <Link href="/cookies" style={{ color: 'var(--oo-muted)' }}>
              {t.footCookies}
            </Link>
            <CookieSettingsButton className="oo-cookie-btn">{t.footCookieSettings}</CookieSettingsButton>
            <span>{t.footMade}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
