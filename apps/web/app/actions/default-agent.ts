'use server';

import { revalidatePath } from 'next/cache';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, adminUpdatePlatformAgent } from '@/lib/api';

export type DefaultAgentSaveResult = { ok: true } | { ok: false; error: string };

/**
 * An emptied wording box is not "answer with nothing" — it is "use the reviewed wording in code", the
 * same rule the merchant playground applies, so clearing a box means the same thing in either place.
 */
function written(raw: FormDataEntryValue | null): string | null {
  const text = String(raw ?? '').trim();
  return text ? text : null;
}

/**
 * The operator's edit of the agent every store answers with. Console bearer only — this used to fall
 * through to the reader's account token in the plans console, and any signed-in merchant could have
 * rewritten every bot on the platform with it.
 */
export async function updateDefaultAgentAction(formData: FormData): Promise<DefaultAgentSaveResult> {
  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim();
  if (!systemPrompt) return { ok: false, error: 'The default agent needs a system prompt.' };

  try {
    await adminUpdatePlatformAgent(await requireConsoleBearer(), {
      systemPrompt,
      replyGuidance: written(formData.get('replyGuidance')),
      commentReplyGuidance: written(formData.get('commentReplyGuidance')),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ApiError ? err.message : 'Could not save the default agent.',
    };
  }

  revalidatePath('/admin/default-agent');
  return { ok: true };
}
