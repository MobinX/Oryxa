import { describe, it, expect } from 'vitest';
import { toCompareRows, toDisplayPlans } from '../../apps/web/lib/plan-display';
import type { PublicPlan } from '../../apps/web/lib/api';

const plan = (overrides: Partial<PublicPlan>): PublicPlan => ({
  name: 'Free',
  slug: 'free',
  priceCents: 0,
  currency: 'USD',
  priceLabel: 'Free',
  messageLimitLabel: '1,000 messenger replies',
  commentLimitLabel: '1,000 comment replies',
  features: ['Storefront, orders and posts included'],
  ...overrides,
});

describe('web plan cards (apps/web/lib/plan-display.ts)', () => {
  it('sends the $0 uncapped Custom offer to the contact page, not signup', () => {
    const [custom] = toDisplayPlans([
      plan({
        name: 'Custom',
        slug: 'enterprise',
        messageLimitLabel: 'Uncapped',
        commentLimitLabel: 'Uncapped',
        features: ['Custom pricing, agreed with our team'],
      }),
    ]);

    expect(custom.custom).toBe(true);
    expect(custom.priceLabel).toBe('Custom');
    expect(custom.cta).toBe('Contact us');
    expect(custom.ctaHref).toBe('/contact');
    expect(custom.copy).toContain('priced with our team');
  });

  it('keeps a $0 capped tier on the free signup path', () => {
    const [free] = toDisplayPlans([plan({})]);

    expect(free.custom).toBe(false);
    expect(free.priceLabel).toBe('Free');
    expect(free.cta).toBe('Get started free');
    expect(free.ctaHref).toBe('/login');
  });

  it('keeps paid tiers on signup and Pro featured', () => {
    const [starter, pro] = toDisplayPlans([
      plan({ name: 'Starter', slug: 'starter', priceCents: 2900, priceLabel: '$29' }),
      plan({ name: 'Pro', slug: 'pro', priceCents: 7900, priceLabel: '$79' }),
    ]);

    expect(starter.cta).toBe('Get started');
    expect(starter.ctaHref).toBe('/login');
    expect(starter.featured).toBe(false);
    expect(pro.featured).toBe(true);
    expect(pro.badge).toBe('Most popular');
  });

  it('collapses one shared feature string into one compare row', () => {
    const rows = toCompareRows([
      plan({ features: ['Storefront, orders and posts included'] }),
      plan({
        slug: 'starter',
        features: ['Storefront, orders and posts included', 'Priority support'],
      }),
    ]);

    const storefront = rows.filter((row) => row.label === 'Storefront, orders and posts included');
    expect(storefront).toHaveLength(1);
    expect(storefront[0].cells).toEqual(['✓', '✓']);
    expect(rows.find((row) => row.label === 'Priority support')?.cells).toEqual(['—', '✓']);
  });

  it('keeps the limit rows first and exactly as saved', () => {
    const rows = toCompareRows([
      plan({ messageLimitLabel: '1,000 messenger replies', commentLimitLabel: '500 comment replies' }),
      plan({ slug: 'starter', messageLimitLabel: 'Uncapped', commentLimitLabel: 'Uncapped' }),
    ]);

    expect(rows[0]).toEqual({
      label: 'Messenger replies',
      cells: ['1,000 messenger replies', 'Uncapped'],
    });
    expect(rows[1]).toEqual({
      label: 'Comment replies',
      cells: ['500 comment replies', 'Uncapped'],
    });
  });

  it('groups quota-like agent replies into one row with per-plan values', () => {
    const rows = toCompareRows([
      plan({ features: ['1,000 agent replies per 30 days'] }),
      plan({ slug: 'starter', features: ['Up to 3000 agent replies per 30 days'] }),
      plan({ slug: 'enterprise', features: ['Unlimited agent replies'] }),
    ]);

    expect(rows[0]?.label).toBe('Messenger replies');
    expect(rows[1]?.label).toBe('Comment replies');
    const agent = rows.filter((row) => row.label.toLowerCase().includes('agent repl'));
    expect(agent).toHaveLength(1);
    expect(agent[0]?.label).toBe('Agent replies per 30 days');
    expect(agent[0]?.cells).toEqual(['1,000', 'Up to 3,000', 'Unlimited']);
  });

  it('formats thousands separators and groups Unlimited with Uncapped', () => {
    const rows = toCompareRows([
      plan({ features: ['Up to 10000 seats'] }),
      plan({ slug: 'starter', features: ['Unlimited seats'] }),
      plan({ slug: 'enterprise', features: ['Uncapped seats'] }),
    ]);

    expect(rows.find((row) => row.label === 'Seats')?.cells).toEqual([
      'Up to 10,000',
      'Unlimited',
      'Uncapped',
    ]);
  });

  it('keeps boolean-only groups as checkmarks with — for missing plans', () => {
    const rows = toCompareRows([
      plan({ features: ['Priority support'] }),
      plan({ slug: 'starter', features: [] }),
      plan({ slug: 'pro', features: ['Priority support'] }),
    ]);

    expect(rows.find((row) => row.label === 'Priority support')?.cells).toEqual(['✓', '—', '✓']);
  });

  it('shows — when a plan lacks the quota group', () => {
    const rows = toCompareRows([
      plan({ features: ['500 exports per month'] }),
      plan({ slug: 'starter', features: [] }),
    ]);

    expect(rows.find((row) => row.label === 'Exports per month')?.cells).toEqual(['500', '—']);
  });

  it('keeps mixed units in the cells instead of the label', () => {
    const rows = toCompareRows([
      plan({ features: ['100 exports per month'] }),
      plan({ slug: 'starter', features: ['200 exports per 30 days'] }),
    ]);

    const row = rows.find((row) => row.label === 'Exports');
    expect(row?.cells).toEqual(['100 per month', '200 per 30 days']);
  });

  it('keeps the full string when a quantity-less item lands in a quota group', () => {
    const rows = toCompareRows([
      plan({ features: ['500 seats per month'] }),
      plan({ slug: 'enterprise', features: ['Seats per month'] }),
    ]);

    expect(rows.find((row) => row.label === 'Seats per month')?.cells).toEqual([
      '500',
      'Seats per month',
    ]);
  });

  it('orders groups by first appearance after the limit rows', () => {
    const rows = toCompareRows([
      plan({ features: ['Priority support', '500 seats'] }),
      plan({ slug: 'starter', features: ['500 seats', 'Priority support'] }),
    ]);

    expect(rows.map((row) => row.label)).toEqual([
      'Messenger replies',
      'Comment replies',
      'Priority support',
      'Seats',
    ]);
  });
});
