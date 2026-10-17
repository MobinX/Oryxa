import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  BRAND_SWAPS,
  brandSwapTarget,
  swapBrand,
  VercelApiError,
} from '../../apps/api2/lib/vercel-brand';

/**
 * Every call this module makes, recorded so a test can say what was written and where. The shape of
 * each response is Vercel's real one — the `envs` key, a deployment's `uid`, the created
 * deployment's `id` — because those names are the part that breaks silently.
 */
const calls: { method: string; url: string; body?: unknown }[] = [];

const WEB_ROWS = (current: string) => [
  { id: 'env_company', key: 'COMPANY_NAME', value: current, target: ['production', 'preview'] },
  { id: 'env_parent', key: 'PARENT_COMPANY_NAME', value: 'unimportant — the web project decides', target: ['production', 'preview'] },
];

/** `WEB_URL` is stored encrypted and never comes back with a value; only its id is needed to write it. */
const API_ROWS = [
  { id: 'env_weburl', key: 'WEB_URL', target: ['production', 'preview'] },
];

function stubVercel(
  currentCompany: string,
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
      if (String(input).includes('/projects/prj_web/env?')) return json({ envs: WEB_ROWS(currentCompany) });
      if (String(input).includes('/projects/prj_api/env?')) return json({ envs: API_ROWS });
      if (/\/v9\/projects\/[^/]+\/env\//.test(input)) return json({ id: 'ok' });
      if (String(input).endsWith('/v9/projects/oryxa-web')) return json({ id: 'prj_web', name: 'oryxa-web' });
      if (String(input).endsWith('/v9/projects/oryxa-api2')) return json({ id: 'prj_api', name: 'oryxa-api2' });
      if (String(input).includes('/v6/deployments')) {
        const isApi = String(input).includes('prj_api');
        return json({
          deployments: [{ uid: isApi ? 'dpl_api_live' : 'dpl_web_live', url: `${isApi ? 'api' : 'web'}.vercel.app`, target: 'production' }],
        });
      }
      if (String(input).includes('/v13/deployments')) {
        const isApi = (init.body as string | undefined)?.includes('oryxa-api2');
        return json({ id: isApi ? 'dpl_api_new' : 'dpl_web_new', url: 'new.vercel.app', readyState: 'QUEUED' });
      }

      return json({ error: { code: 'not_found', message: `unstubbed ${method} ${input}` } }, 404);
    }),
  );
}

const patched = () => calls.filter((c) => c.method === 'PATCH');
const started = () => calls.filter((c) => c.method === 'POST');

const swap = (dryRun = false) =>
  swapBrand({ token: 'vcp_test', webProjectName: 'oryxa-web', apiProjectName: 'oryxa-api2', dryRun });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the brand moves as one decision', () => {
  it('sends the name, the entity and the domain together in each direction', () => {
    expect(BRAND_SWAPS.Oryxa).toEqual({
      COMPANY_NAME: 'OnlyOrders',
      PARENT_COMPANY_NAME: 'OnlyOrders',
      WEB_URL: 'https://www.onlyorders.tech/',
    });
    expect(BRAND_SWAPS.OnlyOrders).toEqual({
      COMPANY_NAME: 'Oryxa',
      PARENT_COMPANY_NAME: 'RR Computer',
      WEB_URL: 'https://oryxa.rrcomputer.com.bd/',
    });
  });

  /** The button is its own undo, and that only holds if the swap is a two-cycle. */
  it('comes back to where it started', () => {
    for (const productName of Object.keys(BRAND_SWAPS)) {
      const once = brandSwapTarget(productName);
      const twice = brandSwapTarget(once.COMPANY_NAME);
      expect(twice.COMPANY_NAME).toBe(productName);
    }
  });

  it('refuses a name it does not know how to leave', () => {
    expect(() => brandSwapTarget('NASA')).toThrow(/not a brand this swap knows how to leave/);
  });
});

describe('swapBrand against a stubbed Vercel', () => {
  it('writes all three variables and starts a build for each project', async () => {
    stubVercel('Oryxa');

    const result = await swap();

    expect(result.to).toEqual({
      COMPANY_NAME: 'OnlyOrders',
      PARENT_COMPANY_NAME: 'OnlyOrders',
      WEB_URL: 'https://www.onlyorders.tech/',
    });
    expect(patched().map((c) => c.body)).toEqual([
      { value: 'OnlyOrders', target: ['production', 'preview'] },
      { value: 'OnlyOrders', target: ['production', 'preview'] },
      { value: 'https://www.onlyorders.tech/', target: ['production', 'preview'] },
    ]);
    expect(started().map((c) => (c.body as { project: string }).project)).toEqual(['oryxa-web', 'oryxa-api2']);
    expect(started()[0].url).toContain('forceNew=1');
    expect(started()[0].body).toMatchObject({ deploymentId: 'dpl_web_live', target: 'production' });
    expect(result.builds.map((b) => b.deploymentId)).toEqual(['dpl_web_new', 'dpl_api_new']);
  });

  /** `WEB_URL` is encrypted, so the API project's own env can say nothing — the web project's name decides. */
  it('takes the direction from the web project and writes the domain blind', async () => {
    stubVercel('OnlyOrders');

    const result = await swap();

    expect(result.to.COMPANY_NAME).toBe('Oryxa');
    expect(result.to.WEB_URL).toBe('https://oryxa.rrcomputer.com.bd/');
    expect(result.from.WEB_URL).toBe('https://www.onlyorders.tech/');
  });

  /** The row's own `target` is sent back unchanged: a preview-and-production variable must not be
   * narrowed to one environment by a write that only meant to change a value. */
  it('keeps the environments each variable is scoped to', async () => {
    stubVercel('Oryxa');

    await swap();

    expect(patched().map((c) => (c.body as { target: string[] }).target)).toEqual([
      ['production', 'preview'],
      ['production', 'preview'],
      ['production', 'preview'],
    ]);
  });

  it('rehearses without writing or building', async () => {
    stubVercel('Oryxa');

    const result = await swap(true);

    expect(result.dryRun).toBe(true);
    expect(patched()).toEqual([]);
    expect(started()).toEqual([]);
    expect(result.to.COMPANY_NAME).toBe('OnlyOrders');
  });

  it('stops before writing anything when a project has no brand variable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/env?')) return new Response(JSON.stringify({ envs: [] }), { status: 200 });
        if (url.endsWith('/v9/projects/oryxa-web')) return new Response(JSON.stringify({ id: 'prj_web', name: 'oryxa-web' }), { status: 200 });
        if (url.endsWith('/v9/projects/oryxa-api2')) return new Response(JSON.stringify({ id: 'prj_api', name: 'oryxa-api2' }), { status: 200 });
        return new Response(JSON.stringify({ error: { message: 'unstubbed' } }), { status: 404 });
      }),
    );

    await expect(swap()).rejects.toThrow(VercelApiError);
    await expect(swap()).rejects.toThrow(/no COMPANY_NAME or PARENT_COMPANY_NAME variable/);
  });

  /** `COMPANY_NAME` is the one readable value, and the whole direction hangs on it: a row Vercel
   * will not decrypt has to stop the swap rather than let it rename the site by guesswork. */
  it('refuses to guess when the deciding value is stored as a secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/projects/prj_web/env?')) {
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
        if (url.includes('/projects/prj_api/env?')) return new Response(JSON.stringify({ envs: API_ROWS }), { status: 200 });
        if (url.endsWith('/v9/projects/oryxa-web')) return new Response(JSON.stringify({ id: 'prj_web', name: 'oryxa-web' }), { status: 200 });
        if (url.endsWith('/v9/projects/oryxa-api2')) return new Response(JSON.stringify({ id: 'prj_api', name: 'oryxa-api2' }), { status: 200 });
        return new Response(JSON.stringify({ error: { message: 'unstubbed' } }), { status: 404 });
      }),
    );

    await expect(swap()).rejects.toThrow(/stored as a secret/);
  });

  /** Deduplication is the quiet failure: a 200 that joined an existing build would report success
   * while the old name keeps serving, so the redeploy asks for a new build by name — and a refusal
   * from Vercel has to reach the operator as the reason, not as a swap that quietly succeeded. */
  it('reads the Vercel status when a redeploy is refused', async () => {
    stubVercel('Oryxa', { on: /\/v13\/deployments/, status: 422, message: 'build queue full' });

    const err = await swap().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VercelApiError);
    expect((err as VercelApiError).status).toBe(422);
    expect((err as Error).message).toContain('build queue full');
  });
});
