import { isOperatorBearer } from '@api/middleware/logs-access';
import { swapBrand, vercelPersonaKey, VercelApiError, type BrandSwapResult } from '@/lib/vercel-brand';

export const runtime = 'nodejs';

/** Nothing to cache and nothing to re-run: a POST that redeploys production must answer once. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `POST /api/brand/toggle` — the button in the admin panel.
 *
 * The swap writes `COMPANY_NAME` and `PARENT_COMPANY_NAME` on the web project and starts a
 * production build, which is two live changes to the site customers are on. So it opens with the
 * same secret every other `/api2/admin` route opens with, it takes no input at all (the direction
 * is read from what Vercel currently holds, never from the request), and it refuses rather than
 * guesses when the live name is one of the two it does not know how to leave.
 *
 * `dryRun` is the same handler without the writes, so an operator can read the direction back
 * before committing to a build.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isOperatorBearer(req.headers.get('Authorization'))) {
    return Response.json({ error: 'Forbidden — the operator console must sign this request' }, { status: 401 });
  }

  const token = vercelPersonaKey();
  if (!token) {
    return Response.json(
      { error: 'VERCEL_PERSONA_KEY is not set on this deployment, so nothing can be written to Vercel' },
      { status: 500 },
    );
  }

  const wantDryRun = new URL(req.url).searchParams.get('dryRun') === '1';

  try {
    const result: BrandSwapResult = await swapBrand({ token, dryRun: wantDryRun });
    return Response.json(result, { status: wantDryRun ? 200 : 202 });
  } catch (err) {
    // A Vercel rejection is the operator's own account refusing, and its status says which:
    // 404 for a project or variable that is not there, 409 for a brand this swap cannot leave.
    if (err instanceof VercelApiError) {
      return Response.json({ error: err.message, dryRun: wantDryRun }, { status: err.status });
    }
    return Response.json({ error: err instanceof Error ? err.message : 'The swap failed' }, { status: 502 });
  }
}
