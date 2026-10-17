import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  BRAND_SWAPS,
  brandSwapTarget,
  swapBrand,
  VercelApiError,
  type BrandNames,
} from '../../apps/api2/lib/vercel-brand';

/**
 * Every call this module makes, recorded so a test can say what was written and where. The shape of
 * each response is Vercel's real one — the `envs` key, a deployment's `uid`, the created
 * deployment's `id` — because those names are the part that breaks silently.
 */
const calls: { method: string; url: string; body?: unknown }[] = [];

function stubVercel(
  current: BrandNames,
  refuse: { on: RegExp; status: number; message: string } | null = null,
) {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url: input, body });

      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

      if (refuse?.on.test(input)) return json({ error: { code: 'refused', message: refuse.message } }, refuse.status);
      if (input.includes('/env?decrypt')) {
        return json({
          envs: [
            { id: 'env_company', key: 'COMPANY_NAME', value: current.COMPANY_NAME, target: ['production', 'preview'] },
            { id: 'env_parent', key: 'PARENT_COMPANY_NAME', value: current.PARENT_COMPANY_NAME, target: ['production', 'preview'] },
          ],
        });
      }
      if (/\/v9\/projects\/[^/]+\/env\//.test(input)) return json({ id: 'ok' });
      if (/\/v9\/projects\/[^/]+$/.test(input)) return json({ id: 'prj_web', name: 'oryxa-web' });
      if (input.includes('/v6/deployments')) {
        return json({ deployments: [{ uid: 'dpl_live', url: 'oryxa-web.vercel.app', target: 'production' }] });
      }
      if (input.includes('/v13/deployments')) return json({ id: 'dpl_new', url: 'oryxa-web-xyz.vercel.app', readyState: 'QUEUED' });

      return json({ error: { code: 'not_found', message: `unstubbed ${method} ${input}` } }, 404);
    }),
  );
}

const patched = () => calls.filter((c) => c.method === 'PATCH');
const started = () => calls.filter((c) => c.method === 'POST');

const swap = (dryRun = false) =>
  swapBrand({ token: 'vcp_test', projectName: 'oryxa-web', dryRun });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the brand pair moves as one decision', () => {
  it('sends both names together in each direction', () => {
    expect(BRAND_SWAPS.Oryxa).toEqual({ COMPANY_NAME: 'OnlyOrders', PARENT_COMPANY_NAME: 'OnlyOrders' });
    expect(BRAND_SWAPS.OnlyOrders).toEqual({ COMPANY_NAME: 'Oryxa', PARENT_COMPANY_NAME: 'RR Computer' });
  });

  /** The button is its own undo, and that only holds if the swap is a two-cycle. */
  it('comes back to where it started', () => {
    for (const productName of Object.keys(BRAND_SWAPS)) {
      const once = brandSwapTarget({ COMPANY_NAME: productName, PARENT_COMPANY_NAME: 'anything' });
      const twice = brandSwapTarget(once);
      expect(twice.COMPANY_NAME).toBe(productName);
    }
  });

  it('refuses a name it does not know how to leave', () => {
    expect(() => brandSwapTarget({ COMPANY_NAME: 'NASA', PARENT_COMPANY_NAME: 'x' } as BrandNames)).toThrow(
      /not a brand this swap knows how to leave/,
    );
  });
});

describe('swapBrand against a stubbed Vercel', () => {
  it('writes both variables and starts one production build', async () => {
    stubVercel({ COMPANY_NAME: 'Oryxa', PARENT_COMPANY_NAME: 'RR Computer' });

    const result = await swap();

    expect(result.to).toEqual({ COMPANY_NAME: 'OnlyOrders', PARENT_COMPANY_NAME: 'OnlyOrders' });
    expect(patched().map((c) => c.body)).toEqual([
      { value: 'OnlyOrders', target: ['production', 'preview'] },
      { value: 'OnlyOrders', target: ['production', 'preview'] },
    ]);
    expect(started()).toHaveLength(1);
    expect(started()[0].url).toContain('forceNew=1');
    expect(started()[0].body).toMatchObject({
      project: 'oryxa-web',
      deploymentId: 'dpl_live',
      target: 'production',
    });
    expect(result.deploymentId).toBe('dpl_new');
  });

  /** The row's own `target` is sent back unchanged: a preview-and-production variable must not be
   * narrowed to one environment by a write that only meant to change a value. */
  it('keeps the environments each variable is scoped to', async () => {
    stubVercel({ COMPANY_NAME: 'OnlyOrders', PARENT_COMPANY_NAME: 'OnlyOrders' });

    await swap();

    expect(patched()[0].body).toHaveProperty('target', ['production', 'preview']);
    expect(brandSwapTarget({ COMPANY_NAME: 'OnlyOrders', PARENT_COMPANY_NAME: 'OnlyOrders' }).PARENT_COMPANY_NAME).toBe('RR Computer');
  });

  it('rehearses without writing or building', async () => {
    stubVercel({ COMPANY_NAME: 'Oryxa', PARENT_COMPANY_NAME: 'RR Computer' });

    const result = await swap(true);

    expect(result.dryRun).toBe(true);
    expect(patched()).toEqual([]);
    expect(started()).toEqual([]);
    expect(result.to.COMPANY_NAME).toBe('OnlyOrders');
  });

  it('stops before writing anything when the live project has no brand variables', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init: RequestInit = {}) => {
        if (String(input).includes('/env?')) return new Response(JSON.stringify({ envs: [] }), { status: 200 });
        if (String(input).endsWith('/v9/projects/oryxa-web')) {
          return new Response(JSON.stringify({ id: 'prj_web', name: 'oryxa-web' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: 'unstubbed' } }), { status: 404 });
      }),
    );

    await expect(swap()).rejects.toThrow(VercelApiError);
    await expect(swap()).rejects.toThrow(/no COMPANY_NAME or PARENT_COMPANY_NAME variable/);
  });

  /** A `sensitive` row never returns its value, so the direction cannot be read off it — and guessing
   * one direction would rename the site to what it may already be called. */
  it('refuses to guess when the values are stored as secrets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).includes('/env?')) {
          return new Response(
            JSON.stringify({
              envs: [
                { id: 'a', key: 'COMPANY_NAME', target: ['production'] },
                { id: 'b', key: 'PARENT_COMPANY_NAME', target: ['production'] },
              ],
            }),
            { status: 200 },
          );
        }
        if (String(input).endsWith('/v9/projects/oryxa-web')) {
          return new Response(JSON.stringify({ id: 'prj_web', name: 'oryxa-web' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: 'unstubbed' } }), { status: 404 });
      }),
    );

    await expect(swap()).rejects.toThrow(/stored as secrets/);
  });

  /** Deduplication is the quiet failure: a 200 that joined an existing build would report success
   * while the old name keeps serving, so the redeploy asks for a new build by name — and a refusal
   * from Vercel has to reach the operator as the reason, not as a swap that quietly succeeded. */
  it('reads the Vercel status when the redeploy is refused', async () => {
    stubVercel(
      { COMPANY_NAME: 'Oryxa', PARENT_COMPANY_NAME: 'RR Computer' },
      { on: /\/v13\/deployments/, status: 422, message: 'build queue full' },
    );

    const err = await swap().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VercelApiError);
    expect((err as VercelApiError).status).toBe(422);
    expect((err as Error).message).toContain('build queue full');
  });
});
