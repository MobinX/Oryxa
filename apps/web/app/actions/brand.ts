'use server';

import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, adminSwapBrand, type BrandSwapResult } from '@/lib/api';

export type BrandSwapOutcome =
  | { ok: true; result: BrandSwapResult }
  | { ok: false; error: string };

/**
 * Presses the other brand onto the live site: the two names on the Vercel project, then the build
 * that makes them what a visitor reads.
 *
 * The direction is not an argument. The API reads what the project is called right now and moves to
 * the other one, so two operators clicking this in two tabs cannot land on a name neither of them
 * asked for — the second click says what it found and swaps from there.
 *
 * Deliberately no `revalidatePath`: this app's own `COMPANY_NAME` is baked into its build, so the
 * console keeps printing the old name until the new deployment is promoted. Revalidating would
 * imply the page had changed when the only thing that changed is a build in progress.
 */
export async function swapBrandAction(): Promise<BrandSwapOutcome> {
  // Outside the try: with no console session this throws Next's redirect, and a catch that turns
  // every throw into a notice would swallow it and leave the operator on the page with a message
  // about the swap rather than back at the sign-in that would actually fix it.
  const bearer = await requireConsoleBearer();

  try {
    return { ok: true, result: await adminSwapBrand(bearer) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { ok: false, error: 'Sign in to the console again before swapping the brand.' };
    }
    return {
      ok: false,
      error: err instanceof ApiError ? err.message : 'Could not reach the swap.',
    };
  }
}
