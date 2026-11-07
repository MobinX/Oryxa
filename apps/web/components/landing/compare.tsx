'use client';

import { useState } from 'react';
import type { DisplayPlan, PlanCompareRow } from '@/lib/plan-display';
import { useLandingLang } from './theme';
import {
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  Crown,
  Headphones,
  Layers,
  MessageCircle,
  MessagesSquare,
  Rocket,
  Store,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function compareCellColor(cell: string, featured: boolean): string {
  if (cell === '✓') return 'var(--oo-ok)';
  if (cell === '—') return 'var(--oo-muted)';
  return featured ? 'var(--oo-accent)' : 'var(--oo-muted)';
}

/** Keyword icon for a feature-label cell (matched on the lowercased label). */
function compareLabelIcon(label: string): LucideIcon {
  const l = label.toLowerCase();
  if (l.includes('messenger')) return MessageCircle;
  if (l.includes('comment')) return MessagesSquare;
  if (l.includes('agent')) return Bot;
  if (l.includes('storefront') || l.includes('orders and posts')) return Store;
  if (l.includes('priority')) return Headphones;
  if (l.includes('pages')) return Layers;
  if (l.includes('custom') || l.includes('team')) return Users;
  if (l.includes('onboarding')) return Rocket;
  return Check;
}

/** Shorten a quota cell to its leading quantity ('Up to 1,000 …' → 'Up to 1,000'). */
function shortCompareCell(cell: string): string {
  if (cell === '✓' || cell === '—') return cell;
  const m = cell.match(/^((?:Up to\s+)?[\d,]+|Unlimited|Uncapped)\b/i);
  return m ? m[1]! : cell;
}

/**
 * Full feature matrix, collapsed by default (the Intercom pattern): the plan
 * cards stay the primary comparison, and this one-line disclosure expands to
 * an intro + dense table with an optional differences-only filter.
 */
export function CompareTable({ plans, compareRows }: { plans: DisplayPlan[]; compareRows: PlanCompareRow[] }) {
  const { strings: t } = useLandingLang();
  const [open, setOpen] = useState(false);
  const [diffOnly, setDiffOnly] = useState(false);
  const rows = diffOnly ? compareRows.filter((row) => new Set(row.cells).size > 1) : compareRows;
  const bullets = [t.compareB1, t.compareB2, t.compareB3];
  return (
    <div style={{ marginTop: 32 }}>
      <div
        style={{
          borderRadius: 20,
          border: '1px solid var(--oo-line)',
          background: 'var(--oo-surface)',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="hov"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '18px 24px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--oo-ink)',
            fontSize: 15,
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          <span>
            {t.compareH} ·{' '}
            <span style={{ fontWeight: 400, color: 'var(--oo-muted)' }}>
              {open ? t.compareCollapse : t.compareExpand(compareRows.length)}
            </span>
          </span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .25s', flexShrink: 0 }}
          />
        </button>
      </div>
      {open ? (
        <div
          className="pop"
          style={{
            marginTop: 16,
            borderRadius: 20,
            border: '1px solid var(--oo-line)',
            background: 'var(--oo-surface)',
            padding: 24,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flex: '0 1 260px' }}>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'var(--oo-halo)',
                  color: 'var(--oo-accent)',
                }}
              >
                <BarChart3 size={22} />
              </span>
              <h3 style={{ margin: '16px 0 8px', fontSize: 20, fontWeight: 700 }}>{t.compareH}</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--oo-muted)' }}>{t.compareSub}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bullets.map((b) => (
                  <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--oo-accent)',
                        color: '#fff',
                      }}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span>{b}</span>
                  </span>
                ))}
              </div>
            </div>
            <div style={{ flex: '1 1 480px', minWidth: 0 }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0 12px',
                  fontSize: 13,
                  color: 'var(--oo-muted)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={diffOnly}
                  onChange={(event) => setDiffOnly(event.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--oo-accent)' }}
                />
                {t.compareDiffOnly}
              </label>
              <div className="oo-table-scroll" style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    minWidth: 480,
                    textAlign: 'left',
                    fontSize: 13,
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          position: 'sticky',
                          left: 0,
                          background: 'var(--oo-surface)',
                          padding: '10px 16px 10px 0',
                          borderBottom: '1px solid var(--oo-line)',
                          fontWeight: 600,
                          color: 'var(--oo-muted)',
                          whiteSpace: 'nowrap',
                          zIndex: 1,
                        }}
                      >
                        {t.compareFeature}
                      </th>
                      {plans.map((plan) => (
                        <th
                          key={plan.slug}
                          style={{
                            padding: '10px 6px',
                            textAlign: 'center',
                            borderBottom: '1px solid var(--oo-line)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span
                            style={
                              plan.featured
                                ? {
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    borderRadius: 10,
                                    padding: '8px 12px',
                                    background: 'linear-gradient(135deg,var(--oo-accent),var(--oo-accent2))',
                                    color: '#fff',
                                    fontWeight: 700,
                                  }
                                : {
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    borderRadius: 10,
                                    padding: '8px 12px',
                                    background: 'var(--oo-surface2)',
                                    color: 'var(--oo-ink)',
                                    fontWeight: 600,
                                  }
                            }
                          >
                            {plan.featured ? <Crown size={14} aria-hidden="true" /> : null}
                            {plan.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const LabelIcon = compareLabelIcon(row.label);
                      return (
                        <tr key={row.label}>
                          <td
                            style={{
                              position: 'sticky',
                              left: 0,
                              background: 'var(--oo-surface)',
                              padding: '7px 16px 7px 0',
                              fontWeight: 500,
                              borderBottom: '1px solid var(--oo-line)',
                              whiteSpace: 'nowrap',
                              zIndex: 1,
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <LabelIcon size={16} color="var(--oo-accent)" aria-hidden="true" />
                              {row.label}
                            </span>
                          </td>
                          {row.cells.map((cell, ci) => {
                            const featured = plans[ci]?.featured === true;
                            return (
                              <td
                                key={ci}
                                style={{
                                  padding: '7px 12px',
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap',
                                  borderBottom: '1px solid var(--oo-line)',
                                  background: featured ? 'var(--oo-halo)' : 'transparent',
                                  color: compareCellColor(cell, featured),
                                  fontWeight: featured ? 600 : cell === '✓' ? 700 : 400,
                                }}
                              >
                                {shortCompareCell(cell)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
