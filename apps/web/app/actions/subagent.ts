'use server';

import { revalidatePath } from 'next/cache';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, adminUpdateSubagentPrompt } from '@/lib/api';

export type SubagentSaveResult = { ok: true } | { ok: false; error: string };

/**
 * The operator's edit of a subagent's instructions. Console bearer only: this text answers customers
 * of every store, and a merchant's token must not be able to rewrite it.
 *
 * The write is the whole save — runs read the row on every tool call, so the next customer turn
 * already answers with it and no restart is involved.
 */
export async function saveSubagentPromptAction(formData: FormData): Promise<SubagentSaveResult> {
  // Outside the try: with no console session this throws Next's redirect, and catching it would
  // turn "sign in again" into a save-failure notice.
  const bearer = await requireConsoleBearer();

  const key = String(formData.get('key') ?? '').trim();
  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim();
  if (!key) return { ok: false, error: 'No subagent was named.' };
  if (!systemPrompt) return { ok: false, error: 'The subagent needs instructions to run with.' };

  try {
    await adminUpdateSubagentPrompt(bearer, key, systemPrompt);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ApiError ? err.message : 'Could not save the prompt.',
    };
  }

  revalidatePath('/admin/subagent');
  return { ok: true };
}
